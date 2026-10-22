import type { ResumeDetailsData } from "@/lib/db/schema/preferences";

export interface CompilerPayload {
  markdown?: string;
  [key: string]: unknown;
}

export interface StructuredResumeData extends ResumeDetailsData {
  text?: string;
  rawText?: string;
  summary?: string[] | string;
  skills?: Array<{ category: string; items: string }> | Record<string, string[]> | string[];
  projects?: Array<{ title: string; technologies?: string; duration?: string; bullets?: string[] }>;
  compiler_payload?: CompilerPayload;
  [key: string]: unknown;
}

/**
 * Extracts raw or canonical resume text safely from content or parsed JSON.
 * Defensively handles plain markdown, stringified JSON, and structured object fallbacks.
 */
export function resumeText(content?: string | null, parsedData?: unknown): string {
  if (content && typeof content === "string" && content.trim().length > 0) {
    const trimmed = content.trim();
    // If it's not a JSON blob, it is authoritative Markdown
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      return trimmed;
    }
    // If it starts/ends with curly braces, try parsing to see if it's legacy serialized JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        if (parsed.compiler_payload?.markdown) {
          return String(parsed.compiler_payload.markdown).trim();
        }
        if (parsed.text) {
          return String(parsed.text).trim();
        }
      }
    } catch {
      // Not valid JSON, so treat as raw Markdown text
      return trimmed;
    }
  }

  // Fallback to parsedData if content was null or empty
  if (parsedData && typeof parsedData === "object") {
    const data = parsedData as StructuredResumeData;
    if (data.compiler_payload?.markdown) {
      return String(data.compiler_payload.markdown).trim();
    }
    if (data.text) {
      return String(data.text).trim();
    }
    return resumeMarkdown(data, false);
  }

  return "";
}

/**
 * Reconstructs or extracts Markdown from structured resume details.
 * When `edited` is false and a compiler_payload markdown already exists, it is returned verbatim.
 * When `edited` is true, editable builder sections (personal, experience, education) are rebuilt
 * while preserving non-builder sections (summary, skills, projects) from extraction data.
 */
