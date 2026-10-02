# Experience coverage repair plan

## Findings from production descriptions and parser version 4

The remaining blanks include real extraction defects, legitimate non-experience year expressions, optional experience, and requirements that the integer column cannot represent. The existing `unknown` reason mixes these cases and therefore cannot explain individual failures.

Confirmed failure patterns:

| Pattern | Production example | Cause in the parser |
| --- | --- | --- |
| Preferred certification hides required experience | Sr. Systems Engineer: PE certification preferred, then 5+ years of systems engineering experience | Any short preference line without years becomes a preferred section. Later required bullets are skipped. |
| Semicolon changes section state | Director – Investment Accounting: degree; certification preferred, followed by 8+ years of investment accounting experience | Splitting on semicolons makes a short inline certification clause look like a section heading. |
| Unsupported bullet | Sr Data Center Tech: `● 5+ years of experience` under Essential Criteria | Requirement-start logic strips only a small set of bullets. |
| Abbreviations and long clauses | Principal GenAI Specialist SA: 10+ years of technology-domain experience with an `e.g.` list | Tail scanning stops at every period and after 110 characters, before reaching “experience.” |
| Label before number | Appian Business Process Analyst: `Appian Expertise: 5+ years of hands-on experience` | The prefix is neither empty nor one of the hard-coded requirement phrases. |
| Experience implied by activity | Senior Data Architect: 7+ years in data architecture; Software Engineer II: 2+ years building software applications | The parser requires the word “experience” or an explicitly recognized experience heading. |
| False education ambiguity | Workstream project manager: 10+ years managing ERP programs “or equivalent scope” | “or equivalent” is treated as an education alternative even when it refers to project scope. |
| Exact requirement not representable | Community Administrative Coordinator: minimum 6 months of relevant experience | The parser only handles integer years. |
| Genuine conditional education | Bachelor’s + 4 years, graduate degree + 2 years, or no degree + 8 years | One unconditional integer loses the degree conditions. |
| Correctly excluded quantity | Age 18, three-year project duration, preferred experience, recent polygraph requirement | Numeric years do not necessarily measure required job experience. |

Production pattern counts observed during this investigation: 28,793 unresolved descriptions contain a short preference line; 2,850 contain numeric years followed by an activity such as “working,” “building,” “across,” or “in”; 660 contain a number before `e.g.`; 49 contain a sampled unsupported bullet followed by a number. A separate query found 115 unknown descriptions containing a narrow numeric-month experience pattern. These are overlapping search hits, not confirmed defect counts, and ingestion changes totals while queries run.

## Implementation order

1. **Make failures observable.** Extract every numeric experience candidate and retain its evidence, section, unit, lower/upper bound, classification, and rejection reason. Separate `not_stated`, `preferred_only`, `non_experience_quantity`, `conditional_education`, `unsupported_expression`, and `uncertain_context`. Record which parser rule rejected each candidate. Do not count a scanned job as successfully extracted merely because it was visited.
2. **Fix section and clause handling first.** Only actual headings change required/preferred section state. A preferred certification or optional skill affects its own clause. Normalize Unicode bullets and Markdown escapes; support candidate-profile headings and labels. Preserve abbreviations and decimals, and inspect the complete relevant clause rather than an arbitrary 110-character tail. Accept activity-based experience within a clearly required qualification section while excluding age, benefits, company history, and project duration.
3. **Parse quantities faithfully.** Support months, decimal years, spelled-out numbers, ranges, and “or more.” Store exact quantities in months in structured metadata. Keep the existing integer field for whole-year unconditional requirements; do not silently round six months to zero or one year.
4. **Represent alternatives.** Add structured requirement metadata for education branches and specialty requirements, preserving their evidence. Identify what “or” connects: skills, equivalent scope, education, or separate eligibility branches. Keep independent requirements. Evaluate degree-dependent branches against the user’s education in matching rather than flattening them to one misleading number.
5. **Measure coverage before rollout.** Build a manually reviewed set of 300–500 cases stratified across numeric unknowns, education alternatives, months, legitimate exclusions, and existing successful matches. Turn confirmed failures into regression cases. Audit every published description with the optimized Rust binary and compare gained, changed, and cleared values. Review a sample of each output category.
6. **Roll out and account for leftovers.** Validate on the existing Neon review branch, run Rust tests and Clippy, preserve manual overrides, and verify queue locking and changed-description handling. Deploy a new parser version to the existing GCP job, reprocess the backlog, and retain the 30-minute schedule. Verify production counts and publish a reason breakdown for every remaining blank.

Start with deterministic Rust parsing. Consider a cached, evidence-constrained second-pass classifier only if reviewed residual cases demonstrate that it is needed. It must classify quoted requirements and return unknown when no explicit requirement exists; it must never infer years from seniority or invent a number.

## Acceptance gates for implementation

- All confirmed production examples above have regression cases with the correct required, preferred, conditional, or excluded result.
- Every detected candidate receives a stored classification or a specific unresolved reason; no silent truncation of candidate coverage.
- Precision and recall are reported on the manually reviewed set, separately from full-corpus scan counts. Target at least 99% precision and 95% recall on that reviewed set; unmet targets must be reported.
- Months and education alternatives preserve their exact meaning in metadata and matching.
- Existing successful extraction, manual overrides, concurrency, and changed-description behavior remain verified.
- Production backfill succeeds, pending work is accounted for, the existing schedule is enabled, and remaining unknowns have an auditable reason breakdown.

No numeric value should be fabricated for a description that states only “relevant experience.” Zero is reserved for an explicit zero/no-experience requirement with the correct scope.
