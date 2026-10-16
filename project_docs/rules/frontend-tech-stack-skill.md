# Frontend Tech Stack Skill

## Core

-   Framework: Next.js 16
-   UI: React 19 + TypeScript
-   Styling: Tailwind CSS v4
-   Components: shadcn/ui
-   Icons: Lucide

## State Management

### Server State

-   TanStack Query for all API data.
-   Never duplicate API data in local state.

### Local UI State

-   Zustand for UI-only state (dialogs, drawers, selected items,
    temporary UI).

## Forms

-   React Hook Form
-   Zod for shared validation.

## Tables & Lists

-   TanStack Table for data tables.
-   TanStack Virtual for very large lists and infinite scrolling.

## Resume Editing

-   Tiptap rich text editor.

## Animations

-   Framer Motion.
-   Keep animations subtle and purposeful.

## Notifications

-   Sonner toast notifications.

## Dates

-   date-fns.

## Networking

-   Use the native fetch API.
-   TanStack Query handles caching, retries, loading, invalidation, and
    background refetching.

## Authentication

-   Consume JWT/session supplied by the backend.
-   Keep authentication implementation backend-agnostic.

## Design Principles

-   Mobile-first responsive layouts.
-   Accessible components (WCAG-friendly).
-   Dark/light theme support.
-   Prefer reusable UI primitives over one-off implementations.

## Performance

-   Code splitting through Next.js.
-   Lazy load heavy features.
-   Virtualize large datasets.
-   Avoid unnecessary client state.
-   Memoize only when profiling shows benefit.

## AI Workflow

-   AI generation is asynchronous.
-   Display progress/loading states.
-   Poll or subscribe for completion based on backend capabilities.

## Testing

-   Vitest for unit tests.
-   Playwright for end-to-end tests.

## Linting & Quality

-   ESLint
-   Prettier
-   Strict TypeScript.

## General Guidelines

-   Keep business logic in the backend whenever possible.
-   Frontend focuses on presentation, interaction, validation, and API
    orchestration.
-   Prefer composition over large monolithic components.
-   Avoid Redux unless a clear need emerges.
-   Avoid Axios unless required by backend constraints.
-   Avoid multiple UI libraries.
-   Favor stable, widely adopted libraries over niche alternatives.
