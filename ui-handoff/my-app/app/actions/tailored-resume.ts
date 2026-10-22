"use server";

import { db } from "@/lib/db";
import { jobs, userJobPreferences, userJobResumes, resumeGenerationRequests, resumeGenerations } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/server";
import { getCredits } from "@/app/actions/credits";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getActiveBaseResume } from "@/lib/active-resume";
import { admissionError } from "@/lib/resume-admission";
import { activeResumeId } from "@/lib/active-resume";
import { getTemplateById } from "@/data/resume-templates";
import crypto from "crypto";
import { resumeContentError } from "@/lib/resume-validation";
import { resumeDigest, resumeReviewError } from "@/lib/resume-review";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  status: "queued" | "running" | "succeeded" | "needs_review" | "failed";
  markdown?: string;
  reviewReason?: string;
  hasDraft?: boolean;
  creditState?: string;
  error?: string;
  stageMessage?: string;
}

export interface ResumeRequestItem {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  location?: string;
  status: "queued" | "running" | "completed" | "needs_review" | "failed";
  creditState: string;
  createdAt: string;
  finishedAt?: string | null;
  errorCode?: string | null;
  hasDraft: boolean;
  markdown?: string | null;
  reviewReason?: string | null;
}

export interface ListResumeRequestsResult {
  success: boolean;
  requests: ResumeRequestItem[];
  activeCount: number;
  error?: string;
}

/**
 * Returns the base URL for Jobnex tailoring endpoints.
 * Defaults to the live Cloud Run deployment origin per project_docs/new_endpoints.md.
 */
