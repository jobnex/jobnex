#![cfg_attr(feature = "local-test", allow(dead_code))]
use crate::{revision, ApiError, ApiResult, Saved};
#[cfg(not(feature = "local-test"))]
use postgres::{Config, GenericClient};
#[cfg(not(feature = "local-test"))]
use postgres_native_tls::MakeTlsConnector;
#[cfg(not(feature = "local-test"))]
use r2d2_postgres::PostgresConnectionManager;
#[cfg(not(feature = "local-test"))]
use s3::{creds::Credentials, Bucket, Region};
use std::env;
#[cfg(not(feature = "local-test"))]
use std::time::Duration;
use uuid::Uuid;

#[cfg(not(feature = "local-test"))]
type Pool = r2d2::Pool<PostgresConnectionManager<MakeTlsConnector>>;
#[path = "certified_store.rs"]
mod certified_store;
#[cfg(not(feature = "local-test"))]
pub struct Store {
    pool: Pool,
    bucket: Box<Bucket>,
}

#[cfg(not(feature = "local-test"))]
impl Store {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let mut config: Config = env::var("DATABASE_URL")?.parse()?;
        if config.get_ssl_mode() == postgres::config::SslMode::Disable {
            return Err("DATABASE_URL must require TLS".into());
        }
        config.ssl_mode(postgres::config::SslMode::Require);
        config.connect_timeout(Duration::from_secs(10));
        let tls = MakeTlsConnector::new(native_tls::TlsConnector::new()?);
        let pool = r2d2::Pool::builder()
            .max_size(4)
            .min_idle(Some(0))
            .connection_timeout(Duration::from_secs(10))
            .build(PostgresConnectionManager::new(config, tls))?;
        // Validate connectivity at startup, without depending on PgBouncer startup options.
        pool.get()?.simple_query("SELECT 1")?;
        let endpoint = env::var("R2_ENDPOINT")?;
        if !endpoint.starts_with("https://") || !endpoint.ends_with(".r2.cloudflarestorage.com") {
            return Err("R2_ENDPOINT must be the HTTPS account S3 endpoint".into());
        }
        let credentials = Credentials::new(
            Some(&env::var("R2_ACCESS_KEY_ID")?),
            Some(&env::var("R2_SECRET_ACCESS_KEY")?),
            None,
            None,
            None,
        )?;
        let mut bucket = Bucket::new(
            &env::var("R2_BUCKET")?,
            Region::Custom {
                region: "auto".into(),
                endpoint,
            },
            credentials,
        )?
        .with_path_style();
        bucket.set_request_timeout(Some(Duration::from_secs(20)));
        Ok(Self { pool, bucket })
    }

    fn access(client: &mut impl GenericClient, user: Uuid, job: Uuid) -> ApiResult<()> {
        // Preserve export-before-application for an owned, publishable draft.
        let row = client
            .query_opt(
                "SELECT 1 FROM neon_auth.\"user\" u WHERE u.id=$1 AND (
            EXISTS (SELECT 1 FROM public.applications a WHERE a.user_id::text=$2 AND a.job_id=$3)
            OR EXISTS (SELECT 1 FROM public.resume_generations g WHERE g.user_id=$2 AND g.job_id=$3
                AND public.resume_generation_is_publishable(g.id,g.user_id)))",
                &[&user, &user.to_string(), &job],
            )
            .map_err(db_error)?;
        if row.is_none() {
            return Err(ApiError::new(404, "Resume access not found"));
        }
        Ok(())
    }

    fn read(client: &mut impl GenericClient, user: Uuid, job: Uuid) -> ApiResult<Option<Saved>> {
        Ok(client.query_opt("SELECT markdown,template_id,theme,status,r2_object_key FROM public.user_job_resumes WHERE user_id=$1 AND job_id=$2 AND public.resume_saved_markdown_is_publishable(user_id::text,job_id,markdown)",
            &[&user,&job]).map_err(db_error)?.map(|row| Saved {
                markdown: row.get(0), template_id: row.get(1), theme: row.get::<_,i32>(2) as u64,
                status: row.get(3), r2_object_key: row.get(4),
            }))
    }

    fn check_markdown(
        client: &mut impl GenericClient,
        user: Uuid,
        job: Uuid,
        markdown: &str,
    ) -> ApiResult<()> {
        let allowed: bool = client
            .query_one(
                "SELECT public.resume_saved_markdown_is_publishable($1,$2,$3)",
                &[&user.to_string(), &job, &markdown],
            )
            .map_err(db_error)?
            .get(0);
        if !allowed {
            return Err(ApiError::new(
                409,
                "Resume failed source verification; regenerate before export",
            ));
        }
        Ok(())
    }

    pub fn require_publishable(&self, user: Uuid, job: Uuid, markdown: &str) -> ApiResult<()> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        let mut tx = Self::transaction(&mut client)?;
        Self::access(&mut tx, user, job)?;
        Self::check_markdown(&mut tx, user, job, markdown)?;
        tx.commit().map_err(db_error)?;
        Ok(())
    }

    pub fn load(&self, user: Uuid, job: Uuid) -> ApiResult<Option<Saved>> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        let mut tx = Self::transaction(&mut client)?;
        Self::access(&mut tx, user, job)?;
        let result = Self::read(&mut tx, user, job)?;
        tx.commit().map_err(db_error)?;
        Ok(result)
    }

    pub fn generated(&self, user: Uuid, job: Uuid) -> ApiResult<Option<serde_json::Value>> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        let mut tx = Self::transaction(&mut client)?;
        Self::access(&mut tx, user, job)?;
        let result=tx.query_opt("SELECT id,version,resume_markdown FROM public.resume_generations WHERE user_id=$1 AND job_id=$2 AND public.resume_generation_is_publishable(id,user_id) ORDER BY version DESC LIMIT 1", &[&user.to_string(),&job]).map_err(db_error)?.map(|row|serde_json::json!({"generation_id":row.get::<_,Uuid>(0),"version":row.get::<_,i32>(1),"markdown":row.get::<_,String>(2)}));
        tx.commit().map_err(db_error)?;
        Ok(result)
    }

    fn transaction(client: &mut postgres::Client) -> ApiResult<postgres::Transaction<'_>> {
        let mut tx = client.transaction().map_err(db_error)?;
        tx.batch_execute("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='20s'").map_err(db_error)?;
        Ok(tx)
    }

    pub fn save(
        &self,
        user: Uuid,
        job: Uuid,
        saved: &Saved,
        expected: &str,
        size: Option<i32>,
    ) -> ApiResult<()> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        let mut tx = Self::transaction(&mut client)?;
        Self::access(&mut tx, user, job)?;
        tx.query_one(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            &[&format!("{user}:{job}")],
        )
        .map_err(db_error)?;
        Self::check_markdown(&mut tx, user, job, &saved.markdown)?;
        let current = Self::read(&mut tx, user, job)?;
        // Retrying an already committed immutable export must not overwrite a newer edit.
        if saved.status == "ready"
            && current
                .as_ref()
                .is_some_and(|row| revision(row) == revision(saved))
        {
            return Ok(());
        }
        if current
            .as_ref()
            .map(revision)
            .unwrap_or_else(|| "absent".into())
            != expected
        {
            return Err(ApiError::new(409, "Resume changed; reload before saving"));
        }
        tx.execute("INSERT INTO public.user_job_resumes(user_id,job_id,markdown,template_id,theme,status,r2_object_key,file_size,exported_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $6='ready' THEN now() ELSE NULL END) ON CONFLICT(user_id,job_id) DO UPDATE SET markdown=EXCLUDED.markdown,template_id=EXCLUDED.template_id,theme=EXCLUDED.theme,status=EXCLUDED.status,r2_object_key=EXCLUDED.r2_object_key,file_size=EXCLUDED.file_size,exported_at=EXCLUDED.exported_at,updated_at=now()",
            &[&user,&job,&saved.markdown,&saved.template_id,&(saved.theme as i32),&saved.status,&saved.r2_object_key,&size]).map_err(db_error)?;
        tx.commit().map_err(db_error)?;
        Ok(())
    }

    pub fn put(&self, key: &str, body: &[u8], mime: &str) -> ApiResult<()> {
        let response = self
            .bucket
            .put_object_with_content_type(key, body, mime)
            .map_err(|_| ApiError::unavailable())?;
        if !(200..300).contains(&response.status_code()) {
            return Err(ApiError::unavailable());
        }
        Ok(())
    }
    pub fn get(&self, key: &str) -> ApiResult<Vec<u8>> {
        let response = self
            .bucket
            .get_object(key)
            .map_err(|_| ApiError::unavailable())?;
        match response.status_code() {
            200 => Ok(response.to_vec()),
            404 => Err(ApiError::new(404, "Preview not found")),
            _ => Err(ApiError::unavailable()),
        }
    }
    pub fn verify(&self) -> ApiResult<serde_json::Value> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        // Read-only schema/identity probe; does not create or edit a user's resume.
        let mut tx = Self::transaction(&mut client)
            .map_err(|_| ApiError::new(503, "Storage check: transaction timeout setup failed"))?;
        let pair=tx.query_opt("SELECT u.id,a.job_id FROM public.applications a JOIN neon_auth.\"user\" u ON a.user_id::text=u.id::text LIMIT 1",&[]).map_err(|_|ApiError::new(503,"Storage check: identity/application query failed"))?;
        tx.query("SELECT markdown,template_id,theme,status,r2_object_key,file_size,exported_at FROM public.user_job_resumes LIMIT 0",&[]).map_err(|_|ApiError::new(503,"Storage check: user_job_resumes schema mismatch"))?;
        tx.query("SELECT id,user_id,job_id,version,resume_markdown,status FROM public.resume_generations LIMIT 0",&[]).map_err(|_|ApiError::new(503,"Storage check: resume_generations schema mismatch"))?;
        tx.commit().map_err(db_error)?;
        let key = format!("_backend_checks/{}.txt", Uuid::new_v4());
        let payload = b"resume backend storage verification";
        self.put(&key, payload, "text/plain")
            .map_err(|_| ApiError::new(503, "Storage check: R2 upload failed"))?;
        let result = self
            .get(&key)
            .map_err(|_| ApiError::new(503, "Storage check: R2 download failed"));
        let deletion = self
            .bucket
            // POST with a body avoids rust-s3 0.37's empty DELETE signing bug on R2.
            .delete_objects(vec![s3::serde_types::ObjectIdentifier::new(&key)])
            .map_err(|_| ApiError::new(503, "Storage check: R2 deletion failed"))?;
        if !deletion.errors.is_empty() || !deletion.deleted.iter().any(|object| object.key == key) {
            return Err(ApiError::new(
                503,
                "Storage check: R2 deletion returned failure",
            ));
        }
        if result?.as_slice() != payload {
            return Err(ApiError::new(502, "R2 round-trip mismatch"));
        }
        Ok(
            serde_json::json!({"storage_verified":true,"test_pair":pair.map(|row|serde_json::json!({"user_id":row.get::<_,Uuid>(0),"job_id":row.get::<_,Uuid>(1)}))}),
        )
    }
}
#[cfg(not(feature = "local-test"))]
fn db_error(_: postgres::Error) -> ApiError {
    ApiError::unavailable()
}

