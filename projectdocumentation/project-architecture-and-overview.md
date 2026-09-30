# Strawberry Jobs — Project Architecture & Codebase Overview

> **Version:** 1.0.0  
> **Last Analyzed:** August 2026  
> **Workspace / Repository:** `geeth-chand/strawberryjobs` (`my-app`)  
> **Design Philosophy:** Neo-Minimalism • Editorial Structure • Tactile Physical Physics • Electric Accent Theory

---

## 1. Executive Summary & Purpose

**Strawberry Jobs** is a modern, high-conversion talent discovery and job-hunting SaaS web application. It connects professionals with verified technical, design, marketing, and product opportunities across leading companies while providing a specialized **Job Hunt** portal to curate roles, fine-tune matching criteria, manage application quotas, and trigger AI-assisted candidate resume workflows.

---

## 2. Tech Stack & Dependencies Matrix

| Category | Technology | Version | Purpose & Implementation Details |
| :--- | :--- | :--- | :--- |
| **Framework** | [Next.js](https://nextjs.org/) | `16.3.0` | App Router, React Server Components (RSC), Strict TypeScript, Turbopack support |
| **UI Library** | [React](https://react.dev/) | `19.2.8` | Modern concurrent features and hooks |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | `^5.0.0` | Strict type checking without `any` types |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | `^4.0.0` | PostCSS v4 engine, inline `@theme` tokens, dynamic CSS variables |
| **Component Primitives** | [Base UI](https://base-ui.com/) & [shadcn/ui](https://ui.shadcn.com/) | `^1.7.0` / `^4.18.0` | Accessible headless primitives with `class-variance-authority` (CVA) |
| **Icons** | [Lucide React](https://lucide.dev/) | `^1.31.0` | Crisp SVG vector icon library |
| **Server State** | [TanStack React Query](https://tanstack.com/query) | `^5.101.4` | Server cache, query invalidation, background refetching, and `keepPreviousData` |
| **Client UI State** | [Zustand](https://zustand-demo.pmnd.rs/) | `^5.0.15` | Lightweight store for active filters, search inputs, modal visibility, and selection |
| **Forms & Validation** | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) | `^7.85.0` / `^3.25.76` | Controlled/uncontrolled form handling with schema validation via `@hookform/resolvers` |
| **Notifications** | [Sonner](https://sonner.emilkowal.ski/) | `^2.0.8` | Toast feedback system |
| **Theming** | [next-themes](https://github.com/pacocoursey/next-themes) | `^0.4.6` | Persistent light/dark mode using `data-theme` and `class` strategy |

---

## 3. Design System & Visual Language

The design system blends **Neo-Minimalist structural principles** with **tactile spring physics** and high-contrast color palettes:

### Core Visual Tenets
1. **Lightweight Structural Outlines:** Sharp `1.5px` borders applied exclusively to macro containers, major cards, and hero buttons. Inner tags, badges, and metadata pills remain border-free with soft neutral backgrounds.
2. **Directional Bottom-Only Drop Shadows:** Distinct physical drop shadows (`0px 3px 0px` to `0px 6px 0px`) for mechanical depth without multi-directional blur.
3. **Hero Accent Hierarchy (80/15/5 Rule):**
   - **80% Neutral Canvas:** Off-white (`#F8F9FA`) in light mode; layered slate (`#111216` canvas -> `#1C1E26` card -> `#151720` recessed input) in dark mode.
   - **15% Muted Structural Tone:** Deep slate `#111827`, hairline dividers (`#E5E7EB` / `#242838`), and neutral tags.
   - **5% Vibrant Accent:** High-Voltage Electric Lime (`#B9FF66` in light / `#ACEE5F` or `#00FF7F` in dark) reserved strictly for primary CTAs and active states, paired with Strawberry Red (`#FF3B5C`) for brand identity and badges.
4. **Tactile Spring Physics:** Smooth cubic-bezier transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) with mechanical click depression (`translateY(2px)` and reduced shadow depth).
5. **Typography Hierarchy:**
   - **Headings:** `Space Grotesk` (weights 700 / 800) with tight tracking (`-0.025em` to `-0.035em`).
   - **Body & UI:** `Plus Jakarta Sans` / `Geist` for crisp readability.
   - **Code & Captions:** Monospace (`JetBrains Mono` / system mono).

---

## 4. Codebase Architecture & File Structure

```
my-app/
├── app/
│   ├── api/
│   │   └── jobs/
│   │       └── route.ts             # API Route: Returns filtered jobs based on query params
│   ├── job-hunt/
│   │   ├── applications/
│   │   │   └── page.tsx             # Route: /job-hunt/applications (Application tracker placeholder)
│   │   ├── manage/
│   │   │   └── page.tsx             # Route: /job-hunt/manage (Job search preferences & resume upload)
│   │   ├── layout.tsx               # Sidebar layout wrapper for all /job-hunt subroutes
│   │   └── page.tsx                 # Route: /job-hunt (Curated Jobs with "Jobs" vs "Requested" tabs)
│   ├── favicon.ico                  # Application favicon
│   ├── globals.css                  # Design tokens, CSS variables, typography & theme overrides
│   ├── layout.tsx                   # Root application layout (Fonts, Providers, Header, Modal, Footer)
│   ├── page.tsx                     # Route: / (Public Job Board with debounced search & 3-col grid)
│   └── template.tsx                 # Directional slide & fade page transitions
├── components/
│   ├── ui/
│   │   └── button.tsx               # Reusable CVA button primitive with Base UI
│   ├── ApplyModal.tsx               # Resume request modal (React Hook Form + Zod schema validation)
│   ├── Footer.tsx                   # Global dark footer with brand mark, links, and socials
│   ├── Header.tsx                   # Sticky navigation bar with tab toggle & theme switcher
│   ├── JobCard.tsx                  # Standard interactive job listing card
│   ├── PremiumJobCard.tsx           # Highlighted job card with gradient borders & glowing shadow
│   ├── JobGrid.tsx                  # Responsive grid component with zero-results empty state
│   ├── JobHuntSidebar.tsx           # Sidebar navigation for Job Hunt with application quota counter
│   ├── Providers.tsx                # TanStack QueryClientProvider & next-themes ThemeProvider
│   └── SearchFilterBar.tsx          # Keyword search input, location dropdown & category filter pills
├── data/
│   └── jobs.ts                      # Job type interface and default mock dataset
├── lib/
│   └── utils.ts                     # Utility functions (cn helper combining clsx + tailwind-merge)
├── store/
│   └── useJobStore.ts               # Zustand store for query, filter parameters, and modal state
├── refrence/
│   ├── design.md                    # Official Neo-Minimalist SaaS Design System documentation
│   ├── rules/
│   │   ├── ai-frontend-development-rules.md # Frontend development standards & rules
│   │   └── frontend-tech-stack-skill.md     # Official stack specifications & libraries
│   └── jobs-refined-mobile-test.html        # HTML prototype reference for mobile testing
├── forms_guide.md                   # Semantic form structuring & accessibility guide
├── components.json                  # shadcn/ui configuration
├── next.config.ts                   # Next.js compiler & runtime configuration
├── package.json                     # Project manifest and dependency declarations
├── postcss.config.mjs               # PostCSS configuration for Tailwind v4
└── tsconfig.json                    # TypeScript strict mode configuration
```

---

## 5. Application Features & Route Breakdown

### 5.1. Public Job Board (`/` — `app/page.tsx`)
- **Search & Debouncing**: Live search bar with custom 400ms debouncing hook (`useDebounce`) to avoid excessive API requests.
- **Filtering**: Dropdown for location (Remote, NY, SF, Austin, Chicago, London) and pill buttons for categories (Engineering, Design, Marketing, Product).
- **Data Fetching**: Consumes `/api/jobs` through TanStack Query (`useQuery`) with `keepPreviousData: true` and a 5-minute `staleTime`.
- **Card Grid**: Responsive 3-column grid featuring interactive cards, bookmark toggles, and direct application triggers.

### 5.2. Curated Job Hunt Dashboard (`/job-hunt` — `app/job-hunt/page.tsx`)
- **Segmented Views**: Interactive sub-tabs switching between **Standard Jobs** and **Requested Resumes**.
- **Visual Distinction**: Uses `PremiumJobCard` with teal-to-purple gradient highlights and subtle elevated offsets.
- **Search & Action Bar**: Quick filter, "Add Job" button, and "Fetch Jobs" synchronization trigger.

### 5.3. Preferences & Profile Manager (`/job-hunt/manage` — `app/job-hunt/manage/page.tsx`)
- **Resume Dropzone**: Interactive drag-and-drop file upload with visual active states.
- **Location Selector**: Country selector with dynamic city chip tags (enforces a 3-city maximum limit).
- **Domain & Skills Matrix**: Tag toggle system for roles (Frontend, Backend, Product, UX, etc.) and core skills (React, TypeScript, AWS, Python, etc.).
- **Experience & Salary**: Target experience selectors and minimum/maximum salary inputs.

### 5.4. Applications Tracker (`/job-hunt/applications` — `app/job-hunt/applications/page.tsx`)
- **Status**: Scaffolded placeholder ready for application lifecycle tracking (Applied, Interviewing, Offered, Rejected).

### 5.5. Candidate Resume Modal (`components/ApplyModal.tsx`)
- **Validation**: Schema-driven validation using `zod` and `react-hook-form` (`name`, `email`, optional `urgency` and `notes`).
- **Feedback**: Displays Sonner toast confirmations upon simulated submission with custom brand styling.

---

## 6. State Management Architecture

```
                      ┌───────────────────────────────────────────────┐
                      │                 APPLICATION                   │
                      └───────┬───────────────────────────────┬───────┘
                              │                               │
              ┌───────────────▼──────────────┐ ┌──────────────▼──────────────┐
              │    SERVER STATE (API Data)   │ │    CLIENT STATE (Local UI)  │
              │     TanStack React Query     │ │          Zustand            │
              └───────────────┬──────────────┘ └──────────────┬──────────────┘
                              │                               │
            • Cached queries (`queryKey: [...]`)• Search text (`searchQuery`)
            • Background refetching          • Selected location / category
            • Loading / Error / Fetching states• Modal open state (`isModalOpen`)
            • Optimistic cache updates       • Active candidate (`selectedJob`)
```

- **Rule**: Server data is never duplicated into local component state.
- **Zustand Store (`store/useJobStore.ts`)**: Manages strictly transient UI state (filters, dialogs, active job).

---

## 7. Guidelines for Future Development

When extending or modifying this codebase, adhere to these established standards:

1. **Server vs. Client Components**:
   - Keep components as React Server Components (RSC) by default.
   - Use `"use client"` only for components requiring hooks, DOM event listeners, or browser APIs.
2. **Styling & Tokens**:
   - Always reference design tokens (`var(--bg-page)`, `var(--brand-lime)`, `var(--shadow-bottom-sm)`).
   - Avoid hardcoded ad-hoc hex values where design tokens exist.
3. **Component Composition**:
   - Maintain small, single-responsibility components under `components/`.
   - Prefer composition over prop-heavy monolithic structures.
4. **Accessibility & Semantics**:
   - Ensure all interactive elements have visible focus rings (`--shadow-focus-ring`) and semantic roles.
   - Validate forms using React Hook Form + Zod.
5. **Quality & Verification**:
   - Always verify type safety via `npx tsc --noEmit` before completing tasks.
   - Ensure both Light and Dark modes render with proper contrast and aesthetic polish.
