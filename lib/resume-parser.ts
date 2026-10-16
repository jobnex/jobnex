import { contactKey, extractContacts, uniqueContacts } from "./resume-contacts";
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
}

/** Flatten inline emphasis for the structured preview without changing words. */
export function plainResumeText(value: string): string {
  return value.replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/\*([^*\n]+)\*/g, "$1").trim();
}

// Generated drafts can nest ATX markers ("### ### Role") or emphasis.
// Only heading fields use this: hashes in ordinary prose/skills remain intact.
function headingText(value: string): string {
  return plainResumeText(value).replace(/^(?:#{1,6}\s+)+/, "").replace(/\s+#+\s*$/, "").trim();
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
    extraContacts: [],
  };

  const summary: string[] = [];
  const skills: SkillCategory[] = [];
  const experience: ExperienceItem[] = [];
  const projects: ProjectItem[] = [];
  const education: EducationItem[] = [];
  const sectionOrder: string[] = [];

  let currentSection = "header";
  let currentExpItem: ExperienceItem | null = null;
  let currentProjectItem: ProjectItem | null = null;
  let currentEduItem: EducationItem | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line && currentSection === "header") continue;

    // Check for Section Headers: ## ... or **Heading**
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      // Commit pending sub-items
      if (currentExpItem) { experience.push(currentExpItem); currentExpItem = null; }
      if (currentProjectItem) { projects.push(currentProjectItem); currentProjectItem = null; }
      if (currentEduItem) { education.push(currentEduItem); currentEduItem = null; }

      const title = headingText(headerMatch[1]).toLowerCase();
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
      }
      continue;
    }

    // Process Content Based on Current Section
    if (currentSection === "header") {
      // Line with # Name
      if (line.startsWith("# ") && !personalInfo.name) {
        personalInfo.name = headingText(line);
      } else if (line.startsWith("**") && line.endsWith("**") && !extractContacts(plainResumeText(line)).emails.length && !extractContacts(plainResumeText(line)).phones.length && !extractContacts(plainResumeText(line)).links.length && !personalInfo.title) {
        // Line with **Title**
        personalInfo.title = plainResumeText(line);
      } else if (!personalInfo.title && (line.startsWith("*") && line.endsWith("*") && !line.includes("|"))) {
        personalInfo.title = line.replace(/^\*|\*$/g, "").trim();
      } else {
        // Extract contacts from contact line
        const extracted = extractContacts(line);
        personalInfo.email ||= extracted.emails[0] || "";
        personalInfo.phone ||= extracted.phones[0] || "";
        for (const link of extracted.links) {
          if (/linkedin\.com\/in\//i.test(link) && !personalInfo.linkedin) personalInfo.linkedin = link;
          else if (/github\.com\//i.test(link) && !personalInfo.github) personalInfo.github = link;
          else personalInfo.extraContacts!.push(link);
        }
        personalInfo.extraContacts!.push(...extracted.emails.filter(value => value !== personalInfo.email), ...extracted.phones.filter(value => value !== personalInfo.phone));
        // Email
        const emailMatch = line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
        if (emailMatch && !personalInfo.email) {
          personalInfo.email = emailMatch[0];
        }
        // LinkedIn
        const linkedinMatch = line.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+(?:\/)?/);
        if (linkedinMatch && !personalInfo.linkedin) {
          personalInfo.linkedin = linkedinMatch[0].replace(/^https?:\/\/(?:www\.)?/, "");
        }
        // GitHub
        const githubMatch = line.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+(?:\/)?/);
        if (githubMatch && !personalInfo.github) {
          personalInfo.github = githubMatch[0].replace(/^https?:\/\/(?:www\.)?/, "");
        }
        // Location (e.g. San Francisco, CA or Bellevue, WA or City, Country)
        const parts = plainResumeText(line).split("|").map((p) => p.trim());
        for (const p of parts) {
          if (!p.includes("@") && !p.includes("http") && !p.includes("linkedin") && !p.includes("github") && !p.match(/\d{3}/)) {
            const cleanLoc = p.replace(/[^\w\s,.-]/g, "").trim();
            if (cleanLoc.length > 2 && cleanLoc.includes(",")) {
              personalInfo.location = cleanLoc;
            }
          }
        }
        for (const p of parts) {
          if (p && ![personalInfo.email,personalInfo.phone,personalInfo.location].some(value => value && p.includes(value)) &&
              !extracted.links.some(value => p.includes(value)) && !extracted.emails.some(value => p.includes(value)) && !extracted.phones.some(value => p.includes(value))) {
            personalInfo.extraContacts!.push(p);
          }
        }
      }
    } else if (currentSection === "summary") {
      if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
        summary.push(line.replace(/^[-*•]\s+/, "").trim());
      } else if (line.length > 0) {
        summary.push(line);
      }
    } else if (currentSection === "skills") {
      // Formats: - **Category:** Items  OR  Category : Items
      const boldCatMatch = line.match(/^[-*•]?\s*\*\*([^*]+)\*\*:?\s*(.*)$/);
      if (boldCatMatch) {
        skills.push({
          category: boldCatMatch[1].replace(/:$/, "").trim(),
          items: boldCatMatch[2].trim(),
        });
      } else {
        const colonParts = line.replace(/^[-*•]\s+/, "").split(":");
        if (colonParts.length >= 2) {
          skills.push({
            category: colonParts[0].trim(),
            items: colonParts.slice(1).join(":").trim(),
          });
        } else if (line) {
          const previous = skills.at(-1);
          if (previous && !/^[-*•●]\s*/.test(line) && lines[i - 1]?.trim()) {
            previous.items = previous.items.endsWith("-")
              ? previous.items.slice(0, -1) + line
              : previous.items + " " + line;
          } else {
            skills.push({ category: "General", items: line });
          }
        }
      }
    } else if (currentSection === "experience") {
      if (currentExpItem && !currentExpItem.company && !currentExpItem.bullets.length
          && line.startsWith("**") && line.includes("|")) {
        const parts = plainResumeText(line).split("|").map(p => p.trim());
        currentExpItem.company = parts[0] || "";
        const tail = parts.slice(1);
        currentExpItem.duration = tail.find(p => /\d{4}|Present/i.test(p)) || "";
        currentExpItem.location = tail.filter(p => p !== currentExpItem!.duration).join(" | ");
      } else if (/^#{3,6}\s+/.test(line) || (line.startsWith("**") && line.includes("|"))) {
        if (currentExpItem) experience.push(currentExpItem);
        const entryText = headingText(line);
        const parts = entryText.split("|").map((p) => p.trim());

        const role = parts[0] || "";
        const company = parts[1] || "";
        let location = parts[2] || "";
        let duration = parts[3] || "";

        if (parts.length === 3) {
          // Check if part 2 is date or location
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
      } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
        if (currentExpItem) {
          currentExpItem.bullets.push(line.replace(/^[-*•]\s+/, "").trim());
        }
      } else if (line && currentExpItem) {
        currentExpItem.bullets.push(line);
      }
    } else if (currentSection === "projects") {
      if (/^#{3,6}\s+/.test(line) || (line.startsWith("**") && line.includes("|"))) {
        if (currentProjectItem) projects.push(currentProjectItem);
        const entryText = headingText(line);
        const parts = entryText.split("|").map((p) => p.trim());
        currentProjectItem = {
          title: parts[0] || "",
          technologies: parts[1] || "",
          duration: parts[2] || "",
          bullets: [],
        };
      } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
        if (currentProjectItem) {
          currentProjectItem.bullets.push(line.replace(/^[-*•]\s+/, "").trim());
        }
      } else if (line && currentProjectItem) {
        currentProjectItem.bullets.push(line);
      }
    } else if (currentSection === "education") {
      // Lines: **School** — Location OR School | Location
      const columns = plainResumeText(line).split(/\s{2,}/);
      if (/^#{3,6}\s+/.test(line) || (columns.length > 1 && /(?:19|20)\d{2}/.test(columns[columns.length - 1]))) {
        if (currentEduItem) education.push(currentEduItem);
        currentEduItem = {
          institution: headingText(columns[0]),
          location: "",
          degree: "",
          duration: columns.slice(1).join(" "),
        };
      } else if (line.startsWith("**") && (line.includes("—") || line.includes("-") || line.includes("|"))) {
        if (currentEduItem) education.push(currentEduItem);
        const cleaned = plainResumeText(line);
        const parts = cleaned.split(/—|-|\|/).map((p) => p.trim());
        currentEduItem = {
          institution: parts[0] || "",
          location: parts[1] || "",
          degree: "",
          duration: "",
        };
      } else if (line.startsWith("*") && line.includes("|")) {
        const cleaned = plainResumeText(line);
        const parts = cleaned.split("|").map((p) => p.trim());
        if (currentEduItem) {
          currentEduItem.degree = parts[0] || "";
          currentEduItem.duration = parts[1] || "";
        }
      } else if (line.toLowerCase().includes("coursework") || line.toLowerCase().includes("gpa")) {
        if (currentEduItem) {
          currentEduItem.details = line.replace(/^\*\*|\*\*$/g, "").trim();
        }
      } else if (line && !currentEduItem) {
        currentEduItem = {
          institution: plainResumeText(line),
          location: "",
          degree: "",
          duration: "",
        };
      } else if (line && currentEduItem) {
        if (!currentEduItem.degree) currentEduItem.degree = plainResumeText(line);
        else currentEduItem.details = [currentEduItem.details, plainResumeText(line)].filter(Boolean).join(" ");
      }
    }
  }

  // Commit any trailing items
  if (currentExpItem) experience.push(currentExpItem);
  if (currentProjectItem) projects.push(currentProjectItem);
  if (currentEduItem) education.push(currentEduItem);

  const primaryContacts = [personalInfo.email, personalInfo.phone, personalInfo.linkedin, personalInfo.github, personalInfo.location];
  const titleParts = personalInfo.title.split("|").map(value => contactKey(value));
  personalInfo.extraContacts = uniqueContacts((personalInfo.extraContacts || []).map(plainResumeText)).filter(value =>
    !primaryContacts.some(primary => primary && contactKey(primary) === contactKey(value)) &&
    !titleParts.includes(contactKey(value)) &&
    value !== personalInfo.email.split("@")[0]);
  // Inline formatting belongs to the template; preserve the underlying text.
  summary.splice(0, summary.length, ...summary.map(plainResumeText));
  for (const skill of skills) { skill.category = plainResumeText(skill.category); skill.items = plainResumeText(skill.items); }
  for (const entry of [...experience, ...projects]) entry.bullets = entry.bullets.map(plainResumeText);
  return {
    personalInfo,
    summary,
    skills,
    experience,
    projects,
    education,
    sectionOrder: sectionOrder.length > 0 ? sectionOrder : ["summary", "skills", "experience", "projects", "education"],
    rawMarkdown: markdown,
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
          parts.push(`**${plainResumeText(edu.details)}**`);
        }
        parts.push("");
      }
    }
  }

  return parts.join("\n").trim() + "\n";
}
