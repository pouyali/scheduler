-- 0003_volunteers.sql
create type volunteer_status as enum ('pending', 'active', 'inactive');
create type auth_provider as enum ('email', 'google', 'admin_invite');

create table public.volunteers (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  email text not null,
  status volunteer_status not null default 'pending',
  categories text[] not null default '{}',
  service_area text,
  home_address text,
  home_lat numeric,
  home_lng numeric,
  auth_provider auth_provider not null,
  signup_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.admins(id)
);

create index volunteers_status_idx on public.volunteers(status);

comment on table public.volunteers is 'Volunteers. Self-signup lands pending; admin approves to active.';
