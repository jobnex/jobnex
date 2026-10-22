export interface PersonalInfo {
  name: string;
  title: string;
  phone: string;
  email: string;
  linkedin: string;
  github: string;
  location: string;
  extraContacts?: string[];
}

export interface SkillCategory {
  category: string;
  items: string;
}

export interface ExperienceItem {
  role: string;
  company: string;
  location: string;
  duration: string;
  bullets: string[];
}

export interface ProjectItem {
  title: string;
  technologies: string;
  duration: string;
  bullets: string[];
}

export interface EducationItem {
  institution: string;
  location: string;
  degree: string;
  duration: string;
  details?: string;
}

export interface ParsedResume {
  personalInfo: PersonalInfo;
  summary: string[];
  skills: SkillCategory[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
  sectionOrder: string[];
  rawMarkdown: string;
  additionalSections?: Record<string, { title: string; lines: string[] }>;
}

/**
 * Helper to strip outer and inline markdown bold/italic markers from heading metadata
 */
function cleanHeadingText(text: string): string {
  return text
    .replace(/^(?:#{1,6}\s+)+/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\*+|\*+$/g, "")
    .trim();
}

export function resumePlainText(text: string): string {
  return cleanHeadingText(text).replace(/^[-*•]\s+/, "• ");
}

/**
 * Robust bullet extraction supporting Unicode bullets (with or without glued whitespace)
 * and markdown hyphens/asterisks (strictly requiring whitespace).
 */
function extractBulletText(line: string): string | null {
  // Unicode bullets: • or \u2022 (supports glued text like •Designed)
  const unicodeMatch = line.match(/^[•\u2022]\s*(.*)$/);
  if (unicodeMatch) {
    return unicodeMatch[1].trim();
  }
  // Markdown bullets: - or * (requires space)
  const mdMatch = line.match(/^[-*]\s+(.*)$/);
  if (mdMatch) {
    return mdMatch[1].trim();
  }
  return null;
}

/**
 * Checks whether a line contains obvious contact tokens (email, phone, URLs).
 */
function hasContactTokens(line: string): boolean {
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const urlRegex = /(?:https?:\/\/|www\.|\b[\w-]+\.[a-z]{2,}(?:\/|\b))/i;
  return emailRegex.test(line) || phoneRegex.test(line) || urlRegex.test(line);
}

/**
 * Parses markdown into structured resume sections according to markdown-contract.md
 */
export function parseResumeMarkdown(markdown: string): ParsedResume {
  const lines = markdown.split(/\r?\n/);
  
  const personalInfo: PersonalInfo = {
    name: "",
    title: "",
    phone: "",
    email: "",
    linkedin: "",
    github: "",
    location: "",
  };

  const summary: string[] = [];
  const skills: SkillCategory[] = [];
  const experience: ExperienceItem[] = [];
  const projects: ProjectItem[] = [];
  const education: EducationItem[] = [];
  const sectionOrder: string[] = [];
  const additionalSections: Record<string, { title: string; lines: string[] }> = {};
  const extraContacts: string[] = [];
  const projectSourceLines: string[] = [];
  let unstructuredProjects = false;

  let currentSection = "header";
  let currentExpItem: ExperienceItem | null = null;
  let currentProjectItem: ProjectItem | null = null;
  let currentEduItem: EducationItem | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (/^(?:[-*_]\s*){3,}$/.test(line)) continue;
    if (!line && currentSection === "header") continue;

    // Check for Section Headers: ## ...
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      // Commit pending sub-items
      if (currentExpItem) { experience.push(currentExpItem); currentExpItem = null; }
      if (currentProjectItem) { projects.push(currentProjectItem); currentProjectItem = null; }
      if (currentEduItem) { education.push(currentEduItem); currentEduItem = null; }

      const title = headerMatch[1].trim().toLowerCase();
      if (title.includes("summary") || title.includes("profile") || title.includes("objective") || title.includes("about")) {
        currentSection = "summary";
        if (!sectionOrder.includes("summary")) sectionOrder.push("summary");
      } else if (title.includes("skill") || title.includes("technolog") || title.includes("stack") || title.includes("tool")) {
        currentSection = "skills";
        if (!sectionOrder.includes("skills")) sectionOrder.push("skills");
      } else if (title.includes("experience") || title.includes("work") || title.includes("employment")) {
        currentSection = "experience";
        if (!sectionOrder.includes("experience")) sectionOrder.push("experience");
      } else if (title.includes("project") || title.includes("portfolio")) {
        currentSection = "projects";
        if (!sectionOrder.includes("projects")) sectionOrder.push("projects");
      } else if (title.includes("education") || title.includes("academic") || title.includes("degree")) {
        currentSection = "education";
        if (!sectionOrder.includes("education")) sectionOrder.push("education");
      } else {
        currentSection = title;
        if (!sectionOrder.includes(title)) sectionOrder.push(title);
        additionalSections[title] ??= { title: headerMatch[1].trim(), lines: [] };
      }
      continue;
    }

    // Process Content Based on Current Section
    if (currentSection === "header") {
      // Line with # Name
      if (line.startsWith("# ") && !personalInfo.name) {
        personalInfo.name = cleanHeadingText(line);
      } else if (!personalInfo.title && !hasContactTokens(line) && (line.startsWith("**") || line.startsWith("*") || personalInfo.name)) {
        // Line with Title (allows pipe-delimited title like **Backend Developer | AI Infrastructure | Python**)
        personalInfo.title = cleanHeadingText(line);
      } else {
        // Extract contacts from contact line
        // Email
        const emailMatch = line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
        if (emailMatch && !personalInfo.email) {
          personalInfo.email = emailMatch[0];
        }
        // Phone
        const phoneMatch = line.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        if (phoneMatch && !personalInfo.phone) {
          personalInfo.phone = phoneMatch[0].trim();
        }
        // LinkedIn (strip protocol and trailing slash)
        const linkedinMatch = line.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+(?:\/)?/);
        if (linkedinMatch && !personalInfo.linkedin) {
          personalInfo.linkedin = linkedinMatch[0].replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/$/, "");
        }
        // GitHub (strip protocol and trailing slash)
        const githubMatch = line.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+(?:\/)?/);
        if (githubMatch && !personalInfo.github) {
          personalInfo.github = githubMatch[0].replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/$/, "");
        }
        // Location (e.g. San Francisco, CA or Bellevue, WA or City, Country)
        const parts = line.split("|").map((p) => p.trim());
        for (const p of parts) {
          if (!p.includes("@") && !p.includes("http") && !p.includes("linkedin") && !p.includes("github") && !p.match(/\d{3}/)) {
            const cleanLoc = p.replace(/[^\w\s,.-]/g, "").trim();
            if (cleanLoc.length > 2 && (cleanLoc.includes(",") || cleanLoc.includes(" "))) {
              personalInfo.location = cleanLoc;
            }
          }
        }
        for (const part of parts) {
          const value = cleanHeadingText(part);
          const known = [personalInfo.phone, personalInfo.email, personalInfo.linkedin, personalInfo.github, personalInfo.location];
          const key = (s: string) => s.replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/$/, "");
          if (value && !known.some(item => item && key(item) === key(value))) extraContacts.push(value);
        }
      }
    } else if (currentSection === "summary") {
      const bulletText = extractBulletText(line);
      if (bulletText !== null) {
        summary.push(bulletText);
      } else if (line.length > 0) {
        summary.push(line);
      }
    } else if (currentSection === "skills") {
      // Formats: - **Category:** Items OR Category : Items
      const boldCatMatch = line.match(/^[-*•\u2022]?\s*\*\*([^*]+)\*\*:?\s*(.*)$/);
      if (boldCatMatch) {
        skills.push({
          category: cleanHeadingText(boldCatMatch[1]).replace(/:$/, "").trim(),
          items: boldCatMatch[2].trim(),
        });
      } else {
        const colonParts = line.replace(/^[-*•\u2022]\s*/, "").split(":");
        if (colonParts.length >= 2) {
          skills.push({
            category: cleanHeadingText(colonParts[0]).trim(),
            items: colonParts.slice(1).join(":").trim(),
          });
        } else if (line) {
          // Wrapped skill continuation: append to previous category if one exists
          if (skills.length > 0) {
            const lastSkill = skills[skills.length - 1];
            const cleanAdd = line.replace(/^[-*•\u2022]\s*/, "").trim();
            lastSkill.items = lastSkill.items ? `${lastSkill.items}, ${cleanAdd}` : cleanAdd;
          } else {
            skills.push({
              category: "General",
              items: line,
            });
          }
        }
      }
    } else if (currentSection === "experience") {
      const isHeaderOrMeta = /^#{3,6}\s+/.test(line) || (line.startsWith("**") && line.includes("|"));
      if (isHeaderOrMeta) {
        const entryText = cleanHeadingText(line);
        const parts = entryText.split("|").map((p) => cleanHeadingText(p));

        // Check for bodyless role merge: previous item has role but no company/date and no bullets
        if (currentExpItem && !currentExpItem.company && currentExpItem.bullets.length === 0 && parts.length >= 2) {
          currentExpItem.company = parts[0] || "";
          if (parts.length >= 3) {
            currentExpItem.location = parts[1] || "";
            currentExpItem.duration = parts[2] || "";
          } else {
            currentExpItem.duration = parts[1] || "";
          }
        } else {
          if (currentExpItem) experience.push(currentExpItem);
          const role = parts[0] || "";
          const company = parts[1] || "";
          let location = parts[2] || "";
          let duration = parts[3] || "";

          if (parts.length === 3) {
            if (parts[2].match(/\d{4}|Present/i)) {
              duration = parts[2];
              location = "";
            }
          }

          currentExpItem = {
            role,
            company,
            location,
            duration,
            bullets: [],
          };
        }
      } else {
        const bulletText = extractBulletText(line);
        if (bulletText !== null) {
          if (currentExpItem) {
            currentExpItem.bullets.push(bulletText);
          }
        } else if (line && currentExpItem) {
          // Append continuation to previous bullet if present
          if (currentExpItem.bullets.length > 0) {
            const lastIdx = currentExpItem.bullets.length - 1;
            currentExpItem.bullets[lastIdx] = `${currentExpItem.bullets[lastIdx]} ${line}`;
          } else {
            currentExpItem.bullets.push(line);
          }
        }
      }
    } else if (currentSection === "projects") {
      if (line) projectSourceLines.push(rawLine);
      const isHeaderOrMeta = /^#{3,6}\s+/.test(line) || (line.startsWith("**") && line.includes("|"));
      if (line && !isHeaderOrMeta && !currentProjectItem) unstructuredProjects = true;
      if (isHeaderOrMeta) {
        if (currentProjectItem) projects.push(currentProjectItem);
        const entryText = cleanHeadingText(line);
        const parts = entryText.split("|").map((p) => cleanHeadingText(p));
        currentProjectItem = {
          title: parts[0] || "",
          technologies: parts[1] || "",
          duration: parts[2] || "",
          bullets: [],
        };
      } else {
        const bulletText = extractBulletText(line);
        if (bulletText !== null) {
          if (currentProjectItem) {
            currentProjectItem.bullets.push(bulletText);
          }
        } else if (line && currentProjectItem) {
          if (currentProjectItem.bullets.length > 0) {
            const lastIdx = currentProjectItem.bullets.length - 1;
            currentProjectItem.bullets[lastIdx] = `${currentProjectItem.bullets[lastIdx]} ${line}`;
          } else {
            currentProjectItem.bullets.push(line);
          }
        }
      }
    } else if (currentSection === "education") {
      const plain = cleanHeadingText(line);
      const columns = plain.split(/\s{2,}/);
      const date = /(?:19|20)\d{2}|Present/i;
      const degreeLine = /^\*(?!\*)/.test(line) && line.includes("|");
      const schoolLine = /^#{3,6}\s+/.test(line) ||
        (line.startsWith("**") && !/coursework|gpa/i.test(plain) && !date.test(plain)) ||
        (!currentEduItem && !!line) ||
        (columns.length > 1 && date.test(columns[columns.length - 1]) && !!currentEduItem?.degree && !degreeLine) ||
        (/\b(university|college|institute)\b/i.test(plain) && !date.test(plain) && !degreeLine);
      if (!line) continue;
      if (schoolLine) {
        if (currentEduItem) education.push(currentEduItem);
        const parts = plain.split(/\s+—\s*|\s+\|\s+|\s{2,}/);
        currentEduItem = { institution: parts[0] || "", location: "", degree: "", duration: "" };
        for (const part of parts.slice(1)) {
          if (date.test(part)) currentEduItem.duration = part;
          else currentEduItem.location = [currentEduItem.location, part].filter(Boolean).join(" | ");
        }
      } else if (currentEduItem) {
        const parts = plain.split(/\s*\|\s*|\s{2,}/);
        if (/coursework|gpa/i.test(plain) || (currentEduItem.degree && !degreeLine)) {
          currentEduItem.details = [currentEduItem.details, plain].filter(Boolean).join(" ");
        } else {
          const firstIsDate = date.test(parts[0]) && !/[A-Za-z]\./.test(parts[0]);
          if (degreeLine || !firstIsDate) currentEduItem.degree = parts[0] || "";
          for (const part of parts.slice(degreeLine || !firstIsDate ? 1 : 0)) {
            if (date.test(part)) currentEduItem.duration = part;
            else currentEduItem.location = part;
          }
        }
      }
    } else if (additionalSections[currentSection] && line) {
      additionalSections[currentSection].lines.push(rawLine);
    }
  }

  // Commit any trailing items
  if (currentExpItem) experience.push(currentExpItem);
  if (currentProjectItem) projects.push(currentProjectItem);
  if (currentEduItem) education.push(currentEduItem);
  if (unstructuredProjects) {
    // PDF project descriptions may have no Markdown subheadings. Preserve them
    // verbatim through preview/edit/export rather than dropping unparsed text.
    projects.splice(0);
    additionalSections.projects = {title:"Projects",lines:projectSourceLines};
  }

  personalInfo.extraContacts = [...new Set(extraContacts)];
  return {
    personalInfo,
    summary,
    skills,
    experience,
    projects,
    education,
    sectionOrder: sectionOrder.length > 0 ? sectionOrder : ["summary", "skills", "experience", "projects", "education"],
    rawMarkdown: markdown,
    additionalSections,
  };
}

