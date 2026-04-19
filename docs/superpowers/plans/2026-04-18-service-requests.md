# Service Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the end-to-end Service Requests lifecycle — admin create/edit/cancel/reopen/reassign, ranked eligibility + multi-select broadcast, atomic magic-link accept via RPC, and volunteer portal accept/decline.

**Architecture:** Next.js 16 App Router with Server Components + Server Actions for admin and volunteer mutations. Public `/respond/[token]` route handler uses the service-role Supabase client. A security-definer Postgres RPC (`consume_response_token`) is the sole path to the `accepted` state, called from both the public route and the volunteer portal. Resend emails sent after DB writes commit, tracked in `notifications.status`.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind 4, shadcn/ui, Supabase (Postgres + Auth + RLS), Resend, Vitest, Playwright, Zod.

**Spec:** [docs/superpowers/specs/2026-04-18-service-requests-design.md](../specs/2026-04-18-service-requests-design.md)

## Testing conventions (read before starting)

- **App-layer code (queries, Server Actions, matching, templates, route handlers): strict TDD.** Write a failing test first, see it fail, implement, see it pass, commit.
- **SQL (migration + RPC + triggers): integration-test-after.** You can't meaningfully TDD a CREATE TABLE. Write the migration, then write integration tests that exercise it end-to-end.
- **Never mock Supabase in integration tests.** Local Supabase (`npm run supabase:start`) is the test DB.
- **Resend is always stubbed** behind `NotificationService` — tests instantiate a fake that records sends.
- Helpers live at [tests/integration/helpers.ts](../../../tests/integration/helpers.ts). Use `adminClient()` (service role), `anonClient()` (anon key), `createAdminUser()`, `createVolunteerUser()`, plus new helpers you add in Task 2.
- `npm run supabase:reset` is run automatically by `tests/integration/setup.ts` before each integration test run. No manual state reset needed between tests — but each test should create its own users/rows with unique emails to avoid collisions.

## Milestone map

1. **Foundation (DB):** migration + RPC + types regen (Tasks 1–3)
2. **Pure logic:** matching, expiry, templates (Tasks 4–6)
3. **DB queries:** typed read/write helpers (Task 7)
4. **Public magic-link flow:** route handler + result pages (Task 8)
5. **Admin surface:** list → new → detail → send → edit/cancel/reopen/reassign/complete (Tasks 9–14)
6. **Volunteer surface:** dashboard cards + portal respond + detail + history (Tasks 15–17)
7. **E2E + polish:** Playwright, design-system pass, cleanup (Tasks 18–20)

---

## Task 1: Migration — schema changes for Service Requests Phase 1

**Files:**
- Create: `supabase/migrations/0015_service_requests_phase1.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0015_service_requests_phase1.sql`:

```sql
-- 0015_service_requests_phase1.sql
-- Schema additions for the Service Requests sub-project.

-- service_requests: cancellation + reopen bookkeeping
alter table public.service_requests
  add column cancelled_at timestamptz,
  add column cancelled_reason text,
  add column reopened_at timestamptz;

-- Integrity: accepted status always has an assignee.
alter table public.service_requests
  add constraint service_requests_accepted_has_assignee
  check (status <> 'accepted' or assigned_volunteer_id is not null);

-- Speed up "does this senior already have an open/notified request" checks.
create index service_requests_senior_open_idx
  on public.service_requests(senior_id)
  where status in ('open', 'notified');

-- notifications: distinguish invite vs cancellation vs reassignment email
create type notification_event_type as enum ('invite', 'cancellation', 'reassignment_invite');

alter table public.notifications
  add column event_type notification_event_type not null default 'invite';
```

- [ ] **Step 2: Apply the migration**

Run: `npm run supabase:reset`
Expected: Migration applies cleanly through 0015. No errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0015_service_requests_phase1.sql
git commit -m "feat(requests): migration — cancellation/reopen columns + event_type"
```

---

## Task 2: RPC — `consume_response_token` (atomic accept/decline)

**Files:**
- Create: `supabase/migrations/0016_consume_response_token.sql`
- Create: `tests/integration/consume-response-token.test.ts`

- [ ] **Step 1: Write the RPC SQL**

Create `supabase/migrations/0016_consume_response_token.sql`:

```sql
-- 0016_consume_response_token.sql
-- Atomic accept/decline for magic-link tokens.
-- Returns jsonb { outcome, request_id? } where outcome ∈
-- 'accepted' | 'declined' | 'already_filled' | 'expired' | 'invalid'.

