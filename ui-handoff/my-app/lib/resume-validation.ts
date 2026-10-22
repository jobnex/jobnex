import { parseResumeMarkdown } from "./resume-parser";

/** Structural checks apply to saved edits as well as generated drafts. */
export function resumeContentError(markdown: unknown, options: {allowUndatedExperience?:boolean} = {}): string | null {
  if (typeof markdown !== "string" || !markdown.trim()) return "Resume content cannot be empty.";
  if (markdown.length > 200_000) return "Resume content is too large.";
  let parserJson = /^\s*(?:#\s*)?\{/.test(markdown) || /"(?:source_file|compiler_payload|experienceHistory)"\s*:/.test(markdown);
  try {
    const value = JSON.parse(markdown.trim().replace(/^#\s*/, ""));
    parserJson ||= value !== null && typeof value === "object";
  } catch { /* Ordinary Markdown is not JSON. */ }
  if (parserJson) {
    return "Resume contains parser JSON instead of resume text. Regenerate from the original resume.";
  }
  if (/^#{3,6}\s+#{1,6}\s/m.test(markdown)) return "Resume contains malformed role headings. Correct the headings before continuing.";
  const resume = parseResumeMarkdown(markdown);
  if (!resume.personalInfo.name) return "Resume must include a name heading.";
  if (resume.sectionOrder.includes("experience") && !resume.experience.length) return "Experience section is empty.";
  if (resume.experience.some(role => !role.role || !role.company || (!options.allowUndatedExperience && !role.duration) || !role.bullets.length)) {
    return "Each experience entry needs a role, employer, dates and at least one bullet.";
  }
  if (resume.education.some(education => !education.institution || !education.degree)) {
    return "Each education entry needs an institution and degree. Check for missing degree text.";
  }
  return null;
}
