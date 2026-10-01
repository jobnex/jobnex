-- Safe after migration 005, including databases that ran its first revision.
BEGIN;
ALTER TABLE public.visa_processing_queue ADD COLUMN IF NOT EXISTS lease_token uuid;
CREATE OR REPLACE FUNCTION public.enqueue_job_visa_processing() RETURNS trigger
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
UPDATE public.visa_processing_queue SET due_at = now(), attempts = 0;
COMMIT;
