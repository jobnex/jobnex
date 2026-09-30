"use server";
import { db } from "@/lib/db";
import { wallets, creditTransactions } from "@/lib/db/schema/credits";
import { eq, sql, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/server";

export interface GetCreditsResponse {
  balance: number;
  error?: string;
}

/**
 * Resilient wallet query with transient error retry.
 * Handles Neon serverless compute sleep/resume transitions gracefully.
 */
async function fetchWalletWithRetry(userId: string, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);
      return wallet || null;
    } catch (err: any) {
      if (attempt < retries) {
        // Wait 250ms to allow connection pool re-establishment on serverless cold start
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw err;
    }
  }
  return null;
}

export async function getCredits(): Promise<GetCreditsResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Not authenticated", balance: 0 };

    const wallet = await fetchWalletWithRetry(user.id);
    if (!wallet) {
      // Auto-provision initial wallet record for authenticated user if not present
      try {
        const [createdWallet] = await db
          .insert(wallets)
          .values({
            userId: user.id,
            balance: 0,
          })
          .onConflictDoNothing()
          .returning();
        return { balance: createdWallet?.balance ?? 0 };
      } catch (insertErr) {
        console.warn("Wallet initialization non-fatal fallback:", insertErr);
        return { balance: 0 };
      }
    }

    return { balance: wallet.balance };
  } catch (error: any) {
    console.error("Error fetching credits:", error?.message || error);
    return { error: error?.message || "Failed to fetch credits", balance: 0 };
  }
}

export async function deductCredit(referenceId?: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated", success: false };

  try {
    const result = await db.transaction(async (tx) => {
      // Atomically decrement balance strictly when balance >= 1
      const [updatedWallet] = await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - 1`, updatedAt: new Date() })
        .where(and(eq(wallets.userId, user.id), sql`${wallets.balance} >= 1`))
        .returning();

      if (!updatedWallet) {
        throw new Error("Insufficient credits");
      }

      // Record transaction
      await tx.insert(creditTransactions).values({
        userId: user.id,
        amount: -1,
        transactionType: "resume_tailor",
        status: "completed",
        referenceId: referenceId || "ui_deduction",
      });
      
      return { success: true, newBalance: updatedWallet.balance };
    });
    
    return result;
  } catch (error: any) {
    return { error: error.message, success: false };
  }
}
