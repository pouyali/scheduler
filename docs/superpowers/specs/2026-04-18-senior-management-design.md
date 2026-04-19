# Senior Management — Design

**Status:** Approved design, pending implementation plan
**Date:** 2026-04-18
**Sub-project of:** [Phase 1](./2026-04-18-phase-1-design.md)

## Objective

Build the admin surface for managing senior records. Seniors never log in; admins create and maintain these profiles on the seniors' behalf. This sub-project delivers CRUD, CSV bulk import, and a map view — everything the non-profit needs to onboard seniors and see their coverage area at a glance before the service-request sub-project lands.

## Scope

In scope:

- List with search, filters, pagination
- Create (single senior)
- Detail page with inline edit and an always-visible map for manual pin adjustment
- Soft-delete (archive) with a permanent-delete escape hatch (cascades through `service_requests` and `notifications`)
- CSV import (upload → preview → confirm, with error-report CSV)
- `/admin/map` — seniors-only map with city filter and Mapbox native clustering
- Geocoding on save, non-blocking: if Mapbox can't geocode, the record saves with null coords and the UI surfaces the missing location

Out of scope (handled in later sub-projects):

- Creating service requests from the senior detail page — stubbed as a read-only "Related activity" section
- Volunteer overlay on the map
- Analytics heatmap (belongs on `/admin/analytics`)
- Reverse geocoding when the admin drags the pin (explicit design decision: pin drag sets coords only, address text is whatever the admin typed from the phone call)

## Architecture

No new cross-cutting infrastructure. Server Components for the list, detail, and map pages; Server Actions for mutations; one route handler for CSV import (`/api/import/seniors`) and one for client-side single-address geocoding preview (`/api/geocode`). The `geocodeAddress()` helper from the Foundation sub-project is the only Mapbox touchpoint.

A new shared `MapView` component is introduced as the first real consumer of Mapbox GL JS. It is used by the senior detail page (single draggable pin) and the `/admin/map` surface (many pins with clustering).

## Data model

One migration, one new column, one partial index, one RPC function. Everything else on the `seniors` table is already in place from the Foundation migrations.

### Migration `0012_seniors_archived_at.sql`

```sql
alter table public.seniors
  add column archived_at timestamptz;

create index seniors_archived_at_idx on public.seniors (archived_at)
  where archived_at is null;

create or replace function public.delete_senior_cascade(p_senior_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admins where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  delete from public.notifications
   where request_id in (
     select id from public.service_requests where senior_id = p_senior_id
   );
  delete from public.service_requests where senior_id = p_senior_id;
  delete from public.seniors where id = p_senior_id;
end;
$$;

revoke all on function public.delete_senior_cascade(uuid) from public;
grant execute on function public.delete_senior_cascade(uuid) to authenticated;
```

The function runs `security definer` so it can remove rows across all three tables in a single transaction. It re-checks admin membership against `auth.uid()` before touching any data, so the RPC is safe even if a caller reaches it outside the Server Action path. The app layer still gates the call via `requireAdmin()` as the primary check.

### RLS

No RLS changes. `seniors` remains admin-only. Archived vs. active filtering is an app-layer concern, not a security boundary.

### Types

Regenerate TypeScript types after applying the migration:

```bash
npm run supabase:types
```

## Routes added

| Path                         | Kind               | Purpose                                                    |
| ---------------------------- | ------------------ | ---------------------------------------------------------- |
| `/admin/seniors`             | Server Component   | List + filters + search                                    |
| `/admin/seniors/new`         | Server Component   | Create form (client form inside)                           |
| `/admin/seniors/[id]`        | Server Component   | Detail: inline edit, inline map, archive/delete            |
| `/admin/seniors/import`      | Server Component   | CSV wizard: upload → preview → result                      |
| `/admin/map`                 | Server Component   | Seniors map with city filter and clustering                |
| `/api/import/seniors`        | Route handler POST | `step=preview` and `step=commit` for CSV import            |
| `/api/geocode`               | Route handler POST | Admin-only single-address geocode for live map preview     |

