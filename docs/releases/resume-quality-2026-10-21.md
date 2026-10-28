# Resume quality corrections: October 21, 2026

Four backend defects and one application-server presentation defect are corrected. Parser/generator compatibility patches deploy to existing services; this is not the deferred global strict-admission cutover.

## Changes

- Name extraction preserves an intact name line before splitting positioned fields. Double spaces between given and family names are normalized; the family name is not moved into contact details.
- Skills split at top-level separators. Parenthesized groups keep their text and evidence offsets. Normalization recognizes group members and aliases, preventing repeated tools in fallback categories.
- Non-synthetic metric counts are bounded by the source's available metrics instead of an arbitrary maximum of three. Per-metric provenance, annotation, role association and semantic checks remain. Synthetic-metric behavior is unchanged.
- Long sources may condense to 75% of source word count, subject to the existing configured floor. The upper target remains 112%. Short/single-page rules and factual/entity/role checks remain. Word targets are estimates, not pixel-level PDF fitting.
- Next.js server code maps internal audit codes to readable review messages. This change requires the UI team's application deployment.

## Deployment and validation

Both legacy and strict workers receive the updated agent package while retaining their existing worker/dispatch code and configuration. The legacy parser image receives only the name-parser patch; the `layout-v1` parser receives the corrected converter. Immutable bases, new digests and revisions are in `resume-quality-deployment.json`.

The compatibility parser revision serves default profile traffic; the strict parser retains its `layout-v1` URL. Each worker serves its own corrected revision. Web service routing, recovery scheduling and the global admission trigger are not switched. Legacy generation retains its existing admission contract, as requested. Cleanup remains scheduled separately.

Relevant generator regressions pass 81 tests; profile parsing passes 16 tests. Coverage includes complete names, exact grouped skill spans, alias deduplication, more than three genuine metrics, fabricated-metric rejection and bounded length reduction. The account-scoped failing source reproduces correctly without model calls. UI message regressions, TypeScript, lint and production build pass. Runtime checks verify signed PDF parsing, hashes, service readiness, immutable images and preserved legacy behavior. No paid generation is executed for verification.

Private source/audit data is not committed. Existing saved drafts and review status are not rewritten or automatically approved. Previously parsed sources with split names require reupload/revalidation before regeneration, preserving historical proofs and audit trails.

## UI handoff

After integrating the previous Autofill patch, apply `ui-handoff/resume-quality-followup.patch` from the UI root:

```sh
git apply --check resume-quality-followup.patch
git apply resume-quality-followup.patch
```

The patch updates `lib/resume-review.ts`, `app/actions/resume-applications.ts`, `app/actions/tailored-resume.ts` and adds `scripts/check-resume-quality.cjs`. Resolve conflicts if these files changed. Run `node scripts/check-resume-quality.cjs` and existing type/build checks. No layout, endpoint or environment change is required.

For fresh integration against the original supplied UI, use the current cumulative `ui-handoff/latest-ui.patch` instead. Do not apply both. The initial release ZIP predates these corrections. Vercel deployment remains assigned to the UI team.
