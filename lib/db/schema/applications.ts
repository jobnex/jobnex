import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, real, uniqueIndex } from "drizzle-orm/pg-core";
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
});

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
});

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
});
