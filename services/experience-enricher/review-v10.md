# Experience parser V10 review audit

Audited on 2026-10-03. The user reported 601 review jobs; ongoing ingestion raised the sampled review cohort to 614. Every cohort description was processed offline and the distinct candidate expressions were inspected. This report describes that fixed cohort, not a guarantee for future postings.

The corrected parser resolves 570 review statuses. It recovers unconditional whole-year values for 245 jobs. The remaining 44 review jobs all have malformed numeric expressions; none has an uncertain-context candidate. Other dispositions retain preferred, conditional, approximate, fractional, recency and ceiling requirements without inventing a scalar minimum.

Fixes cover applicant wording, escaped and compact formatting, written and fractional quantities, detached degree paths, role ladders and eligibility alternatives. Controls also exclude company histories, content age, degree durations, benefit tenure, program and contract lengths, residency, renewal deadlines, biographies and future milestones while preserving genuine program-management requirements.

Validation: 14 Rust test functions passed in the Linux image; strict Clippy passed; 176 offline numeric controls and 44 candidate-classification duration controls passed. Isolated database integration passed with 1,000 real descriptions, update invalidation, idempotency, manual-value preservation and SKIP LOCKED checks. A 500-job numeric control sample retained 498 values; the other two were explicitly approximate targets. Full-corpus and deployed counts are recorded in deployment.reference.json after rollout.

The final read-only corpus scan processed 137,122 published descriptions: 95,339 produced unconditional whole-year minima, 615 retained exact fractional/month requirements, and 44 profiles remained needs_review. All 44 belonged to the audited malformed-source cohort. Counts can move as ingestion continues. The scan found 269 unsupported-expression and 285 uncertain-context candidates across all profiles; these are retained in structured evidence, including profiles with another valid minimum.

Production V10 backfill completed at 2026-10-03T16:34:16Z: 137,459 jobs processed, 5,539 numeric values changed, zero queue entries remaining at completion. The scheduler-triggered catch-up run then processed 170 more postings successfully. At 16:42:37Z, production had 137,672 published jobs, 137,662 completed V10 profiles, 95,683 numeric values and 44 review profiles; all review profiles had unsupported numeric expressions and none had uncertain-context candidates. Ten new arrivals remained queued. The scheduler is enabled at minutes 10 and 40 UTC. These fresh arrivals are separate from unresolved review cases.

## Source ambiguity remains

