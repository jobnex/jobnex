import type { ResumeDetailsData } from "@/lib/db/schema/preferences";

/** Format supplied facts only. Job preferences are not evidence of employment or qualifications. */
export function buildBaseResume(details: ResumeDetailsData, skills: string[] = []): string {
  const personal = details.personalDetails || {};
  const line = (value: unknown) => typeof value === "string" ? value.trim().replace(/[\r\n]+/g, " ") : "";
  const name = line(personal.fullName);
  if (!name) throw new Error("Enter your full name before creating a resume.");
  const contacts = Object.entries(personal).filter(([key]) => !["fullName", "name", "title"].includes(key))
    .flatMap(([, value]) => Array.isArray(value) ? value.map(line) : [line(value)]).filter(Boolean);
  const sections = [`# ${name}`, line(personal.title) ? `**${line(personal.title)}**` : "", Array.from(new Set(contacts)).join(" | ")].filter(Boolean);
  const education = (details.educationHistory || []).filter(entry => entry.college.trim() || entry.degree.trim()).map(entry => {
    const dates = [line(entry.startDate), line(entry.endDate)].filter(Boolean).join(" – ");
    const qualification = [line(entry.degree), line(entry.field)].filter(Boolean).join(" in ");
    const grade = line(entry.grade) ? `${line(entry.gradeType)}: ${line(entry.grade)}${line(entry.maxGrade) ? `/${line(entry.maxGrade)}` : ""}` : "";
    return [`**${line(entry.college)}** — `, `*${qualification || " "}* | ${dates}`, grade].filter(Boolean).join("\n");
  });
  const experience = (details.experienceHistory || []).filter(entry => entry.company.trim() || entry.role.trim()).map(entry => {
    const dates = [line(entry.startDate), line(entry.endDate)].filter(Boolean).join(" – ");
    const bullets = [entry.jobDescription, entry.responsibilities].filter(Boolean).join("\n").split(/\r?\n/)
      .map(value => value.trim()).filter(Boolean).map(value => value.startsWith("- ") ? value : `- ${value}`);
    return [`### ${line(entry.role)} | ${line(entry.company)} | | ${dates}`, ...bullets].join("\n");
  });
  if (education.length) sections.push("## Education", education.join("\n\n"));
  if (experience.length) sections.push("## Professional Experience", experience.join("\n\n"));
  const suppliedSkills = Array.from(new Set(skills.map(line).filter(Boolean)));
  if (suppliedSkills.length) sections.push("## Technical Skills", `**Skills:** ${suppliedSkills.join(", ")}`);
  return sections.join("\n\n") + "\n";
}
