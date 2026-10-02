use base64::{engine::general_purpose::STANDARD, Engine};
use pulldown_cmark::{Event, Options, Parser, Tag};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    process::{Command, Output, Stdio},
    time::{Duration, Instant},
};

fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}
fn literal(s: &str) -> String {
    format!("#text({})", quote(s))
}
fn utf16(s: &str, offset: usize) -> usize {
    s[..offset].encode_utf16().count()
}
fn hash(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}

struct Frame {
    kind: String,
    body: String,
    children: Vec<String>,
    argument: String,
    start: usize,
    end: usize,
}
impl Frame {
    fn finish(&self) -> String {
        match self.kind.as_str() {
            "heading" => format!("#heading(level: {})[{}]", self.argument, self.body),
            "strong" => format!("#strong[{}]", self.body),
            "emph" => format!("#emph[{}]", self.body),
            "strike" => format!("#strike[{}]", self.body),
            "link" => {
                if ["https://", "http://", "mailto:", "tel:"]
                    .iter()
                    .any(|p| self.argument.starts_with(p))
                {
                    format!("#link({})[{}]", quote(&self.argument), self.body)
                } else {
                    format!("{}{}", self.body, literal(&format!(" ({})", self.argument)))
                }
            }
            "image" => format!("{}{}", self.body, literal(&format!(" ({})", self.argument))),
            "code" => format!("#raw({}, block: true)", quote(&self.body)),
            "list" => {
                if self.argument.is_empty() {
                    format!("#list({})", self.children.join(","))
                } else {
                    format!(
                        "#enum(start: {}, {})",
                        self.argument,
                        self.children.join(",")
                    )
                }
            }
            "item" => format!("[{}]", self.body),
            "blockquote" => format!(
                "#block(stroke: (left: 1pt + rgb(\"aaaaaa\")), inset: (left: 9pt))[{}]",
                self.body
            ),
            "table" => format!(
                "#table(columns: ({},), inset: 4pt, stroke: 0.4pt + rgb(\"cccccc\"), {})",
                self.argument,
                self.children.join(",")
            ),
            "tablehead" => format!("table.header({})", self.children.join(",")),
            "tablerow" => self.children.join(","),
            "tablecell" => format!("[{}]", self.body),
            _ => self.body.clone(),
        }
    }
}

