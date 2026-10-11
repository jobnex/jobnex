import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const countries = pgTable("countries", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: text("name").notNull().unique(), // e.g. "United States"
  code: text("code").notNull().unique(), // e.g. "US"
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
