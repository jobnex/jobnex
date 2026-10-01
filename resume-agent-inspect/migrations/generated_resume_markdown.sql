-- Draft for ai job portal / development / neondb.
-- Apply only after the target is confirmed and the backend write path is updated.
-- Existing output rows remain valid with NULL for fields unavailable historically.
BEGIN;
ALTER TABLE public.generated_resumes
    ADD COLUMN IF NOT EXISTS resume_markdown text,
    ADD COLUMN IF NOT EXISTS audit_json jsonb;
COMMIT;
