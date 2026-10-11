# Local customer-readiness review — October 11, 2026

Target: http://127.0.0.1:3000. The user explicitly selected localhost. This is a readiness assessment, not a frontend deployment or another paid generation test.

## Verdict

Do not clear this app for customer release yet. One confirmed P1 integration defect blocks PDF export. The same dependency mismatch also leaves free base creation pointing at a missing upstream endpoint. Successful source tests and backend deployment do not establish that the integrated local customer flow works.

## P1-01: Current resume APIs depend on an incompatible older web API

Reproduction: sign in using the existing local session, open Applications, choose the latest Ready resume, select View Resume, then Export PDF. The request returns HTTP 400. The UI displays exactly: “A valid job, resume and template are required”. No Download PDF control appears.

The local app/api/resume/export/route.ts forwards the current modal request and session cookie to JOB_HUNT_WEB_URL, currently job-hunt-web-znsph25yja-ue.a.run.app. The serving GCP web revision was restored to the earlier UI revision as requested. The current request is rejected by that older API. This failure is in the integrated API path; the PDF compiler independently succeeds.

The local app/api/resume/base/route.ts also forwards to that origin. Its upstream POST /api/resume/base returns 404. An unauthenticated local 401 verifies the local guard, but cannot prove that authenticated base creation works. The missing upstream route prevents that implementation from completing. A live base replacement was not attempted.

Owner: the UI server/API integration owner, with the backend owner supplying the compatible compiler/profile services. This is not a request to deploy a frontend to GCP.

Required remediation:

1. Implement the current authenticated base/export contracts on the UI team's own server platform, or a dedicated backend API service. Do not leave these routes forwarding to a historical frontend deployment.
2. Use the actual server implementations in the immutable production-web snapshot at UI source commit 3ba7471, together with their parser, storage and resume libraries. The local-app base/export files are proxy adapters, not standalone server implementations. Do not copy one route in isolation.
3. Provision the selected server runtime's compiler/R2/profile configuration privately. Keep credentials out of the browser and repository. The removed GCP web secret grants are not available to a separate UI runtime.
4. Audit other JOB_HUNT_WEB_URL dependencies in app/actions/tailored-resume.ts for request admission, status, preview and generated output. Their source references do not prove a separate defect, but all deployed request/response contracts must agree.
5. Verify authenticated export returns a usable download URL and actual PDF bytes, free base creation returns application/pdf, and an invalid/stale request preserves the prior draft/file. Save/reopen/export must preserve the same generation ID and manual edits. Repeat the UI team's staging acceptance before release.

## Checks that passed

- Ten fresh localhost HTTP checks: public pages/jobs respond successfully; unauthenticated matched GET/POST, saved jobs and resume export/base reject with 401. Caller-supplied userId does not bypass local authentication.
- Session/keyset/limit and stale-base admission fixtures pass. Stale-base rejection happens before a credit hold; concurrent/same-key requests deduplicate in the admission fixture.
- Fourteen fresh profile/contact/extraction tests pass with synthetic test configuration. Resume and shared-UI regression suites pass, including stale-generation and deleted-base guards.
- Four real synthetic compiler/R2 exports succeed. Each PDF has two A4 pages and retains phone, skills and the project. Test objects are removed only from their own generated UUID prefix. No model call is made.
- Existing saved draft opens with name, phone, LinkedIn, company, education, skills and projects. Fresh Modern Ivy mobile preview at 390 by 844 has two pages and no toolbar button outside the viewport. Other templates are covered by fresh rendering fixtures and actual compiler exports, plus the earlier browser verification.
- Curated jobs retain Last 24 hours/Newest first defaults; requested history shows 10 records. The age window describes when a job was added to Joberry, not a guarantee of the employer's original posting time.
- Profile resume fill populates only the editable review form. Cancel is used; no profile save is submitted. Active uploaded PDF renders successfully in Manage; no missing-file error appears.
- Fresh read-only data checks after export failure: four credits, eight saved drafts, one active readable base, zero active owned runs, zero successful requests missing output, and zero old terminal requests with held credits.

## Limitations and follow-ups

No new paid generation, real resume replacement/deletion, or durable edit/save success was exercised in this review. Their fixture checks and earlier generation evidence are useful, but are not a new end-to-end customer acceptance test. No “zero P1” or exhaustive customer-readiness guarantee is made.

The public support address remains unconfigured. Historical draft text still contains some joined skill words; correct or regenerate those drafts deliberately rather than rewriting history automatically. These are follow-ups, separate from the confirmed export blocker.

The earlier 14 release gates assessed the backend-only deployment and UI handoff scope. They did not certify every integrated local customer workflow. This review has five assessment gates; passing the assessment means the result is documented, not that the app is ready.

Private screenshots, database identifiers, personal resumes, credentials and raw diagnostic logs are retained only in the local review workspace and are not included in GitHub.
