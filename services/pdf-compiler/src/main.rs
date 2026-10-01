use serde_json::{json, Value};
use std::fs;
use std::process::Command;
use thiserror::Error;
use regex::Regex;

#[derive(Debug, Error)]
pub enum ResumeCompilationError {
    #[error("Failed to parse JSON Resume payload: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("File I/O Error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Typst CLI Execution Error: {0}")]
    CliError(String),
}

/// The available resume templates analyzed from top engineering and executive styles
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumeTheme {
    /// 2. Jake's Resume: Classic single-column ATS tech standard (PDF 2)
    Jakes,
    /// 3. Modern Clean: Minimalist uppercase gray lines with link accents (PDF 3)
    ModernClean,
    /// 5. Classic Executive: Sourabh Bajaj style Ivy League LaTeX format (PDF 5)
    ClassicExecutive,
    /// 6. Minimal Tech: High-contrast black vertical accent bars
    MinimalTech,
}

impl ResumeTheme {
    pub fn display_name(&self) -> &'static str {
        match self {
            ResumeTheme::Jakes => "Jake's Resume (Classic Tech / Overleaf Standard)",
            ResumeTheme::ModernClean => "Modern Clean (Deedy Minimalist with Gray Rules)",
            ResumeTheme::ClassicExecutive => "Classic Executive (Sourabh Bajaj Ivy League LaTeX)",
            ResumeTheme::MinimalTech => "Minimal Tech (Vertical Accent Bars)",
        }
    }
}

