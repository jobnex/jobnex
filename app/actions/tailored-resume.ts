"use server";

import { db } from "@/lib/db";
import { jobs, userJobPreferences, userJobResumes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/server";
import { getCredits } from "@/app/actions/credits";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import crypto from "crypto";
import { activeResumeId } from "@/lib/active-resume";

export interface TailoringPreviewResult {
  success: boolean;
  hasProfile: boolean;
  skillGapAvailable?: boolean;
  skillGapError?: string;
  error?: string;
  matchScore?: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  creditBalance?: number;
  resumeId?: string | null;
  job?: {
    id: string;
    title: string;
    company: string;
    location: string;
  };
  existingResume?: {
    id: string;
    markdown: string;
    updatedAt: string;
  };
}

export interface TailoringInitiateResult {
  success: boolean;
  requestId?: string;
  status?: string;
  error?: string;
}

export interface TailoringStatusResult {
  success: boolean;
  status: "queued" | "running" | "succeeded" | "failed";
  markdown?: string;
  error?: string;
  stageMessage?: string;
}

/**
 * Returns the base URL for Jobnex tailoring endpoints.
 * Defaults to the live Cloud Run deployment origin per project_docs/new_endpoints.md.
 */
function getJobHuntWebUrl(): string {
  return process.env.JOB_HUNT_WEB_URL || "https://job-hunt-web-znsph25yja-ue.a.run.app";
}

/**
 * Forwards the candidate's verified Neon Auth session cookie from the current Next.js request.
 * Server-side route handlers on Jobnex authenticate callers via getCurrentUser() using this session.
 */
async function getForwardHeaders(customHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  try {
    const cookieStore = await cookies();
    const cookieString =
      cookieStore.toString() ||
      cookieStore
        .getAll()
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");

    return {
      ...(cookieString ? { Cookie: cookieString } : {}),
      ...customHeaders,
    };
  } catch (error) {
    console.warn("Could not read cookies from next/headers context:", error);
    return { ...customHeaders };
  }
}

/**
 * Checks if a tailored resume already exists for this candidate and job in Neon DB.
 */
export async function getExistingTailoredResume(jobId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { exists: false };

    const [existing] = await db
      .select()
      .from(userJobResumes)
      .where(and(eq(userJobResumes.userId, user.id), eq(userJobResumes.jobId, jobId)))
      .limit(1);

    if (existing && existing.markdown) {
      return {
        exists: true,
        resume: {
          id: existing.id,
          markdown: existing.markdown,
          templateId: existing.templateId,
          theme: existing.theme,
          status: existing.status,
          updatedAt: existing.updatedAt.toISOString(),
        },
      };
    }

    return { exists: false };
  } catch (error) {
    console.error("Error checking existing tailored resume:", error);
    return { exists: false };
  }
}

/**
 * Pre-flight deterministic skill-gap and match analysis before reserving a credit.
 * Step 4 from project_docs/new_endpoints.md:
 * GET /api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}
 *
 * Non-blocking: Even if this skill-gap service fails, returns 4xx/5xx, or times out,
 * Service 2 (the tailoring engine) remains fully available to request.
 */