Server Actions live in `app/(admin)/admin/seniors/actions.ts` and are consumed by the create, detail, and import pages.

## UI

### List — `/admin/seniors`

Columns: **Name**, **Phone**, **City**, **Open requests** (count, links to requests list filtered by this senior once requests ship), **Last request** (date or em-dash), **Status badges** (`archived`, `not geocoded`).

Filters via URL search params (so links are shareable): `?q=`, `?city=`, `?archived=true`, `?not_geocoded=true`. Search matches first name, last name, phone, and `address_line1`.

Pagination: 50 per page, cursor-based on `(last_name, id)`.

Header actions: **New senior** → `/admin/seniors/new`; **Import CSV** → `/admin/seniors/import`.

Row click navigates to the detail page.

### Create — `/admin/seniors/new`

Single-column form (client component wrapping a Server Action):

- First name, last name, phone (NANP-format mask), email (optional)
- Address line 1, line 2 (optional), city, province (13-entry select), postal code (pattern `A1A 1A1`)
- Notes (textarea, optional)

Submit → `createSenior` Server Action:

1. Validate with Zod.
2. Call `geocodeAddress()` server-side. Failure is non-blocking — logged, `lat`/`lng` stay null.
3. Insert with `created_by = auth.uid()`.
4. `revalidatePath('/admin/seniors')`, redirect to `/admin/seniors/[id]`.

### Detail — `/admin/seniors/[id]`

Two-column layout on desktop (stacks on narrow screens). Layout matches mockup A from the brainstorming session: form on the left, inline map on the right.

**Contact + address form** (left column, editable inline):
Same fields as the create form.

**Location map** (right column, always visible):
`MapView` with a single draggable pin. Lat/lng numeric inputs sit below the map and stay in sync with the pin both directions (drag the pin, inputs update; type in the inputs, pin jumps). If the senior has no coords yet, the map centers on the Canadian province entered in the form (fallback: country view) and shows a "Drop pin" action that sets initial coords at the current map center.

**Related activity** (read-only):
A placeholder table/list of service requests for this senior. Shows "No requests yet" text until the service-requests sub-project ships. This section exists now so the layout doesn't shift later.

**Danger zone** (bottom, collapsed by default):
- If active: **Archive** button → `archiveSenior(id)` Server Action.
- If archived: **Unarchive** button → `unarchiveSenior(id)` Server Action, plus **Permanently delete** → modal requiring the admin to type the senior's full name, then calls `permanentlyDeleteSenior(id, typedName)` which verifies the typed name and invokes the `delete_senior_cascade` RPC.

**Save bar**:
Sticky at the bottom of the viewport, enabled only when the form is dirty. **Discard** reverts to server state.

**Re-geocode rule**:
If the admin drags the pin during this edit session, a hidden `manual_pin_override` form field is set to `true`. On save:

- `manual_pin_override = true` → keep the submitted lat/lng as-is, do not re-geocode.
- Otherwise → re-geocode from the (possibly edited) address text.

This preserves explicit overrides while still auto-geocoding when the admin is only fixing an address typo.

### Import wizard — `/admin/seniors/import`

Single page with a three-step stepper, no persisted draft state between steps.

**Step 1 — Upload.** File input + **Download template** link (`/templates/seniors-import.csv`). Submitting uploads the file to `/api/import/seniors` with `step=preview`.

**Step 2 — Preview.** Server response renders a table of all parsed rows. Each row shows:

- ✓ Valid and geocoded — included by default, checkbox on.
- ⚠ Valid but geocode failed — included by default (null coords), checkbox on, row highlighted yellow.
- ✗ Invalid (missing required field, bad phone, bad postal code) — excluded, checkbox disabled, error message shown in a trailing column.

Bulk helper above the table: **Uncheck all geocode-failed rows**.

Summary bar at top: `{valid} will be imported • {geocodeFailed} with warnings • {invalid} rejected`.

**Confirm** button submits to `/api/import/seniors` with `step=commit`. The payload re-sends the full parsed+geocoded row set from the preview response (re-validated server-side — client data is never trusted).

