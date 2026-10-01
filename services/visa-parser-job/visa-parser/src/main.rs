use std::io::{self, BufRead, Write};

use serde::{Deserialize, Serialize};
use visa_parser::{Sponsorship, parse_job_description};

#[derive(Deserialize)]
struct Job {
    id: String,
    title: String,
    #[serde(default)]
    company: String,
    #[serde(default)]
    description_hash: String,
    description: String,
}

#[derive(Serialize)]
struct ResultRow {
    id: String,
    title: String,
    company: String,
    description_hash: String,
    sponsorship: &'static str,
    evidence: Vec<String>,
}

fn main() -> io::Result<()> {
    let stdout = io::stdout();
    let mut output = stdout.lock();
    for line in io::stdin().lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let job: Job = serde_json::from_str(&line).map_err(io::Error::other)?;
        let finding = parse_job_description(&job.description);
        let sponsorship = match finding.status {
            Sponsorship::Available => "available",
            Sponsorship::Unavailable => "unavailable",
            Sponsorship::Conditional => "conditional",
            Sponsorship::Unknown => "unknown",
        };
        serde_json::to_writer(
            &mut output,
            &ResultRow {
                id: job.id,
                title: job.title,
                company: job.company,
                description_hash: job.description_hash,
                sponsorship,
                evidence: finding.evidence,
            },
        )?;
        output.write_all(b"\n")?;
    }
    Ok(())
}
