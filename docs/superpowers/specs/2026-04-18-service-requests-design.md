# Service Requests — Design

**Date:** 2026-04-18
**Sub-project of:** [Phase 1](2026-04-18-phase-1-design.md)
**Status:** Ready for implementation plan

## Purpose

Build the end-to-end service request lifecycle for the scheduling platform: admins create requests on behalf of seniors, match them to volunteers, send invites, and track responses; volunteers receive invites by email and accept or decline via magic link or portal.

## Scope

### In scope

- **Admin request lifecycle** — list, filter, create (with senior picker), detail page, edit (scope-aware), cancel, reopen, reassign, mark completed.
- **Matching and notification** — ranked eligible-volunteer list on the request detail page, multi-select send-to-N, email dispatch, per-recipient status with summary header, 25-recipient confirmation guardrail.
- **Magic-link response** — `/respond/[token]` route handler, first-to-accept semantics, "already filled" page, confirmation pages.
- **Volunteer portal** — `/volunteer/dashboard` with pending-invite action cards and upcoming accepted; `/volunteer/requests/[id]` read-only detail; `/volunteer/history` for past assignments.

### Out of scope (deferred)

- Admin calendar view (`/admin/calendar`) — separate sub-project.
- Admin dashboard widgets (`/admin` counts, recent activity, upcoming) — separate sub-project.
- Inline senior creation from the new-request form — admin goes to `/admin/seniors/new` and comes back.
- Volunteer-initiated completion and mileage tracking — Phase 2.
- Realtime updates on the recipients table — manual page refresh is sufficient for Phase 1.

## Users and key flows

### New request (admin)

1. Admin opens `/admin/requests/new`, types to search for a senior, selects one.
2. Fills category, priority, requested date, description. Saves. Request created with `status = 'open'`.
3. Admin lands on `/admin/requests/[id]`. Sees the ranked eligible-volunteer list.
4. Admin ticks checkboxes (or uses "Select all in-area" / "Select all"), clicks "Send to N volunteers."
5. If N > 25, a confirm dialog appears. On confirm, server creates one `response_tokens` row and one `notifications` row per recipient, then sends emails via Resend. Request transitions to `status = 'notified'`.

### Volunteer responds

**Magic link (email):**
1. Volunteer clicks Accept or Decline in the email. Lands on `/respond/[token]?action=accept|decline`.
2. Route handler calls `consume_response_token` RPC. RPC atomically validates state and transitions the request.
3. Result page renders: accepted / declined / already-filled / expired / invalid.

**Portal (logged-in):**
1. Volunteer logs in, sees invite cards on `/volunteer/dashboard`.
2. Clicks Accept or Decline on a card. Server Action calls the same RPC.
3. Redirected back to the dashboard with a flash message.

First-to-accept wins. The existing DB trigger on `service_requests.status → accepted` marks all other unused tokens for that request as `superseded`.

### Cancel, reopen, reassign (admin)

- **Cancel** (from any non-terminal status): confirmation modal with optional reason and a "Notify recipients" checkbox (shown only if tokens or an assignee exist). Supersedes outstanding tokens, sets `status = 'cancelled'`, `cancelled_at`, `cancelled_reason`. If checkbox set, sends a `request-cancelled` email to recipients / assignee.
- **Reopen** (from `accepted`): clears `assigned_volunteer_id`, sets `status = 'open'`, records `reopened_at`. Admin can then re-broadcast from the detail page.
- **Reassign** (from `accepted`): admin picks a replacement from the ranked list. Server clears the old assignee, issues a new token, sends `service-request-invite` with `event_type = 'reassignment_invite'`, and the request returns to `status = 'notified'`.

### Edit rules (scope-aware)

- Always editable: `description`, `priority`.
- Locked when `status = 'notified'`: `category`, `requested_date`, `senior_id`. UI disables with a tooltip explaining the user must cancel to change these fields.
- Editable in `open` / `accepted` / `completed` / `cancelled` — typo fixes remain possible in historical rows without unlocking the lifecycle-critical fields mid-notification.