create or replace function public.consume_response_token(
  p_token text,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.response_tokens%rowtype;
  v_req_status request_status;
  v_req_id uuid;
  v_updated int;
begin
  if p_action not in ('accept', 'decline') then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  select * into v_token
  from public.response_tokens
  where token = p_token
  for update;

  if not found then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if v_token.used_at is not null then
    -- If it was superseded by a sibling accept, surface that distinction.
    if v_token.action = 'superseded' then
      return jsonb_build_object('outcome', 'already_filled', 'request_id', v_token.request_id);
    end if;
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if v_token.expires_at <= now() then
    return jsonb_build_object('outcome', 'expired');
  end if;

  select status into v_req_status
  from public.service_requests
  where id = v_token.request_id
  for update;

  if v_req_status in ('accepted', 'completed', 'cancelled') then
    return jsonb_build_object('outcome', 'already_filled', 'request_id', v_token.request_id);
  end if;

  if p_action = 'decline' then
    update public.response_tokens
    set used_at = now(), action = 'decline', updated_at = now()
    where id = v_token.id;
    return jsonb_build_object('outcome', 'declined', 'request_id', v_token.request_id);
  end if;

  -- Accept path: atomically transition the request.
  update public.service_requests
  set status = 'accepted',
      assigned_volunteer_id = v_token.volunteer_id,
      updated_at = now()
  where id = v_token.request_id
    and status in ('open', 'notified')
    and assigned_volunteer_id is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('outcome', 'already_filled', 'request_id', v_token.request_id);
  end if;

  update public.response_tokens
  set used_at = now(), action = 'accept', updated_at = now()
  where id = v_token.id;

  -- The existing 0009 trigger supersedes sibling tokens on status → accepted.

  return jsonb_build_object('outcome', 'accepted', 'request_id', v_token.request_id);
end;
$$;

revoke all on function public.consume_response_token(text, text) from public;
grant execute on function public.consume_response_token(text, text) to service_role;
```

- [ ] **Step 2: Apply the migration**

Run: `npm run supabase:reset`
Expected: Migration applies cleanly.

- [ ] **Step 3: Regenerate Supabase types**

Run: `npm run supabase:types`
Expected: `lib/db/types.ts` updated with `consume_response_token` function + `notification_event_type` enum + new columns on `service_requests`/`notifications`.

- [ ] **Step 4: Commit SQL + types**

```bash
git add supabase/migrations/0016_consume_response_token.sql lib/db/types.ts
git commit -m "feat(requests): consume_response_token RPC + regen types"
```

- [ ] **Step 5: Write integration tests for the RPC**

Create `tests/integration/consume-response-token.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";

async function seedRequest(opts: {
  seniorCity?: string;
  category?: string;
  requestedDaysAhead?: number;
}) {
  const admin = adminClient();
  const ts = Date.now();
  const a = await createAdminUser(`a-${ts}@test.local`);
  const v1 = await createVolunteerUser(`v1-${ts}@test.local`, "active");
  const v2 = await createVolunteerUser(`v2-${ts}@test.local`, "active");

  const { data: senior, error: sErr } = await admin.from("seniors").insert({
    first_name: "Jane",
    last_name: "Doe",
    phone: "416-555-0000",
    address_line1: "1 Main St",
    city: opts.seniorCity ?? "Toronto",
    province: "ON",
    postal_code: "M1A 1A1",
    created_by: a.userId,
  }).select().single();
  if (sErr) throw sErr;

  const requestedDate = new Date();
  requestedDate.setDate(requestedDate.getDate() + (opts.requestedDaysAhead ?? 7));

  const { data: req, error: rErr } = await admin.from("service_requests").insert({
    senior_id: senior.id,
    category: opts.category ?? "transportation",
    priority: "normal",
    requested_date: requestedDate.toISOString().slice(0, 10),
    description: "Test request",
    created_by: a.userId,
    status: "notified",
  }).select().single();
  if (rErr) throw rErr;

  const expiresAt = new Date(requestedDate);
  expiresAt.setHours(23, 59, 59, 999);

  const makeToken = async (volunteerId: string, token: string) => {
    const { error } = await admin.from("response_tokens").insert({
      token,
      request_id: req.id,
      volunteer_id: volunteerId,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;
    await admin.from("notifications").insert({
      request_id: req.id,
      volunteer_id: volunteerId,
      channel: "email",
      status: "sent",
      event_type: "invite",
    });
  };

  const t1 = `tok-${ts}-1`;
  const t2 = `tok-${ts}-2`;
  await makeToken(v1.userId, t1);
  await makeToken(v2.userId, t2);

  return { admin, request: req, senior, v1, v2, t1, t2 };
}

describe("consume_response_token", () => {
  test("accept transitions request, marks token used, supersedes siblings", async () => {
    const { admin, request, v1, t1, t2 } = await seedRequest({});
    const { data, error } = await admin.rpc("consume_response_token", {
      p_token: t1,
      p_action: "accept",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ outcome: "accepted", request_id: request.id });

    const { data: req } = await admin.from("service_requests").select("*").eq("id", request.id).single();
    expect(req?.status).toBe("accepted");
    expect(req?.assigned_volunteer_id).toBe(v1.userId);

    const { data: tok1 } = await admin.from("response_tokens").select("*").eq("token", t1).single();
    expect(tok1?.action).toBe("accept");
    expect(tok1?.used_at).not.toBeNull();

    const { data: tok2 } = await admin.from("response_tokens").select("*").eq("token", t2).single();
    expect(tok2?.action).toBe("superseded");
    expect(tok2?.used_at).not.toBeNull();
  });

  test("second accept on same request returns already_filled", async () => {
    const { admin, request, t1, t2 } = await seedRequest({});
    await admin.rpc("consume_response_token", { p_token: t1, p_action: "accept" });
    const { data } = await admin.rpc("consume_response_token", {
      p_token: t2,
      p_action: "accept",
    });
    expect(data).toMatchObject({ outcome: "already_filled", request_id: request.id });
  });

  test("decline marks token used, does not change request status", async () => {
    const { admin, request, t1 } = await seedRequest({});
    const { data } = await admin.rpc("consume_response_token", {
      p_token: t1,
      p_action: "decline",
    });
    expect(data).toMatchObject({ outcome: "declined", request_id: request.id });
    const { data: req } = await admin.from("service_requests").select("status").eq("id", request.id).single();
    expect(req?.status).toBe("notified");
  });

  test("expired token returns expired", async () => {
    const { admin, request, v1 } = await seedRequest({});
    const token = `expired-${Date.now()}`;
    const past = new Date(Date.now() - 60_000).toISOString();
    await admin.from("response_tokens").insert({
      token,
      request_id: request.id,
      volunteer_id: v1.userId,
      expires_at: past,
    });
    const { data } = await admin.rpc("consume_response_token", { p_token: token, p_action: "accept" });
    expect(data).toMatchObject({ outcome: "expired" });
  });

  test("reused token returns invalid", async () => {
    const { admin, t1 } = await seedRequest({});
    await admin.rpc("consume_response_token", { p_token: t1, p_action: "decline" });
    const { data } = await admin.rpc("consume_response_token", { p_token: t1, p_action: "accept" });
    expect(data).toMatchObject({ outcome: "invalid" });
  });

  test("unknown token returns invalid", async () => {
    const { admin } = await seedRequest({});
    const { data } = await admin.rpc("consume_response_token", { p_token: "does-not-exist", p_action: "accept" });
    expect(data).toMatchObject({ outcome: "invalid" });
  });

  test("invalid action returns invalid", async () => {
    const { admin, t1 } = await seedRequest({});
    const { data } = await admin.rpc("consume_response_token", { p_token: t1, p_action: "nope" });
    expect(data).toMatchObject({ outcome: "invalid" });
  });
});
```

- [ ] **Step 6: Run the integration tests**

Run: `npm run test:integration -- consume-response-token`
Expected: All 7 tests pass.

- [ ] **Step 7: Commit**

```bash
git add tests/integration/consume-response-token.test.ts
git commit -m "test(requests): integration — consume_response_token outcomes"
```

---

## Task 3: RLS — confirm volunteers cannot read other volunteers' request rows

**Files:**
- Create: `tests/integration/rls-service-requests.test.ts`

- [ ] **Step 1: Write the failing RLS tests**

Create `tests/integration/rls-service-requests.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function authClientFor(email: string) {
  const c = createClient<Database>(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: "password123!" });
  if (error) throw error;
  return c;
}

describe("RLS — service_requests and notifications", () => {
  test("volunteer cannot read a request they were not notified about", async () => {
    const admin = adminClient();
    const ts = Date.now();
    const a = await createAdminUser(`a-${ts}@t.local`);
    const vA = await createVolunteerUser(`va-${ts}@t.local`, "active");
    const vB = await createVolunteerUser(`vb-${ts}@t.local`, "active");

    const { data: senior } = await admin.from("seniors").insert({
      first_name: "S", last_name: "X", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const { data: req } = await admin.from("service_requests").insert({
      senior_id: senior!.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
    }).select().single();

    // Notify only vA.
    await admin.from("notifications").insert({
      request_id: req!.id, volunteer_id: vA.userId, channel: "email", status: "sent", event_type: "invite",
    });

    const clientB = await authClientFor(vB.email);
    const { data: visible } = await clientB.from("service_requests").select("id").eq("id", req!.id);
    expect(visible ?? []).toEqual([]);
  });

  test("volunteer can read a request they were notified about", async () => {
    const admin = adminClient();
    const ts = Date.now();
    const a = await createAdminUser(`a2-${ts}@t.local`);
    const vA = await createVolunteerUser(`va2-${ts}@t.local`, "active");

    const { data: senior } = await admin.from("seniors").insert({
      first_name: "S", last_name: "X", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const { data: req } = await admin.from("service_requests").insert({
      senior_id: senior!.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
    }).select().single();

    await admin.from("notifications").insert({
      request_id: req!.id, volunteer_id: vA.userId, channel: "email", status: "sent", event_type: "invite",
    });

    const clientA = await authClientFor(vA.email);
    const { data } = await clientA.from("service_requests").select("id").eq("id", req!.id);
    expect(data?.length).toBe(1);
  });

  test("volunteer cannot read seniors directly", async () => {
    const admin = adminClient();
    const ts = Date.now();
    const v = await createVolunteerUser(`v-sen-${ts}@t.local`, "active");
    const a = await createAdminUser(`a-sen-${ts}@t.local`);
    await admin.from("seniors").insert({
      first_name: "S", last_name: "X", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    });

    const c = await authClientFor(v.email);
    const { data } = await c.from("seniors").select("id");
    expect(data ?? []).toEqual([]);
  });

  test("volunteer cannot read response_tokens", async () => {
    const admin = adminClient();
    const ts = Date.now();
    const v = await createVolunteerUser(`v-tok-${ts}@t.local`, "active");
    const c = await authClientFor(v.email);
    const { data } = await c.from("response_tokens").select("id");
    expect(data ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect them to pass (RLS already covers these cases)**

Run: `npm run test:integration -- rls-service-requests`
Expected: All 4 tests pass. If any fails, the existing 0011 RLS policies have a gap — fix by adjusting the policy in a new migration (`0017_rls_service_requests_fix.sql`) before continuing.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rls-service-requests.test.ts
git commit -m "test(requests): integration — RLS boundaries for requests/tokens"
```

---

## Task 4: Pure logic — eligibility ranking

**Files:**
- Create: `lib/matching/eligibility.ts`
- Create: `lib/matching/eligibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/matching/eligibility.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { rankEligibleVolunteers } from "./eligibility";

type V = Parameters<typeof rankEligibleVolunteers>[0][number];

const mk = (overrides: Partial<V>): V => ({
  id: crypto.randomUUID(),
  first_name: "F",
  last_name: "Z",
  categories: ["transportation"],
  service_area: "",
  status: "active",
  ...overrides,
});

describe("rankEligibleVolunteers", () => {
  test("filters out non-active volunteers", () => {
    const v1 = mk({ last_name: "Adams", status: "pending" });
    const v2 = mk({ last_name: "Baker", status: "active" });
    const out = rankEligibleVolunteers([v1, v2], { city: "Toronto" }, "transportation");
    expect(out.map(v => v.last_name)).toEqual(["Baker"]);
  });

  test("filters out volunteers missing the category", () => {
    const v1 = mk({ last_name: "Adams", categories: ["groceries"] });
    const v2 = mk({ last_name: "Baker", categories: ["transportation"] });
    const out = rankEligibleVolunteers([v1, v2], { city: "Toronto" }, "transportation");
    expect(out.map(v => v.last_name)).toEqual(["Baker"]);
  });

  test("in-area volunteers sort before out-of-area, alpha within each group", () => {
    const v1 = mk({ last_name: "Zhang", service_area: "Toronto, North York" });
    const v2 = mk({ last_name: "Adams", service_area: "Ottawa" });
    const v3 = mk({ last_name: "Brown", service_area: "Toronto" });
    const v4 = mk({ last_name: "Clarke", service_area: "" });
    const out = rankEligibleVolunteers([v1, v2, v3, v4], { city: "Toronto" }, "transportation");
    expect(out.map(v => v.last_name)).toEqual(["Brown", "Zhang", "Adams", "Clarke"]);
  });

  test("service-area match is case-insensitive and whole-word", () => {
    const v1 = mk({ last_name: "A", service_area: "TORONTO" });
    const v2 = mk({ last_name: "B", service_area: "Torontonian district" });
    const out = rankEligibleVolunteers([v1, v2], { city: "Toronto" }, "transportation");
    // 'Torontonian' does not whole-word match 'Toronto'
    expect(out[0].last_name).toBe("A");
    expect(out[0].inArea).toBe(true);
    expect(out[1].inArea).toBe(false);
  });

  test("senior without city — everyone treated as out-of-area, alpha", () => {
    const v1 = mk({ last_name: "Zhao", service_area: "Toronto" });
    const v2 = mk({ last_name: "Adams", service_area: "Toronto" });
    const out = rankEligibleVolunteers([v1, v2], { city: null }, "transportation");
    expect(out.map(v => v.last_name)).toEqual(["Adams", "Zhao"]);
    expect(out.every(v => !v.inArea)).toBe(true);
  });

  test("in-area flag exposed on each row", () => {
    const v1 = mk({ last_name: "A", service_area: "Toronto" });
    const v2 = mk({ last_name: "B", service_area: "Ottawa" });
    const out = rankEligibleVolunteers([v1, v2], { city: "Toronto" }, "transportation");
    expect(out.find(v => v.last_name === "A")?.inArea).toBe(true);
    expect(out.find(v => v.last_name === "B")?.inArea).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- lib/matching/eligibility.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/matching/eligibility.ts`:

```typescript
export type EligibilityVolunteer = {
  id: string;
  first_name: string;
  last_name: string;
  categories: string[];
  service_area: string | null;
  status: "pending" | "active" | "inactive";
};

export type RankedVolunteer = EligibilityVolunteer & { inArea: boolean };

export function rankEligibleVolunteers(
  volunteers: readonly EligibilityVolunteer[],
  senior: { city: string | null },
  category: string,
): RankedVolunteer[] {
  const city = senior.city?.trim() ?? "";
  const wholeWord = city
    ? new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
    : null;

  const eligible = volunteers.filter(
    (v) => v.status === "active" && v.categories.includes(category),
  );

  const ranked = eligible.map((v): RankedVolunteer => ({
    ...v,
    inArea: wholeWord ? wholeWord.test(v.service_area ?? "") : false,
  }));

  return ranked.sort((a, b) => {
    if (a.inArea !== b.inArea) return a.inArea ? -1 : 1;
    return a.last_name.localeCompare(b.last_name);
  });
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- lib/matching/eligibility.test`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/matching/eligibility.ts lib/matching/eligibility.test.ts
git commit -m "feat(requests): eligibility ranking (in-area + category)"
```

---

## Task 5: Pure logic — token expiry

**Files:**
- Create: `lib/service-requests/expiry.ts`
- Create: `lib/service-requests/expiry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/service-requests/expiry.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { computeTokenExpiry } from "./expiry";

describe("computeTokenExpiry", () => {
  test("future date — expires at 23:59:59 America/Toronto", () => {
    const now = new Date("2026-05-10T10:00:00-04:00");
    const out = computeTokenExpiry("2026-05-20", now);
    // 2026-05-20 23:59:59 America/Toronto (EDT, -04:00) = 2026-05-21 03:59:59 UTC
    expect(out.toISOString()).toBe("2026-05-21T03:59:59.000Z");
  });

  test("same-day — applies 24h floor", () => {
    const now = new Date("2026-05-10T14:00:00-04:00");
    const out = computeTokenExpiry("2026-05-10", now);
    // now + 24h > same-day 23:59 EDT (which is 2026-05-11T03:59:59Z);
    // now + 24h = 2026-05-11T18:00:00Z, which is later — floor wins.
    expect(out.toISOString()).toBe("2026-05-11T18:00:00.000Z");
  });

  test("past-dated request — 24h floor from now", () => {
    const now = new Date("2026-05-10T10:00:00-04:00");
    const out = computeTokenExpiry("2026-05-01", now);
    expect(out.toISOString()).toBe("2026-05-11T14:00:00.000Z");
  });

  test("DST boundary — EST side of fall-back", () => {
    // 2026-11-01 is fall-back day in America/Toronto; after 02:00 local it's EST (-05:00).
    const now = new Date("2026-10-30T10:00:00-04:00");
    const out = computeTokenExpiry("2026-11-05", now);
    // 2026-11-05 23:59:59 EST = 2026-11-06 04:59:59 UTC
    expect(out.toISOString()).toBe("2026-11-06T04:59:59.000Z");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- lib/service-requests/expiry.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/service-requests/expiry.ts`:

```typescript
const TZ = "America/Toronto";

export function computeTokenExpiry(
  requestedDate: string,
  now: Date = new Date(),
): Date {
  // Build 23:59:59.999 on requested_date in America/Toronto, as a UTC Date.
  const endOfDayInTz = zonedEndOfDay(requestedDate, TZ);
  const floor = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return endOfDayInTz.getTime() > floor.getTime() ? endOfDayInTz : floor;
}

function zonedEndOfDay(dateIso: string, tz: string): Date {
  // Intl-based: get the UTC instant for Y-M-D 23:59:59.999 at TZ.
  const [y, m, d] = dateIso.split("-").map(Number);
  // Start with a guess of UTC midnight of that local date, then correct.
  const guess = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  const offsetMs = tzOffsetMs(guess, tz);
  return new Date(guess.getTime() - offsetMs);
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

Run: `npm test -- lib/service-requests/expiry.test`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/service-requests/expiry.ts lib/service-requests/expiry.test.ts
git commit -m "feat(requests): token expiry (service-date end-of-day + 24h floor)"
```

---

## Task 6: Email templates — `service-request-invite` and `request-cancelled`

**Files:**
- Create: `lib/notifications/templates/service-request-invite.ts`
- Create: `lib/notifications/templates/service-request-invite.test.ts`
- Create: `lib/notifications/templates/request-cancelled.ts`
- Create: `lib/notifications/templates/request-cancelled.test.ts`

- [ ] **Step 1: Write failing tests for `service-request-invite`**

Create `lib/notifications/templates/service-request-invite.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { renderServiceRequestInvite } from "./service-request-invite";

const baseInput = {
  to: "v@test.local",
  volunteerFirstName: "Alice",
  seniorFirstName: "Jane",
  seniorCity: "Toronto",
  category: "transportation",
  requestedDate: "2026-05-20",
  descriptionExcerpt: "Ride to a medical appointment downtown.",
  acceptUrl: "https://example.test/respond/tok123?action=accept",
  declineUrl: "https://example.test/respond/tok123?action=decline",
};

describe("renderServiceRequestInvite", () => {
  test("contains required fields", () => {
    const email = renderServiceRequestInvite(baseInput);
    expect(email.to).toBe("v@test.local");
    expect(email.subject).toContain("transportation");
    expect(email.html).toContain("Alice");
    expect(email.html).toContain("Jane");
    expect(email.html).toContain("Toronto");
    expect(email.html).toContain("transportation");
    expect(email.html).toContain("Ride to a medical appointment");
    expect(email.html).toContain(baseInput.acceptUrl);
    expect(email.html).toContain(baseInput.declineUrl);
    expect(email.text).toContain("Alice");
    expect(email.text).toContain(baseInput.acceptUrl);
  });

  test("excludes protected PII fields", () => {
    const email = renderServiceRequestInvite({
      ...baseInput,
      // None of these should appear even if passed accidentally — function signature doesn't accept them.
    });
    const combined = email.html + email.text;
    expect(combined).not.toMatch(/416-555/);
    expect(combined).not.toMatch(/Main St/i);
    expect(combined).not.toMatch(/\bDoe\b/); // senior last name — not part of input; sanity check
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- service-request-invite.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `service-request-invite`**

Create `lib/notifications/templates/service-request-invite.ts`:

```typescript
import type { Email } from "../index";

export type ServiceRequestInviteInput = {
  to: string;
  volunteerFirstName: string;
  seniorFirstName: string;
  seniorCity: string;
  category: string;
  requestedDate: string; // ISO date (YYYY-MM-DD)
  descriptionExcerpt: string;
  acceptUrl: string;
  declineUrl: string;
};

export function renderServiceRequestInvite(input: ServiceRequestInviteInput): Email {
  const prettyDate = new Date(`${input.requestedDate}T12:00:00-04:00`).toLocaleDateString(
    "en-CA",
    { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" },
  );

  const subject = `You've been invited to help with a ${input.category} request`;

  const html = `
<p>Hi ${esc(input.volunteerFirstName)},</p>
<p>${esc(input.seniorFirstName)} in ${esc(input.seniorCity)} has asked for help with a
<strong>${esc(input.category)}</strong> request on <strong>${esc(prettyDate)}</strong>.</p>
<p>${esc(input.descriptionExcerpt)}</p>
<p>
  <a href="${input.acceptUrl}" style="display:inline-block;padding:10px 16px;background:#1a7f37;color:#fff;text-decoration:none;border-radius:6px;margin-right:8px;">Accept</a>
  <a href="${input.declineUrl}" style="display:inline-block;padding:10px 16px;background:#6e7781;color:#fff;text-decoration:none;border-radius:6px;">Decline</a>
</p>
<p style="color:#6e7781;font-size:13px;">These buttons work until the end of the service date. If you've already responded, the newer click wins.</p>
<p>Thanks,<br>Better At Home</p>
`.trim();

  const text = [
    `Hi ${input.volunteerFirstName},`,
    ``,
    `${input.seniorFirstName} in ${input.seniorCity} has asked for help with a ${input.category} request on ${prettyDate}.`,
    ``,
    input.descriptionExcerpt,
    ``,
    `Accept:  ${input.acceptUrl}`,
    `Decline: ${input.declineUrl}`,
    ``,
    `These links work until the end of the service date.`,
    ``,
    `Thanks,`,
    `Better At Home`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- service-request-invite.test`
Expected: PASS.

- [ ] **Step 5: Write failing tests for `request-cancelled`**

Create `lib/notifications/templates/request-cancelled.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { renderRequestCancelled } from "./request-cancelled";

describe("renderRequestCancelled", () => {
  test("contains apology, optional reason, and dashboard link", () => {
    const email = renderRequestCancelled({
      to: "v@test.local",
      volunteerFirstName: "Alice",
      category: "transportation",
      requestedDate: "2026-05-20",
      reason: "Family cancelled.",
      dashboardUrl: "https://example.test/volunteer/dashboard",
    });
    expect(email.subject).toContain("no longer needed");
    expect(email.html).toContain("Alice");
    expect(email.html).toContain("Family cancelled");
    expect(email.html).toContain("https://example.test/volunteer/dashboard");
    expect(email.text).toContain("Alice");
  });

  test("omits reason when not provided", () => {
    const email = renderRequestCancelled({
      to: "v@test.local",
      volunteerFirstName: "Alice",
      category: "transportation",
      requestedDate: "2026-05-20",
      dashboardUrl: "https://example.test/volunteer/dashboard",
    });
    expect(email.html).not.toContain("Reason:");
  });
});
```

- [ ] **Step 6: Run — expect fail**

Run: `npm test -- request-cancelled.test`
Expected: FAIL.

- [ ] **Step 7: Implement `request-cancelled`**

Create `lib/notifications/templates/request-cancelled.ts`:

```typescript
import type { Email } from "../index";

export type RequestCancelledInput = {
  to: string;
  volunteerFirstName: string;
  category: string;
  requestedDate: string;
  reason?: string;
  dashboardUrl: string;
};

export function renderRequestCancelled(input: RequestCancelledInput): Email {
  const prettyDate = new Date(`${input.requestedDate}T12:00:00-04:00`).toLocaleDateString(
    "en-CA",
    { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" },
  );

  const subject = `A request you were invited to is no longer needed`;

  const reasonBlock = input.reason
    ? `<p><strong>Reason:</strong> ${esc(input.reason)}</p>`
    : "";
  const reasonText = input.reason ? `Reason: ${input.reason}\n\n` : "";

  const html = `
<p>Hi ${esc(input.volunteerFirstName)},</p>
<p>The <strong>${esc(input.category)}</strong> request for <strong>${esc(prettyDate)}</strong> that we emailed you about has been cancelled. No action is needed.</p>
${reasonBlock}
<p>Thanks for being available — we'll reach out again soon.</p>
<p><a href="${input.dashboardUrl}">View your dashboard</a></p>
<p>Better At Home</p>
`.trim();

  const text = [
    `Hi ${input.volunteerFirstName},`,
    ``,
    `The ${input.category} request for ${prettyDate} that we emailed you about has been cancelled. No action is needed.`,
    ``,
    `${reasonText}Thanks for being available — we'll reach out again soon.`,
    ``,
    `Dashboard: ${input.dashboardUrl}`,
    ``,
    `Better At Home`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

- [ ] **Step 8: Run — expect pass**

Run: `npm test -- request-cancelled.test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/notifications/templates/service-request-invite.ts \
        lib/notifications/templates/service-request-invite.test.ts \
        lib/notifications/templates/request-cancelled.ts \
        lib/notifications/templates/request-cancelled.test.ts
git commit -m "feat(requests): email templates — invite + cancellation"
```

---

## Task 7: DB queries — typed helpers for service requests

**Files:**
- Modify: `lib/db/queries/service-requests.ts` (replace the stub)
- Create: `tests/integration/service-requests-crud.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/service-requests-crud.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser } from "./helpers";
import {
  listServiceRequests,
  getServiceRequestById,
  createServiceRequest,
  updateServiceRequest,
  cancelServiceRequest,
  reopenServiceRequest,
  markRequestCompleted,
  listRecipientsForRequest,
  countRequestsByStatus,
} from "@/lib/db/queries/service-requests";

async function seedSenior() {
  const admin = adminClient();
  const a = await createAdminUser(`admin-${Date.now()}-${Math.random()}@t.local`);
  const { data } = await admin.from("seniors").insert({
    first_name: "Jane", last_name: "Doe", phone: "416-555-0000",
    address_line1: "1 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: a.userId,
  }).select().single();
  return { admin, senior: data!, adminId: a.userId };
}

describe("service_requests queries", () => {
  test("create + getById + list", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id,
      category: "transportation",
      priority: "normal",
      requested_date: "2030-01-15",
      description: "ride to appt",
      created_by: adminId,
    });
    expect(created.status).toBe("open");

    const got = await getServiceRequestById(admin, created.id);
    expect(got?.id).toBe(created.id);

    const { rows } = await listServiceRequests(admin, { status: "open" });
    expect(rows.find(r => r.id === created.id)).toBeTruthy();
  });

  test("update respects edit-lock on notified", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });
    // Simulate notified state via direct write.
    await admin.from("service_requests").update({ status: "notified" }).eq("id", created.id);

    // Description and priority allowed.
    const updated = await updateServiceRequest(admin, created.id, {
      description: "new", priority: "high",
    });
    expect(updated.description).toBe("new");
    expect(updated.priority).toBe("high");

    // Category blocked while notified.
    await expect(
      updateServiceRequest(admin, created.id, { category: "groceries" }),
    ).rejects.toThrow(/locked/i);
  });

  test("cancelServiceRequest sets status + cancelled_at + supersedes tokens", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });
    // Fake a notified state + outstanding token.
    await admin.from("service_requests").update({ status: "notified" }).eq("id", created.id);
    const v = await adminClient().from("volunteers").select("id").limit(1);
    if (!v.data?.[0]) {
      // Seed a volunteer quickly.
      const { createVolunteerUser } = await import("./helpers");
      await createVolunteerUser(`v-cancel-${Date.now()}@t.local`, "active");
    }
    const vol = (await adminClient().from("volunteers").select("id").limit(1)).data![0];
    await admin.from("response_tokens").insert({
      token: `tok-${Date.now()}`, request_id: created.id, volunteer_id: vol.id,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    const cancelled = await cancelServiceRequest(admin, created.id, { reason: "Family cancelled" });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelled_at).not.toBeNull();
    expect(cancelled.cancelled_reason).toBe("Family cancelled");

    const { data: toks } = await admin.from("response_tokens").select("*").eq("request_id", created.id);
    expect(toks!.every(t => t.action === "superseded")).toBe(true);
  });

  test("reopen + markCompleted", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });

    // Put into accepted state directly via admin client (bypassing RPC for this specific test setup).
    const { createVolunteerUser } = await import("./helpers");
    const v = await createVolunteerUser(`v-re-${Date.now()}@t.local`, "active");
    await admin.from("service_requests").update({
      status: "accepted", assigned_volunteer_id: v.userId,
    }).eq("id", created.id);

    const reopened = await reopenServiceRequest(admin, created.id);
    expect(reopened.status).toBe("open");
    expect(reopened.assigned_volunteer_id).toBeNull();
    expect(reopened.reopened_at).not.toBeNull();

    // Re-accept for completion test.
    await admin.from("service_requests").update({
      status: "accepted", assigned_volunteer_id: v.userId,
    }).eq("id", created.id);
    const done = await markRequestCompleted(admin, created.id);
    expect(done.status).toBe("completed");
    expect(done.completed_at).not.toBeNull();
  });

  test("countRequestsByStatus", async () => {
    const { admin, senior, adminId } = await seedSenior();
    await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });
    const counts = await countRequestsByStatus(admin);
    expect(counts.open).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm run test:integration -- service-requests-crud`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement the query helpers**

Replace `lib/db/queries/service-requests.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["service_requests"]["Row"];
type Priority = Database["public"]["Enums"]["request_priority"];
type Status = Database["public"]["Enums"]["request_status"];

export type ListFilters = {
  status?: Status | "all";
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: { requested_date: string; id: string } | null;
  limit?: number;
};

export async function getServiceRequestById(supabase: Client, id: string): Promise<Row | null> {
  const { data, error } = await supabase
    .from("service_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listServiceRequests(
  supabase: Client,
  filters: ListFilters = {},
): Promise<{ rows: Row[]; nextCursor: { requested_date: string; id: string } | null }> {
  const limit = filters.limit ?? 50;
  let q = supabase.from("service_requests").select("*");

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("requested_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("requested_date", filters.dateTo);
  if (filters.cursor) {
    const d = filters.cursor.requested_date;
    const id = filters.cursor.id;
    q = q.or(`requested_date.lt.${d},and(requested_date.eq.${d},id.gt.${id})`);
  }

  q = q
    .order("requested_date", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit + 1);

  const { data, error } = await q;
  if (error) throw error;
  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const last = rows[rows.length - 1];
  const nextCursor =
    hasMore && last ? { requested_date: last.requested_date, id: last.id } : null;
  return { rows, nextCursor };
}

export type CreateInput = {
  senior_id: string;
  category: string;
  priority: Priority;
  requested_date: string;
  description: string | null;
  created_by: string;
};

export async function createServiceRequest(supabase: Client, input: CreateInput): Promise<Row> {
  const { data, error } = await supabase
    .from("service_requests")
    .insert({ ...input, status: "open" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const LOCKED_WHEN_NOTIFIED: readonly (keyof UpdateInput)[] = [
  "senior_id", "category", "requested_date",
];

export type UpdateInput = Partial<{
  senior_id: string;
  category: string;
  priority: Priority;
  requested_date: string;
  description: string | null;
}>;

export async function updateServiceRequest(
  supabase: Client, id: string, input: UpdateInput,
): Promise<Row> {
  const current = await getServiceRequestById(supabase, id);
  if (!current) throw new Error(`Request ${id} not found`);

  if (current.status === "notified") {
    for (const key of LOCKED_WHEN_NOTIFIED) {
      if (key in input) {
        throw new Error(
          `Field "${key}" is locked while the request is notified. Cancel the request to change it.`,
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("service_requests").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function cancelServiceRequest(
  supabase: Client, id: string, opts: { reason?: string | null },
): Promise<Row> {
  // Supersede any outstanding tokens.
  const { error: tErr } = await supabase
    .from("response_tokens")
    .update({ used_at: new Date().toISOString(), action: "superseded" })
    .eq("request_id", id)
    .is("used_at", null);
  if (tErr) throw tErr;

  const { data, error } = await supabase
    .from("service_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: opts.reason ?? null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reopenServiceRequest(supabase: Client, id: string): Promise<Row> {
  const { data, error } = await supabase
    .from("service_requests")
    .update({
      status: "open",
      assigned_volunteer_id: null,
      reopened_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markRequestCompleted(supabase: Client, id: string): Promise<Row> {
  const { data, error } = await supabase
    .from("service_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type RecipientRow = {
  notification_id: string;
  volunteer_id: string;
  volunteer_first_name: string;
  volunteer_last_name: string;
  volunteer_email: string;
  sent_at: string;
  notification_status: Database["public"]["Enums"]["notification_status"];
  event_type: Database["public"]["Enums"]["notification_event_type"];
  token_action: Database["public"]["Enums"]["token_action"] | null;
  token_used_at: string | null;
};

export async function listRecipientsForRequest(
  supabase: Client, requestId: string,
): Promise<RecipientRow[]> {
  const { data: notifs, error } = await supabase
    .from("notifications")
    .select(`
      id, volunteer_id, sent_at, status, event_type,
      volunteers:volunteers ( first_name, last_name, email )
    `)
    .eq("request_id", requestId)
    .order("sent_at", { ascending: true });
  if (error) throw error;

  const { data: tokens, error: tErr } = await supabase
    .from("response_tokens")
    .select("volunteer_id, action, used_at")
    .eq("request_id", requestId);
  if (tErr) throw tErr;

  const tokByVol = new Map(tokens!.map(t => [t.volunteer_id, t]));

  return notifs!.map((n) => {
    const vol = (n as unknown as { volunteers: { first_name: string; last_name: string; email: string } }).volunteers;
    const tok = tokByVol.get(n.volunteer_id);
    return {
      notification_id: n.id,
      volunteer_id: n.volunteer_id,
      volunteer_first_name: vol.first_name,
      volunteer_last_name: vol.last_name,
      volunteer_email: vol.email,
      sent_at: n.sent_at,
      notification_status: n.status,
      event_type: n.event_type,
      token_action: tok?.action ?? null,
      token_used_at: tok?.used_at ?? null,
    };
  });
}

export async function countRequestsByStatus(
  supabase: Client,
): Promise<Record<Status, number>> {
  const statuses: Status[] = ["open", "notified", "accepted", "completed", "cancelled"];
  const result: Record<string, number> = {};
  for (const s of statuses) {
    const { count } = await supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    result[s] = count ?? 0;
  }
  return result as Record<Status, number>;
}

export async function countPendingInvitesForVolunteer(
  supabase: Client, volunteerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("response_tokens")
    .select("id", { count: "exact", head: true })
    .eq("volunteer_id", volunteerId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm run test:integration -- service-requests-crud`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/service-requests.ts tests/integration/service-requests-crud.test.ts
git commit -m "feat(requests): typed db queries + edit-lock helper"
```

---

## Task 8: Public route — `/respond/[token]` and result pages

**Files:**
- Create: `app/respond/[token]/route.ts`
- Create: `app/respond/[token]/accepted/page.tsx`
- Create: `app/respond/[token]/declined/page.tsx`
- Create: `app/respond/[token]/already-filled/page.tsx`
- Create: `app/respond/[token]/invalid/page.tsx`
- Create: `tests/integration/respond-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/respond-route.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { GET } from "@/app/respond/[token]/route";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";

async function seedTokenFor(action: "accept" | "decline", status: "notified" | "accepted" = "notified") {
  const admin = adminClient();
  const ts = Date.now();
  const a = await createAdminUser(`a-${ts}@t.local`);
  const v = await createVolunteerUser(`v-${ts}@t.local`, "active");
  const { data: s } = await admin.from("seniors").insert({
    first_name: "Jane", last_name: "Doe", phone: "x", address_line1: "1", city: "Toronto",
    province: "ON", postal_code: "M1A1A1", created_by: a.userId,
  }).select().single();
  const { data: r } = await admin.from("service_requests").insert({
    senior_id: s!.id, category: "transportation", priority: "normal",
    requested_date: "2030-01-01", description: "x", created_by: a.userId, status,
  }).select().single();
  const token = `tok-${ts}-${Math.random()}`;
  await admin.from("response_tokens").insert({
    token, request_id: r!.id, volunteer_id: v.userId,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await admin.from("notifications").insert({
    request_id: r!.id, volunteer_id: v.userId, channel: "email", status: "sent", event_type: "invite",
  });
  return { token, requestId: r!.id, volunteerId: v.userId, adminId: a.userId, action };
}

function reqFor(token: string, action: "accept" | "decline") {
  return new Request(`http://localhost/respond/${token}?action=${action}`, { method: "GET" });
}

describe("GET /respond/[token]", () => {
  test("valid accept redirects to /respond/[token]/accepted", async () => {
    const { token } = await seedTokenFor("accept");
    const res = await GET(reqFor(token, "accept"), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/respond\/.+\/accepted$/);
  });

  test("valid decline redirects to declined", async () => {
    const { token } = await seedTokenFor("decline");
    const res = await GET(reqFor(token, "decline"), { params: Promise.resolve({ token }) });
    expect(res.headers.get("location")).toMatch(/\/declined$/);
  });

  test("missing action param → invalid", async () => {
    const { token } = await seedTokenFor("accept");
    const res = await GET(
      new Request(`http://localhost/respond/${token}`, { method: "GET" }),
      { params: Promise.resolve({ token }) },
    );
    expect(res.headers.get("location")).toMatch(/\/invalid$/);
  });

  test("unknown token → invalid", async () => {
    const res = await GET(reqFor("nope", "accept"), { params: Promise.resolve({ token: "nope" }) });
    expect(res.headers.get("location")).toMatch(/\/invalid$/);
  });

  test("second accept (request already accepted) → already-filled", async () => {
    const { token } = await seedTokenFor("accept", "accepted");
    // Fake: mark assignee so the RPC check fires.
    const admin = adminClient();
    const tok = await admin.from("response_tokens").select("request_id, volunteer_id").eq("token", token).single();
    await admin.from("service_requests").update({
      status: "accepted", assigned_volunteer_id: tok.data!.volunteer_id,
    }).eq("id", tok.data!.request_id);

    const res = await GET(reqFor(token, "accept"), { params: Promise.resolve({ token }) });
    expect(res.headers.get("location")).toMatch(/\/already-filled$/);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm run test:integration -- respond-route`
Expected: FAIL — route handler not implemented.

- [ ] **Step 3: Implement the route handler**

Create `app/respond/[token]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Params = { token: string };

export async function GET(
  request: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  const { token } = await ctx.params;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action !== "accept" && action !== "decline") {
    return redirect(url, token, "invalid");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_response_token", {
    p_token: token,
    p_action: action,
  });

  if (error) {
    console.error("consume_response_token error", error);
    return redirect(url, token, "invalid");
  }

  const outcome = (data as { outcome: string } | null)?.outcome ?? "invalid";

  switch (outcome) {
    case "accepted":
      return redirect(url, token, "accepted");
    case "declined":
      return redirect(url, token, "declined");
    case "already_filled":
      return redirect(url, token, "already-filled");
    case "expired":
    case "invalid":
    default:
      return redirect(url, token, "invalid");
  }
}

function redirect(url: URL, token: string, slug: string): Response {
  const target = new URL(`/respond/${encodeURIComponent(token)}/${slug}`, url.origin);
  return NextResponse.redirect(target, 303);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm run test:integration -- respond-route`
Expected: All 5 tests PASS.

- [ ] **Step 5: Create the four result pages**

Create `app/respond/[token]/accepted/page.tsx`:

```tsx
import Link from "next/link";

export default function AcceptedPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">You've got it!</h1>
      <p className="mt-4 text-gray-600">
        Thanks for accepting. We'll send you the full details by email and they're also in your dashboard.
      </p>
      <Link href="/volunteer/dashboard" className="mt-6 inline-block text-blue-600 underline">
        Open your dashboard
      </Link>
    </main>
  );
}
```

Create `app/respond/[token]/declined/page.tsx`:

```tsx
import Link from "next/link";

export default function DeclinedPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">Thanks for letting us know</h1>
      <p className="mt-4 text-gray-600">
        We'll look for someone else. We appreciate you responding.
      </p>
      <Link href="/volunteer/dashboard" className="mt-6 inline-block text-blue-600 underline">
        Open your dashboard
      </Link>
    </main>
  );
}
```

Create `app/respond/[token]/already-filled/page.tsx`:

```tsx
import Link from "next/link";

export default function AlreadyFilledPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">This request has already been filled</h1>
      <p className="mt-4 text-gray-600">
        Someone else jumped on it first — thanks for being available.
      </p>
      <Link href="/volunteer/dashboard" className="mt-6 inline-block text-blue-600 underline">
        Open your dashboard
      </Link>
    </main>
  );
}
```

Create `app/respond/[token]/invalid/page.tsx`:

```tsx
import Link from "next/link";

export default function InvalidPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">This link is no longer valid</h1>
      <p className="mt-4 text-gray-600">
        It may have expired or already been used. Please check your email for a newer invite, or sign in for the latest list.
      </p>
      <Link href="/login" className="mt-6 inline-block text-blue-600 underline">
        Sign in
      </Link>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add app/respond tests/integration/respond-route.test.ts
git commit -m "feat(requests): /respond/[token] route handler + result pages"
```

---

## Task 9: Admin request list (`/admin/requests`)

**Files:**
- Create: `app/(admin)/admin/requests/page.tsx`
- Create: `app/(admin)/admin/requests/requests-filters.tsx`
- Create: `app/(admin)/admin/requests/requests-filters.test.tsx`

- [ ] **Step 1: Write failing test for the filter UI**

Create `app/(admin)/admin/requests/requests-filters.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequestsFilters } from "./requests-filters";

describe("RequestsFilters", () => {
  test("renders status tabs and marks the current one active", () => {
    render(<RequestsFilters currentStatus="open" />);
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /notified/i })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- requests-filters`
Expected: FAIL.

- [ ] **Step 3: Implement the filter component**

Create `app/(admin)/admin/requests/requests-filters.tsx`:

```tsx
import Link from "next/link";

type StatusTab = "all" | "open" | "notified" | "accepted" | "completed" | "cancelled";

const TABS: { key: StatusTab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "notified", label: "Notified" },
  { key: "accepted", label: "Accepted" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export function RequestsFilters({ currentStatus }: { currentStatus: StatusTab }) {
  return (
    <nav className="flex gap-2 border-b">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === "all" ? "/admin/requests" : `/admin/requests?status=${t.key}`}
          aria-current={t.key === currentStatus ? "page" : undefined}
          className={`px-3 py-2 text-sm ${
            t.key === currentStatus ? "border-b-2 border-black font-semibold" : "text-gray-600"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- requests-filters`
Expected: PASS.

- [ ] **Step 5: Implement the list page**

Create `app/(admin)/admin/requests/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listServiceRequests } from "@/lib/db/queries/service-requests";
import { RequestsFilters } from "./requests-filters";

type Search = { status?: string; dateFrom?: string; dateTo?: string };

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = (sp.status ?? "open") as
    "all" | "open" | "notified" | "accepted" | "completed" | "cancelled";

  const supabase = await createSupabaseServerClient();
  const { rows } = await listServiceRequests(supabase, {
    status,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    limit: 100,
  });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Service requests</h1>
        <Link
          href="/admin/requests/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          New request
        </Link>
      </header>

      <RequestsFilters currentStatus={status} />

      <table className="w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Date</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2">{r.requested_date}</td>
              <td>{r.category}</td>
              <td>{r.priority}</td>
              <td>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{r.status}</span>
              </td>
              <td className="text-right">
                <Link href={`/admin/requests/${r.id}`} className="text-blue-600 underline">
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-500">
                No requests match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 6: Manual smoke check**

Run: `npm run dev` and open `http://localhost:3000/admin/requests` as a logged-in admin. Verify: page renders, tabs navigate, empty state visible when no data.

- [ ] **Step 7: Commit**

```bash
git add app/\(admin\)/admin/requests
git commit -m "feat(requests): admin list page with status tabs"
```

---

## Task 10: Admin — new request page with senior picker

**Files:**
- Create: `app/(admin)/admin/requests/new/page.tsx`
- Create: `app/(admin)/admin/requests/new/new-request-form.tsx`
- Create: `app/(admin)/admin/requests/new/actions.ts`
- Create: `app/(admin)/admin/requests/new/actions.test.ts`
- Create: `app/(admin)/admin/requests/new/senior-picker.tsx`

- [ ] **Step 1: Write failing test for the create Server Action**

Create `app/(admin)/admin/requests/new/actions.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser } from "@/tests/integration/helpers";
import { createRequestAction } from "./actions";

describe("createRequestAction", () => {
  test("rejects invalid payload with field errors", async () => {
    const result = await createRequestAction({
      senior_id: "",
      category: "",
      priority: "normal",
      requested_date: "",
      description: "",
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors)).toContain("senior_id");
  });

  test("creates a request for a real senior (admin session)", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`a-${Date.now()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    // Server Actions read auth from cookies, which isn't available in unit context.
    // Call the non-auth helper directly (exported from the same module).
    const { _createRequestForAdmin } = await import("./actions");
    const req = await _createRequestForAdmin(admin, {
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-01", description: "x",
    }, a.userId);
    expect(req.status).toBe("open");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm run test:integration -- actions.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Server Action**

Create `app/(admin)/admin/requests/new/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRequest } from "@/lib/db/queries/service-requests";

const Schema = z.object({
  senior_id: z.string().uuid({ message: "Please pick a senior." }),
  category: z.string().min(1, "Category is required."),
  priority: z.enum(["low", "normal", "high"]),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date."),
  description: z.string().max(2000).optional().default(""),
});

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; formError?: string; fieldErrors: Record<string, string> };

export async function createRequestAction(formData: FormData | Record<string, unknown>): Promise<CreateResult> {
  const raw = formData instanceof FormData
    ? Object.fromEntries(formData.entries())
    : formData;

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  try {
    const req = await _createRequestForAdmin(supabase, parsed.data, admin.userId);
    redirect(`/admin/requests/${req.id}`);
  } catch (e) {
    return { ok: false, fieldErrors: {}, formError: (e as Error).message };
  }
}

// Exported for tests.
export async function _createRequestForAdmin(
  supabase: SupabaseClient<Database>,
  input: z.infer<typeof Schema>,
  adminId: string,
) {
  return createServiceRequest(supabase, {
    senior_id: input.senior_id,
    category: input.category,
    priority: input.priority,
    requested_date: input.requested_date,
    description: input.description || null,
    created_by: adminId,
  });
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm run test:integration -- actions.test`
Expected: PASS.

- [ ] **Step 5: Implement the senior picker**

Create `app/(admin)/admin/requests/new/senior-picker.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";

type Senior = { id: string; first_name: string; last_name: string; city: string };

export function SeniorPicker({ onSelect }: { onSelect: (s: Senior) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Senior[]>([]);
  const [selected, setSelected] = useState<Senior | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/seniors/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      if (!res.ok) return;
      setResults(await res.json());
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded border p-3">
        <span>{selected.first_name} {selected.last_name} · {selected.city}</span>
        <button type="button" onClick={() => { setSelected(null); setQ(""); }} className="text-blue-600 underline text-sm">Change</button>
        <input type="hidden" name="senior_id" value={selected.id} />
      </div>
    );
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search seniors by name or phone…"
        className="w-full rounded border px-3 py-2"
        aria-label="Senior search"
      />
      <ul className="mt-1 max-h-60 overflow-auto rounded border">
        {results.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => { setSelected(s); onSelect(s); }}
              className="block w-full px-3 py-2 text-left hover:bg-gray-100"
            >
              {s.first_name} {s.last_name} <span className="text-gray-500">· {s.city}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Implement the search API endpoint**

Create `app/api/seniors/search/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  await requireAdmin();
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const escaped = q.replace(/[%_]/g, "").replace(/"/g, '""');
  const term = `"%${escaped}%"`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("seniors")
    .select("id, first_name, last_name, city, phone")
    .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`)
    .order("last_name")
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 7: Implement the form + page**

Create `app/(admin)/admin/requests/new/new-request-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { SeniorPicker } from "./senior-picker";
import { createRequestAction, type CreateResult } from "./actions";

export function NewRequestForm({ categories }: { categories: string[] }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(fd: FormData) {
    setErrors({}); setFormError(null);
    startTransition(async () => {
      const result: CreateResult = await createRequestAction(fd);
      if (!result.ok) {
        setErrors(result.fieldErrors);
        if (result.formError) setFormError(result.formError);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Senior</span>
        <SeniorPicker onSelect={() => {}} />
        {errors.senior_id && <p className="text-sm text-red-600">{errors.senior_id}</p>}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Category</span>
        <select name="category" className="w-full rounded border px-3 py-2">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.category && <p className="text-sm text-red-600">{errors.category}</p>}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Priority</span>
        <select name="priority" defaultValue="normal" className="w-full rounded border px-3 py-2">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Requested date</span>
        <input type="date" name="requested_date" className="w-full rounded border px-3 py-2" />
        {errors.requested_date && <p className="text-sm text-red-600">{errors.requested_date}</p>}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Description</span>
        <textarea name="description" rows={4} className="w-full rounded border px-3 py-2" />
      </label>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button disabled={pending} className="rounded bg-black px-4 py-2 text-sm font-medium text-white">
        {pending ? "Creating…" : "Create request"}
      </button>
    </form>
  );
}
```

Create `app/(admin)/admin/requests/new/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewRequestForm } from "./new-request-form";

export default async function NewRequestPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: cats } = await supabase.from("volunteer_categories").select("name").order("name");
  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">New service request</h1>
      <NewRequestForm categories={(cats ?? []).map(c => c.name)} />
    </section>
  );
}
```

- [ ] **Step 8: Manual smoke check**

Run: `npm run dev`. As admin, navigate `/admin/requests/new`, pick a senior, submit. Verify redirect to `/admin/requests/[id]` (detail page is a 404 until Task 11 — that's fine; confirm the DB row was created).

- [ ] **Step 9: Commit**

```bash
git add app/\(admin\)/admin/requests/new app/api/seniors/search
git commit -m "feat(requests): admin new-request form + senior typeahead"
```

---

## Task 11: Admin request detail — scaffold + header + eligible picker

**Files:**
- Create: `app/(admin)/admin/requests/[id]/page.tsx`
- Create: `app/(admin)/admin/requests/[id]/detail-header.tsx`
- Create: `app/(admin)/admin/requests/[id]/eligible-picker.tsx`
- Create: `app/(admin)/admin/requests/[id]/actions.ts`
- Create: `app/(admin)/admin/requests/[id]/actions.test.ts`

- [ ] **Step 1: Write failing test for the `sendInvites` Server Action (integration)**

Create `app/(admin)/admin/requests/[id]/actions.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "@/tests/integration/helpers";
import { _sendInvitesForAdmin } from "./actions";
import type { NotificationService } from "@/lib/notifications";

function recordingService(): NotificationService & { sent: { to: string; subject: string }[] } {
  const sent: { to: string; subject: string }[] = [];
  return {
    sent,
    async sendEmail(email) {
      sent.push({ to: email.to, subject: email.subject });
      return { ok: true, id: "test-" + sent.length };
    },
  };
}

async function seed() {
  const admin = adminClient();
  const a = await createAdminUser(`a-${Date.now()}@t.local`);
  const v1 = await createVolunteerUser(`v1-${Date.now()}@t.local`, "active");
  const v2 = await createVolunteerUser(`v2-${Date.now()}@t.local`, "active");
  const { data: s } = await admin.from("seniors").insert({
    first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
    province: "ON", postal_code: "M1A1A1", created_by: a.userId,
  }).select().single();
  const { data: r } = await admin.from("service_requests").insert({
    senior_id: s!.id, category: "transportation", priority: "normal",
    requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "open",
  }).select().single();
  return { admin, request: r!, v1, v2 };
}

describe("sendInvites (admin)", () => {
  test("creates tokens + notifications, transitions to notified, sends emails", async () => {
    const { admin, request, v1, v2 } = await seed();
    const svc = recordingService();
    const res = await _sendInvitesForAdmin(admin, {
      requestId: request.id,
      volunteerIds: [v1.userId, v2.userId],
      confirmed: true,
      appUrl: "https://test.local",
      notifier: svc,
    });
    expect(res.sent).toBe(2);

    const { data: updated } = await admin.from("service_requests").select("status").eq("id", request.id).single();
    expect(updated?.status).toBe("notified");

    const { data: toks } = await admin.from("response_tokens").select("*").eq("request_id", request.id);
    expect(toks?.length).toBe(2);

    const { data: notifs } = await admin.from("notifications").select("*").eq("request_id", request.id);
    expect(notifs?.length).toBe(2);
    expect(notifs?.every(n => n.event_type === "invite")).toBe(true);

    expect(svc.sent.length).toBe(2);
  });

  test("rejects >25 recipients without confirmation", async () => {
    const { admin, request } = await seed();
    const ids = Array.from({ length: 26 }, (_, i) => `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`);
    await expect(
      _sendInvitesForAdmin(admin, {
        requestId: request.id, volunteerIds: ids, confirmed: false,
        appUrl: "https://test.local", notifier: recordingService(),
      }),
    ).rejects.toThrow(/confirm/i);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm run test:integration -- requests/\\[id\\]/actions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the admin Server Actions (send, cancel, reopen, reassign, markCompleted, retry)**

Create `app/(admin)/admin/requests/[id]/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  cancelServiceRequest,
  reopenServiceRequest,
  markRequestCompleted,
  getServiceRequestById,
} from "@/lib/db/queries/service-requests";
import { computeTokenExpiry } from "@/lib/service-requests/expiry";
import { renderServiceRequestInvite } from "@/lib/notifications/templates/service-request-invite";
import { renderRequestCancelled } from "@/lib/notifications/templates/request-cancelled";
import { createNotificationService, type NotificationService } from "@/lib/notifications";
import { randomBytes } from "node:crypto";

type Client = SupabaseClient<Database>;

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// --- SEND INVITES ---

const SendSchema = z.object({
  requestId: z.string().uuid(),
  volunteerIds: z.array(z.string().uuid()).min(1),
  confirmed: z.boolean().optional(),
});

export async function sendInvitesAction(input: z.infer<typeof SendSchema>) {
  const parsed = SendSchema.parse(input);
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const res = await _sendInvitesForAdmin(supabase, {
    requestId: parsed.requestId,
    volunteerIds: parsed.volunteerIds,
    confirmed: parsed.confirmed ?? false,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    notifier: createNotificationService(),
  });
  revalidatePath(`/admin/requests/${parsed.requestId}`);
  return res;
}

export async function _sendInvitesForAdmin(
  supabase: Client,
  opts: {
    requestId: string;
    volunteerIds: string[];
    confirmed: boolean;
    appUrl: string;
    notifier: NotificationService;
  },
): Promise<{ sent: number; failed: number }> {
  if (opts.volunteerIds.length > 25 && !opts.confirmed) {
    throw new Error("Please confirm before sending to more than 25 volunteers.");
  }

  const req = await getServiceRequestById(supabase, opts.requestId);
  if (!req) throw new Error("Request not found");

  const { data: senior, error: sErr } = await supabase
    .from("seniors")
    .select("first_name, city")
    .eq("id", req.senior_id)
    .single();
  if (sErr) throw sErr;

  const { data: vols, error: vErr } = await supabase
    .from("volunteers")
    .select("id, first_name, email")
    .in("id", opts.volunteerIds);
  if (vErr) throw vErr;

  const expires = computeTokenExpiry(req.requested_date).toISOString();

  let sent = 0, failed = 0;
  for (const v of vols!) {
    const token = newToken();
    const { error: tErr } = await supabase.from("response_tokens").insert({
      token, request_id: req.id, volunteer_id: v.id, expires_at: expires,
    });
    if (tErr) throw tErr;

    const { data: notif, error: nErr } = await supabase.from("notifications").insert({
      request_id: req.id, volunteer_id: v.id, channel: "email",
      status: "sent", event_type: "invite",
    }).select().single();
    if (nErr) throw nErr;

    const email = renderServiceRequestInvite({
      to: v.email,
      volunteerFirstName: v.first_name,
      seniorFirstName: senior.first_name,
      seniorCity: senior.city,
      category: req.category,
      requestedDate: req.requested_date,
      descriptionExcerpt: (req.description ?? "").slice(0, 240),
      acceptUrl: `${opts.appUrl}/respond/${token}?action=accept`,
      declineUrl: `${opts.appUrl}/respond/${token}?action=decline`,
    });
    const res = await opts.notifier.sendEmail(email);
    if (res.ok) {
      sent++;
    } else {
      failed++;
      await supabase.from("notifications").update({ status: "failed" }).eq("id", notif.id);
    }
  }

  await supabase.from("service_requests").update({ status: "notified" }).eq("id", req.id);

  return { sent, failed };
}

// --- CANCEL ---

export async function cancelRequestAction(input: { id: string; reason?: string; notifyRecipients: boolean }) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const req = await getServiceRequestById(supabase, input.id);
  if (!req) throw new Error("Request not found");

  if (input.notifyRecipients) {
    const { data: recipients } = await admin
      .from("notifications")
      .select("volunteer_id, volunteers:volunteers(first_name, email)")
      .eq("request_id", input.id);
    const notifier = createNotificationService();
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/volunteer/dashboard`;
    for (const r of recipients ?? []) {
      const vol = (r as unknown as { volunteers: { first_name: string; email: string } }).volunteers;
      const email = renderRequestCancelled({
        to: vol.email,
        volunteerFirstName: vol.first_name,
        category: req.category,
        requestedDate: req.requested_date,
        reason: input.reason,
        dashboardUrl,
      });
      await notifier.sendEmail(email);
      await admin.from("notifications").insert({
        request_id: input.id, volunteer_id: r.volunteer_id,
        channel: "email", status: "sent", event_type: "cancellation",
      });
    }
  }

  await cancelServiceRequest(supabase, input.id, { reason: input.reason ?? null });
  revalidatePath(`/admin/requests/${input.id}`);
}

// --- REOPEN ---

export async function reopenRequestAction(id: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await reopenServiceRequest(supabase, id);
  revalidatePath(`/admin/requests/${id}`);
}

// --- REASSIGN ---

export async function reassignRequestAction(input: { id: string; newVolunteerId: string }) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const req = await getServiceRequestById(supabase, input.id);
  if (!req) throw new Error("Request not found");

  await reopenServiceRequest(supabase, input.id);
  const { data: senior } = await supabase.from("seniors").select("first_name, city").eq("id", req.senior_id).single();
  const { data: vol } = await supabase.from("volunteers").select("id, first_name, email").eq("id", input.newVolunteerId).single();

  const expires = computeTokenExpiry(req.requested_date).toISOString();
  const token = newToken();
  await supabase.from("response_tokens").insert({
    token, request_id: req.id, volunteer_id: vol!.id, expires_at: expires,
  });
  await supabase.from("notifications").insert({
    request_id: req.id, volunteer_id: vol!.id, channel: "email",
    status: "sent", event_type: "reassignment_invite",
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const email = renderServiceRequestInvite({
    to: vol!.email,
    volunteerFirstName: vol!.first_name,
    seniorFirstName: senior!.first_name,
    seniorCity: senior!.city,
    category: req.category,
    requestedDate: req.requested_date,
    descriptionExcerpt: (req.description ?? "").slice(0, 240),
    acceptUrl: `${appUrl}/respond/${token}?action=accept`,
    declineUrl: `${appUrl}/respond/${token}?action=decline`,
  });
  await createNotificationService().sendEmail(email);
  await supabase.from("service_requests").update({ status: "notified" }).eq("id", req.id);
  revalidatePath(`/admin/requests/${input.id}`);
}

// --- MARK COMPLETED ---

export async function markCompletedAction(id: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await markRequestCompleted(supabase, id);
  revalidatePath(`/admin/requests/${id}`);
}

// --- RETRY FAILED NOTIFICATION ---

export async function retryNotificationAction(notificationId: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: n } = await supabase
    .from("notifications")
    .select("request_id, volunteer_id, event_type")
    .eq("id", notificationId)
    .single();
  if (!n) throw new Error("Notification not found");

  const { data: tok } = await supabase
    .from("response_tokens")
    .select("token")
    .eq("request_id", n.request_id)
    .eq("volunteer_id", n.volunteer_id)
    .is("used_at", null)
    .maybeSingle();
  if (!tok) throw new Error("No active token to retry");

  const req = await getServiceRequestById(supabase, n.request_id);
  const { data: senior } = await supabase.from("seniors").select("first_name, city").eq("id", req!.senior_id).single();
  const { data: vol } = await supabase.from("volunteers").select("first_name, email").eq("id", n.volunteer_id).single();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const email = renderServiceRequestInvite({
    to: vol!.email,
    volunteerFirstName: vol!.first_name,
    seniorFirstName: senior!.first_name,
    seniorCity: senior!.city,
    category: req!.category,
    requestedDate: req!.requested_date,
    descriptionExcerpt: (req!.description ?? "").slice(0, 240),
    acceptUrl: `${appUrl}/respond/${tok.token}?action=accept`,
    declineUrl: `${appUrl}/respond/${tok.token}?action=decline`,
  });
  const res = await createNotificationService().sendEmail(email);
  await supabase.from("notifications")
    .update({ status: res.ok ? "sent" : "failed" })
    .eq("id", notificationId);
  revalidatePath(`/admin/requests/${n.request_id}`);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm run test:integration -- requests/\\[id\\]/actions`
Expected: Both tests PASS.

- [ ] **Step 5: Implement the detail header component**

Create `app/(admin)/admin/requests/[id]/detail-header.tsx`:

```tsx
import type { Database } from "@/lib/db/types";

type Request = Database["public"]["Tables"]["service_requests"]["Row"];
type Senior = Pick<Database["public"]["Tables"]["seniors"]["Row"],
  "first_name" | "last_name" | "address_line1" | "city" | "province" | "postal_code" | "phone">;

export function DetailHeader({
  request, senior, assigneeName,
}: { request: Request; senior: Senior; assigneeName: string | null }) {
  return (
    <header className="space-y-1 border-b pb-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">
          {senior.first_name} {senior.last_name} — {request.category}
        </h1>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase">{request.status}</span>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs uppercase">{request.priority}</span>
      </div>
      <p className="text-sm text-gray-600">
        {request.requested_date} · {senior.address_line1}, {senior.city}, {senior.province} {senior.postal_code} · {senior.phone}
      </p>
      {assigneeName && <p className="text-sm">Assigned: <strong>{assigneeName}</strong></p>}
      {request.description && <p className="mt-2 whitespace-pre-wrap">{request.description}</p>}
    </header>
  );
}
```

- [ ] **Step 6: Implement the eligible picker (client component)**

Create `app/(admin)/admin/requests/[id]/eligible-picker.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { RankedVolunteer } from "@/lib/matching/eligibility";
import { sendInvitesAction } from "./actions";

export function EligiblePicker({
  requestId, volunteers,
}: { requestId: string; volunteers: RankedVolunteer[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAllInArea = () => setSelected(new Set(volunteers.filter(v => v.inArea).map(v => v.id)));
  const selectAll = () => setSelected(new Set(volunteers.map(v => v.id)));
  const clear = () => setSelected(new Set());

  async function send() {
    setError(null);
    const ids = [...selected];
    if (ids.length === 0) { setError("Pick at least one volunteer."); return; }
    const confirmed = ids.length > 25 ? window.confirm(`You're about to email ${ids.length} volunteers. Continue?`) : true;
    if (!confirmed) return;
    startTransition(async () => {
      try {
        await sendInvitesAction({ requestId, volunteerIds: ids, confirmed: ids.length > 25 });
        setSelected(new Set());
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Eligible volunteers</h2>
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={selectAllInArea} className="underline">Select all in-area</button>
        <button type="button" onClick={selectAll} className="underline">Select all</button>
        <button type="button" onClick={clear} className="underline">Clear</button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th></th><th>Name</th><th>Area</th><th>Categories</th></tr>
        </thead>
        <tbody>
          {volunteers.map(v => (
            <tr key={v.id} className="border-t">
              <td><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} /></td>
              <td>{v.first_name} {v.last_name}</td>
              <td>
                {v.service_area}
                {v.inArea && <span className="ml-1 rounded bg-green-100 px-1 text-xs text-green-800">in-area</span>}
              </td>
              <td>{v.categories.join(", ")}</td>
            </tr>
          ))}
          {volunteers.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-500">No eligible volunteers.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button
          type="button" disabled={pending || selected.size === 0} onClick={send}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : `Send to ${selected.size} volunteer${selected.size === 1 ? "" : "s"}`}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Implement the detail page**

Create `app/(admin)/admin/requests/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceRequestById } from "@/lib/db/queries/service-requests";
import { rankEligibleVolunteers } from "@/lib/matching/eligibility";
import { DetailHeader } from "./detail-header";
import { EligiblePicker } from "./eligible-picker";

export default async function RequestDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const request = await getServiceRequestById(supabase, id);
  if (!request) notFound();

  const { data: senior } = await supabase.from("seniors").select("*").eq("id", request.senior_id).single();
  if (!senior) notFound();

  const { data: assignee } = request.assigned_volunteer_id
    ? await supabase.from("volunteers").select("first_name, last_name").eq("id", request.assigned_volunteer_id).single()
    : { data: null };

  let ranked: ReturnType<typeof rankEligibleVolunteers> = [];
  if (request.status === "open") {
    const { data: vols } = await supabase
      .from("volunteers")
      .select("id, first_name, last_name, categories, service_area, status")
      .eq("status", "active");
    ranked = rankEligibleVolunteers(vols ?? [], { city: senior.city }, request.category);
  }

  return (
    <section className="space-y-6">
      <DetailHeader
        request={request}
        senior={senior}
        assigneeName={assignee ? `${assignee.first_name} ${assignee.last_name}` : null}
      />
      {request.status === "open" && <EligiblePicker requestId={request.id} volunteers={ranked} />}
    </section>
  );
}
```

- [ ] **Step 8: Manual smoke check**

Run: `npm run dev`. As admin: create a request, open detail, send to 1–2 volunteers (use `ConsoleEmailService` driver — emails print to console). Verify status flips to `notified` and a `response_tokens` row exists.

- [ ] **Step 9: Commit**

```bash
git add app/\(admin\)/admin/requests/\[id\]
git commit -m "feat(requests): admin detail — header + eligible picker + sendInvites"
```

---

## Task 12: Admin detail — recipients table + activity log

**Files:**
- Modify: `app/(admin)/admin/requests/[id]/page.tsx`
- Create: `app/(admin)/admin/requests/[id]/recipients-table.tsx`
- Create: `app/(admin)/admin/requests/[id]/activity-log.tsx`

- [ ] **Step 1: Implement the recipients table (server component, no test — visual/data-join only)**

Create `app/(admin)/admin/requests/[id]/recipients-table.tsx`:

```tsx
import type { RecipientRow } from "@/lib/db/queries/service-requests";
import { RetryButton } from "./retry-button";

export function RecipientsTable({ rows }: { rows: RecipientRow[] }) {
  const summary = {
    total: rows.length,
    accepted: rows.filter(r => r.token_action === "accept").length,
    declined: rows.filter(r => r.token_action === "decline").length,
    superseded: rows.filter(r => r.token_action === "superseded").length,
    pending: rows.filter(r => r.token_action === null).length,
    failed: rows.filter(r => r.notification_status === "failed").length,
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Recipients</h2>
      <p className="text-sm text-gray-600">
        Sent to {summary.total} · {summary.accepted} accepted · {summary.declined} declined · {summary.pending} pending
        {summary.superseded > 0 && ` · ${summary.superseded} superseded`}
        {summary.failed > 0 && ` · ${summary.failed} failed`}
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>Volunteer</th><th>Sent</th><th>State</th><th>Response</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const state =
              r.token_action === "accept" ? "accepted" :
              r.token_action === "decline" ? "declined" :
              r.token_action === "superseded" ? "superseded" :
              r.notification_status === "failed" ? "failed" :
              "pending";
            return (
              <tr key={r.notification_id} className="border-t">
                <td className="py-2">{r.volunteer_first_name} {r.volunteer_last_name}</td>
                <td>{new Date(r.sent_at).toLocaleString("en-CA")}</td>
                <td>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase">{state}</span>
                </td>
                <td>{r.token_used_at ? new Date(r.token_used_at).toLocaleString("en-CA") : "—"}</td>
                <td>{state === "failed" && <RetryButton notificationId={r.notification_id} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
```

Create `app/(admin)/admin/requests/[id]/retry-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { retryNotificationAction } from "./actions";

export function RetryButton({ notificationId }: { notificationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => retryNotificationAction(notificationId))}
      className="text-blue-600 underline text-sm"
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}
```

- [ ] **Step 2: Implement the activity log (derived at query time)**

Create `app/(admin)/admin/requests/[id]/activity-log.tsx`:

```tsx
import type { Database } from "@/lib/db/types";
import type { RecipientRow } from "@/lib/db/queries/service-requests";

type Request = Database["public"]["Tables"]["service_requests"]["Row"];

type Event = { at: string; label: string };

export function ActivityLog({ request, recipients }: { request: Request; recipients: RecipientRow[] }) {
  const events: Event[] = [];
  events.push({ at: request.created_at, label: "Request created" });

  const sentInvites = recipients.filter(r => r.event_type === "invite");
  if (sentInvites.length > 0) {
    events.push({
      at: sentInvites[0].sent_at,
      label: `Sent to ${sentInvites.length} volunteer${sentInvites.length === 1 ? "" : "s"}`,
    });
  }

  for (const r of recipients) {
    if (r.token_used_at && r.token_action === "accept") {
      events.push({ at: r.token_used_at, label: `${r.volunteer_first_name} ${r.volunteer_last_name} accepted` });
    } else if (r.token_used_at && r.token_action === "decline") {
      events.push({ at: r.token_used_at, label: `${r.volunteer_first_name} ${r.volunteer_last_name} declined` });
    }
  }

  if (request.cancelled_at) events.push({ at: request.cancelled_at, label: "Cancelled" });
  if (request.reopened_at) events.push({ at: request.reopened_at, label: "Reopened" });
  if (request.completed_at) events.push({ at: request.completed_at, label: "Completed" });

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Activity</h2>
      <ol className="space-y-1 text-sm">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3">
            <time className="w-40 text-gray-500">{new Date(e.at).toLocaleString("en-CA")}</time>
            <span>{e.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 3: Wire them into the detail page**

Modify `app/(admin)/admin/requests/[id]/page.tsx` — add imports and render the two new sections when `status` is `notified` / `accepted` / `completed` / `cancelled`:

```tsx
// top
import { listRecipientsForRequest } from "@/lib/db/queries/service-requests";
import { RecipientsTable } from "./recipients-table";
import { ActivityLog } from "./activity-log";

// inside the page component, after computing `request` and `senior`:
const recipients = ["notified", "accepted", "completed", "cancelled"].includes(request.status)
  ? await listRecipientsForRequest(supabase, request.id)
  : [];

// then in JSX, after EligiblePicker:
{recipients.length > 0 && <RecipientsTable rows={recipients} />}
<ActivityLog request={request} recipients={recipients} />
```

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`. Open a notified request — confirm summary line, table rows, and activity log all render.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/requests/\[id\]/recipients-table.tsx \
        app/\(admin\)/admin/requests/\[id\]/retry-button.tsx \
        app/\(admin\)/admin/requests/\[id\]/activity-log.tsx \
        app/\(admin\)/admin/requests/\[id\]/page.tsx
git commit -m "feat(requests): admin detail — recipients table + activity log"
```

---

## Task 13: Admin — edit, cancel, reopen, reassign, complete UI

**Files:**
- Create: `app/(admin)/admin/requests/[id]/edit/page.tsx`
- Create: `app/(admin)/admin/requests/[id]/edit/edit-form.tsx`
- Create: `app/(admin)/admin/requests/[id]/edit/actions.ts`
- Create: `app/(admin)/admin/requests/[id]/action-menu.tsx`
- Modify: `app/(admin)/admin/requests/[id]/detail-header.tsx` (add action menu slot)

- [ ] **Step 1: Write failing test for `updateRequestAction`**

Create `app/(admin)/admin/requests/[id]/edit/actions.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser } from "@/tests/integration/helpers";
import { _updateRequestForAdmin } from "./actions";

describe("updateRequestAction", () => {
  test("allows description edit when notified", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`u-${Date.now()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();
    const { data: r } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
    }).select().single();

    const updated = await _updateRequestForAdmin(admin, r!.id, { description: "new desc" });
    expect(updated.description).toBe("new desc");
  });

  test("rejects category edit when notified", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`u2-${Date.now()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();
    const { data: r } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
    }).select().single();

    await expect(
      _updateRequestForAdmin(admin, r!.id, { category: "groceries" }),
    ).rejects.toThrow(/locked/i);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm run test:integration -- requests/\\[id\\]/edit/actions`
Expected: FAIL.

- [ ] **Step 3: Implement the edit Server Action**

Create `app/(admin)/admin/requests/[id]/edit/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateServiceRequest, type UpdateInput } from "@/lib/db/queries/service-requests";

const Schema = z.object({
  senior_id: z.string().uuid().optional(),
  category: z.string().min(1).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function updateRequestAction(id: string, input: unknown) {
  await requireAdmin();
  const parsed = Schema.parse(input);
  const supabase = await createSupabaseServerClient();
  try {
    await _updateRequestForAdmin(supabase, id, parsed);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  revalidatePath(`/admin/requests/${id}`);
  redirect(`/admin/requests/${id}`);
}

export async function _updateRequestForAdmin(
  supabase: SupabaseClient<Database>, id: string, input: UpdateInput,
) {
  return updateServiceRequest(supabase, id, input);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm run test:integration -- requests/\\[id\\]/edit/actions`
Expected: PASS.

- [ ] **Step 5: Implement the edit form + page**

Create `app/(admin)/admin/requests/[id]/edit/edit-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { updateRequestAction } from "./actions";

type Props = {
  requestId: string;
  locked: boolean;
  defaults: { category: string; priority: "low" | "normal" | "high"; requested_date: string; description: string | null };
  categories: string[];
};

export function EditForm({ requestId, locked, defaults, categories }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const payload = locked
        ? { priority: fd.get("priority"), description: fd.get("description") }
        : Object.fromEntries(fd.entries());
      const res = await updateRequestAction(requestId, payload);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {locked && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
          This request is currently notified. Category, date, and senior are locked. Cancel the request to change them.
        </p>
      )}
      <label className="block">
        <span className="text-sm font-medium">Category</span>
        <select name="category" defaultValue={defaults.category} disabled={locked} className="w-full rounded border px-3 py-2 disabled:bg-gray-100">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Priority</span>
        <select name="priority" defaultValue={defaults.priority} className="w-full rounded border px-3 py-2">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Requested date</span>
        <input type="date" name="requested_date" defaultValue={defaults.requested_date} disabled={locked}
          className="w-full rounded border px-3 py-2 disabled:bg-gray-100" />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Description</span>
        <textarea name="description" defaultValue={defaults.description ?? ""} rows={4} className="w-full rounded border px-3 py-2" />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={pending} className="rounded bg-black px-4 py-2 text-sm font-medium text-white">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
```

Create `app/(admin)/admin/requests/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceRequestById } from "@/lib/db/queries/service-requests";
import { EditForm } from "./edit-form";

export default async function EditRequestPage({
  params,
}: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const request = await getServiceRequestById(supabase, id);
  if (!request) notFound();
  const { data: cats } = await supabase.from("volunteer_categories").select("name").order("name");

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit request</h1>
      <EditForm
        requestId={request.id}
        locked={request.status === "notified"}
        defaults={{
          category: request.category,
          priority: request.priority,
          requested_date: request.requested_date,
          description: request.description,
        }}
        categories={(cats ?? []).map(c => c.name)}
      />
    </section>
  );
}
```

- [ ] **Step 6: Implement the action menu**

Create `app/(admin)/admin/requests/[id]/action-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Database } from "@/lib/db/types";
import { cancelRequestAction, reopenRequestAction, markCompletedAction, reassignRequestAction } from "./actions";

type Status = Database["public"]["Enums"]["request_status"];

type Props = {
  id: string;
  status: Status;
  eligibleForReassign?: { id: string; label: string }[];
};

export function ActionMenu({ id, status, eligibleForReassign = [] }: Props) {
  const [pending, startTransition] = useTransition();
  const [showCancel, setShowCancel] = useState(false);
  const [showReassign, setShowReassign] = useState(false);

  return (
    <div className="flex gap-2">
      <Link href={`/admin/requests/${id}/edit`} className="rounded border px-3 py-1 text-sm">Edit</Link>

      {status === "accepted" && (
        <>
          <button type="button" onClick={() => startTransition(() => reopenRequestAction(id))} className="rounded border px-3 py-1 text-sm">Reopen</button>
          <button type="button" onClick={() => setShowReassign(true)} className="rounded border px-3 py-1 text-sm">Reassign</button>
          <button type="button" onClick={() => startTransition(() => markCompletedAction(id))} className="rounded border px-3 py-1 text-sm">Mark completed</button>
        </>
      )}

      {status !== "cancelled" && status !== "completed" && (
        <button type="button" onClick={() => setShowCancel(true)} className="rounded border border-red-500 px-3 py-1 text-sm text-red-600">Cancel</button>
      )}

      {showCancel && (
        <CancelDialog id={id} onClose={() => setShowCancel(false)} />
      )}

      {showReassign && (
        <ReassignDialog id={id} choices={eligibleForReassign} onClose={() => setShowReassign(false)} />
      )}
      {pending && <span className="text-sm text-gray-500">Working…</span>}
    </div>
  );
}

function CancelDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        action={(fd) => startTransition(async () => {
          await cancelRequestAction({
            id,
            reason: (fd.get("reason") as string) || undefined,
            notifyRecipients: fd.get("notify") === "on",
          });
          onClose();
        })}
        className="w-80 space-y-3 rounded bg-white p-4"
      >
        <h3 className="font-semibold">Cancel request</h3>
        <label className="block text-sm">Reason (optional)
          <textarea name="reason" rows={3} className="mt-1 w-full rounded border px-2 py-1" />
        </label>
        <label className="block text-sm"><input type="checkbox" name="notify" className="mr-2" />Notify recipients</label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">Back</button>
          <button disabled={pending} className="rounded bg-red-600 px-3 py-1 text-sm text-white">
            {pending ? "Cancelling…" : "Cancel request"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReassignDialog({
  id, choices, onClose,
}: { id: string; choices: { id: string; label: string }[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [pick, setPick] = useState(choices[0]?.id ?? "");

  return (
    <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 space-y-3 rounded bg-white p-4">
        <h3 className="font-semibold">Reassign to</h3>
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="w-full rounded border px-2 py-1">
          {choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">Back</button>
          <button
            disabled={pending || !pick}
            onClick={() => startTransition(async () => { await reassignRequestAction({ id, newVolunteerId: pick }); onClose(); })}
            className="rounded bg-black px-3 py-1 text-sm text-white"
          >{pending ? "Reassigning…" : "Reassign"}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire ActionMenu into the detail page**

Modify `app/(admin)/admin/requests/[id]/page.tsx` — add the menu to the header area. Compute `eligibleForReassign` when `status === 'accepted'` (same ranked list, excluding current assignee):

```tsx
// add imports:
import { ActionMenu } from "./action-menu";

// near top of component, after computing `ranked`:
let reassignChoices: { id: string; label: string }[] = [];
if (request.status === "accepted") {
  const { data: vols } = await supabase
    .from("volunteers")
    .select("id, first_name, last_name, categories, service_area, status")
    .eq("status", "active");
  const ranked2 = rankEligibleVolunteers(vols ?? [], { city: senior.city }, request.category);
  reassignChoices = ranked2
    .filter(v => v.id !== request.assigned_volunteer_id)
    .map(v => ({ id: v.id, label: `${v.first_name} ${v.last_name}${v.inArea ? " (in-area)" : ""}` }));
}

// in JSX, below <DetailHeader>:
<ActionMenu id={request.id} status={request.status} eligibleForReassign={reassignChoices} />
```

- [ ] **Step 8: Manual smoke check**

Run: `npm run dev`. Cancel a notified request (with/without notify), reopen an accepted one, reassign an accepted one. Confirm the DB state transitions correctly.

- [ ] **Step 9: Commit**

```bash
git add app/\(admin\)/admin/requests/\[id\]
git commit -m "feat(requests): admin edit + cancel/reopen/reassign/complete actions"
```

---

## Task 14: Admin completion/cancellation — update list page badges

**Files:**
- Modify: `app/(admin)/admin/requests/page.tsx` (add sent/accepted counts column for notified rows)
- Add: small helper `lib/db/queries/service-requests.ts` — `listRequestSummaries` (rows + notification counts)

- [ ] **Step 1: Add helper**

In `lib/db/queries/service-requests.ts`, append:

```typescript
export async function getNotificationCountsByRequest(
  supabase: Client, requestIds: string[],
): Promise<Map<string, { sent: number; accepted: number }>> {
  if (requestIds.length === 0) return new Map();
  const { data: notifs } = await supabase
    .from("notifications")
    .select("request_id")
    .in("request_id", requestIds);
  const { data: toks } = await supabase
    .from("response_tokens")
    .select("request_id, action")
    .in("request_id", requestIds);

  const result = new Map<string, { sent: number; accepted: number }>();
  for (const id of requestIds) result.set(id, { sent: 0, accepted: 0 });
  for (const n of notifs ?? []) {
    const cur = result.get(n.request_id)!;
    cur.sent += 1;
  }
  for (const t of toks ?? []) {
    if (t.action === "accept") result.get(t.request_id)!.accepted += 1;
  }
  return result;
}
```

- [ ] **Step 2: Use it in the list page**

In `app/(admin)/admin/requests/page.tsx`, after `listServiceRequests`:

```tsx
import { getNotificationCountsByRequest } from "@/lib/db/queries/service-requests";

const counts = await getNotificationCountsByRequest(supabase, rows.map(r => r.id));
```

And in the table row, next to status, show `counts.get(r.id)` if `r.status` is `notified` or `accepted`: `sent N · accepted M`.

- [ ] **Step 3: Manual smoke check**

Verify the list page shows counts for notified/accepted rows.

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries/service-requests.ts app/\(admin\)/admin/requests/page.tsx
git commit -m "feat(requests): list page — sent/accepted counts per row"
```

---

## Task 15: Volunteer portal — Server Action for respond

**Files:**
- Create: `app/(volunteer)/volunteer/actions.ts`
- Create: `app/(volunteer)/volunteer/actions.test.ts`

- [ ] **Step 1: Write failing test**

Create `app/(volunteer)/volunteer/actions.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "@/tests/integration/helpers";
import { _respondFromPortal } from "./actions";

async function seed() {
  const admin = adminClient();
  const a = await createAdminUser(`a-${Date.now()}@t.local`);
  const v = await createVolunteerUser(`v-${Date.now()}@t.local`, "active");
  const { data: s } = await admin.from("seniors").insert({
    first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
    province: "ON", postal_code: "M1A1A1", created_by: a.userId,
  }).select().single();
  const { data: r } = await admin.from("service_requests").insert({
    senior_id: s!.id, category: "transportation", priority: "normal",
    requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
  }).select().single();
  const token = `tok-${Date.now()}-${Math.random()}`;
  await admin.from("response_tokens").insert({
    token, request_id: r!.id, volunteer_id: v.userId,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await admin.from("notifications").insert({
    request_id: r!.id, volunteer_id: v.userId, channel: "email", status: "sent", event_type: "invite",
  });
  return { admin, request: r!, v };
}

describe("respondFromPortal", () => {
  test("accept via portal transitions request", async () => {
    const { admin, request, v } = await seed();
    const outcome = await _respondFromPortal({ requestId: request.id, volunteerId: v.userId, action: "accept" });
    expect(outcome).toBe("accepted");
    const { data: updated } = await admin.from("service_requests").select("status, assigned_volunteer_id").eq("id", request.id).single();
    expect(updated?.status).toBe("accepted");
    expect(updated?.assigned_volunteer_id).toBe(v.userId);
  });

  test("decline via portal marks token used without changing status", async () => {
    const { admin, request, v } = await seed();
    const outcome = await _respondFromPortal({ requestId: request.id, volunteerId: v.userId, action: "decline" });
    expect(outcome).toBe("declined");
    const { data: updated } = await admin.from("service_requests").select("status").eq("id", request.id).single();
    expect(updated?.status).toBe("notified");
  });

  test("returns already_filled if request is already accepted", async () => {
    const { admin, request, v } = await seed();
    await admin.from("service_requests").update({
      status: "accepted", assigned_volunteer_id: v.userId,
    }).eq("id", request.id);
    const outcome = await _respondFromPortal({ requestId: request.id, volunteerId: v.userId, action: "accept" });
    expect(outcome).toBe("already_filled");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm run test:integration -- volunteer/actions`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `app/(volunteer)/volunteer/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireActiveVolunteer } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function respondFromPortal(input: { requestId: string; action: "accept" | "decline" }) {
  const user = await requireActiveVolunteer();
  const outcome = await _respondFromPortal({
    requestId: input.requestId,
    volunteerId: user.userId,
    action: input.action,
  });
  revalidatePath("/volunteer/dashboard");
  return outcome;
}

export async function _respondFromPortal(input: {
  requestId: string; volunteerId: string; action: "accept" | "decline";
}): Promise<"accepted" | "declined" | "already_filled" | "expired" | "invalid"> {
  const admin = createSupabaseAdminClient();

  const { data: tok } = await admin
    .from("response_tokens")
    .select("token")
    .eq("request_id", input.requestId)
    .eq("volunteer_id", input.volunteerId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!tok) return "invalid";

  const { data, error } = await admin.rpc("consume_response_token", {
    p_token: tok.token,
    p_action: input.action,
  });
  if (error) throw error;
  return (data as { outcome: typeof _respondFromPortal extends never ? never : "accepted" | "declined" | "already_filled" | "expired" | "invalid" })
    .outcome as "accepted" | "declined" | "already_filled" | "expired" | "invalid";
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm run test:integration -- volunteer/actions`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/\(volunteer\)/volunteer/actions.ts app/\(volunteer\)/volunteer/actions.test.ts
git commit -m "feat(requests): volunteer portal respond Server Action"
```

---

## Task 16: Volunteer dashboard — pending invites + upcoming accepted

**Files:**
- Modify: `app/(volunteer)/volunteer/dashboard/page.tsx`
- Create: `app/(volunteer)/volunteer/dashboard/invite-card.tsx`
- Create: `app/(volunteer)/volunteer/requests/[id]/page.tsx`

- [ ] **Step 1: Implement the invite card (client component)**

Create `app/(volunteer)/volunteer/dashboard/invite-card.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { respondFromPortal } from "../actions";

type Invite = {
  requestId: string;
  category: string;
  requestedDate: string;
  seniorFirstName: string;
  seniorCity: string;
  descriptionExcerpt: string;
};

export function InviteCard({ invite }: { invite: Invite }) {
  const [pending, startTransition] = useTransition();
  return (
    <article className="rounded border p-4 space-y-2">
      <header className="flex items-center justify-between">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase">{invite.category}</span>
        <time className="text-sm text-gray-600">{invite.requestedDate}</time>
      </header>
      <p><strong>{invite.seniorFirstName}</strong> · {invite.seniorCity}</p>
      <p className="text-sm text-gray-700">{invite.descriptionExcerpt}</p>
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => startTransition(() => respondFromPortal({ requestId: invite.requestId, action: "accept" }))}
          className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        >{pending ? "…" : "Accept"}</button>
        <button
          disabled={pending}
          onClick={() => startTransition(() => respondFromPortal({ requestId: invite.requestId, action: "decline" }))}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >{pending ? "…" : "Decline"}</button>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Rewrite the dashboard page**

Modify `app/(volunteer)/volunteer/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { getUserRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InviteCard } from "./invite-card";

export default async function VolunteerDashboardPage() {
  const role = await getUserRole();
  if (role.role !== "volunteer") return null;

  const supabase = await createSupabaseServerClient();

  if (role.status === "pending") {
    return (
      <section className="rounded bg-amber-50 p-4 text-amber-900">
        Your account is awaiting approval. We'll email you when you're active.
      </section>
    );
  }
  if (role.status === "inactive") {
    return (
      <section className="rounded bg-gray-100 p-4 text-gray-700">
        Your account isn't currently active. Please contact us if you think this is a mistake.
      </section>
    );
  }

  // Pending invites: tokens unused, unexpired, request not terminal.
  const { data: invites } = await supabase
    .from("response_tokens")
    .select(`
      request_id,
      service_requests:service_requests!inner(
        id, category, requested_date, description, status,
        seniors:seniors!inner(first_name, city)
      )
    `)
    .eq("volunteer_id", role.userId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .in("service_requests.status", ["open", "notified"]);

  const inviteCards = (invites ?? []).map((r) => {
    const req = (r as unknown as {
      service_requests: {
        id: string; category: string; requested_date: string; description: string | null;
        seniors: { first_name: string; city: string };
      };
    }).service_requests;
    return {
      requestId: req.id,
      category: req.category,
      requestedDate: req.requested_date,
      seniorFirstName: req.seniors.first_name,
      seniorCity: req.seniors.city,
      descriptionExcerpt: (req.description ?? "").slice(0, 180),
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const { data: upcoming } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_date, description,
      seniors:seniors(first_name, last_name, address_line1, city, phone)
    `)
    .eq("assigned_volunteer_id", role.userId)
    .eq("status", "accepted")
    .gte("requested_date", today)
    .order("requested_date");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Pending invites</h2>
        {inviteCards.length === 0 ? (
          <p className="text-gray-600">No pending invites right now.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {inviteCards.map((i) => <InviteCard key={i.requestId} invite={i} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Upcoming accepted</h2>
        {(upcoming ?? []).length === 0 ? (
          <p className="text-gray-600">Nothing scheduled yet.</p>
        ) : (
          <ul className="space-y-2">
            {(upcoming ?? []).map((r) => {
              const s = (r as unknown as { seniors: { first_name: string; last_name: string; address_line1: string; city: string; phone: string } }).seniors;
              return (
                <li key={r.id} className="rounded border p-3">
                  <Link href={`/volunteer/requests/${r.id}`} className="font-medium">
                    {s.first_name} {s.last_name} — {r.category}
                  </Link>
                  <p className="text-sm text-gray-600">
                    {r.requested_date} · {s.address_line1}, {s.city} · {s.phone}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Implement the assigned-request detail page**

Create `app/(volunteer)/volunteer/requests/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireActiveVolunteer } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function VolunteerRequestDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const user = await requireActiveVolunteer();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: r } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_date, description, status,
      seniors:seniors(first_name, last_name, address_line1, address_line2, city, province, postal_code, phone)
    `)
    .eq("id", id)
    .eq("assigned_volunteer_id", user.userId)
    .maybeSingle();
  if (!r) notFound();

  const s = (r as unknown as { seniors: { first_name: string; last_name: string; address_line1: string; address_line2: string | null; city: string; province: string; postal_code: string; phone: string } }).seniors;

  return (
    <section className="mx-auto max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold">{s.first_name} {s.last_name}</h1>
      <p className="text-gray-700">{r.category} · {r.requested_date}</p>
      <p>{s.address_line1}{s.address_line2 ? `, ${s.address_line2}` : ""}<br />{s.city}, {s.province} {s.postal_code}</p>
      <p>{s.phone}</p>
      {r.description && <p className="whitespace-pre-wrap">{r.description}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Manual smoke check**

As an active volunteer: invite them from admin, verify dashboard card shows, click Accept, verify it moves to Upcoming accepted. Verify the detail page shows full senior info.

- [ ] **Step 5: Commit**

```bash
git add app/\(volunteer\)/volunteer
git commit -m "feat(requests): volunteer dashboard invites + upcoming + request detail"
```

---

## Task 17: Volunteer history

**Files:**
- Create: `app/(volunteer)/volunteer/history/page.tsx`

- [ ] **Step 1: Implement the page**

Create `app/(volunteer)/volunteer/history/page.tsx`:

```tsx
import Link from "next/link";
import { requireActiveVolunteer } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function VolunteerHistoryPage() {
  const user = await requireActiveVolunteer();
  const supabase = await createSupabaseServerClient();

  const today = new Date().toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_date, status,
      seniors:seniors(first_name, last_name)
    `)
    .eq("assigned_volunteer_id", user.userId)
    .or(`status.eq.completed,and(status.eq.accepted,requested_date.lt.${today})`)
    .order("requested_date", { ascending: false })
    .limit(200);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">History</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>Date</th><th>Senior</th><th>Category</th><th>Status</th></tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => {
            const s = (r as unknown as { seniors: { first_name: string; last_name: string } }).seniors;
            return (
              <tr key={r.id} className="border-t">
                <td className="py-2">{r.requested_date}</td>
                <td><Link href={`/volunteer/requests/${r.id}`} className="text-blue-600 underline">{s.first_name} {s.last_name}</Link></td>
                <td>{r.category}</td>
                <td>{r.status}</td>
              </tr>
            );
          })}
          {(rows ?? []).length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-500">No past assignments yet.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Manual smoke check**

Mark an accepted request as completed. Verify it appears on /volunteer/history for the assigned volunteer.

- [ ] **Step 3: Commit**

```bash
git add app/\(volunteer\)/volunteer/history
git commit -m "feat(requests): volunteer history page"
```

---

## Task 18: E2E — golden paths

**Files:**
- Create: `tests/e2e/admin-request-broadcast-accept.spec.ts`
- Create: `tests/e2e/volunteer-portal-accept.spec.ts`
- Create: `tests/e2e/admin-cancel-with-notify.spec.ts`

Existing spec `tests/e2e/admin-volunteer-lifecycle.spec.ts` is the reference for auth + seeding patterns: service-role client from `.env.local`, admin login as `admin@local.test / password123!`, volunteer login via email/password.

- [ ] **Step 1: Write `admin-request-broadcast-accept.spec.ts`**

Create `tests/e2e/admin-request-broadcast-accept.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin broadcasts, first volunteer to accept wins, sibling is superseded", async ({ page, browser }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();

  // Seed two active volunteers.
  const emails = [`e2e-v1-${ts}@test.com`, `e2e-v2-${ts}@test.com`];
  const volunteerIds: string[] = [];
  for (const email of emails) {
    const { data: u } = await svc.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
    volunteerIds.push(u.user!.id);
    await svc.from("volunteers").insert({
      id: u.user!.id, first_name: "E2E", last_name: `V${volunteerIds.length}`, email,
      categories: ["transportation"], service_area: "Toronto", auth_provider: "email", status: "active",
    });
  }

  // Seed a senior. `created_by` must be the dev admin's id — look it up.
  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;
  const { data: senior } = await svc.from("seniors").insert({
    first_name: "E2E", last_name: "Senior", phone: "416-555-0001",
    address_line1: "1 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();

  // Log in as admin and create the request.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/admin/requests/new");
  await page.getByLabel(/senior search/i).fill("E2E Senior");
  await page.getByRole("button", { name: /E2E Senior/ }).click();
  await page.selectOption("select[name=category]", "transportation");
  await page.fill("input[name=requested_date]", "2030-06-01");
  await page.fill("textarea[name=description]", "e2e test request");
  await page.getByRole("button", { name: /create request/i }).click();
  await expect(page).toHaveURL(/\/admin\/requests\/[0-9a-f-]+$/);

  // Select both volunteers and send.
  await page.getByRole("button", { name: /select all/i }).first().click();
  await page.getByRole("button", { name: /send to 2 volunteers/i }).click();
  await expect(page.getByText(/sent to 2/i)).toBeVisible();

  // Grab the request id from the URL and v1's token directly from DB.
  const requestId = page.url().split("/").pop()!;
  const { data: tokens } = await svc.from("response_tokens")
    .select("token, volunteer_id")
    .eq("request_id", requestId);
  const v1Token = tokens!.find(t => t.volunteer_id === volunteerIds[0])!.token;

  // v1 accepts via magic link in an unauthenticated context.
  const ctx = await browser.newContext();
  const page2 = await ctx.newPage();
  await page2.goto(`/respond/${encodeURIComponent(v1Token)}?action=accept`);
  await expect(page2).toHaveURL(/\/respond\/.+\/accepted$/);
  await expect(page2.getByRole("heading", { name: /you've got it/i })).toBeVisible();
  await ctx.close();

  // Back on admin: status accepted, superseded sibling visible.
  await page.reload();
  await expect(page.getByText(/accepted/i).first()).toBeVisible();
  await expect(page.getByText(/superseded/i)).toBeVisible();
});
```

- [ ] **Step 2: Write `volunteer-portal-accept.spec.ts`**

Create `tests/e2e/volunteer-portal-accept.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("volunteer accepts invite from dashboard card", async ({ page }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();
  const email = `e2e-portal-${ts}@test.com`;

  const { data: u } = await svc.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
  const volunteerId = u.user!.id;
  await svc.from("volunteers").insert({
    id: volunteerId, first_name: "E2E", last_name: "Portal", email,
    categories: ["transportation"], service_area: "Toronto", auth_provider: "email", status: "active",
  });

  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;
  const { data: senior } = await svc.from("seniors").insert({
    first_name: "Jane", last_name: "Doe", phone: "416-555-0002",
    address_line1: "2 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();
  const { data: req } = await svc.from("service_requests").insert({
    senior_id: senior!.id, category: "transportation", priority: "normal",
    requested_date: "2030-06-01", description: "ride", created_by: adminId, status: "notified",
  }).select().single();
  await svc.from("response_tokens").insert({
    token: `e2e-tok-${ts}`, request_id: req!.id, volunteer_id: volunteerId,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await svc.from("notifications").insert({
    request_id: req!.id, volunteer_id: volunteerId, channel: "email", status: "sent", event_type: "invite",
  });

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("Password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/volunteer\/dashboard/);

  await expect(page.getByText(/pending invites/i)).toBeVisible();
  await expect(page.getByText("Jane")).toBeVisible();
  await page.getByRole("button", { name: /^accept$/i }).click();

  await expect(page.getByText(/upcoming accepted/i)).toBeVisible();
  await expect(page.getByText(/Jane Doe/)).toBeVisible();
});
```

- [ ] **Step 3: Write `admin-cancel-with-notify.spec.ts`**

Create `tests/e2e/admin-cancel-with-notify.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin cancels a notified request and volunteer dashboard invite disappears", async ({ page, browser }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();
  const volEmail = `e2e-cancel-v-${ts}@test.com`;

  const { data: u } = await svc.auth.admin.createUser({ email: volEmail, password: "Password123!", email_confirm: true });
  const vid = u.user!.id;
  await svc.from("volunteers").insert({
    id: vid, first_name: "E2E", last_name: "Cancel", email: volEmail,
    categories: ["transportation"], service_area: "Toronto", auth_provider: "email", status: "active",
  });

  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;
  const { data: senior } = await svc.from("seniors").insert({
    first_name: "Jane", last_name: "X", phone: "416-555-0003",
    address_line1: "3 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();
  const { data: req } = await svc.from("service_requests").insert({
    senior_id: senior!.id, category: "transportation", priority: "normal",
    requested_date: "2030-06-01", description: "x", created_by: adminId, status: "notified",
  }).select().single();
  await svc.from("response_tokens").insert({
    token: `cancel-tok-${ts}`, request_id: req!.id, volunteer_id: vid,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await svc.from("notifications").insert({
    request_id: req!.id, volunteer_id: vid, channel: "email", status: "sent", event_type: "invite",
  });

  // Admin cancels with notify.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.goto(`/admin/requests/${req!.id}`);
  await page.getByRole("button", { name: /^cancel$/i }).click();
  await page.getByLabel(/notify recipients/i).check();
  await page.getByRole("button", { name: /cancel request/i }).click();
  await expect(page.getByText(/cancelled/i).first()).toBeVisible();

  // Volunteer sees empty invites.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto("/login");
  await p2.getByLabel(/email/i).fill(volEmail);
  await p2.getByLabel(/password/i).fill("Password123!");
  await p2.getByRole("button", { name: /sign in/i }).click();
  await expect(p2.getByText(/no pending invites/i)).toBeVisible();
  await ctx.close();
});
```

- [ ] **Step 4: Run locally**

Run: `npm run test:e2e`
Expected: Three new specs pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(requests): e2e — broadcast+accept, portal accept, cancel+notify"
```

---

## Task 19: Design-system pass

**Files:**
- Touch: component files added above, as needed

Per project memory: [DESIGN.md](../../../DESIGN.md) is the source of truth for UI.

- [ ] **Step 1: Read the design system**

Run: `cat DESIGN.md` and note color tokens, spacing, button variants, card patterns used elsewhere in the app.

- [ ] **Step 2: Identify drift**

Open `npm run dev`, visit each new page:
- `/admin/requests`
- `/admin/requests/new`
- `/admin/requests/[id]`
- `/admin/requests/[id]/edit`
- `/volunteer/dashboard`
- `/volunteer/requests/[id]`
- `/volunteer/history`
- `/respond/[token]/*`

Compare against `/admin/volunteers/*` (from the merged PR #6) and look for:
- Button style inconsistencies (should use the shared Button component if one exists)
- Card padding/border radius drift
- Status badge styles (reuse pattern)

- [ ] **Step 3: Apply adjustments**

Refactor ad-hoc Tailwind classes to use shared components / utility classes already in the codebase. Do not invent new tokens. Keep edits surgical.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "style(requests): align pages with design system"
```

---

## Task 20: Final checks + dev-seed cleanup

**Files:**
- Possibly: `app/(admin)/admin/dev-tools.tsx` — add "seed a service request" option (optional)

- [ ] **Step 1: Run full test suite**

Run: `npm run lint && npm run typecheck && npm test && npm run test:integration`
Expected: All green. Fix anything that fails.

- [ ] **Step 2: (Optional) Seed button**

If you want to validate the full flow quickly, extend [app/(admin)/admin/dev-tools.tsx](../../../app/(admin)/admin/dev-tools.tsx) with a "seed test service request" button that creates a senior + request + notifies 3 test volunteers. Per memory, this seed surface must come out before shipping Phase 1 — track in memory or spec's "deferred cleanup" section if added.

- [ ] **Step 3: Typecheck + regen types**

Run: `npm run supabase:types && npm run typecheck`
Expected: no drift, no type errors.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -u
git commit -m "chore(requests): final test/lint/type cleanup"
```

- [ ] **Step 5: Open PR**

```bash
git push -u origin <branch>
gh pr create --base main --title "feat: Service Requests sub-project" --body "$(cat <<'EOF'
## Summary
- End-to-end service request lifecycle (create, edit, cancel, reopen, reassign, complete)
- Ranked eligibility + multi-select broadcast with 25-recipient guardrail
- Atomic magic-link accept via `consume_response_token` RPC
- Volunteer portal invites + upcoming + history
- Deferred: admin calendar, dashboard widgets (next sub-project)

## Test plan
- [ ] Unit + integration + e2e all pass locally
- [ ] Manually: broadcast to 2 volunteers, first accepts — second sees "already filled"
- [ ] Manually: cancel with "notify recipients" — volunteer receives email
- [ ] Manually: reassign an accepted request — new token, status returns to notified
- [ ] Manually: edit-lock — cannot change category on a notified request

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Plan self-review notes (for the author)

- Spec coverage — each spec section maps to a task (1→migration; 2→RPC; 3→RLS; 4–6→pure logic + templates; 7→queries; 8→public route; 9–14→admin; 15–17→volunteer; 18→E2E; 19–20→polish).
- Placeholders — none; every code step has concrete code including the E2E specs.
- Type consistency — `rankEligibleVolunteers`, `computeTokenExpiry`, `_sendInvitesForAdmin`, `_respondFromPortal`, `consume_response_token` signatures are consistent across tasks.
