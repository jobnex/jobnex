"use server";

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { userPrefResumes, userJobPreferences } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

export type StorageCategory = "resume" | "avatar";

interface GetUploadUrlParams {
  fileName: string;
  fileType: string;
  category: StorageCategory;
}

export interface PresignedUploadResponse {
  success: boolean;
  uploadUrl?: string;
  objectKey?: string;
  error?: string;
}

export interface PresignedDownloadResponse {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

/**
 * Generates a temporary Presigned PUT URL allowing the client browser to upload
 * a file directly to Cloudflare R2 without passing bytes through Next.js / Vercel.
 */
export async function getPresignedUploadUrl({
  fileName,
  fileType,
  category,
}: GetUploadUrlParams): Promise<PresignedUploadResponse> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, error: "Authentication required to upload files." };
    }

    if (!fileName || !fileType) {
      return { success: false, error: "File name and type are required." };
    }

    if (!["resume", "avatar"].includes(category)) {
      return { success: false, error: "Invalid storage category." };
    }

    // Sanitize file name to prevent illegal characters or path traversal
    const sanitizedFileName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "");

    const fileUuid = crypto.randomUUID();
    const folder = category === "resume" ? "user_pref_resumes" : `${category}s`;
    const objectKey = `${folder}/${user.id}/${fileUuid}-${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      ContentType: fileType,
    });

    // 5-minute validity window for upload
    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });

    return {
      success: true,
      uploadUrl,
      objectKey,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate upload URL.";
    console.error("Failed to generate presigned upload URL:", error);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Generates a temporary Presigned GET URL for secure downloading or viewing.
 * Strictly verifies ownership by ensuring the user ID in the key matches the current user.
 */
export async function getPresignedDownloadUrl(objectKey: string): Promise<PresignedDownloadResponse> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, error: "Authentication required." };
    }

    if (!objectKey || typeof objectKey !== "string") {
      return { success: false, error: "Invalid object key." };
    }

    // Security Guard: Prevent directory traversal
    if (objectKey.includes("..")) {
      return { success: false, error: "Invalid file path." };
    }

    // Security Guard: Enforce tenant isolation or shared template access
    const isSharedTemplate = objectKey.startsWith("templates/");
    if (!isSharedTemplate) {
      // Keys follow the convention: user_pref_resumes/{userId}/... or avatars/{userId}/...
      const parts = objectKey.split("/");
      if (parts.length < 3 || parts[1] !== user.id) {
        return { success: false, error: "Unauthorized access to this resource." };
      }
    }

    const isPdf = objectKey.toLowerCase().endsWith(".pdf");
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      ...(isPdf ? { ResponseContentType: "application/pdf" } : {}),
      ResponseContentDisposition: "inline",
    });

    // 2-hour validity window for reading/previewing
    const downloadUrl = await getSignedUrl(r2Client, command, { expiresIn: 7200 });

    return {
      success: true,
      downloadUrl,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate download URL.";
    console.error("Failed to generate presigned download URL:", error);
    return {
      success: false,
      error: message,
    };
  }
}

export interface TemplateAssetUrls {
  [templateId: string]: {
    pdfUrl: string;
    thumbnailUrl: string;
  };
}

/**
 * Returns temporary presigned direct R2 URLs for all 6 PDF templates and thumbnails.
 * Authenticated: only logged-in users can request this.
 * Direct: the client streams the files directly from Cloudflare R2 (0 Vercel bandwidth).
 * Resilient: falls back to bundled public assets if R2 credentials or requests fail.
 */
export async function getAllTemplatePresignedUrls(): Promise<{
  success: boolean;
  data?: TemplateAssetUrls;
  error?: string;
}> {
  const fallbackUrls: TemplateAssetUrls = {
    "mit-capd": { pdfUrl: "/resume-templates/MITCAPD.pdf", thumbnailUrl: "/resume-templates/MITCAPD-1.jpg" },
    "modern-ivy": { pdfUrl: "/resume-templates/dhmkrwtksdgy.pdf", thumbnailUrl: "/resume-templates/dhmkrwtksdgy-1.jpg" },
    "tech-specialist": { pdfUrl: "/resume-templates/bznbzdprjfyy.pdf", thumbnailUrl: "/resume-templates/bznbzdprjfyy-1.jpg" },
    "minimalist-exec": { pdfUrl: "/resume-templates/cxtjgrmpsrvh.pdf", thumbnailUrl: "/resume-templates/cxtjgrmpsrvh-1.jpg" },
    "contemporary-compact": { pdfUrl: "/resume-templates/hmhyxvxfspsw.pdf", thumbnailUrl: "/resume-templates/hmhyxvxfspsw-1.jpg" },
    "standard-overleaf": { pdfUrl: "/resume-templates/Untitled.pdf", thumbnailUrl: "/resume-templates/Untitled-1.jpg" },
  };

  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, error: "Authentication required." };
    }

    const templateDefs = [
      { id: "mit-capd", fileName: "MITCAPD.pdf" },
      { id: "modern-ivy", fileName: "dhmkrwtksdgy.pdf" },
      { id: "tech-specialist", fileName: "bznbzdprjfyy.pdf" },
      { id: "minimalist-exec", fileName: "cxtjgrmpsrvh.pdf" },
      { id: "contemporary-compact", fileName: "hmhyxvxfspsw.pdf" },
      { id: "standard-overleaf", fileName: "Untitled.pdf" },
    ];

    const result: TemplateAssetUrls = {};
    const expiresIn = 7200; // 2 hours

    await Promise.all(
      templateDefs.map(async (tmpl) => {
        const baseName = tmpl.fileName.replace(/\.pdf$/i, "");
        const pdfKey = `templates/${tmpl.fileName}`;
        const thumbKey = `templates/${baseName}-1.jpg`;

        const [pdfUrl, thumbnailUrl] = await Promise.all([
          getSignedUrl(
            r2Client,
            new GetObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: pdfKey,
              ResponseContentType: "application/pdf",
              ResponseContentDisposition: "inline",
            }),
            { expiresIn }
          ),
          getSignedUrl(
            r2Client,
            new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: thumbKey }),
            { expiresIn }
          ),
        ]);

        result[tmpl.id] = { pdfUrl, thumbnailUrl };
      })
    );

    return { success: true, data: result };
  } catch (error: unknown) {
    console.warn("Failed to generate template presigned URLs from R2, falling back to local public assets:", error);
    return {
      success: true,
      data: fallbackUrls,
    };
  }
}

/**
 * Deletes an object from R2 after verifying ownership.
 */
export async function deleteStorageObject(objectKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, error: "Authentication required." };
    }

    const parts = objectKey.split("/");
    if (parts.length < 3 || parts[1] !== user.id) {
      return { success: false, error: "Unauthorized." };
    }

    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
    });

    await r2Client.send(command);

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete file.";
    console.error("Failed to delete storage object:", error);
    return { success: false, error: message };
  }
}

export interface CommitResumeParams {
  objectKey: string;
  fileName: string;
  fileSize?: number;
}

/**
 * Commits a newly uploaded resume to the relational 'resumes' table
 * and strictly enforces the production storage invariant:
 * ONLY ONE RESUME PER ACCOUNT IN CLOUDFLARE R2 AT ANY POINT IN TIME.
 * Any older resume versions in R2 for this user account are pruned/deleted.
 */
export type UserPrefResumeRecord = typeof userPrefResumes.$inferSelect;

export async function commitResumeUpload({
  objectKey,
  fileName,
  fileSize,
}: CommitResumeParams): Promise<{
  success: boolean;
  data?: UserPrefResumeRecord;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, error: "Authentication required." };
    }

    if (!objectKey || typeof objectKey !== "string") {
      return { success: false, error: "Invalid object key." };
    }

    // Security validation: verify key ownership & path
    const expectedPrefix = `user_pref_resumes/${user.id}/`;
    if (!objectKey.startsWith(expectedPrefix)) {
      return { success: false, error: "Unauthorized file key." };
    }

    // 1. Storage Invariant Enforcement:
    // List and delete ALL existing objects in Cloudflare R2 under user_pref_resumes/{user.id}/
    // EXCEPT the newly uploaded objectKey. Never delete the persistent directory marker (.keep).
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: expectedPrefix,
      });
      const listRes = await r2Client.send(listCommand);
      if (listRes.Contents && listRes.Contents.length > 0) {
        for (const item of listRes.Contents) {
          if (item.Key && item.Key !== objectKey && !item.Key.endsWith("/.keep")) {
            console.log(`[R2 Prune] Deleting old resume version: ${item.Key}`);
            await r2Client.send(
              new DeleteObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: item.Key,
              })
            );
          }
        }
      }
    } catch (r2Err) {
      console.error("Failed to prune old R2 resumes:", r2Err);
      // Non-fatal if R2 list fails, but we continue to DB commit
    }

    const now = new Date();
    const cleanFileName = fileName || "Uploaded_Resume.pdf";

    // 2. Database Upsert into normalized 'user_pref_resumes' table
    const [savedResume] = await db
      .insert(userPrefResumes)
      .values({
        userId: user.id,
        title: cleanFileName,
        fileName: cleanFileName,
        fileKey: objectKey,
        fileSize: fileSize || null,
        fileUrl: objectKey,
        isPrimary: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userPrefResumes.userId,
        set: {
          title: cleanFileName,
          fileName: cleanFileName,
          fileKey: objectKey,
          content: sql`CASE WHEN ${userPrefResumes.fileKey} IS DISTINCT FROM ${objectKey} THEN NULL ELSE ${userPrefResumes.content} END`,
          parsedData: sql`CASE WHEN ${userPrefResumes.fileKey} IS DISTINCT FROM ${objectKey} THEN '{}'::jsonb ELSE ${userPrefResumes.parsedData} END`,
          fileSize: fileSize || null,
          fileUrl: objectKey,
          isPrimary: true,
          updatedAt: now,
        },
      })
      .returning();

    // 3. Update user_job_preferences with activeResumeId foreign key
    // and sync JSON document for backward compatibility
    const [existingPref] = await db
      .select()
      .from(userJobPreferences)
      .where(eq(userJobPreferences.userId, user.id))
      .limit(1);

    if (existingPref) {
      const updatedPrefs = {
        ...(existingPref.preferences as Record<string, unknown>),
        resumeUploaded: true,
        resumeFileName: cleanFileName,
        resumeFileKey: objectKey,
      };

      await db
        .update(userJobPreferences)
        .set({
          activeResumeId: savedResume.id,
          preferences: updatedPrefs,
          updatedAt: now,
        })
        .where(eq(userJobPreferences.userId, user.id));
    }

    revalidatePath("/job-hunt/manage");
    revalidatePath("/job-hunt");
    revalidatePath("/(main)/job-hunt/manage", "page");

    return {
      success: true,
      data: savedResume,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to register resume in database.";
    console.error("Failed to commit resume upload:", error);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Permanently deletes the candidate's active resume from Cloudflare R2
 * and clears its active attachment in PostgreSQL. Keep the row for generation history.
 * Removes only the detached attachment, preserving unrelated files.
 */
export async function deleteUserResume(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, error: "Authentication required." };
    }

    const expectedPrefix = `user_pref_resumes/${user.id}/`;

    // Commit database removal before touching files. Historical audits remain intact.
    const removedKeys = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id, file_key FROM user_pref_resumes WHERE user_id=${user.id} FOR UPDATE`);
      const pending = await tx.execute(sql`SELECT id FROM resume_generation_requests
        WHERE user_id=${user.id} AND base_resume_id IN
          (SELECT id FROM user_pref_resumes WHERE user_id=${user.id})
        AND status IN ('queued', 'running') LIMIT 1`);
      if (pending.rows.length) {
        throw new Error("Wait for your resume generation to finish before removing the base resume.");
      }
      await tx.update(userJobPreferences).set({ activeResumeId: null, updatedAt: new Date() })
        .where(eq(userJobPreferences.userId, user.id));
      await tx.update(userPrefResumes).set({
        isPrimary: false, fileKey: null, fileUrl: null, fileName: null, fileSize: null,
        updatedAt: new Date(),
      }).where(eq(userPrefResumes.userId, user.id));
      await tx.execute(sql`UPDATE user_job_preferences SET preferences=
        COALESCE(preferences, '{}'::jsonb) ||
        '{"resumeUploaded":false,"resumeFileName":null,"resumeFileKey":null}'::jsonb
        WHERE user_id=${user.id}`);
      return locked.rows.map((row) => row.file_key).filter((key): key is string =>
        typeof key === "string" && key.startsWith(expectedPrefix) && !key.endsWith("/.keep"));
    });

    // Do not purge the prefix: a concurrent upload may already have added a replacement.
    try {
      for (const key of removedKeys) {
        await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
      }
    } catch (r2Err) {
      console.error("Failed to purge R2 files on resume delete:", r2Err);
    }

    revalidatePath("/job-hunt/manage");
    revalidatePath("/job-hunt");
    revalidatePath("/(main)/job-hunt/manage", "page");

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete resume.";
    console.error("Failed to delete user resume:", error);
    return { success: false, error: message };
  }
}

/**
 * Fetches the candidate's active single resume record from the database.
 */
export async function getUserActiveResume(): Promise<{
  success: boolean;
  data?: UserPrefResumeRecord | null;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: true, data: null };
    }

    const [record] = await db
      .select()
      .from(userPrefResumes)
      .where(and(eq(userPrefResumes.userId, user.id), eq(userPrefResumes.isPrimary, true)))
      .limit(1);

    return {
      success: true,
      data: record || null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load resume record.";
    console.error("Failed to fetch active resume:", error);
    return {
      success: false,
      data: null,
      error: message,
    };
  }
}


