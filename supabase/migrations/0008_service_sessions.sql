-- 0008_service_sessions.sql
-- Phase 2 placeholder. Schema present; no UI writes to this in Phase 1.
create table public.service_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_lat numeric,
  start_lng numeric,
  end_lat numeric,
  end_lng numeric,
  distance_km numeric,
  cost numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_sessions_request_idx on public.service_sessions(request_id);
create index service_sessions_volunteer_idx on public.service_sessions(volunteer_id);

comment on table public.service_sessions is 'Phase 2: mobile session tracking (mileage, cost).';
