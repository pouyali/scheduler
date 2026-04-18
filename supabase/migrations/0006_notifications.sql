-- 0006_notifications.sql
create type notification_channel as enum ('email', 'sms', 'push');
create type notification_status as enum ('sent', 'failed', 'bounced');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  channel notification_channel not null,
  status notification_status not null default 'sent',
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index notifications_request_idx on public.notifications(request_id);
create index notifications_volunteer_idx on public.notifications(volunteer_id);

comment on table public.notifications is 'Audit trail of outbound notifications.';
