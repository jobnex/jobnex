use regex::Regex;
use serde::Serialize;

pub const VERSION: &str = "required-years-v1";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Extraction {
    pub years: Option<i32>,
    pub evidence: Vec<String>,
    pub reason: &'static str,
}

pub struct Extractor {
    years: Regex,
    experience: Regex,
    preferred: Regex,
    not_required: Regex,
    required: Regex,
    heading: Regex,
    alternative: Regex,
    education_alternative: Regex,
    zero: Regex,
    blocks: Regex,
    tags: Regex,
}

impl Default for Extractor {
    fn default() -> Self {
        Self {
            years: Regex::new(r"(?i)\b([0-9]{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*(?:\(\s*[0-9]{1,2}\s*\))?\s*(?:(?:[-–—]|to)\s*([0-9]{1,2}))?\s*\+?\s*(?:years?|yrs?)\b").unwrap(),
            experience: Regex::new(r"(?i)\bexperience\b").unwrap(),
            preferred: Regex::new(r"(?i)\b(prefer|preferred|preferably|desired|desirable|ideally|bonus|nice.to.have|a plus|an advantage)\b").unwrap(),
            not_required: Regex::new(r"(?i)\bnot\s+(?:required|necessary|mandatory)\b").unwrap(),
            required: Regex::new(r"(?i)\b(minimum|at least|must have|must possess|requires?|required|you have|you bring|you possess|should have|need to have)\b").unwrap(),
            heading: Regex::new(r"(?i)^(?:(?:minimum|basic|required|preferred|desired)\s+)?(?:qualifications|requirements|skills|experience)(?:\s+and\s+(?:experience|skills))?\s*:?[\s]*$").unwrap(),
            alternative: Regex::new(r"(?i)\b(or|equivalent|in lieu)\b").unwrap(),
            education_alternative: Regex::new(r"(?i)\b(?:or|in lieu of)\s+(?:(?:an?|the)\s+)?(?:equivalent|bachelor|master|ph\.?d|degree)\b").unwrap(),
            zero: Regex::new(r"(?i)^\s*(?:[-•*]\s*)?no\s+(?:(?:prior|previous|professional)\s+)?experience\s+(?:is\s+)?(?:required|necessary)\s*[.!]?\s*$").unwrap(),
            blocks: Regex::new(r"(?i)<\s*/?\s*(?:p|div|li|br|h[1-6]|ul|ol)\b[^>]*>").unwrap(),
            tags: Regex::new(r"<[^>]*>").unwrap(),
        }
    }
}

fn number(text: &str) -> Option<i32> {
    match text.to_ascii_lowercase().as_str() {
        "one" => Some(1),
        "two" => Some(2),
        "three" => Some(3),
        "four" => Some(4),
        "five" => Some(5),
        "six" => Some(6),
        "seven" => Some(7),
        "eight" => Some(8),
        "nine" => Some(9),
        "ten" => Some(10),
        "eleven" => Some(11),
        "twelve" => Some(12),
        "fifteen" => Some(15),
        "twenty" => Some(20),
        value => value.parse().ok(),
    }
}

