use regex::Regex;
use serde::Serialize;

pub const VERSION: &str = "experience-details-v7";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Requirement {
    pub minimum_months: f64,
    pub maximum_months: Option<f64>,
    pub kind: &'static str,
    pub condition: Option<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Extraction {
    pub years: Option<i32>,
    pub minimum_months: Option<f64>,
    pub evidence: Vec<String>,
    pub reason: &'static str,
    pub requirements: Vec<Requirement>,
}

pub struct Extractor {
    quantities: Regex,
    experience: Regex,
    preferred: Regex,
    preferred_heading: Regex,
    required_heading: Regex,
    excluded_heading: Regex,
    required: Regex,
    unrelated: Regex,
    non_experience_tail: Regex,
    degree: Regex,
    education_alternative: Regex,
    alternative_label: Regex,
    bullet: Regex,
    sentence: Regex,
    zero: Regex,
    negated: Regex,
    activity: Regex,
    blocks: Regex,
    tags: Regex,
    joined: Regex,
    recency: Regex,
    service_duration: Regex,
    repeated_unit_range: Regex,
    ceiling: Regex,
}

impl Default for Extractor {
    fn default() -> Self {
        Self {
            quantities: Regex::new(r"(?i)\b([0-9]{1,4}(?:\.[0-9]{1,2})?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:\(\s*[0-9]{1,3}\s*\))?\s*(?:(?:[-–—]|to)\s*([0-9]{1,4}(?:\.[0-9]{1,2})?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\(\s*[0-9]{1,3}\s*\))?)?\s*\+?\s*[- ]?\s*(years?|yrs?|months?|mos?)\b").unwrap(),
            experience: Regex::new(r"(?i)\b(experience|expertise|background)\b").unwrap(),
            preferred: Regex::new(r"(?i)\b(prefer|preferred|preferably|desired|desirable|ideally|bonus|nice.to.have|a plus|an advantage)\b").unwrap(),
            preferred_heading: Regex::new(r"(?i)^(?:preferred|desired|desirable|nice.to.have|bonus|optional)(?:\s+(?:qualifications|requirements|skills|criteria|experience|additional|attributes))*$").unwrap(),
            required_heading: Regex::new(r"(?i)^(?:(?:(?:minimum|basic|required|essential|necessary|technical|education|knowledge|and|work|professional|additional|candidate|key|your|qualifications|skills|experience|requirements|criteria|background|attributes)[ /&,:-]*)+|what.*(?:bring|looking(?: for)?|need)|you(?:'ll| will)? (?:have|bring)|must.haves?|to qualify.*|to be considered.*)$").unwrap(),
            excluded_heading: Regex::new(r"(?i)\b(about (?:us|the company)|our company|benefits|compensation|responsibilities|duties|equal opportunity|eligibility|job description)\b").unwrap(),
            required: Regex::new(r"(?i)\b(min(?:imum)?|at least|no less than|must have|must possess|requires?|required|qualifications|you(?:['’]ll| will)? have|you['’]ve spent|you have spent|you bring|you possess|should have|need to have|we need|seeking|looking for|we seek|supplemented by|proven (?:experience|expertise)|demonstrated expertise|significant professional .*experience|typically (?:has|candidate will have)|has actively served)\b|^\s*(?:have|experience|need|brings|typically)\b|\b(?:engineer|architect|candidate|manager|assistant)s? with\s*$|\bformal training or certification.*\band\s*$").unwrap(),
            unrelated: Regex::new(r"(?i)\byears?\s+(?:of\s+age|old)\b|\b(?:age|aged)\s*\(?\s*(?:at least\s+)?[0-9]|\b(probation(?:ary)?|polygraph|background check|within.*hire|project (?:funded|duration)|contract duration|founded|established)\b|\b(?:after|vesting|eligible)[^.;\n]*\b(?:vacation|retirement|anniversary)\b|(?:our company (?:has|is|celebrates)|we have|company has|brings the strength of|serving clients)[^\n]*|Gemini Enterprise for Customer Experience").unwrap(),
            non_experience_tail: Regex::new(r"(?i)^\s*(?:of age|old|probationary|(?:project|contract) (?:duration|term|funded)|college|university|high school diploma|degree|diploma|existence|state .*apprenticeship program|is equivalent to.*(?:semester|quarter|hours))\b").unwrap(),
            degree: Regex::new(r"(?i)\b(bachelor(?:'s|’s|s)?|master(?:'s|’s|s)?|associate(?:'s|’s|s)?|phd|doctorate|graduate(?:-level)? (?:degree|education)|advanced degree|high school|(?-i:BSEE|BSME|BS|BA|MS|MA|GED)|degree|diploma)\b").unwrap(),
            education_alternative: Regex::new(r"(?i)\bin lieu of|\b(?:may|can) (?:consider|be substituted|be waived)|\bsubstitution (?:available|allowed)|\bor\s+(?:(?:an?|the)\s+)?(?:bachelor|master|associate|phd|doctorate|graduate degree|advanced degree|high school|BS|BA|MS|MA|equivalence to|equivalent combination|equivalent (?:BS|BA|MS|degree|education|experience)|equivalent demonstrated through)\b|\bor[-* ]+(?:for (?:internal|external) candidates,?\s+)?(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten)\b").unwrap(),
            alternative_label: Regex::new(r"(?i)\b(?:option|level|grade|classification)\s+(?:[0-9]+|[ivx]+)\b|(?:^|[- ])(?:I|II|III|IV|Sr)\s*:").unwrap(),
            bullet: Regex::new(r"^\s*(?:[-+*•●▪◦‣–—›\u{f0b7}]\s+|[0-9]+[.)]\s+)").unwrap(),
            sentence: Regex::new(r"[.!?;]\s+").unwrap(),
            zero: Regex::new(r"(?i)^\s*no\s+(?:(?:prior|previous|professional|work)\s+)?experience\s+(?:is\s+)?(?:required|necessary)\b").unwrap(),
            negated: Regex::new(r"(?i)\bnot\s+(?:required|necessary|mandatory)\b").unwrap(),
            activity: Regex::new(r"(?i)^\s*(?:or more\s+)?(?:of|in|across|building|working|leading|managing|developing|designing|delivering|supporting|hands.on|relevant|related|professional|technical|post college)\b").unwrap(),
            blocks: Regex::new(r"(?i)<\s*/?\s*(?:p|div|li|br|h[1-6]|ul|ol)\b[^>]*>").unwrap(),
            tags: Regex::new(r"<[^>]*>").unwrap(),
            joined: Regex::new(r"([a-z.)])((?:Minimum|Experience|Three|Five)\b)").unwrap(),
            recency: Regex::new(r"(?i)(?:within|in|over|during)\s+the\s+(?:last|past)\s*$").unwrap(),
            service_duration: Regex::new(r"(?i)\b(?:tuition reimbursement|sabbatical|longevity pay|paid time off|hybrid work arrangement|years? of (?:state )?service|years? of employment|start date|after.*hire|within.*start|earning (?:your|a|the) degree|company.*has spent|subsidiary.*has spent|history spanning|legacy of over|we draw on|combines over.*expertise|limit yourself.*applications|applying for.*roles within|internship program is|voted by associates|years? in a row|years? in business|has spent.*years building software|team focuses on matching)[^\n]*|^(?:for nearly|for over|boasting over|with (?:more than|nearly|over)?)\s*[0-9]+\s+years?[^\n]*\b(?:we|our|partners|laboratory|company|specializes|industries|worldwide|innovation)\b|\byear[- ](?:history|heritage|legacy)\b|serving policyholders|coverage across.*industries").unwrap(),
            repeated_unit_range: Regex::new(r"(?i)\b([0-9]+)\s+(years?|months?)\s+to\s+([0-9]+)\s+(years?|months?)\b").unwrap(),
            ceiling: Regex::new(r"(?i)(?:up to|at most|no more than|maximum of)\s*$").unwrap(),
        }
    }
}

fn number(text: &str) -> Option<f64> {
    let words = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
        "twenty",
    ];
    words
        .iter()
        .position(|word| text.eq_ignore_ascii_case(word))
        .map(|n| n as f64)
        .or_else(|| text.parse().ok())
}

