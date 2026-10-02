CREATE TABLE IF NOT EXISTS public.job_experience_processing (
    job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
    pending boolean NOT NULL DEFAULT true,
    description_hash text,
    extracted_years integer CHECK (extracted_years BETWEEN 0 AND 40),
    owns_value boolean NOT NULL DEFAULT false,
    evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
    reason text,
    parser_version text,
    processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS job_experience_pending_idx
    ON public.job_experience_processing (job_id) WHERE pending;
CREATE OR REPLACE FUNCTION public.enqueue_job_experience_processing()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.job_experience_processing(job_id) VALUES(NEW.id)
            ON CONFLICT(job_id) DO UPDATE SET pending=true;
    ELSIF NEW.job_description IS DISTINCT FROM OLD.job_description
       OR (NEW.status='published' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.job_experience_processing(job_id) VALUES(NEW.id)
            ON CONFLICT(job_id) DO UPDATE SET pending=true;
    END IF;
    RETURN NEW;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
        WHERE tgrelid='public.jobs'::regclass AND tgname='enqueue_job_experience_processing') THEN
        CREATE TRIGGER enqueue_job_experience_processing
        AFTER INSERT OR UPDATE OF job_description,status ON public.jobs
        FOR EACH ROW EXECUTE FUNCTION public.enqueue_job_experience_processing();
    END IF;
END $$;
INSERT INTO public.job_experience_processing(job_id)
    SELECT id FROM public.jobs ON CONFLICT(job_id) DO NOTHING;