**Step 3 — Result.** Shows `Imported N of M`. If any rows were rejected or had warnings, offers a **Download error report** button that returns a CSV of the original row data plus a trailing `error` column.

### Map — `/admin/map`

Full-viewport `MapView`. Renders one pin per senior with `archived_at is null` and non-null coords. Clicking a pin opens a popup with the senior's name, city, and an **Open detail →** link.

Left-side filter panel: multi-select of cities present in the data (computed server-side from the current senior set). Pins filtered client-side from the initial payload — no re-fetch per filter change.

Clustering via Mapbox GL's native cluster layer; no custom clustering logic.

Top-of-page banner: `{N} seniors not shown (no coordinates) — Fix` linking to `/admin/seniors?not_geocoded=true`.

## Server code

### Server Actions — `app/(admin)/admin/seniors/actions.ts`

All wrap `requireAdmin()` and validate input with Zod.

- `createSenior(formData)` — validate → geocode → insert → revalidate → redirect.
- `updateSenior(id, formData)` — validate → decide geocode based on `manual_pin_override` → update → revalidate.
- `archiveSenior(id)` — sets `archived_at = now()`.
- `unarchiveSenior(id)` — clears `archived_at`.
- `permanentlyDeleteSenior(id, typedName)` — verifies typed name matches the senior's `{first_name} {last_name}`, then calls the `delete_senior_cascade` RPC.

### Query helpers — `lib/db/queries/seniors.ts`

Replace the existing stub with a typed set of helpers. Pages and route handlers never call `supabase.from('seniors')` directly (per `CLAUDE.md`).

```ts
listSeniors(supabase, {
  q?, city?, archived?, notGeocoded?, cursor?, limit?
}): Promise<{ rows, nextCursor }>
getSenior(supabase, id)
insertSenior(supabase, input)
updateSeniorRow(supabase, id, patch)
setArchived(supabase, id, value: boolean)
countsBySenior(supabase, seniorIds): Promise<Map<id, { openRequests, lastRequestDate }>>
```

`listSeniors` returns only the `seniors` rows; the list page calls `countsBySenior` once for the full page of IDs and merges the counts in memory. This avoids N+1 without introducing a database view.

Permanent delete is done via the RPC call directly from the server action, not via a helper (one-line call, no abstraction earned).

### `POST /api/import/seniors`

Multipart form with a `step` field. Admin auth required.

**`step=preview`:**

1. Parse the uploaded file as CSV (`papaparse`).
2. For each row (in order): validate with `seniorRowSchema` (Zod). Collect all validation errors per row rather than short-circuiting.
3. For valid rows, call `geocodeAddress()` with concurrency 5 via `pMap`.
4. Return `{ rows: PreviewRow[], summary: { total, valid, geocodeFailed, invalid } }` where `PreviewRow = { rowNumber, data, errors: string[], geocode: { lat, lng } | null }`.

**`step=commit`:**

1. Parse the payload of preview rows plus the admin's per-row checkbox state.
2. Re-validate every row server-side.
3. Insert only confirmed + valid rows in a single `insert()` call.
4. If any rows were rejected (checked by the admin but failing re-validation), or any rows were warnings the admin kept, compose an error-report CSV with all skipped rows plus a trailing `error` column.
5. Return `{ inserted, failed, errorCsv: base64 | null }`.

### `POST /api/geocode`

Admin-only, session-checked. Takes `{ address: string }`, returns the `GeocodeResult` from the existing helper. Used by the detail page to update the map preview as the admin types a new address, before they click save. Not used by the create/update server actions — they geocode inline.

### Validation — `lib/validations/seniors.ts`

Exports:

- `postalCodeRegex` — `/^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z] ?[0-9][ABCEGHJ-NPRSTV-Z][0-9]$/i`
- `phoneRegex` — lenient NANP pattern, plus a `normalizePhone(raw)` function that stores phones in a canonical form (e.g., `(604) 555-0134`).
- `seniorCreateSchema`, `seniorUpdateSchema` — form-data Zod schemas.
- `seniorRowSchema` — CSV-row Zod schema (same fields, different error messages tailored for row-level feedback).

