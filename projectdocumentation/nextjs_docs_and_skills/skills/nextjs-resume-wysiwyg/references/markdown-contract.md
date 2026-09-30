# Markdown Data Contract & Parser Specifications

The backend (`py_compiler.py` and `src/main.rs`) parses Markdown into `clean_resume.json` via regular expressions and structural line matching.

This document outlines the strict Markdown grammar required so the backend extracts all data fields with 100% fidelity.

---

## 1. Section Header Matching Rules

The parser matches section headings by inspecting lines that start with `#`, `##`, or `**Heading**` (under 35 chars without `|`):

| Section Name | Matching Keywords (Case-Insensitive) | Preferred Markdown Header |
| :--- | :--- | :--- |
| **Summary** | `summary`, `profile`, `objective`, `about` | `## Professional Summary` |
| **Skills** | `skill`, `technolog`, `competenc`, `stack`, `tool` | `## Technical Skills` |
| **Experience** | `experience`, `work history`, `employment`, `career` | `## Professional Experience` |
| **Education** | `education`, `academic`, `degree` | `## Education` |
| **Projects** | `project`, `portfolio`, `notable work` | `## Technical Projects` |

> [!IMPORTANT]
> The order in which headers appear in the Markdown defines the `section_order` array in JSON, which dictates the order Typst renders on the page.

---

## 2. Section-by-Section Serialization Rules

### Header (Personal Information)
The parser looks at lines before the first section header:
- **Name**: Line starting with `# Full Name` or `**Full Name**`.
- **Title / Role**: Line with `**Job Title**` or `*Job Title*` (without `@`, `http`, or `+`).
- **Email**: Extracted via regex `[\w.+-]+@[\w-]+\.[\w.-]+`.
- **Phone**: Extracted via regex `(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}` or `Mobile: ...` / `Phone: ...`.
- **LinkedIn**: Extracted via regex `(?:https?://)?(?:www\.)?linkedin\.com/in/[\w-]+/?`.
- **GitHub**: Extracted via regex `(?:https?://)?(?:www\.)?github\.com/[\w-]+/?`.
- **Location**: Extracted via regex `(?:^|\|\s*)([A-Za-z\s]+,\s*[A-Z]{2})(?:\s*\||$)` (e.g. `San Francisco, CA` or `Bellevue, WA`).

**Recommended Header Markdown**:
```markdown
# Alexander Hamilton
**Principal Cloud Architect**

+1 415-555-0199 | alex@example.com | linkedin.com/in/alexhamilton | github.com/alexhamilton | New York, NY
```

---

### Professional Summary
- Each bullet point must begin with `- `, `* `, or `• `.
- The parser strips leading bullet symbols and appends to `professional_summary` array.

```markdown
## Professional Summary
- Architected enterprise multi-cloud data infrastructure across AWS and GCP, processing 10B+ events daily.
- Led cross-functional engineering teams of 14 senior engineers across distributed systems and ML deployments.
```

---

### Technical Skills
The parser extracts skills formatted as `Category : Skills` or `Category - Skills`:

```markdown
## Technical Skills
- **Cloud & Platforms:** AWS, GCP, Azure, Kubernetes, Docker, Terraform
- **Languages & Frameworks:** Python, TypeScript, Rust, Go, Next.js, React, Node.js
- **Data & Storage:** PostgreSQL, Redis, Snowflake, BigQuery, Apache Kafka, Spark
```

---

### Professional Experience
Each job entry begins with `###` or bold text with pipes `|`:
- Format: `### Role | Company | Location | Duration`
- Or: `### Role | Company | Duration` (location on next line: `*Location*`)
- Responsibilities: Subsequent lines beginning with `- ` or `* `.

```markdown
## Professional Experience

### Senior Staff Software Engineer | Stripe | San Francisco, CA | Jan 2024 - Present
- Spearheaded redesign of core ledger database, improving transaction write throughput by 45%.
- Implemented real-time anomaly detection pipelines processing over $2B in monthly settlements.

### Lead Infrastructure Engineer | Coinbase | Remote | Mar 2021 - Dec 2023
- Orchestrated migration of 120+ microservices to Kubernetes, reducing compute infrastructure spend by 30%.
- Established automated blue/green deployment pipelines with zero customer-facing downtime.
```

---

### Technical Projects
Each project starts with `### Project Name | Technologies | Duration`:
- Followed by bullet points `- `.

```markdown
## Technical Projects

### Distributed Consensus Engine | Rust, Raft, Tokio | 2024
- Implemented Raft distributed consensus protocol from scratch in Rust, achieving 15k ops/sec.
- Designed automated partition recovery with automated snapshotting and disk persistence.
```

---

### Education
- Line 1: `**Institution Name** — Location`
- Line 2: `*Degree Name* | Duration`
- Line 3 (Optional): `**Relevant Coursework:** Course 1, Course 2, Course 3` (or `GPA: 3.9/4.0`)

```markdown
## Education

**University of California, Berkeley** — Berkeley, CA
*Master of Science in Computer Science* | 2022 - 2024
**Relevant Coursework:** Distributed Systems, Advanced Database Design, Deep Learning
```

---

## 3. Sanitization & Edge-Case Protection

1. **LLM Citation Tags**: Remove any `[cite: ...]` strings before compiling; the backend automatically runs `re.sub(r"\[cite:\s*[\d,\s-]+\]", "", text)` to prevent compilation syntax errors in Typst.
2. **Special Characters**: If candidate names or company names include characters like `&` or `#`, write them cleanly. The backend handles JSON escaping when injecting into `clean_resume.json`.
3. **Dash Normalization**: En-dashes (`–`) and Em-dashes (`—`) in duration fields are automatically converted by the backend to `-`.
