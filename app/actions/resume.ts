"use server";

import { z } from "zod";
import { TypstThemeId } from "@/data/resume-templates";
import { getCurrentUser } from "@/lib/auth/server";
import { pool as resumePool } from "@/lib/db";

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
const input = z.object({ markdown: z.string().max(200000), theme: z.union([z.literal(2), z.literal(3), z.literal(5), z.literal(6)]).optional(),
  include_base64: z.boolean().optional(), destination_endpoint: z.string().max(2000).optional(),
  templateId: z.string().max(100).optional(), templateName: z.string().max(200).optional() }).strict();

export async function fetchResumePayloadLocallyServer(): Promise<{ success: boolean; data?: SavedPayloadRecord; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in to view your resume" };
  try {
    const result = await resumePool.query("SELECT resume_details->'compiler_payload' AS payload FROM user_job_preferences WHERE user_id=$1", [user.id]);
    if (!result.rows[0]?.payload) return { success: false, error: "No saved resume payload" };
    return { success: true, data: result.rows[0].payload };
  } catch { return { success: false, error: "Resume storage is unavailable" }; }
}

export async function saveResumePayloadLocallyServer(req: CompileRequest): Promise<{ success: boolean; payload?: SavedPayloadRecord; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in to save your resume" };
  const parsed = input.safeParse(req);
  if (!parsed.success) return { success: false, error: "Invalid resume payload" };
  const payload: SavedPayloadRecord = { theme: (parsed.data.theme ?? 2) as TypstThemeId,
    templateId: parsed.data.templateId ?? "mit-capd", templateName: parsed.data.templateName ?? "MIT CAPD Classical",
    include_base64: true, destination_endpoint: parsed.data.destination_endpoint ?? "", updatedAt: new Date().toISOString(),
    markdown: parsed.data.markdown };
  try {
    await resumePool.query(`INSERT INTO user_job_preferences(user_id,preferences,resume_details)
      VALUES($1,'{}',jsonb_build_object('compiler_payload',$2::jsonb)) ON CONFLICT(user_id) DO UPDATE
      SET resume_details=jsonb_set(user_job_preferences.resume_details,'{compiler_payload}',$2::jsonb),updated_at=now()`,
      [user.id, JSON.stringify(payload)]);
    return { success: true, payload };
  } catch { return { success: false, error: "Resume storage is unavailable" }; }
}
