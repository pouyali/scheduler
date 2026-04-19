-- 0020_service_requests_assignee_fk_set_null.sql
-- When a volunteer is deleted, unassign them from service_requests rather than
-- blocking the delete. Leaves historical request rows intact with a null
-- assignee, which is the existing "unassigned" state.

alter table public.service_requests
  drop constraint service_requests_assigned_volunteer_id_fkey;

alter table public.service_requests
  add constraint service_requests_assigned_volunteer_id_fkey
  foreign key (assigned_volunteer_id)
  references public.volunteers(id)
  on delete set null;
