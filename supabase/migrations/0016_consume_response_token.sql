-- 0016_consume_response_token.sql
-- Atomic accept/decline for magic-link tokens.
-- Returns jsonb { outcome, request_id? } where outcome ∈
-- 'accepted' | 'declined' | 'already_filled' | 'expired' | 'invalid'.

create or replace function public.consume_response_token(
  p_token text,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.response_tokens%rowtype;
  v_req_status request_status;
  v_req_id uuid;
  v_updated int;
begin
  if p_action not in ('accept', 'decline') then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  select * into v_token
  from public.response_tokens
  where token = p_token
  for update;

  if not found then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if v_token.used_at is not null then
    -- If it was superseded by a sibling accept, surface that distinction.
    if v_token.action = 'superseded' then
      return jsonb_build_object('outcome', 'already_filled', 'request_id', v_token.request_id);
    end if;
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if v_token.expires_at <= now() then
    return jsonb_build_object('outcome', 'expired');
  end if;

  select status into v_req_status
  from public.service_requests
  where id = v_token.request_id
  for update;

  if v_req_status in ('accepted', 'completed', 'cancelled') then
    return jsonb_build_object('outcome', 'already_filled', 'request_id', v_token.request_id);
  end if;

  if p_action = 'decline' then
    update public.response_tokens
    set used_at = now(), action = 'decline', updated_at = now()
    where id = v_token.id;
    return jsonb_build_object('outcome', 'declined', 'request_id', v_token.request_id);
  end if;

  -- Accept path: atomically transition the request.
  update public.service_requests
  set status = 'accepted',
      assigned_volunteer_id = v_token.volunteer_id,
      updated_at = now()
  where id = v_token.request_id
    and status in ('open', 'notified')
    and assigned_volunteer_id is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('outcome', 'already_filled', 'request_id', v_token.request_id);
  end if;

  update public.response_tokens
  set used_at = now(), action = 'accept', updated_at = now()
  where id = v_token.id;

  -- The existing 0009 trigger supersedes sibling tokens on status → accepted.

  return jsonb_build_object('outcome', 'accepted', 'request_id', v_token.request_id);
end;
$$;

revoke all on function public.consume_response_token(text, text) from public;
grant execute on function public.consume_response_token(text, text) to service_role;
