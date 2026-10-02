use regex::Regex;
use serde::Serialize;

pub const VERSION: &str = "experience-details-v5";

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
            required: Regex::new(r"(?i)\b(min(?:imum)?|at least|no less than|must have|must possess|requires?|required|you have|you bring|you possess|should have|need to have)\b").unwrap(),
            unrelated: Regex::new(r"(?i)\byears?\s+(?:of\s+age|old)\b|\b(?:age|aged)\s*\(?\s*(?:at least\s+)?[0-9]|\b(probation(?:ary)?|polygraph|background check|within.*hire|project (?:funded|duration)|contract duration|founded|established)\b|\b(?:after|vesting|eligible)[^.;\n]*\b(?:vacation|retirement|anniversary)\b|(?:our company (?:has|is|celebrates)|we have|company has|brings the strength of|serving clients)[^\n]*|Gemini Enterprise for Customer Experience").unwrap(),
            non_experience_tail: Regex::new(r"(?i)^\s*(?:of age|old|probationary|project|contract|college|university|degree|diploma|existence|state .*apprenticeship program|is equivalent to.*(?:semester|quarter|hours))\b").unwrap(),
            degree: Regex::new(r"(?i)\b(bachelor(?:'s|’s|s)?|master(?:'s|’s|s)?|associate(?:'s|’s|s)?|phd|doctorate|graduate degree|advanced degree|high school|(?-i:BS|BA|MS|MA|GED)|degree|diploma)\b").unwrap(),
            education_alternative: Regex::new(r"(?i)\bin lieu of|\bmay (?:consider|be substituted|be waived)|\bor\s+(?:(?:an?|the)\s+)?(?:bachelor|master|associate|phd|doctorate|graduate degree|advanced degree|high school|equivalent (?:BS|BA|MS|degree|education)|equivalent demonstrated through)\b|\bor[-* ]+(?:for (?:internal|external) candidates,?\s+)?(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten)\b").unwrap(),
            alternative_label: Regex::new(r"(?i)\b(?:option|level|grade|classification)\s+(?:[0-9]+|[ivx]+)\b|(?:^|[- ])(?:I|II|III|IV|Sr)\s*:").unwrap(),
            bullet: Regex::new(r"^\s*(?:[-+*•●▪◦‣–—]\s+|[0-9]+[.)]\s+)").unwrap(),
            sentence: Regex::new(r"[.!?;]\s+").unwrap(),
            zero: Regex::new(r"(?i)^\s*no\s+(?:(?:prior|previous|professional|work)\s+)?experience\s+(?:is\s+)?(?:required|necessary)\b").unwrap(),
            negated: Regex::new(r"(?i)\bnot\s+(?:required|necessary|mandatory)\b").unwrap(),
            activity: Regex::new(r"(?i)^\s*(?:or more\s+)?(?:of|in|across|building|working|leading|managing|developing|designing|delivering|supporting|hands.on|relevant|related|professional|technical|post college)\b").unwrap(),
            blocks: Regex::new(r"(?i)<\s*/?\s*(?:p|div|li|br|h[1-6]|ul|ol)\b[^>]*>").unwrap(),
            tags: Regex::new(r"<[^>]*>").unwrap(),
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
            if label.starts_with("bachelor") || matches!(label.as_str(), "bs" | "ba") {
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
            ("e.g.", "eg"),
            ("i.e.", "ie"),
            ("Ph.D.", "PhD"),
            ("B.S.", "BS"),
            ("M.S.", "MS"),
        ] {
            plain = plain.replace(from, to);
        }
        plain = plain.replace(['\u{00a0}', '\u{202f}'], " ");
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
            let text = self.bullet.replace(raw, "");
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
            let conditional = self.education_alternative.is_match(&text)
                || text.to_ascii_lowercase().contains("option ");
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
                    let minimum = value * scale;
                    let upper = capture
                        .get(2)
                        .and_then(|m| number(m.as_str()))
                        .map(|n| n * scale);
                    let prefix = clause[..whole.start()].trim_matches(['*', ' ', ':']);
                    let tail = &clause[whole.end()..];
                    let has_experience = self.experience.is_match(clause);
                    let labelled_alternative = self.alternative_label.is_match(&clause[..whole.start()]);
                    let context_required = section == "required"
                        || self.required.is_match(prefix)
                        || prefix.is_empty() && has_experience
                        || clause[..whole.start()].trim().ends_with(':') && has_experience;
                    let mut kind = if self.unrelated.is_match(clause)
                        || self.non_experience_tail.is_match(tail)
                        || !has_experience && tail.trim_matches(['*', ' ', ':', '.']).is_empty()
                        || section == "excluded" && !self.required.is_match(prefix)
                        || raw.starts_with("**")
                            && raw.ends_with("**")
                            && prefix.is_empty()
                            && matches!(
                                tail.trim_matches(['*', ' ']).to_ascii_lowercase().as_str(),
                                "of experience" | "experience"
                            ) {
                        "non_experience"
                    } else if upper.is_some_and(|n| n < minimum || n > 480.0) || minimum > 480.0 {
                        "unsupported_expression"
                    } else if self.negated.is_match(clause) {
                        "not_required"
                    } else if !has_experience && !self.activity.is_match(tail) && !context_required
                    {
                        "non_experience"
                    } else if section == "preferred" || self.preferred.is_match(prefix) {
                        "preferred"
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
                        let scoped_specialty =
                            before.contains('(') || !after.is_empty() && before.contains(',');
                        if !scoped_specialty && kind == "required" {
                            kind = "preferred";
                        }
                    }
                    let degree = if tail.trim_start().to_ascii_lowercase().starts_with("with ") {
                        self.degree_label(tail, false)
                    } else {
                        self.degree_label(prefix, true)
                            .or_else(|| self.degree_label(tail, false))
                    };
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
                            if labelled_alternative {
                                Some(prefix.to_string())
                            } else {
                                None
                            }
                        })
                    } else {
                        None
                    };
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
