import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, smallint, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import { jobs } from "./jobs";

export const resumes = pgTable("resumes", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(), // Links to neon_auth.users.id
  title: text("title").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  content: text("content"), // Can be raw text or parsed JSON string
  parsedData: jsonb("parsed_data").default({}), // Structured parsed resume data
  fileUrl: text("file_url"), // URL if uploaded to a bucket
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_resumes_user_id").on(table.userId),
]);

export const userPrefResumes = pgTable("user_pref_resumes", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(), // Links to neon_auth.users.id
  title: text("title").notNull(),
  fileName: text("file_name"), // Original file name
  fileKey: text("file_key"), // Cloudflare R2 object key
  fileSize: integer("file_size"), // File size in bytes
  fileUrl: text("file_url"), // URL or R2 Key
  isPrimary: boolean("is_primary").default(true).notNull(),
  content: text("content"), // Can be raw text or parsed JSON string
  parsedData: jsonb("parsed_data").default({}), // Structured parsed resume data
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_user_pref_resumes_user_id_unique").on(table.userId),
]);

export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(), // Links to neon_auth.users.id
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  resumeId: uuid("resume_id"), // Relational constraint removed as requested
  status: text("status", {
    enum: [
      "applied",
      "screening",
      "assessment",
      "interview",
      "offer",
      "hired",
      "rejected",
      "withdrawn",
    ],
  }).default("applied").notNull(),
  notes: text("notes"),
  matchScore: real("match_score"), // 0 to 100 percentage match
  appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_applications_user_id").on(table.userId),
  index("idx_applications_job_id").on(table.jobId),
  index("idx_applications_user_applied").on(table.userId, table.appliedAt),
  uniqueIndex("idx_unique_user_job_application").on(table.userId, table.jobId),
]);

export const matchResults = pgTable("match_results", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }).notNull(),
  overallScore: real("overall_score").notNull(),
  skillScore: real("skill_score"),
  experienceScore: real("experience_score"),
  educationScore: real("education_score"),
  explanation: jsonb("explanation").default({}).notNull(),
  missingSkills: jsonb("missing_skills").default([]).notNull(),
  matchedSkills: jsonb("matched_skills").default([]).notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_match_results_application_id").on(table.applicationId),
]);

export const userJobResumes = pgTable("user_job_resumes", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: uuid("user_id").notNull(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  markdown: text("markdown").notNull(),
  r2ObjectKey: text("r2_object_key"),
  templateId: text("template_id").default("modern-ivy"),
  theme: integer("theme").default(3),
  status: text("status").default("ready").notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  exportedAt: timestamp("exported_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  uniqueIndex("user_job_resumes_user_id_job_id_key").on(table.userId, table.jobId),
]);

export const resumeGenerationRequests = pgTable(
  "resume_generation_requests",
  {
    id: uuid("id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
    baseResumeId: uuid("base_resume_id").references(() => userPrefResumes.id, { onDelete: "set null" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    sourceText: text("source_text").notNull(),
    jobDescription: text("job_description").notNull(),
    includeSummary: boolean("include_summary"),
    status: text("status").notNull(), // 'queued' | 'running' | 'completed' | 'needs_review' | 'failed'
    creditState: text("credit_state").notNull(), // 'held' | 'consumed' | 'released'
    creditCost: integer("credit_cost").default(1).notNull(),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    runningSlot: smallint("running_slot"),
  },
  (table) => [
    index("idx_resume_gen_req_user").on(table.userId),
    index("idx_resume_gen_req_job").on(table.jobId),
    index("idx_resume_gen_req_status").on(table.status),
    index("idx_resume_gen_req_user_created").on(table.userId, table.createdAt),
  ]
);

export const resumeGenerations = pgTable(
  "resume_generations",
  {
    id: uuid("id").primaryKey().notNull(), // maps 1:1 to resume_generation_requests.id
    userId: text("user_id").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
    baseResumeId: uuid("base_resume_id").references(() => userPrefResumes.id, { onDelete: "set null" }),
    version: integer("version").default(1).notNull(),
    status: text("status").notNull(),
    resumeMarkdown: text("resume_markdown").notNull(),
    auditJson: jsonb("audit_json").default({}).notNull(),
    sourceHash: text("source_hash").notNull(),
    jobHash: text("job_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_resume_gen_user").on(table.userId),
    index("idx_resume_gen_job").on(table.jobId),
  ]
);

export type ResumeGenerationRequest = typeof resumeGenerationRequests.$inferSelect;
export type ResumeGeneration = typeof resumeGenerations.$inferSelect;