fn parse_markdown_to_json(md_text: &str) -> Value {
    let mut data = json!({
        "personal_information": {},
        "professional_summary": [],
        "technical_skills": {},
        "professional_experience": [],
        "education": [],
        "projects": [],
        "section_order": []
    });

    enum Section { Header, Summary, Skills, Experience, Education, Projects }
    let mut section = Section::Header;
    let mut current_job: Option<Value> = None;
    let mut current_project: Option<Value> = None;
    let mut current_edu: Option<Value> = None;

    let email_re = Regex::new(r"[\w.+-]+@[\w-]+\.[\w.-]+").unwrap();
    let phone_re = Regex::new(r"(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}").unwrap();
    let linkedin_re = Regex::new(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w-]+/?").unwrap();
    let github_re = Regex::new(r"(?:https?://)?(?:www\.)?github\.com/[\w-]+/?").unwrap();
    let cite_re = Regex::new(r"\[cite:\s*[^\]]+\]").unwrap();

    for raw_line in md_text.lines() {
        let line_clean = cite_re.replace_all(raw_line, "").to_string();
        let line = line_clean.trim();
        if line.is_empty() || line.starts_with("---") || line.starts_with("===") { continue; }

        // Section heading detection: top-level headers (# or ##) and bold headers
        let is_heading = (line.starts_with('#') && !line.starts_with("###")) || (line.starts_with("**") && line.ends_with("**") && !line.contains('|') && line.len() < 35);
        if is_heading {
            let heading_text = line.trim_start_matches('#').replace('*', "").trim().to_lowercase();
            let mut matched_sec = None;
            if heading_text.contains("summary") || heading_text.contains("profile") || heading_text.contains("objective") || heading_text.contains("about") {
                matched_sec = Some((Section::Summary, "summary"));
            } else if heading_text.contains("skill") || heading_text.contains("technolog") || heading_text.contains("competenc") || heading_text.contains("stack") || heading_text.contains("tool") {
                matched_sec = Some((Section::Skills, "skills"));
            } else if heading_text.contains("experience") || heading_text.contains("work history") || heading_text.contains("employment") || heading_text.contains("career") {
                matched_sec = Some((Section::Experience, "experience"));
            } else if heading_text.contains("education") || heading_text.contains("academic") || heading_text.contains("degree") {
                matched_sec = Some((Section::Education, "education"));
            } else if heading_text.contains("project") || heading_text.contains("portfolio") || heading_text.contains("notable work") {
                matched_sec = Some((Section::Projects, "projects"));
            }

            if let Some((new_sec, sec_name)) = matched_sec {
                if let Some(mut job) = current_job.take() {
                    if job["company"].as_str().unwrap_or("").is_empty() {
                        job["company"] = job["role"].clone();
                    }
                    if job["role"].as_str().unwrap_or("").is_empty() {
                        job["role"] = job["company"].clone();
                    }
                    data["professional_experience"].as_array_mut().unwrap().push(job);
                }
                if let Some(proj) = current_project.take() {
                    data["projects"].as_array_mut().unwrap().push(proj);
                }
                if let Some(edu) = current_edu.take() {
                    data["education"].as_array_mut().unwrap().push(edu);
                }

                section = new_sec;
                let order = data["section_order"].as_array_mut().unwrap();
                let sec_val = json!(sec_name);
                if !order.contains(&sec_val) {
                    order.push(sec_val);
                }
                continue;
            }
        }

        match section {
            Section::Header => {
                // Name extraction from H1 or first prominent bold text
                if line.starts_with("# ") {
                    data["personal_information"]["name"] = json!(line.trim_start_matches('#').trim());
                } else if data["personal_information"]["name"].is_null() && (line.starts_with("**") && line.ends_with("**")) {
                    data["personal_information"]["name"] = json!(line.replace("**", "").trim());
                } else if (line.starts_with("**") && line.ends_with("**")) || (line.starts_with('*') && line.ends_with('*')) {
                    let cleaned = line.replace("**", "").replace("*", "").trim().to_string();
                    if !cleaned.contains('@') && !cleaned.contains("http") && !cleaned.contains('+') {
                        data["personal_information"]["title"] = json!(cleaned);
                    }
                }

                // Universal contact detection (works for pipe-delimited, comma-delimited, or bulleted contacts)
                if let Some(m) = email_re.find(line) {
                    data["personal_information"]["email"] = json!(m.as_str());
                }
                if let Some(m) = linkedin_re.find(line) {
                    data["personal_information"]["linkedin"] = json!(m.as_str());
                }
                if let Some(m) = github_re.find(line) {
                    data["personal_information"]["github"] = json!(m.as_str());
                }
                if data["personal_information"]["mobile"].is_null() {
                    if let Some(m) = phone_re.find(line) {
                        data["personal_information"]["mobile"] = json!(m.as_str().trim());
                    } else if line.to_lowercase().contains("mobile:") || line.to_lowercase().contains("phone:") {
                        let val = line.split(':').skip(1).collect::<Vec<_>>().join(":").replace("**", "").trim().to_string();
                        data["personal_information"]["mobile"] = json!(val);
                    }
                }
                if data["personal_information"]["location"].is_null() {
                    let loc_re = Regex::new(r"(?:^|\|\s*)([A-Za-z\s]+,\s*[A-Z]{2})(?:\s*\||$)").unwrap();
                    if let Some(caps) = loc_re.captures(line) {
                        data["personal_information"]["location"] = json!(caps[1].trim());
                    } else if line.to_lowercase().contains("location:") {
                        let val = line.split(':').skip(1).collect::<Vec<_>>().join(":").replace("**", "").trim().to_string();
                        data["personal_information"]["location"] = json!(val);
                    }
                }
            }
            Section::Summary => {
                let clean_line = line.trim_start_matches(|c| c == '*' || c == '-' || c == '+' || c == '•' || c == ' ').trim();
                if !clean_line.is_empty() {
                    data["professional_summary"].as_array_mut().unwrap().push(json!(clean_line));
                }
            }
            Section::Skills => {
                let text = line.trim_start_matches(|c| c == '*' || c == '-' || c == '+' || c == '•' || c == ' ').trim();
                if text.contains(':') {
                    // Handles "**Category:** Skills" AND "**Category**: Skills" AND "Category: Skills"
                    let parts: Vec<&str> = text.splitn(2, ':').collect();
                    let cat = parts[0].replace("**", "").replace("*", "").trim().to_string();
                    let skills = parts[1].replace("**", "").replace("*", "").trim().to_string();
                    data["technical_skills"][cat] = json!(skills);
                } else if text.contains(" - ") {
                    let parts: Vec<&str> = text.splitn(2, " - ").collect();
                    let cat = parts[0].replace("**", "").replace("*", "").trim().to_string();
                    let skills = parts[1].trim().to_string();
                    data["technical_skills"][cat] = json!(skills);
                } else if !text.is_empty() {
                    data["technical_skills"]["Other Proficiencies"] = json!(text);
                }
            }
            Section::Experience => {
                let clean_line = line.replace(['\u{2013}', '\u{2014}'], "-");
                let is_header = clean_line.starts_with("###") || clean_line.starts_with("##");
                let is_bold_line = clean_line.starts_with("**") && !clean_line.starts_with("* ");

                // Detect subtitle line (e.g. "**Role** *(Date)*" or "**Role** | Date")
                // belonging to the current job that was initiated by a "### Company | Location" line
                let is_job_subtitle = is_bold_line && current_job.as_ref().map_or(false, |job| {
                    job["responsibilities"].as_array().map_or(0, |a| a.len()) == 0
                        && (job["role"].as_str().unwrap_or("").is_empty()
                            || job["role"] == job["company"])
                });

                if is_job_subtitle {
                    if let Some(ref mut job) = current_job {
                        if let (Some(sp), Some(ep)) = (clean_line.find('('), clean_line.rfind(')')) {
                            if ep > sp {
                                let dur_part = clean_line[sp + 1..ep].replace('*', "").trim().to_string();
                                let role_part = clean_line[..sp].replace('*', "").trim().to_string();
                                if !role_part.is_empty() {
                                    job["role"] = json!(role_part);
                                }
                                if !dur_part.is_empty() {
                                    job["duration"] = json!(dur_part);
                                }
                            }
                        } else if clean_line.contains('|') {
                            let parts: Vec<String> = clean_line.split('|').map(|s| s.replace('*', "").trim().to_string()).collect();
                            if !parts[0].is_empty() {
                                job["role"] = json!(parts[0]);
                            }
                            if parts.len() > 1 && !parts[1].is_empty() {
                                job["duration"] = json!(parts[1]);
                            }
                        } else {
                            let role_part = clean_line.replace('*', "").trim().to_string();
                            if !role_part.is_empty() {
                                job["role"] = json!(role_part);
                            }
                        }
                    }
                    continue;
                }

                if is_header || is_bold_line {
                    if let Some(mut job) = current_job.take() {
                        if job["company"].as_str().unwrap_or("").is_empty() {
                            job["company"] = job["role"].clone();
                        }
                        if job["role"].as_str().unwrap_or("").is_empty() {
                            job["role"] = job["company"].clone();
                        }
                        data["professional_experience"].as_array_mut().unwrap().push(job);
                    }

                    let clean = clean_line.trim_start_matches('#').replace("**", "").trim().to_string();
                    let mut role = "".to_string();
                    let mut comp = "".to_string();
                    let mut dur = "".to_string();
                    let mut loc = "".to_string();

                    if clean.contains('|') {
                        let parts: Vec<&str> = clean.split('|').map(|s| s.trim()).collect();
                        if parts.len() == 2 {
                            let p0 = parts[0].to_string();
                            let p1 = parts[1].to_string();
                            let is_dur = p1.contains("Present") || p1.contains("present")
                                || p1.contains("Current") || p1.contains("current")
                                || p1.chars().any(|c| c.is_ascii_digit());
                            if is_dur {
                                role = p0;
                                dur = p1;
                            } else {
                                comp = p0;
                                loc = p1;
                            }
                        } else if parts.len() == 3 {
                            let p0 = parts[0].to_string();
                            let p1 = parts[1].to_string();
                            let p2 = parts[2].to_string();
                            dur = p2;
                            let is_p1_loc = p1.contains(',') && p1.chars().any(|c| c.is_ascii_uppercase());
                            if is_p1_loc {
                                role = p0;
                                loc = p1;
                            } else {
                                role = p0;
                                comp = p1;
                            }
                        } else if parts.len() >= 4 {
                            role = parts[0].to_string();
                            comp = parts[1].to_string();
                            loc = parts[2].to_string();
                            dur = parts[3].to_string();
                        }
                    } else {
                        comp = clean;
                    }

                    current_job = Some(json!({
                        "company": comp,
                        "role": role,
                        "location": loc,
                        "duration": dur,
                        "responsibilities": []
                    }));
                } else if clean_line.starts_with('*') || clean_line.starts_with('-') || clean_line.starts_with('+') || clean_line.starts_with('•') {
                    if let Some(ref mut job) = current_job {
                        let text = clean_line.trim_start_matches(|c| c == '*' || c == '-' || c == '+' || c == '•' || c == ' ').trim();
                        job["responsibilities"].as_array_mut().unwrap().push(json!(text));
                    }
                } else if clean_line.contains('|') {
                    if let Some(ref mut job) = current_job {
                        let parts: Vec<String> = clean_line.split('|').map(|s| s.replace("**", "").replace("*", "").trim().to_string()).collect();
                        if parts.len() == 1 {
                            if job["role"].as_str().unwrap_or("").is_empty() {
                                job["role"] = json!(parts[0]);
                            }
                        } else if parts.len() == 2 {
                            if job["role"].as_str().unwrap_or("").is_empty() {
                                job["role"] = json!(parts[0]);
                            }
                            if job["duration"].as_str().unwrap_or("").is_empty() {
                                job["duration"] = json!(parts[1]);
                            } else if job["location"].as_str().unwrap_or("").is_empty() {
                                job["location"] = json!(parts[1]);
                            }
                        } else if parts.len() >= 3 {
                            if job["role"].as_str().unwrap_or("").is_empty() {
                                job["role"] = json!(parts[0]);
                            }
                            job["location"] = json!(parts[1]);
                            job["duration"] = json!(parts[2]);
                        }
                    }
                }
            }
            Section::Education => {
                let clean = line.replace("**", "").replace("*", "").trim().to_string();
                if !clean.is_empty() {
                    let is_bullet = line.starts_with("* ") || line.starts_with("- ") || line.starts_with("+ ") || line.starts_with("• ");
                    let lower = clean.to_lowercase();

                    if lower.contains("coursework") || lower.contains("gpa") || lower.contains("honors") {
                        if let Some(ref mut edu) = current_edu {
                            edu["details"] = json!(clean);
                        }
                    } else if is_bullet {
                        if let Some(edu) = current_edu.take() {
                            data["education"].as_array_mut().unwrap().push(edu);
                        }
                        let raw_text = line.trim_start_matches(|c| c == '*' || c == '-' || c == '+' || c == '•' || c == ' ').trim();
                        let text = raw_text.replace(['\u{2013}', '\u{2014}'], "-");
                        let mut inst = "".to_string();
                        let deg;
                        let mut loc = "".to_string();
                        let mut dur = "".to_string();

                        if text.contains(" - ") {
                            let parts: Vec<&str> = text.split(" - ").collect();
                            deg = parts[0].replace("**", "").replace("*", "").trim().to_string();
                            let rem = parts[1].replace("**", "").replace("*", "").trim().to_string();
                            if rem.contains(',') {
                                let cparts: Vec<&str> = rem.splitn(2, ',').collect();
                                inst = cparts[0].trim().to_string();
                                loc = cparts[1].trim().to_string();
                            } else {
                                inst = rem;
                            }
                        } else if text.contains('|') {
                            let parts: Vec<&str> = text.split('|').collect();
                            deg = parts[0].replace("**", "").replace("*", "").trim().to_string();
                            inst = if parts.len() > 1 { parts[1].replace("**", "").replace("*", "").trim().to_string() } else { "".to_string() };
                            if parts.len() > 2 { dur = parts[2].replace("**", "").replace("*", "").trim().to_string(); }
                        } else {
                            deg = text.replace("**", "").replace("*", "").trim().to_string();
                        }
                        data["education"].as_array_mut().unwrap().push(json!({
                            "institution": inst,
                            "degree": deg,
                            "location": loc,
                            "duration": dur,
                            "details": ""
                        }));
                    } else if clean.contains('|') {
                        let parts: Vec<&str> = clean.split('|').map(|s| s.trim()).collect();
                        if let Some(ref mut edu) = current_edu {
                            edu["degree"] = json!(parts[0]);
                            if parts.len() > 1 {
                                edu["duration"] = json!(parts[1].replace(['\u{2013}', '\u{2014}'], "-"));
                            }
                        } else {
                            let deg = parts[0].to_string();
                            let dur = if parts.len() > 1 { parts[1].replace(['\u{2013}', '\u{2014}'], "-") } else { "".to_string() };
                            current_edu = Some(json!({
                                "institution": "",
                                "degree": deg,
                                "location": "",
                                "duration": dur,
                                "details": ""
                            }));
                        }
                    } else {
                        if let Some(edu) = current_edu.take() {
                            data["education"].as_array_mut().unwrap().push(edu);
                        }
                        let mut inst = clean.clone();
                        let mut loc = "".to_string();
                        if clean.contains('\u{2014}') { // em-dash "—"
                            let parts: Vec<&str> = clean.split('\u{2014}').map(|s| s.trim()).collect();
                            inst = parts[0].to_string();
                            if parts.len() > 1 { loc = parts[1].to_string(); }
                        } else if clean.contains(" - ") {
                            let parts: Vec<&str> = clean.split(" - ").map(|s| s.trim()).collect();
                            inst = parts[0].to_string();
                            if parts.len() > 1 { loc = parts[1].to_string(); }
                        } else if clean.contains(" -- ") {
                            let parts: Vec<&str> = clean.split(" -- ").map(|s| s.trim()).collect();
                            inst = parts[0].to_string();
                            if parts.len() > 1 { loc = parts[1].to_string(); }
                        } else if clean.contains(',') {
                            let parts: Vec<&str> = clean.splitn(2, ',').map(|s| s.trim()).collect();
                            inst = parts[0].to_string();
                            loc = parts[1].to_string();
                        }
                        current_edu = Some(json!({
                            "institution": inst,
                            "degree": "",
                            "location": loc,
                            "duration": "",
                            "details": ""
                        }));
                    }
                }
            }
            Section::Projects => {
                if line.starts_with("###") || (line.starts_with("**") && line.ends_with("**")) {
                    if let Some(proj) = current_project.take() {
                        data["projects"].as_array_mut().unwrap().push(proj);
                    }
                    current_project = Some(json!({
                        "name": line.trim_start_matches('#').replace("**", "").trim(),
                        "responsibilities": []
                    }));
                } else if line.starts_with('*') || line.starts_with('-') || line.starts_with('+') || line.starts_with('•') {
                    if let Some(ref mut proj) = current_project {
                        let text = line.trim_start_matches(|c| c == '*' || c == '-' || c == '+' || c == '•' || c == ' ').trim();
                        proj["responsibilities"].as_array_mut().unwrap().push(json!(text));
                    }
                } else if line.contains('|') {
                    if let Some(ref mut proj) = current_project {
                        let parts: Vec<&str> = line.split('|').map(|s| s.trim()).collect();
                        if parts.len() >= 1 { proj["technologies"] = json!(parts[0].replace("**", "").replace("*", "").trim()); }
                        if parts.len() >= 2 { proj["duration"] = json!(parts[1].replace("**", "").replace("*", "").trim()); }
                    }
                }
            }
        }
    }
    if let Some(mut job) = current_job {
        if job["company"].as_str().unwrap_or("").is_empty() {
            job["company"] = job["role"].clone();
        }
        if job["role"].as_str().unwrap_or("").is_empty() {
            job["role"] = job["company"].clone();
        }
        data["professional_experience"].as_array_mut().unwrap().push(job);
    }
    if let Some(proj) = current_project {
        data["projects"].as_array_mut().unwrap().push(proj);
    }
    if let Some(edu) = current_edu {
        data["education"].as_array_mut().unwrap().push(edu);
    }

    data
}

