BEGIN;
ALTER TABLE public.resume_generation_requests ADD COLUMN IF NOT EXISTS publication_contract text NOT NULL DEFAULT 'legacy';
CREATE TABLE IF NOT EXISTS public.resume_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  job_id uuid NOT NULL,
  generation_id uuid NOT NULL REFERENCES public.resume_generations(id),
  revision integer NOT NULL CHECK (revision > 0),
  source_import_id uuid NOT NULL REFERENCES public.resume_imports(id),
  document_json jsonb NOT NULL CHECK(document_json->>'schemaVersion'='ResumeDocumentV1'),
  document_hash text NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'),
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  audit_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(generation_id,revision)
);
CREATE INDEX IF NOT EXISTS resume_document_owner_job ON public.resume_document_versions(user_id,job_id,generation_id,revision DESC);
CREATE TABLE IF NOT EXISTS public.resume_publication_certifications (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  job_id uuid NOT NULL,
  generation_id uuid NOT NULL REFERENCES public.resume_generations(id),
  document_revision integer NOT NULL CHECK(document_revision>0),
  document_hash text NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'),
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  template_id text NOT NULL CHECK(template_id IN ('mit-capd','modern-ivy','tech-specialist','minimalist-exec')),
  template_version text NOT NULL,
  renderer_version text NOT NULL,
  policy_version text NOT NULL,
  pdf_sha256 text,
  r2_object_key text,
  file_size integer,
  status text NOT NULL CHECK(status IN ('ready','blocked')),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_map jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(status<>'ready' OR (pdf_sha256 ~ '^[a-f0-9]{64}$' AND r2_object_key IS NOT NULL AND file_size>0 AND issues='[]'::jsonb))
);
CREATE INDEX IF NOT EXISTS resume_certification_lookup ON public.resume_publication_certifications(user_id,job_id,generation_id,document_revision,template_id,created_at DESC);

-- Required checks never inherit the legacy manual-review exceptions.
CREATE OR REPLACE FUNCTION public.resume_document_audit_valid(audit jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(audit#>'{certificationChecks,schema}'='true'::jsonb
   AND audit#>'{certificationChecks,source}'='true'::jsonb
   AND audit#>'{certificationChecks,factual}'='true'::jsonb
   AND jsonb_typeof(audit->'source_document')='object'
   AND audit->>'status' IN ('completed','completed_with_estimates')
   AND jsonb_typeof(audit->'compliance_ledger')='array'
   AND jsonb_array_length(CASE WHEN jsonb_typeof(audit->'compliance_ledger')='array' THEN audit->'compliance_ledger' ELSE '[]'::jsonb END)>0
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(audit->'compliance_ledger')='array' THEN audit->'compliance_ledger' ELSE '[]'::jsonb END) c
     WHERE NOT COALESCE(jsonb_typeof(c->'code')='string' AND length(c->>'code')>0 AND jsonb_typeof(c->'passed')='boolean' AND c->>'severity' IN ('error','warning','info')
       AND (c->'passed'='true'::jsonb OR c->>'severity'<>'error'),false)),false)
$$;
CREATE OR REPLACE FUNCTION public.resume_certification_current(owner_id text,selected_job uuid,artifact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.resume_publication_certifications c
   JOIN public.resume_document_versions d ON d.user_id=c.user_id AND d.job_id=c.job_id AND d.generation_id=c.generation_id AND d.revision=c.document_revision
   JOIN public.resume_generations g ON g.id=d.generation_id AND g.user_id=d.user_id AND g.job_id=d.job_id
   JOIN public.resume_generation_requests r ON r.id=g.id AND r.user_id=g.user_id AND r.job_id=g.job_id
   JOIN public.resume_imports i ON i.id=d.source_import_id AND i.user_id=d.user_id
   WHERE c.id=artifact_id AND c.user_id=owner_id AND c.job_id=selected_job AND c.status='ready'
     AND c.document_hash=d.document_hash AND c.source_hash=d.source_hash
     AND c.pdf_sha256 ~ '^[a-f0-9]{64}$' AND c.r2_object_key IS NOT NULL AND c.file_size>0
     AND c.issues='[]'::jsonb AND c.policy_version='certified-resume-v1'
     AND c.renderer_version='certified-typst-v1' AND c.template_version='resume-typst-v1'
     AND public.resume_document_audit_valid(d.audit_json)
     AND r.status IN ('completed','needs_review') AND r.credit_state='consumed'
     AND r.publication_contract='certified-v1'
     AND r.source_import_id=d.source_import_id
     AND g.status IN ('completed','completed_with_estimates','needs_review')
     AND i.status='confirmed' AND d.document_json#>>'{source,revision}'=i.id::text
     AND d.document_json#>>'{source,fileSha256}'=i.file_sha256
     AND NOT EXISTS(SELECT 1 FROM public.resume_document_versions newer WHERE newer.generation_id=d.generation_id AND newer.revision>d.revision)
     AND NOT EXISTS(SELECT 1 FROM public.resume_generations newer WHERE newer.user_id=g.user_id AND newer.job_id=g.job_id AND (newer.version>g.version OR (newer.version=g.version AND newer.created_at>g.created_at))))
$$;
COMMIT;
