use super::*;
use crate::certified::{
    self, Certification, Version, POLICY_VERSION, RENDERER_VERSION, TEMPLATE_VERSION,
};
use serde_json::Value;

fn stale() -> ApiError {
    ApiError::new(
        409,
        "Document or generation changed; reload before publication",
    )
}
fn json_value(value: String) -> ApiResult<Value> {
    serde_json::from_str(&value).map_err(|_| ApiError::unavailable())
}

#[cfg(not(feature = "local-test"))]
impl Store {
    fn current_document(
        client: &mut impl GenericClient,
        user: Uuid,
        job: Uuid,
        generation: Uuid,
        revision: i32,
    ) -> ApiResult<Version> {
        Self::access(client, user, job)?;
        let row=client.query_opt("SELECT d.source_import_id,d.document_json::text,d.document_hash,d.source_hash,d.audit_json::text FROM public.resume_document_versions d WHERE d.user_id=$1 AND d.job_id=$2 AND d.generation_id=$3 AND d.revision=$4 AND d.generation_id=(SELECT g.id FROM public.resume_generations g WHERE g.user_id=$1 AND g.job_id=$2 ORDER BY g.version DESC,g.created_at DESC,g.id DESC LIMIT 1) AND d.revision=(SELECT max(v.revision) FROM public.resume_document_versions v WHERE v.user_id=$1 AND v.job_id=$2 AND v.generation_id=$3)", &[&user.to_string(),&job,&generation,&revision]).map_err(db_error)?.ok_or_else(stale)?;
        Ok(Version {
            user,
            job,
            generation,
            revision,
            source_import_id: row.get(0),
            document: json_value(row.get(1))?,
            document_hash: row.get(2),
            source_hash: row.get(3),
            audit: json_value(row.get(4))?,
        })
    }
    pub fn document_version(
        &self,
        user: Uuid,
        job: Uuid,
        generation: Uuid,
        revision: i32,
    ) -> ApiResult<Version> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        let mut tx = Self::transaction(&mut client)?;
        let version = Self::current_document(&mut tx, user, job, generation, revision)?;
        tx.commit().map_err(db_error)?;
        Ok(version)
    }
    pub fn stage_certified(&self, key: &str, body: &[u8]) -> ApiResult<()> {
        // R2 is private; a fresh random key and conditional write make these bytes immutable.
        let mut bucket = self.bucket.clone();
        bucket.add_header("If-None-Match", "*");
        let response = bucket
            .put_object_with_content_type(key, body, "application/pdf")
            .map_err(|_| ApiError::unavailable())?;
        if !(200..300).contains(&response.status_code()) {
            return Err(ApiError::unavailable());
        }
        Ok(())
    }
    pub fn publish_certification(&self, record: &Certification) -> ApiResult<()> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        let mut tx = Self::transaction(&mut client)?;
        let v = &record.version;
        tx.query_one(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            &[&format!("{}:{}", v.user, v.job)],
        )
        .map_err(db_error)?;
        let current = Self::current_document(&mut tx, v.user, v.job, v.generation, v.revision)?;
        if current.document_hash != v.document_hash
            || current.source_hash != v.source_hash
            || current.audit != v.audit
        {
            return Err(stale());
        }
        if record.status == "ready"
            && (!certified::version_issues(&current).is_empty()
                || !record.issues.is_empty()
                || record.pdf_sha256.is_none()
                || record.r2_object_key.is_none()
                || record.file_size.is_none())
        {
            return Err(stale());
        }
        let issues = serde_json::to_string(&record.issues).unwrap();
        let map = serde_json::to_string(&record.source_map).unwrap();
        tx.execute("INSERT INTO public.resume_publication_certifications(id,user_id,job_id,generation_id,document_revision,document_hash,source_hash,template_id,template_version,renderer_version,policy_version,pdf_sha256,r2_object_key,file_size,status,issues,source_map) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::text::jsonb,$17::text::jsonb)",&[&record.id,&v.user.to_string(),&v.job,&v.generation,&v.revision,&v.document_hash,&v.source_hash,&record.template_id,&record.template_version,&record.renderer_version,&record.policy_version,&record.pdf_sha256,&record.r2_object_key,&record.file_size,&record.status,&issues,&map]).map_err(db_error)?;
        if record.status == "ready" {
            let allowed: bool = tx
                .query_one(
                    "SELECT public.resume_certification_current($1,$2,$3)",
                    &[&v.user.to_string(), &v.job, &record.id],
                )
                .map_err(db_error)?
                .get(0);
            if !allowed {
                return Err(stale());
            }
        }
        tx.commit().map_err(db_error)?;
        Ok(())
    }
    pub fn certification(&self, user: Uuid, job: Uuid, id: Uuid) -> ApiResult<Certification> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        let mut tx = Self::transaction(&mut client)?;
        Self::access(&mut tx, user, job)?;
        let row=tx.query_opt("SELECT generation_id,document_revision,document_hash,source_hash,template_id,template_version,renderer_version,policy_version,pdf_sha256,r2_object_key,file_size,status,issues::text,source_map::text FROM public.resume_publication_certifications WHERE id=$1 AND user_id=$2 AND job_id=$3",&[&id,&user.to_string(),&job]).map_err(db_error)?.ok_or(ApiError::new(404,"Certification not found"))?;
        let allowed: bool = tx
            .query_one(
                "SELECT public.resume_certification_current($1,$2,$3)",
                &[&user.to_string(), &job, &id],
            )
            .map_err(db_error)?
            .get(0);
        if !allowed {
            return Err(stale());
        }
        let version = Self::current_document(&mut tx, user, job, row.get(0), row.get(1))?;
        if row.get::<_, String>(2) != version.document_hash
            || row.get::<_, String>(3) != version.source_hash
        {
            return Err(stale());
        }
        let record = Certification {
            id,
            version,
            template_id: row.get(4),
            template_version: row.get(5),
            renderer_version: row.get(6),
            policy_version: row.get(7),
            pdf_sha256: row.get(8),
            r2_object_key: row.get(9),
            file_size: row.get(10),
            status: row.get(11),
            issues: serde_json::from_value(json_value(row.get(12))?)
                .map_err(|_| ApiError::unavailable())?,
            source_map: json_value(row.get(13))?,
        };
        tx.commit().map_err(db_error)?;
        Ok(record)
    }
    pub fn publication(&self, v: &Version, template: &str) -> ApiResult<Option<Certification>> {
        let mut client = self.pool.get().map_err(|_| ApiError::unavailable())?;
        let row=client.query_opt("SELECT id,status,issues::text,source_map::text FROM public.resume_publication_certifications WHERE user_id=$1 AND job_id=$2 AND generation_id=$3 AND document_revision=$4 AND document_hash=$5 AND source_hash=$6 AND template_id=$7 AND template_version=$8 AND renderer_version=$9 AND policy_version=$10 AND (status='blocked' OR public.resume_certification_current($1,$2,id)) ORDER BY (status='ready') DESC,created_at DESC,id DESC LIMIT 1",&[&v.user.to_string(),&v.job,&v.generation,&v.revision,&v.document_hash,&v.source_hash,&template,&TEMPLATE_VERSION,&RENDERER_VERSION,&POLICY_VERSION]).map_err(db_error)?;
        drop(client);
        match row {
            Some(row) if row.get::<_, String>(1) == "ready" => {
                Ok(Some(self.certification(v.user, v.job, row.get(0))?))
            }
            Some(row) => Ok(Some(Certification {
                id: row.get(0),
                version: v.clone(),
                template_id: template.into(),
                template_version: TEMPLATE_VERSION.into(),
                renderer_version: RENDERER_VERSION.into(),
                policy_version: POLICY_VERSION.into(),
                pdf_sha256: None,
                r2_object_key: None,
                file_size: None,
                status: "blocked".into(),
                issues: serde_json::from_value(json_value(row.get(2))?)
                    .map_err(|_| ApiError::unavailable())?,
                source_map: json_value(row.get(3))?,
            })),
            None => Ok(None),
        }
    }
}

