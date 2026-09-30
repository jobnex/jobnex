import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  console.log("🚀 Starting database transaction to restore public.resumes and switch relations...");

  try {
    await client.query("BEGIN;");

    // 1. Drop matching_resume_change trigger from user_pref_resumes
    console.log("1️⃣ Dropping matching_resume_change trigger from user_pref_resumes...");
    await client.query(`
      DROP TRIGGER IF EXISTS matching_resume_change ON public.user_pref_resumes;
    `);

    // 2. Create public.resumes table exactly as it was
    console.log("2️⃣ Creating table public.resumes...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.resumes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT false,
        content TEXT,
        parsed_data JSONB DEFAULT '{}'::jsonb,
        file_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 3. Attach matching_resume_change trigger to public.resumes
    console.log("3️⃣ Creating matching_resume_change trigger on public.resumes...");
    await client.query(`
      DROP TRIGGER IF EXISTS matching_resume_change ON public.resumes;
      CREATE TRIGGER matching_resume_change
      AFTER INSERT OR UPDATE OR DELETE ON public.resumes
      FOR EACH ROW EXECUTE FUNCTION matching.capture_change();
    `);

    // 4. Restore row ceb90ae9-b4e3-4252-85fa-1e790788c639 into public.resumes
    console.log("4️⃣ Restoring original seed resume into public.resumes...");
    await client.query(`
      INSERT INTO public.resumes (id, user_id, title, is_primary, content, parsed_data, file_url, created_at, updated_at)
      SELECT id, user_id, title, is_primary, content, parsed_data, file_url, created_at, updated_at
      FROM public.user_pref_resumes
      WHERE id = 'ceb90ae9-b4e3-4252-85fa-1e790788c639'
      ON CONFLICT (id) DO NOTHING;
    `);

    // 5. Switch foreign key on matching.results: point to public.resumes(id)
    console.log("5️⃣ Updating matching.results foreign key to reference public.resumes(id)...");
    await client.query(`
      ALTER TABLE matching.results 
      DROP CONSTRAINT IF EXISTS results_resume_id_fkey;
    `);

    await client.query(`
      ALTER TABLE matching.results 
      ADD CONSTRAINT results_resume_id_fkey 
      FOREIGN KEY (resume_id) REFERENCES public.resumes(id) ON DELETE CASCADE;
    `);

    // 6. Update matching.resumes view to reference public.resumes
    console.log("6️⃣ Re-pointing matching.resumes view to public.resumes...");
    await client.query(`
      CREATE OR REPLACE VIEW matching.resumes AS
      SELECT id,
             user_id,
             content,
             encode(sha256(convert_to(content, 'UTF8'::name)), 'hex'::text) AS hash
      FROM public.resumes r
      WHERE (is_primary AND (length(TRIM(BOTH FROM content)) > 0) AND (NOT (EXISTS ( SELECT 1
               FROM public.resumes other
              WHERE ((other.user_id = r.user_id) AND other.is_primary AND (other.id <> r.id))))));
    `);

    // 7. Remove the seed demo row from user_pref_resumes
    console.log("7️⃣ Removing demo seed row from user_pref_resumes...");
    await client.query(`
      DELETE FROM public.user_pref_resumes 
      WHERE id = 'ceb90ae9-b4e3-4252-85fa-1e790788c639';
    `);

    await client.query("COMMIT;");
    console.log("✅ All changes committed successfully!\n");

    // Verification
    console.log("=== Verification ===");
    const resCount = await client.query("SELECT COUNT(*) FROM public.resumes;");
    console.log("Rows in public.resumes:", resCount.rows[0].count);

    const prefCount = await client.query("SELECT COUNT(*) FROM public.user_pref_resumes;");
    console.log("Rows in public.user_pref_resumes:", prefCount.rows[0].count);

    const matchCheck = await client.query(`
      SELECT COUNT(*) 
      FROM matching.results r 
      JOIN public.resumes res ON r.resume_id = res.id;
    `);
    console.log("matching.results joining public.resumes count:", matchCheck.rows[0].count);

    const viewCheck = await client.query("SELECT * FROM matching.resumes;");
    console.log("matching.resumes view rows:", viewCheck.rows.length);

    const fks = await client.query(`
      SELECT
          tc.table_schema, 
          tc.table_name, 
          kcu.column_name, 
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          tc.constraint_name
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND (ccu.table_name IN ('resumes', 'user_pref_resumes') OR tc.table_name = 'results');
    `);
    console.log("Foreign keys verification:");
    console.table(fks.rows);

  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Migration failed and rolled back:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
