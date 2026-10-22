"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { pool } from "@/lib/db";
import { getTemplateById, RESUME_TEMPLATES, TypstThemeId } from "@/data/resume-templates";
import { resumeContentError } from "@/lib/resume-validation";

export interface CompileRequest {
  markdown: string;
  theme?: TypstThemeId;
  include_base64?: boolean;
  destination_endpoint?: string;
  templateId?: string;
  templateName?: string;
}
export interface SavedPayloadRecord {
  theme: TypstThemeId;
  templateId: string;
  templateName: string;
  include_base64: boolean;
  destination_endpoint: string;
  updatedAt: string;
  markdown: string;
}

export async function fetchResumePayloadLocallyServer(): Promise<{ success: boolean; data?: SavedPayloadRecord; error?: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { success: false, error: "Sign in to view your resume." };
  try {
    const result = await pool.query("SELECT resume_details->'compiler_payload' AS payload FROM public.user_job_preferences WHERE user_id=$1", [user.id]);
    const payload = result.rows[0]?.payload;
    return payload ? { success: true, data: payload } : { success: false, error: "No saved resume draft." };
  } catch {
    return { success: false, error: "Resume storage is unavailable." };
  }
}

export async function saveResumePayloadLocallyServer(request: CompileRequest): Promise<{ success: boolean; payload?: SavedPayloadRecord; error?: string }> {
  const user = await getCurrentUser();
  if (!user?.id) return { success: false, error: "Sign in to save your resume." };
  const contentError = resumeContentError(request?.markdown);
  if (contentError) return { success: false, error: contentError };
  const template = getTemplateById(request.templateId || "mit-capd");
  if (request.templateId && !RESUME_TEMPLATES.some(item => item.id === request.templateId)) return { success: false, error: "Unsupported template." };
  const payload: SavedPayloadRecord = {
    markdown: request.markdown, templateId: template.id, templateName: template.name, theme: template.themeId,
    include_base64: true, destination_endpoint: "", updatedAt: new Date().toISOString(),
  };
  try {
    // The immutable upload remains intact. Editable drafts are scoped to the signed-in user.
    await pool.query(`INSERT INTO public.user_job_preferences(user_id,preferences,resume_details)
      VALUES($1,'{}',jsonb_build_object('compiler_payload',$2::jsonb))
      ON CONFLICT(user_id) DO UPDATE SET
      resume_details=jsonb_set(COALESCE(user_job_preferences.resume_details,'{}'::jsonb),'{compiler_payload}',$2::jsonb),updated_at=now()`,
    [user.id, JSON.stringify(payload)]);
    return { success: true, payload };
  } catch {
    return { success: false, error: "Resume storage is unavailable." };
  }
}