function getJobHuntWebUrl(): string {
  return process.env.JOB_HUNT_WEB_URL || "https://layout-v1---job-hunt-web-znsph25yja-ue.a.run.app";
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
    if (!jobId || !UUID_REGEX.test(jobId)) return { exists: false };
    const user = await getCurrentUser();
    if (!user || !user.id || !UUID_REGEX.test(user.id)) return { exists: false };

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

    // Fallback: Check durable generations table
    const [gen] = await db
      .select({
        id: resumeGenerations.id,
        markdown: resumeGenerations.resumeMarkdown,
        status: resumeGenerationRequests.status,
        createdAt: resumeGenerations.createdAt,
      })
      .from(resumeGenerations)
      .innerJoin(resumeGenerationRequests, eq(resumeGenerations.id, resumeGenerationRequests.id))
      .where(and(eq(resumeGenerationRequests.userId, user.id), eq(resumeGenerationRequests.jobId, jobId)))
      .orderBy(sql`${resumeGenerations.createdAt} DESC`)
      .limit(1);

    if (gen && gen.markdown) {
      return {
        exists: true,
        resume: {
          id: gen.id,
          markdown: gen.markdown,
          templateId: "modern-ivy",
          theme: 3,
          status: gen.status === "needs_review" ? "draft" : "ready",
          updatedAt: gen.createdAt.toISOString(),
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
    if (!jobId || !UUID_REGEX.test(jobId)) {
      return { success: false, hasProfile: false, error: "Invalid job identifier." };
    }
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, hasProfile: false, error: "Please sign in to tailor your resume." };
    }

    // 1. Fetch active resume from user_pref_resumes joined to preferences
    const effectiveResumeId = await activeResumeId(user.id);

    if (!effectiveResumeId) {
      return {
        success: true,
        hasProfile: false,
        error: "Please upload and select your active resume in Manage Job Hunt first.",
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
export async function initiateTailoringRequest(jobId: string, templateId?: string): Promise<TailoringInitiateResult> {
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

    // 2. Fetch active candidate resume strictly verified to authenticated user
    const effectiveResumeId = await activeResumeId(user.id);

    if (!effectiveResumeId) {
      return { success: false, error: "Active base resume not found. Please upload or activate a resume first in Manage Job Hunt." };
    }

    const activeBase = await getActiveBaseResume(user.id);
    const blocked = activeBase ? admissionError(activeBase.content || "", (activeBase.parsedData || {}) as Record<string,unknown>) : "Upload a supported resume first.";
    if (blocked) return {success:false,error:blocked};

    // 3. Resolve the confirmed template to lock for this specific job application
    const [prefRow] = await db
      .select({ preferences: userJobPreferences.preferences })
      .from(userJobPreferences)
      .where(eq(userJobPreferences.userId, user.id))
      .limit(1);

    const prefs = (prefRow?.preferences as Record<string, unknown>) || {};
    const lastConfirmed = (prefs.lastConfirmedPreferences as Record<string, unknown>) || {};

    // Prioritize candidate's confirmed template from Manage Job Hunt
    const chosenTemplateId =
      (typeof lastConfirmed.selectedTemplateId === "string" && lastConfirmed.selectedTemplateId.trim())
        ? lastConfirmed.selectedTemplateId.trim()
        : (typeof prefs.selectedTemplateId === "string" && prefs.selectedTemplateId.trim())
        ? prefs.selectedTemplateId.trim()
        : (templateId?.trim() || "mit-capd");

    const templateObj = getTemplateById(chosenTemplateId);
    const lockedTemplateId = templateObj.id;
    const lockedTheme = templateObj.themeId;

    // 4. Dispatch to Jobnex Tailoring API (Service 2)
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

    // 5. CRITICAL: Immediately snapshot & lock the chosen template in user_job_resumes
    // in Neon DB. We use status: 'draft' to strictly adhere to the database CHECK constraint
    // (status IN ('draft', 'ready')). This permanently decouples this job's styling forever.
    try {
      const now = new Date();
      await db
        .insert(userJobResumes)
        .values({
          userId: user.id,
          jobId,
          markdown: "",
          templateId: lockedTemplateId,
          theme: lockedTheme,
          status: "draft",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userJobResumes.userId, userJobResumes.jobId],
          set: {
            templateId: lockedTemplateId,
            theme: lockedTheme,
            status: "draft",
            updatedAt: now,
          },
        });
    } catch (lockErr) {
      console.warn("[initiateTailoringRequest] Warning: Could not pre-lock template in userJobResumes:", lockErr);
    }

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

    if (rawStatus === "completed" || rawStatus === "succeeded" || rawStatus === "needs_review") {
      // Step 8: Fetch generated Markdown as JSON
      let markdown = "";
      let reviewReason: string | undefined = undefined;

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
          reviewReason =
            genJson.generation?.review_reason ||
            genJson.review_reason ||
            request.review_reason ||
            undefined;
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
            if (textRes.headers.get("x-resume-review-required") === "true") {
              reviewReason = reviewReason || "Compliance review required";
            }
          }
        } catch (textErr) {
          console.error("Text fetch of generated markdown failed:", textErr);
        }
      }

      if (markdown) {
        // Polling a completed request must not overwrite subsequent manual edits.
        const isReview = rawStatus === "needs_review";
        return {
          success: true,
          status: isReview ? "needs_review" : "succeeded",
          markdown,
          reviewReason,
          hasDraft: true,
          creditState: request.credit_state || "consumed",
          stageMessage: isReview
            ? "Tailored resume ready with review notes."
            : "Tailoring complete! Loading customized resume...",
        };
      }

      if (rawStatus === "needs_review") {
        return {
          success: false,
          status: "failed",
          error: "Review outcome returned without a usable resume draft.",
          creditState: request.credit_state || "released",
        };
      }

      return {
        success: false,
        status: "failed",
        error: "Generation completed but Markdown content was not returned by the service.",
        creditState: request.credit_state,
      };
    }

    return {
      success: true,
      status: "running",
      creditState: request.credit_state || "held",
      stageMessage: "Processing...",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error checking request status";
    console.error("Error in getResumeRequestStatus:", error);
    return { success: false, status: "failed", error: message };
  }
}

