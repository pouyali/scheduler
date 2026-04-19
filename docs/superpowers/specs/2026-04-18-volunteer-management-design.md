# Volunteer Management — Phase 1 Sub-Project

**Status:** Approved design, pending implementation plan
**Date:** 2026-04-18
**Branch:** `feat/volunteer-management` off `develop`, PR → `develop`
**Source of truth for style:** [DESIGN.md](../../../DESIGN.md)

## Objective

Build the third Phase-1 sub-project: volunteer onboarding, management, and approval. Covers three signup paths (admin-create via invite email, self-signup email/password, self-signup Google OAuth), an approval queue for pending volunteers, admin CRUD of volunteer records, and a managed set of service categories that admins can edit over time. Ends with a dev-only "Seed test data" button to enable full-flow testing during the remaining Phase-1 sub-projects. The button must be removed before Phase 1 ships.

## Users & goals

- **Admin:** needs one page (`/admin/volunteers`) to see all volunteers by status, approve/reject pending self-signups inline, create volunteers directly on behalf of walk-ins, and manage the category taxonomy that powers future matching.
- **Volunteer:** needs a frictionless signup (email/password or Google), a profile-completion step that asks for the minimum matching fields (name, phone, categories, service area, optional home address), and a dashboard that clearly communicates status (awaiting approval, active, or not accepted).

## Out of scope

- Bulk CSV volunteer import (deferrable to Phase 1.5).
- Changing a volunteer's email post-creation (requires `auth.users.email` update + re-verification — document in UI, defer).
- Automated cleanup of expired invite tokens.
- Production Resend domain verification (infra step outside code).
- Matching / notifications / service-request sub-projects.

## Decisions locked during brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Google OAuth in scope | Yes — full three-path signup + admin-create. Supabase OAuth already configured by user. |
| 2 | Admin-create flow | Admin form → Supabase `inviteUserByEmail` → `volunteers` row with `status='active'`. No secondary approval. |
| 3 | Approval queue UX | Status tabs on main list (`all | pending | active | inactive`) with "N pending" badge. Inline approve/reject on pending rows. |
| 4 | Rejection behavior | Soft: `status='inactive'`. Auth user + record preserved. Reversible via reactivate. Mirrors senior archive pattern. |
| 5 | Admin-create dup email | Strict block. Existing volunteer → show "[go to profile]" link. Existing auth user without volunteer row → block + ask user to finish signup themselves. |
| 6 | Categories | Managed DB entity (`volunteer_categories` table). Admin can add/rename/archive. Slug-keyed for matching stability. |
| 7 | Category mgmt location | Nested under volunteers: `/admin/volunteers/categories`. No new sidebar item. |
| 8 | Category edit/archive behavior | Rename propagates via name-join (slug is immutable). Archive preserves existing volunteer references; archived categories can't be picked on new/edit forms. No cascade. |
| 9 | Service area | Keep `service_area text` free-form for now. Revisit during Matching. |
| 10 | Dev-seed button | Full-flow: seeds volunteers + seniors + service_requests. Placed on `/admin` dashboard, double env-gated (`NODE_ENV !== "production"` AND `NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true"`). Idempotent via fixed emails. |

## Architecture

### Data model

New migration `0013_volunteer_categories.sql`:

```sql
create table public.volunteer_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,           -- stable matching key, immutable after create
  name text not null,                  -- display label, freely editable
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index volunteer_categories_archived_idx on public.volunteer_categories (archived_at);

alter table public.volunteer_categories enable row level security;

-- RLS: any authenticated user can read (volunteers need categories during signup).
-- Only admins can insert/update/delete.
create policy "read_categories" on public.volunteer_categories
  for select to authenticated using (true);
create policy "admin_write_categories" on public.volunteer_categories
  for all to authenticated using (exists (select 1 from public.admins where id = auth.uid()))
  with check (exists (select 1 from public.admins where id = auth.uid()));

-- updated_at trigger
create trigger volunteer_categories_updated_at
  before update on public.volunteer_categories
  for each row execute function public.set_updated_at();

-- Seed starter categories (admins can edit/delete freely)
insert into public.volunteer_categories (slug, name) values
  ('transportation', 'Transportation'),
  ('companionship', 'Companionship'),
  ('shopping', 'Shopping'),
  ('household_tasks', 'Household tasks'),
  ('technology_help', 'Technology help'),
  ('meal_delivery', 'Meal delivery'),
  ('other', 'Other');
```

**`volunteers.categories`** stays as `text[]` of **slugs**. Display names come from a join/lookup against `volunteer_categories` at render time. Renaming a category updates all UIs with no data migration.

### Route map

**Public:**
- `/signup` — existing email/password form; adds a Google button.
- `/signup/complete-profile` — existing; category field switches from free-text to multi-select populated from `listCategories({ includeArchived: false })`.
- `/auth/callback` — existing; audited to ensure Google-fresh users without a volunteers row route to `/signup/complete-profile`.

