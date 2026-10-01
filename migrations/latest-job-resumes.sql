CREATE TABLE IF NOT EXISTS public.user_job_resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  markdown text NOT NULL DEFAULT '',
  r2_object_key text,
  template_id text NOT NULL,
  theme integer NOT NULL CHECK (theme IN (2,3,5,6)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready')),
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  exported_at timestamptz,
  UNIQUE (user_id, job_id),
  CHECK (r2_object_key IS NULL OR r2_object_key LIKE 'resumes/' || user_id::text || '/' || job_id::text || '/%')
);
-- Default PostgreSQL privileges restrict this new table to its owner.