pub fn compile_resume(
    input_filepath: &str,
    selected_theme: ResumeTheme,
    output_filename: &str,
) -> Result<(), ResumeCompilationError> {

    // 1. Read the raw Markdown
    let raw_payload = fs::read_to_string(input_filepath)?;

    // 2. Clean all LLM citation artifacts safely (supports [cite: 1], [cite: 1, 2], [cite: 1-3])
    let re = Regex::new(r"\[cite:\s*[\d,\s-]+\]").unwrap();
    let clean_payload = re.replace_all(&raw_payload, "").to_string();

    // 3. Parse Markdown into JSON format that Typst expects
    let parsed_data = parse_markdown_to_json(&clean_payload);
    let clean_json = serde_json::to_string_pretty(&parsed_data)?;

    // Write the cleaned JSON to a temporary file for Typst to read
    let clean_json_file = "clean_resume.json";
    fs::write(clean_json_file, &clean_json)?;

    let json_bridge_path = clean_json_file.replace("\\", "/");

    // 4. Select the matching Typst template layout
    let typst_bridge = match selected_theme {



        // =========================================================================
        // --- 2. JAKE'S RESUME TEMPLATE (PDF 2 style) ---
        // Overleaf CS standard: Centered header, horizontal rules, strict 1-page fit
        // =========================================================================
        ResumeTheme::Jakes => format!(r#"
#set page(margin: (x: 1.0cm, top: 0.8cm, bottom: 0.8cm))
#set text(font: "Arial", size: 8.5pt)
#set par(leading: 0.48em)
#let data = json("{}")
#let p_info = data.at("personal_information", default: (:))
#let name = p_info.at("name", default: "Candidate Name")
#let title = p_info.at("title", default: "")
#let email = p_info.at("email", default: "")
#let mobile = p_info.at("mobile", default: "")
#let linkedin = p_info.at("linkedin", default: "")
#let github = p_info.at("github", default: "")
#let location = p_info.at("location", default: "")

#let contacts = ()
#if mobile != "" {{ contacts.push(mobile) }}
#if email != "" {{ contacts.push(link("mailto:" + email)[#email]) }}
#if linkedin != "" {{
  let li_disp = linkedin.replace("https://", "").replace("http://", "")
  contacts.push(link("https://" + li_disp)[#li_disp])
}}
#if github != "" {{
  let gh_disp = github.replace("https://", "").replace("http://", "")
  contacts.push(link("https://" + gh_disp)[#gh_disp])
}}
#if location != "" {{ contacts.push(location) }}

#align(center)[
  #text(size: 19pt, weight: "bold")[#name] \
  #if title != "" [ #v(0.08em) #text(size: 9.5pt, style: "italic")[#title] \ ]
  #if contacts.len() > 0 [
    #v(0.12em)
    #text(size: 8.5pt)[#contacts.join([ | ])]
  ]
]

#let section(title) = [
  #v(0.3em)
  #text(size: 10pt, weight: "bold")[#title]
  #v(-0.65em)
  #line(length: 100%, stroke: 0.6pt + black)
]