### Admin detail page layout (`/admin/requests/[id]`)

Four zones, top to bottom:

1. **Header** — request summary (senior name + address, category, date, priority, status badge). Action menu with Edit / Cancel / Reopen / Reassign / Mark completed, each shown only when the current status allows it.
2. **Eligible-volunteer picker** — visible only when `status = 'open'`. Searchable ranked list per "Matching and ranking" below. Columns: checkbox, name, city, in-area badge, categories, phone. "Select all in-area" and "Select all" shortcuts. Footer with a "Send to N volunteers" button; if N > 25, the confirm dialog guard applies.
3. **Recipients table** — visible when `status = 'notified'` or `status = 'accepted'`. Summary header: "Sent to N · A accepted · D declined · P pending." One row per `notifications` entry for this request: volunteer name, sent time, state (pending / accepted / declined / superseded / failed), response time, channel. Failed rows get a "Retry" button.
4. **Activity log** — append-only chronological list derived at query time from `service_requests` timestamps (`created_at`, `cancelled_at`, `reopened_at`, `completed_at`) plus the `notifications` rows. No new events table. Events shown: created, notified-batch-sent, per-volunteer accepted/declined, cancelled, reopened, reassigned, completed.

### Matching and ranking

- Eligible = active volunteer whose `categories[]` contains the request's category.
- Service-area ranking = case-insensitive whole-word match between the senior's `city` and the volunteer's `service_area` free-text field. In-area volunteers sort first; within each group, alphabetical by last name.
- No distance calculation in Phase 1 — the existing data model stores `service_area` as free text.

### Token expiry

`expires_at = greatest(requested_date at 23:59:59 America/Toronto, now() + 24 hours)`. The 24h floor handles same-day and past-dated requests. All seniors in the system are in Ontario; timezone is hard-coded for Phase 1.

### PII boundary

Invite emails and volunteer-dashboard cards show: senior first name, senior city, category, requested date, short description. Full name, full address, and phone are revealed only after the volunteer accepts (on the assigned-request detail page).

## Architecture

Single Next.js app, Server Actions for admin and volunteer mutations, a public route handler for `/respond/[token]` using the service-role Supabase client, and a security-definer Postgres RPC for the atomic accept/decline transition.

```
Admin UI (Server Components + Server Actions)
  ↓
Supabase RLS (admins table membership → full access to service_requests/notifications)
  ↓
Postgres (service_requests, notifications, response_tokens, seniors, volunteers)
  ↑
Public /respond/[token] route handler (service-role client)
  ↓
consume_response_token RPC (security-definer, atomic)
  ↑
Volunteer portal (Server Actions, same RPC for Accept/Decline)
  ↓
Resend (NotificationService interface → email-resend impl)
```

### Module layout

- `lib/db/queries/service-requests.ts` — typed reads/writes for this feature (replaces the stub).
- `lib/matching/eligibility.ts` — `rankEligibleVolunteers(volunteers, senior, category)`.
- `lib/service-requests/expiry.ts` — `computeTokenExpiry(requestedDate, now)`.
- `lib/notifications/templates/service-request-invite.ts`
- `lib/notifications/templates/request-cancelled.ts`
- `app/(admin)/admin/requests/page.tsx` — list with filters.
- `app/(admin)/admin/requests/new/page.tsx` — create form with senior picker.
- `app/(admin)/admin/requests/[id]/page.tsx` — detail, eligible picker, recipients table, activity log (see "Admin detail page layout" below).
- `app/(admin)/admin/requests/[id]/actions.ts` — Server Actions: create, update, notify, cancel, reopen, reassign, mark-completed, retry-notification.
- `app/(volunteer)/volunteer/dashboard/page.tsx` — revised dashboard.
- `app/(volunteer)/volunteer/requests/[id]/page.tsx` — assigned request detail.
- `app/(volunteer)/volunteer/history/page.tsx`
- `app/(volunteer)/volunteer/actions.ts` — Server Actions: portal accept/decline.
- `app/respond/[token]/route.ts` — GET handler, calls RPC.
- `app/respond/[token]/accepted/page.tsx`, `declined/page.tsx`, `already-filled/page.tsx`, `invalid/page.tsx` — result pages.