/**
 * Formats structured resume data back into strict Markdown matching the backend parser contract.
 */
export function serializeResumeToMarkdown(data: ParsedResume): string {
  const parts: string[] = [];

  // Header
  if (data.personalInfo.name) {
    parts.push(`# ${data.personalInfo.name}`);
  }
  if (data.personalInfo.title) {
    parts.push(`**${data.personalInfo.title}**`);
  }

  const contacts: string[] = [];
  if (data.personalInfo.phone) contacts.push(data.personalInfo.phone);
  if (data.personalInfo.email) contacts.push(data.personalInfo.email);
  if (data.personalInfo.linkedin) contacts.push(data.personalInfo.linkedin);
  if (data.personalInfo.github) contacts.push(data.personalInfo.github);
  if (data.personalInfo.location) contacts.push(data.personalInfo.location);

  contacts.push(...(data.personalInfo.extraContacts || []));
  if (contacts.length > 0) {
    parts.push(contacts.join(" | "));
  }
  parts.push("");

  // Sections according to sectionOrder
  const sectionsToRender = data.sectionOrder.length > 0 ? data.sectionOrder : ["summary", "skills", "experience", "projects", "education"];

  for (const section of sectionsToRender) {
    if (section === "summary" && data.summary.length > 0) {
      parts.push("## Professional Summary");
      for (const bullet of data.summary) {
        parts.push(`- ${bullet}`);
      }
      parts.push("");
    } else if (section === "skills" && data.skills.length > 0) {
      parts.push("## Technical Skills");
      for (const s of data.skills) {
        parts.push(`- **${s.category}:** ${s.items}`);
      }
      parts.push("");
    } else if (section === "experience" && data.experience.length > 0) {
      parts.push("## Professional Experience");
      for (const exp of data.experience) {
        const headerParts = [exp.role, exp.company];
        if (exp.location) headerParts.push(exp.location);
        if (exp.duration) headerParts.push(exp.duration);
        parts.push(`### ${headerParts.join(" | ")}`);
        for (const bullet of exp.bullets) {
          parts.push(`- ${bullet}`);
        }
        parts.push("");
      }
    } else if (section === "projects" && data.projects.length > 0) {
      parts.push("## Technical Projects");
      for (const proj of data.projects) {
        const headerParts = [proj.title];
        if (proj.technologies) headerParts.push(proj.technologies);
        if (proj.duration) headerParts.push(proj.duration);
        parts.push(`### ${headerParts.join(" | ")}`);
        for (const bullet of proj.bullets) {
          parts.push(`- ${bullet}`);
        }
        parts.push("");
      }
    } else if (section === "education" && data.education.length > 0) {
      parts.push("## Education");
      for (const edu of data.education) {
        parts.push(`**${edu.institution}** — ${edu.location}`);
        if (edu.degree || edu.duration) {
          parts.push(`*${edu.degree}* | ${edu.duration}`);
        }
        if (edu.details) {
          parts.push(edu.details);
        }
        parts.push("");
      }
    } else if (data.additionalSections?.[section]) {
      const extra = data.additionalSections[section];
      parts.push(`## ${extra.title}`, ...extra.lines, "");
    }
  }

  return parts.join("\n").trim() + "\n";
}
