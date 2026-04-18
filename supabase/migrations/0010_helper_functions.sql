-- 0010_helper_functions.sql
-- is_admin(): security definer so RLS policies can call it without recursive RLS checks.
create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where id = user_id);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

comment on function public.is_admin(uuid) is 'Returns true if user_id has an admins row. Security definer to avoid recursive RLS.';
