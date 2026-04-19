-- 0013_volunteer_categories.sql
create table public.volunteer_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index volunteer_categories_archived_idx on public.volunteer_categories (archived_at) where archived_at is null;

alter table public.volunteer_categories enable row level security;

-- Any authenticated user can read. Volunteers need categories during signup.
create policy volunteer_categories_select on public.volunteer_categories
  for select to authenticated
  using (true);

-- Only admins can insert/update/delete.
create policy volunteer_categories_insert_admin on public.volunteer_categories
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy volunteer_categories_update_admin on public.volunteer_categories
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy volunteer_categories_delete_admin on public.volunteer_categories
  for delete to authenticated
  using (public.is_admin(auth.uid()));

create trigger volunteer_categories_set_updated_at
  before update on public.volunteer_categories
  for each row execute function public.set_updated_at();

insert into public.volunteer_categories (slug, name) values
  ('transportation', 'Transportation'),
  ('companionship', 'Companionship'),
  ('shopping', 'Shopping'),
  ('household_tasks', 'Household tasks'),
  ('technology_help', 'Technology help'),
  ('meal_delivery', 'Meal delivery'),
  ('other', 'Other');

comment on table public.volunteer_categories is 'Admin-managed service categories. slug is the stable matching key; name is the display label.';