export function resumeMarkdown(details?: StructuredResumeData | null, edited = false): string {
  if (!details) return "";

  // 1. If not explicitly edited and compiler_payload.markdown exists, return verbatim
  if (!edited && details.compiler_payload?.markdown && typeof details.compiler_payload.markdown === "string") {
    const existing = details.compiler_payload.markdown.trim();
    if (existing.length > 0) {
      return existing;
    }
  }

  // 2. Build Markdown sections
  const sections: string[] = [];

  // Header / Personal Details
  const personal = details.personalDetails;
  if (personal?.fullName) {
    sections.push(`# ${personal.fullName.trim()}`);
  }

  const contactParts: string[] = [];
  if (personal?.phoneNumber) contactParts.push(personal.phoneNumber.trim());
  if (personal?.email) contactParts.push(personal.email.trim());
  if (personal?.location) contactParts.push(personal.location.trim());

  if (contactParts.length > 0) {
    sections.push(contactParts.join(" | "));
  }

  // Professional Summary (preserve from extraction or existing compiler payload)
  let summaryText = "";
  if (Array.isArray(details.summary) && details.summary.length > 0) {
    summaryText = details.summary.map((s) => `- ${String(s).trim()}`).join("\n");
  } else if (typeof details.summary === "string" && details.summary.trim()) {
    summaryText = details.summary.trim();
  }

  if (summaryText) {
    sections.push(`## Professional Summary\n${summaryText}`);
  }

  // Technical Skills (preserve from extraction)
  if (details.skills) {
    const skillLines: string[] = [];
    if (Array.isArray(details.skills)) {
      for (const item of details.skills) {
        if (typeof item === "string" && item.trim()) {
          skillLines.push(`- ${item.trim()}`);
        } else if (typeof item === "object" && item !== null && "category" in item && "items" in item) {
          const cat = (item as { category: string; items: string }).category;
          const its = (item as { category: string; items: string }).items;
          skillLines.push(`- **${cat}:** ${its}`);
        }
      }
    } else if (typeof details.skills === "object") {
      for (const [category, items] of Object.entries(details.skills)) {
        if (Array.isArray(items)) {
          skillLines.push(`- **${category}:** ${items.join(", ")}`);
        }
      }
    }

    if (skillLines.length > 0) {
      sections.push(`## Technical Skills\n${skillLines.join("\n")}`);
    }
  }

  // Professional Experience (rebuilt from editable builder history or preserved verbatim)
  const experienceHistory = details.experienceHistory;
  if (Array.isArray(experienceHistory) && experienceHistory.length > 0) {
    const expBlocks: string[] = [];
    for (const exp of experienceHistory) {
      const headerParts: string[] = [];
      if (exp.role) headerParts.push(exp.role.trim());
      if (exp.company) headerParts.push(exp.company.trim());
      const dates = [exp.startDate, exp.endDate].filter(Boolean).join(" - ");
      if (dates) headerParts.push(dates);

      const header = `### ${headerParts.join(" | ")}`;
      const bullets: string[] = [];

      if (exp.jobDescription) {
        bullets.push(exp.jobDescription.trim());
      }
      if (exp.responsibilities) {
        const respLines = exp.responsibilities
          .split("\n")
          .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
          .filter(Boolean);
        for (const line of respLines) {
          bullets.push(`- ${line}`);
        }
      }

      if (bullets.length > 0) {
        expBlocks.push(`${header}\n${bullets.join("\n")}`);
      } else {
        expBlocks.push(header);
      }
    }

    if (expBlocks.length > 0) {
      sections.push(`## Professional Experience\n\n${expBlocks.join("\n\n")}`);
    }
  } else if (typeof details.experience_text === "string" && details.experience_text.trim()) {
    sections.push(`## Professional Experience\n\n${details.experience_text.trim()}`);
  }

  // Technical Projects (preserve from extraction)
  if (Array.isArray(details.projects) && details.projects.length > 0) {
    const projBlocks: string[] = [];
    for (const proj of details.projects) {
      const headerParts: string[] = [proj.title.trim()];
      if (proj.technologies) headerParts.push(proj.technologies.trim());
      if (proj.duration) headerParts.push(proj.duration.trim());

      const header = `### ${headerParts.join(" | ")}`;
      const bullets = (proj.bullets || []).map((b) => `- ${b.trim()}`).join("\n");
      projBlocks.push(bullets ? `${header}\n${bullets}` : header);
    }
    if (projBlocks.length > 0) {
      sections.push(`## Technical Projects\n\n${projBlocks.join("\n\n")}`);
    }
  }

  // Education (rebuilt from editable builder history)
  const educationHistory = details.educationHistory;
  if (Array.isArray(educationHistory) && educationHistory.length > 0) {
    const eduBlocks: string[] = [];
    for (const edu of educationHistory) {
      const lines: string[] = [];
      if (edu.college) lines.push(`**${edu.college.trim()}**`);
      
      const degreeParts: string[] = [];
      if (edu.degree) degreeParts.push(edu.degree.trim());
      if (edu.field) degreeParts.push(`in ${edu.field.trim()}`);
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(" - ");
      if (dates) degreeParts.push(`| ${dates}`);
      
      if (degreeParts.length > 0) {
        lines.push(`*${degreeParts.join(" ")}*`);
      }

      if (edu.grade) {
        const gradeStr = edu.maxGrade ? `${edu.grade}/${edu.maxGrade}` : edu.grade;
        lines.push(`**${edu.gradeType || "Grade"}:** ${gradeStr}`);
      }

      if (lines.length > 0) {
        eduBlocks.push(lines.join("\n"));
      }
    }

    if (eduBlocks.length > 0) {
      sections.push(`## Education\n\n${eduBlocks.join("\n\n")}`);
    }
  }

  const generated = sections.join("\n\n").trim();
  if (generated.length > 0) {
    return generated;
  }

  // Final fallback to raw source text if present
  return typeof details.text === "string" ? details.text.trim() : "";
}

/**
 * Normalizes resume details by preserving extraction metadata and updating compiler_payload.markdown.
 */
export function normalizeResume(details: StructuredResumeData, edited = false): StructuredResumeData {
  const markdown = resumeMarkdown(details, edited);

  return {
    ...details,
    compiler_payload: {
      ...(details.compiler_payload || {}),
      markdown,
    },
  };
}
