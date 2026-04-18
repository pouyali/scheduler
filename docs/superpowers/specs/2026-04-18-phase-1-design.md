# Better At Home Scheduling — Phase 1 Design

**Status:** Approved design, pending implementation plan
**Date:** 2026-04-18

## Objective

Build a centralized web admin platform for a non-profit that matches senior service requests with volunteers. Admins take requests from seniors by phone, notify volunteers (one-to-one or broadcast), and track responses. Volunteers accept or decline via email magic link, and also have a portal to view history and update their profile.

## Users and authorization

- **Admins** — non-profit staff. Invite-only (created by other admins). Full access to all data.
- **Volunteers** — log in via email/password or Google OAuth. Self-signup lands in `pending`; admin approves before they can respond to requests. Admins can also create volunteer accounts directly.
- **Seniors** — never log in. Admins manage their profiles.

## Architecture

Single Next.js 16 app deployed to Vercel, with Supabase providing auth, Postgres, and row-level security. Resend handles email. Mapbox handles map tiles, markers, heatmap, and server-side geocoding.

Supabase + RLS collapses auth + CRUD authorization + DB into one trust boundary. Next server code stays thin and focused on things Supabase can't do itself: sending email, validating magic-link response tokens, orchestrating broadcasts, and server-side geocoding using the secret Mapbox token.

```
Next.js (Vercel)
  (public)     login, signup, respond/[token]
  (admin)      /admin/* — role-gated
  (volunteer)  /volunteer/* — role-gated, status='active'
  api/         notifications, geocode, import/seniors, respond/[token]
    ↓
Supabase (auth, Postgres, RLS, triggers)
Resend (email)
Mapbox (tiles + geocoding)
```

Phase 2 is explicitly out of scope for implementation but accounted for in schema:
- SMS + mobile push (slots in `NotificationService` interface)
- Mobile app with session tracking (`service_sessions` table exists, no UI)
- Availability calendar, AI matching, multilingual

## Data model

All timestamps `timestamptz`, default `now()`. All IDs `uuid`, default `gen_random_uuid()`. RLS enabled on every table.

### `admins`
One-to-one with `auth.users`.
- `id` (uuid, PK, FK → `auth.users.id`)
- `first_name`, `last_name`, `phone`
- `created_at`

### `volunteers`
One-to-one with `auth.users`.
- `id` (uuid, PK, FK → `auth.users.id`)
- `first_name`, `last_name`, `phone`, `email`
- `status` enum: `pending` | `active` | `inactive` (default `pending`)
- `categories` text[] — e.g. `{transportation, companionship}`
- `service_area` text
- `home_address` text, `home_lat` numeric, `home_lng` numeric (nullable)
- `auth_provider` enum: `email` | `google` | `admin_invite`
- `signup_source` text (nullable)
- `created_at`, `approved_at` (nullable), `approved_by` (admin id, nullable)

### `seniors`
No auth link. Admin-managed.
- `id` (uuid, PK)
- `first_name`, `last_name`, `phone`, `email` (nullable)
- `address_line1`, `address_line2`, `city`, `province`, `postal_code`
- `lat` numeric, `lng` numeric (set via geocode on save)
- `notes` text
- `created_at`, `created_by` (admin id)

### `service_requests`
- `id` (uuid, PK)
- `senior_id` (FK → `seniors`)
- `category` text, `priority` enum: `low` | `normal` | `high`
- `requested_date` date
- `description` text
- `status` enum: `open` | `notified` | `accepted` | `completed` | `cancelled` (default `open`)
- `assigned_volunteer_id` (FK → `volunteers`, nullable)
- `created_at`, `created_by` (admin id)
- `completed_at` (nullable)

### `notifications`
Audit trail of every send.
- `id`, `request_id` (FK), `volunteer_id` (FK)
- `channel` enum: `email` (future: `sms`, `push`)
- `sent_at`, `delivered_at` (nullable)
- `status` enum: `sent` | `failed` | `bounced`

### `response_tokens`
Single-use magic-link tokens.
- `id`, `token` text (random, unique index)
- `request_id` (FK), `volunteer_id` (FK)
- `expires_at`
- `used_at` (nullable), `action` enum: `accept` | `decline` | `superseded` (nullable until used)

### `service_sessions` (Phase 2 placeholder)
Schema present, no UI in Phase 1.
- `id`, `request_id` (FK), `volunteer_id` (FK)
- `started_at`, `ended_at` (nullable)
- `start_lat`, `start_lng`, `end_lat`, `end_lng`
- `distance_km` numeric, `cost` numeric
- `notes` text

### RLS policies (sketch)

- **Admins:** all tables — full read/write if the authenticated user has a row in `admins`.
- **Volunteers:**
  - `volunteers`: read own row, update own row (not `status`, not `approved_*`).
  - `service_requests`: read rows where they have a `notifications` row OR `assigned_volunteer_id = auth.uid()`. Update only to mark completion (Phase 2).
  - `notifications`: read own rows.
  - `seniors`: no access.
  - `response_tokens`: no client access — server-role only.
