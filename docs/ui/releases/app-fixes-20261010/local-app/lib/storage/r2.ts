import { S3Client } from "@aws-sdk/client-s3";

declare global {
  var __r2Client: S3Client | undefined;
}

const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
const jurisdiction = (process.env.R2_JURISDICTION || "us").trim();
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();

const endpoint = (process.env.R2_ENDPOINT || "").trim() || (jurisdiction
  ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
  : `https://${accountId}.r2.cloudflarestorage.com`);

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

export const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "").trim();

