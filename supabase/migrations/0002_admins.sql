-- 0002_admins.sql
create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admins is 'Non-profit staff. Invite-only. One row per auth.users.';