- **Unauthenticated:** no access anywhere. `/respond/[token]` uses service role via route handler.

### Triggers

- `updated_at` trigger on every table.
- On `service_requests.status` transition to `accepted`: mark all other unused `response_tokens` for the request as `used_at = now(), action = 'superseded'`.
- On `volunteers.status` transition to `active`: set `approved_at = now()`.

### Indexes

- `service_requests (status, requested_date)`
- `service_requests (assigned_volunteer_id)`
- `notifications (request_id)`
- `notifications (volunteer_id)`
- `response_tokens (token)` unique
- `seniors (city)`
- `volunteers (status)`

## Key flows

### 1. New service request
1. Admin opens `/admin/requests/new`. Searches/selects senior (can create inline).
2. Fills category, priority, requested date, description. Saves → request `status='open'`.
3. Request detail page shows eligible volunteers (active + matching category + service area).
4. Admin picks: **Send to one** (select volunteer → Notify) or **Broadcast** (send to all eligible).
5. For each recipient: create `response_tokens` row, create `notifications` row, send email via Resend with accept/decline magic links.
6. Request `status='notified'`.

### 2. Volunteer responds via magic link
1. Volunteer clicks Accept or Decline in email → `/respond/[token]`.
2. Route handler (service-role client):
   - Look up token. Reject if missing, expired, or already used.
   - If `action='accept'`:
     - If request already `accepted` → render "already filled" page.
     - Else atomically: mark token used, update request (`status='accepted'`, `assigned_volunteer_id`), trigger supersedes other tokens.
   - If `action='decline'`: mark token used; no request status change (admin may still see other responses).
3. Render confirmation page with request details + portal login link.

### 3. Volunteer signup and approval
1. `/signup` → email/password or Google OAuth.
2. First login without a `volunteers` row → redirect to `/signup/complete-profile` (phone, categories, service area, optional home address).
3. `volunteers` row inserted, `status='pending'`.
4. Volunteer lands on `/volunteer/dashboard` with "Awaiting approval" banner; no requests visible.
5. Admin at `/admin/volunteers?status=pending` approves or rejects. Approval sends a "you're approved" email and sets `status='active'`. Rejection sets `status='inactive'`.

### 4. Senior CSV import
1. Admin at `/admin/seniors/import` downloads a CSV template (headers + one example row).
2. Uploads filled CSV. Server route handler parses and validates each row (required fields, phone format, postal code).
3. For valid rows, calls Mapbox Geocoding API (secret token, server-side) to set `lat`/`lng`.
4. Preview table shows valid rows + error rows with messages.
5. Admin confirms → bulk insert. Error rows downloadable as a CSV error report.

### 5. Request completion (Phase 1)
Admin marks `completed` manually from the request detail page. Phase 2 mobile app lights up volunteer-initiated completion via `service_sessions`.

### 6. Broadcast race condition
First-to-accept wins. The `service_requests.status → accepted` trigger supersedes all other open tokens for that request. Late clickers see "already filled, thanks anyway" — not an error.

## UI surface

### Admin (`/admin/*`, role-gated)
- `/admin` — dashboard: counts (open requests, pending volunteers, active seniors), recent activity, upcoming requests
- `/admin/analytics` — charts (requests by week/month/category), heatmap over senior + request locations, active counts
- `/admin/calendar` — month/week/day views of requests, filter by status/category
- `/admin/map` — seniors pinned, filter by city/category
- `/admin/requests` — list + filters; `/new`, `/[id]`
- `/admin/seniors` — list + search + map toggle; `/new`, `/[id]`, `/import`
- `/admin/volunteers` — list + status tabs; `/new`, `/[id]`

### Volunteer (`/volunteer/*`, auth'd, status='active')
- `/volunteer/dashboard` — pending invites + accepted upcoming
- `/volunteer/history` — past accepted/completed
- `/volunteer/profile` — edit own profile (not status)

### Public
- `/signup`, `/signup/complete-profile`, `/login`, `/respond/[token]`

### Shared components
- `MapView` (wraps Mapbox GL JS)
- `CalendarView` (wraps react-big-calendar)
- `DataTable` (sortable/filterable)
- `StatusBadge`
- Form primitives via shadcn/ui

## Project structure

