# Volunteer Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase-1 volunteer management — admin CRUD, approval queue, three signup paths (admin-invite, email/password, Google), managed `volunteer_categories` taxonomy, and a dev-only "Seed test data" button.

**Architecture:** New `volunteer_categories` table with RLS (authenticated read, admin write). `volunteers.categories` stays as `text[]` of slugs; names come from a join at render time. Admin-create uses `supabase.auth.admin.inviteUserByEmail` to send the password-setup magic link (routed through our existing `NotificationService` so copy is on-brand). Signup Google button reuses the existing `loginWithGoogleAction` pattern — the `/auth/callback` already routes new Google users to `/signup/complete-profile`, so no callback changes are needed. Admin UI follows the senior-management patterns (status tabs, inline actions, detail page with archive zone). Dev seed is a double env-gated route handler that calls an idempotent Postgres function.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 + design system tokens from `DESIGN.md`, Supabase (Postgres + Auth + RLS), Zod, shadcn/ui, Resend (via `NotificationService`), Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-04-18-volunteer-management-design.md](../specs/2026-04-18-volunteer-management-design.md)

---

## File structure

Files created or modified by this plan. Grouped by responsibility.

### Database
- Create: `supabase/migrations/0013_volunteer_categories.sql` — table, indexes, RLS, seed rows, updated_at trigger.
- Create: `supabase/migrations/0014_seed_dev_fixtures.sql` — `public.seed_dev_fixtures()` function (idempotent).
- Modify: `lib/db/types.ts` — regenerated after migrations.

### Pure-logic helpers
- Create: `lib/utils/slugify.ts` + `.test.ts` — slug from name; collision-suffixing is not in this helper (it lives in the query).

### Validation schemas
- Create: `lib/validations/volunteer-categories.ts` + `.test.ts` — `createCategorySchema`, `updateCategorySchema`.
- Create: `lib/validations/volunteers.ts` + `.test.ts` — `adminCreateVolunteerSchema`, `updateVolunteerSchema`, `completeProfileSchema`.

### DB query helpers
- Create: `lib/db/queries/volunteer-categories.ts` — `listCategories`, `createCategory`, `updateCategory`, `archiveCategory`, `unarchiveCategory`.
- Modify: `lib/db/queries/volunteers.ts` — add `listVolunteers`, `countVolunteers`, `updateVolunteerProfile`, `approveVolunteer`, `rejectVolunteer`, `reactivateVolunteer`.

### Notification templates
- Create: `lib/notifications/templates/volunteer-invite.ts` + `.test.ts` — subject + HTML + text.
- Create: `lib/notifications/templates/volunteer-approved.ts` + `.test.ts`.

### Admin server actions
- Create: `app/(admin)/admin/volunteers/actions.ts` — `createVolunteerAction`, `updateVolunteerAction`, `approveVolunteerAction`, `rejectVolunteerAction`, `reactivateVolunteerAction`, `resendInviteAction`.
- Create: `app/(admin)/admin/volunteers/categories/actions.ts` — `createCategoryAction`, `updateCategoryAction`, `archiveCategoryAction`, `unarchiveCategoryAction`.

### Admin UI
- Modify: `app/(admin)/admin/volunteers/page.tsx` — list + status tabs + pending badge + search + inline approve/reject.
- Create: `app/(admin)/admin/volunteers/new/page.tsx` + `volunteer-form.tsx` — admin-create form.
- Create: `app/(admin)/admin/volunteers/[id]/page.tsx` + `volunteer-edit.tsx` — detail + edit + archive zone.
- Create: `app/(admin)/admin/volunteers/categories/page.tsx` + `categories-manager.tsx` — category CRUD.

### Admin dashboard dev-tools
- Modify: `app/(admin)/admin/page.tsx` — add env-gated DevTools card.
- Create: `app/(admin)/admin/dev-tools.tsx` — client component with "Seed test data" button.
- Create: `app/api/dev/seed/route.ts` — admin + env-gated route handler.

### Public signup changes
- Modify: `app/(public)/signup/page.tsx` — apply design-system tokens + add Google button.
- Modify: `app/(public)/signup/actions.ts` — add `signupWithGoogleAction`.
- Modify: `app/(public)/signup/complete-profile/page.tsx` — replace free-text categories with multi-select; token alignment.
- Modify: `app/(public)/signup/complete-profile/actions.ts` — validate via Zod; pull allowed category slugs.

### Volunteer portal
- Modify: `app/(volunteer)/volunteer/dashboard/page.tsx` — replace the old red/yellow banners with token-aligned variants; "not accepted" state for `status='inactive'`.

### Tests
- Create: `lib/utils/slugify.test.ts`.
- Create: `lib/validations/volunteer-categories.test.ts`.
- Create: `lib/validations/volunteers.test.ts`.
- Create: `lib/notifications/templates/volunteer-invite.test.ts`.
- Create: `lib/notifications/templates/volunteer-approved.test.ts`.
- Create: `tests/integration/volunteer-categories-crud.test.ts`.
- Create: `tests/integration/volunteers-crud.test.ts`.
- Create: `tests/integration/rls-volunteer-categories.test.ts`.
- Create: `tests/integration/dev-seed.test.ts`.
- Create: `tests/e2e/admin-volunteer-lifecycle.spec.ts`.

---

## Task 1: Add volunteer_categories migration

**Files:**
- Create: `supabase/migrations/0013_volunteer_categories.sql`

- [ ] **Step 1: Create the migration file**

File: `supabase/migrations/0013_volunteer_categories.sql`

```sql
-- 0013_volunteer_categories.sql
create table public.volunteer_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index volunteer_categories_archived_idx on public.volunteer_categories (archived_at);

alter table public.volunteer_categories enable row level security;

-- Any authenticated user can read. Volunteers need categories during signup.
create policy volunteer_categories_select on public.volunteer_categories
  for select to authenticated
  using (true);

-- Only admins can insert/update/delete.
create policy volunteer_categories_insert_admin on public.volunteer_categories
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy volunteer_categories_update_admin on public.volunteer_categories
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy volunteer_categories_delete_admin on public.volunteer_categories
  for delete to authenticated
  using (public.is_admin(auth.uid()));

create trigger volunteer_categories_set_updated_at
  before update on public.volunteer_categories
  for each row execute function public.set_updated_at();

insert into public.volunteer_categories (slug, name) values
  ('transportation', 'Transportation'),
  ('companionship', 'Companionship'),
  ('shopping', 'Shopping'),
  ('household_tasks', 'Household tasks'),
  ('technology_help', 'Technology help'),
  ('meal_delivery', 'Meal delivery'),
  ('other', 'Other');

comment on table public.volunteer_categories is 'Admin-managed service categories. slug is the stable matching key; name is the display label.';
```

- [ ] **Step 2: Apply migration locally**

Run: `npm run supabase:reset`
Expected: migration runs without errors; the 7 starter rows appear.

- [ ] **Step 3: Regenerate types**

Run: `npm run supabase:types`
Expected: `lib/db/types.ts` now contains a `volunteer_categories` entry with `Row`, `Insert`, `Update` types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_volunteer_categories.sql lib/db/types.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): volunteer_categories table + RLS + seed starter list

Admin-managed taxonomy for volunteer service categories. slug is the
stable matching key (immutable); name is the display label (freely
editable). Authenticated users can read; only admins can write.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: slugify utility + tests

**Files:**
- Create: `lib/utils/slugify.ts`
- Create: `lib/utils/slugify.test.ts`

- [ ] **Step 1: Write the failing tests**

File: `lib/utils/slugify.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and replaces spaces with underscores", () => {
    expect(slugify("Yard Work")).toBe("yard_work");
  });
  it("strips punctuation", () => {
    expect(slugify("Meal Delivery & Companionship")).toBe("meal_delivery_companionship");
  });
  it("collapses consecutive whitespace and trims", () => {
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple_spaces");
  });
  it("handles accents (strips them)", () => {
    expect(slugify("Café visit")).toBe("cafe_visit");
  });
  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- slugify`
Expected: FAIL — `slugify` is not defined.

- [ ] **Step 3: Write the implementation**

File: `lib/utils/slugify.ts`

```ts
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")    // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")        // non-alphanum → underscore
    .replace(/^_+|_+$/g, "");           // trim leading/trailing underscores
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- slugify`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/slugify.ts lib/utils/slugify.test.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): slugify helper for category slugs

Normalizes, strips accents, replaces non-alphanum with underscores.
Pure function; collision-suffixing lives in the query layer where DB
state is available.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Category validation schemas + tests

**Files:**
- Create: `lib/validations/volunteer-categories.ts`
- Create: `lib/validations/volunteer-categories.test.ts`

- [ ] **Step 1: Write the failing tests**

File: `lib/validations/volunteer-categories.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  createCategorySchema,
  updateCategorySchema,
} from "./volunteer-categories";

describe("createCategorySchema", () => {
  it("accepts a valid name", () => {
    const r = createCategorySchema.safeParse({ name: "Yard Work" });
    expect(r.success).toBe(true);
  });
  it("trims leading/trailing whitespace", () => {
    const r = createCategorySchema.parse({ name: "  Yard Work  " });
    expect(r.name).toBe("Yard Work");
  });
  it("rejects empty names", () => {
    const r = createCategorySchema.safeParse({ name: "   " });
    expect(r.success).toBe(false);
  });
  it("rejects names over 80 chars", () => {
    const r = createCategorySchema.safeParse({ name: "x".repeat(81) });
    expect(r.success).toBe(false);
  });
});

describe("updateCategorySchema", () => {
  it("accepts name + description", () => {
    const r = updateCategorySchema.safeParse({ name: "Groceries", description: "help with shopping" });
    expect(r.success).toBe(true);
  });
  it("allows description to be omitted", () => {
    const r = updateCategorySchema.safeParse({ name: "Groceries" });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- volunteer-categories`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schemas**

File: `lib/validations/volunteer-categories.ts`

```ts
import { z } from "zod";

const nameSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length > 0, { message: "Name is required" })
  .refine((v) => v.length <= 80, { message: "Name must be 80 characters or fewer" });

export const createCategorySchema = z.object({
  name: nameSchema,
});

export const updateCategorySchema = z.object({
  name: nameSchema,
  description: z
    .string()
    .transform((v) => (v.trim() === "" ? undefined : v.trim()))
    .optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- volunteer-categories`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/volunteer-categories.ts lib/validations/volunteer-categories.test.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): Zod schemas for category create/update

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Category query helpers + integration tests

**Files:**
- Create: `lib/db/queries/volunteer-categories.ts`
- Create: `tests/integration/volunteer-categories-crud.test.ts`

- [ ] **Step 1: Write the query helpers**

