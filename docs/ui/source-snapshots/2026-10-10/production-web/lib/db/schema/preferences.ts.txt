import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { userPrefResumes } from "./applications";

export interface EducationEntry {
  id: string;
  college: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  grade: string;
  maxGrade: string;
  gradeType: string;
}

export interface ExperienceEntry {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  jobDescription: string;
  skills: string[];
  domains: string[];
  responsibilities: string;
}

export interface PersonalDetails {
  [key: string]: string | string[] | undefined;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  location?: string;
}

export interface JobPreferencesData {
  country?: string;
  cities?: string[];
  seniority?: string;
  jobTypes?: string[];
  experienceYears?: number;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  domains?: string[];
  skills?: string[];
  selectedTemplateId?: string;
  includeSummarySections?: boolean;
  autofillFromResume?: boolean;
  resumeUploaded?: boolean;
  resumeFileName?: string | null;
  resumeFileKey?: string | null;
  isConfirmed?: boolean;
  confirmedAt?: string | null;
  lastConfirmedPreferences?: Record<string, unknown> | null;
  manualEdits?: Record<string, unknown> | null;
}

export interface ResumeDetailsData {
  personalDetails?: PersonalDetails | null;
  educationHistory?: EducationEntry[];
  experienceHistory?: ExperienceEntry[];
}

/**
 * User Job Preferences Schema
 * Production-grade consolidated JSON document model.
 * 
 * - Strictly 1-to-1 relationship per authenticated user account (unique user_id index).
 * - Stores preferences and resume details in structured JSONB columns rather than dozens of rigid columns.
 * - Maintains independent lifecycle status and audit timestamps:
 *   - preferencesCreatedAt & preferencesUpdatedAt for "Save Preferences"
 *   - resumeDetailsCreatedAt & resumeDetailsUpdatedAt for "Generate Resume"
 * - Atomic upsert semantics ensure updates to preferences do not wipe resume details and vice versa.
 */
export const userJobPreferences = pgTable(
  "user_job_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    userId: text("user_id").notNull(),

    // Consolidated preferences JSON document
    preferences: jsonb("preferences").$type<JobPreferencesData>().default({}).notNull(),

    // Consolidated resume builder details JSON document
    resumeDetails: jsonb("resume_details").$type<ResumeDetailsData>().default({}).notNull(),

    // Relational Foreign Key to the candidate's active single resume
    activeResumeId: uuid("active_resume_id").references(() => userPrefResumes.id, { onDelete: "set null" }),

    // Independent status & audit timestamps
    preferencesCreatedAt: timestamp("preferences_created_at", { withTimezone: true, mode: "date" }),
    preferencesUpdatedAt: timestamp("preferences_updated_at", { withTimezone: true, mode: "date" }),
    resumeDetailsCreatedAt: timestamp("resume_details_created_at", { withTimezone: true, mode: "date" }),
    resumeDetailsUpdatedAt: timestamp("resume_details_updated_at", { withTimezone: true, mode: "date" }),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_user_job_preferences_user_id").on(table.userId),
    index("idx_user_job_preferences_active_resume_id").on(table.activeResumeId),
  ]
);

export type UserJobPreferences = typeof userJobPreferences.$inferSelect;
export type NewUserJobPreferences = typeof userJobPreferences.$inferInsert;
