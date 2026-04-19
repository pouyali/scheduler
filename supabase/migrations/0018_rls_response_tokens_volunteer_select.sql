-- 0018_rls_response_tokens_volunteer_select.sql
-- Allow a volunteer to read their own response_tokens (needed for the
-- portal dashboard's pending-invites section). Writes remain service-role only.

create policy response_tokens_select_volunteer on public.response_tokens
  for select to authenticated
  using (volunteer_id = auth.uid());
