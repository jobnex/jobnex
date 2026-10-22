import { db } from "@/lib/db";
import { userJobPreferences, userPrefResumes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Resolves the authenticated user's verified active base resume ID.
 * Strictly enforces tenant isolation and ownership by joining 
 * user_job_preferences.active_resume_id to user_pref_resumes.id 
 * where both records belong to userId.
 */
export async function activeResumeId(userId: string): Promise<string | null> {
  if (!userId) return null;

  try {
    const [row] = await db
      .select({ id: userPrefResumes.id })
      .from(userJobPreferences)
      .innerJoin(
        userPrefResumes,
        and(
          eq(userPrefResumes.id, userJobPreferences.activeResumeId),
          eq(userPrefResumes.userId, userJobPreferences.userId)
        )
      )
      .where(eq(userJobPreferences.userId, userId))
      .limit(1);

    return row?.id ?? null;
  } catch (error) {
    console.error("[activeResumeId] Error querying active resume ID:", error);
    return null;
  }
}

/**
 * Returns full active base resume metadata for the authenticated user.
 */
export async function getActiveBaseResume(userId: string) {
  if (!userId) return null;

  try {
    const [row] = await db
      .select({
        id: userPrefResumes.id,
        userId: userPrefResumes.userId,
        title: userPrefResumes.title,
        fileName: userPrefResumes.fileName,
        fileKey: userPrefResumes.fileKey,
        content: userPrefResumes.content,
        parsedData: userPrefResumes.parsedData,
        updatedAt: userPrefResumes.updatedAt,
      })
      .from(userJobPreferences)
      .innerJoin(
        userPrefResumes,
        and(
          eq(userPrefResumes.id, userJobPreferences.activeResumeId),
          eq(userPrefResumes.userId, userJobPreferences.userId)
        )
      )
      .where(eq(userJobPreferences.userId, userId))
      .limit(1);

    return row ?? null;
  } catch (error) {
    console.error("[getActiveBaseResume] Error querying active resume record:", error);
    return null;
  }
}
