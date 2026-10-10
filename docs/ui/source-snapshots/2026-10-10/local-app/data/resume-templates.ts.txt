export type TypstThemeId = 2 | 3 | 5 | 6;

export interface ResumeTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  badge: string;
  fileName: string;
  filePath: string;
  thumbnailUrl: string;
  tags: string[];
  themeId: TypstThemeId;
  themeName: string;
}

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: "mit-capd",
    name: "MIT CAPD Classical",
    category: "Engineering & Tech",
    description: "High-density, structured single-column format recommended by MIT Career Advising for technical & STEM roles.",
    badge: "Popular",
    fileName: "MITCAPD.pdf",
    filePath: "",
    thumbnailUrl: "",
    tags: ["LaTeX", "ATS-Ready", "Engineering"],
    themeId: 2,
    themeName: "Jake's Resume (Standard Tech ATS)",
  },
  {
    id: "modern-ivy",
    name: "Modern Ivy LaTeX",
    category: "Software & Data",
    description: "Refined typography and balanced whitespace designed for senior engineers, tech leads, and researchers.",
    badge: "Recommended",
    fileName: "dhmkrwtksdgy.pdf",
    filePath: "",
    thumbnailUrl: "",
    tags: ["LaTeX", "Clean Spacing", "Research"],
    themeId: 3,
    themeName: "Modern Clean (Deedy Minimalist)",
  },
  {
    id: "tech-specialist",
    name: "Tech Specialist",
    category: "Full Stack & DevOps",
    description: "Emphasizes technical competencies, project architectures, and quantifiable systems impact.",
    badge: "Top Pick",
    fileName: "bznbzdprjfyy.pdf",
    filePath: "",
    thumbnailUrl: "",
    tags: ["Technical", "Projects First", "High Impact"],
    themeId: 6,
    themeName: "Minimal Tech (Vertical Accent)",
  },
  {
    id: "minimalist-exec",
    name: "Minimalist Executive",
    category: "Product & Leadership",
    description: "Streamlined, distraction-free single-page format prioritizing career milestones and leadership.",
    badge: "Executive",
    fileName: "cxtjgrmpsrvh.pdf",
    filePath: "",
    thumbnailUrl: "",
    tags: ["Minimal", "Leadership", "Compact"],
    themeId: 5,
    themeName: "Classic Executive (Sourabh Bajaj)",
  },

];

export function getTemplateById(id: string): ResumeTemplate {
  // Older saved selections remain readable; these were duplicate theme aliases.
  const canonicalId = id === "contemporary-compact" ? "modern-ivy" : id === "standard-overleaf" ? "mit-capd" : id;
  return RESUME_TEMPLATES.find((t) => t.id === canonicalId) || RESUME_TEMPLATES[0];
}

export function getThemeForTemplate(id: string): TypstThemeId {
  return getTemplateById(id).themeId;
}
