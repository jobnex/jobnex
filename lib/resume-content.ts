type Details = Record<string, unknown>;
const object = (value: unknown): Details => value && typeof value === "object" && !Array.isArray(value) ? value as Details : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const list = (value: unknown): Details[] => Array.isArray(value) ? value.map(object) : [];

// Keep non-builder sections (projects, skills, summary, etc.) from extracted Markdown.
export function resumeMarkdown(details: Details, edited = false): string {
  const original = text(object(details.compiler_payload).markdown);
  if (original && !edited) return original;
  if (!original && !edited && text(details.text)) return "# Resume\n\n" + text(details.text);
  const sections = original.split(/^##\s+/m);
  const extra = sections.slice(1).filter(section => !/^(education|experience|professional experience|work experience)\s*\n/i.test(section));
  const personal = object("personalDetails" in details ? details.personalDetails : details.header);
  const name = text(personal.fullName ?? personal.name);
  const lines = name ? ["# " + name] : [];
  const contact = [personal.email, personal.phoneNumber ?? personal.phone, personal.location].map(text).filter(Boolean);
  const header = object(details.header);
  if (Array.isArray(header.additional_contacts)) for (const value of header.additional_contacts.map(text).filter(Boolean)) {
    if (!contact.includes(value)) contact.push(value);
  }
  if (contact.length) lines.push(contact.join(" | "));
  if (!original || sections.length === 1) {
    for (const [title, field] of [["Professional Summary", "summary"], ["Skills & Technologies", "skills"], ["Projects", "projects"], ["Certifications", "certifications"], ["Awards", "awards"], ["Publications", "publications"], ["Volunteering", "volunteering"], ["Languages", "languages"], ["Training", "training"], ["Research", "research"], ["Leadership", "leadership"], ["Achievements", "achievements"], ["Additional Information", "additional_information"]]) {
      const value = details[field];
      const content = Array.isArray(value) ? value.map(text).filter(Boolean).join(", ") : text(value);
      if (content) lines.push("", "## " + title, content);
    }
  }
  const education = list(details.educationHistory);
  if (education.length) {
    lines.push("", "## Education");
    for (const entry of education) {
      lines.push(`**${text(entry.college)}** —`, `*${[entry.degree,entry.field].map(text).filter(Boolean).join(" ")}* | ${[entry.startDate,entry.endDate].map(text).filter(Boolean).join(" – ")}`);
      if (text(entry.location)) lines.push(text(entry.location));
      if (text(entry.details)) lines.push(text(entry.details));
      const grade = text(entry.grade);
      if (grade && !text(entry.details).includes(grade)) lines.push(`GPA: ${grade}${text(entry.maxGrade) ? "/" + text(entry.maxGrade) : ""}`);
    }
  } else if (!("educationHistory" in details) && text(details.education)) lines.push("", "## Education", text(details.education));
  const experience = list(details.experienceHistory ?? details.experience);
  const extractedExperience = text(details.experience_text) || text(details.experience);
  if (!("experienceHistory" in details) && extractedExperience) lines.push("", "## Experience", extractedExperience);
  else if (experience.length) {
    lines.push("", "## Experience");
    for (const entry of experience) {
      const role = text(entry.role ?? entry.title);
      if (role) lines.push("### " + role);
      lines.push([entry.company, entry.dates ?? [entry.startDate, entry.endDate].map(text).filter(Boolean).join(" – ")].map(text).filter(Boolean).join(" | "));
      if (text(entry.location)) lines.push(text(entry.location));
      if (text(entry.jobDescription)) lines.push(text(entry.jobDescription));
      else if (Array.isArray(entry.bullets)) lines.push(...entry.bullets.map(text).filter(Boolean).map(bullet => "- " + bullet));
      if (text(entry.responsibilities)) lines.push(text(entry.responsibilities));
    }
  }
  lines.push(...extra.map(section => "\n## " + section.trim()));
  let rendered = lines.filter((line, index) => line || lines[index - 1]).join("\n").trim();
  const sectionKey = (label: string) => {
    const value=label.replace(/^#+\s*/, "").trim().toLowerCase();
    return /^(professional |career )?summary$/.test(value) ? 'summary' : /^(technical |professional )?skills(?: & technologies)?$/.test(value) ? 'skills' : /^(professional |work )?experience$/.test(value) ? 'experience' : /^(technical |personal |academic |selected )?projects$/.test(value) ? 'projects' : /^(education|academic qualifications)$/.test(value) ? 'education' : null;
  };
  const order=[...new Set(text(details.text).split(/\r?\n/).map(sectionKey).filter(key => key!==null))];
  if(order.length>1){
    const chunks=rendered.split(/(?=^##\s+)/m);
    const rank=(chunk:string)=>{const key=sectionKey(chunk.split("\n")[0]);return key&&order.includes(key)?order.indexOf(key):order.length;};
    rendered=chunks[0].trimEnd()+"\n\n"+chunks.slice(1).sort((a,b)=>rank(a)-rank(b)).map(chunk=>chunk.trim()).join("\n\n");
  }
  return rendered || (text(details.text) ? "# Resume\n\n" + text(details.text) : "");
}

export function normalizeResume(details: Details, edited = false): Details {
  const markdown = resumeMarkdown(details, edited);
  return { ...details, compiler_payload: { ...object(details.compiler_payload), markdown } };
}

export function resumeText(content: unknown, parsed: unknown): string {
  const source = text(content);
  if (source.startsWith("{")) {
    try { return resumeMarkdown(object(JSON.parse(source))); } catch { return ""; }
  }
  return source || resumeMarkdown(object(parsed));
}
