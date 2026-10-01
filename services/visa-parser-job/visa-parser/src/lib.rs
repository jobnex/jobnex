//! Conservative, explainable visa-sponsorship detection for job descriptions.

use std::sync::OnceLock;

use regex::Regex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sponsorship {
    Available,
    Unavailable,
    Conditional,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub status: Sponsorship,
    /// Matching source lines, kept for review and auditing.
    pub evidence: Vec<String>,
}

/// Classify sponsorship statements without treating ordinary work-authorization
/// requirements as sponsorship promises. Conflicting statements remain unknown.
pub fn parse_job_description(text: &str) -> Finding {
    let mut positive = Vec::new();
    let mut negative = Vec::new();
    let mut conditional = Vec::new();

    let lines: Vec<_> = text.lines().collect();
    let mut handled = vec![false; lines.len()];
    for (index, line) in lines.iter().enumerate() {
        let lower = line.replace('\\', "").to_ascii_lowercase();
        let Some((position, marker)) = [
            "sponsorship available",
            "sponsorship provided",
            "sponsorship offered",
        ]
        .into_iter()
        .find_map(|marker| lower.find(marker).map(|position| (position, marker))) else {
            continue;
        };
        let tail = &lower[position + marker.len()..];
        let inline = tail.trim_matches(|c: char| !c.is_ascii_alphabetic());
        let answer = if inline == "yes" || inline == "no" {
            Some((inline, line.trim().to_owned()))
        } else if inline.is_empty() {
            lines
                .iter()
                .skip(index + 1)
                .find(|next| !next.trim().is_empty())
                .and_then(|next| {
                    let value = next.trim().trim_matches(|c: char| !c.is_ascii_alphabetic());
                    (value.eq_ignore_ascii_case("yes") || value.eq_ignore_ascii_case("no"))
                        .then(|| (value, format!("{} {}", line.trim(), next.trim())))
                })
        } else {
            None
        };
        if let Some((value, evidence)) = answer {
            handled[index] = true;
            if value.eq_ignore_ascii_case("yes") {
                positive.push(evidence)
            } else {
                negative.push(evidence)
            }
        }
    }

    for raw in lines
        .iter()
        .enumerate()
        .filter(|(index, _)| !handled[*index])
        .flat_map(|(_, line)| split_sentences(line))
    {
        let line = raw.trim();
        let lower = line.replace('\\', "").to_ascii_lowercase();
        if !mentions_immigration(&lower) || line.ends_with('?') {
            continue;
        }
        if contains_any(
            &lower,
            &[
                "no sponsorship required",
                "sponsorship is not required",
                "do not require sponsorship",
            ],
        ) {
            continue;
        }

        let sponsorship_context = contains_any(&lower, &[
            "sponsorship", "sponsor visa", "sponsor work", "sponsor employment",
            "sponsor h-1b", "sponsor h1b", "immigration",
        ]);
        let limited = sponsorship_context && contains_any(
            &lower,
            &[
                "every role",
                "every candidate",
                "all roles",
                "all candidates",
            ],
        ) && contains_any(&lower, &["not", "aren't", "can't", "cannot", "unable"]);
        let negated = !limited
            && (negation_pattern().is_match(&lower)
                || contains_any(
                    &lower,
                    &[
                        "no visa sponsorship",
                        "visa sponsorship is not available",
                        "visa sponsorship is unavailable",
                        "will not sponsor",
                        "cannot sponsor",
                        "does not sponsor",
                        "do not sponsor",
                        "not able to sponsor",
                        "unable to sponsor",
                        "no h-1b",
                        "no h1b",
                        "will not provide sponsorship",
                        "not provide visa sponsorship",
                        "no sponsorship",
                        "without sponsorship",
                        "not offer visa sponsorship",
                        "not offer sponsorship",
                        "sponsorship is not offered",
                        "sponsorship not available",
                        "sponsorship unavailable",
                        "not eligible for sponsorship",
                        "cannot provide sponsorship",
                        "unable to provide sponsorship",
                        "sponsorship: no",
                        "sponsorship - no",
                        "may not be able to",
                        "not support future",
                    ],
                ));
        let explicit_immigration = contains_any(&lower, &["visa", "immigration", "h-1b", "h1b", "work permit"]);
        let is_positive = contains_any(
            &lower,
            &[
                "visa sponsorship available",
                "visa sponsorship is available",
                "visa sponsorship provided",
                "offer visa sponsorship",
                "sponsor visa",
                "sponsor visas",
                "sponsor work visa",
                "sponsor a work visa",
                "sponsor employment visa",
                "h-1b sponsorship",
                "h1b sponsorship",
                "sponsor h-1b",
                "sponsor h1b",
                "provide visa sponsorship",
                "provides visa sponsorship",
                "immigration sponsorship provided",
                "immigration sponsorship available",
            ],
        ) || (explicit_immigration && contains_any(&lower, &[
            "will sponsor", "offer sponsorship", "sponsorship available",
            "can sponsor", "sponsorship is offered", "sponsorship is provided",
            "sponsorship is available", "sponsorship: yes", "sponsorship - yes",
        ]));
        let is_conditional = limited
            || (!negated && sponsorship_context
                && contains_any(
                    &lower,
                    &[
                        "may sponsor",
                        "might sponsor",
                        "could sponsor",
                        "may provide visa sponsorship",
                        "might provide visa sponsorship",
                        "could provide visa sponsorship",
                        "may offer visa sponsorship",
                        "might offer visa sponsorship",
                        "could offer visa sponsorship",
                        "sponsorship may be available",
                        "case-by-case",
                        "case by case",
                        "sponsorship depending on",
                        "eligible for sponsorship",
                        "sponsorship considered",
                        "sponsorship subject to",
                        "transfer existing h-1b",
                        "transfer existing h1b",
                        "h-1b transfer only",
                        "h1b transfer only",
                        "specific treaty",
                        "sponsorship available (e2/",
                    ],
                ));

        if negated {
            negative.push(line.to_owned());
        }
        if is_conditional {
            conditional.push(line.to_owned());
        }
        if is_positive && !negated && !is_conditional {
            positive.push(line.to_owned());
        }
    }

    let (status, evidence) =
        if !positive.is_empty() && negative.is_empty() && conditional.is_empty() {
            (Sponsorship::Available, positive)
        } else if !negative.is_empty() && positive.is_empty() && conditional.is_empty() {
            (Sponsorship::Unavailable, negative)
        } else if !conditional.is_empty() && negative.is_empty() {
            let mut all = positive;
            all.extend(conditional);
            (Sponsorship::Conditional, all)
        } else if positive.is_empty() && negative.is_empty() && conditional.is_empty() {
            (Sponsorship::Unknown, Vec::new())
        } else {
            let mut all = positive;
            all.extend(negative);
            all.extend(conditional);
            (Sponsorship::Unknown, all)
        };
    Finding { status, evidence }
}

