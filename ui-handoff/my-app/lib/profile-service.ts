import crypto from "crypto";
import type { JobPreferencesData, ResumeDetailsData } from "@/lib/db/schema/preferences";

const PROFILE_SERVICE_URL =
  process.env.JOB_HUNT_SERVICE_URL || "https://layout-v1---job-hunt-profile-znsph25yja-ue.a.run.app";
const PROFILE_SERVICE_SECRET = process.env.JOB_HUNT_SERVICE_SECRET;

export interface ExtractResumeFromR2Params {
  userId: string;
  objectKey: string;
  fileName: string;
  downloadUrl: string;
}

export interface ExtractResumeResult {
  success: boolean;
  accepted?: boolean;
  reasonCode?: string;
  validatorVersion?: string;
  fileSha256?: string;
  markdown?: string;
  message?: string;
  detail?: string;
  preferences?: JobPreferencesData;
  resume_details?: ResumeDetailsData;
  compiler_payload?: unknown;
  resumeDocument?: unknown;
  error?: string;
}

/**
 * Generates cryptographic HMAC-SHA256 headers for Cloud Run Profile Service.
 * Follows the specification:
 * payloadHash = SHA256(exactRequestBodyBytes)
 * message     = userId + ":" + timestamp + ":" + payloadHash
 * signature   = HMAC-SHA256(secret, message).hex()
 * Tolerance   = 60 seconds
 */
export function generateProfileRequestHeaders(userId: string, bodyJsonString: string): Record<string, string> {
  if (!PROFILE_SERVICE_SECRET) {
    throw new Error("JOB_HUNT_SERVICE_SECRET is not configured in environment variables.");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyHash = crypto.createHash("sha256").update(bodyJsonString).digest("hex");
  const message = `${userId}:${timestamp}:${bodyHash}`;
  const signature = crypto.createHmac("sha256", PROFILE_SERVICE_SECRET).update(message).digest("hex");

  return {
    "Content-Type": "application/json",
    "x-user-id": userId,
    "x-timestamp": timestamp,
    "x-signature": signature,
  };
}

/**
 * Dispatches an extraction request to the Cloud Run profile service.
 * The service downloads the file from R2 via downloadUrl, extracts structured details,
 * persists the unconfirmed draft into Neon DB, and returns the extracted payload.
 */
export async function extractResumeProfileFromR2(
  params: ExtractResumeFromR2Params
): Promise<ExtractResumeResult> {
  try {
    const { userId, objectKey, fileName, downloadUrl } = params;

    if (!PROFILE_SERVICE_SECRET) {
      return {
        success: false,
        error: "Profile service secret is not configured on the server.",
      };
    }

    const payloadObj = { objectKey, fileName, downloadUrl };
    const payloadJson = JSON.stringify(payloadObj);
    const headers = generateProfileRequestHeaders(userId, payloadJson);

    const response = await fetch(`${PROFILE_SERVICE_URL}/profile/resume-from-r2`, {
      method: "POST",
      headers,
      body: payloadJson,
      // 45-second timeout for large PDF parsing / model extraction
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[ProfileService] Extraction failed with HTTP ${response.status}:`,
        errorText
      );
      return {
        success: false,
        error: `Cloud Run service responded with status ${response.status}: ${errorText || response.statusText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      accepted: data.accepted,
      reasonCode: data.reasonCode,
      validatorVersion: data.validatorVersion,
      fileSha256: data.fileSha256,
      resumeDocument: data.resumeDocument,
      markdown: data.markdown,
      message: data.message,
      detail: data.detail,
      preferences: data.preferences,
      resume_details: data.resume_details,
      compiler_payload: data.compiler_payload ?? data.resume_details?.compiler_payload,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to communicate with profile service.";
    console.error("[ProfileService] Unexpected extraction error:", error);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Fetches the user profile directly from the Cloud Run profile service using legacy GET.
 */
export async function getProfileFromCloudService(userId: string) {
  if (!PROFILE_SERVICE_SECRET) {
    throw new Error("JOB_HUNT_SERVICE_SECRET is not configured.");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${userId}:${timestamp}`;
  const signature = crypto.createHmac("sha256", PROFILE_SERVICE_SECRET).update(message).digest("hex");

  const response = await fetch(`${PROFILE_SERVICE_URL}/profile`, {
    method: "GET",
    headers: {
      "x-user-id": userId,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Profile fetch failed: ${response.status}`);
  }

  return response.json();
}
