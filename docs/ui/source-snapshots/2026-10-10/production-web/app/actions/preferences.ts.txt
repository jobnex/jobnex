"use server";

import { db } from "@/lib/db";
import { userJobPreferences, UserJobPreferences, JobPreferencesData, ResumeDetailsData, userPrefResumes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { pendingPreferences, confirmedPreferences } from "@/lib/preferences-confirmation";
import { preferenceWrite } from "@/lib/db/preferences-confirmation";
import { normalizeResume, resumeMarkdown } from "@/lib/resume-content";

const EducationEntrySchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  college: z.string().default(""),
  degree: z.string().default(""),
  field: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  grade: z.string().default(""),
  maxGrade: z.string().default(""),
  gradeType: z.string().default("CGPA"),
});

const ExperienceEntrySchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  company: z.string().default(""),
  role: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  jobDescription: z.string().default(""),
  skills: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  responsibilities: z.string().default(""),
});

const PersonalDetailsSchema = z.object({
  fullName: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
}).catchall(z.union([z.string().max(2000),z.array(z.string().max(2000)).max(50)]).optional().nullable()).optional().nullable();

const cleanStringArray = z.preprocess((val) => {
  if (!Array.isArray(val)) return [];
  return Array.from(new Set(val.map((x) => String(x).trim()).filter(Boolean)));
}, z.array(z.string()));

const numberOrNull = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return null;
  const num = Number(val);
  return isNaN(num) ? null : Math.max(0, Math.floor(num));
}, z.number().int().nonnegative().nullable().optional());

const experienceYearsCoerce = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return 3;
  const num = Number(val);
  if (isNaN(num)) return 3;
  return Math.min(60, Math.max(0, Math.floor(num)));
}, z.number().int().min(0).max(60).default(3));

const JobPreferencesInputSchema = z.object({
  country: z.preprocess((val) => (typeof val === "string" ? val.trim().toLowerCase() : "us"), z.string().min(1).default("us")),
  cities: cleanStringArray.pipe(z.array(z.string()).max(3)).default([]),
  seniority: z.preprocess((val) => (typeof val === "string" ? val.trim() : "Mid-level"), z.string().default("Mid-level")),
  jobTypes: cleanStringArray.default(["Full-time"]),
  experienceYears: experienceYearsCoerce,
  salaryMin: numberOrNull,
  salaryMax: numberOrNull,
  currency: z.preprocess((val) => (typeof val === "string" ? val.trim().toUpperCase() : "USD"), z.string().default("USD")),
  domains: cleanStringArray.default([]),
  skills: cleanStringArray.default([]),
  selectedTemplateId: z.preprocess((val) => (typeof val === "string" ? val.trim() : "mit-capd"), z.string().default("mit-capd")),
  includeSummarySections: z.preprocess((val) => Boolean(val), z.boolean().default(true)),
  autofillFromResume: z.preprocess((val) => Boolean(val), z.boolean().default(true)),
  resumeUploaded: z.preprocess((val) => Boolean(val), z.boolean().default(false)),
  resumeFileName: z.preprocess((val) => (val ? String(val).trim() : null), z.string().nullable().optional()),
  resumeFileKey: z.preprocess((val) => (val ? String(val).trim() : null), z.string().nullable().optional()),
}).refine(
  (data) => {
    if (data.salaryMin != null && data.salaryMax != null) {
      return data.salaryMin <= data.salaryMax;
    }
    return true;
  },
  {
    message: "Minimum salary cannot exceed maximum salary",
    path: ["salaryMin"],
  }
);

const ResumeDetailsInputSchema = z.object({
  personalDetails: PersonalDetailsSchema,
  educationHistory: z.array(EducationEntrySchema).default([]),
  experienceHistory: z.array(ExperienceEntrySchema).default([]),
});

export type GetPreferencesResult = {
  success: boolean;
  data: UserJobPreferences | null;
  isGuest?: boolean;
  error?: string;
};

export type SavePreferencesResult = {
  success: boolean;
  data?: UserJobPreferences;
  error?: string;
};

/**
 * Fetch the authenticated candidate's job preferences and resume details from PostgreSQL.
 * If user is not authenticated, returns data: null with isGuest: true.
 */