### Constants — `lib/constants/provinces.ts`

13 Canadian provinces and territories as `readonly [{ code, name }]`. Used by the form select and by `seniorRowSchema` to validate `province`.

### CSV template — `public/templates/seniors-import.csv`

```csv
first_name,last_name,phone,email,address_line1,address_line2,city,province,postal_code,notes
Margaret,Chen,(604) 555-0134,margaret.chen@example.com,1245 Robson St,,Vancouver,BC,V6E 1B9,Prefers afternoon calls
```

### Components

- `components/map/MapView.tsx` — client component, wraps Mapbox GL JS. Props: `pins: { id, lat, lng, popup? }[]`, `onPinDrag?(id, lat, lng)`, `draggable?`, `cluster?`, `initialCenter?`, `initialZoom?`. Loads the Mapbox public token from `NEXT_PUBLIC_MAPBOX_TOKEN`.
- `components/ui/status-badge.tsx` — small colored dot + label, variants for `archived`, `not-geocoded`, and future statuses.

## Testing

### Unit (Vitest, co-located)

- `lib/validations/seniors.test.ts` — postal code regex accepts `V6E 1B9` and `V6E1B9`, rejects `D1A 1A1`; phone regex and `normalizePhone`; `seniorCreateSchema` and `seniorRowSchema` happy paths and error cases.
- `lib/constants/provinces.test.ts` — length 13, codes unique and two-letter.
- `lib/csv/parse-seniors.test.ts` — pure CSV-to-validated-rows function extracted from the route handler. Tests: header required, missing required field flagged, extra columns ignored, empty rows skipped, BOM tolerated.
- `lib/csv/error-report.test.ts` — composes the error-report CSV from a mix of valid and invalid rows; asserts the `error` column and row ordering.

### Integration (Vitest, `tests/integration/`, local Supabase)

- `seniors-crud.test.ts` — insert, update, archive, unarchive via query helpers. Asserts `updated_at` trigger fires on update and that `archived_at` flips correctly.
- `seniors-rls.test.ts` — extend the existing RLS test to confirm archived seniors are still admin-only (volunteer role sees zero rows whether archived or not).
- `seniors-cascade-delete.test.ts` — create a senior with 2 `service_requests` and several `notifications`, call the `delete_senior_cascade` RPC, assert all three tables are clean for that senior.
- `seniors-import-preview.test.ts` — drive the preview logic end-to-end with a fixture CSV (6 rows: 4 valid, 1 missing required field, 1 with an un-geocodable address). Mapbox HTTP calls are stubbed via `msw`, consistent with the existing `lib/mapbox/geocode.test.ts` pattern. Asserts the preview response shape and the row classifications.

### E2E (Playwright, `tests/e2e/`)

- `admin-senior-lifecycle.spec.ts` — admin logs in → creates a senior → detail page shows a geocoded pin → edits address → pin updates on save → archives → list hides the row → unarchives → list shows the row again.

CSV import is covered at the integration layer rather than E2E; file upload + Mapbox stubbing in a real browser is fiddly, and the interesting logic is the preview classification.

### Fixtures

- `tests/fixtures/seniors-valid.csv` — 3 rows, all geocodable (real Vancouver addresses).
- `tests/fixtures/seniors-mixed.csv` — 6 rows spanning valid, invalid, and geocode-failing cases.
- `tests/fixtures/mapbox-responses/` — JSON fixtures keyed by address string for the MSW stub.

## Conventions (from `CLAUDE.md`, applied here)

- All DB reads/writes go through `lib/db/queries/seniors.ts`; pages and route handlers never touch `supabase.from('seniors')` directly.
- Server Components by default; `'use client'` only for the create/edit form wrapper, `MapView`, and the import wizard's step components.
- Server Actions for all mutations; route handlers only for the CSV import (streaming form data) and the admin geocode endpoint.
- Re-run `npm run supabase:types` after applying `0012_seniors_archived_at.sql`.
- Per `AGENTS.md`: read `node_modules/next/dist/docs/` before writing Next-specific code.

## Open items

None. All decisions captured during the brainstorming session are resolved in this spec.
