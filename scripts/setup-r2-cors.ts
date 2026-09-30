import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

async function setupR2Cors() {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = (process.env.R2_BUCKET_NAME || "").trim();
  const jurisdiction = (process.env.R2_JURISDICTION || "us").trim();

  const endpoint = jurisdiction
    ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
    : `https://${accountId}.r2.cloudflarestorage.com`;

  const s3Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  console.log(`📡 Connecting to Cloudflare R2 (${endpoint}) for bucket: "${bucketName}"...`);

  const corsRules = [
    {
      AllowedOrigins: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://strawberryjobs.com",
        "https://www.strawberryjobs.com",
      ],
      AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ];

  try {
    const putCommand = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: corsRules,
      },
    });

    await s3Client.send(putCommand);
    console.log("✅ Successfully applied CORS configuration to Cloudflare R2!");

    const getCommand = new GetBucketCorsCommand({ Bucket: bucketName });
    const response = await s3Client.send(getCommand);
    console.log("🔍 Verified applied CORS rules:", JSON.stringify(response.CORSRules, null, 2));
  } catch (error: any) {
    console.error("❌ Failed to apply CORS configuration to R2:", error.message || error);
    console.log("\n💡 Note: If token does not have Admin permission to set CORS via API, you can paste CORS into the Cloudflare Dashboard under Bucket -> Settings -> CORS Policy.");
  }
}

setupR2Cors();