export async function getUserJobPreferences(): Promise<GetPreferencesResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: true, data: null, isGuest: true };
    }

    const [[record], [activeResume]] = await Promise.all([
      db
        .select()
        .from(userJobPreferences)
        .where(eq(userJobPreferences.userId, user.id))
        .limit(1),
      db
        .select()
        .from(userPrefResumes)
        .where(eq(userPrefResumes.userId, user.id))
        .limit(1),
    ]);

    if (record) {
      // Normalize from resumes table as the primary source of truth for resume file
      if (activeResume?.fileKey) {
        record.preferences = {
          ...(record.preferences || {}),
          resumeUploaded: true,
          resumeFileName: activeResume.fileName || (record.preferences as any)?.resumeFileName || "Uploaded_Resume.pdf",
          resumeFileKey: activeResume.fileKey,
        };
        record.activeResumeId = activeResume.id;
      } else if (!activeResume && record.preferences?.resumeUploaded) {
        // If resumes table was purged, reflect state
        record.preferences = {
          ...(record.preferences || {}),
          resumeUploaded: false,
          resumeFileName: null,
          resumeFileKey: null,
        };
        record.activeResumeId = null;
      }
    }

    return {
      success: true,
      data: record || null,
      isGuest: false,
    };
  } catch (error: any) {
    console.error("Failed to fetch user job preferences:", error);
    return {
      success: false,
      data: null,
      error: error?.message || "Failed to load preferences from database",
    };
  }
}

/**
 * Save or update candidate preferences in consolidated JSON format.
 * - Strictly 1:1 per user account (unique user_id constraint).
 * - Updates only the 'preferences' document, preserving 'resume_details'.
 * - Independently updates preferences_updated_at and preferences_created_at.
 */
export async function saveUserJobPreferences(
  input: unknown
): Promise<SavePreferencesResult> {
  return persistPreferences(input, false);
}

export async function confirmUserJobPreferences(input: unknown): Promise<SavePreferencesResult> {
  return persistPreferences(input, true);
}

