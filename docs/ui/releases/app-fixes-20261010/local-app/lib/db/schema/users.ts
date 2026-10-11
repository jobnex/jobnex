import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().notNull(), // Links to neon_auth.users.id
  fullName: text("full_name"),
  phoneNumber: text("phone_number"),
  location: text("location"),
  country: text("country"),
  countryCode: text("country_code"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});