```
app/
  (public)/
    login/page.tsx
    signup/page.tsx
    signup/complete-profile/page.tsx
    respond/[token]/page.tsx
  (admin)/
    admin/
      layout.tsx              role guard: admins
      page.tsx                dashboard
      analytics/page.tsx
      calendar/page.tsx
      map/page.tsx
      requests/...
      seniors/...
      volunteers/...
  (volunteer)/
    volunteer/
      layout.tsx              role guard: active volunteers
      dashboard/page.tsx
      history/page.tsx
      profile/page.tsx
  api/
    notifications/route.ts
    geocode/route.ts
    import/seniors/route.ts
    respond/[token]/route.ts
  layout.tsx
  globals.css

lib/
  supabase/
    client.ts
    server.ts
    admin.ts                  service-role, server only
    middleware.ts             session refresh
  notifications/
    index.ts                  NotificationService interface
    email-resend.ts           concrete email impl
    templates/
  mapbox/
    geocode.ts
  auth/
    roles.ts                  getUserRole(), requireAdmin(), etc.
  db/
    types.ts                  generated from Supabase
    queries/                  typed query helpers

components/
  ui/                         shadcn primitives
  map/MapView.tsx
  calendar/CalendarView.tsx
  data-table/DataTable.tsx

middleware.ts                 session refresh

supabase/
  migrations/
  seed.sql
  config.toml

docs/superpowers/specs/
public/templates/
  seniors-import-template.csv
```

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # server only
NEXT_PUBLIC_MAPBOX_TOKEN           # pk.*, domain-restricted
MAPBOX_SECRET_TOKEN                # sk.*, server-side geocoding
RESEND_API_KEY
RESEND_FROM_EMAIL
NEXT_PUBLIC_APP_URL                # for magic-link URLs
```

`.env.local` gitignored. `.env.example` committed with placeholders.

## Testing strategy

- **Unit (Vitest):** pure logic — token generation/validation, CSV parsing, category/area matching filter, email template rendering, role guards.
- **Integration (Vitest + local Supabase via `supabase start`):** DB queries, RLS policies, server actions. Transactions rolled back per test. **RLS tests are mandatory** — explicitly verify a volunteer cannot read another volunteer's rows, cannot read seniors, cannot read other volunteers' notifications.
- **E2E (Playwright):** golden paths only — (a) admin creates request → broadcasts → volunteer accepts via magic link → admin sees accepted; (b) signup + approval flow.
- **No UI snapshot tests.**
- **CI:** GitHub Actions runs lint, typecheck, unit, integration on every PR. E2E on main only or nightly.
- Tests co-located for unit; `tests/integration/`, `tests/e2e/` for the rest.

## Conventions

- TypeScript strict. No `any` without a comment.
- Server Components by default. `'use client'` only for interactive forms, map, calendar.
- Server Actions for mutations. Route handlers only for public endpoints and webhooks.
- All DB writes via typed helpers in `lib/db/queries/`. Pages never call Supabase directly.
- Supabase types regenerated after every migration.
- RLS first, app-layer checks second.
- One migration per logical change, committed with the feature using it.
- Per `AGENTS.md`: read `node_modules/next/dist/docs/` before writing Next-specific code.
- Tooling: ESLint (configured), Prettier (to add), Supabase CLI for local dev, optional husky + lint-staged.

## Deployment

- Vercel connected to GitHub. Preview deployments per PR, production on merge to main.
- Env vars configured in Vercel dashboard with production Supabase + Mapbox + Resend keys.
- Supabase migrations: **manual via Supabase dashboard or CLI for Phase 1**, CI-driven in Phase 2.
- Mapbox public token restricted to Vercel domain in Mapbox dashboard.
- Resend domain verification (SPF/DKIM DNS records) for production sending.

## External services to provision

Accounts the user must create before implementation can complete:

1. **Supabase** — project URL, anon key, service-role key, DB password. Supabase MCP server recommended for schema-in-session.
2. **Mapbox** — public token (`pk.*`), secret token (`sk.*`).
3. **Resend** — API key, verified sending domain (for production).
4. **Google Cloud** — OAuth 2.0 Client ID + Secret for Google signup, with redirect URI pointing at Supabase callback.
5. **Vercel** — GitHub repo connection.
6. **Domain name** (optional for Phase 1 dev; needed for production email + polished OAuth consent).

Work possible without any of the above:
- Project scaffolding, deps, Tailwind + shadcn setup
- Migrations as SQL files (applied later)
- All logic + tests with mock data
- Forms, tables, calendar, map components with mocks
- `.env.example` + documentation

## Phase 1 sub-projects

Phase 1 is split. Each gets its own spec → plan → implementation cycle.

1. **Foundation** — Supabase project + local dev, auth (email/password + Google), schema with RLS, project structure, env, tooling (Prettier, Vitest, Playwright, CI, husky).
2. **Volunteer management** — CRUD, signup paths (admin-create, self-signup email/password, self-signup Google), approval queue.
3. **Senior management** — CRUD + CSV import + geocoding + map view.
4. **Service request management** — CRUD, status lifecycle, calendar view.
5. **Matching + notifications** — eligibility filter, send-to-one, broadcast, magic-link response flow, `NotificationService` interface + Resend impl.
6. **Analytics dashboard** — charts, heatmap, counts.

This document covers the whole of Phase 1. The first implementation plan will cover **Foundation** only.

## Open items / decisions deferred

- Supabase region — default closest to user base (to be confirmed).
- Production domain — defer; use `*.vercel.app` for dev.
- Supabase MCP vs manual SQL migrations — user preference.
- Specific email template copy — drafted during the notifications sub-project.
