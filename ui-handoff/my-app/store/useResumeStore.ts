import { create } from "zustand";
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

// Resume contents are hydrated from authenticated DB storage, never shared browser keys.
const getInitialMarkdown = (): string => "";

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

  },

  setResumeMarkdown: (markdown: string) => { set({ resumeMarkdown: markdown }); },

  setHasOverflow: (hasOverflow: boolean) => {
    set({ hasOverflow });
  },

  saveResume: async (customMarkdown?: string, customTemplateId?: string) => {
    const state = get();
    const markdown = customMarkdown ?? state.resumeMarkdown;
    const templateId = customTemplateId ?? state.selectedTemplateId;
    const template = getTemplateById(templateId);

    set({ isSaving: true });

    const res = await saveResumePayloadLocally({
      markdown,
      theme: template.themeId,
      templateId: template.id,
      templateName: template.name,
      include_base64: true,
    });

    if (!res.success) { set({ isSaving: false }); return false; }
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
    const template = RESUME_TEMPLATES[0];
    set({ resumeMarkdown: "", selectedTemplateId: template.id, activeTemplate: template, activeThemeId: template.themeId, hasOverflow: false });
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY_MARKDOWN);
  },
}));