#let render_summary() = [
  #if "professional_summary" in data and data.professional_summary.len() > 0 [
    #section("Professional Summary")
    #for item in data.professional_summary [
      - #item
    ]
  ]
]

#let render_education() = [
  #if "education" in data and data.education.len() > 0 [
    #section("Education")
    #for edu in data.at("education", default: ()) [
      #let inst = edu.at("institution", default: "")
      #let deg = edu.at("degree", default: "")
      #let dur = edu.at("duration", default: "")
      #let loc = edu.at("location", default: "")
      #let det = edu.at("details", default: "")
      #box(width: 100%)[
        *#inst* #h(1fr) #dur \
        #if deg != "" [ #emph(deg) ] #h(1fr) #if loc != "" [ #emph(loc) ]
        #if det != "" [ \ #text(size: 7.5pt, fill: rgb("444444"))[#det] ]
      ]
    ]
  ]
]

#let render_experience() = [
  #if "professional_experience" in data and data.professional_experience.len() > 0 [
    #section("Experience")
    #for job in data.at("professional_experience", default: ()) [
      #v(0.12em)
      #let comp = job.at("company", default: "")
      #let role = job.at("role", default: "")
      #let dur = job.at("duration", default: "")
      #let loc = job.at("location", default: "")
      #box(width: 100%)[
        #if comp != "" and role != "" and comp != role [
          *#comp* #h(1fr) #dur \
          #emph(role) #h(1fr) #if loc != "" [ #emph(loc) ]
        ] else if role != "" [
          *#role* #h(1fr) #dur \
          #if loc != "" [ #emph(loc) ]
        ] else [
          *#comp* #h(1fr) #dur \
          #if loc != "" [ #emph(loc) ]
        ]
      ]
      #for resp in job.at("responsibilities", default: ()) [
        - #resp
      ]
    ]
  ]
]

#let render_projects() = [
  #if "projects" in data and data.projects.len() > 0 [
    #section("Projects")
    #for proj in data.at("projects", default: ()) [
      #v(0.12em)
      #let p_name = proj.at("name", default: "Project")
      #let p_tech = proj.at("technologies", default: "")
      #let p_dur = proj.at("duration", default: "")
      #box(width: 100%)[
        *#p_name* #if p_tech != "" [ | #emph(p_tech) ] #h(1fr) #if p_dur != "" [ #emph(p_dur) ]
      ]
      #for resp in proj.at("responsibilities", default: ()) [
        - #resp
      ]
    ]
  ]
]

