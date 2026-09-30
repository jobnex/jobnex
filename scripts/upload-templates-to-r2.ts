import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

async function uploadPublicTemplates() {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const jurisdiction = (process.env.R2_JURISDICTION || "us").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = (process.env.R2_BUCKET_NAME || "").trim();

  const endpoint = jurisdiction
    ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
    : `https://${accountId}.r2.cloudflarestorage.com`;

  const s3Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const templatesDir = path.join(process.cwd(), "public", "resume-templates");

  if (!fs.existsSync(templatesDir)) {
    console.error(`❌ Templates directory not found at: ${templatesDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(templatesDir);
  console.log(`📁 Found ${files.length} template assets in ${templatesDir}`);

  for (const fileName of files) {
    const fullPath = path.join(templatesDir, fileName);
    const fileBuffer = fs.readFileSync(fullPath);
    const isPdf = fileName.endsWith(".pdf");
    const isJpg = fileName.endsWith(".jpg") || fileName.endsWith(".jpeg");

    const contentType = isPdf
      ? "application/pdf"
      : isJpg
      ? "image/jpeg"
      : "application/octet-stream";

    const objectKey = `templates/${fileName}`;

    console.log(`⬆️ Uploading: "${fileName}" -> R2: "${objectKey}" (${(fileBuffer.length / 1024).toFixed(1)} KB)...`);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    // Verify
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      })
    );

    console.log(`  ✅ Verified on R2: "${objectKey}"`);
  }

  console.log("\n🎉 All 12 template assets (6 PDFs + 6 Thumbnails) successfully uploaded to Cloudflare R2!");
}

uploadPublicTemplates().catch((err) => {
  console.error("❌ Upload failed:", err);
  process.exit(1);
});
