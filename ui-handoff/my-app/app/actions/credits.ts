"use server";
import { db } from "@/lib/db";
import { wallets, creditTransactions } from "@/lib/db/schema/credits";
import { eq, sql, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/server";

export interface GetCreditsResponse {
  balance: number;
  error?: string;
}

const INITIAL_SIGNUP_CREDITS = 5;

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
    } catch (err: unknown) {
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

/**
 * Atomically provisions a wallet for a newly registered user with 5 welcome credits
 * and creates an immutable ledger entry in credit_transactions.
 *
 * If the user already has a wallet (returning login), it safely returns the existing
 * wallet balance without granting any bonus credits.
 */
export async function getOrCreateUserWallet(userId: string): Promise<{ balance: number; isNewSignup: boolean }> {
  // Fast path: Check if the wallet already exists (returning users)
  const existingWallet = await fetchWalletWithRetry(userId);
  if (existingWallet) {
    return { balance: existingWallet.balance, isNewSignup: false };
  }

  // Slow path: Atomic creation with idempotency check inside a single database transaction
  try {
    return await db.transaction(async (tx) => {
      // Re-check within transaction to prevent race conditions
      const [lockedWallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);

      if (lockedWallet) {
        return { balance: lockedWallet.balance, isNewSignup: false };
      }

      // Check if signup bonus was already recorded previously (ledger idempotency safeguard)
      const [existingBonusTx] = await tx
        .select()
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, userId),
            eq(creditTransactions.transactionType, "signup_bonus")
          )
        )
        .limit(1);

      // Only grant welcome credits if no signup bonus has ever been issued to this user
      const initialBalance = existingBonusTx ? 0 : INITIAL_SIGNUP_CREDITS;

      // 1. Insert initial wallet linked to user account
      const [newWallet] = await tx
        .insert(wallets)
        .values({
          userId,
          balance: initialBalance,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      // 2. Record immutable signup bonus ledger transaction
      if (newWallet && initialBalance > 0) {
        await tx.insert(creditTransactions).values({
          userId,
          amount: INITIAL_SIGNUP_CREDITS,
          transactionType: "signup_bonus",
          status: "completed",
          referenceId: `signup_bonus_${userId}`,
          metadata: JSON.stringify({
            event: "user.signup",
            creditsGranted: INITIAL_SIGNUP_CREDITS,
            grantedAt: new Date().toISOString(),
          }),
        });
      }

      return {
        balance: newWallet?.balance ?? initialBalance,
        isNewSignup: !existingBonusTx,
      };
    });
  } catch (err: unknown) {
    // If a concurrent transaction completed just before, re-fetch the created wallet
    const fallback = await fetchWalletWithRetry(userId);
    if (fallback) {
      return { balance: fallback.balance, isNewSignup: false };
    }
    throw err;
  }
}

export async function getCredits(): Promise<GetCreditsResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Not authenticated", balance: 0 };

    const walletResult = await getOrCreateUserWallet(user.id);
    return { balance: walletResult.balance };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch credits";
    console.error("Error fetching credits:", message);
    return { error: message, balance: 0 };
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to deduct credit";
    return { error: message, success: false };
  }
}