#let render_skills() = [
  #if "technical_skills" in data and data.technical_skills.len() > 0 [
    #section("Technical Skills")
    #for (category, skills) in data.at("technical_skills", default: (:)) [
      - *#category:* #skills
    ]
  ]
]

#let sec_order = data.at("section_order", default: ())
#let all_secs = ("summary", "skills", "experience", "projects", "education")
#let final_order = ()
#for sec in sec_order {{
  if sec in all_secs and sec not in final_order {{
    final_order.push(sec)
  }}
}}
#for sec in all_secs {{
  if sec not in final_order {{
    final_order.push(sec)
  }}
}}
#for sec in final_order [
  #if sec == "summary" [ #render_summary() ] else if sec == "skills" [ #render_skills() ] else if sec == "experience" [ #render_experience() ] else if sec == "projects" [ #render_projects() ] else if sec == "education" [ #render_education() ]
]
        "#, json_bridge_path),

        // =========================================================================
        // =========================================================================
        // --- 3. MODERN CLEAN TEMPLATE (PDF 3 style) ---
        // Deedy Minimalist: Uppercase gray headers with thin lines and link accents
        // =========================================================================
        ResumeTheme::ModernClean => format!(r#"
#set page(margin: (x: 1.0cm, top: 0.8cm, bottom: 0.8cm))
#set text(font: "Arial", size: 8.5pt)
#set par(leading: 0.48em)
#let data = json("{}")
#let p_info = data.at("personal_information", default: (:))
#let name = p_info.at("name", default: "Candidate Name")
#let title = p_info.at("title", default: "")
#let email = p_info.at("email", default: "")
#let mobile = p_info.at("mobile", default: "")
#let linkedin = p_info.at("linkedin", default: "")
#let github = p_info.at("github", default: "")
#let location = p_info.at("location", default: "")

#let contacts = ()
#if email != "" {{ contacts.push(link("mailto:" + email)[#email]) }}
#if mobile != "" {{ contacts.push(mobile) }}
#if linkedin != "" {{
  let li_disp = linkedin.replace("https://", "").replace("http://", "")
  contacts.push(link("https://" + li_disp)[#li_disp])
}}
#if github != "" {{
  let gh_disp = github.replace("https://", "").replace("http://", "")
  contacts.push(link("https://" + gh_disp)[#gh_disp])
}}
#if location != "" {{ contacts.push(location) }}

#align(center)[
  #text(size: 20pt, weight: "regular", fill: rgb("111111"))[#name] \
  #if title != "" [ #v(0.08em) #text(size: 9.5pt, fill: rgb("555555"))[#title] \ ]
  #if contacts.len() > 0 [
    #v(0.15em)
    #text(size: 8.5pt, fill: rgb("555555"))[#contacts.join([ | ])]
  ]
]

#let section(title) = [
  #v(0.35em)
  #text(size: 9.8pt, weight: "bold", fill: rgb("666666"), tracking: 1.2pt, upper(title))
  #v(-0.65em)
  #line(length: 100%, stroke: 0.5pt + rgb("aaaaaa"))
]

#let render_summary() = [
  #if "professional_summary" in data and data.professional_summary.len() > 0 [
    #section("Professional Summary")
    #for item in data.professional_summary [
      - #item
    ]
  ]
]

#let render_education() = [
  #if "education" in data and data.education.len() > 0 [
    #section("Education")
    #for edu in data.at("education", default: ()) [
      #let inst = edu.at("institution", default: "")
      #let deg = edu.at("degree", default: "")
      #let dur = edu.at("duration", default: "")
      #let loc = edu.at("location", default: "")
      #let det = edu.at("details", default: "")
      #box(width: 100%)[
        #if deg != "" [ *#deg* ] else [ *#inst* ] #h(1fr) #loc #if loc != "" and dur != "" [ | ] #dur \
        #if deg != "" and inst != "" [ #text(size: 8pt, fill: rgb("333333"), upper(inst)) ]
        #if det != "" [ \ #text(size: 7.5pt, fill: rgb("555555"))[#det] ]
      ]
      #v(0.1em)
    ]
  ]
]

#let render_experience() = [
  #if "professional_experience" in data and data.professional_experience.len() > 0 [
    #section("Work Experience")
    #for job in data.at("professional_experience", default: ()) [
      #v(0.1em)
      #let comp = job.at("company", default: "")
      #let role = job.at("role", default: "")
      #let dur = job.at("duration", default: "")
      #let loc = job.at("location", default: "")
      #box(width: 100%)[
        #if comp != "" and role != "" and comp != role [
          *#upper(comp)* | #upper(role)
        ] else if role != "" [
          *#upper(role)*
        ] else [
          *#upper(comp)*
        ]
        #h(1fr) #if loc != "" [ #loc ] #if loc != "" and dur != "" [ | ] #if dur != "" [ #dur ]
      ]
      #for resp in job.at("responsibilities", default: ()) [
        - #resp
      ]
    ]
  ]
]

#let render_projects() = [
  #if "projects" in data and data.projects.len() > 0 [
    #section("Projects")
    #for proj in data.at("projects", default: ()) [
      #v(0.1em)
      #let p_name = proj.at("name", default: "Project")
      #let p_tech = proj.at("technologies", default: "")
      #let p_dur = proj.at("duration", default: "")
      #box(width: 100%)[
        *#upper(p_name)* #if p_tech != "" [ | #text(size: 8pt, fill: rgb("444444"))[#upper(p_tech)] ] #h(1fr) #p_dur
      ]
      #for resp in proj.at("responsibilities", default: ()) [
        - #resp
      ]
    ]
  ]
]

#let render_skills() = [
  #if "technical_skills" in data and data.technical_skills.len() > 0 [
    #section("Skills")
    #for (category, skills) in data.at("technical_skills", default: (:)) [
      *#category:* #skills \
    ]
  ]
]