**Volunteer portal:**
- `/volunteer/dashboard` — existing shell; new "not accepted" state rendered when `status='inactive'`.

**Admin:**
- `/admin/volunteers` — list with `status` tab filter + "N pending" badge on the Pending tab + search box (name/email) + inline approve/reject on pending rows.
- `/admin/volunteers/new` — admin-create form.
- `/admin/volunteers/[id]` — detail + edit + status change (archive/reactivate) + resend-invite button for uninvited users.
- `/admin/volunteers/categories` — category management table + add-category form.
- `/admin` (dashboard) — adds a "Dev tools" card at the bottom when env-gated. Contains a "Seed test data" button.

### New API surface

- `app/api/dev/seed/route.ts` — route handler, admin-only + double env-gated. POST triggers a Postgres function (`public.seed_dev_fixtures()`) that inserts fixture volunteers, seniors, and service_requests. Returns 404 in production.

### Libraries

- `lib/db/queries/volunteer-categories.ts` — `listCategories`, `createCategory`, `updateCategory`, `archiveCategory`, `unarchiveCategory`.
- `lib/db/queries/volunteers.ts` — extend with `listVolunteers`, `countVolunteers`, `updateVolunteerProfile`, `approveVolunteer`, `rejectVolunteer`, `reactivateVolunteer`.
- `lib/validations/volunteers.ts` — `adminCreateVolunteerSchema`, `updateVolunteerSchema`, `completeProfileSchema`.
- `lib/validations/volunteer-categories.ts` — `createCategorySchema`, `updateCategorySchema`.
- `lib/utils/slugify.ts` — pure helper; produces URL-safe slug + collision suffix.
- `lib/notifications/templates/volunteer-invite.ts` — invite-email template (HTML + text).
- `lib/notifications/templates/volunteer-approved.ts` — "you're approved" email on approval.

## Flows

### 1. Admin creates a volunteer

1. Admin opens `/admin/volunteers/new`. Fills first/last name, email, phone, categories (multi-select of active categories), service area, optional home address.
2. Server Action validates via Zod. Queries for duplicates:
   - If `volunteers.email = input.email` exists → return `{ error: "Already a volunteer", existingId }`. UI shows a link to the profile.
   - If `auth.users.email = input.email` exists but no volunteers row → return `{ error: "Email exists in auth; ask user to finish their signup" }`.
3. If clear: `supabase.auth.admin.inviteUserByEmail(email, { data: {...profileFields} })` generates a magic-link token and sends the invite email through Supabase's email infra (routed via our Resend integration and our on-brand `volunteer-invite` template).
4. Insert `volunteers` row with the returned `user.id`, `status='active'`, `auth_provider='admin_invite'`, `approved_at=now()`, `approved_by=currentAdminId`.
5. Redirect to `/admin/volunteers/[id]`.

### 2. Self-signup (email/password) and approval

1. `/signup` → email/password → `/signup/complete-profile`.
2. Complete-profile form submits → `createVolunteerProfile` with `status='pending'`, `auth_provider='email'`.
3. Volunteer lands on `/volunteer/dashboard` with "Awaiting admin approval" banner; no requests visible.
4. Admin sees the pending volunteer in `/admin/volunteers?status=pending`. Inline Approve → `status='active'`, `approved_at=now()`, `approved_by=adminId` + sends approval email. Inline Reject → `status='inactive'`, no approval metadata.
5. On next load of `/volunteer/dashboard`:
   - `status='active'` → full dashboard.
   - `status='inactive'` → "Your application wasn't accepted" page (minimal; no requests, contact info for questions).

### 3. Self-signup (Google)

1. `/signup` → "Continue with Google" → Supabase OAuth redirect → `/auth/callback`.
2. Callback inspects authenticated user:
   - Volunteers row exists → route by status (active → dashboard; pending/inactive → dashboard with appropriate banner).
   - No volunteers row → redirect to `/signup/complete-profile` (same completion form used by email path).
3. Profile saved with `auth_provider='google'`, `status='pending'`. Rest of flow matches §2 steps 4–5.

### 4. Category management

1. Admin opens `/admin/volunteers/categories`. Table shows all categories; active first, then archived (muted styling per DESIGN.md).
2. "Add category" form (single name field). On submit: slugify name, check uniqueness, insert. On collision, append `-2`, `-3`, etc.
3. Row inline actions: rename (name + optional description — slug is immutable), archive, unarchive. Archived categories disappear from volunteer signup/edit multi-selects but stay on existing volunteers' records.
4. Rename propagates immediately everywhere (UI reads `name` from the join).

### 5. Dev seed

