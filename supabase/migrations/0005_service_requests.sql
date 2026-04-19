-- 0005_service_requests.sql
create type request_priority as enum ('low', 'normal', 'high');
create type request_status as enum ('open', 'notified', 'accepted', 'completed', 'cancelled');

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete restrict,
  category text not null,
  priority request_priority not null default 'normal',
  requested_date date not null,
  description text,
  status request_status not null default 'open',
  assigned_volunteer_id uuid references public.volunteers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.admins(id),
  completed_at timestamptz
);

create index service_requests_status_date_idx
  on public.service_requests(status, requested_date);
create index service_requests_assigned_idx
  on public.service_requests(assigned_volunteer_id);

comment on table public.service_requests is 'Service requests from seniors.';
