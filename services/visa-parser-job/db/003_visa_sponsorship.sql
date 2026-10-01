-- Sponsorship evidence is tied to the exact job description reviewed.
ALTER TABLE public.jobs
  ADD COLUMN visa_sponsorship_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN visa_sponsorship_evidence text,
  ADD COLUMN visa_sponsorship_description_hash text,
  ADD COLUMN visa_sponsorship_source text,
  ADD COLUMN visa_sponsorship_assessed_at timestamptz;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_visa_sponsorship_review_check CHECK (
    (visa_sponsorship_status = 'unknown'
      AND visa_sponsorship_evidence IS NULL
      AND visa_sponsorship_description_hash IS NULL
      AND visa_sponsorship_source IS NULL
      AND visa_sponsorship_assessed_at IS NULL)
    OR
    (visa_sponsorship_status IN ('available', 'unavailable', 'conditional')
      AND nullif(btrim(visa_sponsorship_evidence), '') IS NOT NULL
      AND visa_sponsorship_description_hash = md5(job_description)
      AND visa_sponsorship_source IN ('jd_review', 'employer_declared')
      AND visa_sponsorship_assessed_at IS NOT NULL)
  );

CREATE FUNCTION public.sync_job_visa_sponsorship()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.job_description IS DISTINCT FROM OLD.job_description THEN
    NEW.visa_sponsorship_status := 'unknown';
    NEW.visa_sponsorship_evidence := NULL;
    NEW.visa_sponsorship_description_hash := NULL;
    NEW.visa_sponsorship_source := NULL;
    NEW.visa_sponsorship_assessed_at := NULL;
  END IF;
  NEW.visa_sponsorship := (NEW.visa_sponsorship_status = 'available');
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_job_visa_sponsorship
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.sync_job_visa_sponsorship();