#[cfg(feature = "local-test")]
pub mod local {
    use super::*;
    use std::{fs, path::PathBuf};
    pub struct Store {
        pub(super) root: PathBuf,
    }
    impl Store {
        pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
            let root = PathBuf::from(env::var("TEST_STORE_ROOT")?);
            fs::create_dir_all(&root)?;
            Ok(Self { root })
        }
        pub(super) fn access(&self, user: Uuid, job: Uuid) -> ApiResult<()> {
            if !self.root.join(format!("allow-{user}-{job}")).exists() {
                return Err(ApiError::new(404, "Application not found"));
            }
            Ok(())
        }
        pub fn load(&self, user: Uuid, job: Uuid) -> ApiResult<Option<Saved>> {
            self.access(user, job)?;
            let file = self.root.join(format!("saved-{user}-{job}.json"));
            if !file.exists() {
                return Ok(None);
            }
            let saved: Saved =
                serde_json::from_slice(&fs::read(file).map_err(|_| ApiError::unavailable())?)
                    .map_err(|_| ApiError::unavailable())?;
            if self
                .require_publishable(user, job, &saved.markdown)
                .is_err()
            {
                return Ok(None);
            }
            Ok(Some(saved))
        }
        pub fn generated(&self, user: Uuid, job: Uuid) -> ApiResult<Option<serde_json::Value>> {
            self.access(user, job)?;
            Ok(None)
        }
        pub fn require_publishable(&self, user: Uuid, job: Uuid, markdown: &str) -> ApiResult<()> {
            self.access(user, job)?;
            if self
                .root
                .join(format!(
                    "blocked-{user}-{job}-{}",
                    crate::hash(markdown.as_bytes())
                ))
                .exists()
            {
                return Err(ApiError::new(
                    409,
                    "Resume failed source verification; regenerate before export",
                ));
            }
            Ok(())
        }
        pub fn save(
            &self,
            user: Uuid,
            job: Uuid,
            saved: &Saved,
            expected: &str,
            _: Option<i32>,
        ) -> ApiResult<()> {
            self.access(user, job)?;
            self.require_publishable(user, job, &saved.markdown)?;
            let lock = self.root.join(format!("lock-{user}-{job}"));
            let guard = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&lock)
                .map_err(|_| ApiError::new(429, "Busy; retry"))?;
            let result = (|| {
                let current = self.load(user, job)?;
                if saved.status == "ready"
                    && current
                        .as_ref()
                        .is_some_and(|row| revision(row) == revision(saved))
                {
                    return Ok(());
                }
                if current
                    .as_ref()
                    .map(revision)
                    .unwrap_or_else(|| "absent".into())
                    != expected
                {
                    return Err(ApiError::new(409, "Resume changed; reload before saving"));
                }
                fs::write(
                    self.root.join(format!("saved-{user}-{job}.json")),
                    serde_json::to_vec(saved).unwrap(),
                )
                .map_err(|_| ApiError::unavailable())
            })();
            drop(guard);
            let _ = fs::remove_file(lock);
            result
        }
        pub fn put(&self, key: &str, body: &[u8], _: &str) -> ApiResult<()> {
            let path = self.root.join(key);
            fs::create_dir_all(path.parent().unwrap()).map_err(|_| ApiError::unavailable())?;
            fs::write(path, body).map_err(|_| ApiError::unavailable())
        }
        pub fn get(&self, key: &str) -> ApiResult<Vec<u8>> {
            fs::read(self.root.join(key)).map_err(|_| ApiError::new(404, "Preview not found"))
        }
        pub fn verify(&self) -> ApiResult<serde_json::Value> {
            Ok(serde_json::json!({"storage_verified":false,"test_adapter":true}))
        }
    }
}
