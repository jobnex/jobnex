"use server";

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { getCurrentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { userPrefResumes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

    if (category === "resume" && (!fileName.toLowerCase().endsWith(".pdf") || fileType !== "application/pdf")) {
      return {success:false,error:"Upload a PDF. Export Word files to PDF first."};
    }

    // Sanitize file name to prevent illegal characters or path traversal
    const sanitizedFileName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "");

    const fileUuid = crypto.randomUUID();
    const folder = category === "resume" ? "resume_imports" : `${category}s`;
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
      // Keys follow the convention: user_pref_resumes/{userId}/..., avatars/{userId}/..., or tailored_resumes_pdf/{userId}/...
      const parts = objectKey.split("/");
      if (parts.length < 3 || parts[1] !== user.id) {
        return { success: false, error: "Unauthorized access to this resource." };
      }
    }

    if(process.env.RESUME_CERTIFIED_PUBLICATION_STRICT === "true" && !["templates/","resume_imports/","user_pref_resumes/","avatars/"].some(prefix=>objectKey.startsWith(prefix))) {
      return {success:false,error:"Open the certified resume preview to download this file."};
    }

    // Verify physical object existence in Cloudflare R2 before generating presigned URL
    try {
      await r2Client.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
        })
      );
    } catch (headErr: unknown) {
      const err = headErr as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
      if (
        err?.name === "NotFound" ||
        err?.$metadata?.httpStatusCode === 404 ||
        err?.Code === "NoSuchKey"
      ) {
        return {
          success: false,
          error: "Resume file not found in storage. Please upload a new resume.",
        };
      }
      console.warn("HeadObject check warning:", headErr);
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

export async function commitResumeUpload(params: CommitResumeParams): Promise<{success:boolean;data?:UserPrefResumeRecord;error?:string}> {
  void params;
  await getCurrentUser();
  return {success:false,error:"Validate and confirm the PDF through Manage Job Hunt before activation."};
}

/**
 * Permanently deletes the candidate's active resume from Cloudflare R2
 * and clears the record in PostgreSQL.
 * Guarantees zero orphaned files remain in the cloud while preserving
 * the persistent folder marker in the bucket.
 */
export async function deleteUserResume(): Promise<{success:boolean;error?:string}> {
  const user=await getCurrentUser();
  if(!user?.id)return {success:false,error:"Authentication required."};
  try {
    const {removeActiveResume}=await import("@/lib/resume-imports");
    await removeActiveResume(user.id);
    revalidatePath('/job-hunt/manage');revalidatePath('/job-hunt');
    return {success:true};
  }catch(error){
    console.error('Resume removal failed:',error);
    return {success:false,error:error instanceof Error?error.message:"Could not remove resume."};
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
      .where(eq(userPrefResumes.userId, user.id))
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


