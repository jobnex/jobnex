# Resume live QA and extraction fixes — 2026-10-10

A real production test used the active extractable resume and the latest failed job's description,
through Gemini 3.8 Flash on OpenRouter. The user explicitly approved this provider processing and
one credit. Request c863004f-c011-48d9-96e5-35b0057cb9cd saved a 957-word needs_review draft and
consumed one app credit. It did not fail with a timeout or output-token limit, but it merged three
source projects into one and left genuine compliance failures. Saving a review draft is not a
clean quality pass.

## Root causes and fixes

- Unicode bullets glued to words (for example •Designed) were not recognized because the marker
  regex required whitespace. Project bullets became protected headers, merging separate projects.
  Unicode bullet markers now accept missing whitespace; Markdown hyphens/asterisks retain their
  whitespace requirement.
- Wrapped skill rows were split into separate skills or General categories. Source extraction
  joins physical wraps while retaining verbatim source spans and offsets. Rendering repairs
  newline hyphenation and whitespace for display only. The shared UI parser likewise preserves
  wrapped category items.
- Glued numeric counts such as covering20+ were missed. The numeric parser now recognizes glued
  percentages and plus counts; unit boundaries stop “20 scenarios” being parsed as “20 s”.
- Metric annotations sometimes cited a whole responsibility rather than the exact numeric fact.
  Deterministic recovery resolves only an exact metric contained inside a cited body span in the
  same role/project. It cannot invent a number or borrow a metric from another role.
- “Self-directed” caused a false leadership flag. That adjective is excluded specifically;
  Co-led, Self-led, Architected and genuine ownership claims remain checked.
- A mixed content/length failure triggered a complete length rewrite before content repair.
  Content errors now receive targeted repair first; full fitting runs only for length-only errors.
  Prompts explicitly enforce six bullets per role, four per project and contributor ownership.
- A separate role heading followed by a bold employer/date row created two experience entries in
  the shared UI parser. A bodyless role now accepts that metadata row in its existing entry.

The fixed parser recognizes the approved active source as two roles, three projects and eight
skill categories, with zero ambiguous blocks and all extracted offsets matching original text.

## Code collection for UI and backend developers

Collect the ten changed files from
[source-snapshots/2026-10-10-live-qa](source-snapshots/2026-10-10-live-qa), or
[resume-live-qa-code-2026-10-10.zip](resume-live-qa-code-2026-10-10.zip).
Snapshot .txt copies are reviewable; the ZIP preserves original source filenames.

UI integration: replace the application's lib/resume-parser.ts with the supplied file.
Local source is archive-review-20261008/app-source/my-app/lib/resume-parser.ts;
production source is resume-quality-review/heading-web-build/lib/resume-parser.ts.
All four resume themes share it. No new UI control or design change was introduced.
The A4 preview/delete work remains a separate earlier handoff and is not included in this release.

Backend integration: apply source.py, policy.py, pipeline.py, prompts.py, render.py and models.py together
under resume-agent-inspect/src/low_risk_agent. Add the regression test to the existing tests
directory, which already contains fakes.py. The synthetic TypeScript parser check is included.
The documentation PR is a backup/source collection; it does not install runtime files by itself.

## Validation and production

118 Python regression checks pass; local TypeScript compilation and the synthetic UI parser
check pass. The first saved real draft's contacts and employers render in themes 2, 3, 5 and 6,
while its project-preservation test correctly fails. Browser pixel-level QA remains unavailable
under the browser URL restriction; static rendering is not visual sign-off.

Both production services are verified Ready at 100% traffic:
- job-hunt-web-live-qa-1010; image sha256:116f0314ac94f588bd94f8baaca3c7bc29402b5ebab90d7901a343e028257b11.
  Cloud Build 727396ff-1402-480f-838a-9c3006591eda succeeded; neondb-trial points here.
- job-hunt-resume-worker-live-qa-final-1010; image sha256:fc1865a405a3a48891da52baf8aa2a67e72b32248992d2cc2314678b56c568f8.
  Cloud Build a3c44266-d10c-4007-9a51-ef7edf1fec3d succeeded.

LangSmith tracing remains enabled in resume-builder-gcp with resume/JD content hidden.
The explicitly approved second test, 493025dc-a63b-49c9-91c1-7b6c9fe66d98, saved an 801-word
needs_review draft and consumed one additional app credit. All three projects, both roles and
contacts appear in static rendering for all four templates. Production's draft loader and the
latest-job lookup return this saved result. It exposed partial skill removal, a glued-percent edge
case and incomplete semantic-review coverage; its content is still marked needs_review.

Subsequent fixes restore all original base skills (74 distinct displayed items on the active source),
keep percent units even when the following word is glued, require one review check per claim, and
retry missing review coverage once. Genuine failures remain in the ledger; a second incomplete
response remains a failure. One targeted semantic repair is reserved after deterministic corrections
and length fitting (two regular repairs plus at most one semantic correction). Stall detection
compares progress within the same review phase, rather than mistaking newly discovered semantic
failures for lack of progress in length fitting.

Latest test trace: 01a12785-e4e7-7510-b871-00074c421855. It records Gemini 3.8 Flash,
low writer/review effort and no provider exception; compliance failures still route needs_review.
A final additional paid test has been requested but is not yet approved or submitted.
verify-live-qa-deploy.py verified the final images, readiness and 100% traffic, plus hidden
LangSmith configuration. The second saved draft predates this final worker update and remains
needs_review; no historical draft was silently rewritten or marked completed.
Verification ledger: G1 met; G2 remains unmet pending a clean final paid verification, for which
additional approval is pending. The fixes have regression and deployment verification.

Private source resumes, job descriptions, paid response caches and QA output files are excluded
from GitHub. No message has been sent to the UI team.
