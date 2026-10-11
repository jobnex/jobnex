-- Provider response recovery across Cloud Tasks deliveries and worker restarts.
CREATE TABLE IF NOT EXISTS public.resume_model_batches (
    request_id uuid NOT NULL REFERENCES public.resume_generation_requests(id) ON DELETE CASCADE,
    body_hash text NOT NULL CHECK (body_hash ~ '^[0-9a-f]{64}$'),
    batch_id text,
    submitted boolean NOT NULL DEFAULT false,
    response jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (request_id, body_hash)
);
ALTER TABLE public.resume_model_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_dispatch_outbox ADD COLUMN IF NOT EXISTS batch_poll_count integer NOT NULL DEFAULT 0;
-- Access remains restricted to the existing trusted backend database role.
