-- Additive migration for trail_dev / neondb. No existing table or row is changed.
CREATE TABLE public.resume_generations (
    id uuid PRIMARY KEY,
    user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
    job_id uuid NOT NULL REFERENCES public.jobs(id),
    base_resume_id uuid REFERENCES public.user_pref_resumes(id),
    version integer NOT NULL CHECK (version >= 1),
    status text NOT NULL CHECK (status IN
        ('completed', 'completed_with_estimates', 'needs_review', 'failed')),
    resume_markdown text NOT NULL,
    audit_json jsonb NOT NULL CHECK (jsonb_typeof(audit_json) = 'object'),
    source_hash text NOT NULL,
    job_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, job_id, version),
    CHECK (status = 'failed' OR length(btrim(resume_markdown)) > 0)
);
CREATE FUNCTION public.guard_resume_generation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Resume generations cannot be overwritten; create a new generation';
    END IF;
    IF NEW.base_resume_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.user_pref_resumes
        WHERE id = NEW.base_resume_id AND user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'Base resume does not belong to this user';
    END IF;
    IF NEW.audit_json->>'status' IS DISTINCT FROM NEW.status
        OR NEW.audit_json->>'resume_markdown' IS DISTINCT FROM NEW.resume_markdown
        OR NEW.audit_json->>'source_hash' IS DISTINCT FROM NEW.source_hash
        OR NEW.audit_json->>'job_hash' IS DISTINCT FROM NEW.job_hash THEN
        RAISE EXCEPTION 'Resume generation and audit must agree';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id || ':' || NEW.job_id::text, 0));
    SELECT COALESCE(MAX(version), 0) + 1 INTO NEW.version
    FROM public.resume_generations WHERE user_id = NEW.user_id AND job_id = NEW.job_id;
    RETURN NEW;
END;
$$;
CREATE TRIGGER resume_generation_guard BEFORE INSERT OR UPDATE ON public.resume_generations
FOR EACH ROW EXECUTE FUNCTION public.guard_resume_generation();
CREATE TABLE public.resume_generation_submissions (
    application_id uuid PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
    generation_id uuid NOT NULL REFERENCES public.resume_generations(id),
    selected_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.guard_resume_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.applications a JOIN public.resume_generations g
        ON g.user_id = a.user_id AND g.job_id = a.job_id
        WHERE a.id = NEW.application_id AND g.id = NEW.generation_id
        AND g.status IN ('completed', 'completed_with_estimates')
    ) THEN
        RAISE EXCEPTION 'Submitted generation must match the application user/job and pass review';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER resume_submission_guard BEFORE INSERT OR UPDATE
ON public.resume_generation_submissions FOR EACH ROW
EXECUTE FUNCTION public.guard_resume_submission();
REVOKE ALL ON public.resume_generations, public.resume_generation_submissions FROM PUBLIC;
