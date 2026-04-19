-- 0017_cancel_service_request.sql
-- Atomic cancellation: supersede outstanding tokens and transition the request
-- to cancelled in a single transaction. Blocks cancellation of already-terminal
-- requests (completed/cancelled) with a clear error.

create or replace function public.cancel_service_request(
  p_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current request_status;
begin
  select status into v_current
  from public.service_requests
  where id = p_id
  for update;

  if not found then
    raise exception 'Request % not found', p_id
      using errcode = 'P0002';
  end if;

  if v_current in ('completed', 'cancelled') then
    raise exception 'Request % is already % and cannot be cancelled', p_id, v_current
      using errcode = 'P0001';
  end if;

  update public.response_tokens
  set used_at = now(), action = 'superseded', updated_at = now()
  where request_id = p_id
    and used_at is null;

  update public.service_requests
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = p_reason,
      updated_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.cancel_service_request(uuid, text) from public;
grant execute on function public.cancel_service_request(uuid, text) to service_role, authenticated;
