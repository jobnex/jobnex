"use server";

import { profileService } from "@/lib/profile-service";

import {
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
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

export async function commitResumeUpload({ objectKey, fileName }: CommitResumeParams): Promise<{
  success: boolean; data?: typeof userPrefResumes.$inferSelect; error?: string; cleanupPending?: boolean;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required." };
    const prefix = "user_pref_resumes/" + user.id + "/";
    if (!objectKey?.startsWith(prefix) || objectKey.includes("..")) return { success: false, error: "Unauthorized file key." };
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }));
    if (!head.ContentLength || head.ContentLength > 10 * 1024 * 1024) throw new Error("Upload a nonempty resume up to 10 MB.");
    const object = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey, Range: "bytes=0-7" }));
    const signature = await object.Body?.transformToByteArray();
    const pdf = fileName.toLowerCase().endsWith(".pdf") && signature && Buffer.from(signature).subarray(0,5).toString() === "%PDF-";
    const docx = fileName.toLowerCase().endsWith(".docx") && signature?.[0] === 0x50 && signature?.[1] === 0x4b;
    if (!pdf && !docx) throw new Error("The file contents do not match a PDF or DOCX resume.");
    // Parse before replacement: malformed/image-only files must not detach a working base.
    const downloadUrl = await getSignedUrl(r2Client, new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }), { expiresIn: 120 });
    await profileService(user.id, "/profile/resume-from-r2", { objectKey, fileName, downloadUrl, validateOnly: true });
    const committed = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id},0))`);
      const pending = await tx.execute(sql`SELECT id FROM resume_generation_requests WHERE user_id=${user.id}
        AND status IN ('queued','running') LIMIT 1`);
      if (pending.rows.length) throw new Error("Wait for generation to finish before replacing your base resume.");
      const [previous] = await tx.select().from(userPrefResumes).where(eq(userPrefResumes.userId,user.id)).limit(1);
      const now = new Date();
      const changed = previous?.fileKey !== objectKey;
      const [saved] = await tx.insert(userPrefResumes).values({
        userId:user.id,title:fileName,fileName,fileKey:objectKey,fileUrl:objectKey,fileSize:head.ContentLength,isPrimary:true,updatedAt:now,
      }).onConflictDoUpdate({ target:userPrefResumes.userId, set:{
        title:fileName,fileName,fileKey:objectKey,fileUrl:objectKey,fileSize:head.ContentLength,isPrimary:true,updatedAt:now,
        ...(changed ? { content:null, parsedData:{} } : {}),
      }}).returning();
      await tx.insert(userJobPreferences).values({ userId:user.id }).onConflictDoNothing();
      const updates = JSON.stringify({ resumeUploaded:true,resumeFileName:fileName,resumeFileKey:objectKey });
      await tx.execute(sql`UPDATE user_job_preferences SET active_resume_id=${saved.id},
        resume_details=CASE WHEN ${changed} THEN '{}'::jsonb ELSE resume_details END,
        preferences=COALESCE(preferences,'{}'::jsonb) || ${updates}::jsonb ||
          jsonb_build_object('isConfirmed',false,'lastConfirmedPreferences',
            COALESCE(NULLIF(preferences->'lastConfirmedPreferences','null'::jsonb),preferences-'isConfirmed'-'confirmedAt')),
        updated_at=now() WHERE user_id=${user.id}`);
      return { saved, previousKey: previous?.fileKey };
    });
    let cleanupPending = false;
    if (committed.previousKey && committed.previousKey !== objectKey && committed.previousKey.startsWith(prefix)) {
      try { await r2Client.send(new DeleteObjectCommand({ Bucket:R2_BUCKET_NAME,Key:committed.previousKey })); }
      catch { cleanupPending=true; console.error("Detached resume file cleanup pending"); }
    }
    revalidatePath("/job-hunt/manage"); revalidatePath("/job-hunt");
    return { success:true,data:committed.saved,cleanupPending };
  } catch(error) {
    return { success:false,error:error instanceof Error ? error.message : "Could not save the uploaded resume." };
  }
}

export async function deleteUserResume(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.id) {
      return { success: false, error: "Authentication required." };
    }

    const expectedPrefix = `user_pref_resumes/${user.id}/`;

    // Commit database removal before touching files. Historical audits remain intact.
    const removedKeys = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id},0))`);
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


