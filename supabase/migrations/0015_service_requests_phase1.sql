-- 0015_service_requests_phase1.sql
-- Schema additions for the Service Requests sub-project.

-- service_requests: cancellation + reopen bookkeeping
alter table public.service_requests
  add column cancelled_at timestamptz,
  add column cancelled_reason text,
  add column reopened_at timestamptz;

-- Integrity: accepted status always has an assignee.
alter table public.service_requests
  add constraint service_requests_accepted_has_assignee
  check (status <> 'accepted' or assigned_volunteer_id is not null);

-- Speed up "does this senior already have an open/notified request" checks.
create index service_requests_senior_open_idx
  on public.service_requests(senior_id)
  where status in ('open', 'notified');

-- notifications: distinguish invite vs cancellation vs reassignment email
create type notification_event_type as enum ('invite', 'cancellation', 'reassignment_invite');

alter table public.notifications
  add column event_type notification_event_type not null default 'invite';
