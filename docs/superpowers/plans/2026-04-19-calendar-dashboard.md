# Admin Calendar + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/admin/calendar` + a real `/admin` dashboard, and fold in the `requested_date` → `requested_at timestamptz` schema change that the calendar depends on.

**Architecture:** Migration first; regenerate types; cascade-update every call site (queries, forms, Server Actions, templates, tests); then new feature surfaces — dashboard (Server Components with pre-fetched data) and calendar (Server Component shell wrapping a client `react-big-calendar` component with URL-backed filter state).

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind 4, shadcn/ui, Supabase, `react-big-calendar` (new dep), `Intl.DateTimeFormat` for tz math, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-04-19-calendar-dashboard-design.md](../specs/2026-04-19-calendar-dashboard-design.md)

## Testing conventions (read before starting)

- **App-layer code (queries, Server Actions, helpers): strict TDD.** Failing test → minimal implementation → passing → commit.
- **SQL (migrations): integration-test-after.** Write migration, regen types, run existing suites + new ones.
- **Never mock Supabase in integration tests.** Local Supabase via `npm run supabase:start`.
- **Resend stubbed via `NotificationService`.**
- Integration tests live under `tests/integration/**/*.test.ts`; E2E under `tests/e2e/**/*.spec.ts`.
- Tests self-seed with `Date.now() + Math.random()`-unique emails.

## Milestone map

1. **Schema ripple (DB + queries + types):** Tasks 1–3 — migration, query helpers updated, existing integration tests fixed.
2. **App-layer ripple:** Tasks 4–7 — expiry rewrite, datetime helper, forms, email templates, admin/volunteer pages, seniors query.
3. **Dashboard:** Tasks 8–11 — helpers + stat cards + upcoming list + activity feed + page assembly.
4. **Calendar:** Tasks 12–14 — query helper, react-big-calendar install + shell + filters.
5. **E2E + polish:** Tasks 15–17 — update existing specs, new dashboard + calendar specs, lint/typecheck/PR.

---

## Task 1: Migration — `requested_date` → `requested_at timestamptz`

**Files:**
- Create: `supabase/migrations/0021_requested_at_timestamptz.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0021_requested_at_timestamptz.sql`:

```sql
-- 0021_requested_at_timestamptz.sql
-- Replace `requested_date date` with `requested_at timestamptz`.
-- Dev-only data migrates as: noon local America/Toronto on the same calendar day.

drop index if exists public.service_requests_status_date_idx;

alter table public.service_requests add column requested_at timestamptz;

update public.service_requests
set requested_at = (requested_date::timestamp at time zone 'America/Toronto') + interval '12 hours';

alter table public.service_requests alter column requested_at set not null;
alter table public.service_requests drop column requested_date;

create index service_requests_status_requested_at_idx
  on public.service_requests(status, requested_at);
```

- [ ] **Step 2: Apply + regen types**

```bash
npm run supabase:reset
npm run supabase:types
```