fn snippet(text: &str, start: usize, end: usize) -> String {
    let before: String = text[..start]
        .chars()
        .rev()
        .take(160)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!(
        "{}{}{}",
        before,
        &text[start..end],
        text[end..].chars().take(320).collect::<String>()
    )
}

impl Extractor {
    fn degree_label(&self, text: &str, before: bool) -> Option<String> {
        let mut matches = self.degree.find_iter(text).filter(|m| {
            !matches!(
                m.as_str().to_ascii_lowercase().as_str(),
                "degree" | "diploma"
            )
        });
        let found = if before {
            matches.last()
        } else {
            matches.next()
        }
        .or_else(|| {
            if before {
                self.degree.find_iter(text).last()
            } else {
                self.degree.find(text)
            }
        })?;
        let between = if before {
            &text[found.end()..]
        } else {
            &text[..found.start()]
        };
        if self.quantities.is_match(between) {
            return None;
        }
        let label = found.as_str().to_ascii_lowercase();
        Some(
            if label.starts_with("bachelor")
                || matches!(label.as_str(), "bs" | "ba" | "bsee" | "bsme")
            {
                "bachelors"
            } else if label.starts_with("master") || matches!(label.as_str(), "ms" | "ma") {
                "masters"
            } else if label.starts_with("associate") {
                "associate"
            } else if matches!(label.as_str(), "phd" | "doctorate") {
                "doctorate"
            } else if label.contains("high school") || label == "ged" {
                "high_school"
            } else {
                if matches!(label.as_str(), "degree" | "diploma") {
                    "degree"
                } else {
                    "graduate"
                }
            }
            .to_string(),
        )
    }

