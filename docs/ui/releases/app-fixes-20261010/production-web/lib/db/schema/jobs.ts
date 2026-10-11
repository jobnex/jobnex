import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, index, uniqueIndex, real, primaryKey } from "drizzle-orm/pg-core";
import { countries } from "./countries";

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  sourceService: text("source_service"), // Identifies which service or dept pushed the job
  jobRoleTitle: text("job_role_title").notNull(),
  jobDescription: text("job_description").notNull(),
  companyName: text("company_name").notNull(),
  location: text("location").notNull(),
  countryId: uuid("country_id").references(() => countries.id),
  employmentType: text("employment_type", {
    enum: ["full_time", "part_time", "contract", "freelance", "internship"],
  }).notNull(),
  workModel: text("work_model", {
    enum: ["remote", "on_site", "hybrid"],
  }).notNull(),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  currency: text("currency").default("USD"),
  status: text("status", {
    enum: ["draft", "published", "closed", "archived"],
  }).default("draft").notNull(),
  isExternal: boolean("is_external").default(true).notNull(),
  externalApplyUrl: text("external_apply_url").default("https://google.com"),
  requirements: jsonb("requirements").default([]).notNull(), // Array of text requirements
  jobSource: text("job_source"),
  experienceRequired: integer("experience_required"),
  visaSponsorship: boolean("visa_sponsorship").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  index("idx_jobs_job_role_title").on(table.jobRoleTitle),
  index("idx_jobs_company_name").on(table.companyName),
  index("idx_jobs_location").on(table.location),
  index("idx_jobs_country_id").on(table.countryId),
]);

export const skills = pgTable("skills", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: text("name").notNull().unique(),
  category: text("category", {
    enum: [
      "programming_language",
      "framework",
      "library",
      "database",
      "cloud",
      "devops",
      "tool",
      "soft_skill",
      "domain",
      "other",
    ],
  }).default("other").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

// Many-to-many relationship between jobs and skills
export const jobSkills = pgTable("job_skills", {
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  skillId: uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
  isCoreSkill: boolean("is_core_skill").default(false).notNull(), // To distinguish must-haves from nice-to-haves
});

// Saved jobs by users
export const savedJobs = pgTable("saved_jobs", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(), // Links to neon_auth.users.id
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => {
  return [
    index("idx_saved_jobs_user_id").on(table.userId),
    uniqueIndex("idx_unique_user_job_save").on(table.userId, table.jobId)
  ];
});

export const preferenceTags = pgTable("preference_tags", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["skill", "domain"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => {
  return [
    uniqueIndex("idx_unique_preference_tag_name_type").on(table.name, table.type)
  ];
});

export const preferenceTagRelationships = pgTable("preference_tag_relationships", {
  tagId: uuid("tag_id").references(() => preferenceTags.id, { onDelete: "cascade" }).notNull(),
  relatedTagId: uuid("related_tag_id").references(() => preferenceTags.id, { onDelete: "cascade" }).notNull(),
  weight: real("weight").notNull(),
}, (table) => {
  return [
    primaryKey({ columns: [table.tagId, table.relatedTagId] }),
    index("idx_preference_tag_relations_tag_id").on(table.tagId),
  ];
});
