@AGENTS.md

# Better At Home Scheduling

Web platform for a non-profit that matches senior service requests with volunteers. Admins take requests by phone from seniors, then either notify a specific volunteer or broadcast to eligible volunteers. Volunteers accept or decline via magic link in email.

## Users

- **Admins** — non-profit staff. Manage seniors, volunteers, requests. Log in.
- **Volunteers** — log in (email/password or Google OAuth). Self-signup lands in `pending` status; admins approve. Also creatable directly by admins.
- **Seniors** — never log in. Admins create and manage senior profiles on their behalf.

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4, shadcn/ui
- **Backend/DB:** Supabase (Postgres + Auth + RLS)
- **Email:** Resend, behind a `NotificationService` interface (SMS/push slots left empty)
- **Maps:** Mapbox GL JS (tiles, markers, heatmap) + Mapbox Geocoding API (server-side)
- **Calendar:** react-big-calendar
- **Testing:** Vitest (unit + integration against local Supabase), Playwright (E2E golden paths)
- **Hosting:** Vercel
- **CI:** GitHub Actions (lint, typecheck, unit, integration)

Per `AGENTS.md`: Next 16 has breaking changes. Read `node_modules/next/dist/docs/` before writing Next-specific code.

## Architecture

Single Next.js app. Supabase collapses auth, DB, and authorization (RLS) into one trust boundary. Next server code is thin — only for things Supabase can't do itself: send emails, validate magic-link tokens, orchestrate broadcasts, server-side geocoding.

```
Next.js (Vercel)
  /admin/*          role-gated admin UI
  /volunteer/*      role-gated volunteer portal
  /respond/[token]  public magic-link accept/decline
  /api/*            route handlers (notifications, geocode, import, respond)
    ↓
Supabase (auth, Postgres, RLS, triggers)
Resend (email)
Mapbox (tiles + geocoding)
```

## Data model (summary)

- `admins` — one-to-one with `auth.users`
- `volunteers` — one-to-one with `auth.users`. `status` = `pending` | `active` | `inactive`. Has `categories[]`, `service_area`, optional home address + lat/lng.
- `seniors` — no auth link. Admin-managed. Address fields + `lat`/`lng` (geocoded on save).
- `service_requests` — `status` = `open` | `notified` | `accepted` | `completed` | `cancelled`. Links to senior + optional assigned volunteer.
- `notifications` — audit trail of what was sent (channel, status, timestamps).
- `response_tokens` — single-use magic-link tokens. Server-role only.
- `service_sessions` — Phase 2 placeholder (mobile mileage/cost tracking). Schema exists, no UI.

RLS on every table. Admins have broad access (checked via `admins` membership). Volunteers see only their own row + requests they're notified about or assigned to. Seniors table is admin-only. Tokens are service-role only.

## Key flows

- **New request:** admin picks senior, fills form, then either notifies one volunteer or broadcasts to N eligible. Email goes out with unique per-volunteer magic links.
- **Response:** volunteer clicks Accept/Decline link → `/respond/[token]` validates and updates request atomically. First-to-accept wins; other tokens for that request become invalid (Postgres trigger). "Already filled" page for late clicks.
- **Signup + approval:** email/password OR Google OAuth → complete-profile page (if new) → `pending` status → admin approves → volunteer gets access.
- **CSV import:** admin downloads template, uploads filled CSV, server parses + geocodes + previews, admin confirms insert. Error report CSV for failed rows.

## Project structure

```
app/
  (public)/              login, signup, respond/[token]
  (admin)/admin/         dashboard, analytics, calendar, map, requests, seniors, volunteers
  (volunteer)/volunteer/ dashboard, history, profile
  api/                   notifications, geocode, import/seniors, respond/[token]
lib/
  supabase/              client, server, admin (service-role), middleware
  notifications/         interface + email-resend impl + templates
  mapbox/                server-side geocoding
  auth/                  role guards
  db/                    generated types, typed query helpers
components/              ui (shadcn), map, calendar, data-table
supabase/
  migrations/            versioned SQL migrations
  seed.sql               dev seed data
docs/superpowers/specs/  design docs
public/templates/        CSV import templates
```

## Conventions

- TypeScript strict. No `any` without a comment explaining why.
- Server Components by default. `'use client'` only for interactive forms, map, calendar.
- Server Actions for mutations. Route handlers only for public endpoints (`/respond/[token]`, webhooks).
- All DB writes go through typed helpers in `lib/db/queries/`. Pages don't call Supabase directly.
- Supabase types regenerated after every migration (`supabase gen types typescript`).
- RLS first, app-layer checks second. Never trust the client.
- One migration per logical change, committed with the feature that uses it.
- **Tests for every piece of logic.** Unit tests for pure logic (tokens, CSV parse, matching filter, templates), integration tests for DB queries + RLS (critical — verify volunteers genuinely cannot read other volunteers' data), E2E for golden paths only.
- Don't mock Supabase in integration tests. Use local Supabase via `supabase start`.

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

`.env.local` is gitignored. `.env.example` is committed with placeholder values.

## Phases

- **Phase 1 (current):** web platform + email notifications. Admin panel, volunteer portal, signup/approval, senior management (incl. CSV import + map view), service requests, matching + broadcast, calendar, analytics dashboard with heatmap.
- **Phase 2:** mobile app for volunteers, push notifications, service session tracking (start/end coords, mileage, cost — schema already in place), availability calendar, AI-assisted matching, multilingual support.

## Working on this project

- Phase 1 is split into sub-projects. The first is **Foundation** (Supabase setup, auth, schema, project structure, env, tooling). Each sub-project gets its own spec → plan → implementation cycle.
- Full Phase 1 design: [docs/superpowers/specs/2026-04-18-phase-1-design.md](docs/superpowers/specs/2026-04-18-phase-1-design.md)
