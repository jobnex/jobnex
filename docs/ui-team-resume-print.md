# Resume PDF print isolation and four template choices

## Cause and fix

Export PDF calls the browser's print function. Previously only modal controls were hidden. The job application page, footer, and tracker remained in the print document. The modal was also nested in page layout, with a fixed viewport, scroll container, zoom transform, and eleven-inch preview height. Those screen dimensions could create extra printed pages.

The resume modal now renders in a body portal. Its print stylesheet hides every other body child, removes fixed positioning, scroll constraints and zoom from preview wrappers, and prints the paper at US Letter width with its existing padding. Closing the modal removes these print rules. This fixes every ResumeModal caller, including My Applications and the background draft viewer.

Screen preview remains limited to eleven inches. Print removes that limit and hidden overflow so a genuinely longer resume can paginate completely. It does not force long content into one page or silently discard it. The overflow warning now describes this behavior instead of claiming browser printing invokes Typst.

## Four distinct layouts

| Visible template | ID | Backend theme |
| --- | --- | --- |
| MIT CAPD Classical | `mit-capd` | 2 |
| Modern Ivy LaTeX | `modern-ivy` | 3 |
| Tech Specialist | `tech-specialist` | 6 |
| Minimalist Executive | `minimalist-exec` | 5 |

The Rust PDF backend supports four render themes, with six accepted IDs because two IDs are aliases. Contemporary Compact reused theme 3; Standard Academic reused theme 2. Their duplicate choices are removed from the shared UI catalog. Existing saved `contemporary-compact` selections resolve to `modern-ivy`; `standard-overleaf` resolves to `mit-capd`. Theme appearance remains the same, and new local selections/saves use canonical IDs. Backend alias acceptance remains for compatibility. No GCP service is deleted, and no DB history is removed.

## Frontend files

- `components/ResumeModal.tsx`: body portal, print-only layout, canonical template selection, accurate overflow warning.
- `components/ResumeSheet.tsx`: stable print classes on the sheet and paper.
- `data/resume-templates.ts`: four visible choices and old-ID resolution.
- `store/useResumeStore.ts`: restore and save canonical selections, including old local-storage IDs.
- `scripts/test-resume-print.cjs`: actual template, store and modal regression checks.

Both the running local frontend and Git checkout are updated. A separate UI deployment must integrate these files with the existing resume modal/store. Export PDF continues to use browser printing; existing backend PDF endpoint contracts and saved alias IDs remain supported.

## Verification

Offline PDF checks use markup captured from the real signed-in resume preview and its complete app/inline CSS. An isolated Chromium renderer prints copies of those fixtures; it does not automate the signed-in browser. All four templates produce one US Letter page without application UI. The same resume at 200% preview zoom produces one page with identical extracted text. A synthetic long-content fixture prints five pages and retains its final marker. Replacing the new print rules with the previous rules produces three pages and includes the application-control marker.

Node regression checks cover the four actual Rust template mappings, both old aliases, local-store restore/save, body portal target, Export PDF callback, and server-render guard. TypeScript and scoped lint checks accompany the release. No AI generation, credit debit, real application-stage change, or stored resume rewrite is needed to test this change.
