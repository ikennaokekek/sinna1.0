CREATE TABLE public.worker_job_completions (
  queue_name text NOT NULL,
  job_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  minutes_used integer NOT NULL DEFAULT 0 CHECK (minutes_used >= 0),
  egress_bytes bigint NOT NULL DEFAULT 0 CHECK (egress_bytes >= 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (queue_name, job_id)
);

CREATE INDEX idx_worker_job_completions_tenant_completed
  ON public.worker_job_completions (tenant_id, completed_at DESC);