pub fn document(markdown: &str) -> (String, Vec<Value>, Vec<String>) {
    let mut stack: Vec<Frame> = Vec::new();
    let mut blocks = Vec::new();
    let mut roots = Vec::new();
    let mut warnings = Vec::new();
    let citation = regex::Regex::new(r"\[cite:\s*[^\]]+\]").unwrap();
    let mut add_root = |kind: &str, body: String, start: usize, end: usize| {
        let end = markdown[..end].trim_end_matches(['\r', '\n']).len();
        let id = format!("block-{}", blocks.len());
        roots.push(format!("#tracked({})[{}]", quote(&id), body));
        let mut block = json!({"id":id,"type":kind,"start":utf16(markdown,start),"end":utf16(markdown,end),"raw":&markdown[start..end]});
        if body.contains("#resume-entry(") {
            block["layout"] = json!("entry");
        }
        blocks.push(block);
    };
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let mut events = Parser::new_ext(markdown, options)
        .into_offset_iter()
        .peekable();
    while let Some((mut event, mut range)) = events.next() {
        if let Event::Text(first) = &event {
            let mut text = first.to_string();
            while events
                .peek()
                .is_some_and(|(next, _)| matches!(next, Event::Text(_)))
            {
                if let Some((Event::Text(next), next_range)) = events.next() {
                    text.push_str(&next);
                    range.end = next_range.end;
                }
            }
            event = Event::Text(text.into());
        }
        match event {
            Event::Start(tag) => {
                let (kind, argument) = match tag {
                    Tag::Paragraph => ("paragraph", String::new()),
                    Tag::Heading { level, .. } => ("heading", (level as u8).to_string()),
                    Tag::List(start) => ("list", start.map(|n| n.to_string()).unwrap_or_default()),
                    Tag::Item => ("item", String::new()),
                    Tag::Emphasis => ("emph", String::new()),
                    Tag::Strong => ("strong", String::new()),
                    Tag::Strikethrough => ("strike", String::new()),
                    Tag::Link { dest_url, .. } => ("link", dest_url.into_string()),
                    Tag::Image { dest_url, .. } => {
                        warnings.push(
                            "Images use alternative text and URLs rather than embedded graphics."
                                .into(),
                        );
                        ("image", dest_url.into_string())
                    }
                    Tag::BlockQuote(_) => ("blockquote", String::new()),
                    Tag::CodeBlock(_) => ("code", String::new()),
                    Tag::HtmlBlock => {
                        warnings.push("Raw HTML is displayed as text.".into());
                        ("html", String::new())
                    }
                    Tag::Table(alignments) => ("table", vec!["1fr"; alignments.len()].join(",")),
                    Tag::TableHead => ("tablehead", String::new()),
                    Tag::TableRow => ("tablerow", String::new()),
                    Tag::TableCell => ("tablecell", String::new()),
                    _ => ("paragraph", String::new()),
                };
                stack.push(Frame {
                    kind: kind.into(),
                    body: String::new(),
                    children: Vec::new(),
                    argument,
                    start: range.start,
                    end: range.end,
                });
            }
            Event::End(_) => {
                if let Some(frame) = stack.pop() {
                    let rendered = frame.finish();
                    if let Some(parent) = stack.last_mut() {
                        if matches!(
                            parent.kind.as_str(),
                            "list" | "table" | "tablehead" | "tablerow"
                        ) {
                            parent.children.push(rendered);
                        } else {
                            if frame.kind == "paragraph" && !parent.body.is_empty() {
                                parent.body.push_str("\n\n");
                            }
                            parent.body.push_str(&rendered);
                        }
                    } else {
                        let prefix = markdown[..frame.start].trim();
                        let contact_list = frame.kind == "list"
                            && prefix.starts_with("# ")
                            && prefix.lines().count() == 1
                            && roots_are_contacts(&markdown[frame.start..frame.end]);
                        let rendered=if contact_list {format!("#resume-contacts({})",frame.children.join(","))}else if frame.kind=="paragraph" && regex::Regex::new(r"(?s)^\s*\*\*.+?\*\*[\s|]*\*[^*\n]*(?:19|20)\d{2}[^*\n]*\*(?:\[cite:[^\]]+\])?\s*$").unwrap().is_match(&markdown[frame.start..frame.end]) {
                            if let Some(split)=rendered.rfind("#emph["){format!("#resume-entry(left: [{}], dates: [{}])",&rendered[..split],&rendered[split..])}else{rendered}
                        }else{rendered};
                        add_root(&frame.kind, rendered, frame.start, frame.end);
                    }
                }
            }
            Event::Rule => {
                if let Some(parent) = stack.last_mut() {
                    parent.body.push_str("#line(length: 100%)")
                } else {
                    let section_follows = events.peek().is_some_and(|(next, _)| {
                        matches!(
                            next,
                            Event::Start(Tag::Heading {
                                level: pulldown_cmark::HeadingLevel::H2,
                                ..
                            })
                        )
                    });
                    add_root(
                        "hr",
                        if section_follows {
                            "#v(2pt)".into()
                        } else {
                            "#line(length: 100%, stroke: 0.4pt + rgb(\"bbbbbb\"))".into()
                        },
                        range.start,
                        range.end,
                    )
                }
            }
            event => {
                let raw = match event {
                    Event::Text(text) => {
                        let cleaned = citation.replace_all(&text, "");
                        if stack.last().is_some_and(|f| f.kind == "code") {
                            cleaned.into_owned()
                        } else {
                            literal(&cleaned)
                        }
                    }
                    Event::Code(text) => format!("#raw({})", quote(&text)),
                    Event::SoftBreak => literal(" "),
                    Event::HardBreak => "#linebreak()".into(),
                    Event::TaskListMarker(checked) => {
                        literal(if checked { "[x] " } else { "[ ] " })
                    }
                    Event::Html(text) | Event::InlineHtml(text) => {
                        warnings.push("Raw HTML is displayed as text.".into());
                        literal(&text)
                    }
                    Event::FootnoteReference(text) => literal(&format!("[{}]", text)),
                    _ => String::new(),
                };
                if let Some(parent) = stack.last_mut() {
                    parent.body.push_str(&raw)
                } else if !raw.is_empty() {
                    add_root("paragraph", raw, range.start, range.end)
                }
            }
        }
    }
    if citation.is_match(markdown) {
        warnings.push(
            "Citation artifacts are hidden in the PDF; saved Markdown remains unchanged.".into(),
        );
    }
    warnings.sort();
    warnings.dedup();
    let contact_header = blocks.len() > 1
        && blocks[0]["raw"]
            .as_str()
            .is_some_and(|s| s.starts_with("# "))
        && blocks[1]["type"] == "list"
        && roots_are_contacts(blocks[1]["raw"].as_str().unwrap_or(""));
    let output = if contact_header {
        blocks[0]["layout"] = json!("name");
        blocks[1]["layout"] = json!("contacts");
        for i in 0..2 {
            roots[i] = roots[i].replacen(
                ")[",
                ", width: if theme == 5 { 264pt } else if theme == 6 { 544pt } else { 540pt })[",
                1,
            );
        }
        format!(
            "#resume-header(name: [{}], contacts: [{}])\n\n{}",
            roots[0],
            roots[1],
            roots[2..].join("\n\n")
        )
    } else {
        roots.join("\n\n")
    };
    (output, blocks, warnings)
}

