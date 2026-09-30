---
name: nextjs-resume-wysiwyg
description: >-
  Build, style, and synchronize a Next.js resume editor UI that achieves 1:1 pixel-accurate
  visual parity with the backend Typst PDF compiler. Use whenever building or modifying the Next.js
  frontend, implementing pseudo-PDF WYSIWYG paper sheets, serializing Markdown for the Typst compiler,
  or setting up async client-server PDF generation and preview.
---

# Next.js Resume WYSIWYG & Typst Async Sync Skill

This skill provides step-by-step specifications for an AI or developer building a Next.js resume editing interface that seamlessly synchronizes with the Python/Rust Typst backend engine (`web_ui.py` / `py_compiler.py`).

## Core Objectives

1. **1:1 Visual Parity**: Guarantee that line-breaks, font sizing, padding, and page boundaries in the browser's "pseudo-PDF" sheet match the generated vector PDF without surprise second-page overflows.
2. **Canonical Data Contract**: Serialize in-browser edits into structured Markdown that conforms precisely to the backend parser's regex expectations.
3. **Async Generation Pipeline**: Manage debounced compiling, loading states, base64-to-blob conversion, and instant PDF preview.

---

## 1. Physical Dimensions & CSS Metric Locking

Typst compiles to physical dimensions defined in `bridge.typ`. The browser paper element must use physical print units (`in`, `cm`, `pt`) rather than standard screen units (`px`, `rem`).

### Paper Sheet Dimensions (US Letter)

```css
.pseudo-pdf-sheet {
  /* Standard US Letter: 8.5in x 11in */
  width: 8.5in;
  min-height: 11in;
  max-height: 11in; /* Hard boundary for 1-page budget */
  
  /* Physical margins from bridge.typ */
  padding-top: 0.8cm;
  padding-bottom: 0.8cm;
  padding-left: 1.1cm;
  padding-right: 1.1cm;

  /* Typography metrics matching Typst (#set text(font: "Arial", size: 8.8pt), #set par(leading: 0.48em)) */
  font-family: Arial, Helvetica, sans-serif;
  font-size: 8.8pt;
  line-height: calc(8.8pt + 0.48em);
  
  background-color: #ffffff;
  color: #000000;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}
```

For theme-specific CSS variables and exact font mappings, consult [CSS-to-Typst Parity Reference](./references/css-typst-parity.md).

### Screen Scaling (Responsive Zoom)
Do NOT use responsive width percentages (e.g. `w-full` or `max-w-xl`) on the paper sheet itself; doing so causes word-wrapping to drift. Instead, keep the paper fixed at `8.5in` and scale the parent container using CSS transforms:

```tsx
<div className="overflow-auto flex justify-center p-6 bg-slate-900">
  <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
    <div className="pseudo-pdf-sheet">
      {/* Content */}
    </div>
  </div>
</div>
```

---

## 2. Markdown Data Contract

The backend uses regex parsers (`py_compiler.py` and `src/main.rs`). The Next.js app must generate Markdown adhering to these structural conventions.

### Formatting Template

```markdown
# Candidate Full Name
**Professional Job Title**

+1 555-0199 | candidate@email.com | [linkedin.com/in/profile](https://linkedin.com/in/profile) | [github.com/profile](https://github.com/profile) | San Francisco, CA

## Professional Summary
- First high-impact summary bullet point with quantifiable metrics.
- Second bullet point emphasizing technical domain expertise.

## Technical Skills
- **Languages & Frameworks:** TypeScript, Python, Rust, React, Next.js, Node.js
- **Cloud & DevOps:** AWS (S3, EMR, Lambda), Docker, Kubernetes, CI/CD pipelines
- **Databases & Tools:** PostgreSQL, Redis, Snowflake, Git, Kafka

## Professional Experience
### Senior Full Stack Engineer | Stripe | San Francisco, CA | 2024 - Present
- Architected distributed event-driven microservices processing 50k+ events/sec.
- Optimized query latency by 42% by introducing distributed Redis caching.

### Software Engineer | Acme Corp | Austin, TX | 2022 - 2024
- Built real-time dashboard analytics using Next.js and Tailwind CSS.
- Automated CI/CD deployment pipelines, cutting build times by 35%.

## Technical Projects
### Distributed Cache Engine | Rust, Tokio, Redis | 2024
- Implemented high-throughput LRU cache with sub-millisecond p99 latencies.
- Containerized deployment using Docker and Kubernetes.

## Education
**University of California, Berkeley** — Berkeley, CA
*Bachelor of Science in Computer Science* | 2018 - 2022
**Relevant Coursework:** Distributed Systems, Operating Systems, Algorithms
```

For strict regex parsing rules across all sections, consult [Markdown Contract Reference](./references/markdown-contract.md).

---

## 3. Asynchronous Communication Architecture

### Endpoint Specification

- **URL**: `POST http://<server-host>:5000/api/compile`
- **Headers**: `{ "Content-Type": "application/json" }`
- **Request Body**:
  ```json
  {
    "markdown": "<Full serialized markdown string>",
    "theme": 2,
    "include_base64": true
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "theme": 2,
    "pdf_url": "/compiled_ats_resume.pdf",
    "pdf_base64": "JVBERi0xLjcg...",
    "json_data": { ... },
    "stdout": "...",
    "stderr": ""
  }
  ```

### Async Flow & State Management

1. **Inline Editing**: User edits content directly on the styled paper (`contenteditable="true"` or structured inputs).
2. **Local State Update**: Changes update a structured React state object (`docState`).
3. **Markdown Serialization**: On change, serialize `docState` into Markdown.
4. **Debounced Sync**: Debounce server compilation by 600ms–800ms when auto-preview is enabled, or trigger on the **"Generate / Export"** button.
5. **Base64 Decoding**: Decode `pdf_base64` into a browser Blob URL for live rendering or download.

```typescript
function base64ToBlobUrl(base64Data: string, contentType = 'application/pdf'): string {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: contentType });
  return URL.createObjectURL(blob);
}
```

---

## 4. 1-Page Budget Overflow Detection

Users must be warned in real time if their content exceeds the single-page limit before generating the PDF.

```typescript
useEffect(() => {
  const sheet = sheetRef.current;
  if (!sheet) return;
  
  // 11 inches in standard CSS pixels is ~1056px at 96 DPI
  const maxAllowedHeight = sheet.clientHeight;
  const isOverflowing = sheet.scrollHeight > maxAllowedHeight + 2; // small tolerance
  
  setHasOverflow(isOverflowing);
}, [docState, zoom]);
```

If `hasOverflow` is true:
- Display a warning banner: *"Content exceeds 1 page budget — Typst will compile to 2 pages."*
- Highlight bottom overflowing elements with a dashed red marker.

---

## 5. Reference Implementations

- [CSS-to-Typst Parity Reference](./references/css-typst-parity.md): Complete style rules and metric conversions for Themes 2, 3, 5, and 6.
- [Markdown Contract Reference](./references/markdown-contract.md): Parser matching rules, regexes, and edge-case handling.
- [Next.js Components Reference](./references/nextjs-components.md): Drop-in React components (`ResumeSheet.tsx`, `useResumeSync.ts`, `api.ts`).
