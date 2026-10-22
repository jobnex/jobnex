"use server";

import { db } from "@/lib/db";
import { userJobPreferences, UserJobPreferences, JobPreferencesData, ResumeDetailsData, userPrefResumes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeResume, StructuredResumeData } from "@/lib/resume-content";

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
}).optional().nullable();

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
  isConfirmed: z.preprocess((val) => Boolean(val), z.boolean().default(false)),
  confirmedAt: z.preprocess((val) => (val ? String(val).trim() : null), z.string().nullable().optional()),
  lastConfirmedPreferences: z.preprocess((val) => (typeof val === "object" && val !== null ? val : null), z.record(z.string(), z.unknown()).nullable().optional()),
  manualEdits: z.preprocess((val) => (typeof val === "object" && val !== null ? val : null), z.record(z.string(), z.unknown()).nullable().optional()),
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
          resumeFileName: activeResume.fileName || record.preferences?.resumeFileName || "Uploaded_Resume.pdf",
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

      // If there are unconfirmed manual edits recorded from a previous screen session,
      // hydrate them so the candidate's active screen state is restored seamlessly across devices
      if (record.preferences?.manualEdits && !record.preferences.isConfirmed) {
        const edits = record.preferences.manualEdits as Record<string, unknown>;
        record.preferences = {
          ...record.preferences,
          ...edits,
          isConfirmed: false,
          confirmedAt: record.preferences.confirmedAt,
          lastConfirmedPreferences: record.preferences.lastConfirmedPreferences,
          manualEdits: record.preferences.manualEdits,
        };
      }
      // Draft preferences cannot restore a deleted file or activate a stale one.
      record.preferences = {
        ...record.preferences,
        resumeUploaded: Boolean(activeResume?.fileKey),
        resumeFileKey: activeResume?.fileKey || null,
        resumeFileName: activeResume?.fileKey ? activeResume.fileName || 'Uploaded_Resume.pdf' : null,
      };
      record.activeResumeId = activeResume?.id || null;
    }

    return {
      success: true,
      data: record || null,
      isGuest: false,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load preferences from database";
    console.error("Failed to fetch user job preferences:", error);
    return {
      success: false,
      data: null,
      error: message,
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
    const isConfirm = Boolean(val.isConfirmed);
    const now = new Date();

    // Fetch existing preferences record to preserve confirmation metadata on auto-save
    const [existingRecord] = await db
      .select({ preferences: userJobPreferences.preferences })
      .from(userJobPreferences)
      .where(eq(userJobPreferences.userId, user.id))
      .limit(1);

    const prevPref = (existingRecord?.preferences || {}) as JobPreferencesData;

    let confirmedSnapshot: Record<string, unknown> | null = null;
    let confirmedAtStr: string | null = null;
    let isConfirmedVal = false;

    if (isConfirm) {
      isConfirmedVal = true;
      confirmedAtStr = val.confirmedAt || now.toISOString();
      confirmedSnapshot = {
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
    } else {
      // Auto-save draft: preserve existing confirmation status and snapshot
      isConfirmedVal = prevPref.isConfirmed ?? false;
      confirmedAtStr = prevPref.confirmedAt ?? null;
      confirmedSnapshot = (val.lastConfirmedPreferences ?? prevPref.lastConfirmedPreferences) ?? null;
    }

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
      isConfirmed: isConfirmedVal,
      confirmedAt: confirmedAtStr,
      lastConfirmedPreferences: confirmedSnapshot,
      manualEdits: isConfirm
        ? null
        : (val.manualEdits ?? {
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
          }),
    };

    const [activeBase] = await db.select().from(userPrefResumes).where(eq(userPrefResumes.userId,user.id)).limit(1);
    if (cleanPreferences.resumeFileKey && cleanPreferences.resumeFileKey !== activeBase?.fileKey) {
      return {success:false,error:"Validate and confirm the replacement PDF before saving preferences."};
    }
    const activeResumeId = activeBase?.id ?? null;
    cleanPreferences.resumeFileKey = activeBase?.fileKey ?? null;
    cleanPreferences.resumeFileName = activeBase?.fileName ?? null;
    cleanPreferences.resumeUploaded = Boolean(activeBase?.fileKey);

    // 2. Atomic Upsert: Replaces preferences for the user without touching resume_details
    const [saved] = await db
      .insert(userJobPreferences)
      .values({
        userId: user.id,
        preferences: cleanPreferences,
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
          preferences: cleanPreferences,
          activeResumeId: sql`user_job_preferences.active_resume_id`,
          preferencesCreatedAt: sql`COALESCE(${userJobPreferences.preferencesCreatedAt}, ${now})`,
          preferencesUpdatedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    if (isConfirm) {
      revalidatePath("/job-hunt/manage");
      revalidatePath("/job-hunt");
      revalidatePath("/(main)/job-hunt/manage", "page");
    }

    return {
      success: true,
      data: saved,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to persist preferences to the database.";
    console.error("Failed to save user job preferences:", error);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * [DEV NOTE - IN DEVELOPMENT / UNBUILT BASE RESUME GENERATOR]
 * NOTE FOR DEVELOPERS:
 * `saveResumeDetails` and the `resumeDetails` schema fields belong to the unbuilt "Generate Base Resume"
 * scratch-builder flow (when a user has no resume to upload).
 * - It is strictly for generating a fallback BASE resume.
 * - It is NOT related to AI resume tailoring for specific jobs (which runs on `/job-hunt/applications`
 *   and uses `user_job_resumes` & `resume_generation_requests`).
 * - This feature is not built yet; do NOT concentrate on it.
 * - It does NOT affect AI resume tailoring or job matching in any way.
 *
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
        ? {
            fullName: val.personalDetails.fullName?.trim() || undefined,
            email: val.personalDetails.email?.trim() || undefined,
            phoneNumber: val.personalDetails.phoneNumber?.trim() || undefined,
            location: val.personalDetails.location?.trim() || undefined,
          }
        : null,
      educationHistory: val.educationHistory || [],
      experienceHistory: val.experienceHistory || [],
    };

    const now = new Date();

    // Transactional synchronized save:
    // Merges builder form fields with extraction metadata, reconstructs canonical Markdown,
    // and saves both userJobPreferences.resumeDetails and userPrefResumes (content & parsedData) together.
    const saved = await db.transaction(async (tx) => {
      // 1. Read existing base resume row
      const [baseResume] = await tx
        .select()
        .from(userPrefResumes)
        .where(eq(userPrefResumes.userId, user.id))
        .limit(1);

      // 2. Read existing preferences row
      const [existingPref] = await tx
        .select()
        .from(userJobPreferences)
        .where(eq(userJobPreferences.userId, user.id))
        .limit(1);

      // 3. Merge existing extraction fields with validated editable builder fields
      const existingExtraction = (baseResume?.parsedData || existingPref?.resumeDetails || {}) as StructuredResumeData;
      const merged: StructuredResumeData = {
        ...existingExtraction,
        personalDetails: cleanResumeDetails.personalDetails,
        educationHistory: cleanResumeDetails.educationHistory,
        experienceHistory: cleanResumeDetails.experienceHistory,
      };

      // 4. Normalize with edited = true to reconstruct canonical compiler_payload.markdown
      const normalized = normalizeResume(merged, true);
      const canonicalMarkdown = normalized.compiler_payload?.markdown || "";

      // 5. Update user_pref_resumes if base row exists
      const activeId = baseResume?.id || existingPref?.activeResumeId || null;
      if (baseResume) {
        await tx
          .update(userPrefResumes)
          .set({
            content: canonicalMarkdown,
            parsedData: normalized,
            updatedAt: now,
          })
          .where(eq(userPrefResumes.id, baseResume.id));
      }

      // 6. Upsert userJobPreferences with synchronized resumeDetails and activeResumeId
      const [prefResult] = await tx
        .insert(userJobPreferences)
        .values({
          userId: user.id,
          preferences: {},
          resumeDetails: normalized,
          activeResumeId: activeId,
          resumeDetailsCreatedAt: now,
          resumeDetailsUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userJobPreferences.userId,
          set: {
            resumeDetails: normalized,
            activeResumeId: activeId ? activeId : sql`user_job_preferences.active_resume_id`,
            resumeDetailsCreatedAt: sql`COALESCE(${userJobPreferences.resumeDetailsCreatedAt}, ${now})`,
            resumeDetailsUpdatedAt: now,
            updatedAt: now,
          },
        })
        .returning();

      return prefResult;
    });

    revalidatePath("/job-hunt/manage");
    revalidatePath("/job-hunt");
    revalidatePath("/(main)/job-hunt/manage", "page");

    return {
      success: true,
      data: saved,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to persist resume details to the database.";
    console.error("Failed to save resume details:", error);
    return {
      success: false,
      error: message,
    };
  }
}
