-- 0009_triggers.sql

-- Generic updated_at trigger.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'admins', 'volunteers', 'seniors', 'service_requests',
      'notifications', 'response_tokens', 'service_sessions'
    ])
  loop
    execute format(
      'create trigger %I_set_updated_at
         before update on public.%I
         for each row execute function public.set_updated_at()',
      tbl, tbl
    );
  end loop;
end;
$$;

-- On volunteers.status -> 'active', set approved_at if not already set.
create or replace function public.set_volunteer_approved_at()
returns trigger as $$
begin
  if new.status = 'active' and (old.status is distinct from 'active') and new.approved_at is null then
    new.approved_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger volunteers_set_approved_at
  before update on public.volunteers
  for each row execute function public.set_volunteer_approved_at();

-- On service_requests.status -> 'accepted', supersede other open tokens for that request.
create or replace function public.supersede_other_tokens()
returns trigger as $$
begin
  if new.status = 'accepted' and (old.status is distinct from 'accepted') then
    update public.response_tokens
    set used_at = now(), action = 'superseded'
    where request_id = new.id
      and used_at is null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger service_requests_supersede_tokens
  after update on public.service_requests
  for each row execute function public.supersede_other_tokens();
