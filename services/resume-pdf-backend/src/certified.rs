//! The v2 path consumes only versioned, authoritative JSON. Legacy Markdown never enters it.
use crate::{hash, permit, ApiError, ApiResult, App};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeSet, HashSet},
    fs,
    path::Path,
    process::Command,
    time::{Duration, Instant},
};
use tiny_http::{Method, Request};
use uuid::Uuid;

pub const RENDERER_VERSION: &str = "certified-typst-v1";
pub const TEMPLATE_VERSION: &str = "resume-typst-v1";
pub const POLICY_VERSION: &str = "certified-resume-v1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Issue {
    pub code: String,
    pub message: String,
    pub field_id: String,
}
pub fn issue(code: &str, message: impl Into<String>, id: &str) -> Issue {
    Issue {
        code: code.into(),
        message: message.into(),
        field_id: id.into(),
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Version {
    pub user: Uuid,
    pub job: Uuid,
    pub generation: Uuid,
    pub revision: i32,
    pub source_import_id: Uuid,
    pub document: Value,
    pub document_hash: String,
    pub source_hash: String,
    pub audit: Value,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Certification {
    pub id: Uuid,
    pub version: Version,
    pub template_id: String,
    pub template_version: String,
    pub renderer_version: String,
    pub policy_version: String,
    pub pdf_sha256: Option<String>,
    pub r2_object_key: Option<String>,
    pub file_size: Option<i32>,
    pub status: String,
    pub issues: Vec<Issue>,
    pub source_map: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    generation_id: Uuid,
    document_revision: i32,
    document_hash: String,
    template_id: String,
}

pub fn canonical_hash(value: &Value) -> String {
    // serde_json's default Map is recursively ordered, and its writer emits compact UTF-8.
    hash(&serde_json::to_vec(value).expect("JSON Value is serializable"))
}
pub fn template_theme(id: &str) -> Option<u64> {
    match id {
        "mit-capd" => Some(2),
        "modern-ivy" => Some(3),
        "minimalist-exec" => Some(5),
        "tech-specialist" => Some(6),
        _ => None,
    }
}
fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
fn rows<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value[key].as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn sha(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

/// Interpret the fixed, embedded JSON Schema rather than accepting a partial UI projection.
fn schema_check(schema: &Value, value: &Value, root: &Value, path: &str, out: &mut Vec<Issue>) {
    let fail =
        |out: &mut Vec<Issue>, message: &str| out.push(issue("document.schema", message, path));
    if let Some(reference) = schema["$ref"].as_str() {
        if let Some(target) = root.pointer(reference.trim_start_matches('#')) {
            schema_check(target, value, root, path, out);
        } else {
            fail(out, "Unknown schema reference");
        }
        return;
    }
    if let Some(alternatives) = schema["anyOf"].as_array() {
        if !alternatives.iter().any(|s| {
            let mut errors = Vec::new();
            schema_check(s, value, root, path, &mut errors);
            errors.is_empty()
        }) {
            fail(out, "Value does not match schema alternatives");
        }
        return;
    }
    let matches_type = |kind: &str| match kind {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "integer" => value.is_i64() || value.is_u64(),
        "null" => value.is_null(),
        _ => false,
    };
    if let Some(kinds) = schema.get("type") {
        let valid = kinds.as_str().map(matches_type).unwrap_or_else(|| {
            kinds
                .as_array()
                .is_some_and(|a| a.iter().any(|s| s.as_str().is_some_and(matches_type)))
        });
        if !valid {
            fail(out, "Invalid JSON field type");
            return;
        }
    }
    if schema
        .get("const")
        .is_some_and(|expected| expected != value)
    {
        fail(out, "Unexpected schema version");
    }
    if schema["enum"]
        .as_array()
        .is_some_and(|allowed| !allowed.contains(value))
    {
        fail(out, "Value is outside the allowed enumeration");
    }
    if let Some(s) = value.as_str() {
        if schema["minLength"]
            .as_u64()
            .is_some_and(|n| s.chars().count() < (n as usize))
        {
            fail(out, "Required string is empty");
        }
        if schema["pattern"].as_str().is_some_and(|pattern| {
            !regex::Regex::new(pattern)
                .expect("fixed schema pattern")
                .is_match(s)
        }) {
            fail(out, "String does not match its schema pattern");
        }
        if s.chars()
            .any(|c| c < ' ' && !matches!(c, '\n' | '\r' | '\t'))
            || s.contains('\u{fffd}')
        {
            fail(out, "Unsupported control or replacement character");
        }
    }
    if let Some(n) = value.as_i64() {
        if schema["minimum"].as_i64().is_some_and(|min| n < min) {
            fail(out, "Integer is below its minimum");
        }
    }
    if let Some(object) = value.as_object() {
        for required in schema["required"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            if !object.contains_key(required) {
                out.push(issue(
                    "document.schema",
                    "Required field is absent",
                    &format!("{path}.{required}"),
                ));
            }
        }
        for (key, item) in object {
            let child = format!("{path}.{key}");
            if let Some(s) = schema["properties"].get(key) {
                schema_check(s, item, root, &child, out);
            } else if schema["additionalProperties"] == false {
                out.push(issue("document.schema", "Unknown field", &child));
            }
        }
    }
    if let Some(items) = value.as_array() {
        if schema["minItems"]
            .as_u64()
            .is_some_and(|n| items.len() < (n as usize))
            || schema["maxItems"]
                .as_u64()
                .is_some_and(|n| items.len() > (n as usize))
        {
            fail(out, "Array length is outside schema bounds");
        }
        if let Some(item_schema) = schema.get("items") {
            for (i, item) in items.iter().enumerate() {
                schema_check(item_schema, item, root, &format!("{path}.{i}"), out);
            }
        }
    }
}
struct ProvenanceField<'a> {
    id: String,
    value: &'a Value,
    role: Option<&'a str>,
    block: bool,
}
fn provenance_fields(doc: &Value) -> Vec<ProvenanceField<'_>> {
    let mut out = Vec::new();
    let p = &doc["personalInfo"];
    for (key, value) in p.as_object().into_iter().flatten() {
        if key != "id" {
            out.push(ProvenanceField {
                id: format!("{}.{key}", text(p, "id")),
                value,
                role: None,
                block: false,
            });
        }
    }
    for block in rows(doc, "summary") {
        out.push(ProvenanceField {
            id: text(block, "id").into(),
            value: block,
            role: None,
            block: true,
        });
    }
    for (section, body) in [
        ("skills", "items"),
        ("experience", "bullets"),
        ("projects", "bullets"),
        ("education", "details"),
        ("additionalSections", "items"),
    ] {
        for group in rows(doc, section) {
            let role = if section == "experience" || section == "projects" {
                Some(text(group, "id"))
            } else {
                None
            };
            for (key, value) in group.as_object().into_iter().flatten() {
                if key != "id" && key != body {
                    out.push(ProvenanceField {
                        id: format!("{}.{key}", text(group, "id")),
                        value,
                        role,
                        block: false,
                    });
                }
            }
            for block in rows(group, body) {
                out.push(ProvenanceField {
                    id: text(block, "id").into(),
                    value: block,
                    role,
                    block: true,
                });
            }
        }
    }
    out
}
fn stable_schema_field(doc: &Value, path: &str) -> String {
    let parts: Vec<_> = path.trim_start_matches("document.").split('.').collect();
    let key = parts.first().copied().unwrap_or("document");
    if key == "personalInfo" {
        let id = text(&doc[key], "id");
        return if id.is_empty() {
            "personalInfo".into()
        } else if let Some(field) = parts.get(1) {
            format!("{id}.{field}")
        } else {
            id.into()
        };
    }
    if key == "evidence" {
        if let Some(e) = parts
            .get(1)
            .and_then(|n| n.parse::<usize>().ok())
            .and_then(|i| rows(doc, key).get(i))
        {
            return text(e, "fieldId").into();
        }
    }
    if [
        "summary",
        "skills",
        "experience",
        "projects",
        "education",
        "additionalSections",
    ]
    .contains(&key)
    {
        if let Some(entry) = parts
            .get(1)
            .and_then(|n| n.parse::<usize>().ok())
            .and_then(|i| rows(doc, key).get(i))
        {
            let id = text(entry, "id");
            if !id.is_empty() {
                if key == "summary" {
                    return id.into();
                }
                if let Some(field) = parts.get(2) {
                    if ["items", "bullets", "details"].contains(field) {
                        return parts
                            .get(3)
                            .and_then(|n| n.parse::<usize>().ok())
                            .and_then(|i| rows(entry, field).get(i))
                            .map(|b| text(b, "id"))
                            .filter(|id| !id.is_empty())
                            .unwrap_or(id)
                            .into();
                    }
                    return format!("{id}.{field}");
                }
                return id.into();
            }
        }
        return key.into();
    }
    if key == "source" || key == "sectionOrder" {
        key.into()
    } else {
        "document".into()
    }
}
pub fn validate_document(doc: &Value) -> Vec<Issue> {
    let schema: Value = serde_json::from_str(include_str!("../resume-document-v1.schema.json"))
        .expect("embedded fixed schema");
    let mut issues = Vec::new();
    schema_check(&schema, doc, &schema, "document", &mut issues);
    for issue in &mut issues {
        issue.field_id = stable_schema_field(doc, &issue.field_id);
    }
    if !issues.is_empty() {
        return issues;
    }
    if serde_json::to_vec(doc).map_or(true, |bytes| bytes.len() > 1_000_000) {
        return vec![issue(
            "document.size",
            "Canonical document exceeds its publication size limit",
            "document",
        )];
    }
    let fields = provenance_fields(doc);
    let mut ids = HashSet::new();
    fn collect_ids(value: &Value, ids: &mut HashSet<String>, issues: &mut Vec<Issue>) {
        if let Some(object) = value.as_object() {
            for (k, v) in object {
                if k == "id" {
                    let id = v.as_str().unwrap_or("");
                    if !ids.insert(id.into()) {
                        issues.push(issue(
                            "document.duplicate_id",
                            "Stable IDs must be unique",
                            id,
                        ));
                    }
                } else {
                    collect_ids(v, ids, issues);
                }
            }
        } else if let Some(items) = value.as_array() {
            for item in items {
                collect_ids(item, ids, issues);
            }
        }
    }
    collect_ids(&doc["personalInfo"], &mut ids, &mut issues);
    for section in [
        "summary",
        "skills",
        "experience",
        "projects",
        "education",
        "additionalSections",
    ] {
        collect_ids(&doc[section], &mut ids, &mut issues);
    }
    let evidence_ids: HashSet<_> = rows(doc, "evidence")
        .iter()
        .map(|e| text(e, "id"))
        .collect();
    if evidence_ids.len() != rows(doc, "evidence").len() {
        issues.push(issue(
            "document.evidence",
            "Evidence IDs must be unique",
            "evidence",
        ));
    }
    for field in &fields {
        if field.block {
            let refs = rows(field.value, "evidenceIds");
            let unique: HashSet<_> = refs.iter().filter_map(Value::as_str).collect();
            if refs.is_empty()
                || unique.len() != refs.len()
                || refs.iter().any(|id| {
                    !rows(doc, "evidence")
                        .iter()
                        .any(|e| e["id"] == *id && text(e, "fieldId") == field.id)
                })
            {
                issues.push(issue(
                    "document.evidence",
                    "Display blocks require unique evidence belonging to their own field",
                    &field.id,
                ));
            }
        } else if (field.value.as_str().is_some_and(|s| !s.is_empty())
            || field.value.as_array().is_some_and(|a| !a.is_empty()))
            && !rows(doc, "evidence")
                .iter()
                .any(|e| text(e, "fieldId") == field.id)
        {
            issues.push(issue(
                "document.evidence",
                "Display field has no source evidence",
                &field.id,
            ));
        }
    }
    for evidence in rows(doc, "evidence") {
        let field_id = text(evidence, "fieldId");
        let owner = fields.iter().find(|f| f.id == field_id);
        if owner.is_none() {
            issues.push(issue(
                "document.evidence",
                "Evidence field does not exist",
                field_id,
            ));
        }
        if let Some(owner) = owner {
            if owner
                .role
                .is_some_and(|role| evidence["roleId"].as_str() != Some(role))
                || (!owner.block && owner.role.is_none() && !evidence["roleId"].is_null())
            {
                issues.push(issue(
                    "document.evidence",
                    "Evidence belongs to another role",
                    field_id,
                ));
            }
        }
        let start = evidence["spanStart"].as_u64().unwrap();
        let end = evidence["spanEnd"].as_u64().unwrap();
        if end < start
            || end - start != text(evidence, "sourceSpan").chars().count() as u64
            || text(evidence, "sourceSpan").is_empty()
        {
            issues.push(issue(
                "document.evidence",
                "Evidence offsets must describe their exact nonempty source span",
                field_id,
            ));
        }
        if let Some(b) = evidence["box"].as_array() {
            if b[2].as_u64() <= b[0].as_u64() || b[3].as_u64() <= b[1].as_u64() {
                issues.push(issue(
                    "document.evidence",
                    "Invalid source geometry",
                    field_id,
                ));
            }
        }
        if evidence["page"].is_null() != evidence["box"].is_null() {
            issues.push(issue(
                "document.evidence",
                "Evidence page and geometry must both be present or absent",
                field_id,
            ));
        }
    }
    let sections = section_ids(doc);
    let order: Vec<_> = rows(doc, "sectionOrder")
        .iter()
        .filter_map(Value::as_str)
        .collect();
    if order.len() != order.iter().collect::<HashSet<_>>().len()
        || order.iter().any(|s| !sections.contains(*s))
        || sections.iter().any(|s| !order.contains(&s.as_str()))
    {
        issues.push(issue(
            "document.section_order",
            "Every present section must appear exactly once",
            "sectionOrder",
        ));
    }
    issues
}
fn section_ids(doc: &Value) -> BTreeSet<String> {
    let mut result = BTreeSet::new();
    for key in ["summary", "skills", "experience", "projects", "education"] {
        if !rows(doc, key).is_empty() {
            result.insert(key.into());
        }
    }
    for section in rows(doc, "additionalSections") {
        result.insert(text(section, "id").into());
    }
    result
}

/// The audit is data, never an authorization from a human-review status.
fn supported_title(source: &Value, field: &str, value: &str) -> bool {
    let wanted = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if wanted.is_empty() {
        return false;
    }
    rows(source, "evidence")
        .iter()
        .filter(|e| text(e, "fieldId") == field)
        .any(|e| {
            let span = text(e, "sourceSpan")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            span.match_indices(&wanted).any(|(start, _)| {
                let end = start + wanted.len();
                !span[..start]
                    .chars()
                    .last()
                    .is_some_and(|c| c.is_alphanumeric() || c == '_')
                    && !span[end..]
                        .chars()
                        .next()
                        .is_some_and(|c| c.is_alphanumeric() || c == '_')
            })
        })
}
pub fn version_issues(version: &Version) -> Vec<Issue> {
    let mut result = validate_document(&version.document);
    if canonical_hash(&version.document) != version.document_hash {
        result.push(issue(
            "document.hash",
            "Stored document hash does not match canonical JSON",
            "document",
        ));
    }
    if text(&version.document, "id") != version.generation.to_string()
        || version.document["revision"].as_i64() != Some(version.revision as i64)
        || text(&version.document["source"], "revision") != version.source_import_id.to_string()
    {
        result.push(issue(
            "document.identity",
            "Document identity or source revision does not match its authoritative row",
            "document",
        ));
    }
    let source = &version.audit["source_document"];
    if source.is_null()
        || !validate_document(source).is_empty()
        || canonical_hash(source) != version.source_hash
        || source["source"] != version.document["source"]
    {
        result.push(issue(
            "audit.source",
            "Validated canonical source and hash are required",
            "source",
        ));
    }
    let baseline = &version.audit["resume_document"];
    if baseline.is_null()
        || !validate_document(baseline).is_empty()
        || text(baseline, "id") != version.generation.to_string()
        || baseline["source"] != source["source"]
    {
        result.push(issue("audit.baseline","A validated factual baseline bound to this generation and confirmed source is required","audit"));
    }
    for evidence in rows(source, "evidence") {
        if text(evidence, "origin") == "pdf"
            && (evidence["page"].is_null() || evidence["box"].is_null())
        {
            result.push(issue(
                "audit.source_geometry",
                "Confirmed PDF source evidence requires its original page and box",
                text(evidence, "fieldId"),
            ));
        }
    }
    let mut protected_info = version.document["personalInfo"].clone();
    let mut source_info = source["personalInfo"].clone();
    if let Some(object) = protected_info.as_object_mut() {
        object.remove("title");
    }
    if let Some(object) = source_info.as_object_mut() {
        object.remove("title");
    }
    if source_info != protected_info {
        result.push(issue(
            "document.protected",
            "Identity and contact fields must match the confirmed source",
            "personalInfo",
        ));
    }
    for (section, keys) in [
        ("experience", &["company", "location", "duration"][..]),
        (
            "education",
            &["institution", "degree", "location", "duration"][..],
        ),
    ] {
        if rows(source, section).len() != rows(&version.document, section).len() {
            result.push(issue(
                "document.protected",
                "Every protected source entry must be retained",
                section,
            ));
        }
        for entry in rows(source, section) {
            let id = text(entry, "id");
            let current = rows(&version.document, section)
                .iter()
                .find(|e| text(e, "id") == id);
            for key in keys {
                if current.is_none_or(|e| e[*key] != entry[*key]) {
                    result.push(issue(
                        "document.protected",
                        "Protected source field was changed or removed",
                        &format!("{id}.{key}"),
                    ));
                }
            }
        }
    }
    let personal_field = format!("{}.title", text(&version.document["personalInfo"], "id"));
    if version.document["personalInfo"]["title"] != source["personalInfo"]["title"]
        && !supported_title(
            source,
            &personal_field,
            text(&version.document["personalInfo"], "title"),
        )
    {
        result.push(issue(
            "claim.uncertain",
            "Changed title is not supported by its original source field",
            &personal_field,
        ));
    }
    for (section, title) in [("experience", "role"), ("projects", "title")] {
        for entry in rows(&version.document, section) {
            let id = text(entry, "id");
            let original = rows(source, section).iter().find(|e| text(e, "id") == id);
            let field = format!("{id}.{title}");
            if original.is_none_or(|o| o[title] != entry[title])
                && !supported_title(source, &field, text(entry, title))
            {
                result.push(issue(
                    "claim.uncertain",
                    "Changed title is not supported by its original source field",
                    &field,
                ));
            }
            if section == "projects" {
                for key in ["duration", "technologies"] {
                    if original.is_none_or(|o| o[key] != entry[key]) {
                        result.push(issue(
                            "document.protected",
                            "Project dates and technology claims must match their confirmed source",
                            &format!("{id}.{key}"),
                        ));
                    }
                }
            }
        }
    }
    result.extend(audit_issues(&version.audit));
    result
}
pub fn audit_issues(audit: &Value) -> Vec<Issue> {
    let mut result = Vec::new();
    if !["completed", "completed_with_estimates"].contains(&text(audit, "status")) {
        result.push(issue(
            "audit.status",
            "Required validation must complete successfully before publication",
            "audit",
        ));
    }
    let ledger = rows(audit, "compliance_ledger");
    if ledger.is_empty() {
        result.push(issue(
            "audit.missing",
            "Required compliance ledger is missing",
            "audit",
        ));
    }
    for name in ["schema", "source", "factual"] {
        if audit["certificationChecks"][name] != true {
            result.push(issue(
                "audit.missing",
                format!("Required check did not pass: {name}"),
                "audit",
            ));
        }
    }
    for check in ledger {
        if text(check, "code").is_empty()
            || !check["passed"].is_boolean()
            || !["error", "warning", "info"].contains(&text(check, "severity"))
            || (check["passed"] != true && text(check, "severity") == "error")
        {
            result.push(issue(
                "audit.failed",
                format!("Compliance check did not pass: {}", text(check, "code")),
                check["field_id"]
                    .as_str()
                    .or(check["field_path"].as_str())
                    .unwrap_or("audit"),
            ));
        }
    }
    result
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    pub id: String,
    pub text: String,
    pub kind: String,
    pub min_pt: i32,
    pub link: Option<String>,
    pub role_id: Option<String>,
}
fn contact_link(key: &str, value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    match key {
        "email" => Some(format!("mailto:{value}")),
        "phone" => Some(format!(
            "tel:{}",
            value
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '+')
                .collect::<String>()
        )),
        "linkedin" | "github" => Some(
            if value.starts_with("https://") || value.starts_with("http://") {
                value.into()
            } else {
                format!("https://{value}")
            },
        ),
        _ => {
            if value.starts_with("https://") || value.starts_with("http://") {
                Some(value.into())
            } else {
                None
            }
        }
    }
}
fn add_field(
    out: &mut Vec<Field>,
    id: String,
    value: &str,
    kind: &str,
    min_pt: i32,
    link: Option<String>,
    role: Option<&str>,
) {
    if !value.trim().is_empty() {
        out.push(Field {
            id,
            text: value.into(),
            kind: kind.into(),
            min_pt,
            link,
            role_id: role.map(str::to_owned),
        });
    }
}
pub fn fields(doc: &Value) -> Vec<Field> {
    let mut out = Vec::new();
    let p = &doc["personalInfo"];
    let pid = text(p, "id");
    add_field(
        &mut out,
        format!("{pid}.name"),
        text(p, "name"),
        "name",
        10,
        None,
        None,
    );
    for key in ["title", "email", "phone", "linkedin", "github", "location"] {
        add_field(
            &mut out,
            format!("{pid}.{key}"),
            text(p, key),
            "contact",
            9,
            contact_link(key, text(p, key)),
            None,
        );
    }
    for (i, value) in rows(p, "extraContacts").iter().enumerate() {
        let value = value.as_str().unwrap_or("");
        add_field(
            &mut out,
            format!("{pid}.extraContacts.{i}"),
            value,
            "contact",
            9,
            contact_link("extra", value),
            None,
        );
    }
    for section in rows(doc, "sectionOrder").iter().filter_map(Value::as_str) {
        let title = match section {
            "summary" => "Summary",
            "skills" => "Skills",
            "experience" => "Experience",
            "projects" => "Projects",
            "education" => "Education",
            _ => rows(doc, "additionalSections")
                .iter()
                .find(|s| text(s, "id") == section)
                .map(|s| text(s, "title"))
                .unwrap_or(""),
        };
        add_field(
            &mut out,
            format!("section.{section}"),
            title,
            "section",
            10,
            None,
            None,
        );
        match section {
            "summary" => {
                for block in rows(doc, section) {
                    add_field(
                        &mut out,
                        text(block, "id").into(),
                        text(block, "text"),
                        "body",
                        10,
                        None,
                        None,
                    );
                }
            }
            "skills" => {
                for group in rows(doc, section) {
                    add_field(
                        &mut out,
                        format!("{}.category", text(group, "id")),
                        text(group, "category"),
                        "body",
                        10,
                        None,
                        None,
                    );
                    for block in rows(group, "items") {
                        add_field(
                            &mut out,
                            text(block, "id").into(),
                            text(block, "text"),
                            "skill",
                            10,
                            None,
                            None,
                        );
                    }
                }
            }
            "experience" | "projects" | "education" => {
                for entry in rows(doc, section) {
                    let id = text(entry, "id");
                    let keys: &[&str] = match section {
                        "experience" => &["role", "company", "location", "duration"],
                        "projects" => &["title", "duration"],
                        _ => &["institution", "location", "degree", "duration"],
                    };
                    for key in keys {
                        add_field(
                            &mut out,
                            format!("{id}.{key}"),
                            text(entry, key),
                            if *key == "duration" { "date" } else { "entry" },
                            if *key == "duration" { 9 } else { 10 },
                            None,
                            Some(id),
                        );
                    }
                    if section == "projects" {
                        for (i, t) in rows(entry, "technologies").iter().enumerate() {
                            add_field(
                                &mut out,
                                format!("{id}.technologies.{i}"),
                                t.as_str().unwrap_or(""),
                                "body",
                                10,
                                None,
                                Some(id),
                            );
                        }
                    }
                    for block in rows(
                        entry,
                        if section == "education" {
                            "details"
                        } else {
                            "bullets"
                        },
                    ) {
                        add_field(
                            &mut out,
                            text(block, "id").into(),
                            text(block, "text"),
                            "bullet",
                            10,
                            None,
                            Some(id),
                        );
                    }
                }
            }
            _ => {
                if let Some(s) = rows(doc, "additionalSections")
                    .iter()
                    .find(|s| text(s, "id") == section)
                {
                    for block in rows(s, "items") {
                        add_field(
                            &mut out,
                            text(block, "id").into(),
                            text(block, "text"),
                            "body",
                            10,
                            None,
                            None,
                        );
                    }
                }
            }
        }
    }
    out
}
fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}
fn literal(s: &str) -> String {
    format!("#text({})", quote(s))
}
fn field_code(field: &Field) -> String {
    let body = if let Some(link) = &field.link {
        format!("#link({})[{}]", quote(link), literal(&field.text))
    } else {
        literal(&field.text)
    };
    format!("#tracked({})[{}]", quote(&field.id), body)
}
fn canonical_code(doc: &Value, breaks: &HashSet<String>) -> (String, Vec<Field>) {
    let all = fields(doc);
    let mut code = String::new();
    let name = all
        .iter()
        .find(|f| f.kind == "name")
        .map(|f| format!("#heading(level:1)[{}]", field_code(f)))
        .unwrap_or_default();
    let contacts = all
        .iter()
        .filter(|f| f.kind == "contact")
        .map(|f| format!("[{}]", field_code(f)))
        .collect::<Vec<_>>()
        .join(",");
    code.push_str(&format!(
        "#resume-header(name:[{name}],contacts:[#resume-contacts({contacts})])\n\n"
    ));
    for field in all
        .iter()
        .filter(|f| !matches!(f.kind.as_str(), "name" | "contact"))
    {
        if breaks.contains(&field.id) {
            code.push_str("#pagebreak(weak:true)\n");
        }
        let body = field_code(field);
        match field.kind.as_str() {
            "section" => code.push_str(&format!("#heading(level:2)[{body}]\n\n")),
            "entry" => code.push_str(&format!(
                "#block(sticky:true,below:2pt)[#text(weight:\"bold\")[{body}]]\n\n"
            )),
            "date" => code.push_str(&format!(
                "#block(sticky:true,below:2pt)[#text(size:9pt)[{body}]]\n\n"
            )),
            "bullet" => code.push_str(&format!("#list([{body}])\n\n")),
            _ => code.push_str(&format!("#block(below:3pt)[{body}]\n\n")),
        }
    }
    (code, all)
}
fn positions(markers: &[Value], fields: &[Field]) -> Result<Value, String> {
    let mut result = Vec::new();
    for field in fields {
        let mut item = serde_json::to_value(field).unwrap();
        let mut edges = json!({});
        for marker in markers.iter().filter(|m| m["id"] == field.id) {
            let mut p = marker["position"].clone();
            for axis in ["x", "y"] {
                let n = p[axis]
                    .as_str()
                    .ok_or("Invalid source coordinate")?
                    .trim_end_matches("pt")
                    .parse::<f64>()
                    .map_err(|e| e.to_string())?;
                if !n.is_finite() {
                    return Err("Invalid source coordinate".into());
                }
                p[axis] = json!((n * 1000.0).round() as i64);
            }
            edges[marker["edge"].as_str().ok_or("Invalid source marker")?] = p;
        }
        if edges.get("start").is_none() || edges.get("end").is_none() {
            return Err(format!("Missing source marker {}", field.id));
        }
        item["positions"] = edges;
        result.push(item);
    }
    Ok(json!(result))
}
pub struct Rendered {
    pub bytes: Vec<u8>,
    pub source_map: Value,
    pub issues: Vec<Issue>,
}
pub fn compile(root: &Path, doc: &Value, theme: u64) -> Result<Rendered, String> {
    let template = fs::read_to_string(root.join("resume.typ")).map_err(|e| e.to_string())?;
    let work = tempfile::tempdir().map_err(|e| e.to_string())?;
    let source = work.path().join("resume.typ");
    let output = work.path().join("resume.pdf");
    let manifest = work.path().join("manifest.json");
    let local = root.join("typst.exe");
    let typst = if local.exists() {
        local.into_os_string()
    } else {
        std::env::var_os("TYPST_BIN").unwrap_or_else(|| "typst".into())
    };
    let python = std::env::var_os("PDF_CHECKER_PYTHON").unwrap_or_else(|| "python3".into());
    let mut breaks = HashSet::new();
    for attempt in 0..=1 {
        let (body, mut fields) = canonical_code(doc, &breaks);
        if theme != 2 {
            for field in &mut fields {
                if field.kind == "section" {
                    field.text = field.text.to_uppercase();
                }
            }
        }
        fs::write(
            &source,
            format!("{template}\n#set text(hyphenate:false,ligatures:false)\n{body}"),
        )
        .map_err(|e| e.to_string())?;
        let start = Instant::now();
        let timeout = Duration::from_secs(90);
        let compiled = crate::render::run(
            Command::new(&typst)
                .args([
                    "compile",
                    "--creation-timestamp",
                    "0",
                    "--input",
                    &format!("theme={theme}"),
                ])
                .arg(&source)
                .arg(&output),
            start,
            timeout,
        )?;
        if !compiled.status.success() {
            return Err(String::from_utf8_lossy(&compiled.stderr).into());
        }
        let diagnostics = String::from_utf8_lossy(&compiled.stderr).to_lowercase();
        if diagnostics.contains("does not have a glyph")
            || diagnostics.contains("missing glyph")
            || diagnostics.contains("cannot fit")
            || diagnostics.contains("overfull")
        {
            return Ok(Rendered {
                bytes: Vec::new(),
                source_map: json!([]),
                issues: vec![issue(
                    "pdf.glyph_or_fit",
                    "Compiler reported missing glyphs or content that does not fit",
                    "document",
                )],
            });
        }
        let queried = crate::render::run(
            Command::new(&typst)
                .args(["eval", "query(<resume-source>).map(it => it.value)", "--in"])
                .arg(&source)
                .args(["--input", &format!("theme={theme}"), "--format", "json"]),
            start,
            timeout,
        )?;
        if !queried.status.success() {
            return Err(String::from_utf8_lossy(&queried.stderr).into());
        }
        let markers: Vec<Value> =
            serde_json::from_slice(&queried.stdout).map_err(|e| e.to_string())?;
        let source_map = positions(&markers, &fields)?;
        fs::write(
            &manifest,
            serde_json::to_vec(&json!({"fields":fields,"sourceMap":source_map})).unwrap(),
        )
        .map_err(|e| e.to_string())?;
        let checked = crate::render::run(
            Command::new(&python)
                .env("PYTHONUTF8", "1")
                .env("PYTHONIOENCODING", "utf-8")
                .arg(root.join("validate_pdf.py"))
                .arg(&output)
                .arg(&manifest),
            start,
            timeout,
        )?;
        if !checked.status.success() {
            return Err(format!(
                "Final PDF checker unavailable or failed: {}",
                String::from_utf8_lossy(&checked.stderr)
            ));
        }
        let result: Value = serde_json::from_slice(&checked.stdout).map_err(|e| e.to_string())?;
        let issues: Vec<Issue> =
            serde_json::from_value(result["issues"].clone()).map_err(|e| e.to_string())?;
        if attempt == 0
            && !issues.is_empty()
            && issues.iter().all(|i| i.code == "pdf.orphan_heading")
        {
            breaks.extend(issues.iter().map(|i| i.field_id.clone()));
            continue;
        }
        let bytes = fs::read(&output).map_err(|e| e.to_string())?;
        if bytes.len() > 16_000_000 || !bytes.starts_with(b"%PDF-") {
            return Err("Invalid or oversized PDF".into());
        }
        return Ok(Rendered {
            bytes,
            source_map: result["sourceMap"].clone(),
            issues,
        });
    }
    unreachable!("bounded pagination loop returns")
}

