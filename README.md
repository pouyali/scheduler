# Better At Home Scheduling

Web platform for matching senior service requests with volunteers.

See [CLAUDE.md](./CLAUDE.md) and [docs/superpowers/specs/2026-04-18-phase-1-design.md](./docs/superpowers/specs/2026-04-18-phase-1-design.md) for the full design.

## Prerequisites

- Node 20+
- Docker Desktop (for local Supabase)
- Supabase CLI is installed as a dev dep; run via `npx supabase ...`

## First-time setup

1. Copy `.env.example` to `.env.local`.
2. Start local Supabase:
   ```bash
   npm run supabase:start
   ```
   Copy the printed `anon` and `service_role` keys into `.env.local`.
3. Install deps:
   ```bash
   npm install
   ```
4. Generate types:
   ```bash
   npm run supabase:types
   ```
5. Seed a dev admin:
   ```bash
   npm run seed:admin
   ```
   Credentials: `admin@local.test` / `password123!`
6. Run the app:
   ```bash
   npm run dev
   ```

## Commands

| Command                                       | Purpose                                         |
| --------------------------------------------- | ----------------------------------------------- |
| `npm run dev`                                 | Next dev server                                 |
| `npm run build`                               | Production build                                |
| `npm run lint`                                | ESLint                                          |
| `npm run typecheck`                           | TypeScript                                      |
| `npm run format`                              | Prettier write                                  |
| `npm run test`                                | Vitest unit tests                               |
| `npm run test:integration`                    | Vitest integration tests (needs local Supabase) |
| `npm run test:e2e`                            | Playwright E2E                                  |
| `npm run supabase:start` / `:stop` / `:reset` | Local Supabase                                  |
| `npm run supabase:types`                      | Regenerate TS types from local DB               |
| `npm run seed:admin`                          | Create dev admin user                           |

## Directory guide

- `app/` — Next.js App Router. Grouped by `(public)`, `(admin)`, `(volunteer)`.
- `lib/` — clients (Supabase), notifications, mapbox, auth, db query helpers.
- `components/` — shared UI (shadcn primitives plus feature components).
- `supabase/migrations/` — versioned SQL migrations.
- `tests/integration/`, `tests/e2e/` — integration + E2E.
- `docs/superpowers/` — specs and plans.

## Production deployment

Covered in the Phase 1 design doc. Short version: Vercel + Supabase production project + verified Resend domain + Mapbox tokens restricted to the Vercel domain.