Expected: migration applies cleanly; `lib/db/types.ts` gains `requested_at: string` and drops `requested_date` from the `service_requests.Row` type.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0021_requested_at_timestamptz.sql lib/db/types.ts
git commit -m "feat(calendar): migration — requested_date -> requested_at timestamptz"
```

---

## Task 2: Update query helpers and fix existing integration tests

**Files:**
- Modify: `lib/db/queries/service-requests.ts`
- Modify: `lib/db/queries/seniors.ts`
- Modify: all existing integration tests that reference `requested_date`

- [ ] **Step 1: Update `lib/db/queries/service-requests.ts`**

Find-and-replace `requested_date` → `requested_at` everywhere. The callouts:

- `ListFilters.cursor` type becomes `{ requested_at: string; id: string } | null`.
- `listServiceRequests`:
  - `q = q.gte("requested_date", filters.dateFrom)` → `q = q.gte("requested_at", filters.dateFrom)`.
  - `q = q.lte("requested_date", filters.dateTo)` → `q = q.lte("requested_at", filters.dateTo)`.
  - The cursor `OR` clause: `requested_date.lt.${d}` → `requested_at.lt.${d}`, `requested_date.eq.${d}` → `requested_at.eq.${d}`.
  - `.order("requested_date", ...)` → `.order("requested_at", ...)`.
  - `nextCursor: last ? { requested_date: last.requested_date, id: last.id }` → `{ requested_at: last.requested_at, id: last.id }`.
- `CreateInput.requested_date: string` → `requested_at: string` (ISO timestamp).
- `UpdateInput.requested_date` → `requested_at`.
- `LOCKED_WHEN_NOTIFIED` array: replace `"requested_date"` with `"requested_at"`.

- [ ] **Step 2: Update `lib/db/queries/seniors.ts`**

The file reads `requested_date` inside `listSeniors` / similar. Replace:

```ts
.select("senior_id, status, requested_date")
```
with
```ts
.select("senior_id, status, requested_at")
```

And the aggregation:
```ts
if (!entry.lastRequestDate || r.requested_date > entry.lastRequestDate) {
  entry.lastRequestDate = r.requested_date;
}
```
becomes:
```ts
if (!entry.lastRequestAt || r.requested_at > entry.lastRequestAt) {
  entry.lastRequestAt = r.requested_at;
}
```

Rename the returned property `lastRequestDate` → `lastRequestAt` across this file. Update the exported type accordingly.

- [ ] **Step 3: Update all existing integration-test fixtures**

Every occurrence of `requested_date: "2030-01-01"` (or any `YYYY-MM-DD` literal) in `tests/integration/*.test.ts` becomes `requested_at: "2030-01-01T12:00:00-04:00"` (noon Toronto = 16:00 UTC in EDT; use the `-04:00` offset for dates Apr–Oct, `-05:00` for Nov–Mar, or use `"2030-01-01T17:00:00Z"` explicitly). Simplest: use `"2030-01-01T17:00:00.000Z"` uniformly — EST offset — because Jan is winter.

Go file-by-file and swap. The files (confirmed via grep):
- `tests/integration/consume-response-token.test.ts`
- `tests/integration/service-requests-crud.test.ts`
- `tests/integration/update-request-action.test.ts`
- `tests/integration/admin-request-lifecycle.test.ts`
- `tests/integration/send-invites-action.test.ts`
- `tests/integration/volunteer-respond-portal.test.ts`
- `tests/integration/respond-route.test.ts`
- `tests/integration/rls-service-requests.test.ts`
- `tests/integration/new-request-action.test.ts`

Cursor-using tests (if any) in `service-requests-crud.test.ts` also need the key swap.

- [ ] **Step 4: Run the integration suite**

```bash
npm run test:integration
```

Expected: all green. If a test still references `lastRequestDate` (from seniors queries), update that too.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/service-requests.ts lib/db/queries/seniors.ts tests/integration/
git commit -m "feat(calendar): swap requested_date -> requested_at in queries + fixtures"
```

---

## Task 3: Rewrite `computeTokenExpiry`

**Files:**
- Modify: `lib/service-requests/expiry.ts`
- Modify: `lib/service-requests/expiry.test.ts`

- [ ] **Step 1: Rewrite the test**

Replace `lib/service-requests/expiry.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { computeTokenExpiry } from "./expiry";

describe("computeTokenExpiry", () => {
  test("requested_at far in the future returns requested_at", () => {
    const now = new Date("2026-05-10T10:00:00Z");
    const requestedAt = "2026-05-20T14:00:00Z";
    const out = computeTokenExpiry(requestedAt, now);
    expect(out.toISOString()).toBe(requestedAt);
  });

  test("requested_at within 24h returns now+24h", () => {
    const now = new Date("2026-05-10T10:00:00Z");
    const requestedAt = "2026-05-10T20:00:00Z";
    const out = computeTokenExpiry(requestedAt, now);
    expect(out.toISOString()).toBe("2026-05-11T10:00:00.000Z");
  });

  test("requested_at in the past returns now+24h", () => {
    const now = new Date("2026-05-10T10:00:00Z");
    const out = computeTokenExpiry("2026-05-01T10:00:00Z", now);
    expect(out.toISOString()).toBe("2026-05-11T10:00:00.000Z");
  });

  test("tie at exactly now+24h — floor wins (non-strict comparison)", () => {
    const now = new Date("2026-05-10T10:00:00Z");
    const requestedAt = "2026-05-11T10:00:00Z";
    const out = computeTokenExpiry(requestedAt, now);
    expect(out.toISOString()).toBe("2026-05-11T10:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- lib/service-requests/expiry.test
```

Expected: FAIL (existing implementation returns the wrong shape for the new inputs).

- [ ] **Step 3: Rewrite the implementation**

Replace `lib/service-requests/expiry.ts`:

```typescript
export function computeTokenExpiry(
  requestedAtIso: string,
  now: Date = new Date(),
): Date {
  const requestedAt = new Date(requestedAtIso);
  const floor = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return requestedAt.getTime() > floor.getTime() ? requestedAt : floor;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- lib/service-requests/expiry.test
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/service-requests/expiry.ts lib/service-requests/expiry.test.ts
git commit -m "feat(calendar): simplify token expiry for timestamptz schema"
```

---

## Task 4: Date/time helper — `combineDateTimeToIso` + `splitIsoToDateTime`

**Files:**
- Create: `lib/service-requests/datetime.ts`
- Create: `lib/service-requests/datetime.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/service-requests/datetime.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { combineDateTimeToIso, splitIsoToDateTime } from "./datetime";

describe("combineDateTimeToIso", () => {
  test("typical summer day — EDT (-04:00)", () => {
    const iso = combineDateTimeToIso("2026-06-15", "14:30");
    expect(iso).toBe("2026-06-15T18:30:00.000Z");
  });

  test("typical winter day — EST (-05:00)", () => {
    const iso = combineDateTimeToIso("2026-12-06", "16:30");
    expect(iso).toBe("2026-12-06T21:30:00.000Z");
  });

  test("fall-back boundary (2026-11-01 01:30 is ambiguous; prefer EST)", () => {
    const iso = combineDateTimeToIso("2026-11-01", "01:30");
    // 01:30 EST (-05:00) = 06:30 UTC
    expect(iso).toBe("2026-11-01T06:30:00.000Z");
  });
});

describe("splitIsoToDateTime", () => {
  test("summer round-trip", () => {
    const iso = combineDateTimeToIso("2026-06-15", "14:30");
    expect(splitIsoToDateTime(iso)).toEqual({ date: "2026-06-15", time: "14:30" });
  });

  test("winter round-trip", () => {
    const iso = combineDateTimeToIso("2026-12-06", "16:30");
    expect(splitIsoToDateTime(iso)).toEqual({ date: "2026-12-06", time: "16:30" });
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- lib/service-requests/datetime.test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/service-requests/datetime.ts`:

```typescript
const TZ = "America/Toronto";

export function combineDateTimeToIso(
  dateStr: string,
  timeStr: string,
  tz: string = TZ,
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  // Construct a wall-clock UTC guess, then correct for the tz offset at that instant.
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
  const offsetMs = tzOffsetMs(guess, tz);
  return new Date(guess.getTime() - offsetMs).toISOString();
}

export function splitIsoToDateTime(
  iso: string,
  tz: string = TZ,
): { date: string; time: string } {
  const at = new Date(iso);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map(p => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

function tzOffsetMs(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute), Number(parts.second),
  );
  return asUtc - at.getTime();
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- lib/service-requests/datetime.test
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/service-requests/datetime.ts lib/service-requests/datetime.test.ts
git commit -m "feat(calendar): combineDateTimeToIso + splitIsoToDateTime helpers"
```

---

## Task 5: Update admin new-request form + Server Action for time input

**Files:**
- Modify: `app/(admin)/admin/requests/new/new-request-form.tsx`
- Modify: `app/(admin)/admin/requests/new/actions.ts`
- Modify: `tests/integration/new-request-action.test.ts`

- [ ] **Step 1: Update the test**

In `tests/integration/new-request-action.test.ts`, update the "creates a request for a real senior" assertion:

```typescript
// Replace the test body that passes requested_date: "2030-01-01" with:
const { _createRequestForAdmin } = await import("@/app/(admin)/admin/requests/new/actions");
const req = await _createRequestForAdmin(admin, {
  senior_id: s!.id, category: "transportation", priority: "normal",
  requested_at: "2030-01-01T17:00:00.000Z", description: "x",
}, a.userId);
expect(req.status).toBe("open");
```

Also update the "rejects invalid payload" test to use `requested_at: ""` instead of `requested_date: ""`.

- [ ] **Step 2: Update the Server Action**

In `app/(admin)/admin/requests/new/actions.ts`:

Replace the Zod schema:

```typescript
import { combineDateTimeToIso } from "@/lib/service-requests/datetime";

const Schema = z.object({
  senior_id: z.string().uuid({ message: "Please pick a senior." }),
  category: z.string().min(1, "Category is required."),
  priority: z.enum(["low", "normal", "high"]),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.").optional(),
  requested_time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a valid time.").optional(),
  requested_at: z.string().datetime().optional(),
  description: z.string().max(2000).optional().default(""),
}).refine(
  (v) => v.requested_at || (v.requested_date && v.requested_time),
  { message: "Pick a date and time.", path: ["requested_date"] },
);
```

Then in the action, after `safeParse`:

```typescript
const data = parsed.data;
const requested_at = data.requested_at
  ?? combineDateTimeToIso(data.requested_date!, data.requested_time!);
```

Pass `requested_at` to `_createRequestForAdmin`, which should take `requested_at` instead of `requested_date`:

```typescript
export async function _createRequestForAdmin(
  supabase: SupabaseClient<Database>,
  input: { senior_id: string; category: string; priority: "low" | "normal" | "high"; requested_at: string; description?: string },
  adminId: string,
) {
  return createServiceRequest(supabase, {
    senior_id: input.senior_id,
    category: input.category,
    priority: input.priority,
    requested_at: input.requested_at,
    description: input.description || null,
    created_by: adminId,
  });
}
```

- [ ] **Step 3: Update the form component**

In `app/(admin)/admin/requests/new/new-request-form.tsx`, replace the single "Requested date" `<Input type="date">` block with two side-by-side inputs:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <Label htmlFor="requested_date">Date</Label>
    <Input id="requested_date" type="date" name="requested_date" />
    {errors.requested_date && (
      <p className="text-sm italic text-muted-foreground">{errors.requested_date}</p>
    )}
  </div>
  <div>
    <Label htmlFor="requested_time">Time</Label>
    <Input id="requested_time" type="time" name="requested_time" step={900} />
    {errors.requested_time && (
      <p className="text-sm italic text-muted-foreground">{errors.requested_time}</p>
    )}
  </div>
</div>
```

- [ ] **Step 4: Run the integration test**

```bash
npm run test:integration -- new-request-action
```

Expected: 2/2 PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/admin/requests/new/ tests/integration/new-request-action.test.ts
git commit -m "feat(calendar): date+time inputs on admin new-request form"
```

---

## Task 6: Update admin edit form, detail header, list page, and Server Actions

**Files:**
- Modify: `app/(admin)/admin/requests/[id]/edit/edit-form.tsx`
- Modify: `app/(admin)/admin/requests/[id]/edit/page.tsx`
- Modify: `app/(admin)/admin/requests/[id]/edit/actions.ts`
- Modify: `app/(admin)/admin/requests/[id]/detail-header.tsx`
- Modify: `app/(admin)/admin/requests/[id]/actions.ts`
- Modify: `app/(admin)/admin/requests/page.tsx`

- [ ] **Step 1: Update the edit form**

In `app/(admin)/admin/requests/[id]/edit/edit-form.tsx`:

- Import `splitIsoToDateTime` from `@/lib/service-requests/datetime`.
- Change the `defaults` prop type from `{ ...; requested_date: string; ... }` to `{ ...; requested_at: string; ... }`.
- In the component body, derive the default date/time once:
  ```tsx
  const { date: defaultDate, time: defaultTime } = splitIsoToDateTime(defaults.requested_at);
  ```
- Replace the single date input block with the date+time grid from Task 5, using `defaultValue={defaultDate}` and `defaultValue={defaultTime}` respectively, and `disabled={locked}` on both.
- Inside `onSubmit`, when `locked`, include only `priority` + `description` (unchanged). When not locked, combine:
  ```tsx
  const payload = Object.fromEntries(fd.entries());
  if (!locked && payload.requested_date && payload.requested_time) {
    (payload as Record<string, string>).requested_at =
      combineDateTimeToIso(
        String(payload.requested_date),
        String(payload.requested_time),
      );
    delete (payload as Record<string, unknown>).requested_date;
    delete (payload as Record<string, unknown>).requested_time;
  }
  const res = await updateRequestAction(requestId, payload);
  ```
  Add `import { combineDateTimeToIso } from "@/lib/service-requests/datetime";` at the top.

- [ ] **Step 2: Update the edit page**

In `app/(admin)/admin/requests/[id]/edit/page.tsx`, change the `defaults` object:
```tsx
defaults={{
  category: request.category,
  priority: request.priority,
  requested_at: request.requested_at,
  description: request.description,
}}
```

- [ ] **Step 3: Update the edit action's Zod schema**

In `app/(admin)/admin/requests/[id]/edit/actions.ts`:

```typescript
const Schema = z.object({
  senior_id: z.string().uuid().optional(),
  category: z.string().min(1).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  requested_at: z.string().datetime().optional(),
  description: z.string().max(2000).nullable().optional(),
});
```

(Drop `requested_date`.)

- [ ] **Step 4: Update the detail header**

In `app/(admin)/admin/requests/[id]/detail-header.tsx`, replace:
```tsx
{request.requested_date} · ...
```
with:
```tsx
{new Date(request.requested_at).toLocaleString("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ...
```

- [ ] **Step 5: Update `actions.ts` (sendInvites / reassign / retry email templates)**

In `app/(admin)/admin/requests/[id]/actions.ts`:

- All `computeTokenExpiry(req.requested_date)` calls become `computeTokenExpiry(req.requested_at)`.
- All `requestedDate: req.requested_date` inside `renderServiceRequestInvite` / `renderRequestCancelled` calls become `requestedAt: req.requested_at`. This implies template inputs change — confirm in Task 7 below; keep this consistent.

- [ ] **Step 6: Update the admin list page**

In `app/(admin)/admin/requests/page.tsx`, replace:
```tsx
<td className="py-2">{r.requested_date}</td>
```
with:
```tsx
<td className="py-2">
  {new Date(r.requested_at).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })}
</td>
```

- [ ] **Step 7: Run tests**

```bash
npm run test:integration -- update-request-action admin-request-lifecycle send-invites-action
npm run typecheck
```

Expected: all green (the integration tests already have updated fixtures from Task 2).

- [ ] **Step 8: Commit**

```bash
git add app/\(admin\)/admin/requests/
git commit -m "feat(calendar): admin edit/detail/list render requested_at timestamps"
```

---

## Task 7: Update email templates to accept `requestedAt` ISO timestamps

**Files:**
- Modify: `lib/notifications/templates/service-request-invite.ts`
- Modify: `lib/notifications/templates/service-request-invite.test.ts`
- Modify: `lib/notifications/templates/request-cancelled.ts`
- Modify: `lib/notifications/templates/request-cancelled.test.ts`

- [ ] **Step 1: Update invite template input type and rendering**

In `lib/notifications/templates/service-request-invite.ts`:

- Change input field `requestedDate: string` → `requestedAt: string` (ISO timestamp).
- Change the `prettyDate` line:
  ```typescript
  const prettyDate = new Date(input.requestedAt).toLocaleString("en-CA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Toronto",
  });
  ```

- [ ] **Step 2: Update invite template test**

In `lib/notifications/templates/service-request-invite.test.ts`, change `requestedDate: "2026-05-20"` to `requestedAt: "2026-05-20T17:00:00.000Z"` in the `baseInput` object.

- [ ] **Step 3: Update cancellation template the same way**

In `lib/notifications/templates/request-cancelled.ts`:

- Rename input field `requestedDate` → `requestedAt`.
- Same `prettyDate` pattern.

In `lib/notifications/templates/request-cancelled.test.ts`, rename fixture fields.

- [ ] **Step 4: Update call sites**

Call sites live in `app/(admin)/admin/requests/[id]/actions.ts` (already touched in Task 6). Change `requestedDate: req.requested_date` → `requestedAt: req.requested_at` at every call to `renderServiceRequestInvite` and `renderRequestCancelled`.

- [ ] **Step 5: Run template tests + action tests**

```bash
npm test -- service-request-invite request-cancelled
npm run test:integration -- send-invites-action admin-request-lifecycle
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/notifications/templates/ app/\(admin\)/admin/requests/\[id\]/actions.ts
git commit -m "feat(calendar): email templates accept requestedAt ISO timestamps"
```

---

## Task 8: Update volunteer pages + seniors helper

**Files:**
- Modify: `app/(volunteer)/volunteer/dashboard/page.tsx`
- Modify: `app/(volunteer)/volunteer/history/page.tsx`
- Modify: `app/(volunteer)/volunteer/requests/[id]/page.tsx`
- Modify: `lib/db/queries/seniors.ts` (if it emits to the senior-detail page)

- [ ] **Step 1: Update volunteer dashboard**

In `app/(volunteer)/volunteer/dashboard/page.tsx`:

- Change the invites query selector: `id, category, requested_date, description, status` → `id, category, requested_at, description, status`.
- In the mapping, rename `req.requested_date` → `req.requested_at` and rename `requestedDate` field on the `Invite` type to `requestedAt` (both here and in `invite-card.tsx`).
- Change the upcoming query: select `requested_at`, filter `.gte("requested_at", new Date().toISOString())` (was `gte("requested_date", today)`), order `.order("requested_at")`.
- Where the page rendered `{r.requested_date}`, replace with:
  ```tsx
  {new Date(r.requested_at).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })}
  ```

- [ ] **Step 2: Update `invite-card.tsx`**

In `app/(volunteer)/volunteer/dashboard/invite-card.tsx`:
- Rename type field `requestedDate` → `requestedAt`.
- In the JSX where it renders `<time>{invite.requestedDate}</time>`, format with the same locale-string call used above.

- [ ] **Step 3: Update volunteer history**

In `app/(volunteer)/volunteer/history/page.tsx`:
- Selector: `id, category, requested_date, status` → `id, category, requested_at, status`.
- `.or(\`status.eq.completed,and(status.eq.accepted,requested_date.lt.${today})\`)` → `.or(\`status.eq.completed,and(status.eq.accepted,requested_at.lt.${new Date().toISOString()})\`)`.
- `.order("requested_date", ...)` → `.order("requested_at", ...)`.
- Render cell: `<td>{r.requested_date}</td>` → formatted timestamp.

- [ ] **Step 4: Update volunteer request detail**

In `app/(volunteer)/volunteer/requests/[id]/page.tsx`:
- Selector: `id, category, requested_date, description, status` → `id, category, requested_at, description, status`.
- Render: `{r.category} · {r.requested_date}` → `{r.category} · ` + formatted timestamp.

- [ ] **Step 5: Update `lib/db/queries/seniors.ts`**

Already covered in Task 2. Double-check that `lastRequestAt` consumers (likely the admin senior detail page) render correctly; update any rendering call site to format ISO.

- [ ] **Step 6: Typecheck + any affected component tests**

```bash
npm run typecheck
npm test
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/\(volunteer\)/ lib/db/queries/seniors.ts
git commit -m "feat(calendar): volunteer pages render requested_at timestamps"
```

---

## Task 9: Dashboard query helpers

**Files:**
- Modify: `lib/db/queries/service-requests.ts` (append new exports)
- Create: `tests/integration/dashboard-queries.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/dashboard-queries.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";
import {
  getDashboardCounts,
  listUpcomingRequestsForDashboard,
  listRecentActivity,
} from "@/lib/db/queries/service-requests";

describe("dashboard queries", () => {
  test("getDashboardCounts returns per-status request counts + volunteer/senior counts", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`d-counts-${Date.now()}-${Math.random()}@t.local`);
    await createVolunteerUser(`d-v-${Date.now()}-${Math.random()}@t.local`, "pending");
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();
    await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: "2030-01-01T17:00:00.000Z", description: "x", created_by: a.userId, status: "open",
    });

    const counts = await getDashboardCounts(admin);
    expect(counts.openRequests).toBeGreaterThan(0);
    expect(counts.pendingVolunteers).toBeGreaterThan(0);
    expect(counts.activeSeniors).toBeGreaterThan(0);
    expect(counts).toHaveProperty("awaitingResponse");
  });

  test("listUpcomingRequestsForDashboard returns in-window non-terminal rows, ordered asc", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`d-upc-${Date.now()}-${Math.random()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const now = new Date();
    const in1day = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
    const in6days = new Date(now.getTime() + 6 * 24 * 3600 * 1000).toISOString();
    const in10days = new Date(now.getTime() + 10 * 24 * 3600 * 1000).toISOString();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

    const mk = async (ts: string, status: "open" | "notified" | "accepted" | "cancelled") => {
      const row: Record<string, unknown> = {
        senior_id: s!.id, category: "transportation", priority: "normal",
        requested_at: ts, description: "x", created_by: a.userId, status,
      };
      if (status === "accepted") {
        const v = await createVolunteerUser(`upc-v-${Date.now()}-${Math.random()}@t.local`, "active");
        row.assigned_volunteer_id = v.userId;
      }
      const { data } = await admin.from("service_requests").insert(row).select().single();
      return data!.id;
    };
    const id1 = await mk(in1day, "open");
    const id2 = await mk(in6days, "notified");
    await mk(in10days, "open");        // out of window
    await mk(yesterday, "open");       // past
    await mk(in1day, "cancelled");     // terminal

    const rows = await listUpcomingRequestsForDashboard(admin, { days: 7, limit: 10 });
    const ids = rows.map(r => r.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    expect(ids.indexOf(id1)).toBeLessThan(ids.indexOf(id2));
  });

  test("listRecentActivity returns merged chronological events with click-through ids", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`d-act-${Date.now()}-${Math.random()}@t.local`);
    const v = await createVolunteerUser(`d-v-act-${Date.now()}-${Math.random()}@t.local`, "active");
    const { data: s } = await admin.from("seniors").insert({
      first_name: "Jane", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const { data: r } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: "2030-01-01T17:00:00.000Z", description: "ride", created_by: a.userId, status: "notified",
    }).select().single();

    await admin.from("notifications").insert({
      request_id: r!.id, volunteer_id: v.userId, channel: "email", status: "sent", event_type: "invite",
    });
    await admin.from("response_tokens").insert({
      token: `act-${Date.now()}-${Math.random()}`, request_id: r!.id, volunteer_id: v.userId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used_at: new Date().toISOString(), action: "accept",
    });

    const events = await listRecentActivity(admin, 20);
    const forThisRequest = events.filter(e => e.requestId === r!.id);
    expect(forThisRequest.some(e => e.kind === "created")).toBe(true);
    expect(forThisRequest.some(e => e.kind === "accepted")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test:integration -- dashboard-queries
```

Expected: FAIL — helpers not exported.

- [ ] **Step 3: Append helpers to `lib/db/queries/service-requests.ts`**

```typescript
export type DashboardCounts = {
  openRequests: number;
  awaitingResponse: number;
  pendingVolunteers: number;
  activeSeniors: number;
};

export async function getDashboardCounts(supabase: Client): Promise<DashboardCounts> {
  const [openR, notR, pendV, actS] = await Promise.all([
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "notified"),
    supabase.from("volunteers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("seniors").select("id", { count: "exact", head: true }).is("archived_at", null),
  ]);
  return {
    openRequests: openR.count ?? 0,
    awaitingResponse: notR.count ?? 0,
    pendingVolunteers: pendV.count ?? 0,
    activeSeniors: actS.count ?? 0,
  };
}

export type UpcomingRow = {
  id: string;
  category: string;
  requested_at: string;
  status: Status;
  senior_first_name: string;
  senior_city: string;
};

export async function listUpcomingRequestsForDashboard(
  supabase: Client,
  opts: { days?: number; limit?: number } = {},
): Promise<UpcomingRow[]> {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 10;
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const { data, error } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_at, status,
      seniors:seniors!inner(first_name, city)
    `)
    .gte("requested_at", now.toISOString())
    .lte("requested_at", until.toISOString())
    .in("status", ["open", "notified", "accepted"])
    .order("requested_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((r) => {
    // Supabase JS join cast — same pattern as listRecipientsForRequest.
    const s = (r as unknown as { seniors: { first_name: string; city: string } }).seniors;
    return {
      id: r.id, category: r.category, requested_at: r.requested_at, status: r.status,
      senior_first_name: s.first_name, senior_city: s.city,
    };
  });
}

export type DashboardActivityEvent = {
  at: string;
  kind: "created" | "broadcast" | "accepted" | "declined" | "cancelled" | "reopened" | "completed";
  text: string;
  requestId: string;
};

export async function listRecentActivity(
  supabase: Client,
  limit: number = 20,
): Promise<DashboardActivityEvent[]> {
  // 1) status-transition events
  const { data: reqs } = await supabase
    .from("service_requests")
    .select(`
      id, cancelled_at, cancelled_reason, reopened_at, completed_at, created_at,
      seniors:seniors!inner(first_name)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  // 2) broadcast events (first notification sent_at per request)
  const { data: notifs } = await supabase
    .from("notifications")
    .select("request_id, sent_at")
    .order("sent_at", { ascending: false })
    .limit(200);
  const firstBroadcast = new Map<string, string>();
  const countPerRequest = new Map<string, number>();
  for (const n of (notifs ?? []).slice().reverse()) {
    if (!firstBroadcast.has(n.request_id)) firstBroadcast.set(n.request_id, n.sent_at);
    countPerRequest.set(n.request_id, (countPerRequest.get(n.request_id) ?? 0) + 1);
  }

  // 3) per-invite responses
  const { data: tokens } = await supabase
    .from("response_tokens")
    .select(`
      request_id, action, used_at,
      volunteers:volunteers!inner(first_name, last_name),
      service_requests:service_requests!inner(seniors:seniors!inner(first_name))
    `)
    .not("used_at", "is", null)
    .order("used_at", { ascending: false })
    .limit(50);

  const events: DashboardActivityEvent[] = [];

  for (const r of reqs ?? []) {
    const senior = (r as unknown as { seniors: { first_name: string } }).seniors.first_name;
    events.push({ at: r.created_at, kind: "created", text: `Request created for ${senior}`, requestId: r.id });
    const bc = firstBroadcast.get(r.id);
    if (bc) {
      const n = countPerRequest.get(r.id) ?? 0;
      events.push({ at: bc, kind: "broadcast", text: `Broadcast to ${n} volunteer${n === 1 ? "" : "s"} for ${senior}`, requestId: r.id });
    }
    if (r.cancelled_at) {
      const reason = r.cancelled_reason ? ` (${r.cancelled_reason})` : "";
      events.push({ at: r.cancelled_at, kind: "cancelled", text: `Request cancelled for ${senior}${reason}`, requestId: r.id });
    }
    if (r.reopened_at) events.push({ at: r.reopened_at, kind: "reopened", text: `Admin reopened request for ${senior}`, requestId: r.id });
    if (r.completed_at) events.push({ at: r.completed_at, kind: "completed", text: `Request completed for ${senior}`, requestId: r.id });
  }

  for (const t of tokens ?? []) {
    if (!t.used_at) continue;
    const vol = (t as unknown as { volunteers: { first_name: string; last_name: string } }).volunteers;
    const reqSen = (t as unknown as { service_requests: { seniors: { first_name: string } } }).service_requests.seniors;
    const who = `${vol.first_name} ${vol.last_name}`;
    if (t.action === "accept") {
      events.push({ at: t.used_at, kind: "accepted", text: `${who} accepted ${reqSen.first_name}'s request`, requestId: t.request_id });
    } else if (t.action === "decline") {
      events.push({ at: t.used_at, kind: "declined", text: `${who} declined ${reqSen.first_name}'s request`, requestId: t.request_id });
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events.slice(0, limit);
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm run test:integration -- dashboard-queries
```

Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/service-requests.ts tests/integration/dashboard-queries.test.ts
git commit -m "feat(dashboard): query helpers — counts, upcoming, recent activity"
```

---

## Task 10: Dashboard components (StatCard, UpcomingList, ActivityFeed)

**Files:**
- Create: `app/(admin)/admin/dashboard/stat-card.tsx`
- Create: `app/(admin)/admin/dashboard/stat-row.tsx`
- Create: `app/(admin)/admin/dashboard/upcoming-list.tsx`
- Create: `app/(admin)/admin/dashboard/activity-feed.tsx`

- [ ] **Step 1: Implement `StatCard`**

Create `app/(admin)/admin/dashboard/stat-card.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";

export function StatCard({
  title, count, href, linkText,
}: { title: string; count: number; href: string; linkText: string }) {
  return (
    <Card className="p-4 space-y-2">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-semibold">{count}</p>
      <Link href={href} className="text-sm underline underline-offset-2">{linkText}</Link>
    </Card>
  );
}
```

- [ ] **Step 2: Implement `StatRow`**

Create `app/(admin)/admin/dashboard/stat-row.tsx`:

```tsx
import type { DashboardCounts } from "@/lib/db/queries/service-requests";
import { StatCard } from "./stat-card";

export function StatRow({ counts }: { counts: DashboardCounts }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard title="Open requests" count={counts.openRequests} href="/admin/requests?status=open" linkText="View open →" />
      <StatCard title="Awaiting response" count={counts.awaitingResponse} href="/admin/requests?status=notified" linkText="View notified →" />
      <StatCard title="Pending volunteers" count={counts.pendingVolunteers} href="/admin/volunteers?status=pending" linkText="Review →" />
      <StatCard title="Active seniors" count={counts.activeSeniors} href="/admin/seniors" linkText="View all →" />
    </div>
  );
}
```

- [ ] **Step 3: Implement `UpcomingList`**

Create `app/(admin)/admin/dashboard/upcoming-list.tsx`:

```tsx
import Link from "next/link";
import type { UpcomingRow } from "@/lib/db/queries/service-requests";
import { StatusBadge } from "@/components/ui/status-badge";

const DT_FMT: Intl.DateTimeFormatOptions = {
  timeZone: "America/Toronto",
  weekday: "short", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit",
};

export function UpcomingList({ rows }: { rows: UpcomingRow[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="text-h3">Upcoming requests</h3>
        <p className="mt-2 text-muted-foreground text-sm">Nothing scheduled this week.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-h3">Upcoming requests</h3>
      <ul className="mt-2 divide-y divide-border rounded-[var(--radius)] border border-border">
        {rows.map(r => (
          <li key={r.id} className="p-3">
            <Link href={`/admin/requests/${r.id}`} className="flex items-center gap-3 hover:underline">
              <span className="text-sm w-48">{new Date(r.requested_at).toLocaleString("en-CA", DT_FMT)}</span>
              <StatusBadge variant={r.status}>{r.status}</StatusBadge>
              <span className="text-sm">{r.senior_first_name} · {r.category}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ActivityFeed`**

Create `app/(admin)/admin/dashboard/activity-feed.tsx`:

```tsx
import Link from "next/link";
import type { DashboardActivityEvent } from "@/lib/db/queries/service-requests";

function relative(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ events }: { events: DashboardActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div>
        <h3 className="text-h3">Recent activity</h3>
        <p className="mt-2 text-muted-foreground text-sm">No activity yet.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-h3">Recent activity</h3>
      <ol className="mt-2 space-y-1 text-sm">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3">
            <time className="w-24 text-muted-foreground">{relative(e.at)}</time>
            <Link href={`/admin/requests/${e.requestId}`} className="hover:underline">{e.text}</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/admin/dashboard/
git commit -m "feat(dashboard): StatCard, StatRow, UpcomingList, ActivityFeed"
```

---

## Task 11: Assemble the dashboard at `/admin`

**Files:**
- Modify: `app/(admin)/admin/page.tsx`

- [ ] **Step 1: Rewrite the admin landing page**

Replace `app/(admin)/admin/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDashboardCounts,
  listUpcomingRequestsForDashboard,
  listRecentActivity,
} from "@/lib/db/queries/service-requests";
import { StatRow } from "./dashboard/stat-row";
import { UpcomingList } from "./dashboard/upcoming-list";
import { ActivityFeed } from "./dashboard/activity-feed";
import { DevTools } from "./dev-tools";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [counts, upcoming, activity] = await Promise.all([
    getDashboardCounts(supabase),
    listUpcomingRequestsForDashboard(supabase, { days: 7, limit: 10 }),
    listRecentActivity(supabase, 20),
  ]);

  const showDevTools =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";

  return (
    <div className="space-y-6">
      <h2 className="text-h2">Dashboard</h2>
      <StatRow counts={counts} />
      <UpcomingList rows={upcoming} />
      <ActivityFeed events={activity} />
      {showDevTools ? <DevTools /> : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Manual smoke check**

```bash
npm run dev
```
Visit `http://localhost:3000/admin` as `admin@local.test / password123!`. Confirm all four sections render and counts match reality. Seed some data via DevTools if empty.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/admin/page.tsx
git commit -m "feat(dashboard): assemble /admin — stats, upcoming, activity"
```

---

## Task 12: Calendar query helper + install react-big-calendar

**Files:**
- Modify: `package.json` (add dep)
- Modify: `lib/db/queries/service-requests.ts` (append `listCalendarEvents`)
- Create: `tests/integration/calendar-queries.test.ts`

- [ ] **Step 1: Install the calendar library**

```bash
npm install react-big-calendar
npm install -D @types/react-big-calendar
```

Expected: `package.json` gains both deps. Commit `package.json` + `package-lock.json` at the end of this task along with the helper.

- [ ] **Step 2: Write the failing query test**

Create `tests/integration/calendar-queries.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser } from "./helpers";
import { listCalendarEvents } from "@/lib/db/queries/service-requests";

describe("listCalendarEvents", () => {
  test("returns in-window events with joined senior first name", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`cal-${Date.now()}-${Math.random()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "Jane", last_name: "Doe", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const now = new Date();
    const in5d = new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString();
    const in90d = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString();

    const { data: r1 } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: in5d, description: "x", created_by: a.userId, status: "open",
    }).select().single();
    await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: in90d, description: "x", created_by: a.userId, status: "open",
    });

    const from = new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString();
    const events = await listCalendarEvents(admin, { from, to });
    const found = events.find(e => e.id === r1!.id);
    expect(found).toBeDefined();
    expect(found!.title).toContain("Jane");
    expect(found!.title).toContain("transportation");
    expect(found!.start.getTime()).toBe(new Date(in5d).getTime());
    expect(found!.end.getTime() - found!.start.getTime()).toBe(60 * 60 * 1000);
    expect(events.find(e => e.start.getTime() === new Date(in90d).getTime())).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
npm run test:integration -- calendar-queries
```

Expected: FAIL — helper not exported.

- [ ] **Step 4: Append helper to `lib/db/queries/service-requests.ts`**

```typescript
export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    status: Status;
    category: string;
    assigneeId: string | null;
    requestId: string;
  };
};

export async function listCalendarEvents(
  supabase: Client,
  range: { from: string; to: string },
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_at, status, assigned_volunteer_id,
      seniors:seniors!inner(first_name)
    `)
    .gte("requested_at", range.from)
    .lte("requested_at", range.to)
    .order("requested_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((r) => {
    const s = (r as unknown as { seniors: { first_name: string } }).seniors;
    const start = new Date(r.requested_at);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      id: r.id,
      title: `${s.first_name} · ${r.category}`,
      start,
      end,
      resource: {
        status: r.status,
        category: r.category,
        assigneeId: r.assigned_volunteer_id,
        requestId: r.id,
      },
    };
  });
}
```

- [ ] **Step 5: Run — expect pass**

```bash
npm run test:integration -- calendar-queries
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/db/queries/service-requests.ts tests/integration/calendar-queries.test.ts
git commit -m "feat(calendar): install react-big-calendar + listCalendarEvents helper"
```

---

## Task 13: Calendar page, shell, and filters

**Files:**
- Create: `app/(admin)/admin/calendar/page.tsx`
- Create: `app/(admin)/admin/calendar/calendar-shell.tsx`
- Create: `app/(admin)/admin/calendar/calendar-filters.tsx`
- Modify: `app/globals.css` (import react-big-calendar CSS + add status class styles)

- [ ] **Step 1: Import calendar CSS + add event status classes**

Append to `app/globals.css`:

```css
@import "react-big-calendar/lib/css/react-big-calendar.css";

.rbc-event.rbc-event--open { background-color: hsl(var(--status-open) / 0.9); }
.rbc-event.rbc-event--notified { background-color: hsl(var(--status-notified) / 0.9); }
.rbc-event.rbc-event--accepted { background-color: hsl(var(--status-accepted) / 0.9); }
.rbc-event.rbc-event--completed { background-color: hsl(var(--muted) / 0.9); }
.rbc-event.rbc-event--cancelled {
  background-color: hsl(var(--destructive) / 0.7);
  text-decoration: line-through;
}
```

If DESIGN.md defines different token names, use those instead. The point is: five visually-distinct colors keyed off status, sourced from design tokens, not hardcoded hex.

- [ ] **Step 2: Implement the calendar shell**

Create `app/(admin)/admin/calendar/calendar-shell.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import { format } from "date-fns/format";
import { parse } from "date-fns/parse";
import { startOfWeek } from "date-fns/startOfWeek";
import { getDay } from "date-fns/getDay";
import { enCA } from "date-fns/locale/en-CA";
import type { CalendarEvent } from "@/lib/db/queries/service-requests";
import { CalendarFilters, type Filters } from "./calendar-filters";

const localizer = dateFnsLocalizer({
  format, parse, startOfWeek,
  getDay, locales: { "en-CA": enCA },
});

export function CalendarShell({
  events,
  categories,
  volunteers,
  fetchedFrom,
  fetchedTo,
}: {
  events: CalendarEvent[];
  categories: { slug: string; name: string }[];
  volunteers: { id: string; first_name: string; last_name: string }[];
  fetchedFrom: string;
  fetchedTo: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [view, setView] = useState<View>("month");

  const filters: Filters = useMemo(() => ({
    status: (sp.get("status")?.split(",").filter(Boolean) as Filters["status"]) ?? ["open", "notified", "accepted"],
    category: sp.get("category")?.split(",").filter(Boolean) ?? categories.map(c => c.slug),
    assignee: sp.get("assignee") ?? "all",
  }), [sp, categories]);

  const visible = useMemo(() => events.filter(e => {
    if (!filters.status.includes(e.resource.status)) return false;
    if (!filters.category.includes(e.resource.category)) return false;
    if (filters.assignee === "unassigned" && e.resource.assigneeId) return false;
    if (filters.assignee !== "all" && filters.assignee !== "unassigned" &&
        filters.assignee !== e.resource.assigneeId) return false;
    return true;
  }), [events, filters]);

  const onChange = (next: Filters) => {
    const params = new URLSearchParams();
    if (next.status.length) params.set("status", next.status.join(","));
    if (next.category.length) params.set("category", next.category.join(","));
    if (next.assignee !== "all") params.set("assignee", next.assignee);
    router.replace(`/admin/calendar?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <CalendarFilters
        value={filters}
        categories={categories}
        volunteers={volunteers}
        onChange={onChange}
      />
      <p className="text-xs text-muted-foreground">
        Showing events between {fetchedFrom.slice(0, 10)} and {fetchedTo.slice(0, 10)}. Navigate beyond this range and reload to recentre.
      </p>
      <div style={{ height: 640 }}>
        <Calendar
          localizer={localizer}
          events={visible}
          views={["month", "week", "agenda"]}
          view={view}
          onView={setView}
          defaultView="month"
          onSelectEvent={(e) => router.push(`/admin/requests/${(e as CalendarEvent).resource.requestId}`)}
          eventPropGetter={(e) => ({ className: `rbc-event--${(e as CalendarEvent).resource.status}` })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement filters component**

Create `app/(admin)/admin/calendar/calendar-filters.tsx`:

```tsx
"use client";

import type { Database } from "@/lib/db/types";

type Status = Database["public"]["Enums"]["request_status"];
const ALL_STATUSES: Status[] = ["open", "notified", "accepted", "completed", "cancelled"];

export type Filters = {
  status: Status[];
  category: string[];
  assignee: string; // volunteer UUID, "all", or "unassigned"
};

export function CalendarFilters({
  value, categories, volunteers, onChange,
}: {
  value: Filters;
  categories: { slug: string; name: string }[];
  volunteers: { id: string; first_name: string; last_name: string }[];
  onChange: (next: Filters) => void;
}) {
  const toggleStatus = (s: Status) => {
    const next = value.status.includes(s)
      ? value.status.filter(x => x !== s)
      : [...value.status, s];
    onChange({ ...value, status: next });
  };
  const toggleCategory = (slug: string) => {
    const next = value.category.includes(slug)
      ? value.category.filter(x => x !== slug)
      : [...value.category, slug];
    onChange({ ...value, category: next });
  };
  const setAssignee = (id: string) => onChange({ ...value, assignee: id });

  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="flex gap-1">
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            aria-pressed={value.status.includes(s)}
            className={`rounded-[var(--radius)] border px-2 py-1 text-xs uppercase ${
              value.status.includes(s) ? "bg-muted" : "text-muted-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap">
        {categories.map(c => (
          <button
            key={c.slug}
            type="button"
            onClick={() => toggleCategory(c.slug)}
            aria-pressed={value.category.includes(c.slug)}
            className={`rounded-[var(--radius)] border px-2 py-1 text-xs ${
              value.category.includes(c.slug) ? "bg-muted" : "text-muted-foreground"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <select
        value={value.assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="rounded-[var(--radius)] border px-2 py-1 text-sm"
      >
        <option value="all">All assignees</option>
        <option value="unassigned">Unassigned</option>
        {volunteers.map(v => (
          <option key={v.id} value={v.id}>{v.first_name} {v.last_name}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Implement the calendar page (server component)**

Create `app/(admin)/admin/calendar/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCalendarEvents } from "@/lib/db/queries/service-requests";
import { CalendarShell } from "./calendar-shell";

export default async function AdminCalendarPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString();
  const to = new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString();

  const [events, catsRes, volsRes] = await Promise.all([
    listCalendarEvents(supabase, { from, to }),
    supabase.from("volunteer_categories").select("slug, name").is("archived_at", null).order("name"),
    supabase.from("volunteers").select("id, first_name, last_name").eq("status", "active").order("last_name"),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-h2">Calendar</h2>
      <CalendarShell
        events={events}
        categories={catsRes.data ?? []}
        volunteers={volsRes.data ?? []}
        fetchedFrom={from}
        fetchedTo={to}
      />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean. Note: `CalendarEvent` from `react-big-calendar` is a different type than ours; we pass our own type and let the library treat it as a generic event via TypeScript widening. If typecheck errors about event types, cast to `any` in the `Calendar` props with an eslint-disable comment OR use `Calendar<CalendarEvent>`.

- [ ] **Step 6: Manual smoke check**

```bash
npm run dev
```
Navigate `/admin/calendar`. Confirm: events render colored by status, clicking navigates to detail, filter chips narrow events client-side, URL updates with filter state.

- [ ] **Step 7: Commit**

```bash
git add app/\(admin\)/admin/calendar/ app/globals.css
git commit -m "feat(calendar): /admin/calendar page + shell + filters"
```

---

## Task 14: Navigation — add Calendar link to the admin shell

**Files:**
- Modify: the admin layout or nav component that lists admin routes (find via `grep -l "/admin/requests" app/(admin)/**/*.tsx` or check `app/(admin)/admin/layout.tsx`).

- [ ] **Step 1: Locate and update the admin nav**

```bash
grep -l "Admin" app/\(admin\)/admin/layout.tsx app/\(admin\)/**/*.tsx
```

Find the nav section that lists Requests / Volunteers / Seniors / Map. Add a Calendar link `<Link href="/admin/calendar">Calendar</Link>` consistent with the existing pattern. Place it between Requests and Volunteers.

- [ ] **Step 2: Typecheck + manual check**

```bash
npm run typecheck
npm run dev
```
Confirm the link shows and navigates.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/layout.tsx  # or wherever the nav lives
git commit -m "feat(calendar): add Calendar link to admin nav"
```