fn response(cert: &Certification) -> Value {
    json!({"documentRevision":cert.version.revision,"publicationStatus":cert.status,"issues":cert.issues,"artifactId":if cert.status=="ready"{Some(cert.id)}else{None},"pdfSha256":cert.pdf_sha256,"documentHash":cert.version.document_hash})
}
fn blocked(version: Version, template: &str, issues: Vec<Issue>) -> Certification {
    Certification {
        id: Uuid::new_v4(),
        version,
        template_id: template.into(),
        template_version: TEMPLATE_VERSION.into(),
        renderer_version: RENDERER_VERSION.into(),
        policy_version: POLICY_VERSION.into(),
        pdf_sha256: None,
        r2_object_key: None,
        file_size: None,
        status: "blocked".into(),
        issues,
        source_map: json!([]),
    }
}
fn query(request: &Request) -> ApiResult<std::collections::BTreeMap<String, String>> {
    let mut out = std::collections::BTreeMap::new();
    for pair in request
        .url()
        .split_once('?')
        .map(|(_, q)| q)
        .unwrap_or("")
        .split('&')
        .filter(|p| !p.is_empty())
    {
        let (k, v) = pair
            .split_once('=')
            .ok_or(ApiError::new(400, "Invalid query"))?;
        if out.insert(k.into(), v.into()).is_some() {
            return Err(ApiError::new(400, "Repeated query parameter"));
        }
    }
    Ok(out)
}
pub fn route(
    request: &mut Request,
    app: &App,
    user: Uuid,
    parts: &[&str],
) -> ApiResult<(&'static str, Vec<u8>)> {
    if std::env::var("CERTIFIED_PUBLICATION_ENABLED").as_deref() != Ok("true") {
        return Err(ApiError::new(404, "Certified publication is disabled"));
    }
    let job = Uuid::parse_str(parts.get(3).copied().unwrap_or(""))
        .map_err(|_| ApiError::new(400, "Invalid job ID"))?;
    let params = query(request)?;
    if parts.len() == 7
        && parts[4] == "artifacts"
        && parts[6] == "pdf"
        && request.method() == &Method::Get
    {
        if params.iter().any(|(k, v)| k != "download" || v != "1") {
            return Err(ApiError::new(400, "Invalid download query"));
        }
        let id =
            Uuid::parse_str(parts[5]).map_err(|_| ApiError::new(400, "Invalid artifact ID"))?;
        let record = app.store.certification(user, job, id)?;
        let expected = format!("resumes/{user}/{job}/certified/{id}.pdf");
        if record.status != "ready"
            || !record.issues.is_empty()
            || record.r2_object_key.as_deref() != Some(&expected)
            || record.template_version != TEMPLATE_VERSION
            || record.renderer_version != RENDERER_VERSION
            || record.policy_version != POLICY_VERSION
            || !version_issues(&record.version).is_empty()
        {
            return Err(ApiError::new(409, "Certification is stale or blocked"));
        }
        let bytes = app.store.get(&expected)?;
        if record.file_size != i32::try_from(bytes.len()).ok()
            || record.pdf_sha256.as_deref() != Some(hash(&bytes).as_str())
        {
            return Err(ApiError::new(502, "Stored PDF integrity check failed"));
        }
        // Fetching bytes can take time; reread current proof after the private object read too.
        let proof = app.store.certification(user, job, id)?;
        if serde_json::to_value(&proof).unwrap() != serde_json::to_value(&record).unwrap() {
            return Err(ApiError::new(409, "Certification changed during download"));
        }
        return Ok(("application/pdf", bytes));
    }
    if parts.len() != 5 {
        return Err(ApiError::new(404, "Unknown certified API route"));
    }
    let input = if parts[4] == "preview" && request.method() == &Method::Post {
        if !params.is_empty() {
            return Err(ApiError::new(400, "Unexpected preview query"));
        }
        let bytes = crate::body_bytes(request)?;
        serde_json::from_slice::<Input>(&bytes)
            .map_err(|_| ApiError::new(400, "Invalid certified preview JSON"))?
    } else if parts[4] == "publication" && request.method() == &Method::Get {
        if params.len() != 3
            || params
                .keys()
                .any(|k| !["generationId", "documentRevision", "templateId"].contains(&k.as_str()))
        {
            return Err(ApiError::new(
                400,
                "Publication requires generationId, documentRevision and templateId",
            ));
        }
        Input {
            generation_id: params
                .get("generationId")
                .and_then(|v| Uuid::parse_str(v).ok())
                .ok_or(ApiError::new(400, "Invalid generation ID"))?,
            document_revision: params
                .get("documentRevision")
                .and_then(|v| v.parse().ok())
                .ok_or(ApiError::new(400, "Invalid revision"))?,
            template_id: params.get("templateId").cloned().unwrap(),
            document_hash: String::new(),
        }
    } else {
        return Err(ApiError::new(
            405,
            "Method or certified API route not supported",
        ));
    };
    let theme = template_theme(&input.template_id)
        .ok_or(ApiError::new(400, "Unsupported certified template"))?;
    if input.document_revision < 1
        || (request.method() == &Method::Post && !sha(&input.document_hash))
    {
        return Err(ApiError::new(400, "Invalid document revision or hash"));
    }
    let version =
        app.store
            .document_version(user, job, input.generation_id, input.document_revision)?;
    if request.method() == &Method::Post && version.document_hash != input.document_hash {
        return Err(ApiError::new(
            409,
            "Document changed; reload before preview",
        ));
    }
    if request.method() == &Method::Get {
        let result = if let Some(cert) = app.store.publication(&version, &input.template_id)? {
            response(&cert)
        } else {
            let mut issues = version_issues(&version);
            if issues.is_empty() {
                issues.push(issue(
                    "publication.required",
                    "Current document has no certified PDF",
                    "document",
                ));
            }
            response(&blocked(version, &input.template_id, issues))
        };
        return Ok(("application/json", serde_json::to_vec(&result).unwrap()));
    }
    let issues = version_issues(&version);
    let mut cert = blocked(version, &input.template_id, issues);
    if cert.issues.is_empty() {
        let _permit = permit(&app.compiling, app.max_compiles)?;
        #[cfg(feature = "local-test")]
        if let Ok(root) = std::env::var("TEST_STORE_ROOT") {
            let _ = fs::write(
                std::path::PathBuf::from(root).join("compile-started"),
                &cert.version.document_hash,
            );
        }
        match compile(&app.root, &cert.version.document, theme) {
            Ok(rendered) => {
                cert.issues = rendered.issues;
                cert.source_map = rendered.source_map;
                if cert.issues.is_empty() {
                    let key = format!("resumes/{user}/{job}/certified/{}.pdf", cert.id);
                    cert.pdf_sha256 = Some(hash(&rendered.bytes));
                    cert.file_size = Some(
                        i32::try_from(rendered.bytes.len())
                            .map_err(|_| ApiError::new(422, "PDF too large"))?,
                    );
                    app.store.stage_certified(&key, &rendered.bytes)?;
                    cert.r2_object_key = Some(key);
                    cert.status = "ready".into();
                }
            }
            Err(error) => {
                #[cfg(feature = "local-test")]
                eprintln!("Certified fixture render failed: {error}");
                #[cfg(not(feature = "local-test"))]
                let _ = error;
                cert.issues.push(issue(
                    "pdf.validation_unavailable",
                    "Required renderer or final PDF validation failed; retry after service repair",
                    "document",
                ));
            }
        }
    }
    app.store.publish_certification(&cert)?;
    Ok((
        "application/json",
        serde_json::to_vec(&response(&cert)).unwrap(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hashes_and_boundary() {
        assert_eq!(
            canonical_hash(&json!({"z":"é","a":{"b":1,"a":2}})),
            hash("{\"a\":{\"a\":2,\"b\":1},\"z\":\"é\"}".as_bytes())
        );
        assert!(!validate_document(&json!({"schemaVersion":"ResumeDocumentV1"})).is_empty());
        assert!(!audit_issues(&json!({"certificationChecks":{"schema":true,"source":true,"factual":true},"compliance_ledger":[{"code":"factual","passed":false,"severity":"error","waiver":"human_review"}],"status":"human_review"})).is_empty());
        assert!(!audit_issues(
            &json!({"compliance_ledger":[{"code":"other","passed":true,"severity":"error"}]})
        )
        .is_empty());
        assert!(serde_json::from_value::<Input>(json!({"generationId":Uuid::new_v4(),"documentRevision":1,"documentHash":"a".repeat(64),"templateId":"mit-capd","document":{}})).is_err());
    }
    #[test]
    fn canonical_provenance_boundaries() {
        let fixture: Value =
            serde_json::from_str(include_str!("../tests/canonical-fixture.json")).unwrap();
        let doc = &fixture["document"];
        assert!(
            validate_document(doc).is_empty(),
            "{:?}",
            validate_document(doc)
        );
        assert!(validate_document(&fixture["source"]).is_empty());
        assert!(supported_title(
            &fixture["source"],
            "personal.title",
            "Engineer"
        ));
        assert!(!supported_title(
            &fixture["source"],
            "personal.title",
            "Staff Engineer"
        ));
        let mut invalid = doc.clone();
        invalid["skills"][0]["category"] = json!(true);
        assert!(validate_document(&invalid)
            .iter()
            .any(|i| i.field_id == "skills-1.category"));
        let mut invalid = doc.clone();
        invalid["experience"][0]["bullets"][0]["evidenceIds"] = json!([]);
        assert!(!validate_document(&invalid).is_empty());
        let mut invalid = doc.clone();
        invalid["evidence"][0]["spanEnd"] = json!(999);
        assert!(!validate_document(&invalid).is_empty());
        let mut invalid = doc.clone();
        invalid["evidence"][0]["roleId"] = json!("role-1");
        assert!(!validate_document(&invalid).is_empty());
        let mut invalid = doc.clone();
        invalid["evidence"]
            .as_array_mut()
            .unwrap()
            .retain(|e| text(e, "fieldId") != "skills-1.category");
        assert!(!validate_document(&invalid).is_empty());
    }
}
