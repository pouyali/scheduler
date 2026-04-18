-- 0011_rls_policies.sql
-- RLS on every table. Service-role bypasses RLS entirely.

alter table public.admins enable row level security;
alter table public.volunteers enable row level security;
alter table public.seniors enable row level security;
alter table public.service_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.response_tokens enable row level security;
alter table public.service_sessions enable row level security;

-- ADMINS: admins can read all admin rows; each admin can read their own row.
create policy admins_select_self on public.admins
  for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

create policy admins_insert_admin on public.admins
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy admins_update_admin on public.admins
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy admins_delete_admin on public.admins
  for delete to authenticated
  using (public.is_admin(auth.uid()));

-- VOLUNTEERS: admins full access; volunteers read/update own row (not status/approved fields).
create policy volunteers_select on public.volunteers
  for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

create policy volunteers_insert on public.volunteers
  for insert to authenticated
  with check (id = auth.uid() or public.is_admin(auth.uid()));

create policy volunteers_update_admin on public.volunteers
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Volunteers can update their own non-status fields. Enforced by excluding status/approved_* from updatable
-- columns at the app layer. RLS permits the update; a trigger would be the belt-and-suspenders option,
-- but we keep it simple for Phase 1 and test app-layer behavior explicitly.
create policy volunteers_update_self on public.volunteers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy volunteers_delete_admin on public.volunteers
  for delete to authenticated
  using (public.is_admin(auth.uid()));

-- SENIORS: admins only.
create policy seniors_all_admin on public.seniors
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- SERVICE_REQUESTS: admins full; volunteers read where notified or assigned.
create policy service_requests_select_admin on public.service_requests
  for select to authenticated
  using (public.is_admin(auth.uid()));

create policy service_requests_select_volunteer on public.service_requests
  for select to authenticated
  using (
    assigned_volunteer_id = auth.uid()
    or exists (
      select 1 from public.notifications n
      where n.request_id = service_requests.id
        and n.volunteer_id = auth.uid()
    )
  );

create policy service_requests_write_admin on public.service_requests
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- NOTIFICATIONS: admins full; volunteers read own.
create policy notifications_select_admin on public.notifications
  for select to authenticated
  using (public.is_admin(auth.uid()));

create policy notifications_select_volunteer on public.notifications
  for select to authenticated
  using (volunteer_id = auth.uid());

create policy notifications_write_admin on public.notifications
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- RESPONSE_TOKENS: service-role only (no policies for authenticated = deny).
-- No policies created = all authenticated access denied.

-- SERVICE_SESSIONS: admins full; volunteers read own (Phase 2 will extend).
create policy service_sessions_select_admin on public.service_sessions
  for select to authenticated
  using (public.is_admin(auth.uid()));

create policy service_sessions_select_volunteer on public.service_sessions
  for select to authenticated
  using (volunteer_id = auth.uid());

create policy service_sessions_write_admin on public.service_sessions
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