    pub fn extract(&self, description: &str) -> Extraction {
        let blocks = self.blocks.replace_all(description, "\n");
        let mut plain = self.tags.replace_all(&blocks, " ").into_owned();
        for (from, to) in [
            ("&nbsp;", " "),
            ("&#160;", " "),
            ("&amp;", "&"),
            ("\\-", "-"),
            ("\\+", "+"),
            ("\\.", "."),
            ("\\)", ")"),
            ("\\(", "("),
            ("\\*", "*"),
            ("e.g.", "eg"),
            ("i.e.", "ie"),
            ("Ph.D.", "PhD"),
            ("B.S.", "BS"),
            ("M.S.", "MS"),
        ] {
            plain = plain.replace(from, to);
        }
        plain = plain.replace(['\u{00a0}', '\u{202f}'], " ");
        plain = self.joined.replace_all(&plain, "$1\n$2").into_owned();
        plain = self
            .repeated_unit_range
            .replace_all(&plain, |c: &regex::Captures<'_>| {
                if c[2].to_ascii_lowercase().trim_end_matches('s')
                    == c[4].to_ascii_lowercase().trim_end_matches('s')
                {
                    format!("{} to {} {}", &c[1], &c[3], &c[4])
                } else {
                    c[0].to_string()
                }
            })
            .into_owned();
        let mut requirements: Vec<Requirement> = vec![];
        // Only actual headings change section state; preferred certification bullets never do.
        let mut section = "unknown";
        let mut degree_candidates: Vec<(usize, String)> = vec![];
        let mut alternative_next = false;
        for raw in plain.lines().map(str::trim).filter(|line| !line.is_empty()) {
            let line = raw.trim_matches(['*', '#', ' ', '\t', ':']);
            if line.trim_matches(['-', ' ']).eq_ignore_ascii_case("or") {
                alternative_next = true;
                continue;
            }
            let is_bullet = self.bullet.is_match(raw);
            if !is_bullet
                && line.len() < 120
                && !self.quantities.is_match(line)
                && !self.zero.is_match(line)
            {
                if self.preferred_heading.is_match(line) {
                    section = "preferred";
                    degree_candidates.clear();
                    alternative_next = false;
                    continue;
                }
                if self.excluded_heading.is_match(line) {
                    section = "excluded";
                    degree_candidates.clear();
                    alternative_next = false;
                    continue;
                }
                if self.required_heading.is_match(line) {
                    section = "required";
                    degree_candidates.clear();
                    alternative_next = false;
                    continue;
                }
                if raw.starts_with("**") || raw.ends_with(':') {
                    section = "unknown";
                    degree_candidates.clear();
                    alternative_next = false;
                }
            }
            let text = self.bullet.replace(raw, "").replace('*', "");
            if self.zero.is_match(&text) && section != "preferred" {
                requirements.push(Requirement {
                    minimum_months: 0.0,
                    maximum_months: None,
                    kind: "required",
                    condition: None,
                    evidence: text.chars().take(500).collect(),
                });
                continue;
            }
            let quantities = self.quantities.find_iter(&text).count();
            let degree_paths: Vec<_> = self
                .degree
                .find_iter(&text)
                .filter_map(|m| self.degree_label(m.as_str(), false))
                .filter(|label| label != "degree")
                .collect();
            let different_degree_paths = degree_paths
                .first()
                .is_some_and(|first| degree_paths.iter().any(|label| label != first));
            let shared_degree_requirement = quantities == 1
                && degree_paths.len() > 1
                && self.degree.find_iter(&text).last().is_some_and(|degree| {
                    self.quantities
                        .find(&text)
                        .is_some_and(|quantity| degree.end() < quantity.start())
                });
            let conditional = text.to_ascii_lowercase().contains("may substitute")
                || !shared_degree_requirement
                    && (self.education_alternative.is_match(&text)
                        || different_degree_paths && text.to_ascii_lowercase().contains(" or ")
                        || text.to_ascii_lowercase().contains("option "));
            if quantities == 0
                && (text.to_ascii_lowercase().contains("substitution available")
                    || text.to_ascii_lowercase().contains("substitution allowed"))
            {
                alternative_next = true;
            }
            // Keep the base and substitution allowance; do not guess an arithmetic deduction.
            if conditional
                && text.to_ascii_lowercase().contains("substitut")
                && section != "preferred"
            {
                for requirement in &mut requirements {
                    if requirement.kind == "required" {
                        requirement.kind = "conditional";
                        requirement.condition = Some("education_substitution".to_string());
                    }
                }
            }
            let lead = text
                .trim_start_matches(['-', '*', ' '])
                .to_ascii_lowercase();
            let or_branch =
                (alternative_next || lead.starts_with("or ") || lead.starts_with("or-"))
                    && quantities > 0;
            if or_branch {
                for (index, label) in &degree_candidates {
                    let index = *index;
                    requirements[index].kind = "conditional";
                    requirements[index].condition = Some(label.clone());
                }
            }
            for clause in self.sentence.split(&text) {
                for capture in self.quantities.captures_iter(clause) {
                    let whole = capture.get(0).unwrap();
                    let Some(value) = number(capture.get(1).unwrap().as_str()) else {
                        continue;
                    };
                    let unit = capture.get(3).unwrap().as_str().to_ascii_lowercase();
                    let scale = if unit.starts_with('m') { 1.0 } else { 12.0 };
                    let mut minimum = value * scale;
                    let mut upper = capture
                        .get(2)
                        .and_then(|m| number(m.as_str()))
                        .map(|n| n * scale);
                    let prefix = clause[..whole.start()].trim_matches(['*', ' ', ':', '"', '“']);
                    let tail = &clause[whole.end()..];
                    let has_experience = self.experience.is_match(clause);
                    let labelled_alternative =
                        self.alternative_label.is_match(&clause[..whole.start()]);
                    let degree = if tail.trim_start().to_ascii_lowercase().starts_with("with ") {
                        self.degree_label(tail, false)
                    } else {
                        self.degree_label(prefix, true)
                            .or_else(|| self.degree_label(tail, false))
                    };
                    let context_required = section == "required"
                        || self.required.is_match(prefix)
                        || prefix.to_ascii_lowercase().ends_with("experience") && has_experience
                        || matches!(prefix.to_ascii_lowercase().as_str(), "over" | "more than")
                            && (has_experience || self.activity.is_match(tail))
                        || degree.is_some() && (has_experience || self.activity.is_match(tail))
                        || (conditional || or_branch) && has_experience
                        || prefix.is_empty() && (has_experience || self.activity.is_match(tail))
                        || clause[..whole.start()].trim().ends_with(':') && has_experience;
                    let mut kind = if self.unrelated.is_match(clause)
                        || self.service_duration.is_match(clause)
                        || tail
                            .trim_start()
                            .to_ascii_lowercase()
                            .starts_with("in, your")
                        || self.non_experience_tail.is_match(tail)
                        || !has_experience
                            && tail.trim_matches(['*', ' ', ':', '.']).is_empty()
                            && !context_required
                        || section == "excluded" && !self.required.is_match(prefix)
                        || raw.starts_with("**")
                            && raw.ends_with("**")
                            && prefix.is_empty()
                            && matches!(
                                tail.trim_matches(['*', ' ']).to_ascii_lowercase().as_str(),
                                "of experience" | "experience"
                            ) {
                        "non_experience"
                    } else if self.recency.is_match(prefix) {
                        "recency"
                    } else if prefix
                        .split_whitespace()
                        .last()
                        .is_some_and(|word| word.parse::<u32>().is_ok())
                        || upper.is_some_and(|n| n < minimum || n > 480.0)
                        || minimum > 480.0
                    {
                        "unsupported_expression"
                    } else if self.negated.is_match(clause) {
                        "not_required"
                    } else if !has_experience && !self.activity.is_match(tail) && !context_required
                    {
                        "non_experience"
                    } else if section == "preferred" || self.preferred.is_match(prefix) {
                        "preferred"
                    } else if self.ceiling.is_match(prefix) && has_experience && !conditional {
                        "maximum_experience"
                    } else if !context_required {
                        "uncertain_context"
                    } else if conditional || or_branch || labelled_alternative {
                        "conditional"
                    } else {
                        "required"
                    };
                    if let Some(marker) = self.preferred.find(tail) {
                        let before = &tail[..marker.start()];
                        let after = tail[marker.end()..].trim_matches([' ', '.', ',']);
                        let scoped_specialty = before.contains('(')
                            || !after.is_empty() && before.contains(',')
                            || self.experience.find_iter(before).count() > 1;
                        if !scoped_specialty
                            && matches!(kind, "required" | "conditional" | "uncertain_context")
                        {
                            kind = "preferred";
                        }
                    }
                    if let Some(label) = &degree {
                        if matches!(kind, "required" | "conditional")
                            && degree_candidates.iter().any(|(_, old)| old != label)
                        {
                            kind = "conditional";
                            for (index, old) in &degree_candidates {
                                requirements[*index].kind = "conditional";
                                requirements[*index].condition = Some(old.clone());
                            }
                        }
                    }
                    let condition = if kind == "conditional" {
                        degree.clone().or_else(|| {
                            if text.to_ascii_lowercase().contains("substitut") {
                                Some("education_substitution".to_string())
                            } else if labelled_alternative {
                                Some(prefix.to_string())
                            } else {
                                None
                            }
                        })
                    } else {
                        None
                    };
                    if kind == "maximum_experience" {
                        upper = Some(minimum);
                        minimum = 0.0;
                    }
                    if let Some(label) = degree {
                        if matches!(kind, "required" | "conditional") {
                            degree_candidates.push((requirements.len(), label));
                        }
                    }
                    requirements.push(Requirement {
                        minimum_months: minimum,
                        maximum_months: upper,
                        kind,
                        condition,
                        evidence: snippet(clause, whole.start(), whole.end()),
                    });
                }
            }
            if quantities > 0 {
                alternative_next = false;
            }
        }
        let minimum_months = requirements
            .iter()
            .filter(|r| r.kind == "required")
            .map(|r| r.minimum_months)
            .reduce(f64::max);
        let years = minimum_months
            .filter(|n| (n / 12.0).fract().abs() < 1e-9)
            .map(|n| (n / 12.0) as i32);
        let has = |kind| requirements.iter().any(|r| r.kind == kind);
        let reason = if minimum_months.is_some() {
            if has("conditional") {
                "required_with_alternatives"
            } else {
                "required"
            }
        } else if has("conditional") {
            if requirements.iter().any(|r| {
                r.kind == "conditional"
                    && r.condition.as_deref().is_some_and(|label| {
                        matches!(
                            label,
                            "bachelors"
                                | "masters"
                                | "associate"
                                | "doctorate"
                                | "high_school"
                                | "graduate"
                                | "degree"
                                | "education_substitution"
                        )
                    })
            }) {
                "conditional_education"
            } else {
                "conditional_alternatives"
            }
        } else if has("preferred") {
            "preferred_only"
        } else if has("uncertain_context") || has("unsupported_expression") {
            "needs_review"
        } else if has("recency") {
            "recency_constraint"
        } else if has("maximum_experience") {
            "experience_ceiling"
        } else if self.experience.is_match(&plain) {
            "not_quantified"
        } else {
            "not_stated"
        };
        let evidence = requirements
            .iter()
            .filter(|r| r.kind == "required")
            .map(|r| r.evidence.clone())
            .collect();
        Extraction {
            years,
            minimum_months,
            evidence,
            reason,
            requirements,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn required_regressions() {
        let parser = Extractor::default();
        for (text, expected) in [
            ("3+ years of experience in Python", 3), ("Minimum 5 years of professional software development experience.", 5),
            ("At least 4–6 years' experience with SQL", 4), ("Three (3) years of related experience", 3),
            ("Required Qualifications:\n5 years of experience\n2 years of Python experience", 5),
            ("5 years of experience\nPreferred Qualifications:\n10 years of leadership experience", 5),
            ("No prior experience required.", 0), ("<ul><li>4+ years of relevant experience</li></ul>", 4), ("2 to 4 years of experience", 2),
            ("Minimum 3 years of experience. Our company has 20 years of experience.", 3),
            (r"7\-9 years of experience", 7), (r"10\+ years of experience", 10),
            ("Experience: 3–6 years of experience focusing on MLOps", 3),
            ("Typically, no less than 2-4 years relevant project experience", 2),
            ("2-10 years construction management or engineering design experience", 2),
            ("Minimum 2 years experience in Digital Media (Paid Search focus preferred)", 2),
            ("Required Minimum Experience:\nMinimum 5 years in treasury, preferably in healthcare", 5),
            ("Preferred Qualifications:\n10 years experience\nEducation And Experience Requirements:\nMust have at least 3 years dental front desk", 3),
            ("Bachelor's with 5 years of experience or master's with 3 years of experience\nAt least 12 years of experience", 12),
            ("Qualifications:\n* Registered Professional Engineer (PE) preferred.\n* 5+ years of relevant systems engineering experience", 5),
            ("Qualifications:\n* Bachelor’s degree; CPA, CFA, or certification preferred.\n* 8+ years of experience in investment accounting", 8),
            ("ESSENTIAL CRITERIA:\n● 5+ years of experience delivering data center projects", 5),
            ("Basic Qualifications\n* 10+ years of specific technology domain areas (e.g. software development, cloud computing, systems engineering, infrastructure, security, networking, data & analytics) experience", 10),
            ("You have\n* Appian Expertise: 5+ years of hands-on experience", 5),
            ("What you'll bring\n* 7+ years in data architecture or solution design", 7),
            ("Must Haves\n2+ years building software applications", 2),
            ("What We're Looking For\nEngineering foundation\n* 8–10+ years across ML, data, and software engineering", 8),
            ("Requirements:\nMin 10+ years of commercial insurance experience", 10),
            ("10+ years of experience managing ERP programs (or equivalent scope across business and technology)", 10),
            ("**10–15+ years of construction and structural steel erection experience.**", 10),
            ("Minimum 3 years of retirement plan administration experience", 3),
        ] { assert_eq!(parser.extract(text).years, Some(expected), "{text}"); }
    }
    #[test]
    fn exclusions_and_precise_details() {
        let parser = Extractor::default();
        for text in [
            "Our company has 30 years of experience delivering services.", "Over 20 years of experience serving clients.",
            "5 years of experience preferred", "5 years of experience in Python, preferred", "Preferred Qualifications:\n5 years of experience",
            "40-50 years of experience", "5-3 years of experience", "No prior AI experience required", "Entry-level Engineer", "",
            "Paid vacation after 3 years", "Minimum age 18 years. Experience is required.", "We have 15 years of experience in this industry.",
            "3+ years relevant experience or equivalent BS degree", "Minimum of Five years hands-on delivery with GCP Gemini Enterprise for Customer Experience",
            "5 years of experience is not required.", "We prefer 5 years of experience", "**37 years of experience**",
            "Qualifications:\n* A polygraph within 5 years is required", "We are starting a 3-year project funded by Google",
        ] { assert_eq!(parser.extract(text).years, None, "{text}"); }
        for (text, months) in [
            ("Minimum 6 months of relevant experience", 6.0),
            ("1.5 years of experience", 18.0),
            ("Required Experience:\n6–12 months working in finance", 6.0),
        ] {
            let result = parser.extract(text);
            assert_eq!(result.minimum_months, Some(months));
            assert_eq!(result.years, None);
        }
        let result = parser.extract("Qualifications:\nBachelor's Degree and minimum 4 years of experience. Graduate Degree with 2 years experience. In lieu of a degree, minimum of 8 years of experience.");
        assert_eq!(result.years, None);
        assert_eq!(result.reason, "conditional_education");
        assert_eq!(
            result
                .requirements
                .iter()
                .filter(|r| r.kind == "conditional")
                .count(),
            3
        );
        let result = parser.extract("Qualifications:\n* Bachelor's degree and 0-1 years work experience\n* OR high school diploma and minimum 2 years work experience");
        assert_eq!(result.years, None);
        assert_eq!(result.reason, "conditional_education");
        assert_eq!(
            parser
                .extract("Relevant engineering experience needed")
                .reason,
            "not_quantified"
        );
        assert_eq!(
            parser.extract("We are hiring an engineer").reason,
            "not_stated"
        );
        assert_eq!(
            parser
                .extract("Preferred Qualifications:\n5 years experience")
                .reason,
            "preferred_only"
        );
    }

    #[test]
    fn labelled_alternatives() {
        let parser = Extractor::default();
        assert_eq!(parser.extract("Qualifications:\nSpecialist-Admin I: 0-2 years of experience\nSpecialist-Admin II: 2-4 years of experience\nSpecialist-Admin Sr: 6+ years of experience").years, None);
        assert_eq!(parser.extract("Qualifications:\nThe degree must be accredited AND two years experience; the degree requires one year experience; -OR- Four years experience").years, None);
    }

    #[test]
    fn remaining_corpus_gaps() {
        let parser = Extractor::default();
        assert_eq!(parser.extract("A minimum of 5 years of relevant work experience - experience working in government is a plus").years, Some(5));
        assert_eq!(
            parser
                .extract("Master's degree may substitute for up to two years of work experience")
                .requirements[0]
                .kind,
            "conditional"
        );
        assert_eq!(
            parser
                .extract("BS or MS with 3+ years of experience in manufacturing")
                .years,
            Some(3)
        );
        assert_eq!(
            parser
                .extract(
                    "Master’s degree may be substituted for up to two years of work experience"
                )
                .requirements[0]
                .kind,
            "conditional"
        );
        assert_eq!(
            parser
                .extract("Four-year high school diploma and six years of software experience")
                .requirements[0]
                .kind,
            "non_experience"
        );
        assert_eq!(parser.extract("PhD, Master's, or Bachelor's degree or equivalent experience\n8+ years of HPC software experience").years,Some(8));
        assert_eq!(parser.extract("Bachelor’s degree or equivalent. Masters Degree as a plus.\nAt least 15 years of related work experience").years,Some(15));
        assert_eq!(
            parser
                .extract("We seek an architect with 8 10+ years of experience")
                .years,
            None
        );
        assert_eq!(
            parser
                .extract("Up to three years of software development experience")
                .reason,
            "experience_ceiling"
        );
        assert_eq!(
            parser
                .extract("Up to three years of software development experience")
                .requirements[0]
                .maximum_months,
            Some(36.0)
        );
        assert_eq!(
            parser.extract("\u{f0b7} 2+ years in data science").years,
            Some(2)
        );
        assert_eq!(
            parser
                .extract("Associate degree or two years of supervisory or leadership role")
                .reason,
            "conditional_education"
        );
        for (text, years) in [
            (
                "Need 14+ years profile with strong Architect experience",
                14,
            ),
            (
                "Brings more than two years of experience collaborating with teams",
                2,
            ),
            ("Proven experience (typically 3+ years) in compliance", 3),
            ("QUALIFICATIONS - Two to four years of experience in IT", 2),
            (
                "Typically candidate will have 2+ years software development experience",
                2,
            ),
            (
                "Education: BSEE or equivalent with 1+ years of relevant verification experience",
                1,
            ),
            (
                "Has actively served in a Project Manager role for a minimum of 7 years",
                7,
            ),
        ] {
            assert_eq!(parser.extract(text).years, Some(years), "{text}");
        }
        for text in [
            "With its strong over 55-year heritage, Capgemini is trusted by clients",
            "A university with a 130-year legacy",
            "Longevity pay supplements begin after five years of state service",
            "Paid Time Off: vacation for the first five years of employment",
            "hybrid work arrangement after six months of employment",
            "Please limit yourself to two applications within a six-month period",
        ] {
            assert_ne!(parser.extract(text).reason, "needs_review", "{text}");
            assert_eq!(parser.extract(text).years, None, "{text}");
        }
        assert_eq!(parser.extract("You've spent the last four years building your expertise and earning your degree").years, None);
        assert_eq!(parser.extract("You’ve acquired 3+ years experience with Bachelor's OR minimal prior experience required with Master's Degree").years, None);
        assert_eq!(
            parser
                .extract("High School Diploma or GED and two years of healthcare experience")
                .years,
            Some(2)
        );
        assert_eq!(
            parser
                .extract("Twelve months in, your site runs on a stable foundation")
                .years,
            None
        );
        assert_eq!(
            parser
                .extract("Over 6 years to 10 years project experience within engineering industry")
                .years,
            Some(6)
        );
        assert_eq!(parser.extract("Experience: Five years of professional experience\nGraduate-level education may be substituted for up to two years of professional experience").years, None);
        assert_eq!(
            parser
                .extract("or seven to ten years related experience and/or training")
                .reason,
            "conditional_alternatives"
        );
        assert_eq!(
            parser
                .extract("(Substitution available.)Three (3) years' experience supervising staff")
                .years,
            None
        );
        assert_eq!(
            parser
                .extract("(Substitution available.)Three (3) years' experience supervising staff")
                .reason,
            "conditional_alternatives"
        );
        assert_eq!(
            parser
                .extract("supplemented by two (2) years of previous experience in clerical work")
                .years,
            Some(2)
        );
        for (text, years) in [
            ("8+ years building software with strong programming fundamentals", 8),
            ("8–10+ years of professional software development", 8),
            ("You've spent 3+ years in technical program or delivery management", 3),
            ("You’ve spent 3+ years in technical program management", 3),
            ("5+ years designing enterprise data platforms", 5),
            ("7+ years leading complex engineering programs", 7),
            ("5+ years of hands-on project leadership", 5),
            (r"**\* \*\*7+ years of software engineering experience\*\*, including end-to-end systems.**", 7),
            (r"**\*\*Experience:\*\* 7+ years of software engineering experience.**", 7),
            ("eferredMinimum of 5 years of engineering experience", 5),
            ("Experience Five (5) years' progressively responsible experience", 5),
            ("Formal training or certification on software engineering concepts and 5+ years applied experience", 5),
            ("Bachelor's degree in Engineering and 15+ years of IT engineering experience", 15),
            ("We are seeking an AWS architect with 8-12 years of experience", 8),
            ("Private equity firm is seeking an Assistant with 1+ years of experience", 1),
            ("What we need is someone who comes 8+ years of experience", 8),
            ("\"2-5+ years experience in Commercial construction", 2),
        ] { assert_eq!(parser.extract(text).years, Some(years), "{text}"); }
        for text in [
            "With more than 135 years of financial experience and 24,000 partners, we serve clients",
            "With nearly 100 years of experience, we improve lives with our trees",
            "For nearly 70 years, the Naval Nuclear Laboratory has developed technology",
            "Spire Solutions, a subsidiary of The Weitz Company, has spent over 20 years delivering solutions",
            "within six (6) months of their start date",
            "Tuition Reimbursement After One Year of Service",
            "Four-Week Company-Paid Sabbatical Eligibility After Five Years of Service",
            "Preferred Qualifications:\n8+ years building software",
        ] { let result = parser.extract(text); assert_eq!(result.years, None, "{text}"); assert_ne!(result.reason, "needs_review", "{text}"); }
        let result = parser.extract(
            "Recent hands-on experience, within the last three years, in CSfC solution design",
        );
        assert_eq!(result.years, None);
        assert_eq!(result.requirements[0].kind, "recency");
        assert_eq!(result.reason, "recency_constraint");
        for text in [
            "PhD in machine learning with 2+ years of industry experience, or MS degree with 6+ years of industry experience",
            "Graduate-level education may be substituted for up to (2) two years of professional experience",
            "Bachelor’s degree or equivalent experience with 6+ years of IT systems experience",
        ] { let result = parser.extract(text); assert_eq!(result.years, None, "{text}"); assert_eq!(result.reason, "conditional_education", "{text}"); }
        let result = parser
            .extract("PhD with 2+ years of experience or MS degree with 6+ years of experience");
        assert_eq!(
            result
                .requirements
                .iter()
                .map(|r| r.condition.as_deref())
                .collect::<Vec<_>>(),
            vec![Some("doctorate"), Some("masters")]
        );
    }

    #[test]
    fn requirement_phrases_and_unheaded_degree_alternatives() {
        let parser = Extractor::default();
        for text in [
            "Have 5+ years of experience working on software",
            "You'll have 5+ years of experience",
            "You’ll have 5+ years of experience",
            "You will have 5+ years of experience",
        ] {
            assert_eq!(parser.extract(text).years, Some(5), "{text}");
        }
        for text in [
            "We have 5 years of experience",
            "Preferred Qualifications:\nHave 5+ years of experience",
            "You'll have 5 years of experience preferred",
            "Have 5 years of experience is not required",
        ] {
            assert_eq!(parser.extract(text).years, None, "{text}");
        }
        let text = "Bachelor’s degree with 4+ years of relevant experience OR Associate’s degree with 6+ years of relevant experience";
        let result = parser.extract(text);
        assert_eq!(result.years, None);
        assert_eq!(result.reason, "conditional_education");
        assert_eq!(
            result
                .requirements
                .iter()
                .map(|r| (r.minimum_months, r.kind, r.condition.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                (48.0, "conditional", Some("bachelors")),
                (72.0, "conditional", Some("associate"))
            ]
        );
        let result = parser.extract(&format!(
            "{text}\nHave 8+ years of experience in leadership"
        ));
        assert_eq!(result.years, Some(8));
        assert_eq!(result.reason, "required_with_alternatives");
        assert_eq!(
            parser
                .extract(&format!("Preferred Qualifications:\n{text}"))
                .reason,
            "preferred_only"
        );
    }

    #[test]
    fn corpus_review_regressions() {
        let parser = Extractor::default();
        for text in [
            "Qualifications:\nProtected categories include age (40 years and over), gender and religion",
            "This position requires a 1 year probationary period",
            "Qualifications:\nBachelor's degree from a four-year college or university",
            "Qualifications:\nMicrosoft Cloud Background Check every two years thereafter",
            "Qualifications:\nA minimum of a bachelor’s degree from a four-year college, university, or equivalent experience",
        ] { assert_eq!(parser.extract(text).years, None, "{text}"); }
        assert_eq!(
            parser
                .extract("One (1) to Two (2) years’ experience working in an office setting")
                .years,
            Some(1)
        );
        assert_eq!(parser.extract("Qualifications:\n5 years of software experience with Python or SQL and 2 years of testing experience").years, Some(5));
        let result = parser.extract("Qualifications:\nDoctorate Degree AND 2+ years technical engineering experience\nBachelor's Degree AND 6+ years technical engineering experience\nOR 12+ years relevant technical engineering experience");
        assert_eq!(result.years, None);
        assert_eq!(
            result
                .requirements
                .iter()
                .filter(|r| r.kind == "conditional")
                .count(),
            3
        );
        assert_eq!(parser.extract("Qualifications:\nBachelor’s degree with 4+ years of relevant experience OR Associate’s degree with 6+ years of relevant experience").years, None);
        assert_eq!(parser.extract("Qualifications:\nTwo years experience, or for internal candidates, three years experience").reason, "conditional_alternatives");
        assert_eq!(parser.extract("Qualifications:\nBachelor's Degree and 5 years experience\nMaster's Degree and 3 years experience\nPhD and 0 years experience").years, None);
        assert_eq!(parser.extract("Qualifications:\nBachelor's Degree AND 2 years experience\n-OR- Four years experience").years, None);
        assert_eq!(
            parser
                .extract("Qualifications:\nOption 2: 1 years experience in merchandising")
                .years,
            None
        );
    }
}
