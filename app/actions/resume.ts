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

declare global {
  var __resumePayloadCache: SavedPayloadRecord | undefined;
}

const PAYLOAD_FILE_PATH = path.join(process.cwd(), "data", "resume-compile-payload.json");

export async function fetchResumePayloadLocallyServer(): Promise<{ success: boolean; data?: SavedPayloadRecord; error?: string }> {
  try {
    const data = await fs.readFile(PAYLOAD_FILE_PATH, "utf-8");
    const parsed = JSON.parse(data) as SavedPayloadRecord;
    if (globalThis.__resumePayloadCache && new Date(globalThis.__resumePayloadCache.updatedAt) > new Date(parsed.updatedAt)) {
      return { success: true, data: globalThis.__resumePayloadCache };
    }
    return { success: true, data: parsed };
  } catch {
    if (globalThis.__resumePayloadCache) {
      return { success: true, data: globalThis.__resumePayloadCache };
    }
    return { success: false, error: "Payload file not found or unreadable" };
  }
}

export async function saveResumePayloadLocallyServer(req: CompileRequest): Promise<{ success: boolean; payload?: SavedPayloadRecord; error?: string }> {
  const { markdown, theme, templateId, templateName, destination_endpoint } = req;

  const payload: SavedPayloadRecord = {
    theme: theme ?? 2,
    templateId: templateId ?? "mit-capd",
    templateName: templateName ?? "MIT CAPD Classical",
    include_base64: true,
    destination_endpoint: destination_endpoint ?? "",
    updatedAt: new Date().toISOString(),
    markdown: markdown ?? "",
  };

  // Always keep in-memory cache synchronized
  globalThis.__resumePayloadCache = payload;

  try {
    await fs.writeFile(PAYLOAD_FILE_PATH, JSON.stringify(payload, null, 2), "utf-8");
    return {
      success: true,
      payload,
    };
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    // In read-only serverless environments (e.g. Vercel Lambda / EROFS), do not fail the request
    if (err && (err.code === "EROFS" || err.code === "EACCES")) {
      console.warn("Serverless environment is read-only; payload persisted in-memory only.");
      return {
        success: true,
        payload,
      };
    }
    return { success: false, error: err?.message || "Failed to update payload" };
  }
}
