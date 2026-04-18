-- 0012_seniors_archived_at.sql
alter table public.seniors
  add column archived_at timestamptz;

-- Partial index: only indexes active (non-archived) rows. Speeds up the
-- default admin list query which always filters WHERE archived_at IS NULL.
create index seniors_archived_at_idx on public.seniors (archived_at)
  where archived_at is null;

create or replace function public.delete_senior_cascade(p_senior_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is NULL for service-role callers, so this guard also blocks them.
  -- Call this function only from an authenticated admin session.
  if not exists (select 1 from public.admins where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  delete from public.notifications
   where request_id in (
     select id from public.service_requests where senior_id = p_senior_id
   );
  delete from public.service_requests where senior_id = p_senior_id;
  delete from public.seniors where id = p_senior_id;
end;
$$;

revoke all on function public.delete_senior_cascade(uuid) from public;
grant execute on function public.delete_senior_cascade(uuid) to authenticated;

comment on column public.seniors.archived_at is
  'Soft-delete marker. Rows with archived_at set are hidden from the default admin list.';
comment on function public.delete_senior_cascade(uuid) is
  'Admin-only. Permanently deletes a senior and all dependent rows (service_requests, notifications, response_tokens, service_sessions) in one transaction. response_tokens and service_sessions are removed via ON DELETE CASCADE on service_requests.';