#let sec_order = data.at("section_order", default: ())
#let all_secs = ("summary", "skills", "experience", "projects", "education")
#let final_order = ()
#for sec in sec_order {{
  if sec in all_secs and sec not in final_order {{
    final_order.push(sec)
  }}
}}
#for sec in all_secs {{
  if sec not in final_order {{
    final_order.push(sec)
  }}
}}
#for sec in final_order [
  #if sec == "summary" [ #render_summary() ] else if sec == "skills" [ #render_skills() ] else if sec == "experience" [ #render_experience() ] else if sec == "projects" [ #render_projects() ] else if sec == "education" [ #render_education() ]
]
        "#, json_bridge_path),



        // =========================================================================
        // --- 5. CLASSIC EXECUTIVE TEMPLATE (PDF 5 style) ---
        // Sourabh Bajaj format: Ivy League LaTeX, full header divider line, serif
        // =========================================================================
        ResumeTheme::ClassicExecutive => format!(r#"
#set page(margin: (x: 1.0cm, top: 0.8cm, bottom: 0.8cm))
#set text(font: "Times New Roman", size: 8.8pt)
#set par(leading: 0.60em)
#let data = json("{}")
#let p_info = data.at("personal_information", default: (:))
#let name = p_info.at("name", default: "Candidate Name")
#let title = p_info.at("title", default: "")
#let email = p_info.at("email", default: "")
#let mobile = p_info.at("mobile", default: "")
#let linkedin = p_info.at("linkedin", default: "")
#let github = p_info.at("github", default: "")
#let location = p_info.at("location", default: "")

// --- Header ---
#grid(
  columns: (1.2fr, 1fr),
  [
    #text(size: 20pt, weight: "bold")[#name] \
    #if title != "" [ #v(0.05em) #text(size: 9.5pt, style: "italic", fill: rgb("333333"))[#title] \ ]
    #if linkedin != "" [
      #let li_disp = linkedin.replace("https://", "").replace("http://", "").trim("/")
      #text(size: 8.5pt)[#link("https://" + li_disp)[#li_disp]] \
    ]
    #if github != "" [
      #let gh_disp = github.replace("https://", "").replace("http://", "").trim("/")
      #text(size: 8.5pt)[#link("https://" + gh_disp)[#gh_disp]]
    ]
  ],
  align(right)[
    #if email != "" [ #text(size: 8.5pt)[Email: #link("mailto:" + email)[#email]] \ ]
    #if mobile != "" [ #text(size: 8.5pt)[Mobile: #mobile] \ ]
    #if location != "" [ #text(size: 8.5pt)[Location: #location] ]
  ]
)
#v(-0.2em)
#line(length: 100%, stroke: 0.75pt + black)

#let section(title) = [
  #v(0.45em)
  #text(size: 10pt, weight: "bold", tracking: 0.4pt, upper(title))
  #v(-0.6em)
  #line(length: 100%, stroke: 0.5pt + black)
  #v(0.18em)
]

#let render_summary() = [
  #if "professional_summary" in data and data.professional_summary.len() > 0 [
    #section("Summary")
    #set list(marker: [•], spacing: 0.55em)
    #for item in data.professional_summary [
      - #item
    ]
    #v(0.15em)
  ]
]

#let render_education() = [
  #if "education" in data and data.education.len() > 0 [
    #section("Education")
    #for edu in data.at("education", default: ()) [
      #v(0.25em)
      #let inst = edu.at("institution", default: "")
      #let deg = edu.at("degree", default: "")
      #let dur = edu.at("duration", default: "")
      #let loc = edu.at("location", default: "")
      #let det = edu.at("details", default: "")
      #block(width: 100%)[
        #grid(
          columns: (1fr, auto),
          row-gutter: 0.38em,
          [ *#inst* ], [ #if loc != "" [ *#loc* ] ],
          [ #if deg != "" [ #emph(deg) ] ], [ #if dur != "" [ #emph(dur) ] ]
        )
        #if det != "" [
          #v(0.12em)
          #text(size: 8pt, fill: rgb("444444"))[#det] \
        ]
      ]
      #v(0.15em)
    ]
  ]
]

#let render_experience() = [
  #if "professional_experience" in data and data.professional_experience.len() > 0 [
    #section("Experience")
    #for job in data.at("professional_experience", default: ()) [
      #v(0.38em)
      #let comp = job.at("company", default: "")
      #let role = job.at("role", default: "")
      #let dur = job.at("duration", default: "")
      #let loc = job.at("location", default: "")
      #block(width: 100%)[
        #if comp != "" and role != "" and comp != role [
          #grid(
            columns: (1fr, auto),
            row-gutter: 0.38em,
            [ *#comp* ], [ #if loc != "" [ *#loc* ] ],
            [ #emph(role) ], [ #if dur != "" [ #emph(dur) ] ]
          )
        ] else if role != "" [
          #grid(
            columns: (1fr, auto),
            row-gutter: 0.38em,
            [ *#role* ], [ #if dur != "" [ #emph(dur) ] ],
            [ #if loc != "" [ #emph(loc) ] ], [ ]
          )
        ] else [
          #grid(
            columns: (1fr, auto),
            row-gutter: 0.38em,
            [ *#comp* ], [ #if dur != "" [ #emph(dur) ] ]
          )
        ]
      ]
      #v(0.20em)
      #set list(marker: [•], spacing: 0.52em)
      #for resp in job.at("responsibilities", default: ()) [
        - #resp
      ]
    ]
  ]
]

#let render_projects() = [
  #if "projects" in data and data.projects.len() > 0 [
    #section("Projects")
    #for proj in data.at("projects", default: ()) [
      #v(0.25em)
      #let p_name = proj.at("name", default: "Project")
      #let p_tech = proj.at("technologies", default: "")
      #let p_dur = proj.at("duration", default: "")
      #block(width: 100%)[
        #grid(
          columns: (1fr, auto),
          [ *#p_name* #if p_tech != "" [ | #text(size: 8pt, style: "italic", fill: rgb("333333"))[#p_tech] ] ],
          [ #if p_dur != "" [ #emph(p_dur) ] ]
        )
      ]
      #v(0.20em)
      #set list(marker: [•], spacing: 0.52em)
      #for resp in proj.at("responsibilities", default: ()) [
        - #resp
      ]
    ]
  ]
]

#let render_skills() = [
  #if "technical_skills" in data and data.technical_skills.len() > 0 [
    #section("Technical Skills")
    #set list(marker: [•], spacing: 0.55em)
    #for (category, skills) in data.at("technical_skills", default: (:)) [
      - *#category:* #skills
    ]
    #v(0.15em)
  ]
]

