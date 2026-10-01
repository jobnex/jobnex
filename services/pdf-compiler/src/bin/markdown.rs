use serde_json::Value;
use std::fs;
use regex::Regex;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input_filepath = "resume.json";
    let output_filename = "compiled_ats_resume";

    println!("Compiling Markdown resume...");

    let raw_payload = fs::read_to_string(input_filepath)?;
    let pattern = format!(r"\[{}: \d+\]", "cite");
    let re = Regex::new(&pattern).unwrap();
    let clean_payload = re.replace_all(&raw_payload, "").to_string();
    let data: Value = serde_json::from_str(&clean_payload)?;

    let mut md = String::new();

    // Header
    if let Some(pi) = data.get("personal_information") {
        md.push_str(&format!("# {}\n", pi.get("name").and_then(|v| v.as_str()).unwrap_or("")));
        md.push_str(&format!("**{}**\n\n", pi.get("title").and_then(|v| v.as_str()).unwrap_or("")));

        let mut contacts = Vec::new();
        if let Some(email) = pi.get("email").and_then(|v| v.as_str()) { contacts.push(email.to_string()); }
        if let Some(mobile) = pi.get("mobile").and_then(|v| v.as_str()) { contacts.push(mobile.to_string()); }
        if let Some(linkedin) = pi.get("linkedin").and_then(|v| v.as_str()) { contacts.push(linkedin.to_string()); }

        md.push_str(&format!("{}\n\n", contacts.join(" | ")));
    }

    // Professional Summary
    if let Some(summary) = data.get("professional_summary").and_then(|v| v.as_array()) {
        md.push_str("## Professional Summary\n\n");
        for item in summary {
            if let Some(s) = item.as_str() {
                md.push_str(&format!("- {}\n", s));
            }
        }
        md.push_str("\n");
    }

    // Education
    if let Some(education) = data.get("education").and_then(|v| v.as_array()) {
        md.push_str("## Education\n\n");
        for edu in education {
            let inst = edu.get("institution").and_then(|v| v.as_str()).unwrap_or("");
            let deg = edu.get("degree").and_then(|v| v.as_str()).unwrap_or("");
            let dur = edu.get("duration").and_then(|v| v.as_str()).unwrap_or("");

            md.push_str(&format!("**{}**", inst));
            if !dur.is_empty() {
                md.push_str(&format!(" | {}", dur));
            }
            md.push_str("\n");
            md.push_str(&format!("*{}*\n\n", deg));
        }
    }

    // Professional Experience
    if let Some(exp) = data.get("professional_experience").and_then(|v| v.as_array()) {
        md.push_str("## Professional Experience\n\n");
        for job in exp {
            let role = job.get("role").and_then(|v| v.as_str()).unwrap_or("");
            let comp = job.get("company").and_then(|v| v.as_str()).unwrap_or("");
            let dur = job.get("duration").and_then(|v| v.as_str()).unwrap_or("");
            let loc = job.get("location").and_then(|v| v.as_str()).unwrap_or("");

            md.push_str(&format!("### **{}**\n", role));
            md.push_str(&format!("*{}*", comp));
            if !loc.is_empty() {
                md.push_str(&format!(" - {}", loc));
            }
            if !dur.is_empty() {
                md.push_str(&format!(" | {}", dur));
            }
            md.push_str("\n\n");

            if let Some(resps) = job.get("responsibilities").and_then(|v| v.as_array()) {
                for resp in resps {
                    if let Some(r) = resp.as_str() {
                        md.push_str(&format!("- {}\n", r));
                    }
                }
            }
            md.push_str("\n");
        }
    }

    // Technical Projects
    md.push_str("## Technical Projects\n\n");
    md.push_str("### **Agentic Resume Generator** | 2026\n");
    md.push_str("- Designed an 8-agent cache-aware resume generation system leveraging LangGraph to process job descriptions.\n");
    md.push_str("- Integrated SQLite and Neon PostgreSQL for robust state management and customized candidate resume creation.\n\n");

    // Technical Skills
    if let Some(skills_obj) = data.get("technical_skills").and_then(|v| v.as_object()) {
        md.push_str("## Technical Skills\n\n");
        for (category, skills) in skills_obj {
            if let Some(s) = skills.as_str() {
                md.push_str(&format!("- **{}**: {}\n", category, s));
            }
        }
        md.push_str("\n");
    }

    let output_md = format!("{}.md", output_filename);
    fs::write(&output_md, md)?;
    println!("Successfully generated {}", output_md);

    Ok(())
}
