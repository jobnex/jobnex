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
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { preferenceWrite } from "@/lib/db/preferences-confirmation";
import { profileService } from "@/lib/profile-service";

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
  } catch (error: any) {
    console.error("Failed to generate presigned upload URL:", error);
    return {
      success: false,
      error: error?.message || "Failed to generate upload URL.",
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
  } catch (error: any) {
    console.error("Failed to generate presigned download URL:", error);
    return {
      success: false,
      error: error?.message || "Failed to generate download URL.",
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
 */
export async function getAllTemplatePresignedUrls(): Promise<{
  success: boolean;
  data?: TemplateAssetUrls;
  error?: string;
}> {
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
  } catch (error: any) {
    console.error("Failed to generate template presigned URLs:", error);
    return {
      success: false,
      error: error?.message || "Failed to load template assets.",
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
  } catch (error: any) {
    console.error("Failed to delete storage object:", error);
    return { success: false, error: error?.message || "Failed to delete file." };
  }
}

export interface CommitResumeParams {
  objectKey: string;
  fileName: string;
  fileSize?: number;
}

/**
 * Validates a staged upload before atomically replacing the active resume.
 * Prior cloud objects remain recoverable until ownership-aware cleanup.
 */
export async function commitResumeUpload({
  objectKey,
  fileName,
  fileSize,
}: CommitResumeParams): Promise<{
  success: boolean;
  data?: any;
  extraction?: { preferences: any; resume_details: any };
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

    // Parse the staged file before replacing metadata or pruning the active file.
    const signed = await getPresignedDownloadUrl(objectKey);
    if (!signed.success || !signed.downloadUrl) {
      return { success: false, error: "Could not read the uploaded resume. Your current resume is unchanged." };
    }
    const validation = await profileService(user.id, "/profile/resume-from-r2", {
      objectKey, fileName, downloadUrl: signed.downloadUrl, validateOnly: true,
    });
    if (validation.valid !== true) {
      return { success: false, error: validation.detail || "Resume validation failed. Your current resume is unchanged." };
    }

    if (!validation.resume_details || typeof validation.resume_details !== "object" ||
        typeof validation.markdown !== "string" || !validation.markdown.trim() ||
        typeof validation.fileSha256 !== "string" || !/^[a-f0-9]{64}$/.test(validation.fileSha256)) {
      return { success: false, error: "Parser update required. Your current resume is unchanged." };
    }
    // Browser PUT URLs remain reusable briefly. Activate a server-only copy of
    // the exact validated bytes, rather than that mutable staging object.
    const staged = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }));
    if (!staged.Body || !staged.ContentLength || staged.ContentLength > 10 * 1024 * 1024) {
      throw new Error("Invalid resume size. Your current resume is unchanged.");
    }
    const bytes = await staged.Body.transformToByteArray();
    if (bytes.length > 10 * 1024 * 1024 || crypto.createHash("sha256").update(bytes).digest("hex") !== validation.fileSha256) {
      throw new Error("The uploaded resume changed during validation. Upload it again.");
    }
    const extension = fileName.toLowerCase().endsWith(".docx") ? ".docx" : ".pdf";
    objectKey = `${expectedPrefix}${crypto.randomUUID()}${extension}`;
    await r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey, Body: bytes,
      ContentType: extension === ".pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const now = new Date();
    const cleanFileName = fileName || "Uploaded_Resume.pdf";
    const details = validation.resume_details;
    const savedResume = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id},0))`);
      const busy = await tx.execute(sql`SELECT id FROM resume_generation_requests WHERE user_id=${user.id} AND status IN ('queued','running') LIMIT 1`);
      if (busy.rows.length) throw new Error("Wait for resume generation to finish before changing the base resume");
      const [existingPref] = await tx.select().from(userJobPreferences)
        .where(eq(userJobPreferences.userId,user.id)).limit(1);
      const inferred = validation.preferences || {};
      const updates: Record<string, unknown> = {
        resumeUploaded: true, resumeFileName: cleanFileName, resumeFileKey: objectKey,
      };
      if (existingPref?.preferences?.autofillFromResume !== false) {
        for (const field of ['cities','skills','domains']) updates[field] = Array.isArray(inferred[field]) ? inferred[field] : [];
        for (const field of ['country','currency','seniority','experienceYears']) updates[field] = inferred[field] ?? null;
      }
      const values = {
        title: cleanFileName, fileName: cleanFileName, fileKey: objectKey,
        fileSize: bytes.length, fileUrl: objectKey, isPrimary: true,
        content: validation.markdown, parsedData: details, updatedAt: now,
      };
      const [saved] = await tx.insert(userPrefResumes).values({userId:user.id,...values})
        .onConflictDoUpdate({target:userPrefResumes.userId,set:values}).returning();
      await tx.insert(userJobPreferences).values({userId:user.id,activeResumeId:saved.id,
        preferences:updates,resumeDetails:details,updatedAt:now})
        .onConflictDoUpdate({target:userJobPreferences.userId,set:{activeResumeId:saved.id,
          preferences:preferenceWrite(updates),resumeDetails:details,updatedAt:now}});
      return saved;
    });
    // Keep previous objects recoverable. Cleanup must verify active ownership
    // under the same user lock; pruning all objects here races another upload.

    revalidatePath("/job-hunt/manage");
    revalidatePath("/job-hunt");
    revalidatePath("/(main)/job-hunt/manage", "page");

    return {
      success: true,
      data: savedResume,
      extraction: { preferences: validation.preferences, resume_details: details },
    };
  } catch (error: any) {
    console.error("Failed to commit resume upload:", error);
    return {
      success: false,
      error: error?.message || "Failed to register resume in database.",
    };
  }
}

/**
 * Permanently deletes the candidate's active resume from Cloudflare R2
 * and clears the record in PostgreSQL.
 * Guarantees zero orphaned files remain in the cloud while preserving
 * the persistent folder marker in the bucket.
 */
export async function deleteUserResume(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, error: "Authentication required." };
    }

    const expectedPrefix = `user_pref_resumes/${user.id}/`;

    // 1. Purge all files in Cloudflare R2 under user_pref_resumes/{user.id}/
    // (Never purges the root user_pref_resumes/.keep folder marker)
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: expectedPrefix,
      });
      const listRes = await r2Client.send(listCommand);
      if (listRes.Contents && listRes.Contents.length > 0) {
        for (const item of listRes.Contents) {
          if (item.Key && !item.Key.endsWith("/.keep")) {
            console.log(`[R2 Delete] Removing resume: ${item.Key}`);
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
      console.error("Failed to purge R2 files on resume delete:", r2Err);
    }

    // 2. Remove from 'user_pref_resumes' table
    await db.delete(userPrefResumes).where(eq(userPrefResumes.userId, user.id));

    // 3. Clear active_resume_id and JSON fields in user_job_preferences
    const [existingPref] = await db
      .select()
      .from(userJobPreferences)
      .where(eq(userJobPreferences.userId, user.id))
      .limit(1);

    if (existingPref) {
      await db
        .update(userJobPreferences)
        .set({
          activeResumeId: null,
          preferences: preferenceWrite({ resumeUploaded: false, resumeFileName: null, resumeFileKey: null }),
          updatedAt: new Date(),
        })
        .where(eq(userJobPreferences.userId, user.id));
    }

    revalidatePath("/job-hunt/manage");
    revalidatePath("/job-hunt");
    revalidatePath("/(main)/job-hunt/manage", "page");

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete user resume:", error);
    return { success: false, error: error?.message || "Failed to delete resume." };
  }
}

/**
 * Fetches the candidate's active single resume record from the database.
 */
export async function getUserActiveResume(): Promise<{
  success: boolean;
  data?: any;
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
      .where(eq(userPrefResumes.userId, user.id))
      .limit(1);

    return {
      success: true,
      data: record || null,
    };
  } catch (error: any) {
    console.error("Failed to fetch active resume:", error);
    return {
      success: false,
      data: null,
      error: error?.message || "Failed to load resume record.",
    };
  }
}