#let sec_order = data.at("section_order", default: ())
#let all_secs = ("summary", "skills", "experience", "projects", "education")
#let final_order = ()
#for sec in sec_order {{
  if sec in all_secs and sec not in final_order {{
    final_order.push(sec)
  }}
}}
#for sec in all_secs {{
  if sec not in final_order {{
    final_order.push(sec)
  }}
}}
#for sec in final_order [
  #if sec == "summary" [ #render_summary() ] else if sec == "skills" [ #render_skills() ] else if sec == "experience" [ #render_experience() ] else if sec == "projects" [ #render_projects() ] else if sec == "education" [ #render_education() ]
]
        "#, json_bridge_path),

        // =========================================================================
        // =========================================================================
        // --- 6. MINIMAL TECH TEMPLATE ---
        // Clean left-aligned modern layout with solid black vertical accent bars
        // =========================================================================
        ResumeTheme::MinimalTech => format!(r#"
#set page(margin: (x: 1.1cm, top: 0.8cm, bottom: 0.8cm))
#set text(font: "Arial", size: 8.8pt)
#set par(leading: 0.48em)
#let data = json("{}")
#let p_info = data.at("personal_information", default: (:))
#let name = p_info.at("name", default: "Candidate Name")
#let title = p_info.at("title", default: "")
#let email = p_info.at("email", default: "")
#let mobile = p_info.at("mobile", default: "")
#let linkedin = p_info.at("linkedin", default: "")
#let github = p_info.at("github", default: "")
#let location = p_info.at("location", default: "")

#let contacts = ()
#if title != "" {{ contacts.push(title) }}
#if email != "" {{ contacts.push(link("mailto:" + email)[#email]) }}
#if mobile != "" {{ contacts.push(mobile) }}
#if linkedin != "" {{
  let li_disp = linkedin.replace("https://", "").replace("http://", "")
  contacts.push(link("https://" + li_disp)[#li_disp])
}}
#if github != "" {{
  let gh_disp = github.replace("https://", "").replace("http://", "")
  contacts.push(link("https://" + gh_disp)[#gh_disp])
}}
#if location != "" {{ contacts.push(location) }}

#align(left)[
  #text(size: 21pt, weight: "regular")[#name] \
  #if contacts.len() > 0 [
    #v(0.15em)
    #text(size: 8.8pt, fill: rgb("444444"))[#contacts.join([ • ])]
  ]
]
#v(0.3em)

#let section(title) = [
  #v(0.4em)
  #box(stroke: (left: 3pt + black), inset: (left: 0.5em))[
    #text(size: 10.5pt, weight: "bold", tracking: 0.5pt, upper(title))
  ]
  #v(0.15em)
]

#let render_summary() = [
  #if "professional_summary" in data and data.professional_summary.len() > 0 [
    #section("Professional Summary")
    #for item in data.professional_summary [
      - #item
    ]
  ]
]

#let render_education() = [
  #if "education" in data and data.education.len() > 0 [
    #section("Education")
    #for edu in data.at("education", default: ()) [
      #let inst = edu.at("institution", default: "")
      #let deg = edu.at("degree", default: "")
      #let dur = edu.at("duration", default: "")
      #let loc = edu.at("location", default: "")
      #let det = edu.at("details", default: "")
      #box(width: 100%)[
        *#inst* #h(1fr) #dur \
        #if deg != "" [ #emph(deg) ] #if loc != "" [ #h(1fr) #loc ]
        #if det != "" [ \ #text(size: 7.5pt, fill: rgb("444444"))[#det] ]
      ]
      #v(0.15em)
    ]
  ]
]

#let render_experience() = [
  #if "professional_experience" in data and data.professional_experience.len() > 0 [
    #section("Professional Experience")
    #for job in data.at("professional_experience", default: ()) [
      #v(0.12em)
      #let comp = job.at("company", default: "")
      #let role = job.at("role", default: "")
      #let dur = job.at("duration", default: "")
      #let loc = job.at("location", default: "")
      #box(width: 100%)[
        #if comp != "" and role != "" and comp != role [
          *#role* #h(1fr) #dur \
          #emph(comp) #h(1fr) #loc
        ] else if role != "" [
          *#role* #h(1fr) #dur \
          #if loc != "" [ #emph(loc) ]
        ] else [
          *#comp* #h(1fr) #dur \
          #if loc != "" [ #emph(loc) ]
        ]
      ]
      #for resp in job.at("responsibilities", default: ()) [
        - #resp
      ]
    ]
  ]
]

#let render_projects() = [
  #if "projects" in data and data.projects.len() > 0 [
    #section("Technical Projects")
    #for proj in data.at("projects", default: ()) [
      #v(0.12em)
      #let p_name = proj.at("name", default: "Project")
      #let p_tech = proj.at("technologies", default: "")
      #let p_dur = proj.at("duration", default: "")
      #box(width: 100%)[
        *#p_name* #if p_tech != "" [ | #emph(p_tech) ] #h(1fr) #p_dur
      ]
      #for resp in proj.at("responsibilities", default: ()) [
        - #resp
      ]
    ]
  ]
]

#let render_skills() = [
  #if "technical_skills" in data and data.technical_skills.len() > 0 [
    #section("Technical Skills")
    #for (category, skills) in data.at("technical_skills", default: (:)) [
      - *#category:* #skills
    ]
  ]
]

#let sec_order = data.at("section_order", default: ())
#let all_secs = ("summary", "skills", "experience", "projects", "education")
#let final_order = ()
#for sec in sec_order {{
  if sec in all_secs and sec not in final_order {{
    final_order.push(sec)
  }}
}}
#for sec in all_secs {{
  if sec not in final_order {{
    final_order.push(sec)
  }}
}}
#for sec in final_order [
  #if sec == "summary" [ #render_summary() ] else if sec == "skills" [ #render_skills() ] else if sec == "experience" [ #render_experience() ] else if sec == "projects" [ #render_projects() ] else if sec == "education" [ #render_education() ]
]
        "#, json_bridge_path),

    };

    let temp_typ_file = "bridge.typ";
    fs::write(temp_typ_file, typst_bridge)?;

    // 5. Compile via Typst CLI (with fallback to Python typst module if OS policy restricts standalone CLI)
    let output_pdf = format!("{}.pdf", output_filename);
    let mut compiled = false;

    if let Ok(status) = Command::new("typst").args(["compile", temp_typ_file, &output_pdf]).status() {
        if status.success() {
            compiled = true;
        }
    }

    if !compiled {
        let py_cmd = "import typst, sys; typst.compile(sys.argv[1], output=sys.argv[2])";
        if let Ok(status) = Command::new("python").args(["-c", py_cmd, temp_typ_file, &output_pdf]).status() {
            if status.success() {
                compiled = true;
            }
        }
    }

    if compiled {
        println!("Successfully generated {} using '{}' theme!", output_pdf, selected_theme.display_name());
        Ok(())
    } else {
        Err(ResumeCompilationError::CliError("Typst compilation failed.".to_string()))
    }
}


