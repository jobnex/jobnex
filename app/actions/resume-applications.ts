"use server";

import { db } from "@/lib/db";
import {
  resumeGenerationRequests,
  resumeGenerations,
  applications,
  userJobResumes
} from "@/lib/db/schema/applications";
import { userJobPreferences } from "@/lib/db/schema/preferences";
import { jobs } from "@/lib/db/schema/jobs";
import { countries } from "@/lib/db/schema/countries";
import { getTemplateById } from "@/data/resume-templates";
import { getCurrentUser } from "@/lib/auth/server";
import { eq, and, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Job } from "@/types";
import { mapDbRowToJob } from "@/lib/job-utils";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResumeApplicationItem {
  id: string; // Request ID
  jobId: string;
  jobRoleTitle: string;
  companyName: string;
  location: string | null;
  externalApplyUrl: string | null;
  job: Job;
  requestedAt: string; // ISO date
  requestStatus: "queued" | "running" | "completed" | "needs_review" | "failed";
  creditState: string;
  errorCode: string | null;
  applicationStage: number; // -1: Not applied, 0: Applied, 1: Interview, 2: Offer
  applicationNotes: string | null;
  matchScore: number | null;
  hasDraft: boolean;
  markdown: string | null;
  reviewReason: string | null;
  templateId: string;
  theme: number;
}

export interface ListResumeApplicationsResult {
  success: boolean;
  applications: ResumeApplicationItem[];
  error?: string;
}

/**
 * Lists the authenticated candidate's active job applications.
 * Every job with an accepted resume tailoring request acts as an intake record.
 * Deduplicates by jobId, taking the latest request.
 */
export async function listResumeApplications(): Promise<ListResumeApplicationsResult> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, applications: [], error: "Unauthorized session." };
    }

    const rows = await db
      .select({
        requestId: resumeGenerationRequests.id,
        jobId: resumeGenerationRequests.jobId,
        jobRoleTitle: jobs.jobRoleTitle,
        companyName: jobs.companyName,
        location: jobs.location,
        externalApplyUrl: jobs.externalApplyUrl,
        employmentType: jobs.employmentType,
        workModel: jobs.workModel,
        salaryMin: jobs.salaryMin,
        salaryMax: jobs.salaryMax,
        currency: jobs.currency,
        jobDescription: jobs.jobDescription,
        experienceRequired: jobs.experienceRequired,
        visaSponsorship: jobs.visaSponsorship,
        jobSource: jobs.jobSource,
        jobCreatedAt: jobs.createdAt,
        jobPublishedAt: jobs.publishedAt,
        countryName: countries.name,
        requestStatus: resumeGenerationRequests.status,
        creditState: resumeGenerationRequests.creditState,
        errorCode: resumeGenerationRequests.errorCode,
        createdAt: resumeGenerationRequests.createdAt,
        finishedAt: resumeGenerationRequests.finishedAt,
        genMarkdown: sql<string | null>`CASE WHEN public.resume_generation_is_publishable(${resumeGenerations.id}, ${resumeGenerations.userId})
          THEN COALESCE(NULLIF(${resumeGenerations.auditJson}#>>'{manual_edit,markdown}', ''), ${resumeGenerations.resumeMarkdown}) END`,
        genAudit: resumeGenerations.auditJson,
        appStatus: applications.status,
        appNotes: applications.notes,
        appMatchScore: applications.matchScore,
        userJobMarkdown: userJobResumes.markdown,
        userJobTemplateId: userJobResumes.templateId,
        userJobTheme: userJobResumes.theme,
        userPreferences: userJobPreferences.preferences,
      })
      .from(resumeGenerationRequests)
      .innerJoin(jobs, eq(resumeGenerationRequests.jobId, jobs.id))
      .leftJoin(countries, eq(jobs.countryId, countries.id))
      .leftJoin(
        applications,
        and(
          eq(applications.jobId, resumeGenerationRequests.jobId),
          eq(applications.userId, user.id)
        )
      )
      .leftJoin(
        resumeGenerations,
        and(eq(resumeGenerationRequests.id, resumeGenerations.id), eq(resumeGenerations.userId, user.id), eq(resumeGenerations.jobId, resumeGenerationRequests.jobId))
      )
      .leftJoin(
        userJobResumes,
        and(
          eq(userJobResumes.jobId, resumeGenerationRequests.jobId),
          eq(userJobResumes.userId, user.id)
        )
      )
      .leftJoin(
        userJobPreferences,
        eq(userJobPreferences.userId, user.id)
      )
      .where(eq(resumeGenerationRequests.userId, user.id))
      .orderBy(desc(resumeGenerationRequests.createdAt));

    const seenJobs = new Set<string>();
    const applicationsList: ResumeApplicationItem[] = [];

    for (const r of rows) {
      if (seenJobs.has(r.jobId)) continue;
      seenJobs.add(r.jobId);

      const audit = (r.genAudit as Record<string, unknown>) || {};
      let reviewReason =
        (audit.review_reason as string) ||
        (audit.reason as string) ||
        (audit.summary as string) ||
        (Array.isArray(audit.issues) ? (audit.issues as string[]).join("; ") : null);

      if (r.requestStatus === "needs_review" && !reviewReason) {
        reviewReason = "Length or entity verification suggested. Review bullet points before applying.";
      }

      // Failed and pending requests never expose retained historical generation text.
      const markdown = ["completed", "needs_review"].includes(r.requestStatus) ? r.genMarkdown : null;
      const hasDraft = Boolean(markdown?.trim());

      // Resolve candidate's confirmed template from user_job_preferences
      const prefs = (r.userPreferences as Record<string, unknown>) || {};
      const lastConfirmed = (prefs.lastConfirmedPreferences as Record<string, unknown>) || {};
      const candidateConfirmedTemplate =
        (typeof lastConfirmed.selectedTemplateId === "string" && lastConfirmed.selectedTemplateId.trim())
          ? lastConfirmed.selectedTemplateId.trim()
          : (typeof prefs.selectedTemplateId === "string" && prefs.selectedTemplateId.trim())
          ? prefs.selectedTemplateId.trim()
          : "mit-capd";

      // Decoupled locked template: use the specific job's template if already tagged,
      // otherwise tag and lock the candidate's confirmed template choice
      const resolvedTmpl = getTemplateById(r.userJobTemplateId || candidateConfirmedTemplate);
      const templateId = resolvedTmpl.id;
      const theme = r.userJobTheme ?? resolvedTmpl.themeId;

      // Stage mapping:
      // "applied" -> 0
      // "screening" | "assessment" | "interview" -> 1
      // "offer" | "hired" -> 2
      // default / null -> -1
      let stageIndex = -1;
      if (r.appStatus) {
        const st = r.appStatus.toLowerCase();
        if (st === "applied") stageIndex = 0;
        else if (st === "interview" || st === "screening" || st === "assessment") stageIndex = 1;
        else if (st === "offer" || st === "hired") stageIndex = 2;
      }

      const canonicalJob: Job = mapDbRowToJob({
        id: r.jobId,
        jobRoleTitle: r.jobRoleTitle,
        companyName: r.companyName,
        employmentType: r.employmentType,
        location: r.location,
        salaryMin: r.salaryMin,
        salaryMax: r.salaryMax,
        currency: r.currency,
        jobDescription: r.jobDescription,
        createdAt: r.jobCreatedAt,
        publishedAt: r.jobPublishedAt,
        workModel: r.workModel,
        visaSponsorship: r.visaSponsorship,
        experienceRequired: r.experienceRequired,
        jobSource: r.jobSource,
        externalApplyUrl: r.externalApplyUrl,
        countryName: r.countryName,
      });

      applicationsList.push({
        id: r.requestId,
        jobId: r.jobId,
        jobRoleTitle: r.jobRoleTitle,
        companyName: r.companyName || "Unknown Company",
        location: r.location || "Remote",
        externalApplyUrl: r.externalApplyUrl,
        job: canonicalJob,
        requestedAt: r.createdAt.toISOString(),
        requestStatus: r.requestStatus as ResumeApplicationItem["requestStatus"],
        creditState: r.creditState,
        errorCode: r.errorCode,
        applicationStage: stageIndex,
        applicationNotes: r.appNotes,
        matchScore: r.appMatchScore,
        hasDraft,
        markdown,
        reviewReason,
        templateId,
        theme,
      });
    }

    return {
      success: true,
      applications: applicationsList,
    };
  } catch (error) {
    console.error("Error listing resume applications:", error);
    return {
      success: false,
      applications: [],
      error: error instanceof Error ? error.message : "Failed to load applications",
    };
  }
}

