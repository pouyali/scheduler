# Admin Calendar + Dashboard — Design

**Date:** 2026-04-19
**Sub-project of:** [Phase 1](2026-04-18-phase-1-design.md)
**Status:** Ready for implementation plan
**Follows:** [Service Requests](2026-04-18-service-requests-design.md) (merged 2026-04-19 via PR #7)

## Purpose

Ship the admin-facing calendar view and the admin dashboard at `/admin`. Both are read-only surfaces over the data model that the Service Requests sub-project produces. Fold in a schema change that adds time-of-day to every request, since a calendar without request times is not useful.

## Scope

### In scope

- **Schema change:** replace `service_requests.requested_date date` with `service_requests.requested_at timestamptz`. Update everything downstream: queries, forms, email templates, token expiry, integration + E2E tests.
- **Calendar** at `/admin/calendar` — react-big-calendar with Month / Week / Agenda views. Events coloured by status, click-through to request detail. Filter chips for status, category, and assignee.
- **Dashboard** at `/admin` — four stat cards (Open requests, Awaiting response, Pending volunteers, Active seniors), Upcoming requests (next 7 days, top 10), Recent activity (last 20 events).
- **Dependency:** add `react-big-calendar` to `package.json`.

### Out of scope (deferred)

- `/admin/analytics` with charts (requests by month, pie by outcome, geographic heatmap, active volunteers) — separate sub-project, tracked in memory as `analytics-followup.md`.
- Duration field on requests. All calendar events render as fixed 1-hour blocks for Phase 1.
- Drag-to-reschedule or any other in-calendar mutation.
- Infinite/paged fetch on the calendar — ±60-day wide fetch is the Phase 1 ceiling.
- Dashboard auto-refresh (no SSE, no polling).
- Day view on the calendar.
- Cross-timezone support — America/Toronto continues as hard-coded.

## Users and key flows

### Admin dashboard

Admin lands on `/admin` after login. Sees:

1. **Row of four stat cards** — Open / Awaiting response / Pending volunteers / Active seniors. Each card is a link to the filtered detail page.
2. **Upcoming requests** — next 7 days, `status IN ('open', 'notified', 'accepted')`, top 10 ordered by `requested_at` asc. Row = date+time, status badge, senior first name + category. Click → `/admin/requests/[id]`.
3. **Recent activity** — last 20 events across all requests (merged from status transitions + per-invite responses). Each line: relative time, sentence, click-through to request.

### Admin calendar

Admin visits `/admin/calendar`. Default Month view centred on today. Sees events coloured by status. Clicks an event → request detail page. Uses filter chips above the calendar to narrow by status, category, and assignee. Filter state is mirrored to the URL (`?status=open,notified&category=transportation&assignee=<uuid>`).

### Request creation (schema ripple)

Admin opens `/admin/requests/new`. Form now has two inputs where there was one: a date input and a time input (15-minute steps). On submit, the Server Action combines them into an ISO timestamp for America/Toronto and stores as `requested_at`.

### Token expiry rule change

Previously: "end-of-day on requested_date, or 24 h floor from now, whichever is later."
Now: "the `requested_at` instant itself, or 24 h floor from now, whichever is later."

Stricter by a few hours — an 09:00 appointment had a 23:59 the previous evening cutoff; now it has 08:59 on the day. The 24 h floor still guarantees at least a day of response time for last-minute broadcasts.

## Architecture

### Schema change

One migration, `0021_requested_at_timestamptz.sql`:

```sql
drop index if exists public.service_requests_status_date_idx;

alter table public.service_requests add column requested_at timestamptz;

update public.service_requests
set requested_at = (requested_date::timestamp at time zone 'America/Toronto') + interval '12 hours';

alter table public.service_requests alter column requested_at set not null;
alter table public.service_requests drop column requested_date;

create index service_requests_status_requested_at_idx
  on public.service_requests(status, requested_at);
```

Types regenerated immediately after: `npm run supabase:types`. Ripple through `Row`, `CreateInput`, `UpdateInput`, `ListFilters`, cursor shape, every test fixture.

### Calendar

```
app/(admin)/admin/calendar/
  page.tsx              server component — requireAdmin, initial wide fetch, lookup lists
  calendar-shell.tsx    client — react-big-calendar host, view + filter state
  calendar-filters.tsx  client — filter chips (status / category / assignee)
```

`page.tsx` fetches:
- Calendar events via `listCalendarEvents(supabase, { from, to })` where `from = now - 60d`, `to = now + 60d` (symmetric ±60-day window — past requests stay visible for historical context, future requests for planning). Returns `{id, title, start, end, resource: { status, category, assigneeId, requestId }}` events.
- Lookup: `volunteer_categories` (for the category chips).
- Lookup: active volunteers `{id, first_name, last_name}` (for the assignee select).

`calendar-shell.tsx` is a client component that:
- Hosts `Calendar` from `react-big-calendar` with `views={['month', 'week', 'agenda']}` and `defaultView="month"`.
- Applies the filter state (status / category / assignee) to the in-memory event list — no refetch on filter change.
- Reads/writes filter state to URL via `useRouter` + `useSearchParams`.
- `onSelectEvent={e => router.push('/admin/requests/' + e.resource.requestId)}`.
- `eventPropGetter` returns class names mapped from status, using design-token CSS variables (defined in `globals.css`).

`calendar-filters.tsx` renders three filter groups using shadcn primitives:
- Status: five checkbox chips (open, notified, accepted, completed, cancelled). Default: first three on.
- Category: multi-select (category slugs). Default: all on.
- Assignee: single-select with "All" and "Unassigned" options in addition to the volunteer list. Default: All.

`listCalendarEvents` query (in `lib/db/queries/service-requests.ts`):

```ts
export async function listCalendarEvents(
  supabase: Client,
  range: { from: string; to: string },
): Promise<CalendarEvent[]>
```

Selects `id, category, requested_at, status, assigned_volunteer_id, seniors!inner(first_name)` where `requested_at >= from` and `requested_at <= to`, ordered by `requested_at`. Transforms rows to `CalendarEvent[]` with `start = new Date(requested_at)`, `end = new Date(requested_at + 1h)`, `title = '{first_name} · {category}'`.

### Dashboard

```
app/(admin)/admin/
  page.tsx                    server component — replaces current placeholder
  dashboard/
    stat-card.tsx             presentational: title, count, subtitle-link
    stat-row.tsx              composes four StatCards
    upcoming-list.tsx         top-10 upcoming list with empty state
    activity-feed.tsx         last 20 events with empty state
```

`page.tsx` runs three fetches in parallel:
- `getDashboardCounts(supabase)` → `{openRequests, awaitingResponse, pendingVolunteers, activeSeniors}`.
- `listUpcomingRequestsForDashboard(supabase, { days: 7, limit: 10 })`.
- `listRecentActivity(supabase, 20)`.

`getDashboardCounts` is four `select id count: exact head: true` queries wrapped in `Promise.all`, returning a typed record.

`listUpcomingRequestsForDashboard` selects from `service_requests`, joins seniors (first_name, city), filters by `requested_at` window + status in ('open','notified','accepted'), orders asc, limits to `limit`.

`listRecentActivity` is the composite query described in "Activity feed derivation" below.

Stat cards subtitle-links:
- Open requests → `/admin/requests?status=open`.
- Awaiting response → `/admin/requests?status=notified`.
- Pending volunteers → `/admin/volunteers?status=pending`.
- Active seniors → `/admin/seniors`.

### Activity feed derivation

`listRecentActivity(supabase, limit = 20)` returns a merged chronological feed from two sources:

1. **Status-transition events from `service_requests`:**
   - Read last 50 `service_requests` ordered by `greatest(created_at, cancelled_at, reopened_at, completed_at)` desc. Emit up to one event per relevant timestamp on each row:
     - `created_at` → `"Request created for {senior}"`
     - First `notifications.sent_at` for the request → `"Broadcast to N volunteers for {senior}"` (join + aggregate)
     - `cancelled_at` → `"Request cancelled for {senior}"` (append reason if present)
     - `reopened_at` → `"Request reopened for {senior}"`
     - `completed_at` → `"Request completed for {senior}"`
2. **Per-invite responses from `response_tokens`:**
   - Last 50 `response_tokens` with `used_at is not null`, desc on `used_at`, joined to volunteers (for name) and service_requests→seniors (for context).
   - Emit: `"{volunteer} accepted {senior}'s request"` or `"{volunteer} declined"`.

Merge both arrays in JS, sort by timestamp desc, slice to `limit`. Acceptable at Phase 1 scale (~100 rows total per query). Returns `DashboardActivityEvent[]`:

```ts
type DashboardActivityEvent = {
  at: string;
  kind: "created" | "broadcast" | "accepted" | "declined" | "cancelled" | "reopened" | "completed";
  text: string;          // rendered sentence
  requestId: string;     // for click-through
};
```

### Date/time helpers

`lib/service-requests/datetime.ts`:

```ts
export function combineDateTimeToIso(
  dateStr: string,   // "2026-12-06"
  timeStr: string,   // "16:30"
  tz?: string,       // default "America/Toronto"
): string            // ISO with correct offset, e.g. "2026-12-06T21:30:00.000Z"

export function splitIsoToDateTime(
  iso: string,
  tz?: string,
): { date: string; time: string }
```

Implemented via `Intl.DateTimeFormat` the same way `computeTokenExpiry` does it. Round-trips cleanly for unit tests.

### Token expiry simplification

`lib/service-requests/expiry.ts` becomes shorter:

```ts
export function computeTokenExpiry(
  requestedAtIso: string,
  now: Date = new Date(),
): Date {
  const requestedAt = new Date(requestedAtIso);
  const floor = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return requestedAt.getTime() > floor.getTime() ? requestedAt : floor;
}
```

Drops the `zonedEndOfDay` helper entirely. Unit tests updated to reflect the simpler rule.

## Guardrails

- **Calendar wide-fetch ceiling (±60 days).** If the user navigates past the fetched window, the calendar shows a small notice `"Showing {fromDate}–{toDate} only. Navigate within this range, or reload the page to recentre."` — defer true month-boundary refetch to a future sub-project.
- **Time input step="900"** — 15-minute granularity on the create/edit forms.
- **Server Actions re-verify admin role** — `requireAdmin()` still guards calendar and dashboard reads even though RLS would allow any admin access.

## RLS expectations

No new policies. Existing admin policies on `service_requests`, `notifications`, `response_tokens`, `seniors`, `volunteers` already grant admins the reads needed. Integration tests exercise them in the existing `rls-service-requests.test.ts`.

## Testing

### Unit (Vitest)

- `lib/service-requests/datetime.test.ts`:
  - Typical case (`2026-06-15T14:30` Toronto → ISO).
  - Spring-forward boundary — behaviour explicit (one valid choice, documented).
  - Fall-back boundary — prefer later (EST) interpretation.
  - Round-trip: `splitIsoToDateTime(combineDateTimeToIso(d, t))` returns `{date: d, time: t}`.
- `lib/service-requests/expiry.test.ts` (rewritten):
  - Requested-at in the future, beyond now+24h → returns `requested_at`.
  - Requested-at within now+24h → returns `now + 24h`.
  - Requested-at in the past → returns `now + 24h`.
  - Boundary exactly at now+24h → returns `now + 24h` (floor wins on tie; document behaviour).

### Integration (Vitest against local Supabase)

- `service-requests-crud.test.ts` **updated** — fixtures use `requested_at` ISO strings. `dateFrom`/`dateTo` filters remain semantically equivalent.
- `consume-response-token.test.ts`, `send-invites-action.test.ts`, `admin-request-lifecycle.test.ts`, `update-request-action.test.ts`, `volunteer-respond-portal.test.ts`, `respond-route.test.ts` — fixture ripple only; no behavioural changes.
- `rls-service-requests.test.ts` — fixture ripple only.
- **New:** `dashboard-queries.test.ts` — covers `getDashboardCounts`, `listUpcomingRequestsForDashboard`, `listRecentActivity`.
- **New:** `calendar-queries.test.ts` — covers `listCalendarEvents` window + join shape.

### E2E (Playwright)

- `admin-request-broadcast-accept.spec.ts` **updated** — fills `input[name=requested_date]` + `input[name=requested_time]` (new field name) and asserts the detail page renders a timestamp.
- `volunteer-portal-accept.spec.ts` **updated** — seed uses `requested_at` ISO string.
- `admin-cancel-with-notify.spec.ts` **updated** — same seed change.
- **New:** `admin-calendar-navigation.spec.ts` — admin logs in, goes to `/admin/calendar`, sees an event (seeded), clicks it, lands on `/admin/requests/[id]`. Shallow.
- **New:** `admin-dashboard.spec.ts` — admin logs in, hits `/admin`, sees the four stat card numbers, sees a seeded upcoming request row, sees an activity item. Shallow.

### Mocking policy

Unchanged. No Supabase mocks in integration tests. Resend stubbed via `NotificationService`.

## Risks and mitigations

- **Schema change ripples unseen call sites** — mitigated by TypeScript strict + full integration + e2e runs before PR.
- **DST ambiguity in `combineDateTimeToIso`** — explicit unit-test coverage on both boundaries; prefer later (EST) interpretation on fall-back.
- **Calendar wide-fetch ceiling** — notice shown when navigation exceeds range; proper refetch deferred.
- **Activity-feed "last 50 × 2, merge in memory"** — adequate at Phase 1 scale; rewrite as RPC if it slows down later.
- **Token expiry is stricter after change** — documented; 24 h floor still protects minimum response window.

## Open questions (non-blocking)

1. Calendar event color palette — reuse badge tokens with alpha, or dedicated event-fill tokens. Lean toward reusing. Defer.
2. Time input step — 15 minutes. Defer trivially.
3. "Reopened" activity-feed wording — "Admin reopened request for {senior}" is the current lean. Defer.

## Rollout

- Single PR, branch `feat/calendar-dashboard`, targets `develop`.
- `package.json` gains `react-big-calendar` + its types.
- Migration `0021_requested_at_timestamptz.sql` runs on merge.
- Types regenerated and committed with the migration.
- No feature flag.

## Deferred (tracked in memory)

- `/admin/analytics` with 4 charts — `analytics-followup.md`.
- `duration_minutes` field on requests.
- Calendar infinite fetch.
- Calendar Day view.