fn roots_are_contacts(raw: &str) -> bool {
    // Only a labeled contact list becomes a header; ordinary resume lists keep their structure.
    let labels=regex::Regex::new(r"(?i)^\s*[-*+]\s+(?:\*\*)?(email|e-mail|phone|mobile|linkedin|github|location|role|title|website)(?:\*\*)?\s*:").unwrap();
    let lines: Vec<_> = raw.lines().filter(|line| !line.trim().is_empty()).collect();
    !lines.is_empty() && lines.iter().all(|line| labels.is_match(line))
}

pub fn compile(root: &Path, markdown: &str, theme: u64) -> Result<(Vec<u8>, Value), String> {
    if markdown.trim().is_empty() || markdown.len() > 256_000 || !matches!(theme, 2 | 3 | 5 | 6) {
        return Err("Enter nonempty Markdown under 256 KB and choose theme 2, 3, 5, or 6".into());
    }
    if markdown
        .chars()
        .any(|c| c < ' ' && !matches!(c, '\r' | '\n' | '\t'))
    {
        return Err("Unsupported control character".into());
    }
    let (body, mut blocks, mut warnings) = document(markdown);
    let template = fs::read_to_string(root.join("resume.typ")).map_err(|e| e.to_string())?;
    let code = format!("{}\n{}", template, body);
    let work = tempfile::tempdir().map_err(|e| e.to_string())?;
    let source = work.path().join("resume.typ");
    let output = work.path().join("resume.pdf");
    fs::write(&source, &code).map_err(|e| e.to_string())?;
    let local = root.join("typst.exe");
    let typst = if local.exists() {
        local.into_os_string()
    } else {
        std::env::var_os("TYPST_BIN").unwrap_or_else(|| "typst".into())
    };
    let started = Instant::now();
    let timeout = Duration::from_secs(
        std::env::var("COMPILE_TIMEOUT_SECONDS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(45)
            .clamp(1, 90),
    );
    let result = run(
        Command::new(&typst)
            .args(["compile", "--input", &format!("theme={theme}")])
            .arg(&source)
            .arg(&output),
        started,
        timeout,
    )?;
    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).into());
    }
    let query = run(
        Command::new(&typst)
            .args(["eval", "query(<resume-source>).map(it => it.value)", "--in"])
            .arg(&source)
            .args(["--input", &format!("theme={theme}"), "--format", "json"]),
        started,
        timeout,
    )?;
    if !query.status.success() {
        return Err(String::from_utf8_lossy(&query.stderr).into());
    }
    let markers: Vec<Value> = serde_json::from_slice(&query.stdout).map_err(|e| e.to_string())?;
    for block in &mut blocks {
        let mut positions = json!({});
        for marker in markers.iter().filter(|m| m["id"] == block["id"]) {
            let mut position = marker["position"].clone();
            for axis in ["x", "y"] {
                position[axis] = json!(position[axis]
                    .as_str()
                    .ok_or("Invalid source position")?
                    .trim_end_matches("pt")
                    .parse::<f64>()
                    .map_err(|e| e.to_string())?);
            }
            position["width"] = json!(marker["width"]
                .as_str()
                .ok_or("Missing source width")?
                .trim_end_matches("pt")
                .parse::<f64>()
                .map_err(|e| e.to_string())?);
            positions[marker["edge"].as_str().ok_or("Invalid source edge")?] = position;
        }
        if positions.get("start").is_none() || positions.get("end").is_none() {
            return Err("Missing editable source positions".into());
        }
        block["positions"] = positions;
    }
    if fs::metadata(&output).map_err(|e| e.to_string())?.len() > 16_000_000 {
        return Err("Generated PDF exceeds 16 MB".into());
    }
    let pdf = fs::read(output).map_err(|e| e.to_string())?;
    if !pdf.starts_with(b"%PDF-") {
        return Err("Invalid PDF output".into());
    }
    let stderr = String::from_utf8_lossy(&result.stderr).into_owned();
    if !stderr.trim().is_empty() {
        warnings.push(stderr.clone());
    }
    let data = json!({"success":true,"theme":theme,"pdf_base64":STANDARD.encode(&pdf),"pdf_sha256":hash(&pdf),"markdown_sha256":hash(markdown.as_bytes()),"json_data":{"blocks":blocks},"source_map":blocks,"warnings":warnings,"typst_code":code,"stdout":String::from_utf8_lossy(&result.stdout),"stderr":stderr});
    Ok((pdf, data))
}