export async function getTailoringPreview(jobId: string): Promise<TailoringPreviewResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, hasProfile: false, error: "Please sign in to tailor your resume." };
    }

    // Also check preferences fallback if active resume record is pending
    const [preferences] = await db
      .select()
      .from(userJobPreferences)
      .where(eq(userJobPreferences.userId, user.id))
      .limit(1);

    const effectiveResumeId = await activeResumeId(user.id);
    const hasResumeUploaded =
      Boolean(effectiveResumeId) ||
      Boolean(preferences?.resumeDetails && Object.keys(preferences.resumeDetails).length > 0) ||
      Boolean((preferences?.preferences as Record<string, unknown>)?.resumeUploaded);

    if (!hasResumeUploaded && !effectiveResumeId) {
      return {
        success: true,
        hasProfile: false,
        error: "Please upload your base resume in Manage Job Hunt first.",
      };
    }

    // 2. Fetch authoritative job details from Neon
    const [job] = await db
      .select({
        id: jobs.id,
        title: jobs.jobRoleTitle,
        company: jobs.companyName,
        location: jobs.location,
        description: jobs.jobDescription,
        requirements: jobs.requirements,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      return { success: false, hasProfile: true, error: "Job opportunity not found." };
    }

    // 3. Concurrently check for existing tailored resume and fetch wallet balance
    const [existing, wallet] = await Promise.all([
      getExistingTailoredResume(jobId).catch(() => ({ exists: false, resume: undefined })),
      getCredits().catch(() => ({ balance: 0, reserved: 0 })),
    ]);

    const baseResult: TailoringPreviewResult = {
      success: true,
      hasProfile: true,
      creditBalance: wallet.balance ?? 0,
      resumeId: effectiveResumeId,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
      },
      existingResume: existing.exists ? existing.resume : undefined,
    };

    if (!effectiveResumeId) {
      return {
        ...baseResult,
        skillGapAvailable: false,
        skillGapError: "Active resume record pending. Direct tailoring is ready.",
      };
    }

    // 4. Query Jobnex /api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId} (Service 1)
    // Non-blocking: If skill-gap check fails or times out, the candidate can still tailor directly.
    try {
      const baseUrl = getJobHuntWebUrl();
      const headers = await getForwardHeaders({ Accept: "application/json" });
      const previewUrl = `${baseUrl}/api/resume/tailor/resumes/${effectiveResumeId}/preview?jobId=${encodeURIComponent(jobId)}`;

      const previewRes = await fetch(previewUrl, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });

      if (!previewRes.ok) {
        const errData = await previewRes.json().catch(() => ({}));
        const errorMsg =
          errData.error ||
          errData.detail ||
          errData.message ||
          `Skill-gap service returned HTTP ${previewRes.status}`;

        console.warn("Skill-gap service unavailable (non-blocking fallback active):", errorMsg);
        return {
          ...baseResult,
          skillGapAvailable: false,
          skillGapError: errorMsg,
        };
      }

      const previewJson = await previewRes.json();
      const previewObj = previewJson.preview || previewJson;

      const matchedSkills: string[] = Array.isArray(previewObj.matched)
        ? previewObj.matched
        : Array.isArray(previewObj.matched_skills)
        ? previewObj.matched_skills
        : Array.isArray(previewObj.matchedSkills)
        ? previewObj.matchedSkills
        : [];

      const missingSkills: string[] = Array.isArray(previewObj.missing)
        ? previewObj.missing
        : Array.isArray(previewObj.missing_job_skills)
        ? previewObj.missing_job_skills
        : Array.isArray(previewObj.missingSkills)
        ? previewObj.missingSkills
        : [];

      const totalSkills = matchedSkills.length + missingSkills.length;
      const matchScore =
        totalSkills > 0
          ? Math.round((matchedSkills.length / totalSkills) * 100)
          : typeof previewObj.match_score === "number"
          ? previewObj.match_score
          : typeof previewObj.matchScore === "number"
          ? previewObj.matchScore
          : 75;

      return {
        ...baseResult,
        skillGapAvailable: true,
        matchScore,
        matchedSkills,
        missingSkills,
      };
    } catch (previewErr: unknown) {
      const errorMsg = previewErr instanceof Error ? previewErr.message : "Skill-gap service request failed";
      console.warn("Skill-gap service fetch exception (non-blocking fallback active):", errorMsg);
      return {
        ...baseResult,
        skillGapAvailable: false,
        skillGapError: errorMsg,
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to calculate tailoring preview";
    console.error("Critical error in getTailoringPreview:", error);
    return { success: false, hasProfile: true, error: message };
  }
}

/**
 * Initiates the asynchronous resume tailoring request on Jobnex.
 * Step 5 from project_docs/new_endpoints.md:
 * POST /api/resume/tailor/requests
 * Body: { jobId, resumeId, idempotencyKey } (strict camelCase)
 */