1. `NODE_ENV !== "production"` + `NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true"` → dashboard shows "Dev tools" card.
2. Admin clicks "Seed test data" → POST `/api/dev/seed`.
3. Route handler calls `supabase.rpc('seed_dev_fixtures')`. The RPC is idempotent: uses fixed emails (`vol-1@dev.test` through `vol-10@dev.test`, `senior-1@dev.test` through `senior-15@dev.test`) — `on conflict (email) do nothing` where applicable.
4. Fixtures:
   - 10 volunteers: 3 pending, 6 active, 1 inactive. Mix of categories. Cities: Vancouver, Burnaby, Surrey.
   - 15 seniors: geocoded coordinates spread across Vancouver/Burnaby/Surrey, 1 with null lat/lng to exercise "no coords" flows.
   - 5 service_requests: 2 open, 1 notified, 1 accepted (assigned to a volunteer), 1 completed. Spread across seniors.
5. On success, dashboard refreshes; admin sees the new counts.

## Validation

`lib/validations/volunteers.ts`:

```ts
adminCreateVolunteerSchema: {
  first_name: string.trim.min(1),
  last_name: string.trim.min(1),
  email: string.email,
  phone: string.optional,
  categories: string.array.min(1),       // slugs, validated downstream against active categories
  service_area: string.trim.min(1),
  home_address: string.optional,
  home_lat: number.optional,
  home_lng: number.optional,
}

updateVolunteerSchema: adminCreateVolunteerSchema.omit({ email })  // email immutable

completeProfileSchema: {
  first_name, last_name, phone, categories, service_area, home_address   // same as create, minus email
}
```

`lib/validations/volunteer-categories.ts`:

```ts
createCategorySchema: { name: string.trim.min(1).max(80) }
updateCategorySchema: { name: string.trim.min(1).max(80), description: string.optional }
```

## Testing

Per CLAUDE.md — tests for every piece of logic.

- **Unit:**
  - `lib/validations/volunteers.test.ts` — accept/reject cases per field.
  - `lib/validations/volunteer-categories.test.ts`.
  - `lib/utils/slugify.test.ts` — case handling, whitespace, special chars, collision suffixing.
- **Integration (Vitest + local Supabase):**
  - `lib/db/queries/volunteers.test.ts` — list filter + cursor, approve/reject/reactivate state transitions, update fields.
  - `lib/db/queries/volunteer-categories.test.ts` — create + slug collision, archive, unarchive, list filtering.
  - `tests/integration/rls-volunteer-categories.test.ts` — **mandatory**: authenticated non-admin can `select` but cannot `insert/update/delete`; unauthenticated has no access.
  - `tests/integration/rls-volunteers.test.ts` — add if not present: a volunteer cannot read another volunteer's row.
  - `tests/integration/dev-seed.test.ts` — running the RPC twice leaves counts unchanged on the second run.
- **E2E (Playwright):** one new test `admin-volunteer-lifecycle.spec.ts` — admin creates a volunteer (invite mocked), self-signup creates a pending volunteer, admin approves it, admin rejects another, admin reactivates the rejected one. Uses service-role client to bypass real email sends.

## Error handling

| Scenario | Handling |
|---|---|
| Admin-create with existing volunteer email | Server Action returns `{ error, existingId }`; UI renders inline error + link to profile. |
| Admin-create with auth-user-only email | Server Action returns `{ error: "..." }`; UI renders inline error asking user to finish signup. |
| Google callback with no volunteers row | Route to `/signup/complete-profile`. |
| Rename category to a name whose slug collides | Append `-2`, `-3` to slug (name preserved as typed). |
| `/volunteer/dashboard` when `status='inactive'` | Render "Your application wasn't accepted" state. |
| Dev-seed called in production | Route returns 404. |
| Supabase invite fails (network, quota) | Server Action returns the error message; admin retries; no `volunteers` row created. |
| Invite token expired | Detail page shows "invite sent, not yet accepted" state + "Resend invite" button. |

## Delivery plan

One PR against `develop`, ~7 commits:

1. `feat(volunteers): volunteer_categories table + RLS + seed starter list`
2. `feat(volunteers): category management UI at /admin/volunteers/categories`
3. `feat(volunteers): admin list + status tabs + pending badge`
4. `feat(volunteers): approve/reject/reactivate actions`
5. `feat(volunteers): admin-create flow via Supabase invite email`
6. `feat(volunteers): Google OAuth signup path + completion flow updates`
7. `chore(dev): seed-test-data button on admin dashboard`

## Risks

1. **Invite email infra.** Requires verified Resend sender domain in production. Dev uses Mailpit on port 54324. PR body will document the ops step.
2. **`/auth/callback` behavior for Google.** First implementation task audits the existing callback and confirms routing logic handles Google-fresh users.
3. **RLS drift on `volunteer_categories`.** Dedicated integration test blocks regression.
4. **Dev-seed leakage to production.** Double env-gate + 404 response; tracked in memory for removal before Phase-1 ship.
5. **Email immutability.** Update form displays "Email can't be changed" helper; schema excludes the field.
6. **Slug collisions under concurrent creates.** `UNIQUE` constraint + retry-with-suffix in `createCategory` helper.
7. **Invite token expiry.** Admin detail page offers "Resend invite" for unaccepted invites.

## Open items

None. All scoping questions resolved.
