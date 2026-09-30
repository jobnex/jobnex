"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { savedJobs } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function toggleSavedJobAction(jobId: string, isSaving: boolean) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    if (isSaving) {
      await db
        .insert(savedJobs)
        .values({
          userId: user.id,
          jobId,
        })
        .onConflictDoNothing();

      return { success: true, isSaved: true };
    } else {
      await db
        .delete(savedJobs)
        .where(and(eq(savedJobs.userId, user.id), eq(savedJobs.jobId, jobId)));
      
      return { success: true, isSaved: false };
    }
  } catch (error: unknown) {
    console.error("Error toggling saved job:", error);
    const message = error instanceof Error ? error.message : "Failed to toggle save status";
    return { success: false, error: message };
  }
}

export async function getSavedJobIds() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: true, savedJobIds: [] }; // Not logged in, return empty
    }

    const saved = await db
      .select({ jobId: savedJobs.jobId })
      .from(savedJobs)
      .where(eq(savedJobs.userId, user.id));

    return { success: true, savedJobIds: saved.map((s) => s.jobId) };
  } catch (error: unknown) {
    console.error("Error fetching saved job IDs:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch saved job IDs";
    return { success: false, error: message, savedJobIds: [] };
  }
}
