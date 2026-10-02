mod render;
mod store;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    env,
    io::Read,
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Instant,
};
#[cfg(feature = "local-test")]
use store::local::Store;
#[cfg(not(feature = "local-test"))]
use store::Store;
use subtle::ConstantTimeEq;
use tiny_http::{Header, Method, Request, Response, Server};
use uuid::Uuid;

type ApiResult<T> = Result<T, ApiError>;
struct ApiError {
    status: u16,
    message: &'static str,
}
impl ApiError {
    fn new(status: u16, message: &'static str) -> Self {
        Self { status, message }
    }
    fn unavailable() -> Self {
        Self::new(503, "Storage unavailable; retry")
    }
}
#[derive(Clone, Serialize, Deserialize)]
struct Saved {
    markdown: String,
    template_id: String,
    theme: u64,
    status: String,
    r2_object_key: Option<String>,
}
#[derive(Serialize, Deserialize)]
struct Artifact {
    user: Uuid,
    job: Uuid,
    preview_id: Uuid,
    saved: Saved,
    pdf_sha256: String,
    size: i32,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    markdown: Option<String>,
    template_id: Option<String>,
    theme: Option<u64>,
    expected_revision: Option<String>,
    preview_id: Option<Uuid>,
}
struct App {
    store: Store,
    root: PathBuf,
    secret: [u8; 32],
    compiling: AtomicUsize,
    max_compiles: usize,
}
struct Permit<'a>(&'a AtomicUsize);
impl Drop for Permit<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}
fn permit(counter: &AtomicUsize, max: usize) -> ApiResult<Permit<'_>> {
    counter
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
            if n < max {
                Some(n + 1)
            } else {
                None
            }
        })
        .map(|_| Permit(counter))
        .map_err(|_| ApiError::new(429, "Compiler busy; retry after a short pause"))
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn revision(saved: &Saved) -> String {
    hash(
        &serde_json::to_vec(&(
            &saved.markdown,
            &saved.template_id,
            saved.theme,
            &saved.status,
            &saved.r2_object_key,
        ))
        .unwrap(),
    )
}
fn template(id: &str) -> Option<u64> {
    match id {
        "mit-capd" | "standard-overleaf" => Some(2),
        "modern-ivy" | "contemporary-compact" => Some(3),
        "minimalist-exec" => Some(5),
        "tech-specialist" => Some(6),
        _ => None,
    }
}
fn validate(input: &Input) -> ApiResult<Saved> {
    let md = input
        .markdown
        .as_ref()
        .ok_or(ApiError::new(400, "markdown required"))?;
    if md.trim().is_empty() || md.len() > 200_000 {
        return Err(ApiError::new(
            400,
            "Markdown must contain 1 to 200000 bytes",
        ));
    }
    let id = input.template_id.as_deref().unwrap_or("mit-capd");
    let theme = template(id).ok_or(ApiError::new(400, "Unsupported template"))?;
    if input.theme.is_some_and(|n| n != theme) {
        return Err(ApiError::new(400, "Theme does not match template"));
    }
    Ok(Saved {
        markdown: md.clone(),
        template_id: id.into(),
        theme,
        status: "draft".into(),
        r2_object_key: None,
    })
}
fn key(user: Uuid, job: Uuid, id: Uuid, extension: &str) -> String {
    format!("resumes/{user}/{job}/previews/{id}.{extension}")
}
fn auth(request: &Request, secret: &[u8; 32]) -> ApiResult<Uuid> {
    let bearer = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .and_then(|h| h.value.as_str().strip_prefix("Bearer "))
        .ok_or(ApiError::new(401, "Service authentication required"))?;
    let digest: [u8; 32] = Sha256::digest(bearer.as_bytes()).into();
    if !bool::from(digest.ct_eq(secret)) {
        return Err(ApiError::new(401, "Invalid service credential"));
    }
    let user = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("X-User-Id"))
        .ok_or(ApiError::new(401, "Verified user identity required"))?;
    Uuid::parse_str(user.value.as_str()).map_err(|_| ApiError::new(400, "Invalid user identity"))
}
fn body(request: &mut Request) -> ApiResult<Input> {
    let mut bytes = Vec::new();
    request
        .as_reader()
        .take(256_001)
        .read_to_end(&mut bytes)
        .map_err(|_| ApiError::new(400, "Cannot read body"))?;
    if bytes.len() > 256_000 {
        return Err(ApiError::new(413, "Request exceeds 256 KB"));
    }
    serde_json::from_slice(&bytes).map_err(|_| ApiError::new(400, "Invalid request JSON"))
}
fn artifact(app: &App, user: Uuid, job: Uuid, id: Uuid) -> ApiResult<Artifact> {
    let bytes = app.store.get(&key(user, job, id, "json"))?;
    let record: Artifact = serde_json::from_slice(&bytes).map_err(|_| ApiError::unavailable())?;
    if record.user != user
        || record.job != job
        || record.preview_id != id
        || record.saved.r2_object_key.as_deref() != Some(key(user, job, id, "pdf").as_str())
    {
        return Err(ApiError::new(404, "Preview not found"));
    }
    Ok(record)
}
fn pdf(app: &App, record: &Artifact) -> ApiResult<Vec<u8>> {
    let bytes = app
        .store
        .get(record.saved.r2_object_key.as_deref().unwrap())?;
    if bytes.len() != record.size as usize || hash(&bytes) != record.pdf_sha256 {
        return Err(ApiError::new(502, "Stored PDF integrity check failed"));
    }
    Ok(bytes)
}
fn saved_preview(saved: &Saved, user: Uuid, job: Uuid) -> ApiResult<Uuid> {
    let prefix = format!("resumes/{user}/{job}/previews/");
    let value = saved
        .r2_object_key
        .as_deref()
        .and_then(|s| s.strip_prefix(&prefix))
        .and_then(|s| s.strip_suffix(".pdf"))
        .ok_or(ApiError::new(404, "No saved PDF from this backend"))?;
    Uuid::parse_str(value).map_err(|_| ApiError::new(404, "Invalid saved PDF reference"))
}
fn route(request: &mut Request, app: &App) -> ApiResult<(&'static str, Vec<u8>)> {
    let path = request.url().split('?').next().unwrap_or("/").to_owned();
    if path == "/health" && request.method() == &Method::Get {
        return Ok(("application/json",serde_json::to_vec(&json!({"status":"online","runtime":"rust","pdf_compiler":"typst","backend_only":true})).unwrap()));
    }
    let user = auth(request, &app.secret)?;
    let parts: Vec<_> = path.trim_matches('/').split('/').collect();
    if parts.len() < 5 || parts[..3] != ["api", "v1", "jobs"] {
        return Err(ApiError::new(404, "Unknown API route"));
    }
    let job = Uuid::parse_str(parts[3]).map_err(|_| ApiError::new(400, "Invalid job ID"))?;
    let current = app.store.load(user, job)?;
    let action = parts[4];
    let method = request.method().clone();
    let response = match (action, method) {
        ("resume", Method::Get) if parts.len() == 5 => {
            let url = current
                .as_ref()
                .and_then(|saved| saved_preview(saved, user, job).ok())
                .map(|id| format!("/api/v1/jobs/{job}/pdf/{id}"));
            json!({"resume":current,"revision":current.as_ref().map(revision).unwrap_or_else(||"absent".into()),"pdf_url":url})
        }
        ("generated", Method::Get) if parts.len() == 5 => {
            json!({"generation":app.store.generated(user,job)?})
        }
        ("resume", Method::Put) if parts.len() == 5 => {
            let input = body(request)?;
            let saved = validate(&input)?;
            let expected = input
                .expected_revision
                .as_deref()
                .ok_or(ApiError::new(428, "expected_revision required"))?;
            app.store.save(user, job, &saved, expected, None)?;
            json!({"success":true,"revision":revision(&saved)})
        }
        ("preview", Method::Post) if parts.len() == 5 => {
            let input = body(request)?;
            let saved = if input.markdown.is_some() {
                validate(&input)?
            } else {
                let mut saved = current
                    .clone()
                    .ok_or(ApiError::new(404, "No saved resume; provide markdown"))?;
                if let Some(ref id) = input.template_id {
                    saved.template_id = id.clone();
                    saved.theme = template(id).ok_or(ApiError::new(400, "Unsupported template"))?;
                }
                if input.theme.is_some_and(|n| n != saved.theme) {
                    return Err(ApiError::new(400, "Theme does not match template"));
                }
                saved
            };
            let _permit = permit(&app.compiling, app.max_compiles)?;
            let (bytes, mut result) = render::compile(&app.root, &saved.markdown, saved.theme)
                .map_err(|_| {
                    ApiError::new(422, "PDF compilation failed or exceeded its time limit")
                })?;
            drop(_permit);
            let id = Uuid::new_v4();
            let pdf_key = key(user, job, id, "pdf");
            let record = Artifact {
                user,
                job,
                preview_id: id,
                saved: Saved {
                    r2_object_key: Some(pdf_key.clone()),
                    status: "ready".into(),
                    ..saved
                },
                pdf_sha256: hash(&bytes),
                size: i32::try_from(bytes.len())
                    .map_err(|_| ApiError::new(422, "PDF too large"))?,
            };
            app.store.put(&pdf_key, &bytes, "application/pdf")?;
            app.store.put(
                &key(user, job, id, "json"),
                &serde_json::to_vec(&record).unwrap(),
                "application/json",
            )?;
            result["preview_id"] = json!(id);
            result["pdf_url"] = json!(format!("/api/v1/jobs/{job}/pdf/{id}"));
            result["revision"] = json!(current
                .as_ref()
                .map(revision)
                .unwrap_or_else(|| "absent".into()));
            result["template_id"] = json!(record.saved.template_id);
            result
        }
        ("pdf", Method::Get) if parts.len() == 6 => {
            let id =
                Uuid::parse_str(parts[5]).map_err(|_| ApiError::new(400, "Invalid preview ID"))?;
            let record = artifact(app, user, job, id)?;
            return Ok(("application/pdf", pdf(app, &record)?));
        }
        ("pdf", Method::Get) if parts.len() == 5 => {
            let saved = current
                .as_ref()
                .filter(|s| s.status == "ready")
                .ok_or(ApiError::new(404, "No saved PDF"))?;
            let id = saved_preview(saved, user, job)?;
            return Ok(("application/pdf", pdf(app, &artifact(app, user, job, id)?)?));
        }
        ("export", Method::Post) if parts.len() == 5 => {
            let input = body(request)?;
            if input.markdown.is_some() || input.theme.is_some() || input.template_id.is_some() {
                return Err(ApiError::new(
                    400,
                    "Export accepts an existing preview_id and expected_revision only",
                ));
            }
            let id = input
                .preview_id
                .ok_or(ApiError::new(400, "preview_id required"))?;
            let expected = input
                .expected_revision
                .as_deref()
                .ok_or(ApiError::new(428, "expected_revision required"))?;
            let record = artifact(app, user, job, id)?;
            pdf(app, &record)?;
            app.store
                .save(user, job, &record.saved, expected, Some(record.size))?;
            json!({"success":true,"preview_id":id,"pdf_sha256":record.pdf_sha256,"revision":revision(&record.saved),"pdf_url":format!("/api/v1/jobs/{job}/pdf/{id}")})
        }
        _ => return Err(ApiError::new(405, "Method or API route not supported")),
    };
    Ok(("application/json", serde_json::to_vec(&response).unwrap()))
}
fn handle(mut request: Request, app: &App) {
    let started = Instant::now();
    let id = Uuid::new_v4();
    let (status, mime, bytes) = match route(&mut request, app) {
        Ok((mime, bytes)) => (200, mime, bytes),
        Err(e) => (
            e.status,
            "application/json",
            serde_json::to_vec(&json!({"error":e.message,"request_id":id})).unwrap(),
        ),
    };
    let mut response = Response::from_data(bytes)
        .with_status_code(status)
        .with_header(Header::from_bytes("Content-Type", mime).unwrap())
        .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap())
        .with_header(Header::from_bytes("X-Content-Type-Options", "nosniff").unwrap())
        .with_header(Header::from_bytes("X-Request-Id", id.to_string()).unwrap());
    if mime == "application/pdf" {
        response = response.with_header(
            Header::from_bytes("Content-Disposition", "attachment; filename=\"resume.pdf\"")
                .unwrap(),
        );
    }
    if status == 429 || status == 503 {
        response = response.with_header(Header::from_bytes("Retry-After", "2").unwrap());
    }
    let _ = request.respond(response);
    // Log request IDs/status only: never credentials, Markdown or signed URLs.
    println!(
        "{}",
        json!({"request_id":id,"status":status,"duration_ms":started.elapsed().as_millis()})
    );
}
fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if env::args().any(|a| a == "--check-storage") {
        let result = Store::new()?
            .verify()
            .map_err(|e| e.message)?;
        println!("{}", result);
        return Ok(());
    }
    let secret = env::var("BACKEND_SERVICE_TOKEN")?;
    if secret.len() < 32 {
        return Err("BACKEND_SERVICE_TOKEN must contain at least 32 characters".into());
    }
    let root = PathBuf::from(env::var("APP_ROOT").unwrap_or_else(|_| ".".into())).canonicalize()?;
    if !root.join("resume.typ").is_file() {
        return Err("Missing resume.typ".into());
    }
    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse::<u16>()?;
    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let max_compiles = env::var("MAX_COMPILATIONS")
        .unwrap_or_else(|_| "2".into())
        .parse::<usize>()?;
    if !(1..=4).contains(&max_compiles) {
        return Err("MAX_COMPILATIONS must be between 1 and 4".into());
    }
    let app = Arc::new(App {
        store: Store::new()?,
        root,
        secret: Sha256::digest(secret.as_bytes()).into(),
        compiling: AtomicUsize::new(0),
        max_compiles,
    });
    let server = Arc::new(Server::http(format!("{host}:{port}"))?);
    println!(
        "{}",
        json!({"event":"started","runtime":"rust","port":port,"max_compilations":max_compiles})
    );
    // Fixed workers bound request processing; Cloud Run ingress concurrency is 8.
    let mut workers = Vec::new();
    for _ in 0..8 {
        let server = server.clone();
        let app = app.clone();
        workers.push(std::thread::spawn(move || {
            for request in server.incoming_requests() {
                handle(request, &app);
            }
        }));
    }
    for worker in workers {
        let _ = worker.join();
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validation_and_revision() {
        let input: Input = serde_json::from_value(
            json!({"markdown":"# Name","template_id":"modern-ivy","theme":3}),
        )
        .unwrap();
        let saved = validate(&input).unwrap_or_else(|_| panic!("valid input rejected"));
        let mut changed = saved.clone();
        changed.theme = 2;
        assert_ne!(revision(&saved), revision(&changed));
        for value in [
            json!({"markdown":" "}),
            json!({"markdown":"# Name","template_id":"other"}),
            json!({"markdown":"# Name","theme":6}),
        ] {
            assert!(validate(&serde_json::from_value(value).unwrap()).is_err());
        }
        assert!(serde_json::from_value::<Input>(
            json!({"markdown":"hi","uploadUrl":"https://evil"})
        )
        .is_err());
    }
    #[test]
    fn limits_and_keys() {
        let n = AtomicUsize::new(0);
        let held = permit(&n, 1).unwrap_or_else(|_| panic!());
        assert!(permit(&n, 1).is_err());
        drop(held);
        assert!(permit(&n, 1).is_ok());
        let job = Uuid::new_v4();
        let id = Uuid::new_v4();
        assert_ne!(
            key(Uuid::new_v4(), job, id, "pdf"),
            key(Uuid::new_v4(), job, id, "pdf")
        );
    }
}
