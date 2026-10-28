import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull().unique(), // Links to neon_auth.users.id
  balance: integer("balance").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(),
  transactionType: text("transaction_type", {
    enum: ["purchase", "resume_tailor", "refund", "adjustment", "signup_bonus"],
  }).notNull(),
  status: text("status", {
    enum: ["pending", "completed", "failed", "refunded"],
  }).default("completed").notNull(),
  referenceId: text("reference_id"), // E.g., application ID, resume ID, or signup_bonus_<userId>
  metadata: text("metadata"), // JSON string
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_credit_tx_user_id").on(table.userId),
  index("idx_credit_tx_user_created").on(table.userId, table.createdAt),
  index("idx_credit_tx_user_ref").on(table.userId, table.referenceId),
]);