Expressions such as `3 5 years`, `46 years`, `510+ years` and `10 15 years` do not establish a verified range. The parser retains their evidence as unsupported_expression and leaves the unconditional value unknown. The checked [original Adobe posting](https://www.linkedin.com/jobs/view/4469169551) repeats both `5 8+ years` and `3 5 years`; a parser-only rewrite would be an estimate. The other sources have not all been confirmed live. No source clarification or authorization for estimates has been received. Zero review is unmet, and zero extraction gaps is not certified.

A needs_review count measures unresolved profiles, not every uncertain candidate: a profile with an independently valid requirement may still contain additional uncertain or malformed candidates in its requirements array. Matching should use the structured profile rather than treating a populated integer as complete evidence.

## Fixed-cohort dispositions

| Disposition | Jobs |
| --- | ---: |
| needs_review | 44 |
| required | 257 |
| recency_constraint | 8 |
| not_quantified | 203 |
| conditional_alternatives | 24 |
| experience_target | 50 |
| experience_ceiling | 9 |
| required_with_alternatives | 3 |
| conditional_education | 3 |
| preferred_only | 5 |
| not_stated | 8 |

## Remaining fixed-cohort jobs

| Job ID | Malformed evidence |
| --- | --- |
| 00079f49-ce78-5f75-8cf7-90aa6905c1ba | Role Overview: We seek a highly experienced Lead Adobe Architect with 8 10+ years in digital analytics, tag management, customer data platforms, and marketing technology |
| 0083c51d-eed1-5aa3-af22-cda919f306f8 | 46 years of relevant technical or business work experience. |
| 05ee8594-3d2f-52f1-9fd0-fd733b6ccf3e | Bring 5 8+ years of frontend development experience, with at least 3 5 years focused on the Adobe Experience Cloud ecosystem. |
| 0ebe577e-5211-565a-b0ad-8cd7576e6133 | 510+ years of experience in IT user enablement, digital adoption, or advanced IT solutions delivery. |
| 10a7b332-92e6-59d4-beba-d96aeb48d9d2 | 10 15 years of experience in IT, with a focus on cloud architecture and solutions. |
| 1a3558a9-d041-5fb7-b7e6-376782814906 | Approximately 510 years of experience in electro-mechanical, electronic, or mechanical drafting environments. |
| 20216f8f-fa54-539b-a20e-392ac4ee1f06 | Must Haves Bachelor s degree in Food Science, Dairy Science, Meat Science, Chemical Engineering, or related/equivalent field (from job description) Minimum 3 4 years of real world product development experience (not entry level) Strong benchtop formulation capability identified as the most critical skill for the first 90 days Hands on experience running bench experiments, prototype work, analytical measurements, and related lab techniques Ability to manage multiple projects with s |
| 20fa33c7-709a-5c58-a87c-5b14acfc949a | 510+ years of experience in IT user enablement, digital adoption, or advanced IT solutions delivery. |
| 2121e5e7-171b-50fb-8bf8-ac851b95b007 | 56+ years of compensation experience at a technology company, including end-to-end ownership of compensation programs or planning cycles |
| 247ce833-4ecb-5c3e-9530-7aee716abb86 | 10 15+ years of experience across software engineering, platform engineering, distributed systems, cloud architecture or related engineering disciplines. |
| 2633036c-2e09-5792-9945-27e29abd33a3 | 5 7 years of experience with large and complex Technology related projects process design gathering |
| 29cfa5d1-ce03-5a81-9494-eb1368a40eef | 0 2+ years of hands on AWS experience and confidence navigating the AWS Management Console. |
| 2a07583f-461c-57a4-8c49-c00457dfaf1a | 710 years of experience in contracts administration, preferably with cradle-to-grave responsibility in government and defense contracts. |
| 2b2ebdaa-e7bd-5a2d-a5a9-6e773a40bff9 | 520 years of professional architectural experience, with strong technical capabilities required at all levels and continued hands-on technical involvement for higher-experience candidates. |
| 2bfaaca6-ad86-5d66-b2f8-b773e37bb51e | 12 20 years of experience with multiple SAP S/4HANA implementations and the ability to explain how they helped design the finance processes and SAP solution from blueprint through go-live. |
| 39b83ee3-0fa9-5842-8c8e-89d7371a8881 | 6 9 years of experience in data analytics, data warehousing, data modeling, or related disciplines. |
| 3b3a8f6a-b2a6-5ce5-9191-c084b957e8e0 | 10 15+ years of experience across software engineering, platform engineering, distributed systems, cloud architecture or related engineering disciplines. |
| 3f21854c-618c-5278-8561-889d3d51dbbe | 6 9 years of hands on software development experience in enterprise environments. |
| 454a9ead-375d-5d4d-ad01-13c0f0cc0862 | 56+ years of compensation experience at a technology company, including end-to-end ownership of compensation programs or planning cycles |
| 55e93ceb-3488-5c43-9dd2-c77a11deee00 | 2 5 years of relevant engineering experience. |
| 67742036-549e-51e7-a11f-364633bbe0b1 | 710 years of experience in contracts administration, with demonstrated cradle-to-grave experience in government and defense contracts. |
| 6cfce478-5faa-5b01-8673-4b1c934959ff | Looking for a Full Stack Java Lead Developer with 8 10 years of experience who can lead development efforts, provide technical guidance, and work effectively within an Agile/Scrum environment |
| 784cfcd3-af6e-57e5-8f85-984f0ba0a711 | 8 10 years of experience in IBM DataStage (Development + Admin). |
| 7c676d4a-b757-5023-9ba5-b802872e3409 | Bachelor's degree plus 10 15+ years of program management experience leading federal or mission critical programs. |
| 7d6efdf4-8b97-5d72-a1c5-8ac6270ad807 | 6 9 years of hands-on software development experience. |
| 7e573f7a-26aa-5b1b-9f66-fdbc99f21f44 | Experience Required Experience: 2 4 years in data engineering with direct pipeline migration/replatforming experience (eg, moved Alteryx to Dataiku |
| 80160e24-7fea-514a-a1f7-d9eca94c6510 | 5 10 years overall, 3+ in GenAI/Agentic AI |
| 890a9a64-fb35-5c15-9ad6-5f4e72428dea | 5 7 years of experience with large and complex Technology related projects process design gathering |
| 897265a9-6fb5-506c-bb67-6e9cb0635652 | 10 15 years of experience in IT, with a focus on cloud architecture and solutions. |
| 8e6afac1-1f05-513b-a257-fed007a34769 | 56+ years of compensation experience at a technology company, including end-to-end ownership of compensation programs or planning cycles |
| 8f7a7168-fb20-5c15-9c41-bd2a0a48e188 | 6 10 years of System Administration experience. |
| 9558557c-fc47-593b-9533-95faec03ee59 | 10 15 years of relevant experience in ECM / Documentum ecosystem |
| a6d37d5f-0bc0-55e1-a6c1-85af6ddfb043 | 3 5 years’ experience in quality engineering role in chemical, rubber, or plastic industries. |
| adbd1c3d-c267-5be5-af31-3eba144a801b | Minimum 8 10 years of SAP PP consulting experience. |
| be6aac30-9978-51dd-b373-2209fe90ea21 | 3 5+ years of experience in data review, data quality, quality assurance, or analytical roles |
| c5ff1922-28ea-5214-ba50-4f213089665b | 3 5 years of relevant laboratory experience in molecular biology, genomics, or a related field. |
| d5a5a00f-35a2-50c6-831a-25747fe1d440 | 710+ years of professional software engineering experience. |
| d6665942-bcb5-5886-affd-f4671e0b337b | 10 15 years of experience in IT, with a focus on cloud architecture and solutions. |
| e1beb37b-fdc1-5e8c-b7a3-a3113ba45e1d | 7+ years of overall Unix/Linux administration experience with at least 2 3 years on AWS. |
| e79a6df4-c2ee-5137-838c-a946114166fd | Typically, 47 years of electrical engineering experience. |
| eccd26b5-b213-5d34-a2b8-530469ae7e0d | 10 15 years of experience in IT, with a focus on cloud architecture and solutions. |
| ef586d70-b62d-5a41-bd29-d4fbff53c74a | 8 10 years of hands-on development and engineering experience, including experience in a Technical Lead capacity. |
| f6401635-146f-5d57-af9d-f2b46bafa7ed | 10 15+ years of professional experience across software engineering, platform engineering, distributed systems, cloud architecture, or related engineering disciplines. |
| f9535548-c83b-5da9-a7dd-1d983e204e08 | 10 15 years of experience in IT, with a focus on cloud architecture and solutions. |
