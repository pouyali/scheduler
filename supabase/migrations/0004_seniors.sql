-- 0004_seniors.sql
create table public.seniors (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  province text not null,
  postal_code text not null,
  lat numeric,
  lng numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.admins(id)
);

create index seniors_city_idx on public.seniors(city);

comment on table public.seniors is 'Seniors receiving services. No auth link; admin-managed.';
