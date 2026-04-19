-- 0019_rls_seniors_volunteer_select.sql
-- Allow a volunteer to read seniors whose service requests they have been
-- notified about or are assigned to (needed for the volunteer portal to
-- display senior first name / city on pending-invite cards and request detail).
-- Write access to seniors remains admin-only.

create policy seniors_select_volunteer on public.seniors
  for select to authenticated
  using (
    exists (
      select 1
      from public.service_requests sr
      where sr.senior_id = seniors.id
        and (
          sr.assigned_volunteer_id = auth.uid()
          or exists (
            select 1 from public.notifications n
            where n.request_id = sr.id
              and n.volunteer_id = auth.uid()
          )
        )
    )
  );
