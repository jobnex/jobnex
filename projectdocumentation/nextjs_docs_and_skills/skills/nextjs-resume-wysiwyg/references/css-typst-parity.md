# CSS-to-Typst Visual Parity Reference Guide

To eliminate word-wrapping discrepancies and layout drift between the Next.js browser sheet and the generated Typst PDF, use this exact mapping table.

---

## 1. Global Page Geometry

| Attribute | Typst (`bridge.typ`) | Next.js CSS Equivalent |
| :--- | :--- | :--- |
| **Page Format** | Default US Letter (`8.5in` × `11in`) | `width: 8.5in; min-height: 11in; max-height: 11in;` |
| **Top Margin** | `0.8cm` | `padding-top: 0.8cm;` (~30.2px) |
| **Bottom Margin**| `0.8cm` | `padding-bottom: 0.8cm;` (~30.2px) |
| **Side Margins** | `1.1cm` (Theme 2 & 6) / `1.0cm` (Theme 3 & 5)| `padding-left: 1.1cm; padding-right: 1.1cm;` |
| **Box Sizing** | Content box + physical margins | `box-sizing: border-box;` |
| **Background** | White | `background-color: #ffffff; color: #000000;` |

---

## 2. Theme Metrics Comparison

### Theme 2: Jake's Resume (Standard Tech ATS)
- **Typst Text**: `#set text(font: "Arial", size: 8.5pt)`
- **Typst Leading**: `#set par(leading: 0.48em)`
- **Header**:
  - Name: `19pt`, `font-weight: bold`, `align: center`
  - Subtitle: `9.5pt`, `font-style: italic`, `align: center`
  - Contacts: `8.5pt`, joined by ` | `
- **Section Headers**:
  - Font: `10pt`, `font-weight: bold`, Title Case
  - Divider: `#line(length: 100%, stroke: 0.6pt + black)`
  - CSS equivalent:
    ```css
    .theme-2-section-title {
      font-size: 10pt;
      font-weight: 700;
      color: #000000;
      border-bottom: 0.6pt solid #000000;
      margin-top: 0.3em;
      margin-bottom: 0.25em;
      padding-bottom: 1px;
    }
    ```

---

### Theme 3: Modern Clean (Deedy Minimalist)
- **Typst Text**: `#set text(font: "Arial", size: 8.5pt)`
- **Typst Leading**: `#set par(leading: 0.48em)`
- **Margins**: `(x: 1.0cm, top: 0.8cm, bottom: 0.8cm)`
- **Header**:
  - Name: `20pt`, `regular`, color `#111111`, `align: center`
  - Subtitle: `9.5pt`, color `#555555`
  - Contacts: `8.5pt`, color `#555555`, joined by ` | `
- **Section Headers**:
  - Font: `9.8pt`, `font-weight: bold`, color `#666666`, `letter-spacing: 1.2pt`, uppercase
  - Divider: `#line(length: 100%, stroke: 0.5pt + rgb("aaaaaa"))`
  - CSS equivalent:
    ```css
    .theme-3-section-title {
      font-size: 9.8pt;
      font-weight: 700;
      color: #666666;
      letter-spacing: 1.2pt;
      text-transform: uppercase;
      border-bottom: 0.5pt solid #aaaaaa;
      margin-top: 0.35em;
      margin-bottom: 0.25em;
      padding-bottom: 1px;
    }
    ```

---

### Theme 5: Classic Executive (Sourabh Bajaj Ivy League)
- **Typst Text**: `#set text(font: "Times New Roman", size: 8.6pt)`
- **Typst Leading**: `#set par(leading: 0.46em)`
- **Margins**: `(x: 1.0cm, top: 0.8cm, bottom: 0.8cm)`
- **Header (Two-Column Split Grid)**:
  - Left column: Name (`19pt`, `bold`), Title (`9pt`, `italic`), LinkedIn, GitHub
  - Right column: Email, Mobile, Location (all `8.5pt`, right-aligned)
  - Bottom Divider: `#line(length: 100%, stroke: 0.5pt + black)`
- **Section Headers**:
  - Font: `10pt`, `font-weight: bold`, uppercase
  - Divider: `#line(length: 100%, stroke: 0.5pt + black)`
  - CSS equivalent:
    ```css
    .theme-5-header-grid {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 0.5pt solid #000000;
      padding-bottom: 0.3em;
      margin-bottom: 0.4em;
      font-family: 'Times New Roman', Times, serif;
    }
    .theme-5-section-title {
      font-family: 'Times New Roman', Times, serif;
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      border-bottom: 0.5pt solid #000000;
      margin-top: 0.3em;
      margin-bottom: 0.25em;
    }
    ```

---

### Theme 6: Minimal Tech (Vertical Accent Bars)
- **Typst Text**: `#set text(font: "Arial", size: 8.8pt)`
- **Typst Leading**: `#set par(leading: 0.48em)`
- **Margins**: `(x: 1.1cm, top: 0.8cm, bottom: 0.8cm)`
- **Header**:
  - Left-aligned header
  - Name: `21pt`, `weight: regular`
  - Contacts: `8.8pt`, fill `#444444`, joined by bullet ` • `
- **Section Headers**:
  - Vertical accent: `#box(stroke: (left: 3pt + black), inset: (left: 0.5em))`
  - Text: `10.5pt`, `bold`, `tracking: 0.5pt`, uppercase
  - CSS equivalent:
    ```css
    .theme-6-section-title {
      font-size: 10.5pt;
      font-weight: 700;
      letter-spacing: 0.5pt;
      text-transform: uppercase;
      border-left: 3pt solid #000000;
      padding-left: 0.5em;
      margin-top: 0.4em;
      margin-bottom: 0.25em;
    }
    ```

---

## 3. Typography & List Alignment Rules

1. **Font Sizing**: Always use points (`pt`) in CSS rules for text within `.pseudo-pdf-sheet`. Since CSS points equate to `1pt = 1/72 inch`, this matches Typst's physical point sizing.
2. **Line Height Formula**: Typst `leading: 0.48em` means the extra spacing between lines is `0.48em`. In CSS, this corresponds to:
   ```css
   line-height: calc(1em + 0.48em); /* or line-height: 1.48; */
   ```
3. **Bullet Indentation**: Typst default list item spacing:
   ```css
   .resume-list {
     list-style-type: disc;
     padding-left: 1.1em;
     margin-top: 0.15em;
     margin-bottom: 0.2em;
   }
   .resume-list li {
     margin-bottom: 0.12em;
   }
   ```
4. **Dates & Locations (Right-Aligned)**:
   Use flexbox `justify-between` to replicate Typst's `#h(1fr)`:
   ```css
   .resume-row-header {
     display: flex;
     justify-content: space-between;
     align-items: baseline;
   }
   ```