/// Compile the same structured content rendered by the portal's ResumeSheet.
/// The HTTP wrapper runs each request in its own temporary working directory.
fn compile_ui_resume(theme: &str, input: &str, output: &str) -> Result<(), ResumeCompilationError> {
    if !["2", "3", "5", "6"].contains(&theme) {
        return Err(ResumeCompilationError::CliError("Unsupported UI theme".into()));
    }
    let raw = fs::read(input)?;
    if raw.len() > 256_000 {
        return Err(ResumeCompilationError::CliError("Resume payload too large".into()));
    }
    let data: Value = serde_json::from_slice(&raw)?;
    validate_ui_resume(&data)?;
    fs::write("ui-resume.json", serde_json::to_vec(&data)?)?;
    fs::write("ui-resume.typ", include_str!("ui-resume.typ"))?;
    let typst = std::env::var("TYPST_BIN").unwrap_or_else(|_| "typst".into());
    let output_pdf = format!("{}.pdf", output);
    let result = Command::new(typst)
        .args(["compile", "--input", &format!("theme={}", theme), "ui-resume.typ", &output_pdf])
        .output()?;
    if !result.status.success() {
        return Err(ResumeCompilationError::CliError(String::from_utf8_lossy(&result.stderr).into_owned()));
    }
    println!("UI PDF compiled: theme {}", theme);
    Ok(())
}

fn validate_ui_resume(data: &Value) -> Result<(), ResumeCompilationError> {
    let invalid = || ResumeCompilationError::CliError("Invalid UI resume content".into());
    for key in ["name", "title", "phone", "email", "linkedin", "github", "location"] {
        if !data["personalInfo"][key].is_string() { return Err(invalid()); }
    }
    for key in ["summary", "sectionOrder"] {
        let values = data[key].as_array().ok_or_else(invalid)?;
        if values.iter().any(|item| !item.is_string()) { return Err(invalid()); }
    }
    for (key, fields) in [
        ("skills", vec!["category", "items"]),
        ("experience", vec!["role", "company", "location", "duration"]),
        ("projects", vec!["title", "technologies", "duration"]),
        ("education", vec!["institution", "location", "degree", "duration"]),
    ] {
        for item in data[key].as_array().ok_or_else(invalid)? {
            if fields.iter().any(|field| !item[*field].is_string()) { return Err(invalid()); }
            if key == "experience" || key == "projects" {
                if item["bullets"].as_array().ok_or_else(invalid)?.iter().any(|v| !v.is_string()) {
                    return Err(invalid());
                }
            }
            if key == "education" && item.get("details").is_some_and(|v| !v.is_string()) {
                return Err(invalid());
            }
        }
    }
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    use std::env;
    use std::io::{self, Write};

    let args: Vec<String> = env::args().collect();
    if args.get(1).map(String::as_str) == Some("--ui-json") {
        if args.len() != 5 {
            return Err("Usage: resume-builder-rs --ui-json THEME OUTPUT INPUT_JSON".into());
        }
        compile_ui_resume(&args[2], &args[4], &args[3])?;
        return Ok(());
    }

    let selected_theme = if args.len() > 1 {
        match args[1].to_lowercase().as_str() {
            "2" | "jakes" | "jake" | "classic" | "tech" => ResumeTheme::Jakes,
            "3" | "modern" | "clean" | "modernclean" | "deedy" => ResumeTheme::ModernClean,
            "5" | "executive" | "classicexecutive" | "sourabh" | "ivy" => ResumeTheme::ClassicExecutive,
            "6" | "minimal" | "minimaltech" | "bars" => ResumeTheme::MinimalTech,
            _ => {
                eprintln!("Unknown theme: '{}'. Defaulting to Jake's Resume (#2).", args[1]);
                ResumeTheme::Jakes
            }
        }
    } else {
        println!("============================================================");
        println!("   RESUME BUILDER - SELECT YOUR ATS / EXECUTIVE THEME       ");
        println!("============================================================");
        println!("  2) Jakes            - Classic tech single-column (Overleaf Standard)");
        println!("  3) ModernClean      - Deedy minimalist with uppercase gray rules");
        println!("  5) ClassicExecutive - Ivy League / Executive LaTeX format");
        println!("  6) MinimalTech      - Modern ATS with bold vertical accent bars");
        println!("------------------------------------------------------------");
        print!("Enter your choice (2, 3, 5, 6) [2]: ");
        io::stdout().flush()?;

        let mut choice = String::new();
        io::stdin().read_line(&mut choice)?;

        match choice.trim().to_lowercase().as_str() {
            "2" | "jakes" | "jake" | "" => ResumeTheme::Jakes,
            "3" | "modern" | "clean" => ResumeTheme::ModernClean,
            "5" | "executive" | "sourabh" => ResumeTheme::ClassicExecutive,
            "6" | "minimal" => ResumeTheme::MinimalTech,
            _ => {
                println!("Invalid choice. Defaulting to Jake's Resume (#2).");
                ResumeTheme::Jakes
            }
        }
    };

    let output_name = if args.len() > 2 {
        args[2].as_str()
    } else {
        "compiled_ats_resume"
    };

    let input_filepath = if args.len() > 3 {
        args[3].as_str()
    } else {
        "resume.md"
    };

    println!("Compiling resume from Markdown using '{}'...", selected_theme.display_name());
    match compile_resume(input_filepath, selected_theme, output_name) {
        Ok(_) => println!("Build process completed successfully."),
        Err(e) => {
            eprintln!("Compilation error: {}", e);
            std::process::exit(1);
        }
    }

    Ok(())
}
