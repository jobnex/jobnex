BEGIN;
CREATE TABLE IF NOT EXISTS public.resume_dispatch_outbox (
  request_id uuid PRIMARY KEY REFERENCES public.resume_generation_requests(id),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resume_dispatch_due ON public.resume_dispatch_outbox(next_attempt_at);
INSERT INTO public.resume_dispatch_outbox(request_id)
SELECT id FROM public.resume_generation_requests WHERE status='queued'
ON CONFLICT DO NOTHING;
COMMIT;
