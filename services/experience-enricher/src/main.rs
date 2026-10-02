use experience_enricher::{Extractor, VERSION};
use postgres::{Client, NoTls};
use postgres_native_tls::MakeTlsConnector;
use serde_json::json;
use std::{
    env,
    io::{self, BufRead},
    time::{Duration, Instant},
};

fn bounded(name: &str, default: usize, max: usize) -> Result<usize, String> {
    match env::var(name) {
        Ok(value) => value
            .parse::<usize>()
            .ok()
            .filter(|n| *n > 0 && *n <= max)
            .ok_or_else(|| format!("invalid {name}")),
        Err(_) => Ok(default),
    }
}

fn connect() -> Result<Client, Box<dyn std::error::Error>> {
    let url = env::var("DATABASE_URL")?;
    let mut config: postgres::Config = url.parse()?;
    config.connect_timeout(Duration::from_secs(20));
    config.application_name("experience-enricher");
    // TLS is mandatory in production. This opt-in exists only for local test databases.
    if env::var("ALLOW_LOCAL_PLAINTEXT").as_deref() == Ok("1") {
        if config.get_hosts().iter().any(|h| {
            !matches!(h,
            postgres::config::Host::Tcp(host) if host == "localhost" || host == "127.0.0.1")
        }) {
            return Err("plaintext permitted only on localhost".into());
        }
        config.ssl_mode(postgres::config::SslMode::Disable);
        Ok(config.connect(NoTls)?)
    } else {
        config.ssl_mode(postgres::config::SslMode::Require);
        Ok(config.connect(MakeTlsConnector::new(native_tls::TlsConnector::new()?))?)
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args().skip(1).collect();
    let parser = Extractor::default();
    if args.as_slice() == ["--stdin"] {
        for line in io::stdin().lock().lines() {
            let value: serde_json::Value = serde_json::from_str(&line?)?;
            let result = parser.extract(
                value["description"]
                    .as_str()
                    .ok_or("description required")?,
            );
            println!("{}", json!({"id":value["id"],"result":result}));
        }
        return Ok(());
    }
    if args.iter().any(|a| a != "--migrate" && a != "--dry-run") {
        return Err("supported options: --migrate, --dry-run, --stdin".into());
    }
    let dry_run = args.iter().any(|a| a == "--dry-run");
    if dry_run && args.iter().any(|a| a == "--migrate") {
        return Err("dry-run cannot migrate".into());
    }
    let batch_size = bounded("BATCH_SIZE", 250, 1000)? as i64;
    let budget = Duration::from_secs(bounded("MAX_RUN_SECONDS", 1200, 3600)? as u64);
    let mut client = connect()?;
    client.batch_execute("SET statement_timeout='60s'; SET lock_timeout='5s'")?;
    if args.iter().any(|a| a == "--migrate") {
        let mut tx = client.transaction()?;
        tx.batch_execute(include_str!("../db/migration.sql"))?;
        tx.commit()?;
    }
    let start = Instant::now();
    let mut processed = 0usize;
    let mut updated = 0usize;
    let mut known = 0usize;
    if dry_run {
        for row in client.query(
            "SELECT job_description FROM public.jobs WHERE status='published' ORDER BY id LIMIT $1",
            &[&batch_size],
        )? {
            let text: Option<String> = row.get(0);
            processed += 1;
            known += usize::from(
                parser
                    .extract(text.as_deref().unwrap_or(""))
                    .years
                    .is_some(),
            );
        }
    } else {
        // One metadata scan per run upgrades old parser results; batches use the partial index.
        client.execute("UPDATE public.job_experience_processing SET pending=true WHERE NOT pending AND parser_version IS DISTINCT FROM $1", &[&VERSION])?;
        while start.elapsed() < budget {
            let mut tx = client.transaction()?;
            let rows = tx.query("SELECT j.id,j.job_description,j.experience_required,q.extracted_years,q.owns_value,md5(coalesce(j.job_description,'')) FROM public.job_experience_processing q JOIN public.jobs j ON j.id=q.job_id WHERE j.status='published' AND q.pending ORDER BY q.job_id LIMIT $1 FOR UPDATE OF q,j SKIP LOCKED", &[&batch_size])?;
            if rows.is_empty() {
                tx.commit()?;
                break;
            }
            let mut states = vec![];
            for row in rows {
                let id: uuid::Uuid = row.get(0);
                let text: Option<String> = row.get(1);
                let current: Option<i32> = row.get(2);
                let previous: Option<i32> = row.get(3);
                let owned: bool = row.get(4);
                let hash: String = row.get(5);
                let result = parser.extract(text.as_deref().unwrap_or(""));
                let may_write = current.is_none() || owned && current == previous;
                if may_write && current != result.years {
                    updated += 1;
                }
                let effective_years = if may_write { result.years } else { current };
                let mut details = serde_json::to_value(&result)?;
                details["status"] = json!(result.reason);
                details["parser_version"] = json!(VERSION);
                details["description_hash"] = json!(hash);
                details["effective_years"] = json!(effective_years);
                details["numeric_source"] = json!(if may_write { "parser" } else { "manual" });
                states.push(json!({"id":id,"hash":hash,"years":result.years,
                    "owned":may_write,"evidence":result.evidence,"reason":result.reason,
                    "effective_years":effective_years,"details":details}));
                processed += 1;
                known += usize::from(result.years.is_some());
            }
            tx.execute("UPDATE public.jobs j SET experience_required=x.effective_years,experience_details=x.details FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,effective_years integer,details jsonb) WHERE j.id=x.id AND (j.experience_required IS DISTINCT FROM x.effective_years OR j.experience_details IS DISTINCT FROM x.details)", &[&json!(states)])?;
            tx.execute("UPDATE public.job_experience_processing q SET pending=false,description_hash=x.hash,extracted_years=x.years,owns_value=x.owned,evidence=x.evidence,reason=x.reason,parser_version=$2,processed_at=now() FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,hash text,years integer,owned boolean,evidence jsonb,reason text) WHERE q.job_id=x.id", &[&json!(states),&VERSION])?;
            tx.commit()?;
            println!(
                "{}",
                json!({"event":"batch_committed","processed":processed,"updated":updated,"known":known})
            );
        }
    }
    let remaining: i64 = if dry_run {
        0
    } else {
        client.query_one("SELECT count(*) FROM public.job_experience_processing q JOIN public.jobs j ON j.id=q.job_id WHERE j.status='published' AND q.pending", &[])?.get(0)
    };
    println!(
        "{}",
        json!({"event":"complete","dry_run":dry_run,"processed":processed,"updated":updated,"known":known,"remaining":remaining,"elapsed_ms":start.elapsed().as_millis()})
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        // Debug errors can embed database URLs or row data. Log only a safe category.
        let category = if error.downcast_ref::<postgres::Error>().is_some() {
            "database_error"
        } else {
            "configuration_or_input_error"
        };
        eprintln!("{}", json!({"event":"failed","category":category}));
        std::process::exit(1);
    }
}
