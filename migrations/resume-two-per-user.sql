-- Project trail_dev / production / neondb. Apply atomically before new admission.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE public.resume_generation_requests ADD COLUMN IF NOT EXISTS running_slot smallint;

-- Existing schema permits at most one active request per user. Preserve its lease.
UPDATE public.resume_generation_requests SET running_slot=1 WHERE status='running' AND running_slot IS NULL;
ALTER TABLE public.resume_generation_requests ADD CONSTRAINT resume_running_slot_valid
  CHECK ((status='running' AND running_slot IN (1,2) AND running_slot IS NOT NULL)
    OR (status<>'running' AND running_slot IS NULL));
CREATE UNIQUE INDEX resume_two_running_slots ON public.resume_generation_requests(user_id,running_slot)
  WHERE status='running';
CREATE INDEX resume_active_job_lookup ON public.resume_generation_requests(user_id,job_id)
  WHERE status IN ('queued','running');

-- Removes an index only. No request, resume, credit, or user rows are deleted.
DROP INDEX public.resume_one_active_per_user;
COMMIT;
