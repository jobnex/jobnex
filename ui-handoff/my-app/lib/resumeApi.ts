import { TypstThemeId } from "@/data/resume-templates";
import {
  saveResumePayloadLocallyServer,
  fetchResumePayloadLocallyServer,
} from "@/app/actions/resume";

export interface CompileRequest {
  markdown: string;
  theme?: TypstThemeId;
  include_base64?: boolean;
  destination_endpoint?: string;
  templateId?: string;
  templateName?: string;
}

export interface CompileResponse {
  success: boolean;
  theme: number;
  pdf_url?: string;
  pdf_base64?: string;
  json_data?: Record<string, unknown>;
  typst_code?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
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

/**
 * Saves the compiled resume payload locally in data/resume-compile-payload.json.
 * This stores all data required by the Typst compiler microservice.
 */
export async function saveResumePayloadLocally(payload: CompileRequest): Promise<{ success: boolean; payload?: SavedPayloadRecord; error?: string }> {
  try {
    return await saveResumePayloadLocallyServer(payload);
  } catch (err: unknown) {
    console.error("Failed to save local payload:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to save local payload" };
  }
}

/**
 * Retrieves the stored local resume compilation payload.
 */
export async function fetchResumePayloadLocally(): Promise<SavedPayloadRecord | null> {
  try {
    const res = await fetchResumePayloadLocallyServer();
    if (res.success && res.data) {
      return res.data;
    }
    return null;
  } catch (err) {
    console.error("Failed to fetch local payload:", err);
    return null;
  }
}

/**
 * Converts a base64 string to a browser Blob URL.
 */
export function base64ToBlobUrl(base64: string, contentType = "application/pdf"): string {
  if (typeof window === "undefined" || !base64) return "";
  try {
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");
    const binaryString = window.atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: contentType });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("Failed to convert base64 to Blob URL:", err);
    return "";
  }
}

/**
 * Helper to download text or markdown as a file
 */
export function downloadMarkdownFile(markdown: string, filename = "resume.md") {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
