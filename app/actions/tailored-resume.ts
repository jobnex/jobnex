"use server";

import { db, pool } from "@/lib/db";
import { jobs, userJobPreferences, userJobResumes, userPrefResumes, resumeGenerationRequests, resumeGenerations } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/server";
import { getCredits } from "@/app/actions/credits";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { activeResumeId } from "@/lib/active-resume";
import { getTemplateById, getThemeForTemplate } from "@/data/resume-templates";
import crypto from "crypto";
import { RESUME_TEMPLATES } from "@/data/resume-templates";
import { resumeFailureReason } from "@/lib/resume-failure";

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
    templateId?: string | null;
    status?: string;
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
  templateId?: string;
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

    const generated = await pool.query(`SELECT g.id,COALESCE(NULLIF(g.audit_json#>>'{manual_edit,markdown}',''),g.resume_markdown) AS resume_markdown,
      g.status,g.created_at,g.audit_json#>>'{manual_edit,templateId}' AS saved_template_id,
      g.audit_json#>>'{manual_edit,savedAt}' AS saved_at
      FROM resume_generations g JOIN resume_generation_requests r ON r.id=g.id AND r.user_id=g.user_id
      WHERE g.user_id=$1 AND g.job_id=$2 AND g.job_id=r.job_id AND g.base_resume_id=r.base_resume_id
        AND ((r.status='completed' AND r.credit_state='consumed' AND g.status IN ('completed','completed_with_estimates'))
          OR (r.status='needs_review' AND r.credit_state IN ('consumed','released') AND g.status='needs_review'))
        AND length(trim(g.resume_markdown))>0 AND public.resume_generation_is_publishable(g.id,g.user_id) ORDER BY r.created_at DESC LIMIT 1`, [user.id, jobId]);
    if (generated.rows[0]) {
      const draft = generated.rows[0];
      return { exists: true, resume: { id: draft.id, markdown: draft.resume_markdown, status: draft.status,
        templateId: draft.saved_template_id || "modern-ivy", theme: RESUME_TEMPLATES.find(t => t.id === draft.saved_template_id)?.themeId || 3, updatedAt: draft.saved_at || draft.created_at.toISOString() } };
    }

    const [existing] = await db
      .select()
      .from(userJobResumes)
      .where(and(eq(userJobResumes.userId, user.id), eq(userJobResumes.jobId, jobId)))
      .limit(1);

    if (existing && existing.markdown && (await pool.query('SELECT public.resume_saved_markdown_is_publishable($1,$2,$3) AS allowed', [user.id,jobId,existing.markdown])).rows[0]?.allowed) {
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

    const latest = await pool.query(`SELECT r.status,r.credit_state,g.audit_json->>'error' AS failure_detail
      FROM resume_generation_requests r LEFT JOIN resume_generations g ON g.id=r.id AND g.user_id=r.user_id
      WHERE r.user_id=$1 AND r.job_id=$2 ORDER BY r.created_at DESC LIMIT 1`, [user.id,jobId]);
    if (latest.rows[0]?.status === "failed") return { exists: false,
      error: resumeFailureReason(latest.rows[0].failure_detail) + (latest.rows[0].credit_state === "released" ? " Your credit was refunded." : "") };
    return { exists: false };
  } catch (error) {
    console.error("Error checking existing tailored resume:", error);
    return { exists: false, error: "Could not load the saved draft. Please retry." };
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
      const failure = await pool.query(`SELECT audit_json->>'error' AS detail FROM resume_generations WHERE id=$1 AND user_id=$2`, [requestId,user.id]);
      return {
        success: false,
        status: "failed",
        error: resumeFailureReason(failure.rows[0]?.detail || request.error_code),
        creditState: request.credit_state,
      };
    }

    if (["completed", "succeeded", "needs_review"].includes(rawStatus)) {
      const saved = await pool.query(`SELECT COALESCE(NULLIF(g.audit_json#>>'{manual_edit,markdown}',''),g.resume_markdown) AS markdown,
        g.audit_json#>>'{manual_edit,templateId}' AS template_id
        FROM resume_generations g JOIN resume_generation_requests r ON r.id=g.id AND r.user_id=g.user_id AND r.job_id=g.job_id
        WHERE g.id=$1 AND g.user_id=$2 AND length(trim(g.resume_markdown))>0 AND public.resume_generation_is_publishable(g.id,g.user_id) AND
        ((r.status='completed' AND r.credit_state='consumed' AND g.status IN ('completed','completed_with_estimates'))
        OR (r.status='needs_review' AND g.status='needs_review' AND r.credit_state IN ('consumed','released')))`, [requestId,user.id]);
      if (saved.rows[0]?.markdown) return {
        success: true, status: rawStatus === "needs_review" ? "needs_review" : "succeeded",
        creditState: request.credit_state, markdown: saved.rows[0].markdown,
        templateId: saved.rows[0].template_id || undefined,
        reviewReason: rawStatus === "needs_review" ? request.error_code || "Review this draft against your source resume before using it." : undefined,
        stageMessage: "Saved draft loaded.",
      };
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
        return {
          success: true,
          status: rawStatus === "needs_review" ? "needs_review" : "succeeded",
          creditState: request.credit_state,
          reviewReason: rawStatus === "needs_review" ? request.error_code || "Review this draft against your source resume before using it." : undefined,
          markdown,
          stageMessage: "Tailoring complete! Loading customized resume...",
        };
      }

      return {
        success: false,
        status: "failed",
        error: rawStatus === "needs_review" ? "Review required, but no saved draft is available. Check the credit status in Resume generations." : "Generated Markdown could not be loaded. Retry opening the saved draft.",
        creditState: request.credit_state,
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
        genMarkdown: sql<string | null>`CASE WHEN public.resume_generation_is_publishable(${resumeGenerations.id}, ${resumeGenerations.userId})
          THEN COALESCE(NULLIF(${resumeGenerations.auditJson}#>>'{manual_edit,markdown}', ''), ${resumeGenerations.resumeMarkdown}) END`,
        genAudit: resumeGenerations.auditJson,
      })
      .from(resumeGenerationRequests)
      .innerJoin(jobs, eq(resumeGenerationRequests.jobId, jobs.id))
      .leftJoin(resumeGenerations, and(eq(resumeGenerationRequests.id, resumeGenerations.id), eq(resumeGenerations.userId, user.id), eq(resumeGenerations.jobId, resumeGenerationRequests.jobId)))
      .where(eq(resumeGenerationRequests.userId, user.id))
      .orderBy(
        sql`CASE WHEN ${resumeGenerationRequests.status} IN ('queued', 'running') THEN 0 ELSE 1 END ASC`,
        sql`${resumeGenerationRequests.createdAt} DESC`
      )
      .limit(20);

    const requests: ResumeRequestItem[] = rows.map((r) => {
      const audit = (r.genAudit as Record<string, unknown>) || {};
      let reviewReason =
        (audit.review_reason as string) ||
        (audit.reason as string) ||
        (audit.summary as string) ||
        (Array.isArray(audit.issues) ? (audit.issues as string[]).join("; ") : null);

      if (r.status === "needs_review" && !reviewReason) {
        reviewReason = "Length or entity verification suggested. Review bullet points before export.";
      }

      const hasDraft = ["completed", "needs_review"].includes(r.status) && Boolean(r.genMarkdown?.trim());

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
        markdown: hasDraft ? r.genMarkdown : null,
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
export async function updateTailoredResumeMarkdown(jobId: string, markdown: string, templateId?: string, expectedGenerationId?: string | null) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !markdown.trim() || markdown.length > 200_000)
    return { success: false, error: "A nonempty resume and valid job are required." };
  const template = RESUME_TEMPLATES.find(item => item.id === (templateId || "modern-ivy"));
  if (!template) return { success: false, error: "Unsupported template." };
  const allowed = await pool.query('SELECT public.resume_saved_markdown_is_publishable($1,$2,$3) AS allowed', [user.id,jobId,markdown.trim()]);
  if (!allowed.rows[0]?.allowed) return { success: false, error: "Resume failed source verification; regenerate before saving." };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [user.id + ":" + jobId]);
    const generation = await client.query(`SELECT g.id,g.status FROM resume_generations g
      JOIN resume_generation_requests r ON r.id=g.id AND r.user_id=g.user_id
      WHERE g.user_id=$1 AND g.job_id=$2 AND g.job_id=r.job_id AND g.base_resume_id=r.base_resume_id
        AND ((r.status='completed' AND r.credit_state='consumed' AND g.status IN ('completed','completed_with_estimates'))
          OR (r.status='needs_review' AND r.credit_state IN ('consumed','released') AND g.status='needs_review'))
        AND length(trim(g.resume_markdown))>0 AND public.resume_generation_is_publishable(g.id,g.user_id)
      ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE OF g`, [user.id, jobId]);
    const existing = await client.query('SELECT id FROM user_job_resumes WHERE user_id=$1 AND job_id=$2', [user.id,jobId]);
    if (!generation.rows[0] && !existing.rowCount) throw new Error("Saved resume not found.");
    if (expectedGenerationId && (generation.rows[0]?.id || existing.rows[0]?.id) !== expectedGenerationId)
      throw new Error("A newer resume is available. Close this editor and reopen the latest draft before saving.");
    if (generation.rows[0]) {
      const edited = { markdown: markdown.trim(), templateId: template.id, savedAt: new Date().toISOString() };
      await client.query(`UPDATE resume_generations SET audit_json=COALESCE(audit_json,'{}'::jsonb)
        || jsonb_build_object('manual_edit',$3::jsonb) WHERE id=$1 AND user_id=$2`,
        [generation.rows[0].id, user.id, JSON.stringify(edited)]);
    }
    await client.query(`INSERT INTO user_job_resumes(user_id,job_id,markdown,template_id,theme,status)
      VALUES($1,$2,$3,$4,$5,'draft') ON CONFLICT(user_id,job_id) DO UPDATE SET
      markdown=EXCLUDED.markdown,template_id=EXCLUDED.template_id,theme=EXCLUDED.theme,
      status='draft',exported_at=NULL,updated_at=now()`, [user.id,jobId,markdown.trim(),template.id,template.themeId]);
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to save edits.";
    return { success: false, error: message, code: message.startsWith("A newer resume") ? "STALE_GENERATION" : undefined };
  } finally { client.release(); }
}