#[cfg(feature = "local-test")]
impl local::Store {
    pub fn document_version(
        &self,
        user: Uuid,
        job: Uuid,
        generation: Uuid,
        revision: i32,
    ) -> ApiResult<Version> {
        self.access(user, job)?;
        let bytes = std::fs::read(self.root.join(format!("document-{user}-{job}.json")))
            .map_err(|_| ApiError::new(404, "Canonical document not found"))?;
        let v: Version = serde_json::from_slice(&bytes).map_err(|_| ApiError::unavailable())?;
        if v.user != user || v.job != job || v.generation != generation || v.revision != revision {
            return Err(stale());
        }
        Ok(v)
    }
    pub fn stage_certified(&self, key: &str, body: &[u8]) -> ApiResult<()> {
        use std::io::Write;
        let path = self.root.join(key);
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|_| ApiError::unavailable())?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|_| ApiError::unavailable())?;
        file.write_all(body).map_err(|_| ApiError::unavailable())?;
        file.sync_all().map_err(|_| ApiError::unavailable())
    }
    pub fn publish_certification(&self, record: &Certification) -> ApiResult<()> {
        let v = &record.version;
        let lock = self.root.join(format!("lock-{}-{}", v.user, v.job));
        let guard = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock)
            .map_err(|_| ApiError::new(429, "Busy; retry"))?;
        let result = (|| {
            let current = self.document_version(v.user, v.job, v.generation, v.revision)?;
            if current.document_hash != v.document_hash
                || current.source_hash != v.source_hash
                || current.audit != v.audit
            {
                return Err(stale());
            }
            if record.status == "ready"
                && (!certified::version_issues(&current).is_empty() || !record.issues.is_empty())
            {
                return Err(stale());
            }
            let final_path = self.root.join(format!("certification-{}.json", record.id));
            let mut tmp =
                tempfile::NamedTempFile::new_in(&self.root).map_err(|_| ApiError::unavailable())?;
            use std::io::Write;
            tmp.write_all(&serde_json::to_vec(record).unwrap())
                .map_err(|_| ApiError::unavailable())?;
            tmp.persist_noclobber(final_path)
                .map_err(|_| ApiError::unavailable())?;
            Ok(())
        })();
        drop(guard);
        let _ = std::fs::remove_file(lock);
        result
    }
    pub fn certification(&self, user: Uuid, job: Uuid, id: Uuid) -> ApiResult<Certification> {
        self.access(user, job)?;
        let record: Certification = serde_json::from_slice(
            &std::fs::read(self.root.join(format!("certification-{id}.json")))
                .map_err(|_| ApiError::new(404, "Certification not found"))?,
        )
        .map_err(|_| ApiError::unavailable())?;
        let v = &record.version;
        if v.user != user || v.job != job || record.id != id {
            return Err(ApiError::new(404, "Certification not found"));
        }
        let current = self.document_version(user, job, v.generation, v.revision)?;
        if current.document_hash != v.document_hash
            || current.source_hash != v.source_hash
            || current.audit != v.audit
            || record.status != "ready"
            || !certified::version_issues(&current).is_empty()
        {
            return Err(stale());
        }
        Ok(record)
    }
    pub fn publication(&self, v: &Version, template: &str) -> ApiResult<Option<Certification>> {
        let mut records = Vec::new();
        for entry in std::fs::read_dir(&self.root).map_err(|_| ApiError::unavailable())? {
            let entry = entry.map_err(|_| ApiError::unavailable())?;
            if let Some(id) = entry
                .file_name()
                .to_str()
                .and_then(|s| s.strip_prefix("certification-"))
                .and_then(|s| s.strip_suffix(".json"))
                .and_then(|s| Uuid::parse_str(s).ok())
            {
                let record: Certification = serde_json::from_slice(
                    &std::fs::read(entry.path()).map_err(|_| ApiError::unavailable())?,
                )
                .map_err(|_| ApiError::unavailable())?;
                if record.id == id
                    && record.version.user == v.user
                    && record.version.job == v.job
                    && record.version.generation == v.generation
                    && record.version.revision == v.revision
                    && record.version.document_hash == v.document_hash
                    && record.version.source_hash == v.source_hash
                    && record.version.audit == v.audit
                    && record.template_id == template
                    && record.template_version == TEMPLATE_VERSION
                    && record.renderer_version == RENDERER_VERSION
                    && record.policy_version == POLICY_VERSION
                    && (record.status == "blocked" || self.certification(v.user, v.job, id).is_ok())
                {
                    records.push((
                        record,
                        entry.metadata().ok().and_then(|m| m.modified().ok()),
                    ));
                }
            }
        }
        records.sort_by_key(|(c, time)| (c.status == "ready", *time, c.id));
        Ok(records.pop().map(|(c, _)| c))
    }
}
