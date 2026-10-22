# Resume fixes for the UI team

The working UI was extracted from `my-app(4).7z`. The active local app is this `my-app` directory. Historical investigation folders are not served. Production services, credits and stored resumes were not changed by this task.

## Fixes

1. **Degrees and education text:** removed the degree-name allowlist. `B.Des`, MS and other supplied degree names survive parsing, inline edits and serialization. Dense legacy education rows and multiline coursework are retained. Paired Markdown emphasis is stripped before unmatched markers, preventing the stray `*` seen in the PDF.
2. **Portfolio links and additional sections:** contacts now retain extra links. Unknown sections such as scholarships, awards and volunteering remain editable, survive repeated saves and render in the updated PDF compiler.
3. **Employment dates:** the worker recognizes `Sep`, `Sept` and `September`, preserving complete date ranges. The UI retains supplied dates instead of replacing them with shortened values.
4. **Skills:** the worker respects standalone Design/Tools headings and blank-line boundaries. Figma is no longer merged with Prompt Engineering and the Tools heading. Source skill categories and their original items remain authoritative. The fallback category is the neutral `Skills`, rather than Data Engineering for every profession.
5. **Malformed data:** saves and exports reject raw parser JSON, malformed repeated role headings, empty experience sections, incomplete role metadata and missing degree text. The worker extracts resume text from recognized parser JSON and rejects metadata-only input.
6. **Review state:** saving an edit does not approve a generation or erase its original audit. Explicit human approval records the generation ID, reviewed Markdown SHA-256 and time. Content changes invalidate that approval. Export verifies the current generation and exact approved content, including a recheck after compilation.
7. **Stale PDFs:** edits invalidate stored PDF references. Downloads go through server checks rather than reusing a stale client URL. Export uses the actual R2 file size, verifies the PDF signature, cleans rejected uploads and deletes only the replaced object instead of pruning an entire prefix.
8. **Saved edits:** listing applications and polling generation status no longer overwrite manually edited resumes. Applications prefer saved content only when it is newer than the matching generation. Original generation review errors are displayed instead of a generic message.
9. **Candidate separation:** removed the process-wide draft file/cache. Draft reads and writes authenticate the user and bind DB operations to that user. Removed shared browser Markdown hydration, background draft saves on template selection and another person's sample resume fallback. Original uploads are not rewritten by draft saves.
10. **Disabled scaffold:** removed dormant base-generation code that invented work history and wrote Markdown bytes into a file labelled PDF. That unfinished feature stays disabled and consumes no credit.
11. **Release compatibility:** removed an invalid runtime export from the Manage page that broke Next.js production builds. Development and production builds use separate output directories.

## Verification

- UI regression checks cover repeated parse/edit/save cycles, degrees, dates, portfolio links, scholarships, volunteering, legacy education and coursework, plus known invalid inputs.
- Export checks use mocked DB, compiler and storage boundaries. They cover unauthorized users, stale generations, unresolved review, content-bound approval, old compiler capability, concurrent generation changes, rejected-upload cleanup, actual file sizes and account-separated draft storage. No live credits or production records are used by these checks.
- The Python suite runs 64 existing generator tests, plus new controls for date spellings, skill boundaries and parser JSON. Unsupported claims and length failures remain review failures; no fabricated padding was added.
- Four Typst templates retain all synthetic resume content. The legacy degree/coursework loss has a separate PDF regression.
- Browser verification exercised the actual new ResumeSheet, changed an inline title, confirmed the remaining content survived, and checked another template. The authenticated local applications page loaded without browser console errors.

Run from this folder:

```powershell
node scripts/check-resume-regressions.cjs
node scripts/check-resume-export.cjs
python backend-fixes/check_generator_regressions.py
node scripts/check-release.cjs
python scripts/check_pdf.py
```

The last check requires `typst` and Python `pypdf`. `check-release.cjs` performs type checking, lint and a production build. The existing Google Fonts imports require network access during a cold build. Test data is synthetic. `scratch/verification/` contains local logs and previews and is not included as application source.

## Rollout

1. Review and deploy the Python worker package and PDF compiler changes in `backend-fixes/README.md`, preserving existing service configuration and secrets. The compiler must advertise `resumeContractVersion: 2` for portfolio links and extra sections; the UI blocks an older compiler rather than silently losing content.
2. Deploy the updated UI with the existing environment configuration. No new database columns or migration are needed.
3. Regenerate the affected historical resumes from the intended original upload. Existing corrupt Markdown and PDFs are not repaired by deploying code. Older generations without a base-resume reference still need the correct upload selected by the user; this task did not invent or backfill provenance.
4. Review any remaining factual or length flags. Human approval is an explicit decision, not proof that a model audit passed. No automated test can guarantee that every future model response or every unrelated app feature will be error-free.

## Deliverables

The ZIP contains the updated UI source, worker package, compiler source, tests and this handoff. It excludes environment credentials, Git history, dependencies, build caches and real candidate records. `resume-fixes.patch` records changes against the supplied UI archive. Keep local `.env.local` private.

The patch omits the old private sample and shared draft file contents. Use the ZIP's sanitized `data/sample-resume.ts` and remove any old `data/resume-compile-payload.json` when applying the patch to an existing checkout. No temporary browser test route is included.
# Current release

For the October 21 backend deployment, current UI source and endpoint/cutover instructions, use `RESUME-UPLOAD-POLICY.md` and the accompanying release documents. Deployment statements below describe the earlier fixes and are historical.