fn mentions_immigration(line: &str) -> bool {
    contains_any(
        line,
        &[
            "visa",
            "sponsor",
            "sponsorship",
            "immigration",
            "h-1b",
            "h1b",
            "work authorization",
            "work authorisation",
            "employment authorization",
            "employment authorisation",
            "stem opt",
        ],
    )
}

fn contains_any(text: &str, phrases: &[&str]) -> bool {
    phrases.iter().any(|phrase| text.contains(phrase))
}

fn split_sentences(line: &str) -> Vec<&str> {
    let mut result = Vec::new();
    let mut start = 0;
    let mut chars = line.char_indices().peekable();
    while let Some((index, ch)) = chars.next() {
        if !matches!(ch, '.' | '!' | '?')
            || chars.peek().is_some_and(|(_, next)| !next.is_whitespace())
        {
            continue;
        }
        if ch == '.'
            && line[..index]
                .rsplit(|c: char| !c.is_ascii_alphabetic())
                .next()
                .is_some_and(|word| word.len() == 1)
        {
            continue;
        }
        let end = index + ch.len_utf8();
        result.push(&line[start..end]);
        start = end;
    }
    if start < line.len() {
        result.push(&line[start..]);
    }
    result
}

fn negation_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(
        r"(?i)(?:\b(?:no|not|never|without|cannot|can't|won't|unable|ineligible)\b.{0,80}\b(?:sponsors?|sponsorships?)\b|\b(?:sponsors?|sponsorships?)\b.{0,50}\b(?:not|unavailable|ineligible)\b)"
    ).expect("valid negation pattern"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_common_sponsorship_wording_and_preserves_evidence() {
        for line in [
            "We offer visa sponsorship.",
            "Visa sponsorship is available for this role.",
            "The company will sponsor H-1B candidates.",
            "Immigration sponsorship provided.",
        ] {
            let finding = parse_job_description(line);
            assert_eq!(finding.status, Sponsorship::Available, "{line}");
            assert_eq!(finding.evidence, [line]);
        }
    }

    #[test]
    fn recognizes_denials_and_avoids_authorization_false_positives() {
        assert_eq!(
            parse_job_description("We do not sponsor work visas.").status,
            Sponsorship::Unavailable
        );
        assert_eq!(
            parse_job_description("Must be authorized to work in the US.").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description("No sponsorship now or in the future.").status,
            Sponsorship::Unavailable
        );
        assert_eq!(
            parse_job_description("No sponsorship required.").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description("Candidates must work without sponsorship.").status,
            Sponsorship::Unavailable
        );
        assert_eq!(
            parse_job_description("We are unable to provide visa sponsorship for this role.")
                .status,
            Sponsorship::Unavailable
        );
        assert_eq!(
            parse_job_description("Visa/work permit sponsorship is not available.").status,
            Sponsorship::Unavailable
        );
        assert_eq!(
            parse_job_description("This position is not eligible for sponsorship.").status,
            Sponsorship::Unavailable
        );
        assert_eq!(
            parse_job_description("**Sponsorship Available:**\n No").status,
            Sponsorship::Unavailable
        );
        assert_eq!(
            parse_job_description("**Visa Sponsorship Available:** Yes").status,
            Sponsorship::Available
        );
        assert_eq!(
            parse_job_description("**Visa Sponsorship Provided**\n No").status,
            Sponsorship::Unavailable
        );
        assert_eq!(
            parse_job_description("**Visa Sponsorship Provided**\n Yes").status,
            Sponsorship::Available
        );
        assert_eq!(parse_job_description("The company may not be able to support candidates in certain U.S. visa categories, or support future H-1B sponsorship at this time.").status, Sponsorship::Unavailable);
    }

    #[test]
    fn reports_conditional_and_conflicting_statements_without_guessing() {
        assert_eq!(
            parse_job_description("Sponsorship may be available case-by-case.").status,
            Sponsorship::Conditional
        );
        assert_eq!(
            parse_job_description("We provide visa sponsorship case\\-by\\-case.").status,
            Sponsorship::Conditional
        );
        assert_eq!(
            parse_job_description("We can sponsor work visas.").status,
            Sponsorship::Available
        );
        assert_eq!(
            parse_job_description("We do sponsor visas! However, we aren't able to successfully sponsor visas for every role and every candidate.").status,
            Sponsorship::Conditional
        );
        assert_eq!(
            parse_job_description("Visa sponsorship: We offer sponsorship under specific treaty-based U.S. work visas.").status,
            Sponsorship::Conditional
        );
        assert_eq!(
            parse_job_description("Sponsorship available (E2/O-1).").status,
            Sponsorship::Conditional
        );
        assert_eq!(
            parse_job_description("American Express may provide visa sponsorship for certain positions.").status,
            Sponsorship::Conditional
        );
        assert_eq!(
            parse_job_description("Is this role eligible for immigration sponsorship?").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description("Visa sponsorship: Yes.").status,
            Sponsorship::Available
        );
        assert_eq!(
            parse_job_description("We sponsor visas. We do not sponsor H-1B.").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description(
                "Must work without sponsorship. Sponsorship may be available later."
            )
            .status,
            Sponsorship::Unknown
        );
    }

    #[test]
    fn ignores_unrelated_use_of_sponsor_and_nonimmigration_text() {
        assert_eq!(
            parse_job_description("Our event sponsors include ACME.").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description("Senior software engineer. Build APIs.").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description("We offer sponsorship for conferences.").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description("Base compensation depending on experience, plus stock options.").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description("Remote work option depending on the position.").status,
            Sponsorship::Unknown
        );
        assert_eq!(
            parse_job_description("Compensation, depending on position, includes sponsored benefit programs.").status,
            Sponsorship::Unknown
        );
    }
}
