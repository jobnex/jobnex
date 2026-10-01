BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.jobs DROP CONSTRAINT jobs_visa_sponsorship_review_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_visa_sponsorship_review_check CHECK (
  (visa_sponsorship_status = 'unknown' AND visa_sponsorship_evidence IS NULL
    AND visa_sponsorship_description_hash IS NULL AND visa_sponsorship_source IS NULL
    AND visa_sponsorship_assessed_at IS NULL)
  OR (visa_sponsorship_status IN ('available', 'unavailable', 'conditional')
    AND nullif(btrim(visa_sponsorship_evidence), '') IS NOT NULL
    AND visa_sponsorship_description_hash = md5(job_description)
    AND visa_sponsorship_source IN ('jd_review', 'employer_declared', 'jd_parser')
    AND visa_sponsorship_assessed_at IS NOT NULL)
);

CREATE TABLE public.visa_processing_queue (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  last_error text
);
CREATE INDEX visa_processing_due ON public.visa_processing_queue(due_at);

CREATE FUNCTION public.enqueue_job_visa_processing() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.job_description IS DISTINCT FROM OLD.job_description THEN
    INSERT INTO public.visa_processing_queue(job_id) VALUES (NEW.id)
    ON CONFLICT (job_id) DO UPDATE SET due_at = now(), lease_token = NULL,
      attempts = 0, last_error = NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER enqueue_job_visa_processing AFTER INSERT OR UPDATE OF job_description
ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.enqueue_job_visa_processing();

-- Existing human reviews remain authoritative. Recheck all other jobs.
INSERT INTO public.visa_processing_queue(job_id)
SELECT id FROM public.jobs
WHERE visa_sponsorship_source IS NULL OR visa_sponsorship_source = 'jd_parser'
ON CONFLICT (job_id) DO NOTHING;
COMMIT;
