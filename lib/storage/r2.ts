import { S3Client } from "@aws-sdk/client-s3";

declare global {
  var __r2Client: S3Client | undefined;
}

const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
const jurisdiction = (process.env.R2_JURISDICTION || "us").trim();
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();

const endpoint = jurisdiction
  ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
  : `https://${accountId}.r2.cloudflarestorage.com`;

export const r2Client: S3Client =
  globalThis.__r2Client ??
  (globalThis.__r2Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  }));

export const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME || "").trim();

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

/**
 * Generates a presigned Cloudflare R2 PUT URL for uploading a compiled PDF directly.
 * Object key format: tailored_resumes_pdf/{userId}/{jobId}/{uuid}.pdf
 * Default expiration: 5 minutes (300 seconds).
 */
export async function generateResumeUploadUrl(
  userId: string,
  jobId: string,
  expiresInSeconds = 300
): Promise<{ uploadUrl: string; objectKey: string }> {
  if (!R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME environment variable is not configured.");
  }
  const fileId = crypto.randomUUID();
  const objectKey = `tailored_resumes_pdf/${userId}/${jobId}/${fileId}.pdf`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    ContentType: "application/pdf",
  });

  const uploadUrl = await getSignedUrl(r2Client, command, {
    expiresIn: expiresInSeconds,
  });

  return { uploadUrl, objectKey };
}

/**
 * Generates a presigned Cloudflare R2 GET URL for downloading a compiled PDF.
 * Default expiration: 15 minutes (900 seconds).
 */
export async function generateResumeDownloadUrl(
  objectKey: string,
  customFileName?: string,
  expiresInSeconds = 900
): Promise<string> {
  if (!R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME environment variable is not configured.");
  }
  const cleanName = (customFileName || "Tailored_Resume")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename="${cleanName}.pdf"`,
  });

  return await getSignedUrl(r2Client, command, {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Deletes a compiled PDF object from Cloudflare R2.
 * Used for automatic pruning of older exported revisions for the same job.
 */
export async function deleteResumeObject(objectKey: string): Promise<boolean> {
  if (!R2_BUCKET_NAME || !objectKey) {
    return false;
  }
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
    });
    await r2Client.send(command);
    return true;
  } catch (error) {
    console.error(`[R2 Prune] Failed to delete object ${objectKey}:`, error);
    return false;
  }
}

/**
 * Prunes all older compiled PDF files in Cloudflare R2 for a specific user and job,
 * guaranteeing that ONLY the latest compiled PDF exists in storage.
 */
export async function pruneOldTailoredResumes(
  userId: string,
  jobId: string,
  currentObjectKey: string
): Promise<void> {
  if (!R2_BUCKET_NAME || !userId || !jobId) return;

  const prefixes = [
    `tailored_resumes_pdf/${userId}/${jobId}/`,
    `resumes/${userId}/${jobId}/`,
  ];

  for (const prefix of prefixes) {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
      });
      const listRes = await r2Client.send(listCommand);

      if (listRes.Contents && listRes.Contents.length > 0) {
        const objectsToDelete = listRes.Contents
          .filter((item) => item.Key && item.Key !== currentObjectKey && !item.Key.endsWith("/.keep"))
          .map((item) => ({ Key: item.Key! }));

        if (objectsToDelete.length > 0) {
          console.log(`[R2 Prune] Batch deleting ${objectsToDelete.length} stale PDF(s) for job ${jobId}`);
          await r2Client.send(
            new DeleteObjectsCommand({
              Bucket: R2_BUCKET_NAME,
              Delete: { Objects: objectsToDelete },
            })
          );
        }
      }
    } catch (err) {
      console.warn(`[R2 Prune] Non-fatal error pruning prefix ${prefix}:`, err);
    }
  }
}