/**
 * Lists the authenticated user's recent resume tailoring requests.
 * Directly queries durable PostgreSQL records with authoritative status,
 * jobs metadata, and generated drafts. Orders active requests first.
 */
export async function listResumeRequests(): Promise<ListResumeRequestsResult> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, requests: [], activeCount: 0, error: "Unauthorized session." };
    }

    const rows = await db
      .select({
        id: resumeGenerationRequests.id,
        jobId: resumeGenerationRequests.jobId,
        jobTitle: jobs.jobRoleTitle,
        companyName: jobs.companyName,
        location: jobs.location,
        status: resumeGenerationRequests.status,
        creditState: resumeGenerationRequests.creditState,
        errorCode: resumeGenerationRequests.errorCode,
        createdAt: resumeGenerationRequests.createdAt,
        finishedAt: resumeGenerationRequests.finishedAt,
        genMarkdown: resumeGenerations.resumeMarkdown,
        genAudit: resumeGenerations.auditJson,
      })
      .from(resumeGenerationRequests)
      .innerJoin(jobs, eq(resumeGenerationRequests.jobId, jobs.id))
      .leftJoin(resumeGenerations, eq(resumeGenerationRequests.id, resumeGenerations.id))
      .where(eq(resumeGenerationRequests.userId, user.id))
      .orderBy(
        sql`CASE WHEN ${resumeGenerationRequests.status} IN ('queued', 'running') THEN 0 ELSE 1 END ASC`,
        sql`${resumeGenerationRequests.createdAt} DESC`
      )
      .limit(20);

    const requests: ResumeRequestItem[] = rows.map((r) => {
      const audit = (r.genAudit as Record<string, unknown>) || {};
      let reviewReason =
        (audit.error as string) ||
        (audit.review_reason as string) ||
        (audit.reason as string) ||
        (audit.summary as string) ||
        (Array.isArray(audit.issues) ? (audit.issues as string[]).join("; ") : null);

      if (r.status === "needs_review" && !reviewReason) {
        reviewReason = "Length or entity verification suggested. Review bullet points before export.";
      }

      const hasDraft = Boolean(r.genMarkdown);

      return {
        id: r.id,
        jobId: r.jobId,
        jobTitle: r.jobTitle,
        companyName: r.companyName,
        location: r.location || undefined,
        status: r.status as ResumeRequestItem["status"],
        creditState: r.creditState,
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
        errorCode: r.errorCode,
        hasDraft,
        markdown: r.genMarkdown || null,
        reviewReason,
      };
    });

    const activeCount = requests.filter((r) => r.status === "queued" || r.status === "running").length;

    return {
      success: true,
      requests,
      activeCount,
    };
  } catch (error) {
    console.error("Error listing resume requests:", error);
    return {
      success: false,
      requests: [],
      activeCount: 0,
      error: error instanceof Error ? error.message : "Failed to list requests",
    };
  }
}

/**
 * Direct tailored resume action.
 * Returns acceptance and durable request ID immediately.
 */
export async function tailorResumeForJob(jobId: string, templateId?: string) {
  return await initiateTailoringRequest(jobId, templateId);
}

/**
 * Saves manual user edits to an existing tailored resume Markdown and/or template in Neon DB.
 * Protects against race conditions by checking expectedGenerationId against the latest active generation.
 */