---

## Task 15: E2E — update existing specs for date+time inputs

**Files:**
- Modify: `tests/e2e/admin-request-broadcast-accept.spec.ts`
- Modify: `tests/e2e/volunteer-portal-accept.spec.ts`
- Modify: `tests/e2e/admin-cancel-with-notify.spec.ts`

- [ ] **Step 1: Update `admin-request-broadcast-accept.spec.ts`**

Find the form fill:
```typescript
await page.fill("input[name=requested_date]", "2030-06-01");
```
Replace with:
```typescript
await page.fill("input[name=requested_date]", "2030-06-01");
await page.fill("input[name=requested_time]", "10:00");
```

- [ ] **Step 2: Update `volunteer-portal-accept.spec.ts`**

Find the seeding insert for `service_requests`:
```typescript
requested_date: "2030-06-01",
```
Replace with:
```typescript
requested_at: "2030-06-01T14:00:00.000Z",
```

- [ ] **Step 3: Update `admin-cancel-with-notify.spec.ts`**

Same seeding change as Step 2.

- [ ] **Step 4: Run**

```bash
npm run supabase:reset && npm run seed:admin
npm run test:e2e -- admin-request-broadcast-accept volunteer-portal-accept admin-cancel-with-notify
```

Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/
git commit -m "test(calendar): e2e — adapt existing specs to date+time inputs"
```

---

## Task 16: New E2E specs — calendar + dashboard smoke

**Files:**
- Create: `tests/e2e/admin-calendar-navigation.spec.ts`
- Create: `tests/e2e/admin-dashboard.spec.ts`

- [ ] **Step 1: Write calendar smoke spec**

Create `tests/e2e/admin-calendar-navigation.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin opens calendar, sees event, clicks through", async ({ page }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();

  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;

  const { data: senior } = await svc.from("seniors").insert({
    first_name: "Cal", last_name: "Test", phone: "416-555-9999",
    address_line1: "1 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();

  const soon = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  const { data: req } = await svc.from("service_requests").insert({
    senior_id: senior!.id, category: "transportation", priority: "normal",
    requested_at: soon, description: "cal smoke", created_by: adminId, status: "open",
  }).select().single();

  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.goto("/admin/calendar");

  await expect(page.getByText(/Cal · transportation/)).toBeVisible();
  await page.getByText(/Cal · transportation/).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/requests/${req!.id}`));
});
```

- [ ] **Step 2: Write dashboard smoke spec**

Create `tests/e2e/admin-dashboard.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin dashboard shows stat cards + upcoming list + activity feed", async ({ page }) => {
  const svc = createClient(URL, SERVICE);

  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;

  // Seed an open request in the next 7 days + an accepted event in activity.
  const { data: senior } = await svc.from("seniors").insert({
    first_name: "Dash", last_name: "Smoke", phone: "416-555-0000",
    address_line1: "1 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();

  const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  await svc.from("service_requests").insert({
    senior_id: senior!.id, category: "transportation", priority: "normal",
    requested_at: soon, description: "x", created_by: adminId, status: "open",
  });

  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.goto("/admin");

  await expect(page.getByText(/Open requests/)).toBeVisible();
  await expect(page.getByText(/Upcoming requests/)).toBeVisible();
  await expect(page.getByText(/Dash · transportation/)).toBeVisible();
  await expect(page.getByText(/Recent activity/)).toBeVisible();
});
```

- [ ] **Step 3: Run**

```bash
npm run supabase:reset && npm run seed:admin
npm run test:e2e -- admin-calendar-navigation admin-dashboard
```

Expected: 2/2 PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/admin-calendar-navigation.spec.ts tests/e2e/admin-dashboard.spec.ts
git commit -m "test(calendar): e2e smoke — calendar navigation + dashboard"
```

---

## Task 17: Final checks + PR

**Files:** none (runs checks, opens PR).

- [ ] **Step 1: Full suite**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: 0 errors. If any warning is in a file you touched, fix it. Pre-existing warnings in `app/(admin)/admin/seniors/actions.ts` are tolerable.

- [ ] **Step 2: Integration suite**

```bash
npm run test:integration
```

Expected: all green.

- [ ] **Step 3: E2E**

```bash
npm run supabase:reset && npm run seed:admin
npm run test:e2e
```

Expected: all green.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/calendar-dashboard
gh pr create --base develop --title "feat: admin calendar + dashboard" --body "$(cat <<'EOF'
## Summary

- Schema: `service_requests.requested_date` (date) → `requested_at` (timestamptz). Token expiry simplified to "appointment time or now+24h, whichever is later."
- Admin dashboard at `/admin`: four stat cards (Open / Awaiting response / Pending volunteers / Active seniors), Upcoming requests (next 7 days, top 10), Recent activity (last 20 events across status transitions + per-invite responses).
- Admin calendar at `/admin/calendar` (react-big-calendar, Month/Week/Agenda): events colored by status, click → request detail, filter chips for status / category / assignee with URL-backed state.
- Deferred to next sub-project: `/admin/analytics` with charts (recharts) + geographic heatmap.

## Migrations

- 0021 `requested_at timestamptz` (replaces `requested_date`).

## Test plan

- [ ] `npm run lint && npm run typecheck && npm test` green.
- [ ] `npm run test:integration` green (includes new dashboard-queries + calendar-queries tests).
- [ ] `npm run supabase:reset && npm run seed:admin && npm run test:e2e` green (adds admin-calendar-navigation + admin-dashboard specs; updates existing 3 for date+time inputs).
- [ ] Manually: create a request at a specific time; confirm it shows on the calendar at that time, on the admin list with timestamp, on the volunteer dashboard invite card with timestamp.
- [ ] Manually: filter chips on calendar narrow events and persist via URL; clicking an event lands on request detail.
- [ ] Manually: dashboard counts match a spot-check via `/admin/requests?status=...`.

## Known workflow note

Integration tests truncate tables and drop the dev admin. Running E2E after integration requires `npm run supabase:reset && npm run seed:admin` between them — same as PR #7.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL.

---

## Plan self-review notes

- Spec coverage: migration (Task 1), queries ripple (Task 2), expiry rewrite (Task 3), datetime helper (Task 4), admin forms (Tasks 5–6), email templates (Task 7), volunteer pages (Task 8), dashboard helpers + components + page (Tasks 9–11), calendar helper + install + page (Tasks 12–13), nav link (Task 14), E2E ripple + new specs (Tasks 15–16), final checks + PR (Task 17).
- Placeholders: none. Every code step shows full code.
- Type consistency: `CalendarEvent.resource.requestId` appears in both the query helper (Task 12) and the calendar shell's click handler (Task 13). `DashboardActivityEvent` shape matches between query (Task 9) and `ActivityFeed` (Task 10). `UpcomingRow` matches between query (Task 9) and `UpcomingList` (Task 10). `DashboardCounts` fields line up with `StatRow` (Task 10). `splitIsoToDateTime` / `combineDateTimeToIso` signatures match across Tasks 4 / 5 / 6.
