-- 0021_requested_at_timestamptz.sql
-- Replace `requested_date date` with `requested_at timestamptz`.
-- Dev-only data migrates as: noon local America/Toronto on the same calendar day.

drop index if exists public.service_requests_status_date_idx;

alter table public.service_requests add column requested_at timestamptz;

update public.service_requests
set requested_at = (requested_date::timestamp at time zone 'America/Toronto') + interval '12 hours';

alter table public.service_requests alter column requested_at set not null;
alter table public.service_requests drop column requested_date;

create index service_requests_status_requested_at_idx
  on public.service_requests(status, requested_at);