export async function initiateTailoringRequest(jobId: string): Promise<TailoringInitiateResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Please sign in to tailor your resume." };
    }

    // 1. Verify credit balance
    const wallet = await getCredits();
    if (wallet.balance < 1) {
      return { success: false, error: "Insufficient credits. Please add credits to your wallet." };
    }

    // 2. Fetch active candidate resume (with preferences fallback)
    const effectiveResumeId = await activeResumeId(user.id);

    if (!effectiveResumeId) {
      return { success: false, error: "Active base resume not found. Please upload a resume first in Manage Job Hunt." };
    }

    // 3. Dispatch to Jobnex Tailoring API (Service 2)
    const baseUrl = getJobHuntWebUrl();
    const headers = await getForwardHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    const idempotencyKey = crypto.randomUUID();

    const response = await fetch(`${baseUrl}/api/resume/tailor/requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jobId,
        resumeId: effectiveResumeId,
        idempotencyKey,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      let errorMsg =
        errData.error ||
        errData.detail ||
        errData.message ||
        `Tailoring service request failed with HTTP ${response.status}`;

      if (response.status === 409 && typeof errorMsg === "string" && errorMsg.toLowerCase().includes("worker")) {
        errorMsg =
          "The AI tailoring worker is currently busy or offline. No credits have been deducted. Please try again shortly.";
      }
      return { success: false, error: errorMsg };
    }

    const data = await response.json();
    const request = data.request || data;
    const requestId = request.id || request.requestId;

    return {
      success: true,
      requestId,
      status: request.status || "queued",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to initiate tailoring request";
    console.error("Error in initiateTailoringRequest:", error);
    return { success: false, error: message };
  }
}

/**
 * Polls the Jobnex tailoring request status and retrieves the generated Markdown once completed.
 * Steps 6, 7 & 8 from project_docs/new_endpoints.md:
 * - GET /api/resume/tailor/requests/{requestId}
 * - GET /api/resume/tailor/generated/{requestId}?format=json
 * - GET /api/resume/tailor/generated/{requestId}
 */
export async function getResumeRequestStatus(requestId: string): Promise<TailoringStatusResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, status: "failed", error: "Unauthorized session." };
    }

    const baseUrl = getJobHuntWebUrl();
    const headers = await getForwardHeaders({ Accept: "application/json" });

    // Step 6: Poll request status
    const statusRes = await fetch(`${baseUrl}/api/resume/tailor/requests/${requestId}`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!statusRes.ok) {
      const errData = await statusRes.json().catch(() => ({}));
      return {
        success: false,
        status: "failed",
        error: errData.error || errData.detail || errData.message || `Failed to read request status (${statusRes.status})`,
      };
    }

    const data = await statusRes.json();
    const request = data.request || data;
    const rawStatus = (request.status || "").toLowerCase();

    if (rawStatus === "queued") {
      return {
        success: true,
        status: "queued",
        stageMessage: "Request queued in AI tailoring pipeline...",
      };
    }

    if (rawStatus === "running") {
      return {
        success: true,
        status: "running",
        stageMessage: "Aligning technical skills and tailoring experience bullets with job description...",
      };
    }

    if (rawStatus === "failed") {
      return {
        success: false,
        status: "failed",
        error: request.error || request.error_code || request.detail || "Tailoring failed in worker pipeline.",
      };
    }

    if (rawStatus === "completed" || rawStatus === "succeeded") {
      // Step 8: Fetch generated Markdown as JSON
      let markdown = "";

      try {
        const jsonRes = await fetch(`${baseUrl}/api/resume/tailor/generated/${requestId}?format=json`, {
          method: "GET",
          headers,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });

        if (jsonRes.ok) {
          const genJson = await jsonRes.json();
          markdown =
            genJson.generation?.resume_markdown ||
            genJson.markdown_content ||
            genJson.markdown ||
            "";
        }
      } catch (jsonErr) {
        console.warn("JSON fetch of generated markdown failed, trying raw text attachment:", jsonErr);
      }

      // Step 7: Fallback to raw text Markdown attachment if format=json was empty
      if (!markdown) {
        try {
          const textRes = await fetch(`${baseUrl}/api/resume/tailor/generated/${requestId}`, {
            method: "GET",
            headers: await getForwardHeaders({ Accept: "text/markdown, text/plain, */*" }),
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          });

          if (textRes.ok) {
            markdown = await textRes.text();
          }
        } catch (textErr) {
          console.error("Text fetch of generated markdown failed:", textErr);
        }
      }

      if (markdown) {
        // Sync generated markdown to local userJobResumes in neondb for instant persistence
        const targetJobId = request.job_id || request.jobId;
        if (targetJobId) {
          try {
            const [existing] = await db
              .select({ id: userJobResumes.id })
              .from(userJobResumes)
              .where(and(eq(userJobResumes.userId, user.id), eq(userJobResumes.jobId, targetJobId)))
              .limit(1);

            if (existing) {
              await db
                .update(userJobResumes)
                .set({ markdown, updatedAt: new Date() })
                .where(eq(userJobResumes.id, existing.id));
            } else {
              await db.insert(userJobResumes).values({
                userId: user.id,
                jobId: targetJobId,
                markdown,
                templateId: "modern-ivy",
                theme: 3,
                status: "ready",
              });
            }
          } catch (syncErr) {
            console.warn("Local sync of userJobResumes skipped or failed:", syncErr);
          }
        }

        return {
          success: true,
          status: "succeeded",
          markdown,
          stageMessage: "Tailoring complete! Loading customized resume...",
        };
      }

      return {
        success: false,
        status: "failed",
        error: "Generation completed but Markdown content was not returned by the service.",
      };
    }

    return {
      success: true,
      status: "running",
      stageMessage: "Processing...",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error checking request status";
    console.error("Error in getResumeRequestStatus:", error);
    return { success: false, status: "failed", error: message };
  }
}

/**
 * Direct tailored resume action for backwards compatibility or synchronous execution.
 */
export async function tailorResumeForJob(jobId: string) {
  const initRes = await initiateTailoringRequest(jobId);
  if (!initRes.success || !initRes.requestId) {
    return { success: false, error: initRes.error || "Failed to initiate tailoring" };
  }

  // Poll for completion (up to 30 seconds with 2.5s cadence)
  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    await new Promise((r) => setTimeout(r, 2500));
    const statusRes = await getResumeRequestStatus(initRes.requestId);
    if (statusRes.status === "succeeded" && statusRes.markdown) {
      return { success: true, markdown: statusRes.markdown };
    }
    if (statusRes.status === "failed") {
      return { success: false, error: statusRes.error || "Tailoring failed on background worker" };
    }
  }

  return { success: false, error: "Tailoring request timed out. Please check back shortly." };
}

/**
 * Saves manual user edits to an existing tailored resume Markdown in Neon DB.
 */
export async function updateTailoredResumeMarkdown(jobId: string, markdown: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    await db
      .update(userJobResumes)
      .set({
        markdown,
        updatedAt: new Date(),
      })
      .where(and(eq(userJobResumes.userId, user.id), eq(userJobResumes.jobId, jobId)));

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save edits";
    console.error("Error updating tailored resume markdown:", error);
    return { success: false, error: message };
  }
}
