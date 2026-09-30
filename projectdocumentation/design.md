# Strawberry Jobs — Neo-Minimalist Design System & UI Specification Guide (`design.md`)

> **Version:** 2.0.0  
> **Target Framework:** Next.js 16 (App Router), React 19, Tailwind CSS v4  
> **Philosophy:** Architectural Neo-Grotesque Structure • Tactile Physical Physics • Bottom-Only Directional Shadows • Electric Lime Accent Theory • Color-Variant Card Hierarchy  
> **Optimized For:** AI Coding Agents, Automated Engineering Pipelines, and Full Design-to-Code Parity.

---

## 1. Design Philosophy & Architectural Tenets

Strawberry Jobs blends **neo-grotesque architectural structure** with **high-precision digital minimalism**. The interface rejects standard generic SaaS layouts in favor of an unmistakable tactile identity: high-contrast monochromatic structural frames, physical bottom-only drop shadows, razor-sharp `1.5px` container strokes, and high-voltage Electric Lime conversion highlights.

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                    MACRO CONTAINER (JobCard / Panel)                   │
 │  • Crisp 1.5px solid border (--border-color: #111827 / #31364A)        │
 │  • Directional bottom-only drop shadow (0px 4px 0px 0px var(--shadow)) │
 │  • Geometric structured radius (--radius-card: 8px)                    │
 │                                                                        │
 │   ┌────────────────────────────────────────────────────────────────┐   │
 │   │                   INNER METADATA BADGES                        │   │
 │   │  • Borderless soft-tint fills (--bg-tag: #F3F4F6 / #1E212D)    │   │
 │   │  • Crisp micro-typography (0.76rem font-semibold)              │   │
 │   │  • High-contrast accent tags (Salary: Lime tint, Visa: Theme)  │   │
 │   └────────────────────────────────────────────────────────────────┘   │
 │                                                                        │
 │   ┌──────────────────────────────┐  ┌──────────────────────────────┐   │
 │   │       SECONDARY ACTION       │  │       PRIMARY HERO CTA       │   │
 │   │  • Underline offset link     │  │  • Electric Lime (#B9FF66)   │   │
 │   │  • Arrow hover translation   │  │  • Mechanical click press    │   │
 │   └──────────────────────────────┘  └──────────────────────────────┘   │
 └────────────────────────────────────────────────────────────────────────┘
```

### The 6 Core Tenets:
1. **Lightweight Structural Outlines:** Never outline micro-elements indiscriminately. Macro cards, primary action buttons, search bars, and active modal surfaces receive a sharp `1.5px` border. Micro-tags, dividers, and icon boxes use soft background fills.
2. **Uniform 4px Bottom-Only Drop Shadows:** Use directional physical drop shadows (`0px 4px 0px 0px`) on cards and primary interactive elements. When an element is selected or active, its shadow depth and geometry must **never shrink or shift** relative to neighboring cards.
3. **The 80 / 15 / 5 Visual Hierarchy Rule:**
   - **80% Monochromatic Canvas:** High-contrast neutral canvases (`#F8F9FA` in light, `#111216` in dark) and crisp card surfaces (`#FFFFFF` in light, `#1C1E24` in dark).
   - **15% Muted Structural Framing:** Neutral metadata tags, subtle hairlines (`#E5E7EB` / `#242838`), recessed tonal inputs (`#F4F5F7` / `#151720`), and subtle hover fills.
   - **5% Vibrant Accent Saturation:** Reserved strictly for primary CTAs (Electric Lime `#B9FF66`), active selection tints, live badges, and brand identity marks.
4. **Physical Tactile Spring Physics:** All interactive buttons and cards utilize realistic mechanical physics governed by the signature spring curve: `cubic-bezier(0.16, 1, 0.3, 1)`. Active states depress downward (`transform: translateY(2px); box-shadow: 0px 1px 0px 0px`).
5. **Opaque Selection Tints (No Transparency Bleed):** Selected/active states across all card variants use **100% opaque** background tints (`#EBF5FF` / `#182634` for Blue; `#F1FCF7` / `#172721` for Lime/Emerald; `#F7F4FB` / `#221C2E` for Purple). Never use transparent `rgba()` active fills directly over colored wrapper containers, as the container border color will bleed through.
6. **Dark Mode Luminosity & Depth:** Dark mode avoids pitch-black `#000000`. It utilizes a calibrated hierarchy of charcoal slate surfaces: `#111216` canvas $\rightarrow$ `#1C1E24` card $\rightarrow$ `#151720` recessed header/input $\rightarrow$ `#1E212D` tags $\rightarrow$ `#31364A` structural borders.

---

## 2. Complete CSS Design Tokens & Variable Dictionary

The application uses Tailwind CSS v4 configured via `@theme inline` with native CSS variables in `app/globals.css`.

### 2.1 Color Palette Tokens

```css
:root {
    /* Canvas & Surfaces (Light Mode) */
    --bg-page: #F8F9FA;              /* Crisp modern soft canvas */
    --bg-card: #FFFFFF;              /* Pure crisp white card surface */
    --bg-input: #F4F5F7;             /* Recessed tonal input surface */
    --bg-tag: #F3F4F6;               /* Soft neutral tag pill background */
    --bg-tag-hover: #E5E7EB;         /* Subtle hover on tag/button */

    /* Typography Inks (Light Mode) */
    --color-text-primary: #111827;   /* Deep solid charcoal ink */
    --color-text-muted: #4B5563;     /* Readable secondary body text */
    --color-text-subtle: #717688;    /* Captions, metadata, icons, placeholders */

    /* Brand & Accent Matrix */
    --brand-lime: #B9FF66;          /* High-voltage electric lime (Primary CTA) */
    --brand-lime-hover: #A6F04F;    /* Hover state for lime button */
    --brand-dark: #111827;          /* Solid dark base */
    --brand-dark-hover: #1F2937;    /* Dark button hover */
    --brand-red: #FF3B5C;           /* Strawberry accent / Live dot / Notification indicator */

    /* Borders & Outlines */
    --border-color: #111827;         /* Crisp 1.5px structural container stroke */
    --border-subtle: #E5E7EB;        /* Hairline internal dividers */
    --border-input: #CCD0DC;         /* Defined input & control border */
    --shadow-color: #111827;         /* Solid brutalist drop shadow color */

    /* Geometric Radiuses */
    --border-width: 1.5px;
    --border-radius-xs: 4px;         /* Micro tags, badges, indicators */
    --border-radius-sm: 6px;         /* Buttons, inputs, small cards */
    --border-radius-md: 6px;         /* Search inputs, filter controls */
    --border-radius-card: 8px;       /* Primary job cards, stat widgets */
    --border-radius-lg: 10px;        /* Modal containers, large cards */
    --border-radius-pill: 20px;      /* Filter pills, status chips (full: 9999px) */

    /* Directional Bottom-Only Drop Shadows */
    --shadow-bottom-sm: 0px 3px 0px 0px var(--shadow-color);
    --shadow-bottom-md: 0px 4px 0px 0px var(--shadow-color);
    --shadow-bottom-lg: 0px 6px 0px 0px var(--shadow-color);

    /* Animation & Physics */
    --spring-physics: 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    --transition-fast: 0.15s ease;
    --transition-smooth: 0.25s ease;
}

/* Dark Mode Tokens (Triggered by [data-theme="dark"] and .dark) */
[data-theme="dark"], .dark {
    --bg-page: #111216;              /* Deep neutral canvas */
    --bg-card: #1C1E24;              /* Elevated charcoal slate card surface */
    --bg-input: #151720;             /* Recessed dark input surface */
    --bg-tag: #191B20;               /* Subtle card tag fill */
    --bg-tag-hover: #23262D;         /* Hover state on tags/controls */

    /* Typography Inks (Dark Mode) */
    --color-text-primary: #F3F4F6;   /* Crisp 95% white headings & text */
    --color-text-muted: #9CA3AF;     /* Readable muted body text */
    --color-text-subtle: #6B7280;    /* Captions, subtle icons */

    /* Brand Overrides in Dark Mode */
    --brand-lime: #ACEE5F;           /* Nuanced neon lime (optimized for dark contrast) */
    --brand-lime-hover: #9BD655;
    --brand-dark: #ACEE5F;           /* Button text / inverted dark tokens */
    --brand-dark-hover: #FFFFFF;

    /* Borders & Shadows (Dark Mode) */
    --border-color: #31364A;         /* Slate stroke */
    --border-subtle: #242838;        /* Hairline divider */
    --border-input: #2B3042;         /* Input stroke */
    --shadow-color: #08090C;         /* Deep midnight shadow */
}
```

### 2.2 Card Variant Color Palette (Saved, Requested, Curated)

The application utilizes three specialized thematic color variants for job cards across different sections:

| Variant | Semantic Purpose | Border (Light) | Border (Dark) | Shadow Layer | Active Card Background (Light) | Active Card Background (Dark) |
|---|---|---|---|---|---|---|
| **Default / Lime** | Standard Job Board (`/`) | `#111827` (`var(--border-color)`) | `#31364A` | `var(--shadow-color)` | `rgba(185,255,102,0.12)` | `dark:bg-[rgba(172,238,95,0.08)]` (Border: `#ACEE5F`) |
| **Blue (`variant="blue"`)** | Saved Jobs (`/saved-jobs`) | `#0ea5e9` | `#0284c7` (Active: `#38bdf8`) | `bg-[#0ea5e9]` | **`bg-[#EBF5FF]`** (Opaque Pastel Azure) | **`dark:bg-[#182634]`** (Opaque Midnight Navy) |
| **Purple (`variant="purple"`)**| Requested Roles (`/job-hunt`) | `#8465b5` | `#8465b5` (Active: `#a78bfa`) | `bg-[#8465b5]` | **`bg-[#F7F4FB]`** (Opaque Pastel Violet) | **`dark:bg-[#221C2E]`** (Opaque Deep Violet) |
| **Emerald (`variant="emerald"`)**| Curated Premium (`/job-hunt`) | `#33d9ac` | `#26a884` (Active: `#34d399`) | `bg-[#33d9ac]` | **`bg-[#F1FCF7]`** (Opaque Pastel Mint) | **`dark:bg-[#172721]`** (Opaque Deep Forest) |

---

## 3. Typography & Text Standards

Strawberry Jobs enforces strict typographic hierarchy using **Rubik** for display headings and **Mona Sans** for body interfaces, loaded via Next.js Google Fonts in `app/layout.tsx`.

```css
/* Font Family Bindings */
--font-heading: var(--font-rubik);
--font-body: var(--font-mona-sans);
--font-sans: var(--font-sans);      /* Geist */
--font-mono: var(--font-mono);      /* Geist Mono */
```

### 3.1 Type Scale Hierarchy

| Style Token | Font Family | Size | Weight | Line Height | Tracking | Tailwind Equivalent |
|---|---|---|---|---|---|---|
| **Page Title H1** | Rubik (`font-heading`) | `2.25rem` (36px) | 700 | 1.2 | `-0.025em` | `text-3xl sm:text-4xl font-heading font-bold` |
| **Section Title H2**| Rubik (`font-heading`) | `1.5rem` (24px) | 700 | 1.25 | `-0.02em` | `text-2xl font-heading font-bold` |
| **Card Job Title** | Rubik (`font-heading`) | `1.2rem` (19.2px) | 600 | 1.26 | `-0.015em` | `text-[1.2rem] font-heading font-semibold leading-[1.26]` |
| **Panel Job Title** | Rubik (`font-heading`) | `1.2rem`–`1.35rem` | 600 | 1.25 | `-0.015em` | `text-[1.2rem] sm:text-[1.35rem] font-heading font-semibold` |
| **Body Standard** | Mona Sans (`font-body`)| `0.938rem` (15px) | 400/500| 1.6 | `normal` | `text-[0.938rem] font-body leading-relaxed` |
| **Company Label** | Mona Sans (`font-body`)| `0.88rem` (14px) | 600 | 1.2 | `normal` | `text-[0.88rem] font-semibold text-text-muted` |
| **Metadata Badges**| Mona Sans (`font-body`)| `0.76rem` (12.2px)| 600 | 1.0 | `normal` | `text-[0.76rem] font-semibold` |
| **Tooltips / Micro**| Mona Sans (`font-body`)| `0.75rem` (12px) | 600 | 1.0 | `0.025em` | `text-[0.75rem] font-semibold tracking-wide` |

---

## 4. Component Implementations & Patterns

### 4.1 Button Hierarchy

#### A. Primary Conversion CTA ("Tailor Resume")
High-voltage Electric Lime button with tactile mechanical press:
```tsx
<button
  type="button"
  className="inline-flex items-center justify-center gap-[0.35rem] p-[0.38rem_0.85rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
>
  <Sparkles className="w-[13px] h-[13px]" />
  <span>Tailor Resume</span>
</button>
```

#### B. Secondary Action ("Apply Now" Link)
Underline-offset action link with interactive SVG arrow:
```tsx
<button
  type="button"
  onClick={handleApply}
  className="inline-flex items-center gap-[0.35rem] font-heading text-[0.85rem] font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 group-hover/link:translate-x-1 dark:text-white dark:hover:text-white"
>
  <span>Apply Now</span>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[13px] h-[13px] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
    <line x1="7" y1="17" x2="17" y2="7" />
    <polyline points="7 7 17 7 17 17" />
  </svg>
</button>
```

#### C. Morphing Close Button (JD Panel & Modals)
Cohesive, non-red action button that smoothly transitions from a rounded rectangle (`rounded-md`) to a circle (`rounded-full`) upon hover:
```tsx
<button
  type="button"
  onClick={onClose}
  className="w-8 h-8 rounded-md hover:rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tag-hover dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#2B3042] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer"
  title="Close panel"
  aria-label="Close job details panel"
>
  <X className="w-4 h-4" strokeWidth={2.2} />
</button>
```

---

### 4.2 Standard JobCard Component (`components/JobCard.tsx`)

Used in the primary Job Board (`/`). It is a single `<article>` element with an architectural `1.5px` border and bottom-only `4px` drop shadow.

```tsx
<article 
  id={`job-card-${job.id}`}
  onClick={handleCardClick}
  className={`relative h-full flex flex-col justify-between p-[1.25rem_1.35rem_1.15rem] rounded-card border-[1.5px] shadow-[0_4px_0_0_var(--shadow-color)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
    isActive
      ? "border-brand-dark bg-[rgba(185,255,102,0.12)] dark:border-brand-lime dark:bg-[rgba(172,238,95,0.08)] cursor-default"
      : "border-border-color bg-bg-card hover:-translate-y-[2px] hover:shadow-[0_6px_0_0_var(--shadow-color)] dark:border-[#31364A] dark:hover:border-[#434B66] dark:hover:shadow-[0_6px_0_0_#08090C] cursor-pointer"
  }`}
>
  {/* Unified Title + Company Block (min-h-[5.35rem] prevents layout shift) */}
  <div className="min-h-[5.35rem] flex flex-col justify-start mb-[0.85rem]">
    <div className="flex items-start justify-between gap-2.5 mb-[0.45rem]">
      <button
        type="button"
        onClick={handleTitleClick}
        className="text-left font-heading text-[1.2rem] font-semibold text-text-primary leading-[1.26] cursor-pointer transition-colors hover:underline line-clamp-2 flex-1 min-w-0 dark:text-white"
      >
        {job.jobRoleTitle}
      </button>
      <button
        type="button"
        onClick={handleToggleSave}
        className="p-0.5 text-text-subtle hover:text-text-primary dark:hover:text-white cursor-pointer"
      >
        <Bookmark className="w-[18px] h-[18px]" fill={isSaved ? "currentColor" : "none"} />
      </button>
    </div>

    {/* Company & Details Block */}
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-md bg-bg-tag flex items-center justify-center shrink-0 text-text-primary dark:bg-[#171820] dark:text-[#A1A1AA]">
        <Building2 className="w-4 h-4" />
      </div>
      <div className="flex flex-col min-w-0 flex-1 justify-center gap-1">
        <span className="text-[0.88rem] font-semibold text-text-muted dark:text-[#A1A1AA] truncate">
          {job.company}
        </span>
        <div className="flex items-center gap-2 text-[0.76rem] font-medium text-text-subtle">
          <span>{getJobPostedTime(job.id, job.postedAt)}</span>
          <span className="inline-flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{job.location}</span>
          </span>
        </div>
      </div>
    </div>
  </div>

  {/* Metadata Badges */}
  <div className="flex flex-wrap content-end gap-[0.35rem] mb-[0.65rem] min-h-[3.35rem]">
    <span className="text-[0.76rem] font-semibold px-[0.5rem] py-[0.18rem] rounded-xs bg-bg-tag text-text-muted dark:bg-[#1E212D]">
      {job.type}
    </span>
    <span className="text-[0.76rem] font-bold px-[0.5rem] py-[0.18rem] rounded-xs bg-[rgba(185,255,102,0.18)] text-[#064E3B] dark:bg-[rgba(172,238,95,0.12)] dark:text-[#ACEE5F]">
      {job.salary}
    </span>
  </div>

  {/* Footer Actions (Hidden in compact split-view mode) */}
  {!compact && (
    <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-subtle group/actions mt-auto">
      {/* Apply Link & Tailor Resume CTA */}
    </div>
  )}
</article>
```

---

### 4.3 PremiumJobCard Component (`components/PremiumJobCard.tsx`)

Used for specialized job sections: **Saved Jobs** (`variant="blue"`), **Requested Roles** (`variant="purple"`), and **Curated Jobs** (`variant="emerald"`).

#### Architecture:
1. **Light Mode Solid Shadow Layer**: An `absolute` background div with `rounded-[10px]` positioned at `top-[4px]` with a solid accent color (`#0ea5e9`, `#8465b5`, `#33d9ac`).
2. **Main Card Wrapper**: A container with `p-[1.5px]` that creates the solid colored border.
3. **Inner `<article>`**: Opaque card body that prevents the wrapper's border color from bleeding into the card content.

```tsx
<div className="relative group h-full">
  {/* Light Mode Solid Shadow (Maintains exact 4px sizing parity) */}
  <div
    className={`absolute w-full h-full rounded-[10px] ${shadowColorClass} dark:hidden top-[4px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
      isActive ? "" : "group-hover:top-[6px]"
    }`}
  />

  {/* Main Card Border Wrapper */}
  <div
    className={`relative h-full p-[1.5px] rounded-[10px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
      isActive
        ? isBlue
          ? "bg-[#0ea5e9] dark:bg-[#38bdf8] dark:shadow-[0_4px_0_0_var(--shadow-color)]"
          : isPurple
            ? "bg-[#8465b5] dark:bg-[#a78bfa] dark:shadow-[0_4px_0_0_var(--shadow-color)]"
            : "bg-[#33d9ac] dark:bg-[#34d399] dark:shadow-[0_4px_0_0_var(--shadow-color)]"
        : `${borderColorClass} dark:shadow-[0_4px_0_0_var(--shadow-color)] group-hover:-translate-y-[2px] dark:group-hover:shadow-[0_6px_0_0_#08090C]`
    }`}
  >
    {/* Inner Card (Opaque background prevents bleed-through) */}
    <article 
      id={`job-card-${job.id}`}
      onClick={handleCardClick}
      className={`relative h-full flex flex-col justify-between p-[1.25rem_1.35rem_1.15rem] rounded-card transition-colors ${
        isActive
          ? isBlue
            ? "bg-[#EBF5FF] dark:bg-[#182634] cursor-default"
            : isPurple
              ? "bg-[#F7F4FB] dark:bg-[#221C2E] cursor-default"
              : "bg-[#F1FCF7] dark:bg-[#172721] cursor-default"
          : `bg-bg-card ${compact ? "cursor-pointer" : ""}`
      }`}
    >
      {/* Title, Company, Badges, Footer */}
    </article>
  </div>
</div>
```

---

### 4.4 JobDescriptionPanel Component (`components/JobDescriptionPanel.tsx`)

The Job Description (JD) Panel displays full structured job details. It appears as a **desktop sticky side panel** in split-view mode or as an **overlay drawer** on mobile.

#### Key UI Specifications:
1. **Differentiated Top Panel Shade**: The sticky header uses `bg-[#F8F9FB]/95` in light mode (subtly contrasting against `#FFFFFF` card body) and `dark:bg-[#151720]/95` in dark mode (subtly contrasting against `#1C1E24`).
2. **Tactile Ambient Drop Shadow**: `shadow-[0_4px_12px_-2px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.35)]` provides soft elevation over scrolling content.
3. **Smart Scroll Detection**: The header automatically translates out of view on downward scroll (`-translate-y-full`) and immediately restores on upward scroll (`translate-y-0`).
4. **Cohesive Action Cluster**: Bookmark and close buttons both share `w-8 h-8 rounded-md hover:rounded-full` morphing geometry with standard application neutral colors (no red).

```tsx
<div 
  className="relative flex flex-col bg-bg-card border-[1.5px] border-border-color rounded-card overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] h-full max-h-[calc(100vh-6.5rem)] dark:border-[#31364A]"
  role="region"
  aria-label={`Job description for ${job.jobRoleTitle} at ${job.company}`}
>
  <div 
    ref={scrollContainerRef}
    className="flex-1 overflow-y-auto flex flex-col relative"
    onScroll={handleScroll}
  >
    {/* Smart Sticky Title Header */}
    <div 
      className={`sticky top-0 z-10 bg-[#F8F9FB]/95 dark:bg-[#151720]/95 backdrop-blur-md px-5 md:px-6 pt-4 md:pt-5 pb-3 border-b border-border-subtle dark:border-[#2B3042] shadow-[0_4px_12px_-2px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_14px_-2px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isHeaderVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <h2 className="font-heading text-[1.2rem] sm:text-[1.35rem] font-semibold text-text-primary leading-tight dark:text-white">
          {job.jobRoleTitle}
        </h2>

        {/* Action Pair (Symmetrical Morphing Buttons) */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <button
            type="button"
            onClick={() => toggleSavedJob(job.id)}
            className={`w-8 h-8 rounded-md hover:rounded-full flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer hover:bg-bg-tag-hover dark:hover:bg-[#2B3042] ${
              isSaved ? "text-text-primary dark:text-white" : "text-text-muted hover:text-text-primary dark:text-[#A1A1AA] dark:hover:text-white"
            }`}
          >
            <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tag-hover dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#2B3042] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Company, Location, Date Row & Apply/Tailor Actions */}
    </div>

    {/* Richly Styled Markdown Body */}
    <div className="px-5 md:px-6 py-5 space-y-6">
      <div className="prose prose-sm md:prose-base max-w-[65ch] xl:max-w-3xl dark:prose-invert text-text-muted dark:text-[#D1D5DB]">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {formatJobDescriptionToMarkdown(job.jobDescription || job.descriptionPlain || "")}
        </ReactMarkdown>
      </div>
    </div>
  </div>
</div>
```

---

### 4.5 Header Navigation & Animated Tooltips (`components/Header.tsx`)

#### A. Sliding Pill Tab Switcher
Center desktop tab switcher featuring hardware-accelerated sliding pill physics (`cubic-bezier(0.23, 1, 0.32, 1)`):
- Solid dark background on active tab.
- Morphs to outline pill on hover.
- Smoothly slides across tabs upon click.

#### B. Animated Tooltip System (Saved & Notifications)
Universal accessible tooltip pattern with directional caret, physics-based scale/fade animation, and keyboard support:

```tsx
<div className="relative group/tooltip flex items-center justify-center">
  <Link
    href="/saved-jobs"
    className="h-9 w-9 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-[#D3DAE6] dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#2C3042] transition-colors cursor-pointer"
    aria-label="Saved Jobs"
    aria-describedby="tooltip-saved-jobs"
  >
    <Bookmark className="w-[18px] h-[18px]" strokeWidth={2.2} fill="currentColor" />
  </Link>

  {/* Animated Tooltip Bubble */}
  <div
    id="tooltip-saved-jobs"
    role="tooltip"
    className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50 opacity-0 invisible scale-95 -translate-y-1 group-hover/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:scale-100 group-hover/tooltip:translate-y-0 group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:visible group-focus-within/tooltip:scale-100 group-focus-within/tooltip:translate-y-0 transition-all duration-200 delay-75 ease-[cubic-bezier(0.16,1,0.3,1)]"
  >
    <div className="relative px-2.5 py-1 text-[0.75rem] font-semibold tracking-wide whitespace-nowrap rounded-md bg-[#111827] text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] dark:bg-[#1E212B] dark:text-[#F3F4F6] dark:border dark:border-[#31364A] dark:shadow-[0_6px_20px_rgba(0,0,0,0.45)]">
      {/* 45-degree Arrow Caret */}
      <span 
        className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#111827] dark:bg-[#1E212B] dark:border-t dark:border-l dark:border-[#31364A]"
        aria-hidden="true"
      />
      <span className="relative z-10">Saved Jobs</span>
    </div>
  </div>
</div>
```

---

### 4.6 Search & Filter Bar (`components/SearchFilterBar.tsx`)

Dual-input search bar combining **Title/Keyword** search, **Location** search, and an active **Filters** modal trigger.

#### Specifications:
- Container: `border-[1.5px] border-border-color rounded-lg bg-bg-card shadow-bottom-md dark:border-[#31364A]`.
- Input fields: Recessed `bg-bg-input` with `border border-border-input rounded-md`. On focus: `focus:bg-white focus:border-[#111827] focus:shadow-[0_0_0_1px_#111827,0_2px_6px_rgba(17,24,39,0.05)]`.
- Active Filter Counter: Pill with high-visibility Electric Lime highlight: `bg-brand-lime text-black font-bold text-[0.7rem] px-2 rounded-full`.

---

## 5. Animation, Motion & Physics Standards

All motion in Strawberry Jobs is designed to feel physical, snappy, and tactile.

### 5.1 Physics Timing Functions

| Function Name | Cubic-Bezier Value | Purpose |
|---|---|---|
| **Spring Physics** | `cubic-bezier(0.16, 1, 0.3, 1)` | Primary interactive physics: buttons, hover elevation, tooltips, cards. |
| **Tab Slide Physics**| `cubic-bezier(0.23, 1, 0.32, 1)` | Header sliding navigation pill. |
| **Fast Linear** | `0.15s ease` | Color fades, text color transitions. |
| **Smooth Transition**| `0.25s ease` | Background color transitions during theme toggle. |

### 5.2 Keyframe Definitions (from `app/globals.css`)

```css
/* Tab View Transitions (Curated Section) */
@keyframes tabSlideFromRight {
  from { opacity: 0; transform: translate3d(56px, 0, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes tabSlideFromLeft {
  from { opacity: 0; transform: translate3d(-56px, 0, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

/* 4-Dot Rotating Loader */
@keyframes l38 {
  100% { background-position: 100% 0, 100% 100%, 0 100%, 0 0; }
}

/* Skeleton Loading Pulse */
@keyframes formSkeletonPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.22; }
}
```

---

## 6. Layout Systems & Responsive Breakpoints

### 6.1 Viewport Breakpoints
- **Mobile (`< 640px`)**: Single column stacked cards, full-width inputs, sticky mobile bottom drawer for JD.
- **Tablet (`640px`–`1024px`)**: 2-column job card grid, drawer overlay for JD panel.
- **Desktop (`>= 1024px`)**:
  - **Full Grid View (No JD Open)**: 3-column grid (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`).
  - **Split-View Mode (JD Open)**: 
    - Left column (`w-full lg:w-[410px] xl:w-[440px] shrink-0`): Single-column compact card list with synced top/bottom pagination.
    - Right column (`hidden lg:block lg:flex-1 sticky top-[5.25rem]`): Sticky `JobDescriptionPanel`.

---

## 7. Strict AI Implementation Rules & Anti-Patterns

When generating or modifying UI components in this codebase, AI models and developers **must adhere to these rules**:

| Category | ❌ NEVER DO THIS (Amateur / Broken) | ✅ ALWAYS DO THIS (Production Standard) |
|---|---|---|
| **Selected Card Shadows** | Shrinking the active card shadow to `0px 3px` or translating the active card down by `1px` to simulate a press. | Keep the drop shadow at exactly `top-[4px]` / `0_4px_0_0` on both active and inactive cards so all cards in the list share identical visual depth. |
| **Card Active Backgrounds** | Using transparent `rgba(...)` fills directly on `<article>` inside a colored border wrapper (which causes the parent's solid border color to bleed through). | Always use **100% opaque** active tint classes (`bg-[#EBF5FF]` for blue, `bg-[#F1FCF7]` for emerald, `bg-[#F7F4FB]` for purple). |
| **Close Buttons** | Adding red hover colors (`text-[#FF3B5C] hover:bg-[#FF3B5C]/10`) to panel close buttons. | Use cohesive neutral application tokens (`text-text-muted hover:text-text-primary hover:bg-bg-tag-hover`) with `rounded-md hover:rounded-full`. |
| **Border Thickness** | Applying `2px` or `3px` solid black borders across child elements. | Restrict `1.5px` borders to macro containers (`JobCard`, `SearchFilterBar`, `JobDescriptionPanel`). Inner badges must remain borderless. |
| **Focus Outlines** | Default browser blue rings (`outline: auto`) or heavy glowing halos. | Double stroke focus ring: `focus:shadow-[0_0_0_1px_#111827,0_2px_6px_rgba(17,24,39,0.05)]` (dark: lime focus ring). |
| **Dark Mode Backgrounds** | Flat `#000000` pitch black backgrounds. | Layered slate palette: Canvas `#111216` $\rightarrow$ Card `#1C1E24` $\rightarrow$ Recessed Input `#151720` $\rightarrow$ Tags `#1E212D`. |
| **Tooltips** | Un-namespaced `group` triggers that conflict with parent card hover states. | Use namespaced group classes (e.g., `group/tooltip` and `group-hover/tooltip:opacity-100`). Always add `pointer-events-none`. |

---

## 8. AI Prompt Context Template

When invoking an LLM or subagent to build a new screen or refactor a UI component in this project, copy and paste this directive:

```markdown
You are building/modifying UI components in Strawberry Jobs adhering strictly to design.md (v2.0.0).

Core Directives:
1. Palette: Canvas var(--bg-page) (#F8F9FA / #111216), Card var(--bg-card) (#FFFFFF / #1C1E24), Recessed Input var(--bg-input) (#F4F5F7 / #151720).
2. Primary CTA: Electric Lime var(--brand-lime) (#B9FF66 in light, #ACEE5F in dark) with mechanical press (hover:bg-white hover:text-[#111827] active:scale-[0.98]).
3. Borders & Shadows: Refined 1.5px solid borders with 4px bottom-only drop shadows (shadow-[0_4px_0_0_var(--shadow-color)]). Never shrink active card shadows.
4. Selection Tints: Use 100% opaque subtle washes (Blue: bg-[#EBF5FF] / dark:bg-[#182634]; Lime: bg-[rgba(185,255,102,0.12)] / dark:bg-[rgba(172,238,95,0.08)]).
5. Action Buttons: Morphing geometry (w-8 h-8 rounded-md hover:rounded-full) with spring physics (cubic-bezier(0.16, 1, 0.3, 1)).
6. Tooltips: Namespaced group/tooltip, 45-degree directional arrow caret, pointer-events-none, smooth spring scaling transition.
```

---
*Maintained for the Strawberry Jobs ecosystem. Designed for maximum fidelity, robustness, and AI agent consistency.*
