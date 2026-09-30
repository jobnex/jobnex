import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Pool } from "pg";
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL / DIRECT_URL in .env.local");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
const jurisdiction = (process.env.R2_JURISDICTION || "us").trim();
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
const bucketName = (process.env.R2_BUCKET_NAME || "").trim();

const endpoint = jurisdiction
  ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
  : `https://${accountId}.r2.cloudflarestorage.com`;

const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

async function migrate() {
  console.log("🚀 Starting migration: public.resumes -> public.user_pref_resumes & R2 updates...\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // 1. Drop foreign keys on applications and user_job_matches pointing to public.resumes
    console.log("1️⃣ Removing relational constraints pointing to public.resumes...");
    await client.query(`
      ALTER TABLE IF EXISTS "public"."applications" 
      DROP CONSTRAINT IF EXISTS "applications_resume_id_resumes_id_fk";
    `);
    console.log("   ✅ Dropped applications_resume_id_resumes_id_fk");

    await client.query(`
      ALTER TABLE IF EXISTS "public"."user_job_matches" 
      DROP CONSTRAINT IF EXISTS "user_job_matches_resume_id_fkey";
    `);
    console.log("   ✅ Dropped user_job_matches_resume_id_fkey");

    // 2. Rename table public.resumes -> public.user_pref_resumes
    console.log("\n2️⃣ Renaming table public.resumes to public.user_pref_resumes...");
    await client.query(`
      ALTER TABLE IF EXISTS "public"."resumes" 
      RENAME TO "user_pref_resumes";
    `);
    console.log("   ✅ Table renamed to user_pref_resumes");

    // 3. Rename unique index if exists
    await client.query(`
      ALTER INDEX IF EXISTS "idx_resumes_user_id_unique" 
      RENAME TO "idx_user_pref_resumes_user_id_unique";
    `);
    console.log("   ✅ Index renamed to idx_user_pref_resumes_user_id_unique");

    // 4. Ensure foreign key from user_job_preferences to user_pref_resumes is retained and clean
    console.log("\n3️⃣ Retaining connection from user_job_preferences to user_pref_resumes...");
    await client.query(`
      ALTER TABLE IF EXISTS "public"."user_job_preferences"
      DROP CONSTRAINT IF EXISTS "user_job_preferences_active_resume_id_fkey";

      ALTER TABLE IF EXISTS "public"."user_job_preferences"
      ADD CONSTRAINT "user_job_preferences_active_resume_id_fkey"
      FOREIGN KEY ("active_resume_id") 
      REFERENCES "public"."user_pref_resumes"("id") 
      ON DELETE SET NULL;
    `);
    console.log("   ✅ user_job_preferences.active_resume_id FK preserved pointing to user_pref_resumes(id)");

    // 5. Update any existing file keys in user_pref_resumes & user_job_preferences from 'resumes/' to 'user_pref_resumes/'
    console.log("\n4️⃣ Updating file_key paths in database records...");
    await client.query(`
      UPDATE "user_pref_resumes"
      SET file_key = REPLACE(file_key, 'resumes/', 'user_pref_resumes/'),
          file_url = REPLACE(file_url, 'resumes/', 'user_pref_resumes/')
      WHERE file_key LIKE 'resumes/%' OR file_url LIKE 'resumes/%';
    `);

    await client.query(`
      UPDATE "user_job_preferences"
      SET preferences = jsonb_set(
        preferences,
        '{resumeFileKey}',
        to_jsonb(REPLACE(preferences->>'resumeFileKey', 'resumes/', 'user_pref_resumes/'))
      )
      WHERE preferences->>'resumeFileKey' LIKE 'resumes/%';
    `);
    console.log("   ✅ Database file paths updated to 'user_pref_resumes/'");

    await client.query("COMMIT;");
    console.log("\n✅ Database transaction successfully committed!");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Database migration failed, rolled back:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  // 6. R2 Storage Migration
  console.log("\n5️⃣ Starting Cloudflare R2 updates...");

  // A. Migrate any existing files with 'resumes/' prefix to 'user_pref_resumes/'
  const listOld = await r2.send(new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: "resumes/",
  }));

  if (listOld.Contents && listOld.Contents.length > 0) {
    for (const item of listOld.Contents) {
      if (item.Key) {
        const newKey = item.Key.replace(/^resumes\//, "user_pref_resumes/");
        console.log(`   📦 Moving R2 object: "${item.Key}" -> "${newKey}"`);
        
        await r2.send(new CopyObjectCommand({
          Bucket: bucketName,
          CopySource: `${bucketName}/${item.Key}`,
          Key: newKey,
        }));

        await r2.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: item.Key,
        }));
        console.log(`   ✅ Migrated to "${newKey}"`);
      }
    }
  } else {
    console.log("   No existing files found under prefix 'resumes/'");
  }

  // B. Create a persistent folder marker in R2 so user_pref_resumes directory is NEVER deleted even if all files are deleted
  console.log("\n6️⃣ Creating persistent directory marker 'user_pref_resumes/.keep'...");
  await r2.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: "user_pref_resumes/.keep",
    Body: Buffer.from(""),
    ContentType: "application/x-directory",
  }));
  console.log("   ✅ Directory marker created. The 'user_pref_resumes' folder will remain in R2 even when all resumes are deleted.");

  // C. Delete 'test-strawberry.txt' if present
  console.log("\n7️⃣ Checking and removing 'test-strawberry.txt'...");
  try {
    await r2.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: "test-strawberry.txt",
    }));
    console.log("   ✅ Deleted unnecessary test file: 'test-strawberry.txt'");
  } catch (e: any) {
    console.log("   Could not delete test-strawberry.txt:", e.message);
  }

  // Final check of R2 bucket contents
  console.log("\n📋 Final R2 bucket objects:");
  const finalR2 = await r2.send(new ListObjectsV2Command({ Bucket: bucketName }));
  for (const item of finalR2.Contents || []) {
    console.log(`   - ${item.Key} (${item.Size} bytes)`);
  }

  console.log("\n🎉 Migration completed successfully!\n");
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
