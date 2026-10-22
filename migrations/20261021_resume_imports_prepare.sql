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
COMMIT;