/**
 * Updates or persists a candidate's explicit application stage progress in Neon DB.
 * Stages:
 *  0: "applied"
 *  1: "interview"
 *  2: "offer"
 * -1: remove / reset stage
 */
export async function updateResumeApplicationStage(
  jobId: string,
  stageIndex: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!jobId || !UUID_REGEX.test(jobId)) {
      return { success: false, error: "Invalid job identifier." };
    }

    const user = await getCurrentUser();
    if (!user || !user.id || !UUID_REGEX.test(user.id)) {
      return { success: false, error: "Unauthorized session." };
    }

    if (![-1, 0, 1, 2].includes(stageIndex)) return { success: false, error: "Invalid application stage." };
    const [ownedRequest] = await db.select({ id: resumeGenerationRequests.id }).from(resumeGenerationRequests)
      .where(and(eq(resumeGenerationRequests.userId, user.id), eq(resumeGenerationRequests.jobId, jobId))).limit(1);
    if (!ownedRequest) return { success: false, error: "Application not found." };

    if (stageIndex >= 0) {
      const stageName: "applied" | "interview" | "offer" =
        stageIndex === 0 ? "applied" :
        stageIndex === 1 ? "interview" :
        "offer";

      const [existing] = await db
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.userId, user.id), eq(applications.jobId, jobId)))
        .limit(1);

      if (existing) {
        await db
          .update(applications)
          .set({
            status: stageName,
            updatedAt: new Date(),
          })
          .where(eq(applications.id, existing.id));
      } else {
        await db.insert(applications).values({
          userId: user.id,
          jobId,
          status: stageName,
          appliedAt: new Date(),
        });
      }
    } else {
      // Untoggled stage: remove explicit application record
      await db
        .delete(applications)
        .where(and(eq(applications.userId, user.id), eq(applications.jobId, jobId)));
    }

    revalidatePath("/job-hunt/applications");
    return { success: true };
  } catch (error) {
    console.error("Error updating application stage:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update stage",
    };
  }
}