File: `lib/db/queries/volunteer-categories.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { slugify } from "@/lib/utils/slugify";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["volunteer_categories"]["Row"];

export type ListCategoriesOptions = {
  includeArchived?: boolean;
};

export async function listCategories(
  supabase: Client,
  opts: ListCategoriesOptions = {},
): Promise<Row[]> {
  let q = supabase.from("volunteer_categories").select("*").order("name", { ascending: true });
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getCategoryBySlug(supabase: Client, slug: string): Promise<Row | null> {
  const { data, error } = await supabase
    .from("volunteer_categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCategory(
  supabase: Client,
  input: { name: string; description?: string },
): Promise<Row> {
  const base = slugify(input.name);
  if (!base) throw new Error("Name produces an empty slug");

  // Try slug, slug-2, slug-3 ... until insert succeeds or we give up.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt === 0 ? base : `${base}_${attempt + 1}`;
    const { data, error } = await supabase
      .from("volunteer_categories")
      .insert({ slug: candidate, name: input.name, description: input.description })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw error;    // not a unique-violation → real error
  }
  throw new Error("Unable to generate a unique slug after 10 attempts");
}

export async function updateCategory(
  supabase: Client,
  id: string,
  input: { name: string; description?: string },
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteer_categories")
    .update({ name: input.name, description: input.description })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveCategory(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase
    .from("volunteer_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function unarchiveCategory(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase
    .from("volunteer_categories")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Write the integration test**

File: `tests/integration/volunteer-categories-crud.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  unarchiveCategory,
} from "@/lib/db/queries/volunteer-categories";
import { truncate } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe("volunteer_categories CRUD", () => {
  beforeEach(async () => {
    await truncate(admin, ["volunteer_categories"]);
  });

  it("lists active categories sorted by name, excludes archived by default", async () => {
    await createCategory(admin, { name: "Zebra" });
    const beta = await createCategory(admin, { name: "Beta" });
    await archiveCategory(admin, beta.id);
    await createCategory(admin, { name: "Alpha" });
    const rows = await listCategories(admin);
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Zebra"]);
  });

  it("includes archived when includeArchived=true", async () => {
    const b = await createCategory(admin, { name: "Beta" });
    await archiveCategory(admin, b.id);
    await createCategory(admin, { name: "Alpha" });
    const rows = await listCategories(admin, { includeArchived: true });
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("generates a unique slug when the base collides", async () => {
    const a = await createCategory(admin, { name: "Yard Work" });
    const b = await createCategory(admin, { name: "Yard Work" });
    expect(a.slug).toBe("yard_work");
    expect(b.slug).toBe("yard_work_2");
  });

  it("updates name without changing slug", async () => {
    const c = await createCategory(admin, { name: "Old Name" });
    const u = await updateCategory(admin, c.id, { name: "New Name" });
    expect(u.slug).toBe(c.slug);
    expect(u.name).toBe("New Name");
  });

  it("archive sets archived_at; unarchive clears it", async () => {
    const c = await createCategory(admin, { name: "Foo" });
    await archiveCategory(admin, c.id);
    const archived = await listCategories(admin, { includeArchived: true });
    expect(archived.find((r) => r.id === c.id)?.archived_at).not.toBeNull();
    await unarchiveCategory(admin, c.id);
    const active = await listCategories(admin);
    expect(active.find((r) => r.id === c.id)?.archived_at).toBeNull();
  });
});
```

- [ ] **Step 3: Confirm `truncate` helper exists**

Run: `grep -n "export.*truncate" tests/integration/helpers.ts`
Expected: the helper exists. If not, report NEEDS_CONTEXT.

- [ ] **Step 4: Run the integration test**

Make sure local Supabase is up (`npm run supabase:start`). Then:

Run: `npm run test:integration -- volunteer-categories-crud`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/volunteer-categories.ts tests/integration/volunteer-categories-crud.test.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): volunteer_categories CRUD query helpers

list, create (with slug collision suffix), update, archive, unarchive.
Slug is immutable after create; name is freely editable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: RLS integration test for volunteer_categories

**Files:**
- Create: `tests/integration/rls-volunteer-categories.test.ts`

- [ ] **Step 1: Write the RLS test**

File: `tests/integration/rls-volunteer-categories.test.ts`

Use the existing patterns in `tests/integration/rls-volunteers.test.ts` as a reference for how to spin up a non-admin authenticated client and an unauthenticated client.

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { truncate, createActiveVolunteer } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient<Database>(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function newAuthedClient(email: string, password: string) {
  const c = createClient<Database>(URL, ANON);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

describe("volunteer_categories RLS", () => {
  let volunteerEmail: string;
  let volunteerPassword: string;

  beforeEach(async () => {
    await truncate(admin, ["volunteer_categories"]);
    const v = await createActiveVolunteer(admin, { first_name: "Rls", last_name: "Tester" });
    volunteerEmail = v.email;
    volunteerPassword = v.password;

    await admin.from("volunteer_categories").insert({ slug: "test_cat", name: "Test" });
  });

  it("volunteer can select categories", async () => {
    const c = await newAuthedClient(volunteerEmail, volunteerPassword);
    const { data, error } = await c.from("volunteer_categories").select("*");
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it("volunteer cannot insert a category", async () => {
    const c = await newAuthedClient(volunteerEmail, volunteerPassword);
    const { error } = await c
      .from("volunteer_categories")
      .insert({ slug: "sneaky", name: "Sneaky" });
    expect(error).not.toBeNull();
  });

  it("volunteer cannot update a category", async () => {
    const c = await newAuthedClient(volunteerEmail, volunteerPassword);
    const { error } = await c
      .from("volunteer_categories")
      .update({ name: "Renamed" })
      .eq("slug", "test_cat");
    // RLS blocks the update silently (0 rows updated) OR returns an error depending on check.
    // We consider pass = name not actually changed.
    const { data } = await admin
      .from("volunteer_categories")
      .select("name")
      .eq("slug", "test_cat")
      .single();
    expect(data?.name).toBe("Test");
    // error may or may not be null depending on Postgres version; primary assertion is data unchanged.
    void error;
  });

  it("volunteer cannot delete a category", async () => {
    const c = await newAuthedClient(volunteerEmail, volunteerPassword);
    await c.from("volunteer_categories").delete().eq("slug", "test_cat");
    const { data } = await admin
      .from("volunteer_categories")
      .select("id")
      .eq("slug", "test_cat")
      .single();
    expect(data).not.toBeNull();
  });

  it("unauthenticated cannot select categories", async () => {
    const c = createClient<Database>(URL, ANON);
    const { data, error } = await c.from("volunteer_categories").select("*");
    // Either error set, or data empty (RLS hides rows without the policy matching).
    expect((data ?? []).length).toBe(0);
    void error;
  });
});
```

- [ ] **Step 2: Confirm `createActiveVolunteer` helper exists**

Run: `grep -n "export.*createActiveVolunteer\|export.*createVolunteer" tests/integration/helpers.ts`
Expected: exists. If not, report NEEDS_CONTEXT — you'll need to ask how existing RLS tests create test volunteers.

- [ ] **Step 3: Run the test**

Run: `npm run test:integration -- rls-volunteer-categories`
Expected: all 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/rls-volunteer-categories.test.ts
git commit -m "$(cat <<'EOF'
test(volunteers): RLS integration — volunteers can read, only admins write

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Volunteer validation schemas + tests

**Files:**
- Create: `lib/validations/volunteers.ts`
- Create: `lib/validations/volunteers.test.ts`

- [ ] **Step 1: Write the failing tests**

File: `lib/validations/volunteers.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  adminCreateVolunteerSchema,
  updateVolunteerSchema,
  completeProfileSchema,
} from "./volunteers";

describe("adminCreateVolunteerSchema", () => {
  const valid = {
    first_name: "Alex",
    last_name: "Chen",
    email: "alex@example.com",
    categories: ["transportation"],
    service_area: "Vancouver",
  };

  it("accepts a minimal valid payload", () => {
    const r = adminCreateVolunteerSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects a blank first name", () => {
    const r = adminCreateVolunteerSchema.safeParse({ ...valid, first_name: "  " });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = adminCreateVolunteerSchema.safeParse({ ...valid, email: "not-email" });
    expect(r.success).toBe(false);
  });

  it("rejects empty categories array", () => {
    const r = adminCreateVolunteerSchema.safeParse({ ...valid, categories: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a blank service area", () => {
    const r = adminCreateVolunteerSchema.safeParse({ ...valid, service_area: "  " });
    expect(r.success).toBe(false);
  });

  it("accepts optional phone, home_address, home_lat, home_lng", () => {
    const r = adminCreateVolunteerSchema.safeParse({
      ...valid,
      phone: "(604) 555-0134",
      home_address: "1245 Robson St",
      home_lat: 49.28,
      home_lng: -123.12,
    });
    expect(r.success).toBe(true);
  });
});

describe("updateVolunteerSchema", () => {
  it("does not accept an email field", () => {
    const schema = updateVolunteerSchema;
    // When strict: parse a payload with email; schema should strip it (parse succeeds but no email in output).
    const r = schema.parse({
      first_name: "A",
      last_name: "B",
      categories: ["transportation"],
      service_area: "Van",
      email: "x@y.z",
    } as unknown as Parameters<typeof schema.parse>[0]);
    expect("email" in r).toBe(false);
  });
});

describe("completeProfileSchema", () => {
  it("requires first_name, last_name, categories, service_area", () => {
    const r = completeProfileSchema.safeParse({
      first_name: "A",
      last_name: "B",
      categories: ["transportation"],
      service_area: "Van",
    });
    expect(r.success).toBe(true);
  });
  it("rejects missing categories", () => {
    const r = completeProfileSchema.safeParse({
      first_name: "A",
      last_name: "B",
      service_area: "Van",
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- volunteers`
Expected: FAIL — schemas not found (there's already a validations/seniors; the test targets a new file).

- [ ] **Step 3: Write the schemas**

File: `lib/validations/volunteers.ts`

```ts
import { z } from "zod";

const requiredString = (field: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, { message: `${field} is required` });

const optionalString = z
  .string()
  .transform((v) => (v.trim() === "" ? undefined : v.trim()))
  .optional();

const optionalCoercedNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().optional(),
);

const categoriesSchema = z
  .array(z.string().min(1))
  .min(1, { message: "Select at least one category" });

export const adminCreateVolunteerSchema = z.object({
  first_name: requiredString("First name"),
  last_name: requiredString("Last name"),
  email: z.string().email({ message: "Invalid email address" }),
  phone: optionalString,
  categories: categoriesSchema,
  service_area: requiredString("Service area"),
  home_address: optionalString,
  home_lat: optionalCoercedNumber,
  home_lng: optionalCoercedNumber,
});

export const updateVolunteerSchema = z.object({
  first_name: requiredString("First name"),
  last_name: requiredString("Last name"),
  phone: optionalString,
  categories: categoriesSchema,
  service_area: requiredString("Service area"),
  home_address: optionalString,
  home_lat: optionalCoercedNumber,
  home_lng: optionalCoercedNumber,
});

export const completeProfileSchema = z.object({
  first_name: requiredString("First name"),
  last_name: requiredString("Last name"),
  phone: optionalString,
  categories: categoriesSchema,
  service_area: requiredString("Service area"),
  home_address: optionalString,
  home_lat: optionalCoercedNumber,
  home_lng: optionalCoercedNumber,
});

export type AdminCreateVolunteerInput = z.infer<typeof adminCreateVolunteerSchema>;
export type UpdateVolunteerInput = z.infer<typeof updateVolunteerSchema>;
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- volunteers`
Expected: PASS — 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/volunteers.ts lib/validations/volunteers.test.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): Zod schemas for admin-create, update, and complete-profile

Email is immutable post-create; the update schema omits it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Volunteer query helpers + integration tests

**Files:**
- Modify: `lib/db/queries/volunteers.ts`
- Create: `tests/integration/volunteers-crud.test.ts`

- [ ] **Step 1: Extend the query helpers**

Replace the entire contents of `lib/db/queries/volunteers.ts` with:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["volunteers"]["Row"];
type Status = Database["public"]["Enums"]["volunteer_status"];

export type ListVolunteersFilters = {
  status?: Status | "all";
  q?: string;
  cursor?: { last_name: string; id: string } | null;
  limit?: number;
};

export async function getVolunteerById(supabase: Client, id: string): Promise<Row | null> {
  const { data, error } = await supabase.from("volunteers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listVolunteers(
  supabase: Client,
  filters: ListVolunteersFilters = {},
): Promise<{ rows: Row[]; nextCursor: { last_name: string; id: string } | null }> {
  const limit = filters.limit ?? 50;
  let q = supabase.from("volunteers").select("*");

  if (filters.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }

  if (filters.q && filters.q.trim()) {
    const escaped = filters.q.trim().replace(/[%_]/g, "").replace(/"/g, '""');
    const term = `"%${escaped}%"`;
    q = q.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`);
  }

  if (filters.cursor) {
    const ln = `"${filters.cursor.last_name.replace(/"/g, '""')}"`;
    const id = `"${filters.cursor.id.replace(/"/g, '""')}"`;
    q = q.or(`last_name.gt.${ln},and(last_name.eq.${ln},id.gt.${id})`);
  }

  q = q.order("last_name", { ascending: true }).order("id", { ascending: true }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw error;
  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? { last_name: last.last_name, id: last.id } : null;
  return { rows, nextCursor };
}

export async function countVolunteers(
  supabase: Client,
  filters: { status?: Status } = {},
): Promise<number> {
  let q = supabase.from("volunteers").select("id", { count: "exact", head: true });
  if (filters.status) q = q.eq("status", filters.status);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function createVolunteerProfile(
  supabase: Client,
  input: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    categories: string[];
    service_area: string;
    home_address?: string;
    home_lat?: number;
    home_lng?: number;
    auth_provider: "email" | "google" | "admin_invite";
  },
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .insert({ ...input, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type UpdateVolunteerInput = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  categories?: string[];
  service_area?: string;
  home_address?: string;
  home_lat?: number | null;
  home_lng?: number | null;
};

export async function updateVolunteerProfile(
  supabase: Client,
  id: string,
  input: UpdateVolunteerInput,
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveVolunteer(
  supabase: Client,
  id: string,
  approvedBy: string,
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .update({ status: "active", approved_at: new Date().toISOString(), approved_by: approvedBy })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function rejectVolunteer(supabase: Client, id: string): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .update({ status: "inactive" })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reactivateVolunteer(
  supabase: Client,
  id: string,
  approvedBy: string,
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .update({ status: "active", approved_at: new Date().toISOString(), approved_by: approvedBy })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function findVolunteerByEmail(
  supabase: Client,
  email: string,
): Promise<Row | null> {
  const { data, error } = await supabase
    .from("volunteers")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Write the integration test**

File: `tests/integration/volunteers-crud.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import {
  listVolunteers,
  countVolunteers,
  approveVolunteer,
  rejectVolunteer,
  reactivateVolunteer,
  findVolunteerByEmail,
} from "@/lib/db/queries/volunteers";
import { truncate, createAdmin, createPendingVolunteer } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe("volunteers CRUD / transitions", () => {
  let adminId: string;

  beforeEach(async () => {
    await truncate(admin, ["volunteers", "admins"]);
    const a = await createAdmin(admin);
    adminId = a.id;
  });

  it("listVolunteers filters by status", async () => {
    await createPendingVolunteer(admin, { first_name: "A" });
    const b = await createPendingVolunteer(admin, { first_name: "B" });
    await approveVolunteer(admin, b.id, adminId);
    const pending = await listVolunteers(admin, { status: "pending" });
    const active = await listVolunteers(admin, { status: "active" });
    expect(pending.rows.length).toBe(1);
    expect(active.rows.length).toBe(1);
  });

  it("countVolunteers returns status-specific counts", async () => {
    await createPendingVolunteer(admin, { first_name: "A" });
    await createPendingVolunteer(admin, { first_name: "B" });
    const count = await countVolunteers(admin, { status: "pending" });
    expect(count).toBe(2);
  });

  it("approveVolunteer sets status=active, approved_at, approved_by", async () => {
    const v = await createPendingVolunteer(admin, { first_name: "A" });
    const r = await approveVolunteer(admin, v.id, adminId);
    expect(r.status).toBe("active");
    expect(r.approved_at).not.toBeNull();
    expect(r.approved_by).toBe(adminId);
  });

  it("rejectVolunteer sets status=inactive; does not set approved_at", async () => {
    const v = await createPendingVolunteer(admin, { first_name: "A" });
    const r = await rejectVolunteer(admin, v.id);
    expect(r.status).toBe("inactive");
    expect(r.approved_at).toBeNull();
  });

  it("reactivateVolunteer sets status=active and records approver", async () => {
    const v = await createPendingVolunteer(admin, { first_name: "A" });
    await rejectVolunteer(admin, v.id);
    const r = await reactivateVolunteer(admin, v.id, adminId);
    expect(r.status).toBe("active");
    expect(r.approved_by).toBe(adminId);
  });

  it("findVolunteerByEmail returns the row or null", async () => {
    const v = await createPendingVolunteer(admin, { first_name: "A" });
    const hit = await findVolunteerByEmail(admin, v.email);
    expect(hit?.id).toBe(v.id);
    const miss = await findVolunteerByEmail(admin, "nope@example.com");
    expect(miss).toBeNull();
  });
});
```

- [ ] **Step 3: Confirm helpers exist**

Run: `grep -n "createAdmin\|createPendingVolunteer" tests/integration/helpers.ts`
Expected: both exist. If either is missing, report NEEDS_CONTEXT with what's there — we may need to add a `createPendingVolunteer` variant if only `createActiveVolunteer` is available.

- [ ] **Step 4: Run the test**

Run: `npm run test:integration -- volunteers-crud`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/volunteers.ts tests/integration/volunteers-crud.test.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): extend query helpers with list/count/transitions

Adds listVolunteers (status filter + cursor), countVolunteers (for the
pending badge), approve/reject/reactivate transitions, and findByEmail
(for admin-create dup check).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Notification templates + tests

**Files:**
- Create: `lib/notifications/templates/volunteer-invite.ts`
- Create: `lib/notifications/templates/volunteer-invite.test.ts`
- Create: `lib/notifications/templates/volunteer-approved.ts`
- Create: `lib/notifications/templates/volunteer-approved.test.ts`

- [ ] **Step 1: Write volunteer-invite template tests**

File: `lib/notifications/templates/volunteer-invite.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { renderVolunteerInvite } from "./volunteer-invite";

describe("renderVolunteerInvite", () => {
  it("includes the recipient name and invite URL in HTML and text", () => {
    const r = renderVolunteerInvite({
      firstName: "Alex",
      inviteUrl: "https://example.com/setup?token=abc",
    });
    expect(r.subject).toMatch(/welcome|invite/i);
    expect(r.html).toContain("Alex");
    expect(r.html).toContain("https://example.com/setup?token=abc");
    expect(r.text).toContain("Alex");
    expect(r.text).toContain("https://example.com/setup?token=abc");
  });
});
```

- [ ] **Step 2: Write volunteer-invite template**

File: `lib/notifications/templates/volunteer-invite.ts`

```ts
export type VolunteerInviteInput = {
  firstName: string;
  inviteUrl: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderVolunteerInvite(input: VolunteerInviteInput): RenderedEmail {
  const subject = "Welcome to Better At Home — set up your account";
  const text = [
    `Hi ${input.firstName},`,
    ``,
    `An admin has added you as a volunteer on Better At Home. Click the link below to set your password and get started.`,
    ``,
    input.inviteUrl,
    ``,
    `This link is valid for 24 hours. If it expires, ask the admin to resend.`,
    ``,
    `— Better At Home`,
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; background:#f7f4ed; color:#1c1c1c; padding:24px;">
    <p>Hi ${escapeHtml(input.firstName)},</p>
    <p>An admin has added you as a volunteer on Better At Home. Click the button below to set your password and get started.</p>
    <p>
      <a href="${escapeHtml(input.inviteUrl)}"
         style="display:inline-block; background:#1c1c1c; color:#fcfbf8; padding:8px 16px; border-radius:6px; text-decoration:none;">
        Set up my account
      </a>
    </p>
    <p style="color:#5f5f5d; font-size:14px;">
      This link is valid for 24 hours. If it expires, ask the admin to resend.
    </p>
    <p style="color:#5f5f5d; font-size:14px;">— Better At Home</p>
  </body>
</html>`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 3: Run invite tests**

Run: `npm test -- volunteer-invite`
Expected: PASS — 1 test green.

- [ ] **Step 4: Write volunteer-approved template tests**

File: `lib/notifications/templates/volunteer-approved.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { renderVolunteerApproved } from "./volunteer-approved";

describe("renderVolunteerApproved", () => {
  it("includes the recipient name and the portal URL", () => {
    const r = renderVolunteerApproved({
      firstName: "Alex",
      portalUrl: "https://example.com/volunteer/dashboard",
    });
    expect(r.subject).toMatch(/approved|ready/i);
    expect(r.html).toContain("Alex");
    expect(r.html).toContain("https://example.com/volunteer/dashboard");
    expect(r.text).toContain("Alex");
  });
});
```

- [ ] **Step 5: Write the approved template**

File: `lib/notifications/templates/volunteer-approved.ts`

```ts
export type VolunteerApprovedInput = {
  firstName: string;
  portalUrl: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderVolunteerApproved(input: VolunteerApprovedInput): RenderedEmail {
  const subject = "You're approved — welcome to Better At Home";
  const text = [
    `Hi ${input.firstName},`,
    ``,
    `Your volunteer account has been approved. You can now log in and start helping.`,
    ``,
    input.portalUrl,
    ``,
    `— Better At Home`,
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; background:#f7f4ed; color:#1c1c1c; padding:24px;">
    <p>Hi ${escapeHtml(input.firstName)},</p>
    <p>Your volunteer account has been approved. You can now log in and start helping.</p>
    <p>
      <a href="${escapeHtml(input.portalUrl)}"
         style="display:inline-block; background:#1c1c1c; color:#fcfbf8; padding:8px 16px; border-radius:6px; text-decoration:none;">
        Go to my dashboard
      </a>
    </p>
    <p style="color:#5f5f5d; font-size:14px;">— Better At Home</p>
  </body>
</html>`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 6: Run approved tests**

Run: `npm test -- volunteer-approved`
Expected: PASS — 1 test green.

- [ ] **Step 7: Commit**

```bash
git add lib/notifications/templates/volunteer-invite.ts lib/notifications/templates/volunteer-invite.test.ts lib/notifications/templates/volunteer-approved.ts lib/notifications/templates/volunteer-approved.test.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): email templates for invite + approval

Design-system colored inline styles (cream + charcoal) so the email
matches the admin UI aesthetic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Category management UI

**Files:**
- Create: `app/(admin)/admin/volunteers/categories/page.tsx`
- Create: `app/(admin)/admin/volunteers/categories/categories-manager.tsx`
- Create: `app/(admin)/admin/volunteers/categories/actions.ts`

- [ ] **Step 1: Write the server actions**

File: `app/(admin)/admin/volunteers/categories/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import {
  createCategorySchema,
  updateCategorySchema,
} from "@/lib/validations/volunteer-categories";
import {
  createCategory,
  updateCategory,
  archiveCategory,
  unarchiveCategory,
} from "@/lib/db/queries/volunteer-categories";

export type CategoryFormState = { error?: string; ok?: boolean } | undefined;

export async function createCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAdmin();
  const parsed = createCategorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createSupabaseServerClient();
  try {
    await createCategory(supabase, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create" };
  }
  revalidatePath("/admin/volunteers/categories");
  return { ok: true };
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = updateCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const supabase = await createSupabaseServerClient();
  await updateCategory(supabase, id, parsed.data);
  revalidatePath("/admin/volunteers/categories");
}

export async function archiveCategoryAction(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await archiveCategory(supabase, id);
  revalidatePath("/admin/volunteers/categories");
}

export async function unarchiveCategoryAction(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await unarchiveCategory(supabase, id);
  revalidatePath("/admin/volunteers/categories");
}
```

- [ ] **Step 2: Write the client-side manager**

File: `app/(admin)/admin/volunteers/categories/categories-manager.tsx`

```tsx
"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
  unarchiveCategoryAction,
  type CategoryFormState,
} from "./actions";

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  archived_at: string | null;
};

export function CategoriesManager({ rows }: { rows: CategoryRow[] }) {
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(
    createCategoryAction,
    undefined,
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-cat-name">Add a category</Label>
          <Input id="new-cat-name" name="name" placeholder="e.g. Pet care" required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add"}
        </Button>
      </form>
      {state?.error ? (
        <p className="text-sm italic text-muted-foreground">{state.error}</p>
      ) : null}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2">Name</th>
            <th>Slug</th>
            <th>Description</th>
            <th>Status</th>
            <th className="w-[220px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <CategoryRowView key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryRowView({ row }: { row: CategoryRow }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const archived = row.archived_at !== null;

  if (editing) {
    return (
      <tr className="hover:bg-muted">
        <td colSpan={5} className="py-2">
          <form
            action={async (fd) => {
              await updateCategoryAction(row.id, fd);
              setEditing(false);
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`name-${row.id}`}>Name</Label>
              <Input id={`name-${row.id}`} name="name" defaultValue={row.name} required />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`desc-${row.id}`}>Description</Label>
              <Input
                id={`desc-${row.id}`}
                name="description"
                defaultValue={row.description ?? ""}
              />
            </div>
            <Button type="submit">Save</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={archived ? "italic text-muted-foreground" : "hover:bg-muted"}>
      <td className="py-2">{row.name}</td>
      <td className="text-xs text-muted-foreground">{row.slug}</td>
      <td className="text-xs">{row.description ?? ""}</td>
      <td>
        {archived ? (
          <StatusBadge variant="archived">Archived</StatusBadge>
        ) : (
          <StatusBadge variant="active">Active</StatusBadge>
        )}
      </td>
      <td className="space-x-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={isPending}>
          Edit
        </Button>
        {archived ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => unarchiveCategoryAction(row.id))}
          >
            Unarchive
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => archiveCategoryAction(row.id))}
          >
            Archive
          </Button>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: Write the server page**

File: `app/(admin)/admin/volunteers/categories/page.tsx`

```tsx
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { CategoriesManager } from "./categories-manager";

export default async function VolunteerCategoriesPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const rows = await listCategories(supabase, { includeArchived: true });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-h2">Volunteer categories</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Rename anytime — the display name updates everywhere. Archiving hides the category from
          new selections but preserves it on existing volunteer records.
        </p>
      </div>
      <CategoriesManager
        rows={rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
          description: r.description,
          archived_at: r.archived_at,
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: zero errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/volunteers/categories/
git commit -m "$(cat <<'EOF'
feat(volunteers): category management UI at /admin/volunteers/categories

Add, rename, edit description, archive, unarchive. Inline-edit pattern;
archived rows styled with the archived StatusBadge + italic muted text.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Admin volunteer list with status tabs

**Files:**
- Modify: `app/(admin)/admin/volunteers/page.tsx`
- Create: `app/(admin)/admin/volunteers/actions.ts` (minimal stub — expanded in later tasks)

- [ ] **Step 1: Create the minimal actions file**

File: `app/(admin)/admin/volunteers/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import {
  approveVolunteer,
  rejectVolunteer,
  reactivateVolunteer,
} from "@/lib/db/queries/volunteers";

export async function approveVolunteerAction(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await approveVolunteer(supabase, id, admin.userId);
  revalidatePath("/admin/volunteers");
}

export async function rejectVolunteerAction(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await rejectVolunteer(supabase, id);
  revalidatePath("/admin/volunteers");
}

export async function reactivateVolunteerAction(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await reactivateVolunteer(supabase, id, admin.userId);
  revalidatePath("/admin/volunteers");
}
```

- [ ] **Step 2: Rewrite the list page**

Replace the entire contents of `app/(admin)/admin/volunteers/page.tsx` with:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listVolunteers, countVolunteers } from "@/lib/db/queries/volunteers";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { VolunteerRowActions } from "./volunteer-row-actions";

type SearchParams = Promise<{
  status?: "all" | "pending" | "active" | "inactive";
  q?: string;
}>;

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
] as const;

export default async function AdminVolunteersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.status ?? "all";
  const q = sp.q ?? "";
  const supabase = await createSupabaseServerClient();
  const [list, pendingCount, categories] = await Promise.all([
    listVolunteers(supabase, { status: tab, q }),
    countVolunteers(supabase, { status: "pending" }),
    listCategories(supabase),
  ]);

  const categoryNameBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h2">Volunteers</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/volunteers/categories">Categories</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/volunteers/new">Add volunteer</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          const href = `/admin/volunteers?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
          const showBadge = t.key === "pending" && pendingCount > 0;
          return (
            <Link
              key={t.key}
              href={href}
              className={`rounded-[var(--radius)] px-3 py-1.5 text-sm ${
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
              {showBadge ? (
                <span className="ml-2 rounded-full bg-foreground px-1.5 py-0.5 text-xs text-background">
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          );
        })}
        <form action="/admin/volunteers" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="status" value={tab} />
          <Input name="q" defaultValue={q} placeholder="Search name or email" className="w-60" />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      {list.rows.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No volunteers match.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Categories</th>
              <th>Service area</th>
              <th>Status</th>
              <th className="w-[220px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((v) => (
              <tr key={v.id} className="hover:bg-muted">
                <td className="py-2">
                  <Link
                    href={`/admin/volunteers/${v.id}`}
                    className="text-foreground underline underline-offset-2"
                  >
                    {v.first_name} {v.last_name}
                  </Link>
                </td>
                <td className="text-xs">{v.email}</td>
                <td className="text-xs">
                  {v.categories.map((s) => categoryNameBySlug[s] ?? s).join(", ")}
                </td>
                <td className="text-xs">{v.service_area ?? ""}</td>
                <td>
                  {v.status === "active" ? (
                    <StatusBadge variant="active">Active</StatusBadge>
                  ) : v.status === "pending" ? (
                    <StatusBadge variant="not-geocoded">Pending</StatusBadge>
                  ) : (
                    <StatusBadge variant="archived">Inactive</StatusBadge>
                  )}
                </td>
                <td>
                  <VolunteerRowActions id={v.id} status={v.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the row-actions client component**

File: `app/(admin)/admin/volunteers/volunteer-row-actions.tsx`

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  approveVolunteerAction,
  rejectVolunteerAction,
  reactivateVolunteerAction,
} from "./actions";

type Status = "pending" | "active" | "inactive";

export function VolunteerRowActions({ id, status }: { id: string; status: Status }) {
  const [isPending, startTransition] = useTransition();

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => approveVolunteerAction(id))}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => rejectVolunteerAction(id))}
        >
          Reject
        </Button>
      </div>
    );
  }
  if (status === "inactive") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => reactivateVolunteerAction(id))}
      >
        Reactivate
      </Button>
    );
  }
  return null;
}
```

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/volunteers/page.tsx app/\(admin\)/admin/volunteers/actions.ts app/\(admin\)/admin/volunteers/volunteer-row-actions.tsx
git commit -m "$(cat <<'EOF'
feat(volunteers): admin list with status tabs, pending badge, inline actions

Tabs: all / pending / active / inactive, with a count badge on Pending.
Inline Approve / Reject / Reactivate buttons. Search by name or email.
Category names resolved from slugs via a lookup map.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Admin-create form + invite email

**Files:**
- Create: `app/(admin)/admin/volunteers/new/page.tsx`
- Create: `app/(admin)/admin/volunteers/new/volunteer-form.tsx`
- Modify: `app/(admin)/admin/volunteers/actions.ts` — add `createVolunteerAction`

- [ ] **Step 1: Add `createVolunteerAction` to the actions file**

Append to `app/(admin)/admin/volunteers/actions.ts`:

```ts
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findVolunteerByEmail, createVolunteerProfile } from "@/lib/db/queries/volunteers";
import { adminCreateVolunteerSchema } from "@/lib/validations/volunteers";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { renderVolunteerInvite } from "@/lib/notifications/templates/volunteer-invite";
import { createNotificationService } from "@/lib/notifications/factory";

export type CreateVolunteerState =
  | { error?: string; fieldErrors?: Record<string, string>; existingId?: string }
  | undefined;

export async function createVolunteerAction(
  _prev: CreateVolunteerState,
  formData: FormData,
): Promise<CreateVolunteerState> {
  const admin = await requireAdmin();

  const rawCategories = formData.getAll("categories").map(String);
  const parsed = adminCreateVolunteerSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    categories: rawCategories,
    service_area: formData.get("service_area"),
    home_address: formData.get("home_address"),
    home_lat: formData.get("home_lat"),
    home_lng: formData.get("home_lng"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const serverSupabase = await createSupabaseServerClient();
  const adminSupabase = createSupabaseAdminClient();

  // Validate categories against the DB — all slugs must be active.
  const activeCategories = await listCategories(serverSupabase);
  const activeSlugs = new Set(activeCategories.map((c) => c.slug));
  const invalid = parsed.data.categories.filter((s) => !activeSlugs.has(s));
  if (invalid.length > 0) {
    return { error: `Unknown categories: ${invalid.join(", ")}` };
  }

  // Dup-check volunteers by email.
  const existingVolunteer = await findVolunteerByEmail(serverSupabase, parsed.data.email);
  if (existingVolunteer) {
    return {
      error: "A volunteer with that email already exists.",
      existingId: existingVolunteer.id,
    };
  }

  // Dup-check auth.users.
  const { data: users } = await adminSupabase.auth.admin.listUsers();
  const authHit = users?.users.find(
    (u) => (u.email ?? "").toLowerCase() === parsed.data.email.toLowerCase(),
  );
  if (authHit) {
    return {
      error:
        "An account with that email already exists in auth. Ask the user to finish their own signup, or use a different email.",
    };
  }

  // Generate the invite. Supabase sends the email; we pass the redirect URL via the token link.
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
  const { data: invited, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo },
  );
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Failed to send invite" };
  }

  // Also send an on-brand welcome email via NotificationService.
  // (The Supabase default is sent by Supabase; this one is our branded version. If we want to
  // suppress the Supabase default, that's a project-wide Supabase config — out of scope here.)
  const action = await adminSupabase.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email,
    options: { redirectTo },
  });
  const inviteUrl = action.data?.properties?.action_link ?? redirectTo;
  const email = renderVolunteerInvite({ firstName: parsed.data.first_name, inviteUrl });
  await createNotificationService().sendEmail({
    to: parsed.data.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  // Insert the volunteers row with status=active (admin-create skips approval).
  try {
    await createVolunteerProfile(adminSupabase, {
      id: invited.user.id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      categories: parsed.data.categories,
      service_area: parsed.data.service_area,
      home_address: parsed.data.home_address,
      home_lat: parsed.data.home_lat,
      home_lng: parsed.data.home_lng,
      auth_provider: "admin_invite",
    });
    // Flip from pending → active with approver metadata.
    await adminSupabase
      .from("volunteers")
      .update({
        status: "active",
        approved_at: new Date().toISOString(),
        approved_by: admin.userId,
      })
      .eq("id", invited.user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save volunteer profile" };
  }

  revalidatePath("/admin/volunteers");
  redirect(`/admin/volunteers/${invited.user.id}`);
}
```

Also ensure these imports exist at the top of the file alongside the existing ones:

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";
```

(Add if not present; the rest of the existing imports stay.)

- [ ] **Step 2: Write the form client component**

File: `app/(admin)/admin/volunteers/new/volunteer-form.tsx`

```tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVolunteerAction, type CreateVolunteerState } from "../actions";

type Category = { slug: string; name: string };

export function VolunteerForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<CreateVolunteerState, FormData>(
    createVolunteerAction,
    undefined,
  );

  const fieldError = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" id="first_name" error={fieldError("first_name")}>
          <Input id="first_name" name="first_name" required />
        </Field>
        <Field label="Last name" id="last_name" error={fieldError("last_name")}>
          <Input id="last_name" name="last_name" required />
        </Field>
      </div>
      <Field label="Email" id="email" error={fieldError("email")}>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Phone (optional)" id="phone" error={fieldError("phone")}>
        <Input id="phone" name="phone" type="tel" />
      </Field>
      <Field label="Service area" id="service_area" error={fieldError("service_area")}>
        <Input id="service_area" name="service_area" required />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-normal text-foreground">Categories</legend>
        <div className="flex flex-wrap gap-3">
          {categories.map((c) => (
            <label key={c.slug} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="categories" value={c.slug} />
              {c.name}
            </label>
          ))}
        </div>
        {fieldError("categories") ? (
          <p className="mt-1 text-sm italic text-muted-foreground">{fieldError("categories")}</p>
        ) : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Home address (optional)" id="home_address">
          <Input id="home_address" name="home_address" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lat (optional)" id="home_lat">
            <Input id="home_lat" name="home_lat" type="number" step="any" />
          </Field>
          <Field label="Lng (optional)" id="home_lng">
            <Input id="home_lng" name="home_lng" type="number" step="any" />
          </Field>
        </div>
      </div>
      {state?.error ? (
        <p className="text-sm italic text-muted-foreground">
          {state.error}
          {state.existingId ? (
            <>
              {" "}
              <Link
                href={`/admin/volunteers/${state.existingId}`}
                className="underline underline-offset-2"
              >
                Go to profile
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting..." : "Create and send invite"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/volunteers">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm italic text-muted-foreground">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Write the server page**

File: `app/(admin)/admin/volunteers/new/page.tsx`

```tsx
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { VolunteerForm } from "./volunteer-form";

export default async function NewVolunteerPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const categories = await listCategories(supabase);
  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-h2">Add volunteer</h2>
      <p className="text-sm text-muted-foreground">
        An invite email will be sent. The volunteer sets their own password, and their account is
        active immediately.
      </p>
      <VolunteerForm categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/volunteers/new/ app/\(admin\)/admin/volunteers/actions.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): admin-create flow via Supabase invite email

Admin fills the form; server validates, checks for dup volunteers and
dup auth users, then calls Supabase admin.inviteUserByEmail. Inserts
the volunteers row with status=active and approver metadata.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Volunteer detail + edit + archive

**Files:**
- Create: `app/(admin)/admin/volunteers/[id]/page.tsx`
- Create: `app/(admin)/admin/volunteers/[id]/volunteer-edit.tsx`
- Modify: `app/(admin)/admin/volunteers/actions.ts` — add `updateVolunteerAction` and `resendInviteAction`

- [ ] **Step 1: Append to actions.ts**

Append to `app/(admin)/admin/volunteers/actions.ts`:

```ts
import { updateVolunteerProfile } from "@/lib/db/queries/volunteers";
import { updateVolunteerSchema } from "@/lib/validations/volunteers";

export type UpdateVolunteerState =
  | { error?: string; fieldErrors?: Record<string, string>; ok?: boolean }
  | undefined;

export async function updateVolunteerAction(
  id: string,
  _prev: UpdateVolunteerState,
  formData: FormData,
): Promise<UpdateVolunteerState> {
  await requireAdmin();
  const rawCategories = formData.getAll("categories").map(String);
  const parsed = updateVolunteerSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone"),
    categories: rawCategories,
    service_area: formData.get("service_area"),
    home_address: formData.get("home_address"),
    home_lat: formData.get("home_lat"),
    home_lng: formData.get("home_lng"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }
  const supabase = await createSupabaseServerClient();
  try {
    await updateVolunteerProfile(supabase, id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
  revalidatePath(`/admin/volunteers/${id}`);
  return { ok: true };
}

export async function resendInviteAction(id: string): Promise<void> {
  await requireAdmin();
  const adminSupabase = createSupabaseAdminClient();
  const { data: v } = await adminSupabase.from("volunteers").select("email,first_name").eq("id", id).single();
  if (!v) throw new Error("Volunteer not found");
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
  const link = await adminSupabase.auth.admin.generateLink({
    type: "invite",
    email: v.email,
    options: { redirectTo },
  });
  const inviteUrl = link.data?.properties?.action_link ?? redirectTo;
  const tpl = renderVolunteerInvite({ firstName: v.first_name, inviteUrl });
  await createNotificationService().sendEmail({
    to: v.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
  revalidatePath(`/admin/volunteers/${id}`);
}
```

- [ ] **Step 2: Write the edit client component**

File: `app/(admin)/admin/volunteers/[id]/volunteer-edit.tsx`

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateVolunteerAction, type UpdateVolunteerState } from "../actions";

type Category = { slug: string; name: string; archived: boolean };

type Volunteer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  categories: string[];
  service_area: string | null;
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
};

export function VolunteerEdit({
  volunteer,
  categories,
}: {
  volunteer: Volunteer;
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState<UpdateVolunteerState, FormData>(
    updateVolunteerAction.bind(null, volunteer.id),
    undefined,
  );

  const fieldError = (k: string) => state?.fieldErrors?.[k];
  const checked = new Set(volunteer.categories);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Email ({volunteer.email}) is immutable. Contact support to change it.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" id="first_name" error={fieldError("first_name")}>
          <Input id="first_name" name="first_name" defaultValue={volunteer.first_name} required />
        </Field>
        <Field label="Last name" id="last_name" error={fieldError("last_name")}>
          <Input id="last_name" name="last_name" defaultValue={volunteer.last_name} required />
        </Field>
      </div>
      <Field label="Phone" id="phone" error={fieldError("phone")}>
        <Input id="phone" name="phone" type="tel" defaultValue={volunteer.phone ?? ""} />
      </Field>
      <Field label="Service area" id="service_area" error={fieldError("service_area")}>
        <Input
          id="service_area"
          name="service_area"
          defaultValue={volunteer.service_area ?? ""}
          required
        />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-normal text-foreground">Categories</legend>
        <div className="flex flex-wrap gap-3">
          {categories
            .filter((c) => !c.archived || checked.has(c.slug))
            .map((c) => (
              <label key={c.slug} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="categories"
                  value={c.slug}
                  defaultChecked={checked.has(c.slug)}
                />
                {c.name}
                {c.archived ? (
                  <span className="text-xs italic text-muted-foreground">(archived)</span>
                ) : null}
              </label>
            ))}
        </div>
        {fieldError("categories") ? (
          <p className="mt-1 text-sm italic text-muted-foreground">{fieldError("categories")}</p>
        ) : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Home address" id="home_address">
          <Input id="home_address" name="home_address" defaultValue={volunteer.home_address ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lat" id="home_lat">
            <Input
              id="home_lat"
              name="home_lat"
              type="number"
              step="any"
              defaultValue={volunteer.home_lat ?? ""}
            />
          </Field>
          <Field label="Lng" id="home_lng">
            <Input
              id="home_lng"
              name="home_lng"
              type="number"
              step="any"
              defaultValue={volunteer.home_lng ?? ""}
            />
          </Field>
        </div>
      </div>
      {state?.error ? (
        <p className="text-sm italic text-muted-foreground">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-muted-foreground">Saved.</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm italic text-muted-foreground">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Write the detail page**

File: `app/(admin)/admin/volunteers/[id]/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVolunteerById } from "@/lib/db/queries/volunteers";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { VolunteerEdit } from "./volunteer-edit";
import {
  approveVolunteerAction,
  rejectVolunteerAction,
  reactivateVolunteerAction,
  resendInviteAction,
} from "../actions";

export default async function VolunteerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [volunteer, categories] = await Promise.all([
    getVolunteerById(supabase, id),
    listCategories(supabase, { includeArchived: true }),
  ]);
  if (!volunteer) notFound();

  const statusBadge =
    volunteer.status === "active" ? (
      <StatusBadge variant="active">Active</StatusBadge>
    ) : volunteer.status === "pending" ? (
      <StatusBadge variant="not-geocoded">Pending</StatusBadge>
    ) : (
      <StatusBadge variant="archived">Inactive</StatusBadge>
    );

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-h2">
          {volunteer.first_name} {volunteer.last_name}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          {statusBadge}
          <span>
            {volunteer.auth_provider === "admin_invite"
              ? "Created by admin"
              : volunteer.auth_provider === "google"
                ? "Signed up via Google"
                : "Signed up via email"}
          </span>
        </div>
      </div>

      {volunteer.status === "pending" ? (
        <div className="rounded-[var(--radius-lg)] border border-border p-4">
          <p className="mb-2 text-sm">Review and decide.</p>
          <div className="flex gap-2">
            <form action={approveVolunteerAction.bind(null, volunteer.id)}>
              <Button type="submit">Approve</Button>
            </form>
            <form action={rejectVolunteerAction.bind(null, volunteer.id)}>
              <Button type="submit" variant="outline">
                Reject
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      <VolunteerEdit
        volunteer={{
          id: volunteer.id,
          first_name: volunteer.first_name,
          last_name: volunteer.last_name,
          email: volunteer.email,
          phone: volunteer.phone,
          categories: volunteer.categories,
          service_area: volunteer.service_area,
          home_address: volunteer.home_address,
          home_lat: volunteer.home_lat,
          home_lng: volunteer.home_lng,
        }}
        categories={categories.map((c) => ({
          slug: c.slug,
          name: c.name,
          archived: c.archived_at !== null,
        }))}
      />

      <section className="rounded-[var(--radius-lg)] border border-border p-4">
        <h3 className="text-sm font-semibold">Account</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {volunteer.auth_provider === "admin_invite" ? (
            <form action={resendInviteAction.bind(null, volunteer.id)}>
              <Button type="submit" variant="outline">
                Resend invite
              </Button>
            </form>
          ) : null}
          {volunteer.status === "active" ? (
            <form action={rejectVolunteerAction.bind(null, volunteer.id)}>
              <Button type="submit" variant="outline">
                Mark inactive
              </Button>
            </form>
          ) : volunteer.status === "inactive" ? (
            <form action={reactivateVolunteerAction.bind(null, volunteer.id)}>
              <Button type="submit" variant="outline">
                Reactivate
              </Button>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/volunteers/
git commit -m "$(cat <<'EOF'
feat(volunteers): admin detail + edit + account actions

Inline pending-review card; edit form (archived categories stay
selectable if already checked); account panel with resend-invite,
mark-inactive, reactivate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Signup page Google button + token alignment

**Files:**
- Modify: `app/(public)/signup/page.tsx`
- Modify: `app/(public)/signup/actions.ts` — add `signupWithGoogleAction`

- [ ] **Step 1: Extend actions.ts**

Replace the entire contents of `app/(public)/signup/actions.ts` with:

```ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignupState = { error?: string } | undefined;

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: error.message };

  redirect("/signup/complete-profile");
}

export async function signupWithGoogleAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) throw new Error(error.message);
  if (data.url) redirect(data.url);
}
```

- [ ] **Step 2: Rewrite the signup page**

Replace the entire contents of `app/(public)/signup/page.tsx` with:

```tsx
"use client";

import { useActionState } from "react";
import { signupAction, signupWithGoogleAction, type SignupState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signupAction,
    undefined,
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-h2 mb-2 text-foreground">Sign up as a volunteer</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          After signup, an admin will review your profile and activate your account.
        </p>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password (min 8)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {state?.error ? (
            <p className="text-sm italic text-muted-foreground">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account..." : "Create account"}
          </Button>
        </form>
        <form action={signupWithGoogleAction} className="mt-3">
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="text-foreground underline underline-offset-2">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/\(public\)/signup/page.tsx app/\(public\)/signup/actions.ts
git commit -m "$(cat <<'EOF'
feat(volunteers): signup page — Google button + token alignment

Drops the Card container per the editorial pattern established for
/login; adds signupWithGoogleAction matching loginWithGoogle. /auth/
callback already routes Google-fresh users to complete-profile, so no
callback change needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: complete-profile category multi-select + Zod validation + token alignment

**Files:**
- Modify: `app/(public)/signup/complete-profile/actions.ts`
- Modify: `app/(public)/signup/complete-profile/page.tsx`

- [ ] **Step 1: Rewrite the action with Zod + category validation**

Replace the entire contents of `app/(public)/signup/complete-profile/actions.ts` with:

```ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createVolunteerProfile } from "@/lib/db/queries/volunteers";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { completeProfileSchema } from "@/lib/validations/volunteers";

export type CompleteProfileState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

export async function completeProfileAction(
  _prev: CompleteProfileState,
  formData: FormData,
): Promise<CompleteProfileState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { error: "Not authenticated" };

  const rawCategories = formData.getAll("categories").map(String);
  const parsed = completeProfileSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone"),
    categories: rawCategories,
    service_area: formData.get("service_area"),
    home_address: formData.get("home_address"),
    home_lat: formData.get("home_lat"),
    home_lng: formData.get("home_lng"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const activeCategories = await listCategories(supabase);
  const activeSlugs = new Set(activeCategories.map((c) => c.slug));
  const invalid = parsed.data.categories.filter((s) => !activeSlugs.has(s));
  if (invalid.length > 0) {
    return { error: `Unknown categories: ${invalid.join(", ")}` };
  }

  const provider = user.app_metadata.provider === "google" ? "google" : "email";

  try {
    await createVolunteerProfile(supabase, {
      id: user.id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: user.email ?? "",
      phone: parsed.data.phone,
      categories: parsed.data.categories,
      service_area: parsed.data.service_area,
      home_address: parsed.data.home_address,
      home_lat: parsed.data.home_lat,
      home_lng: parsed.data.home_lng,
      auth_provider: provider,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create profile" };
  }

  redirect("/volunteer/dashboard");
}
```

- [ ] **Step 2: Rewrite the page**

Replace the entire contents of `app/(public)/signup/complete-profile/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { CompleteProfileForm } from "./complete-profile-form";

export default async function CompleteProfilePage() {
  const role = await getUserRole();
  if (role.role === "guest") redirect("/login");
  if (role.role === "admin") redirect("/admin");
  if (role.role === "volunteer") redirect("/volunteer/dashboard");

  const supabase = await createSupabaseServerClient();
  const categories = await listCategories(supabase);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <h1 className="text-h2 mb-2 text-foreground">Complete your volunteer profile</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          We use these to match you with seniors who need help in your area.
        </p>
        <CompleteProfileForm
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the client form**

File: `app/(public)/signup/complete-profile/complete-profile-form.tsx`

```tsx
"use client";

import { useActionState } from "react";
import { completeProfileAction, type CompleteProfileState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Category = { slug: string; name: string };

export function CompleteProfileForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<CompleteProfileState, FormData>(
    completeProfileAction,
    undefined,
  );
  const fieldError = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name" id="first_name" error={fieldError("first_name")}>
          <Input id="first_name" name="first_name" required />
        </Field>
        <Field label="Last name" id="last_name" error={fieldError("last_name")}>
          <Input id="last_name" name="last_name" required />
        </Field>
      </div>
      <Field label="Phone (optional)" id="phone" error={fieldError("phone")}>
        <Input id="phone" name="phone" type="tel" />
      </Field>
      <Field label="Service area (city)" id="service_area" error={fieldError("service_area")}>
        <Input id="service_area" name="service_area" required />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-normal text-foreground">Categories</legend>
        <div className="flex flex-wrap gap-3">
          {categories.map((c) => (
            <label key={c.slug} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="categories" value={c.slug} />
              {c.name}
            </label>
          ))}
        </div>
        {fieldError("categories") ? (
          <p className="mt-1 text-sm italic text-muted-foreground">{fieldError("categories")}</p>
        ) : null}
      </fieldset>
      {state?.error ? (
        <p className="text-sm italic text-muted-foreground">{state.error}</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving..." : "Save and continue"}
      </Button>
    </form>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm italic text-muted-foreground">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: clean. (Note: the existing E2E in `auth.spec.ts` uses `getByLabel(/Categories/)` + `.fill("transportation")`. That `.fill()` on a fieldset-of-checkboxes won't work against the new UI. We update the E2E in Task 17; for now, the E2E will fail and that's expected.)

- [ ] **Step 5: Commit**

```bash
git add app/\(public\)/signup/complete-profile/
git commit -m "$(cat <<'EOF'
feat(volunteers): complete-profile uses category multi-select + Zod

Categories become a set of checkboxes driven by volunteer_categories.
Validates slugs against the active set. Editorial layout matching the
signup/login pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Volunteer dashboard "not accepted" state + token alignment

**Files:**
- Modify: `app/(volunteer)/volunteer/dashboard/page.tsx`

- [ ] **Step 1: Rewrite the dashboard**

Replace the entire contents of `app/(volunteer)/volunteer/dashboard/page.tsx` with:

```tsx
import { getUserRole } from "@/lib/auth/roles";

export default async function VolunteerDashboardPage() {
  const role = await getUserRole();
  const status = role.role === "volunteer" ? role.status : undefined;

  if (status === "inactive") {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-h2">Your application wasn&apos;t accepted</h2>
        <p className="text-sm text-muted-foreground">
          Thanks for your interest in Better At Home. If you believe this is a mistake or you&apos;d
          like to discuss, please contact the admin team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-h2">Dashboard</h2>
      {status === "pending" ? (
        <div className="rounded-[var(--radius-lg)] border border-border p-3 text-sm">
          Your account is awaiting admin approval. You&apos;ll receive an email when it&apos;s
          active.
        </div>
      ) : null}
      {status === "active" ? (
        <p className="text-sm text-muted-foreground">
          No pending invites. Feature sub-projects will light this up.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/\(volunteer\)/volunteer/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
feat(volunteers): volunteer dashboard "not accepted" state for inactive

Replaces the red/yellow bordered banners with token-aligned variants.
Inactive volunteers see a dedicated page; no dashboard content.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Dev seed — migration + route handler + dashboard button + integration test

**Files:**
- Create: `supabase/migrations/0014_seed_dev_fixtures.sql`
- Create: `app/api/dev/seed/route.ts`
- Create: `app/(admin)/admin/dev-tools.tsx`
- Modify: `app/(admin)/admin/page.tsx`
- Create: `tests/integration/dev-seed.test.ts`

- [ ] **Step 1: Write the migration**

File: `supabase/migrations/0014_seed_dev_fixtures.sql`

```sql
-- 0014_seed_dev_fixtures.sql
-- Idempotent dev-only seed. Called from the admin dashboard button.
-- Fixed emails so re-running leaves counts unchanged.

create or replace function public.seed_dev_fixtures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cat_transport uuid;
  cat_companion uuid;
  cat_shopping uuid;
  seed_admin_id uuid;
begin
  -- Make sure the starter categories exist (idempotent; real seed is in migration 0013).
  select id into cat_transport from public.volunteer_categories where slug = 'transportation' limit 1;
  select id into cat_companion from public.volunteer_categories where slug = 'companionship' limit 1;
  select id into cat_shopping from public.volunteer_categories where slug = 'shopping' limit 1;

  -- Get any admin to stamp approved_by. If none, leave NULL (rare in dev).
  select id into seed_admin_id from public.admins limit 1;

  -- SENIORS (15 rows across Vancouver / Burnaby / Surrey). Idempotent via fixed email.
  insert into public.seniors (first_name, last_name, phone, email, address_line1, city, province, postal_code, lat, lng, created_by)
  values
    ('Margaret', 'Chen',      '(604) 555-0101', 'senior-1@dev.test',  '1200 Robson St',  'Vancouver', 'BC', 'V6E 1B9', 49.2827, -123.1207, seed_admin_id),
    ('Harold',   'Wong',      '(604) 555-0102', 'senior-2@dev.test',  '800 Burrard St',  'Vancouver', 'BC', 'V6Z 2H5', 49.2820, -123.1230, seed_admin_id),
    ('Ethel',    'Singh',     '(604) 555-0103', 'senior-3@dev.test',  '550 W Broadway',  'Vancouver', 'BC', 'V5Z 1E9', 49.2633, -123.1266, seed_admin_id),
    ('Walter',   'Lam',       '(604) 555-0104', 'senior-4@dev.test',  '2020 Cambie St',  'Vancouver', 'BC', 'V5Y 2T9', 49.2527, -123.1153, seed_admin_id),
    ('Doris',    'Patel',     '(604) 555-0105', 'senior-5@dev.test',  '1800 W 41st Ave', 'Vancouver', 'BC', 'V6M 1Z1', 49.2339, -123.1578, seed_admin_id),
    ('Frank',    'Yamamoto',  '(604) 555-0106', 'senior-6@dev.test',  '4500 Kingsway',   'Burnaby',   'BC', 'V5H 2A9', 49.2276, -123.0024, seed_admin_id),
    ('Ruth',     'Nguyen',    '(604) 555-0107', 'senior-7@dev.test',  '6000 Canada Way', 'Burnaby',   'BC', 'V5E 3N1', 49.2232, -123.0180, seed_admin_id),
    ('Stanley',  'Brown',     '(604) 555-0108', 'senior-8@dev.test',  '3300 Willingdon', 'Burnaby',   'BC', 'V5G 3H4', 49.2480, -123.0020, seed_admin_id),
    ('Betty',    'Kumar',     '(604) 555-0109', 'senior-9@dev.test',  '4201 Hastings',   'Burnaby',   'BC', 'V5C 2J4', 49.2818, -123.0161, seed_admin_id),
    ('George',   'Morrison',  '(604) 555-0110', 'senior-10@dev.test', '10293 152 St',    'Surrey',    'BC', 'V3R 4G8', 49.1865, -122.8436, seed_admin_id),
    ('Vera',     'Taylor',    '(604) 555-0111', 'senior-11@dev.test', '15299 68 Ave',    'Surrey',    'BC', 'V3S 2B9', 49.1332, -122.7999, seed_admin_id),
    ('Henry',    'Davis',     '(604) 555-0112', 'senior-12@dev.test', '10355 University','Surrey',    'BC', 'V3T 5H5', 49.1869, -122.8494, seed_admin_id),
    ('Pearl',    'Johnson',   '(604) 555-0113', 'senior-13@dev.test', '5700 176 St',     'Surrey',    'BC', 'V3S 4C5', 49.1076, -122.7561, seed_admin_id),
    ('Arthur',   'Reyes',     '(604) 555-0114', 'senior-14@dev.test', '9500 King George','Surrey',    'BC', 'V3T 0P7', 49.1897, -122.8436, seed_admin_id),
    -- one without geocoded coordinates to exercise "no coords" flows
    ('Iris',     'Olsen',     '(604) 555-0115', 'senior-15@dev.test', 'Unknown address', 'Vancouver', 'BC', 'V6B 1A1', null,      null,      seed_admin_id)
  on conflict (email) do nothing;

  -- VOLUNTEERS — skip auth.users creation; instead use service-role-inserted rows
  -- tied to placeholder UUIDs. These are DEV-ONLY fixtures; admins can still log in normally.
  -- We stash a deterministic uuid via md5 + a 'vol-N-dev' salt, cast to uuid. On conflict on id, do nothing.
  perform public.seed_dev_volunteer(
    'vol-1@dev.test', 'Ava', 'Martinez', '(604) 555-0201', 'active', array['transportation','shopping'], 'Vancouver', seed_admin_id
  );
  perform public.seed_dev_volunteer(
    'vol-2@dev.test', 'Ben', 'Okoro', '(604) 555-0202', 'active', array['companionship'], 'Vancouver', seed_admin_id
  );
  perform public.seed_dev_volunteer(
    'vol-3@dev.test', 'Cara', 'Dubois', '(604) 555-0203', 'active', array['household_tasks','technology_help'], 'Burnaby', seed_admin_id
  );
  perform public.seed_dev_volunteer(
    'vol-4@dev.test', 'Dmitri', 'Ivanov', '(604) 555-0204', 'active', array['transportation'], 'Surrey', seed_admin_id
  );
  perform public.seed_dev_volunteer(
    'vol-5@dev.test', 'Esha', 'Khan', '(604) 555-0205', 'active', array['meal_delivery','shopping'], 'Vancouver', seed_admin_id
  );
  perform public.seed_dev_volunteer(
    'vol-6@dev.test', 'Felix', 'Obi', '(604) 555-0206', 'active', array['companionship','technology_help'], 'Burnaby', seed_admin_id
  );
  perform public.seed_dev_volunteer(
    'vol-7@dev.test', 'Gia', 'Park', '(604) 555-0207', 'pending', array['transportation'], 'Vancouver', null
  );
  perform public.seed_dev_volunteer(
    'vol-8@dev.test', 'Hiro', 'Tanaka', '(604) 555-0208', 'pending', array['shopping'], 'Surrey', null
  );
  perform public.seed_dev_volunteer(
    'vol-9@dev.test', 'Iris', 'Fernandez', '(604) 555-0209', 'pending', array['household_tasks'], 'Burnaby', null
  );
  perform public.seed_dev_volunteer(
    'vol-10@dev.test', 'Jax', 'Nakamura', '(604) 555-0210', 'inactive', array['other'], 'Vancouver', null
  );

  -- SERVICE REQUESTS — 5 across statuses. Idempotent via fixed description.
  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, created_by)
  select s.id, 'transportation', 'normal', current_date + 2, 'Ride to medical appointment', 'open', seed_admin_id
  from public.seniors s where s.email = 'senior-1@dev.test'
  on conflict do nothing;

  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, created_by)
  select s.id, 'shopping', 'normal', current_date + 3, 'Grocery pickup', 'open', seed_admin_id
  from public.seniors s where s.email = 'senior-3@dev.test'
  on conflict do nothing;

  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, created_by)
  select s.id, 'companionship', 'low', current_date + 5, 'Weekly visit', 'notified', seed_admin_id
  from public.seniors s where s.email = 'senior-6@dev.test'
  on conflict do nothing;

  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, assigned_volunteer_id, created_by)
  select s.id, 'meal_delivery', 'normal', current_date + 1, 'Meal drop-off',
         'accepted',
         (select id from public.volunteers where email = 'vol-5@dev.test' limit 1),
         seed_admin_id
  from public.seniors s where s.email = 'senior-10@dev.test'
  on conflict do nothing;

  insert into public.service_requests (senior_id, category, priority, requested_date, description, status, completed_at, assigned_volunteer_id, created_by)
  select s.id, 'household_tasks', 'normal', current_date - 3, 'Helped change light bulbs',
         'completed', now() - interval '2 days',
         (select id from public.volunteers where email = 'vol-3@dev.test' limit 1),
         seed_admin_id
  from public.seniors s where s.email = 'senior-8@dev.test'
  on conflict do nothing;
end;
$$;

-- Helper that inserts a volunteer with a deterministic auth.users row keyed by email.
create or replace function public.seed_dev_volunteer(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_status volunteer_status,
  p_categories text[],
  p_service_area text,
  p_approver uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  -- Deterministic id from the email so reruns are idempotent.
  v_user_id := md5('dev-vol:' || p_email)::uuid;

  -- Insert into auth.users with a random encrypted password (none of these seeded users can log in).
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, crypt(md5(random()::text), gen_salt('bf')), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.volunteers (id, first_name, last_name, phone, email, status, categories, service_area, auth_provider, approved_at, approved_by)
  values (
    v_user_id,
    p_first_name,
    p_last_name,
    p_phone,
    p_email,
    p_status,
    p_categories,
    p_service_area,
    'admin_invite',
    case when p_status = 'active' then now() else null end,
    case when p_status = 'active' then p_approver else null end
  )
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.seed_dev_fixtures() from public;
revoke all on function public.seed_dev_volunteer(text, text, text, text, volunteer_status, text[], text, uuid) from public;
-- Only service-role can call (by default); no grant needed.

comment on function public.seed_dev_fixtures() is 'Dev-only idempotent fixtures for volunteers, seniors, requests. Called from /api/dev/seed.';
```

- [ ] **Step 2: Apply migration + regenerate types**

Run: `npm run supabase:reset && npm run supabase:types`
Expected: migration runs; types regenerate (the new functions don't change `Tables` so no row type changes; types file may be identical).

- [ ] **Step 3: Write the route handler**

File: `app/api/dev/seed/route.ts`

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  // Production 404
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("seed_dev_fixtures");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write the dashboard dev-tools card**

File: `app/(admin)/admin/dev-tools.tsx`

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DevTools() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const seed = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/dev/seed", { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok) {
        setMessage(`Failed: ${body.error ?? r.statusText}`);
      } else {
        setMessage("Seeded.");
      }
    } catch (e) {
      setMessage(`Failed: ${e instanceof Error ? e.message : "network error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-[var(--radius-lg)] border border-border p-4">
      <h3 className="text-sm font-semibold">Dev tools</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Visible only when NODE_ENV !== production AND NEXT_PUBLIC_ENABLE_DEV_TOOLS=true. Must be
        removed before shipping Phase 1.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" onClick={seed} disabled={busy}>
          {busy ? "Seeding..." : "Seed test data"}
        </Button>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire the card into the dashboard**

Replace the entire contents of `app/(admin)/admin/page.tsx` with:

```tsx
import { DevTools } from "./dev-tools";

export default function AdminDashboardPage() {
  const showDevTools =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
  return (
    <div>
      <h2 className="text-h2">Dashboard</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Phase 1 feature sub-projects will fill this in.
      </p>
      {showDevTools ? <DevTools /> : null}
    </div>
  );
}
```

- [ ] **Step 6: Write the integration test for idempotence**

File: `tests/integration/dev-seed.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { truncate, createAdmin } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient<Database>(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe("seed_dev_fixtures", () => {
  beforeEach(async () => {
    await truncate(admin, ["service_requests", "volunteers", "seniors", "admins"]);
    await createAdmin(admin);
  });

  it("is idempotent: running twice leaves the same row counts", async () => {
    const { error: e1 } = await admin.rpc("seed_dev_fixtures");
    expect(e1).toBeNull();
    const after1 = await Promise.all([
      admin.from("volunteers").select("id", { count: "exact", head: true }),
      admin.from("seniors").select("id", { count: "exact", head: true }),
      admin.from("service_requests").select("id", { count: "exact", head: true }),
    ]);
    const counts1 = after1.map((r) => r.count);

    const { error: e2 } = await admin.rpc("seed_dev_fixtures");
    expect(e2).toBeNull();
    const after2 = await Promise.all([
      admin.from("volunteers").select("id", { count: "exact", head: true }),
      admin.from("seniors").select("id", { count: "exact", head: true }),
      admin.from("service_requests").select("id", { count: "exact", head: true }),
    ]);
    const counts2 = after2.map((r) => r.count);

    expect(counts2).toEqual(counts1);
  });

  it("produces volunteers across all three statuses", async () => {
    await admin.rpc("seed_dev_fixtures");
    const { data } = await admin.from("volunteers").select("status");
    const statuses = new Set((data ?? []).map((r) => r.status));
    expect(statuses.has("pending")).toBe(true);
    expect(statuses.has("active")).toBe(true);
    expect(statuses.has("inactive")).toBe(true);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npm run test:integration -- dev-seed`
Expected: both tests pass.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0014_seed_dev_fixtures.sql app/api/dev/seed/route.ts app/\(admin\)/admin/dev-tools.tsx app/\(admin\)/admin/page.tsx tests/integration/dev-seed.test.ts lib/db/types.ts
git commit -m "$(cat <<'EOF'
chore(dev): seed test data button on admin dashboard

Idempotent Postgres RPC that inserts fixture volunteers, seniors, and
requests. Route handler is 404 in production AND requires
NEXT_PUBLIC_ENABLE_DEV_TOOLS=true as a second gate. Must be removed
before Phase 1 ships — tracked in memory.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: E2E test — admin volunteer lifecycle + update existing signup E2E

**Files:**
- Create: `tests/e2e/admin-volunteer-lifecycle.spec.ts`
- Modify: `tests/e2e/auth.spec.ts` — update the `.fill("transportation")` call to a checkbox click.

- [ ] **Step 1: Update the existing auth E2E**

In `tests/e2e/auth.spec.ts`, find the line:

```ts
await page.getByLabel(/Categories/).fill("transportation");
```

Replace it with:

```ts
await page.getByRole("checkbox", { name: /transportation/i }).check();
```

The rest of the file is unchanged.

- [ ] **Step 2: Write the new E2E**

File: `tests/e2e/admin-volunteer-lifecycle.spec.ts`

```ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin approves, rejects, and reactivates a pending volunteer", async ({ page }) => {
  // Create a pending volunteer via service role (bypasses the self-signup flow).
  const svc = createClient(URL, SERVICE);
  const email = `e2e-pending-${Date.now()}@test.com`;
  const { data: user } = await svc.auth.admin.createUser({
    email,
    password: "Password123!",
    email_confirm: true,
  });
  if (!user.user) throw new Error("user not created");
  await svc.from("volunteers").insert({
    id: user.user.id,
    first_name: "E2E",
    last_name: "Pending",
    email,
    categories: ["transportation"],
    service_area: "Vancouver",
    auth_provider: "email",
    status: "pending",
  });

  // Log in as the seeded dev admin.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);

  // Go to the Pending tab.
  await page.goto("/admin/volunteers?status=pending");
  await expect(page.getByText("E2E Pending")).toBeVisible();

  // Approve inline.
  const row = page.getByText("E2E Pending").locator("xpath=ancestor::tr");
  await row.getByRole("button", { name: /^approve$/i }).click();
  await expect(page.getByText("E2E Pending")).toHaveCount(0); // moved out of Pending tab
  await page.goto("/admin/volunteers?status=active");
  await expect(page.getByText("E2E Pending")).toBeVisible();

  // Reject (mark inactive) from detail page.
  await page.getByRole("link", { name: /E2E Pending/ }).click();
  await expect(page).toHaveURL(/\/admin\/volunteers\/[0-9a-f-]+/);
  await page.getByRole("button", { name: /mark inactive/i }).click();
  await expect(page.getByRole("button", { name: /reactivate/i })).toBeVisible();

  // Reactivate.
  await page.getByRole("button", { name: /reactivate/i }).click();
  await expect(page.getByRole("button", { name: /mark inactive/i })).toBeVisible();
});
```

- [ ] **Step 3: Run the E2E**

Make sure the dev admin is seeded: `npm run seed:admin`.
Then: `npm run test:e2e`
Expected: all 3 tests pass (updated auth test + 2 new).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/admin-volunteer-lifecycle.spec.ts tests/e2e/auth.spec.ts
git commit -m "$(cat <<'EOF'
test(volunteers): E2E — admin approve/reject/reactivate + checkbox fix

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Full verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Full unit + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck clean, lint clean (the same 3 pre-existing warnings in `seniors/actions.ts`), all tests pass.

- [ ] **Step 2: Integration**

Run: `npm run supabase:start` (if not up) then `npm run test:integration`
Expected: all pass.

- [ ] **Step 3: E2E**

Run: `npm run seed:admin` then `npm run test:e2e`
Expected: all 3 tests pass.

- [ ] **Step 4: Manual walk**

Boot dev server. Walk through:
1. `/signup` → cream background, Google button present, create account works, redirects to complete-profile.
2. `/signup/complete-profile` → category checkboxes from DB, submit works, lands on `/volunteer/dashboard` with "awaiting approval" banner (token-aligned, not red/yellow).
3. Log in as admin. Visit `/admin`. If `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`, see the Dev tools card. Click "Seed test data" → success. Visit `/admin/volunteers` → see mock rows across statuses; Pending tab has a count badge.
4. Click Approve on a pending row → it disappears from Pending; appears in Active.
5. Open detail page → see status badge, edit fields, click Mark inactive → becomes inactive; Reactivate works.
6. Visit `/admin/volunteers/new` → fill form with a new email, submit → redirected to detail page. Check Mailpit (port 54324) for the invite email.
7. Enter a duplicate email → inline error with "Go to profile" link.
8. Visit `/admin/volunteers/categories` → add a category ("Pet care"), rename one, archive one. Confirm the archived one still appears on volunteers who have it but not on the new-volunteer form.

- [ ] **Step 5: Push + open PR via `gh`**

```bash
git push -u origin feat/volunteer-management
gh pr create --base develop --title "feat(volunteers): Phase-1 Volunteer Management" --body "$(cat <<'EOF'
## Summary

- New `volunteer_categories` table with authenticated read + admin write RLS. Starter list seeded; admins can add/rename/archive via `/admin/volunteers/categories`.
- Admin volunteer list with status tabs (all / pending / active / inactive) + pending-count badge + inline approve/reject/reactivate.
- Admin-create flow (`/admin/volunteers/new`) using Supabase `inviteUserByEmail` + on-brand welcome email via `NotificationService`. Dup-email blocks (volunteers table + auth.users).
- Admin detail page with edit form, archive zone (mark inactive / reactivate), and resend-invite.
- Signup page gains a Google button (`/auth/callback` already routes Google-fresh users to complete-profile).
- `/signup/complete-profile` switches to category checkboxes + Zod validation + token alignment.
- Volunteer dashboard `inactive` state renders a dedicated "not accepted" page; pending/active banners use design-system tokens.
- Dev-only "Seed test data" button on the admin dashboard. Double env-gated (`NODE_ENV !== "production"` AND `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`). Route handler returns 404 in production. Must be removed before Phase 1 ships.

Spec: [docs/superpowers/specs/2026-04-18-volunteer-management-design.md](docs/superpowers/specs/2026-04-18-volunteer-management-design.md)
Plan: [docs/superpowers/plans/2026-04-18-volunteer-management.md](docs/superpowers/plans/2026-04-18-volunteer-management.md)

## Test plan

- [x] `npm run typecheck && npm run lint && npm test` — all green
- [x] `npm run test:integration` — RLS + CRUD + dev-seed idempotence pass
- [x] `npm run test:e2e` — auth + volunteer lifecycle pass
- [x] Manual walk of signup (email + Google), complete-profile, admin list + detail, category management, dev-seed button

## Risks

- Invite email requires verified Resend sender in production (infra step outside code).
- Dev-seed button must be removed before Phase 1 ships (tracked in memory).
- Email immutability on volunteer edit is intentional; the form surfaces this as a helper.

## Notes

- No Matching-related changes (future sub-project).
- No bulk volunteer CSV import (deferred to Phase 1.5 if demand).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Paste the PR URL back into the conversation**

---

## Self-review

Coverage against the spec:
- Table migration + RLS → Task 1 ✓
- Slugify helper → Task 2 ✓
- Category Zod + query helpers + RLS test → Tasks 3, 4, 5 ✓
- Volunteer Zod + query helpers (list, count, transitions) → Tasks 6, 7 ✓
- Notification templates → Task 8 ✓
- Category management UI + actions → Task 9 ✓
- Admin list with tabs + badge + inline actions → Task 10 ✓
- Admin-create flow (invite + dup-check) → Task 11 ✓
- Admin detail + edit + archive + resend invite → Task 12 ✓
- Signup Google button → Task 13 ✓
- Complete-profile multi-select + validation → Task 14 ✓
- Volunteer dashboard "not accepted" state → Task 15 ✓
- Dev seed migration + button + integration test → Task 16 ✓
- E2E golden path + existing auth E2E update → Task 17 ✓
- Verification + PR → Task 18 ✓

No placeholders. Type names referenced across tasks are consistent (`createVolunteerAction`, `approveVolunteerAction`, `listCategories`, `createCategory`, `Row`, `Status`, etc.). Commit messages are specific to each task's scope.

**Two deferred items surfaced by the spec that are not tasks in this plan:** (a) suppressing Supabase's default invite email in favor of ours (project-wide Supabase config, not code), (b) integration test for `auth.users` duplicate handling in admin-create (the Zod + query layer covers dup volunteers; the auth.users branch runs through the admin client at request time and is exercised by the manual walk). Noted in Task 11 and Task 18 respectively.
