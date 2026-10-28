BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.resume_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  object_key text NOT NULL,
  file_name text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  baseline_key text,
  baseline_content_sha256 text,
  baseline_cleaned_at timestamptz,
  status text NOT NULL CHECK(status IN ('parsing','accepted','rejected','confirmed','cancelled','expired')),
  revision integer NOT NULL DEFAULT 1,
  validator_version text,
  file_sha256 text,
  content_sha256 text,
  markdown text,
  parsed_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  confirmed_at timestamptz,
  cleaned_at timestamptz
);
ALTER TABLE public.resume_imports ADD COLUMN IF NOT EXISTS baseline_cleaned_at timestamptz;
ALTER TABLE public.resume_imports ADD COLUMN IF NOT EXISTS baseline_content_sha256 text;
ALTER TABLE public.resume_imports DROP CONSTRAINT IF EXISTS resume_imports_user_id_object_key_key;
CREATE INDEX IF NOT EXISTS resume_import_file_lookup ON public.resume_imports(user_id,object_key);
CREATE INDEX IF NOT EXISTS resume_import_cleanup ON public.resume_imports(expires_at) WHERE cleaned_at IS NULL;
-- Admission checks are shared by request creation and the worker. A stored
-- snapshot stays verifiable even if the active base is subsequently replaced.
CREATE OR REPLACE FUNCTION public.resume_source_is_admitted(candidate_user text, candidate_source text, candidate_import uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM public.resume_imports i
   WHERE i.id=candidate_import AND i.user_id=candidate_user AND i.status='confirmed'
     AND i.validator_version='single-column-v1'
     AND i.content_sha256=encode(digest(replace(replace(candidate_source,E'\r\n',E'\n'),E'\r',E'\n'),'sha256'),'hex'))
$$;
ALTER TABLE public.resume_generation_requests ADD COLUMN IF NOT EXISTS source_import_id uuid REFERENCES public.resume_imports(id);
CREATE OR REPLACE FUNCTION public.enforce_resume_source_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE admitted_import uuid;
BEGIN
  SELECT i.id INTO admitted_import FROM public.user_pref_resumes r
    JOIN public.user_job_preferences p ON p.user_id=r.user_id AND p.active_resume_id=r.id
    JOIN public.resume_imports i ON i.user_id=r.user_id AND i.object_key=r.file_key
   WHERE r.id=NEW.base_resume_id AND r.user_id=NEW.user_id::text
     AND r.content=NEW.source_text AND i.status='confirmed'
     AND public.resume_source_is_admitted(NEW.user_id::text,NEW.source_text,i.id)
   LIMIT 1;
  IF admitted_import IS NULL THEN
    RAISE EXCEPTION 'Resume requires supported-format validation and confirmation' USING ERRCODE='23514';
  END IF;
  NEW.source_import_id := admitted_import;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS resume_source_admission ON public.resume_generation_requests;
CREATE TRIGGER resume_source_admission BEFORE INSERT ON public.resume_generation_requests
 FOR EACH ROW EXECUTE FUNCTION public.enforce_resume_source_admission();
COMMIT;