fn run(command: &mut Command, started: Instant, timeout: Duration) -> Result<Output, String> {
    // Files avoid pipe deadlocks when compiler diagnostics exceed an OS pipe buffer.
    let stdout = tempfile::tempfile().map_err(|e| e.to_string())?;
    let stderr = tempfile::tempfile().map_err(|e| e.to_string())?;
    let mut child = command
        .stdin(Stdio::null())
        .stdout(stdout.try_clone().map_err(|e| e.to_string())?)
        .stderr(stderr.try_clone().map_err(|e| e.to_string())?)
        .spawn()
        .map_err(|e| e.to_string())?;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Compilation timeout".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    use std::io::{Read, Seek, SeekFrom};
    fn bytes(mut file: fs::File) -> Result<Vec<u8>, String> {
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(8_000_001)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 8_000_000 {
            return Err("Compiler output too large".into());
        }
        Ok(bytes)
    }
    Ok(Output {
        status,
        stdout: bytes(stdout)?,
        stderr: bytes(stderr)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compiler_process_deadline() {
        let mut successful = Command::new(if cfg!(windows) { "cmd" } else { "sh" });
        successful.args(if cfg!(windows) {
            vec!["/c", "echo ok"]
        } else {
            vec!["-c", "printf ok"]
        });
        let output = run(&mut successful, Instant::now(), Duration::from_secs(5)).unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), "ok");
        let mut slow = Command::new(if cfg!(windows) { "powershell" } else { "sleep" });
        slow.args(if cfg!(windows) {
            vec!["-NoProfile", "-Command", "Start-Sleep -Seconds 2"]
        } else {
            vec!["2"]
        });
        let started = Instant::now();
        assert_eq!(
            run(&mut slow, started, Duration::from_millis(50)).unwrap_err(),
            "Compilation timeout"
        );
        assert!(started.elapsed() < Duration::from_secs(2));
    }
    #[test]
    fn markdown_blocks_keep_content_and_utf16_ranges() {
        let md="# Name 😀\r\n\r\n## Awards\r\n- **First**  \r\n  continued\r\n- Second\r\n\r\n| Key | Value |\r\n|---|---|\r\n| Skill | Python |\r\n";
        let (code, blocks, _) = document(md);
        for expected in ["Awards", "First", "continued", "Second", "Python"] {
            assert!(code.contains(expected));
        }
        assert!(code.contains("#strong["));
        assert!(code.contains("#table("));
        let units: Vec<u16> = md.encode_utf16().collect();
        for block in blocks {
            assert_eq!(
                String::from_utf16(
                    &units[block["start"].as_u64().unwrap() as usize
                        ..block["end"].as_u64().unwrap() as usize]
                )
                .unwrap(),
                block["raw"].as_str().unwrap()
            );
        }
    }
    #[test]
    fn text_is_escaped_and_code_preserved() {
        let (code, _, _) = document("# Name\n\nValue #text(\"injected\")\n\n```\na_b # x\n```\n");
        assert!(code.contains("a_b # x"));
        assert!(code.contains("\\\"injected\\\""));
    }
    #[test]
    fn citation_text_is_removed_but_source_unchanged() {
        let md = "# Name[cite: 1]\n\n- Item[cite: 1].\n";
        let (code, blocks, _) = document(md);
        assert!(!code.contains("cite:"));
        assert!(blocks[0]["raw"].as_str().unwrap().contains("cite:"));
    }
    #[test]
    fn contact_header_preserves_edit_ranges() {
        let md="# Candidate\n\n- **Email:** person@example.com\n- **Role:** Engineer\n\n## Skills\n- Rust\n- Typst\n";
        let (code, blocks, _) = document(md);
        assert!(code.starts_with("#resume-header("));
        assert!(code.contains("#resume-contacts("));
        assert!(code.contains("#list([#text(\"Rust\")"));
        assert_eq!(blocks[1]["layout"], "contacts");
        assert_eq!(
            blocks[1]["raw"],
            "- **Email:** person@example.com\n- **Role:** Engineer"
        );
        assert!(!roots_are_contacts(
            "- Rust\n- Email service implementation"
        ));
    }
}
