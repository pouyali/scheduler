-- 0007_response_tokens.sql
create type token_action as enum ('accept', 'decline', 'superseded');

create table public.response_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  request_id uuid not null references public.service_requests(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  action token_action,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index response_tokens_request_idx on public.response_tokens(request_id);

comment on table public.response_tokens is 'Single-use magic-link tokens for volunteer accept/decline.';
