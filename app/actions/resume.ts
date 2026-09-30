"use server";

import fs from "fs/promises";
import path from "path";
import { TypstThemeId } from "@/data/resume-templates";

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

const PAYLOAD_FILE_PATH = path.join(process.cwd(), "data", "resume-compile-payload.json");

export async function fetchResumePayloadLocallyServer(): Promise<{ success: boolean; data?: SavedPayloadRecord; error?: string }> {
  try {
    const data = await fs.readFile(PAYLOAD_FILE_PATH, "utf-8");
    return { success: true, data: JSON.parse(data) };
  } catch (error) {
    return { success: false, error: "Payload file not found or unreadable" };
  }
}

export async function saveResumePayloadLocallyServer(req: CompileRequest): Promise<{ success: boolean; payload?: SavedPayloadRecord; error?: string }> {
  try {
    const { markdown, theme, templateId, templateName, destination_endpoint } = req;

    const payload = {
      theme: theme ?? 2,
      templateId: templateId ?? "mit-capd",
      templateName: templateName ?? "MIT CAPD Classical",
      include_base64: true,
      destination_endpoint: destination_endpoint ?? "",
      updatedAt: new Date().toISOString(),
      markdown: markdown ?? "",
    };

    await fs.writeFile(PAYLOAD_FILE_PATH, JSON.stringify(payload, null, 2), "utf-8");

    return {
      success: true,
      payload,
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update payload" };
  }
}