impl Extractor {
    pub fn extract(&self, description: &str) -> Extraction {
        let blocks = self.blocks.replace_all(description, "\n");
        let plain = self
            .tags
            .replace_all(&blocks, " ")
            .replace("&nbsp;", " ")
            .replace("&#160;", " ")
            .replace("&amp;", "&");
        let mut result = Extraction {
            years: None,
            evidence: vec![],
            reason: "unknown",
        };
        let mut preferred_section = false;
        let mut ambiguous = false;
        for raw in plain.split(['\n', ';']) {
            let line = raw.trim();
            if line.is_empty() {
                continue;
            }
            if self
                .heading
                .is_match(line.trim_matches(['*', '#', ' ', '\t', ':']))
                || line.len() < 80
                    && (line.ends_with(':')
                        || self.preferred.is_match(line) && !self.years.is_match(line))
            {
                preferred_section = self.preferred.is_match(line);
                continue;
            }
            if preferred_section
                || self.preferred.is_match(line)
                || self.not_required.is_match(line)
            {
                continue;
            }
            if self.zero.is_match(line) {
                result.years = Some(result.years.unwrap_or(0));
                result.evidence.push(line.chars().take(300).collect());
                continue;
            }
            let matches: Vec<_> = self.years.captures_iter(line).collect();
            if self.experience.is_match(line)
                && (matches.len() > 1 && self.alternative.is_match(line)
                    || !matches.is_empty() && self.education_alternative.is_match(line))
            {
                ambiguous = true;
                continue;
            }
            for capture in matches {
                let whole = capture.get(0).unwrap();
                // Reject fractional numbers and tenure embedded in company narratives.
                let prefix = &line[..whole.start()];
                if prefix.ends_with('.') || prefix.ends_with('-') || prefix.ends_with('–') {
                    continue;
                }
                let tail: String = line[whole.end()..]
                    .split(['.', '!', '?'])
                    .next()
                    .unwrap_or("")
                    .chars()
                    .take(110)
                    .collect();
                let Some(experience) = self.experience.find(&tail) else {
                    continue;
                };
                let before_experience = tail[..experience.start()].trim().to_ascii_lowercase();
                if before_experience.ends_with("customer")
                    || before_experience.ends_with("user")
                    || tail.to_ascii_lowercase().contains("not experience")
                {
                    continue;
                }
                let context = prefix.trim_start_matches(['-', '•', '*', ' ', '\t']);
                let starts_requirement = context.is_empty() || self.required.is_match(context);
                if !starts_requirement {
                    continue;
                }
                let Some(years) = number(capture.get(1).unwrap().as_str()) else {
                    continue;
                };
                if !(0..=40).contains(&years) {
                    continue;
                }
                if let Some(upper) = capture.get(2).and_then(|m| number(m.as_str())) {
                    if upper < years || upper > 40 {
                        ambiguous = true;
                        continue;
                    }
                }
                result.years = Some(result.years.unwrap_or(0).max(years));
                result.evidence.push(line.chars().take(300).collect());
            }
        }
        if ambiguous {
            return Extraction {
                years: None,
                evidence: vec![],
                reason: "ambiguous_alternatives",
            };
        }
        result.reason = if result.years.is_some() {
            "explicit_requirement"
        } else {
            "unknown"
        };
        result.evidence.truncate(8);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn required_years() {
        let parser = Extractor::default();
        for (text, expected) in [
            ("3+ years of experience in Python", Some(3)),
            ("Minimum 5 years of professional software development experience.", Some(5)),
            ("At least 4–6 years' experience with SQL", Some(4)),
            ("Three (3) years of related experience", Some(3)),
            ("Required Qualifications:\n5 years of experience\n2 years of Python experience", Some(5)),
            ("5 years of experience\nPreferred Qualifications:\n10 years of leadership experience", Some(5)),
            ("No prior experience required.", Some(0)),
            ("<ul><li>4+ years of relevant experience</li></ul>", Some(4)),
            ("2 to 4 years of experience", Some(2)),
            ("Must have 7 years of experience", Some(7)),
        ] { assert_eq!(parser.extract(text).years, expected, "{text}"); }
    }
    #[test]
    fn unknown_is_not_zero() {
        let parser = Extractor::default();
        for text in [
            "Our company has 30 years of experience delivering services.",
            "Over 20 years of experience serving clients.",
            "5 years of experience preferred",
            "Preferred Qualifications:\n5 years of experience",
            "Bachelor's with 5 years of experience or master's with 3 years of experience",
            "1.5 years of experience",
            "40-50 years of experience",
            "5-3 years of experience",
            "No prior AI experience required",
            "Entry-level Engineer",
            "",
            "Paid vacation after 3 years",
            "Our team requires 20 years of existence, not experience.",
            "Nice to Have\n8 years of experience",
            "Minimum age 18 years. Experience is required.",
            "We have 15 years of experience in this industry.",
            "3+ years relevant experience or equivalent BS degree",
            "Minimum of Five years hands-on delivery with GCP Gemini Enterprise for Customer Experience",
            "5 years of experience is not required.", "We prefer 5 years of experience",
        ] {
            assert_eq!(parser.extract(text).years, None, "{text}");
        }
    }
}