async function persistPreferences(input: unknown, confirm: boolean): Promise<SavePreferencesResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: "You must be logged in to save preferences to your account.",
      };
    }

    const parsed = JobPreferencesInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid preference data provided.";
      return {
        success: false,
        error: issue,
      };
    }

    const val = parsed.data;
    const cleanPreferences: JobPreferencesData = {
      country: val.country,
      cities: val.cities.slice(0, 3),
      seniority: val.seniority,
      jobTypes: val.jobTypes.length > 0 ? val.jobTypes : ["Full-time"],
      experienceYears: val.experienceYears,
      salaryMin: val.salaryMin ?? null,
      salaryMax: val.salaryMax ?? null,
      currency: val.currency,
      domains: val.domains,
      skills: val.skills,
      selectedTemplateId: val.selectedTemplateId,
      includeSummarySections: val.includeSummarySections,
      autofillFromResume: val.autofillFromResume,
      resumeUploaded: Boolean(val.resumeUploaded),
      resumeFileName: val.resumeFileName ?? null,
      resumeFileKey: val.resumeFileKey ?? null,
    };

    if (cleanPreferences.resumeFileKey && !cleanPreferences.resumeFileKey.startsWith(`user_pref_resumes/${user.id}/`)) {
      return { success: false, error: "Invalid resume owner" };
    }

    const now = new Date();

    // 1. Ensure normalized user_pref_resumes table is synchronized if file key is present
    let activeResumeId: string | null = null;
    if (cleanPreferences.resumeFileKey) {
      const [resRecord] = await db
        .insert(userPrefResumes)
        .values({
          userId: user.id,
          title: cleanPreferences.resumeFileName || "Primary Resume",
          fileName: cleanPreferences.resumeFileName || "Uploaded_Resume.pdf",
          fileKey: cleanPreferences.resumeFileKey,
          fileUrl: cleanPreferences.resumeFileKey,
          isPrimary: true,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userPrefResumes.userId,
          set: {
            title: cleanPreferences.resumeFileName || "Primary Resume",
            fileName: cleanPreferences.resumeFileName || "Uploaded_Resume.pdf",
            fileKey: cleanPreferences.resumeFileKey,
          content: sql`CASE WHEN ${userPrefResumes.fileKey} IS DISTINCT FROM ${cleanPreferences.resumeFileKey} THEN NULL ELSE ${userPrefResumes.content} END`,
          parsedData: sql`CASE WHEN ${userPrefResumes.fileKey} IS DISTINCT FROM ${cleanPreferences.resumeFileKey} THEN '{}'::jsonb ELSE ${userPrefResumes.parsedData} END`,
            fileUrl: cleanPreferences.resumeFileKey,
            isPrimary: true,
            updatedAt: now,
          },
        })
        .returning();
      activeResumeId = resRecord.id;
    } else if (cleanPreferences.resumeUploaded === false) {
      // If user unsets resume, dissociate activeResumeId
      activeResumeId = null;
    }

    // 2. Atomic Upsert: Replaces preferences for the user without touching resume_details
    const [saved] = await db
      .insert(userJobPreferences)
      .values({
        userId: user.id,
        preferences: confirm ? confirmedPreferences({}, cleanPreferences as Record<string, unknown>, now.toISOString()) : pendingPreferences({}, cleanPreferences as Record<string, unknown>),
        resumeDetails: {},
        activeResumeId,
        preferencesCreatedAt: now,
        preferencesUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userJobPreferences.userId,
        set: {
          preferences: preferenceWrite(cleanPreferences as Record<string, unknown>, confirm ? now.toISOString() : undefined),
          activeResumeId: cleanPreferences.resumeFileKey 
            ? activeResumeId 
            : (cleanPreferences.resumeUploaded === false ? null : sql`user_job_preferences.active_resume_id`),
          preferencesCreatedAt: sql`COALESCE(${userJobPreferences.preferencesCreatedAt}, ${now})`,
          preferencesUpdatedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    revalidatePath("/job-hunt/manage");
    revalidatePath("/job-hunt");
    revalidatePath("/(main)/job-hunt/manage", "page");

    return {
      success: true,
      data: saved,
    };
  } catch (error: any) {
    console.error("Failed to save user job preferences:", error);
    return {
      success: false,
      error: error?.message || "Failed to persist preferences to the database.",
    };
  }
}

/**
 * Save or update resume builder details (education, experience, personal details) in consolidated JSON format.
 * - Strictly 1:1 per user account (unique user_id constraint).
 * - Independent function: updates only the 'resume_details' document, preserving 'preferences'.
 * - Independently updates resume_details_updated_at and resume_details_created_at.
 */
export async function saveResumeDetails(
  input: unknown
): Promise<SavePreferencesResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: "You must be logged in to save resume details to your account.",
      };
    }

    const parsed = ResumeDetailsInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid resume details provided.";
      return {
        success: false,
        error: issue,
      };
    }

    const val = parsed.data;
    const cleanResumeDetails: ResumeDetailsData = {
      personalDetails: val.personalDetails
        ? Object.fromEntries(Object.entries(val.personalDetails).map(([key,value]) => [key, Array.isArray(value) ? value.map(item => item.trim()).filter(Boolean) : typeof value === 'string' ? value.trim() : undefined]))
        : null,
      educationHistory: val.educationHistory || [],
      experienceHistory: val.experienceHistory || [],
    };

    const now = new Date();

    // Lock the owned base resume before preferences, matching profile extraction lock order.
    const saved = await db.transaction(async (tx) => {
      const [resume] = await tx.select().from(userPrefResumes).where(eq(userPrefResumes.userId, user.id)).for("update");
      const [current] = await tx.select().from(userJobPreferences).where(eq(userJobPreferences.userId, user.id)).for("update");
      const details = normalizeResume({ ...(current?.resumeDetails || {}), ...cleanResumeDetails, personalDetails: cleanResumeDetails.personalDetails ? { ...(current?.resumeDetails?.personalDetails || {}), ...cleanResumeDetails.personalDetails } : null }, true);
      const [record] = await tx
      .insert(userJobPreferences)
      .values({
        userId: user.id,
        preferences: {},
        resumeDetails: details,
        activeResumeId: resume?.id ?? null,
        resumeDetailsCreatedAt: now,
        resumeDetailsUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userJobPreferences.userId,
        set: {
          resumeDetails: details,
          activeResumeId: resume?.id ?? null,
          resumeDetailsCreatedAt: sql`COALESCE(${userJobPreferences.resumeDetailsCreatedAt}, ${now})`,
          resumeDetailsUpdatedAt: now,
          updatedAt: now,
        },
      })
      .returning();
      if (resume) await tx.update(userPrefResumes).set({
        content: resumeMarkdown(details), parsedData: details, updatedAt: now,
      }).where(eq(userPrefResumes.id, resume.id));
      return record;
    });

    revalidatePath("/job-hunt/manage");
    revalidatePath("/job-hunt");
    revalidatePath("/(main)/job-hunt/manage", "page");

    return {
      success: true,
      data: saved,
    };
  } catch (error: any) {
    console.error("Failed to save resume details:", error);
    return {
      success: false,
      error: error?.message || "Failed to persist resume details to the database.",
    };
  }
}
