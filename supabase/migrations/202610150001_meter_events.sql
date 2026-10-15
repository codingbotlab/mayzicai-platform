-- MayzicAI usage meter foundation (initial schema)
-- Apply only to a NEW, dedicated MayzicAI Supabase project.
-- No real payments or price charging are implemented by this schema.

create extension if not exists pgcrypto;

create table if not exists public.meter_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  product_code text not null,
  account_id uuid,
  service_code text not null,
  unit text not null,
  quantity numeric(20,6) not null check (quantity > 0),
  estimated_cost_minor bigint not null default 0 check (estimated_cost_minor >= 0),
  currency char(3) not null default 'INR',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists meter_events_occurred_at_idx
  on public.meter_events (occurred_at desc);
create index if not exists meter_events_product_time_idx
  on public.meter_events (product_code, occurred_at desc);
create index if not exists meter_events_account_time_idx
  on public.meter_events (account_id, occurred_at desc);

-- Usage events are append-only for ordinary API roles.
-- Enable RLS now; policies should be added only after the auth/account model is defined.
alter table public.meter_events enable row level security;

comment on table public.meter_events is
  'Append-only usage ledger. estimated_cost_minor is an estimate, not a customer charge.';
comment on column public.meter_events.request_id is
  'Idempotency key: unique per billable request to prevent duplicate event ingestion.';