export async function updateTailoredResumeMarkdown(
  jobId: string,
  markdown: string,
  templateId?: string,
  expectedGenerationId?: string | null
): Promise<{ success: boolean; error?: string; code?: string }> {
  try {
    if (!UUID_REGEX.test(jobId)) return { success: false, error: "Invalid job identifier." };
    const contentError = resumeContentError(markdown);
    if (contentError) return { success: false, error: contentError, code: "INVALID_RESUME" };
    const user = await getCurrentUser();
    if (!user?.id || !UUID_REGEX.test(user.id)) return { success: false, error: "Unauthorized" };
    return await db.transaction(async tx => {
      const [generation] = await tx.select().from(resumeGenerations)
        .where(and(eq(resumeGenerations.userId, user.id), eq(resumeGenerations.jobId, jobId)))
        .orderBy(sql`${resumeGenerations.createdAt} DESC`).limit(1);
      if (!generation || generation.id !== expectedGenerationId) return { success: false, code: "STALE_GENERATION", error: "Reload the latest resume before saving." };
      if (!["completed", "completed_with_estimates", "needs_review"].includes(generation.status)) return { success: false, error: "Generation is not usable." };
      const [existing] = await tx.select().from(userJobResumes)
        .where(and(eq(userJobResumes.userId, user.id), eq(userJobResumes.jobId, jobId))).limit(1);
      const template = getTemplateById(templateId || existing?.templateId || "mit-capd");
      const changed = existing?.markdown !== markdown || existing?.templateId !== template.id;
      const status = resumeReviewError(generation, generation.id, markdown) ? "draft" : "ready";
      const values = { markdown, templateId: template.id, theme: template.themeId, status,
        updatedAt: new Date(), ...(changed ? { r2ObjectKey: null, fileSize: null, exportedAt: null } : {}) };
      await tx.insert(userJobResumes).values({ userId: user.id, jobId, ...values })
        .onConflictDoUpdate({ target: [userJobResumes.userId, userJobResumes.jobId], set: values });
      await tx.update(resumeGenerations).set({ auditJson: {
        ...(generation.auditJson as Record<string, unknown>),
        manual_edit: { edited_at: new Date().toISOString(), template_id: template.id, markdown_length: markdown.length },
      } }).where(eq(resumeGenerations.id, generation.id));
      // Saving edits never certifies that generation review failures were resolved.
      return { success: true };
    }, { isolationLevel: "serializable" });
  } catch {
    return { success: false, error: "Could not save this version. Reload and retry." };
  }
}

/**
 * Finalizes and approves a draft or "needs_review" tailored resume directly,
 * transitioning it to "ready" / "completed" without requiring markdown edits.
 */
export async function markTailoredResumeReady(
  jobId: string,
  expectedGenerationId?: string | null
): Promise<{ success: boolean; error?: string; code?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user?.id || !UUID_REGEX.test(jobId)) return { success: false, error: "Unauthorized or invalid job." };
    const result = await db.transaction(async tx => {
      const [generation] = await tx.select().from(resumeGenerations)
        .where(and(eq(resumeGenerations.userId, user.id), eq(resumeGenerations.jobId, jobId)))
        .orderBy(sql`${resumeGenerations.createdAt} DESC`).limit(1);
      if (!generation || generation.id !== expectedGenerationId) return { success: false, code: "STALE_GENERATION", error: "Reload the latest resume before approving." };
      if (!["completed", "completed_with_estimates", "needs_review"].includes(generation.status)) return { success: false, error: "Generation is not usable." };
      const [saved] = await tx.select().from(userJobResumes)
        .where(and(eq(userJobResumes.userId, user.id), eq(userJobResumes.jobId, jobId))).limit(1);
      const contentError = resumeContentError(saved?.markdown);
      if (contentError || !saved) return { success: false, error: contentError || "Save the resume before approving." };
      await tx.update(resumeGenerations).set({ auditJson: {
        ...(generation.auditJson as Record<string, unknown>),
        human_review: { generation_id: generation.id, markdown_sha256: resumeDigest(saved.markdown), reviewed_at: new Date().toISOString() },
      } }).where(eq(resumeGenerations.id, generation.id));
      await tx.update(userJobResumes).set({ status: "ready", updatedAt: new Date() }).where(eq(userJobResumes.id, saved.id));
      // Keep the original needs_review status and audit; approval is a separate recorded decision.
      return { success: true };
    }, { isolationLevel: "serializable" });
    revalidatePath("/job-hunt/applications");
    return result;
  } catch {
    return { success: false, error: "Could not approve this version. Reload and retry." };
  }
}
