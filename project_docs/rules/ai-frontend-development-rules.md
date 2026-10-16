# AI Frontend Development Rules

## Philosophy

-   Prioritize readability, maintainability, and scalability over clever
    code.
-   Prefer stable, well-supported libraries.
-   Keep the frontend focused on UI, interaction, validation, and API
    orchestration.
-   Assume business rules belong in the backend.

## TypeScript

-   Use strict mode.
-   Avoid `any`; prefer `unknown` or proper types.
-   Export shared types.
-   Favor discriminated unions over boolean flags.

## React & Next.js

-   Prefer Server Components by default.
-   Use Client Components only when interactivity requires them.
-   Keep components focused on a single responsibility.
-   Prefer composition over inheritance.
-   Minimize prop drilling.

## State

-   API data: TanStack Query only.
-   UI state: Zustand only.
-   Do not duplicate server state locally.

## Data Fetching

-   Use native fetch.
-   Handle loading, error, empty, and success states.
-   Use optimistic updates only when appropriate.
-   Invalidate queries after mutations.

## Forms

-   React Hook Form + Zod.
-   Validate on both client and server.

## Styling

-   Tailwind CSS utilities first.
-   Use shadcn/ui primitives before creating custom components.
-   Avoid inline styles unless dynamic.

## Accessibility

-   Keyboard accessible.
-   Semantic HTML.
-   Proper labels and ARIA only where needed.
-   Visible focus states.
-   Sufficient color contrast.

## Performance

-   Lazy load heavy features.
-   Virtualize long lists.
-   Optimize images.
-   Memoize only after profiling.
-   Avoid unnecessary re-renders.

## UX

-   Every async action needs feedback.
-   Never leave blank screens.
-   Confirm destructive actions.
-   Preserve user progress where possible.

## AI Features

-   Treat AI operations as asynchronous jobs.
-   Support queued, running, success, and failed states.
-   Allow retry for recoverable failures.

## Error Handling

-   Show user-friendly messages.
-   Log technical details separately.
-   Never expose stack traces.

## Security

-   Never trust client input.
-   Never store secrets in frontend.
-   Sanitize rendered HTML.
-   Protect authenticated routes.

## Code Quality

-   Small reusable functions.
-   Avoid duplicate logic.
-   Prefer explicit names.
-   Remove dead code.
-   Add comments only when intent is not obvious.

## Dependencies

-   Reuse existing libraries before adding new ones.
-   Avoid introducing overlapping packages.

## Testing

-   Add tests for critical business flows.
-   Prefer integration tests for user journeys.

## Definition of Done

-   Responsive.
-   Accessible.
-   Typed.
-   Loading/error/empty states implemented.
-   No console errors.
-   Lint passes.
-   Production-ready.
