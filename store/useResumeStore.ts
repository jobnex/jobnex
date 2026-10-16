import { create } from "zustand";
import { sampleResumeMarkdown } from "@/data/sample-resume";
import { 
  RESUME_TEMPLATES, 
  ResumeTemplate, 
  TypstThemeId, 
  getTemplateById 
} from "@/data/resume-templates";
import { saveResumePayloadLocally } from "@/lib/resumeApi";

interface ResumeState {
  selectedTemplateId: string;
  activeTemplate: ResumeTemplate;
  activeThemeId: TypstThemeId;
  resumeMarkdown: string;
  hasOverflow: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;

  setSelectedTemplateId: (templateId: string) => void;
  setResumeMarkdown: (markdown: string) => void;
  setHasOverflow: (overflow: boolean) => void;
  saveResume: (customMarkdown?: string, customTemplateId?: string) => Promise<boolean>;
  resetToSample: () => void;
}

const STORAGE_KEY_TEMPLATE = "strawberry_resume_template_id";
const STORAGE_KEY_MARKDOWN = "strawberry_resume_markdown";

const getInitialTemplateId = (): string => {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATE);
      if (saved && RESUME_TEMPLATES.some((t) => t.id === saved)) {
        return saved;
      }
    } catch {}
  }
  return RESUME_TEMPLATES[0].id;
};

const getInitialMarkdown = (): string => {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MARKDOWN);
      if (saved && saved.trim().length > 0) {
        return saved;
      }
    } catch {}
  }
  return sampleResumeMarkdown;
};

const initialTmplId = getInitialTemplateId();
const initialTemplate = getTemplateById(initialTmplId);

export const useResumeStore = create<ResumeState>((set, get) => ({
  selectedTemplateId: initialTmplId,
  activeTemplate: initialTemplate,
  activeThemeId: initialTemplate.themeId,
  resumeMarkdown: getInitialMarkdown(),
  hasOverflow: false,
  isSaving: false,
  lastSavedAt: null,

  setSelectedTemplateId: (templateId: string) => {
    const template = getTemplateById(templateId);
    set({
      selectedTemplateId: templateId,
      activeTemplate: template,
      activeThemeId: template.themeId,
    });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_TEMPLATE, templateId);
      } catch {}
    }
    // Update local file payload in the background
    const { resumeMarkdown } = get();
    saveResumePayloadLocally({
      markdown: resumeMarkdown,
      theme: template.themeId,
      templateId: template.id,
      templateName: template.name,
      include_base64: true,
    });
  },

  setResumeMarkdown: (markdown: string) => {
    set({ resumeMarkdown: markdown });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_MARKDOWN, markdown);
      } catch {}
    }
  },

  setHasOverflow: (hasOverflow: boolean) => {
    set({ hasOverflow });
  },

  saveResume: async (customMarkdown?: string, customTemplateId?: string) => {
    const state = get();
    const markdown = customMarkdown ?? state.resumeMarkdown;
    const templateId = customTemplateId ?? state.selectedTemplateId;
    const template = getTemplateById(templateId);

    set({ isSaving: true });

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_MARKDOWN, markdown);
        localStorage.setItem(STORAGE_KEY_TEMPLATE, templateId);
      } catch {}
    }

    const res = await saveResumePayloadLocally({
      markdown,
      theme: template.themeId,
      templateId: template.id,
      templateName: template.name,
      include_base64: true,
    });

    const now = new Date().toISOString();
    set({
      resumeMarkdown: markdown,
      selectedTemplateId: templateId,
      activeTemplate: template,
      activeThemeId: template.themeId,
      isSaving: false,
      lastSavedAt: now,
    });

    return res.success;
  },

  resetToSample: () => {
    const defaultTemplate = RESUME_TEMPLATES[0];
    set({
      resumeMarkdown: sampleResumeMarkdown,
      selectedTemplateId: defaultTemplate.id,
      activeTemplate: defaultTemplate,
      activeThemeId: defaultTemplate.themeId,
      hasOverflow: false,
    });
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY_MARKDOWN);
        localStorage.setItem(STORAGE_KEY_TEMPLATE, defaultTemplate.id);
      } catch {}
    }
    saveResumePayloadLocally({
      markdown: sampleResumeMarkdown,
      theme: defaultTemplate.themeId,
      templateId: defaultTemplate.id,
      templateName: defaultTemplate.name,
      include_base64: true,
    });
  },
}));