## Data model changes

One new migration `0015_service_requests_phase1.sql`:

- `service_requests`:
  - Add `cancelled_at timestamptz`.
  - Add `cancelled_reason text`.
  - Add `reopened_at timestamptz`.
  - Add CHECK: `(status = 'accepted') → assigned_volunteer_id IS NOT NULL`.
  - Add partial index: `create index on service_requests(senior_id) where status in ('open', 'notified')`.
- `notifications`:
  - Add `event_type` enum column: `'invite' | 'cancellation' | 'reassignment_invite'`, default `'invite'`. Existing rows get the default automatically.
- `response_tokens`: no schema change.
- New RPC `consume_response_token(p_token text, p_action text) returns jsonb` — security-definer, atomic. Returns `{ outcome, request_id? }` where outcome is one of `'accepted'`, `'declined'`, `'already_filled'`, `'expired'`, `'invalid'`.

Supabase types regenerated after the migration, per project convention.

## Server Actions and route handlers

### Admin Server Actions

All live in `app/(admin)/admin/requests/[id]/actions.ts` (or the new route's `actions.ts`). Each validates input with Zod, checks admin membership (RLS enforces but we also guard in code), performs the DB write, and returns a discriminated-union result.

- `createServiceRequest(input)` → creates row, redirects to detail.
- `updateServiceRequest(id, input)` → applies edit-lock rules; rejects disallowed fields when `status = 'notified'`.
- `sendInvites(requestId, volunteerIds[])` → guards `volunteerIds.length <= 25` unless a `confirmed: true` flag is present (the confirm dialog sets it); transactionally creates tokens + notifications rows, then fires emails; updates status to `notified`.
- `cancelRequest(id, { reason, notifyRecipients })` → supersedes tokens, updates status, optionally emails.
- `reopenRequest(id)` → clears assignee, sets status open, records `reopened_at`.
- `reassignRequest(id, newVolunteerId)` → clears assignee, issues new token with `event_type = 'reassignment_invite'`, emails, status back to `notified`.
- `markCompleted(id)` → sets `completed_at`, `status = 'completed'`.
- `retryNotification(notificationId)` → resends a failed email.

### Volunteer Server Actions

- `respondFromPortal(requestId: string, action: 'accept' | 'decline')` → scoped to `auth.uid()`. Looks up the caller's active token (`used_at IS NULL`, `expires_at > now()`) for that request via the service-role client, then calls `consume_response_token(token, action)`. Redirects to `/volunteer/dashboard` with a flash outcome.

### Public route handler: `GET /respond/[token]`

Query param `?action=accept|decline`. Calls `consume_response_token(token, action)`. Redirects (HTTP 303) to `/respond/[token]/{outcome}` to prevent accidental re-submission on reload.

## RLS expectations

No new policies required; existing policies from `0011_rls_policies.sql` cover the new columns automatically:

- Admins: full access via `admins` membership check.
- Volunteers: read their own `notifications` rows and the `service_requests` they were notified about or assigned to. Cannot read `seniors` or other volunteers' `notifications`.
- Public: no access. `/respond/[token]` uses service role.

Integration tests re-verify these boundaries (critical project convention).

## Email templates

### `service-request-invite`

- Subject: `You've been invited to help with a [category] request`
- Body (HTML + plaintext): greeting by first name, request summary (category, requested date relative + absolute, senior first name, senior city, description excerpt), Accept and Decline buttons linking to `/respond/[token]?action=...`, short note that the link expires at the service date, sign-off.
- **PII excluded:** full senior name, full address, phone.

### `request-cancelled`

- Subject: `A request you were invited to is no longer needed`
- Body: short, apologetic, thank-you, optional `reason` line if admin provided one, link to `/volunteer/dashboard`.
- Sent only when admin ticks the "Notify recipients" checkbox on cancellation.

Both templates use the existing `NotificationService` interface. Bounces and failures recorded in `notifications.status`.

## Guardrails

- **Large broadcast confirm** — the UI shows a confirm dialog when `volunteerIds.length > 25`. Server double-checks by requiring `confirmed: true` in the payload for those cases.
- **Edit-lock rule** — enforced at the Server Action layer. DB allows the writes; app rejects disallowed transitions with a friendly error.
- **Atomic accept** — `consume_response_token` RPC is the only path to `status = 'accepted'`. Admin UI never writes that transition directly.

## Testing

### Unit (Vitest)

- `rankEligibleVolunteers` — ordering, case-insensitive whole-word match, missing/empty fields.
- `computeTokenExpiry` — future date, same-day, past date, DST boundary in America/Toronto.
- Template rendering — required fields present; full address, last name, phone absent.
- RPC outcome → route handler page mapping.

### Integration (Vitest against local Supabase)

- CRUD helpers under admin and volunteer auth contexts.
- RLS: volunteer A cannot read volunteer B's notifications; volunteer cannot read unrelated requests or any seniors; volunteer cannot read `response_tokens`.
- `consume_response_token` outcomes: accept happy path (request transitions, siblings superseded), second accept returns `already_filled`, decline keeps request unchanged, expired token returns `expired`, reused token returns `invalid`, two concurrent accepts — one wins, the other gets `already_filled`.
- Cancellation with outstanding tokens — tokens become superseded.
- Reassign — old assignee cleared, new token issued, status back to `notified`.
- Edit-lock rule at the Server Action level — disallowed field changes rejected while `status = 'notified'`.

### E2E (Playwright)

1. Admin creates request → broadcasts to 2 volunteers → first accepts via `/respond/[token]` → admin sees `accepted` + recipients table shows the sibling as superseded.
2. Volunteer logs in → sees pending invite card → clicks Accept from portal → confirmation → dashboard shows it under Upcoming accepted.
3. Admin cancels a notified request with "Notify recipients" checked → mocked Resend records the send → recipient's dashboard no longer shows the invite.

### Mocking

- Do not mock Supabase in integration tests — use local Supabase via `supabase start`.
- Resend is stubbed behind `NotificationService` so tests record sends.

## Risks and mitigations

- **Race on accept:** mitigated by the atomic RPC and supersede trigger; verified in integration tests.
- **Email delivery failures:** `notifications.status = 'failed'` surfaces in the recipients table with a "Retry" button.
- **Email forwarding:** token consumer does not re-verify identity; accepted limitation for Phase 1; minimal PII in the invite reduces damage if the link is forwarded.
- **Senior picker over large dataset:** debounced server search with `ilike` and `limit 20`; requires at least 2 characters.
- **Timezone:** America/Toronto hard-coded; revisit if the non-profit expands beyond Ontario.

## Open questions (non-blocking, resolve during implementation)

1. Should a reassigned-away volunteer receive an email that their assignment was withdrawn? Leaning no for Phase 1 (dashboard will reflect the change; admin typically calls first).
2. Should Decline collect an optional free-text reason? Leaning no for Phase 1; add later if admins ask.

## Rollout

- Ships as one sub-project. No feature flag.
- Migration `0015_service_requests_phase1.sql` runs on merge.
- Types regenerated and committed with the migration.
- The existing `listServiceRequests` stub in `lib/db/queries/service-requests.ts` is replaced wholesale by this feature's helpers.
