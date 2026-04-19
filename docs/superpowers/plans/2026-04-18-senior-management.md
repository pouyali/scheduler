# Senior Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin UI for senior records — list, create, inline-edit detail with a draggable map pin, archive/permanent-delete, CSV import, and a seniors-only map view — on top of the Foundation sub-project.

**Architecture:** Next.js 16 App Router. Server Components for pages; Server Actions for mutations; two route handlers (`/api/import/seniors`, `/api/geocode`) for file upload and live geocode. Supabase for persistence (one new migration: `archived_at` + a cascade-delete RPC). Mapbox GL JS for the map component; existing `geocodeAddress()` helper for address → coords. All DB reads/writes go through typed helpers in `lib/db/queries/seniors.ts`.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind 4, shadcn/ui, Supabase JS, Zod, papaparse, p-map, Mapbox GL JS, Vitest, MSW, Playwright.

**Spec:** [docs/superpowers/specs/2026-04-18-senior-management-design.md](../specs/2026-04-18-senior-management-design.md)

---

## File structure

Files created or modified by this plan. Grouped by responsibility.

### Database
- Create: `supabase/migrations/0012_seniors_archived_at.sql` — adds `archived_at`, partial index, `delete_senior_cascade` RPC.
- Modify: `lib/db/types.ts` — regenerated after the migration.

### Validation & constants
- Create: `lib/constants/provinces.ts` + `.test.ts`
- Create: `lib/validations/seniors.ts` + `.test.ts`

### DB query helpers
- Modify: `lib/db/queries/seniors.ts` (replaces current stub) + new `lib/db/queries/seniors.test.ts` via integration.

### CSV
- Create: `lib/csv/parse-seniors.ts` + `.test.ts` — pure row-level parser/validator.
- Create: `lib/csv/error-report.ts` + `.test.ts` — builds the error-report CSV from rejected rows.
- Create: `public/templates/seniors-import.csv` — downloadable template.

### Map component
- Create: `components/map/MapView.tsx` — client component wrapping Mapbox GL JS. Single-pin draggable mode + multi-pin clustered mode.

### UI primitives
- Create: `components/ui/status-badge.tsx` + `.test.tsx`
- Create: `components/ui/textarea.tsx` — shadcn primitive used by the senior form.
- Create: `components/ui/select.tsx` — shadcn primitive used for the province select.
- Create: `components/ui/dialog.tsx` — shadcn primitive used for the permanent-delete confirm.

### Admin pages and actions
- Create: `app/(admin)/admin/seniors/actions.ts`
- Create: `app/(admin)/admin/seniors/page.tsx` — list
- Create: `app/(admin)/admin/seniors/new/page.tsx` — create
- Create: `app/(admin)/admin/seniors/new/senior-form.tsx` — shared form client component
- Create: `app/(admin)/admin/seniors/[id]/page.tsx` — detail
- Create: `app/(admin)/admin/seniors/[id]/senior-edit.tsx` — detail's client form + inline map
- Create: `app/(admin)/admin/seniors/[id]/danger-zone.tsx` — archive / unarchive / permanent-delete
- Create: `app/(admin)/admin/seniors/import/page.tsx` — wizard entry
- Create: `app/(admin)/admin/seniors/import/import-wizard.tsx` — stepper client component
- Create: `app/(admin)/admin/map/page.tsx` — seniors map

### Route handlers
- Create: `app/api/import/seniors/route.ts` — multipart `step=preview` / `step=commit`.
- Create: `app/api/geocode/route.ts` — admin-only single-address geocode.

### Integration tests
- Create: `tests/integration/seniors-crud.test.ts`
- Modify: `tests/integration/rls-seniors.test.ts` — add archived-scoping cases
- Create: `tests/integration/seniors-cascade-delete.test.ts`
- Create: `tests/integration/seniors-import-preview.test.ts`
- Create: `tests/integration/msw-mapbox.ts` — shared MSW setup for the preview test

### Fixtures
- Create: `tests/fixtures/seniors-valid.csv`
- Create: `tests/fixtures/seniors-mixed.csv`

### E2E
- Create: `tests/e2e/admin-senior-lifecycle.spec.ts`

### Dependencies
- Add to `dependencies`: `papaparse`, `p-map`, `mapbox-gl`, `@radix-ui/react-dialog`, `@radix-ui/react-select`.
- Add to `devDependencies`: `@types/papaparse`, `@types/mapbox-gl`, `msw`.

---

## Task 0: Pre-work — silence Turbopack root warning and migrate `middleware` → `proxy`

**Context:** Next 16.2 introduced two sources of noise for this project: (1) Turbopack picks the wrong workspace root because an outer `/Users/pouyalitkoohi/react/package-lock.json` exists above the project, and (2) the `middleware.ts` file convention is deprecated in favor of `proxy.ts`. The rename is a one-line behavioral change — the function export is renamed from `middleware` to `proxy`, config is unchanged. Reference: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.

**Files:**
- Modify: `next.config.ts` — pin `turbopack.root` to the project directory.
- Rename: `middleware.ts` → `proxy.ts`, rename the exported function.

- [ ] **Step 1: Pin Turbopack root**

Overwrite `next.config.ts`:

```ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
```

- [ ] **Step 2: Rename the middleware file**

Run:
```bash
git mv middleware.ts proxy.ts
```

- [ ] **Step 3: Rename the exported function**

Edit `proxy.ts` so it reads:

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

Note: the `lib/supabase/middleware.ts` helper file keeps its existing name — only the Next.js file convention at the project root is renamed.

- [ ] **Step 4: Start the dev server and verify the warnings are gone**

Run:
```bash
npm run dev
```
Expected:
- No `Next.js inferred your workspace root` warning.
- No `"middleware" file convention is deprecated` warning.
- Existing auth + admin gating still works (visit `/admin` while logged out and confirm the redirect to `/login` fires — that's the proxy doing its job).

Stop the dev server with Ctrl+C once you've confirmed.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts proxy.ts
git commit -m "chore: pin turbopack.root and migrate middleware.ts to proxy.ts (Next 16)"
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install papaparse p-map mapbox-gl @radix-ui/react-dialog @radix-ui/react-select
```

- [ ] **Step 2: Install dev dependencies**

Run:
```bash
npm install -D @types/papaparse @types/mapbox-gl msw
```

- [ ] **Step 3: Verify typecheck and lint still pass**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: both pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(seniors): add papaparse, p-map, mapbox-gl, msw, dialog/select primitives"
```

---

## Task 2: Schema migration — archived_at + cascade RPC

**Files:**
- Create: `supabase/migrations/0012_seniors_archived_at.sql`
- Modify: `lib/db/types.ts` (regenerated)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_seniors_archived_at.sql`:

```sql
-- 0012_seniors_archived_at.sql
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

comment on column public.seniors.archived_at is
  'Soft-delete marker. Rows with archived_at set are hidden from the default admin list.';
comment on function public.delete_senior_cascade(uuid) is
  'Admin-only. Permanently deletes a senior and all their service_requests + notifications in one transaction.';
```

- [ ] **Step 2: Apply and regenerate types**

Run:
```bash
npm run supabase:reset && npm run supabase:types
```
Expected: reset succeeds; `lib/db/types.ts` now includes `archived_at` on `seniors` and a `delete_senior_cascade` entry under `Functions`.

- [ ] **Step 3: Sanity-check the RPC with psql (optional)**

Run:
```bash
npx supabase db execute --local "select proname from pg_proc where proname = 'delete_senior_cascade'"
```
Expected: one row returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_seniors_archived_at.sql lib/db/types.ts
git commit -m "feat(db): archived_at on seniors + delete_senior_cascade RPC"
```

---

## Task 3: Provinces constant

**Files:**
- Create: `lib/constants/provinces.ts`
- Create: `lib/constants/provinces.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/constants/provinces.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PROVINCES, PROVINCE_CODES, isProvinceCode } from "./provinces";

describe("PROVINCES", () => {
  it("has 13 entries", () => {
    expect(PROVINCES).toHaveLength(13);
  });

  it("every code is a unique two-letter uppercase string", () => {
    const codes = PROVINCES.map((p) => p.code);
    expect(new Set(codes).size).toBe(13);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{2}$/);
  });

  it("PROVINCE_CODES mirrors PROVINCES", () => {
    expect(PROVINCE_CODES).toEqual(PROVINCES.map((p) => p.code));
  });

  it("isProvinceCode accepts known codes and rejects unknown", () => {
    expect(isProvinceCode("BC")).toBe(true);
    expect(isProvinceCode("ON")).toBe(true);
    expect(isProvinceCode("XX")).toBe(false);
    expect(isProvinceCode("bc")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/constants/provinces.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/constants/provinces.ts`:

```ts
export const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
] as const;

export type ProvinceCode = (typeof PROVINCES)[number]["code"];
export const PROVINCE_CODES: ProvinceCode[] = PROVINCES.map((p) => p.code);

export function isProvinceCode(value: unknown): value is ProvinceCode {
  return typeof value === "string" && (PROVINCE_CODES as string[]).includes(value);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run lib/constants/provinces.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/constants/provinces.ts lib/constants/provinces.test.ts
git commit -m "feat(constants): canadian provinces list"
```

---

## Task 4: Senior validations (postal code, phone, Zod schemas)

**Files:**
- Create: `lib/validations/seniors.ts`
- Create: `lib/validations/seniors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/validations/seniors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  postalCodeRegex,
  phoneRegex,
  normalizePhone,
  seniorCreateSchema,
  seniorRowSchema,
} from "./seniors";

describe("postalCodeRegex", () => {
  it("accepts valid Canadian codes with and without space", () => {
    expect(postalCodeRegex.test("V6E 1B9")).toBe(true);
    expect(postalCodeRegex.test("V6E1B9")).toBe(true);
    expect(postalCodeRegex.test("m1m 1m1")).toBe(true);
  });
  it("rejects invalid codes", () => {
    expect(postalCodeRegex.test("D1A 1A1")).toBe(false);
    expect(postalCodeRegex.test("12345")).toBe(false);
    expect(postalCodeRegex.test("")).toBe(false);
  });
});

describe("phoneRegex + normalizePhone", () => {
  it("accepts common formats", () => {
    expect(phoneRegex.test("(604) 555-0134")).toBe(true);
    expect(phoneRegex.test("604-555-0134")).toBe(true);
    expect(phoneRegex.test("6045550134")).toBe(true);
    expect(phoneRegex.test("+1 604 555 0134")).toBe(true);
  });
  it("rejects obviously wrong input", () => {
    expect(phoneRegex.test("123")).toBe(false);
    expect(phoneRegex.test("abcdefg")).toBe(false);
  });
  it("normalizes to (NPA) NXX-XXXX", () => {
    expect(normalizePhone("6045550134")).toBe("(604) 555-0134");
    expect(normalizePhone("+1 604 555 0134")).toBe("(604) 555-0134");
    expect(normalizePhone("604-555-0134")).toBe("(604) 555-0134");
  });
});

describe("seniorCreateSchema", () => {
  const base = {
    first_name: "Margaret",
    last_name: "Chen",
    phone: "(604) 555-0134",
    email: "m@example.com",
    address_line1: "1245 Robson St",
    address_line2: "",
    city: "Vancouver",
    province: "BC",
    postal_code: "V6E 1B9",
    notes: "",
  };
  it("accepts a valid payload", () => {
    const parsed = seniorCreateSchema.parse(base);
    expect(parsed.phone).toBe("(604) 555-0134");
    expect(parsed.email).toBe("m@example.com");
  });
  it("normalizes phone during parse", () => {
    const parsed = seniorCreateSchema.parse({ ...base, phone: "6045550134" });
    expect(parsed.phone).toBe("(604) 555-0134");
  });
  it("empty email becomes undefined", () => {
    const parsed = seniorCreateSchema.parse({ ...base, email: "" });
    expect(parsed.email).toBeUndefined();
  });
  it("rejects missing required fields", () => {
    expect(() => seniorCreateSchema.parse({ ...base, first_name: "" })).toThrow();
    expect(() => seniorCreateSchema.parse({ ...base, postal_code: "BAD" })).toThrow();
    expect(() => seniorCreateSchema.parse({ ...base, province: "XX" })).toThrow();
  });
});

describe("seniorRowSchema", () => {
  it("coerces empty strings in optional fields to undefined", () => {
    const parsed = seniorRowSchema.parse({
      first_name: "A",
      last_name: "B",
      phone: "6045550134",
      email: "",
      address_line1: "1 Main",
      address_line2: "",
      city: "Vancouver",
      province: "BC",
      postal_code: "V6E 1B9",
      notes: "",
    });
    expect(parsed.email).toBeUndefined();
    expect(parsed.address_line2).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/validations/seniors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/validations/seniors.ts`:

```ts
import { z } from "zod";
import { PROVINCE_CODES } from "@/lib/constants/provinces";

export const postalCodeRegex = /^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z] ?[0-9][ABCEGHJ-NPRSTV-Z][0-9]$/i;

// Lenient NANP: allow leading +1 and any common separators, but insist on 10 digits.
export const phoneRegex = /^\+?1?[\s.-]*\(?([2-9][0-9]{2})\)?[\s.-]*([2-9][0-9]{2})[\s.-]*([0-9]{4})$/;

export function normalizePhone(raw: string): string {
  const m = raw.match(phoneRegex);
  if (!m) return raw;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

const provinceSchema = z.enum(PROVINCE_CODES as [string, ...string[]]);
const optionalString = z
  .string()
  .transform((v) => (v.trim() === "" ? undefined : v.trim()))
  .optional();

const phoneSchema = z
  .string()
  .refine((v) => phoneRegex.test(v), { message: "Invalid phone number" })
  .transform(normalizePhone);

const postalCodeSchema = z
  .string()
  .refine((v) => postalCodeRegex.test(v), { message: "Invalid Canadian postal code" })
  .transform((v) => v.toUpperCase().replace(/\s+/, " ").replace(/^(.{3})(.{3})$/, "$1 $2"));

const baseShape = {
  first_name: z.string().trim().min(1, "Required"),
  last_name: z.string().trim().min(1, "Required"),
  phone: phoneSchema,
  email: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Invalid email",
    })
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  address_line1: z.string().trim().min(1, "Required"),
  address_line2: optionalString,
  city: z.string().trim().min(1, "Required"),
  province: provinceSchema,
  postal_code: postalCodeSchema,
  notes: optionalString,
};

export const seniorCreateSchema = z.object(baseShape);
export const seniorUpdateSchema = z.object({
  ...baseShape,
  manual_pin_override: z.union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => v === true || v === "true"),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

// CSV rows permit blank optional fields but otherwise match create.
export const seniorRowSchema = z.object(baseShape);

export type SeniorCreateInput = z.infer<typeof seniorCreateSchema>;
export type SeniorUpdateInput = z.infer<typeof seniorUpdateSchema>;
export type SeniorRowInput = z.infer<typeof seniorRowSchema>;
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run lib/validations/seniors.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/seniors.ts lib/validations/seniors.test.ts
git commit -m "feat(validations): postal/phone regex + senior Zod schemas"
```

---

## Task 5: CSV row parser

**Files:**
- Create: `lib/csv/parse-seniors.ts`
- Create: `lib/csv/parse-seniors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/csv/parse-seniors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSeniorsCsv } from "./parse-seniors";

const header =
  "first_name,last_name,phone,email,address_line1,address_line2,city,province,postal_code,notes";

describe("parseSeniorsCsv", () => {
  it("parses a valid row", () => {
    const csv = `${header}\nMargaret,Chen,6045550134,m@x.com,1245 Robson St,,Vancouver,BC,V6E 1B9,`;
    const rows = parseSeniorsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      errors: [],
      data: expect.objectContaining({
        first_name: "Margaret",
        phone: "(604) 555-0134",
        province: "BC",
      }),
    });
  });

  it("flags missing required fields per row", () => {
    const csv = `${header}\n,Chen,6045550134,,1245 Robson St,,Vancouver,BC,V6E 1B9,`;
    const rows = parseSeniorsCsv(csv);
    expect(rows[0].errors).toContain("first_name: Required");
  });

  it("rejects missing header", () => {
    expect(() => parseSeniorsCsv("no,header,row\n1,2,3")).toThrow(/header/i);
  });

  it("skips empty rows", () => {
    const csv = `${header}\n\nMargaret,Chen,6045550134,,1245 Robson St,,Vancouver,BC,V6E 1B9,\n`;
    const rows = parseSeniorsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(3);
  });

  it("tolerates BOM", () => {
    const csv = `\uFEFF${header}\nMargaret,Chen,6045550134,,1245 Robson St,,Vancouver,BC,V6E 1B9,`;
    const rows = parseSeniorsCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it("ignores extra unknown columns", () => {
    const csv = `${header},extra\nMargaret,Chen,6045550134,,1245 Robson St,,Vancouver,BC,V6E 1B9,,junk`;
    const rows = parseSeniorsCsv(csv);
    expect(rows[0].errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/csv/parse-seniors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/csv/parse-seniors.ts`:

```ts
import Papa from "papaparse";
import { seniorRowSchema, type SeniorRowInput } from "@/lib/validations/seniors";

export type ParsedRow =
  | { rowNumber: number; errors: []; data: SeniorRowInput; raw: Record<string, string> }
  | { rowNumber: number; errors: string[]; data: null; raw: Record<string, string> };

const REQUIRED_HEADERS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "address_line1",
  "address_line2",
  "city",
  "province",
  "postal_code",
  "notes",
] as const;

export function parseSeniorsCsv(csv: string): ParsedRow[] {
  const stripped = csv.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  for (const h of REQUIRED_HEADERS) {
    if (!headers.includes(h)) {
      throw new Error(`CSV header missing required column: ${h}`);
    }
  }

  return parsed.data.map((row, i) => {
    const raw = Object.fromEntries(
      REQUIRED_HEADERS.map((h) => [h, (row[h] ?? "").toString()]),
    );
    const result = seniorRowSchema.safeParse(raw);
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    if (result.success) {
      return { rowNumber, errors: [], data: result.data, raw };
    }
    const errors = result.error.issues.map(
      (iss) => `${iss.path.join(".") || "row"}: ${iss.message}`,
    );
    return { rowNumber, errors, data: null, raw };
  });
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run lib/csv/parse-seniors.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/csv/parse-seniors.ts lib/csv/parse-seniors.test.ts
git commit -m "feat(csv): senior CSV row parser with per-row error messages"
```

---

## Task 6: CSV error-report builder

**Files:**
- Create: `lib/csv/error-report.ts`
- Create: `lib/csv/error-report.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/csv/error-report.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildErrorReport } from "./error-report";

describe("buildErrorReport", () => {
  it("returns null when no rejected rows", () => {
    expect(buildErrorReport([])).toBeNull();
  });

  it("preserves original column order and appends error column", () => {
    const csv = buildErrorReport([
      {
        rowNumber: 2,
        errors: ["first_name: Required"],
        raw: {
          first_name: "",
          last_name: "Chen",
          phone: "6045550134",
          email: "",
          address_line1: "1 Main",
          address_line2: "",
          city: "Vancouver",
          province: "BC",
          postal_code: "V6E 1B9",
          notes: "",
        },
      },
    ]);
    expect(csv).toContain(
      "first_name,last_name,phone,email,address_line1,address_line2,city,province,postal_code,notes,error",
    );
    expect(csv).toContain(',Chen,6045550134,');
    expect(csv).toContain("first_name: Required");
  });

  it("joins multiple errors per row with '; '", () => {
    const csv = buildErrorReport([
      {
        rowNumber: 3,
        errors: ["phone: Invalid phone number", "postal_code: Invalid Canadian postal code"],
        raw: {
          first_name: "A",
          last_name: "B",
          phone: "123",
          email: "",
          address_line1: "1 Main",
          address_line2: "",
          city: "Van",
          province: "BC",
          postal_code: "BAD",
          notes: "",
        },
      },
    ])!;
    expect(csv).toContain("phone: Invalid phone number; postal_code: Invalid Canadian postal code");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/csv/error-report.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/csv/error-report.ts`:

```ts
import Papa from "papaparse";

export type RejectedRow = {
  rowNumber: number;
  errors: string[];
  raw: Record<string, string>;
};

const COLUMNS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "address_line1",
  "address_line2",
  "city",
  "province",
  "postal_code",
  "notes",
] as const;

export function buildErrorReport(rejected: RejectedRow[]): string | null {
  if (rejected.length === 0) return null;
  const fields = [...COLUMNS, "error"] as const;
  const rows = rejected.map((r) => {
    const out: Record<string, string> = {};
    for (const c of COLUMNS) out[c] = r.raw[c] ?? "";
    out.error = r.errors.join("; ");
    return out;
  });
  return Papa.unparse({ fields: fields as unknown as string[], data: rows });
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run lib/csv/error-report.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/csv/error-report.ts lib/csv/error-report.test.ts
git commit -m "feat(csv): error-report CSV builder for rejected import rows"
```

---

## Task 7: CSV template file

**Files:**
- Create: `public/templates/seniors-import.csv`

- [ ] **Step 1: Write the template**

Create `public/templates/seniors-import.csv`:

```csv
first_name,last_name,phone,email,address_line1,address_line2,city,province,postal_code,notes
Margaret,Chen,(604) 555-0134,margaret.chen@example.com,1245 Robson St,,Vancouver,BC,V6E 1B9,Prefers afternoon calls
```

- [ ] **Step 2: Verify the template parses via parseSeniorsCsv**

Create and run a quick throwaway check (delete after):
```bash
node -e "
  const fs = require('fs');
  const Papa = require('papaparse');
  const csv = fs.readFileSync('public/templates/seniors-import.csv', 'utf8');
  const r = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (r.errors.length) { console.error(r.errors); process.exit(1); }
  console.log(JSON.stringify(r.data));
"
```
Expected: one row of JSON with all fields populated.

- [ ] **Step 3: Commit**

```bash
git add public/templates/seniors-import.csv
git commit -m "feat(seniors): CSV import template with Canadian example row"
```

---

## Task 8: DB query helpers — typed reads/writes

**Files:**
- Modify: `lib/db/queries/seniors.ts` (replaces stub)

- [ ] **Step 1: Replace the stub with the full helper module**

Overwrite `lib/db/queries/seniors.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;
type SeniorsInsert = Database["public"]["Tables"]["seniors"]["Insert"];
type SeniorsUpdate = Database["public"]["Tables"]["seniors"]["Update"];
type SeniorsRow = Database["public"]["Tables"]["seniors"]["Row"];

export type ListSeniorsFilters = {
  q?: string;
  city?: string;
  archived?: boolean;
  notGeocoded?: boolean;
  cursor?: { last_name: string; id: string } | null;
  limit?: number;
};

export async function listSeniors(
  supabase: Client,
  filters: ListSeniorsFilters = {},
): Promise<{ rows: SeniorsRow[]; nextCursor: { last_name: string; id: string } | null }> {
  const limit = filters.limit ?? 50;
  let q = supabase.from("seniors").select("*");

  if (filters.archived === true) q = q.not("archived_at", "is", null);
  else q = q.is("archived_at", null);

  if (filters.city) q = q.eq("city", filters.city);
  if (filters.notGeocoded) q = q.is("lat", null);

  if (filters.q && filters.q.trim()) {
    const term = `%${filters.q.trim()}%`;
    q = q.or(
      `first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},address_line1.ilike.${term}`,
    );
  }

  if (filters.cursor) {
    q = q.or(
      `last_name.gt.${filters.cursor.last_name},and(last_name.eq.${filters.cursor.last_name},id.gt.${filters.cursor.id})`,
    );
  }

  q = q.order("last_name", { ascending: true }).order("id", { ascending: true }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as SeniorsRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? { last_name: last.last_name, id: last.id } : null;
  return { rows: page, nextCursor };
}

export async function getSenior(supabase: Client, id: string): Promise<SeniorsRow | null> {
  const { data, error } = await supabase.from("seniors").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function insertSenior(
  supabase: Client,
  input: SeniorsInsert,
): Promise<SeniorsRow> {
  const { data, error } = await supabase.from("seniors").insert(input).select().single();
  if (error) throw error;
  return data as SeniorsRow;
}

export async function insertSeniorsMany(
  supabase: Client,
  inputs: SeniorsInsert[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const { error, count } = await supabase
    .from("seniors")
    .insert(inputs, { count: "exact" });
  if (error) throw error;
  return count ?? inputs.length;
}

export async function updateSeniorRow(
  supabase: Client,
  id: string,
  patch: SeniorsUpdate,
): Promise<SeniorsRow> {
  const { data, error } = await supabase
    .from("seniors")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SeniorsRow;
}

export async function setArchived(
  supabase: Client,
  id: string,
  value: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("seniors")
    .update({ archived_at: value ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export type SeniorCounts = { openRequests: number; lastRequestDate: string | null };

export async function countsBySenior(
  supabase: Client,
  seniorIds: string[],
): Promise<Map<string, SeniorCounts>> {
  const out = new Map<string, SeniorCounts>();
  if (seniorIds.length === 0) return out;
  const { data, error } = await supabase
    .from("service_requests")
    .select("senior_id, status, requested_date")
    .in("senior_id", seniorIds);
  if (error) throw error;
  for (const id of seniorIds) out.set(id, { openRequests: 0, lastRequestDate: null });
  for (const r of data ?? []) {
    const entry = out.get(r.senior_id)!;
    if (["open", "notified", "accepted"].includes(r.status as string)) entry.openRequests += 1;
    if (!entry.lastRequestDate || r.requested_date > entry.lastRequestDate) {
      entry.lastRequestDate = r.requested_date;
    }
  }
  return out;
}

export async function listSeniorCities(supabase: Client): Promise<string[]> {
  const { data, error } = await supabase
    .from("seniors")
    .select("city")
    .is("archived_at", null)
    .not("lat", "is", null);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.city))).sort();
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/seniors.ts
git commit -m "feat(db): typed query helpers for seniors (list/get/insert/update/archive/counts)"
```

---

## Task 9: Integration test — CRUD and archive

**Files:**
- Create: `tests/integration/seniors-crud.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/seniors-crud.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import {
  insertSenior,
  getSenior,
  listSeniors,
  updateSeniorRow,
  setArchived,
} from "@/lib/db/queries/seniors";
import { adminClient, createAdminUser } from "./helpers";

describe("seniors CRUD helpers", () => {
  let admin: { userId: string };
  const sb = adminClient();

  beforeAll(async () => {
    admin = await createAdminUser("crud-admin@test.com");
  });

  it("inserts, reads, updates, and archives", async () => {
    const row = await insertSenior(sb, {
      first_name: "Crud",
      last_name: "Test",
      phone: "(604) 555-0000",
      address_line1: "1 Test Lane",
      city: "Vancouver",
      province: "BC",
      postal_code: "V6E 1B9",
      created_by: admin.userId,
    });
    expect(row.id).toBeTruthy();

    const fetched = await getSenior(sb, row.id);
    expect(fetched?.first_name).toBe("Crud");

    const updated = await updateSeniorRow(sb, row.id, { city: "Burnaby" });
    expect(updated.city).toBe("Burnaby");
    expect(updated.updated_at > row.updated_at).toBe(true);

    const { rows: activeRows } = await listSeniors(sb);
    expect(activeRows.find((r) => r.id === row.id)).toBeTruthy();

    await setArchived(sb, row.id, true);
    const { rows: defaultList } = await listSeniors(sb);
    expect(defaultList.find((r) => r.id === row.id)).toBeFalsy();

    const { rows: archivedList } = await listSeniors(sb, { archived: true });
    expect(archivedList.find((r) => r.id === row.id)).toBeTruthy();

    await setArchived(sb, row.id, false);
    const { rows: backActive } = await listSeniors(sb);
    expect(backActive.find((r) => r.id === row.id)).toBeTruthy();
  });

  it("search matches first_name, phone, address_line1", async () => {
    await insertSenior(sb, {
      first_name: "Searchable",
      last_name: "Zed",
      phone: "(604) 555-9999",
      address_line1: "900 Uniqueish Rd",
      city: "Vancouver",
      province: "BC",
      postal_code: "V6E 1B9",
      created_by: admin.userId,
    });

    const byName = await listSeniors(sb, { q: "Searchable" });
    expect(byName.rows.some((r) => r.first_name === "Searchable")).toBe(true);

    const byPhone = await listSeniors(sb, { q: "555-9999" });
    expect(byPhone.rows.some((r) => r.first_name === "Searchable")).toBe(true);

    const byAddress = await listSeniors(sb, { q: "Uniqueish" });
    expect(byAddress.rows.some((r) => r.first_name === "Searchable")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

Ensure local Supabase is up:
```bash
npm run supabase:start
```

Run:
```bash
npm run test:integration -- seniors-crud
```
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/seniors-crud.test.ts
git commit -m "test(seniors): integration coverage for CRUD helpers + archive + search"
```

---

## Task 10: Integration test — archived rows stay admin-only

**Files:**
- Modify: `tests/integration/rls-seniors.test.ts`

- [ ] **Step 1: Extend the existing RLS test**

Overwrite `tests/integration/rls-seniors.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser, signIn } from "./helpers";

describe("RLS: seniors", () => {
  let admin: { userId: string; email: string };
  let volunteer: { userId: string; email: string };

  beforeAll(async () => {
    admin = await createAdminUser("admin-seniors@test.com");
    volunteer = await createVolunteerUser("vol-seniors@test.com", "active");
  });

  it("admin can insert a senior", async () => {
    const client = await signIn(admin.email);
    const { data, error } = await client
      .from("seniors")
      .insert({
        first_name: "A",
        last_name: "B",
        phone: "555-1234",
        address_line1: "10 Main",
        city: "Toronto",
        province: "ON",
        postal_code: "M1M 1M1",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("volunteer cannot insert a senior", async () => {
    const client = await signIn(volunteer.email);
    const { error } = await client.from("seniors").insert({
      first_name: "X",
      last_name: "Y",
      phone: "555-0000",
      address_line1: "1",
      city: "C",
      province: "ON",
      postal_code: "M1M 1M1",
    });
    expect(error).not.toBeNull();
  });

  it("volunteer cannot read any senior — archived or not", async () => {
    const sb = adminClient();
    const { data: active } = await sb
      .from("seniors")
      .insert({
        first_name: "Active",
        last_name: "Senior",
        phone: "555-0001",
        address_line1: "1",
        city: "C",
        province: "ON",
        postal_code: "M1M 1M1",
      })
      .select()
      .single();
    const { data: archived } = await sb
      .from("seniors")
      .insert({
        first_name: "Archived",
        last_name: "Senior",
        phone: "555-0002",
        address_line1: "2",
        city: "C",
        province: "ON",
        postal_code: "M1M 1M1",
        archived_at: new Date().toISOString(),
      })
      .select()
      .single();

    const client = await signIn(volunteer.email);
    const { data: rows } = await client
      .from("seniors")
      .select("id")
      .in("id", [active!.id, archived!.id]);
    expect(rows ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test**

Run:
```bash
npm run test:integration -- rls-seniors
```
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rls-seniors.test.ts
git commit -m "test(rls): volunteers cannot read seniors regardless of archived state"
```

---

## Task 11: Integration test — cascade delete RPC

**Files:**
- Create: `tests/integration/seniors-cascade-delete.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/seniors-cascade-delete.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser, signIn } from "./helpers";

describe("delete_senior_cascade RPC", () => {
  let admin: { userId: string; email: string };
  let volunteer: { userId: string; email: string };

  beforeAll(async () => {
    admin = await createAdminUser("cascade-admin@test.com");
    volunteer = await createVolunteerUser("cascade-vol@test.com", "active");
  });

  it("deletes senior, service_requests, and notifications atomically", async () => {
    const sb = adminClient();
    const { data: senior } = await sb
      .from("seniors")
      .insert({
        first_name: "Cascade",
        last_name: "Test",
        phone: "555-7777",
        address_line1: "1",
        city: "C",
        province: "ON",
        postal_code: "M1M 1M1",
      })
      .select()
      .single();

    const requests = await sb
      .from("service_requests")
      .insert([
        {
          senior_id: senior!.id,
          category: "transportation",
          priority: "normal",
          requested_date: "2026-05-01",
          description: "x",
          created_by: admin.userId,
        },
        {
          senior_id: senior!.id,
          category: "companionship",
          priority: "normal",
          requested_date: "2026-05-02",
          description: "y",
          created_by: admin.userId,
        },
      ])
      .select();

    await sb.from("notifications").insert([
      {
        request_id: requests.data![0].id,
        volunteer_id: volunteer.userId,
        channel: "email",
        status: "sent",
      },
      {
        request_id: requests.data![1].id,
        volunteer_id: volunteer.userId,
        channel: "email",
        status: "sent",
      },
    ]);

    const client = await signIn(admin.email);
    const { error } = await client.rpc("delete_senior_cascade", { p_senior_id: senior!.id });
    expect(error).toBeNull();

    const { data: seniorsAfter } = await sb.from("seniors").select("id").eq("id", senior!.id);
    expect(seniorsAfter ?? []).toHaveLength(0);

    const { data: reqsAfter } = await sb
      .from("service_requests")
      .select("id")
      .eq("senior_id", senior!.id);
    expect(reqsAfter ?? []).toHaveLength(0);

    const { data: notifsAfter } = await sb
      .from("notifications")
      .select("id")
      .in(
        "request_id",
        (requests.data ?? []).map((r) => r.id),
      );
    expect(notifsAfter ?? []).toHaveLength(0);
  });

  it("volunteer calling the RPC is rejected", async () => {
    const sb = adminClient();
    const { data: senior } = await sb
      .from("seniors")
      .insert({
        first_name: "Protected",
        last_name: "Senior",
        phone: "555-8888",
        address_line1: "1",
        city: "C",
        province: "ON",
        postal_code: "M1M 1M1",
      })
      .select()
      .single();

    const client = await signIn(volunteer.email);
    const { error } = await client.rpc("delete_senior_cascade", { p_senior_id: senior!.id });
    expect(error).not.toBeNull();

    const { data: still } = await sb.from("seniors").select("id").eq("id", senior!.id);
    expect(still ?? []).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test**

Run:
```bash
npm run test:integration -- seniors-cascade-delete
```
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/seniors-cascade-delete.test.ts
git commit -m "test(seniors): cascade delete RPC removes requests+notifications, rejects volunteers"
```

---

## Task 12: MapView component — multi-pin with clustering

**Files:**
- Create: `components/map/MapView.tsx`

- [ ] **Step 1: Read Mapbox GL JS docs for the installed version**

Check the installed version:
```bash
node -e "console.log(require('mapbox-gl/package.json').version)"
```
Open the Mapbox GL JS API reference for that version to confirm `Map`, `Marker`, `addSource({ cluster: true })`, and `addLayer` APIs. (If offline, the API has been stable since v2; the code below uses v3-compatible calls.)

- [ ] **Step 2: Implement MapView**

Create `components/map/MapView.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  popupHtml?: string;
};

type Props = {
  pins: MapPin[];
  initialCenter?: [number, number]; // [lng, lat]
  initialZoom?: number;
  draggable?: boolean; // draggable single pin mode — uses pins[0]
  cluster?: boolean;
  onPinDrag?: (lat: number, lng: number) => void;
  onPinClick?: (pinId: string) => void;
  className?: string;
};

export function MapView({
  pins,
  initialCenter,
  initialZoom,
  draggable = false,
  cluster = false,
  onPinDrag,
  onPinClick,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const singleMarkerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error("NEXT_PUBLIC_MAPBOX_TOKEN is not set");
      return;
    }
    mapboxgl.accessToken = token;
    const firstPin = pins[0];
    const center: [number, number] =
      initialCenter ??
      (firstPin ? [firstPin.lng, firstPin.lat] : [-123.1216, 49.2827]); // Vancouver fallback
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: initialZoom ?? (firstPin ? 13 : 4),
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draggable single-pin mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !draggable) return;
    const pin = pins[0];
    if (!pin) {
      singleMarkerRef.current?.remove();
      singleMarkerRef.current = null;
      return;
    }
    if (!singleMarkerRef.current) {
      const marker = new mapboxgl.Marker({ draggable: true })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        onPinDrag?.(lat, lng);
      });
      singleMarkerRef.current = marker;
    } else {
      singleMarkerRef.current.setLngLat([pin.lng, pin.lat]);
    }
  }, [pins, draggable, onPinDrag]);

  // Multi-pin cluster mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || draggable) return;

    const apply = () => {
      if (map.getLayer("clusters")) map.removeLayer("clusters");
      if (map.getLayer("cluster-count")) map.removeLayer("cluster-count");
      if (map.getLayer("unclustered-point")) map.removeLayer("unclustered-point");
      if (map.getSource("seniors")) map.removeSource("seniors");

      const geojson = {
        type: "FeatureCollection" as const,
        features: pins.map((p) => ({
          type: "Feature" as const,
          properties: { id: p.id, popupHtml: p.popupHtml ?? "" },
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        })),
      };

      map.addSource("seniors", {
        type: "geojson",
        data: geojson,
        cluster,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      if (cluster) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "seniors",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#0ea5e9",
            "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 25, 25],
            "circle-opacity": 0.8,
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "seniors",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
          },
        });
      }

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "seniors",
        filter: cluster ? ["!", ["has", "point_count"]] : ["all"],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": 7,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });

      map.off("click", "unclustered-point", clickHandler);
      map.on("click", "unclustered-point", clickHandler);
    };

    const clickHandler = (e: mapboxgl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const { id, popupHtml } = feat.properties as { id: string; popupHtml: string };
      const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
      if (popupHtml) {
        new mapboxgl.Popup().setLngLat(coords).setHTML(popupHtml).addTo(map);
      }
      onPinClick?.(id);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [pins, cluster, draggable, onPinClick]);

  return <div ref={containerRef} className={className ?? "h-96 w-full rounded-md border"} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add components/map/MapView.tsx
git commit -m "feat(map): MapView component — draggable single pin or clustered multi-pin"
```

---

## Task 13: UI primitives — StatusBadge, Textarea, Select, Dialog

**Files:**
- Create: `components/ui/status-badge.tsx`
- Create: `components/ui/status-badge.test.tsx`
- Create: `components/ui/textarea.tsx`
- Create: `components/ui/select.tsx`
- Create: `components/ui/dialog.tsx`

- [ ] **Step 1: Write the failing test for StatusBadge**

Create `components/ui/status-badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders the label", () => {
    render(<StatusBadge variant="archived">Archived</StatusBadge>);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
  it("applies variant class", () => {
    const { container } = render(
      <StatusBadge variant="not-geocoded">No location</StatusBadge>,
    );
    expect(container.firstChild).toHaveClass("bg-amber-100");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run components/ui/status-badge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement status-badge.tsx**

Create `components/ui/status-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

const VARIANTS = {
  archived: "bg-gray-200 text-gray-800",
  "not-geocoded": "bg-amber-100 text-amber-900",
  active: "bg-emerald-100 text-emerald-900",
} as const;

type Variant = keyof typeof VARIANTS;

type Props = {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
};

export function StatusBadge({ variant, children, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run components/ui/status-badge.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Add the shadcn textarea primitive**

Create `components/ui/textarea.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
```

- [ ] **Step 6: Add the shadcn dialog primitive**

Create `components/ui/dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 7: Add the shadcn select primitive**

Create `components/ui/select.tsx`:

```tsx
"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position="popper"
      className={cn(
        "z-50 max-h-60 min-w-[--radix-select-trigger-width] overflow-auto rounded-md border bg-popover p-1 shadow-md",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";
```

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`
Expected: passes.

```bash
git add components/ui/status-badge.tsx components/ui/status-badge.test.tsx components/ui/textarea.tsx components/ui/dialog.tsx components/ui/select.tsx
git commit -m "feat(ui): status-badge, textarea, dialog, select primitives"
```

---

## Task 14: Server Actions for seniors

**Files:**
- Create: `app/(admin)/admin/seniors/actions.ts`

- [ ] **Step 1: Implement the actions**

Create `app/(admin)/admin/seniors/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import {
  seniorCreateSchema,
  seniorUpdateSchema,
} from "@/lib/validations/seniors";
import {
  getSenior,
  insertSenior,
  setArchived,
  updateSeniorRow,
} from "@/lib/db/queries/seniors";
import { geocodeAddress } from "@/lib/mapbox/geocode";

function fullAddress(input: {
  address_line1: string;
  city: string;
  province: string;
  postal_code: string;
}) {
  return `${input.address_line1}, ${input.city}, ${input.province}, ${input.postal_code}, Canada`;
}

export async function createSenior(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = seniorCreateSchema.parse(Object.fromEntries(formData));
  const supabase = await createSupabaseServerClient();

  const geo = await geocodeAddress(fullAddress(parsed));
  const row = await insertSenior(supabase, {
    ...parsed,
    lat: geo.ok ? geo.lat : null,
    lng: geo.ok ? geo.lng : null,
    created_by: admin.userId,
  });

  revalidatePath("/admin/seniors");
  redirect(`/admin/seniors/${row.id}`);
}

export async function updateSenior(id: string, formData: FormData) {
  await requireAdmin();
  const parsed = seniorUpdateSchema.parse(Object.fromEntries(formData));
  const supabase = await createSupabaseServerClient();

  let lat: number | null = parsed.lat ?? null;
  let lng: number | null = parsed.lng ?? null;

  if (!parsed.manual_pin_override) {
    const geo = await geocodeAddress(fullAddress(parsed));
    lat = geo.ok ? geo.lat : null;
    lng = geo.ok ? geo.lng : null;
  }

  const { manual_pin_override: _ignored, lat: _a, lng: _b, ...rest } = parsed;
  await updateSeniorRow(supabase, id, { ...rest, lat, lng });

  revalidatePath("/admin/seniors");
  revalidatePath(`/admin/seniors/${id}`);
}

export async function archiveSenior(id: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await setArchived(supabase, id, true);
  revalidatePath("/admin/seniors");
  revalidatePath(`/admin/seniors/${id}`);
}

export async function unarchiveSenior(id: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await setArchived(supabase, id, false);
  revalidatePath("/admin/seniors");
  revalidatePath(`/admin/seniors/${id}`);
}

export async function permanentlyDeleteSenior(id: string, typedName: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const senior = await getSenior(supabase, id);
  if (!senior) throw new Error("Senior not found");
  const expected = `${senior.first_name} ${senior.last_name}`;
  if (typedName.trim() !== expected) {
    throw new Error("Typed name does not match");
  }
  const { error } = await supabase.rpc("delete_senior_cascade", { p_senior_id: id });
  if (error) throw error;
  revalidatePath("/admin/seniors");
  redirect("/admin/seniors?archived=true");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/seniors/actions.ts
git commit -m "feat(seniors): server actions — create/update/archive/unarchive/permanent-delete"
```

---

## Task 15: Shared senior form (client component)

**Files:**
- Create: `app/(admin)/admin/seniors/new/senior-form.tsx`

- [ ] **Step 1: Implement the form**

Create `app/(admin)/admin/seniors/new/senior-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { PROVINCES } from "@/lib/constants/provinces";
import { createSenior } from "../actions";

export function SeniorForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [province, setProvince] = useState("BC");

  return (
    <form
      action={(fd) => {
        setError(null);
        fd.set("province", province);
        startTransition(async () => {
          try {
            await createSenior(fd);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
          }
        });
      }}
      className="grid max-w-xl gap-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" name="first_name" required />
        <Field label="Last name" name="last_name" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" name="phone" placeholder="(604) 555-0134" required />
        <Field label="Email" name="email" type="email" />
      </div>
      <Field label="Address line 1" name="address_line1" required />
      <Field label="Address line 2" name="address_line2" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="City" name="city" required />
        <div>
          <Label>Province</Label>
          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field label="Postal code" name="postal_code" placeholder="V6E 1B9" required />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea name="notes" />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Create senior"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} placeholder={placeholder} required={required} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/seniors/new/senior-form.tsx
git commit -m "feat(seniors): create-form client component"
```

---

## Task 16: New-senior page

**Files:**
- Create: `app/(admin)/admin/seniors/new/page.tsx`

- [ ] **Step 1: Implement**

Create `app/(admin)/admin/seniors/new/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { SeniorForm } from "./senior-form";

export default async function NewSeniorPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/seniors" className="text-sm underline">
          ← Back to seniors
        </Link>
        <h2 className="mt-2 text-xl font-semibold">New senior</h2>
      </div>
      <SeniorForm />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/admin/seniors/new/page.tsx
git commit -m "feat(seniors): /admin/seniors/new page"
```

---

## Task 17: List page

**Files:**
- Create: `app/(admin)/admin/seniors/page.tsx`

- [ ] **Step 1: Implement**

Create `app/(admin)/admin/seniors/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSeniors, countsBySenior } from "@/lib/db/queries/seniors";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

type SearchParams = Promise<{
  q?: string;
  city?: string;
  archived?: string;
  not_geocoded?: string;
}>;

export default async function SeniorsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { rows } = await listSeniors(supabase, {
    q: sp.q,
    city: sp.city,
    archived: sp.archived === "true",
    notGeocoded: sp.not_geocoded === "true",
  });
  const counts = await countsBySenior(
    supabase,
    rows.map((r) => r.id),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Seniors</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/seniors/import">Import CSV</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/seniors/new">New senior</Link>
          </Button>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/admin/seniors">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search name, phone, address"
          className="h-9 flex-1 rounded-md border px-2 text-sm"
        />
        <input
          type="text"
          name="city"
          defaultValue={sp.city ?? ""}
          placeholder="City"
          className="h-9 w-40 rounded-md border px-2 text-sm"
        />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="archived" value="true" defaultChecked={sp.archived === "true"} />
          Archived
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            name="not_geocoded"
            value="true"
            defaultChecked={sp.not_geocoded === "true"}
          />
          Not geocoded
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">Name</th>
            <th>Phone</th>
            <th>City</th>
            <th>Open requests</th>
            <th>Last request</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted-foreground">
                No seniors match these filters.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const c = counts.get(r.id);
              return (
                <tr key={r.id} className="border-t">
                  <td className="py-2">
                    <Link href={`/admin/seniors/${r.id}`} className="underline">
                      {r.first_name} {r.last_name}
                    </Link>
                  </td>
                  <td>{r.phone}</td>
                  <td>{r.city}</td>
                  <td>{c?.openRequests ?? 0}</td>
                  <td>{c?.lastRequestDate ?? "—"}</td>
                  <td className="space-x-1">
                    {r.archived_at ? <StatusBadge variant="archived">Archived</StatusBadge> : null}
                    {r.lat === null ? (
                      <StatusBadge variant="not-geocoded">No location</StatusBadge>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test**

Run:
```bash
npm run dev
```
Sign in as `admin@local.test` and visit `/admin/seniors`. Expected: the page renders with an empty table or with seed data.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/seniors/page.tsx
git commit -m "feat(seniors): /admin/seniors list page with filters"
```

---

## Task 18: Detail page — edit form + inline map + danger zone

**Files:**
- Create: `app/(admin)/admin/seniors/[id]/senior-edit.tsx`
- Create: `app/(admin)/admin/seniors/[id]/danger-zone.tsx`
- Create: `app/(admin)/admin/seniors/[id]/page.tsx`

- [ ] **Step 1: Implement the danger zone client component**

Create `app/(admin)/admin/seniors/[id]/danger-zone.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  archiveSenior,
  unarchiveSenior,
  permanentlyDeleteSenior,
} from "../actions";

type Props = {
  id: string;
  fullName: string;
  archived: boolean;
};

export function DangerZone({ id, fullName, archived }: Props) {
  const [isPending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-10 rounded-md border border-red-200 p-4">
      <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {archived ? (
          <>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => startTransition(() => unarchiveSenior(id))}
            >
              Unarchive
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Permanently delete</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Permanently delete {fullName}?</DialogTitle>
                <DialogDescription>
                  This removes the senior and ALL their service requests and notifications.
                  Type <strong>{fullName}</strong> to confirm.
                </DialogDescription>
                <Input
                  className="mt-3"
                  placeholder={fullName}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
                {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    disabled={isPending || typed !== fullName}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        try {
                          await permanentlyDeleteSenior(id, typed);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Failed");
                        }
                      })
                    }
                  >
                    Delete forever
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => archiveSenior(id))}
          >
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the edit form + map**

Create `app/(admin)/admin/seniors/[id]/senior-edit.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MapView, type MapPin } from "@/components/map/MapView";
import { PROVINCES } from "@/lib/constants/provinces";
import { updateSenior } from "../actions";

type Senior = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  province: string;
  postal_code: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
};

export function SeniorEdit({ senior }: { senior: Senior }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [province, setProvince] = useState(senior.province);
  const [lat, setLat] = useState<number | null>(senior.lat);
  const [lng, setLng] = useState<number | null>(senior.lng);
  const [manualOverride, setManualOverride] = useState(false);

  const pins: MapPin[] =
    lat != null && lng != null
      ? [{ id: senior.id, lat, lng }]
      : [];

  return (
    <form
      action={(fd) => {
        setError(null);
        fd.set("province", province);
        if (lat != null) fd.set("lat", String(lat));
        if (lng != null) fd.set("lng", String(lng));
        fd.set("manual_pin_override", manualOverride ? "true" : "false");
        startTransition(async () => {
          try {
            await updateSenior(senior.id, fd);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
          }
        });
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="first_name" defaultValue={senior.first_name} required />
          <Field label="Last name" name="last_name" defaultValue={senior.last_name} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" name="phone" defaultValue={senior.phone} required />
          <Field label="Email" name="email" defaultValue={senior.email ?? ""} />
        </div>
        <Field
          label="Address line 1"
          name="address_line1"
          defaultValue={senior.address_line1}
          required
        />
        <Field
          label="Address line 2"
          name="address_line2"
          defaultValue={senior.address_line2 ?? ""}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" name="city" defaultValue={senior.city} required />
          <div>
            <Label>Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVINCES.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="Postal code"
            name="postal_code"
            defaultValue={senior.postal_code}
            required
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea name="notes" defaultValue={senior.notes ?? ""} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Location</Label>
        {pins.length > 0 ? null : (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Not geocoded. Enter coordinates manually or use “Drop pin at map center” below.
          </p>
        )}
        <MapView
          pins={pins}
          draggable
          className="h-80 w-full rounded-md border"
          initialCenter={lat != null && lng != null ? [lng, lat] : undefined}
          initialZoom={lat != null && lng != null ? 14 : 10}
          onPinDrag={(newLat, newLng) => {
            setLat(newLat);
            setLng(newLng);
            setManualOverride(true);
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Latitude</Label>
            <Input
              type="number"
              step="any"
              value={lat ?? ""}
              onChange={(e) => {
                setLat(e.target.value === "" ? null : Number(e.target.value));
                setManualOverride(true);
              }}
            />
          </div>
          <div>
            <Label>Longitude</Label>
            <Input
              type="number"
              step="any"
              value={lng ?? ""}
              onChange={(e) => {
                setLng(e.target.value === "" ? null : Number(e.target.value));
                setManualOverride(true);
              }}
            />
          </div>
        </div>
      </div>

      <div className="col-span-full flex items-center justify-end gap-2 border-t pt-4">
        {error ? <p className="mr-auto text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} />
    </div>
  );
}
```

- [ ] **Step 3: Implement the detail page**

Create `app/(admin)/admin/seniors/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSenior } from "@/lib/db/queries/seniors";
import { SeniorEdit } from "./senior-edit";
import { DangerZone } from "./danger-zone";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function SeniorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const senior = await getSenior(supabase, id);
  if (!senior) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/seniors" className="text-sm underline">
          ← Back to seniors
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h2 className="text-xl font-semibold">
            {senior.first_name} {senior.last_name}
          </h2>
          {senior.archived_at ? <StatusBadge variant="archived">Archived</StatusBadge> : null}
          {senior.lat === null ? (
            <StatusBadge variant="not-geocoded">No location</StatusBadge>
          ) : null}
        </div>
      </div>

      <SeniorEdit senior={senior} />

      <section>
        <h3 className="text-sm font-semibold">Related activity</h3>
        <p className="text-sm text-muted-foreground">
          No requests yet. (Service requests ship in the next sub-project.)
        </p>
      </section>

      <DangerZone
        id={senior.id}
        fullName={`${senior.first_name} ${senior.last_name}`}
        archived={senior.archived_at !== null}
      />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + smoke-test**

Run: `npm run typecheck`
Then in the running dev server, create a senior on `/admin/seniors/new`, verify redirect to `/admin/seniors/[id]`, confirm inline map renders and pin drag works, try archive and unarchive.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/admin/seniors/\[id\]/page.tsx app/\(admin\)/admin/seniors/\[id\]/senior-edit.tsx app/\(admin\)/admin/seniors/\[id\]/danger-zone.tsx
git commit -m "feat(seniors): detail page with inline edit, draggable map, danger zone"
```

---

## Task 19: /api/geocode route handler

**Files:**
- Create: `app/api/geocode/route.ts`

- [ ] **Step 1: Implement**

Create `app/api/geocode/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/auth/roles";
import { geocodeAddress } from "@/lib/mapbox/geocode";

export async function POST(request: Request) {
  const role = await getUserRole();
  if (role.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const body = (await request.json()) as { address?: string };
  if (!body.address || typeof body.address !== "string") {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  const result = await geocodeAddress(body.address);
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/geocode/route.ts
git commit -m "feat(api): admin-only single-address geocode endpoint"
```

---

## Task 20: MSW helper + /api/import/seniors route handler

**Files:**
- Create: `tests/integration/msw-mapbox.ts`
- Create: `app/api/import/seniors/route.ts`

- [ ] **Step 1: Implement the MSW helper**

Create `tests/integration/msw-mapbox.ts`:

```ts
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export type StubMap = Record<
  string,
  { features: Array<{ center: [number, number]; place_name: string }> }
>;

export function makeMapboxServer(stubs: StubMap) {
  return setupServer(
    http.get("https://api.mapbox.com/geocoding/v5/mapbox.places/:query.json", ({ params }) => {
      const raw = decodeURIComponent(params.query as string);
      const hit = stubs[raw] ?? stubs[Object.keys(stubs).find((k) => raw.includes(k)) ?? "__none__"];
      return HttpResponse.json(hit ?? { features: [] });
    }),
  );
}
```

- [ ] **Step 2: Implement the route handler**

Create `app/api/import/seniors/route.ts`:

```ts
import { NextResponse } from "next/server";
import pMap from "p-map";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSeniorsCsv, type ParsedRow } from "@/lib/csv/parse-seniors";
import { buildErrorReport } from "@/lib/csv/error-report";
import { geocodeAddress } from "@/lib/mapbox/geocode";
import { insertSeniorsMany } from "@/lib/db/queries/seniors";

type PreviewRow = {
  rowNumber: number;
  errors: string[];
  data: ParsedRow["data"];
  geocode: { lat: number; lng: number } | null;
  raw: Record<string, string>;
};

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const form = await request.formData();
  const step = form.get("step");

  if (step === "preview") {
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const text = await file.text();
    const rows = parseSeniorsCsv(text);
    const geocoded = await pMap(
      rows,
      async (r): Promise<PreviewRow> => {
        if (r.errors.length > 0) {
          return { ...r, geocode: null };
        }
        const full = `${r.data.address_line1}, ${r.data.city}, ${r.data.province}, ${r.data.postal_code}, Canada`;
        const geo = await geocodeAddress(full);
        return {
          rowNumber: r.rowNumber,
          errors: [],
          data: r.data,
          raw: r.raw,
          geocode: geo.ok ? { lat: geo.lat, lng: geo.lng } : null,
        };
      },
      { concurrency: 5 },
    );
    const summary = {
      total: geocoded.length,
      valid: geocoded.filter((r) => r.errors.length === 0 && r.geocode).length,
      geocodeFailed: geocoded.filter((r) => r.errors.length === 0 && !r.geocode).length,
      invalid: geocoded.filter((r) => r.errors.length > 0).length,
    };
    return NextResponse.json({ rows: geocoded, summary });
  }

  if (step === "commit") {
    const payload = form.get("payload");
    if (typeof payload !== "string") {
      return NextResponse.json({ error: "payload required" }, { status: 400 });
    }
    const parsed = JSON.parse(payload) as {
      rows: PreviewRow[];
      confirmed: number[];
    };
    const supabase = await createSupabaseServerClient();
    const toInsert: Array<{
      first_name: string;
      last_name: string;
      phone: string;
      email: string | null;
      address_line1: string;
      address_line2: string | null;
      city: string;
      province: string;
      postal_code: string;
      notes: string | null;
      lat: number | null;
      lng: number | null;
      created_by: string;
    }> = [];
    const rejected: Array<{ rowNumber: number; errors: string[]; raw: Record<string, string> }> = [];
    for (const r of parsed.rows) {
      const isConfirmed = parsed.confirmed.includes(r.rowNumber);
      if (!isConfirmed) continue;
      if (r.errors.length > 0 || !r.data) {
        rejected.push({ rowNumber: r.rowNumber, errors: r.errors, raw: r.raw });
        continue;
      }
      toInsert.push({
        first_name: r.data.first_name,
        last_name: r.data.last_name,
        phone: r.data.phone,
        email: r.data.email ?? null,
        address_line1: r.data.address_line1,
        address_line2: r.data.address_line2 ?? null,
        city: r.data.city,
        province: r.data.province,
        postal_code: r.data.postal_code,
        notes: r.data.notes ?? null,
        lat: r.geocode?.lat ?? null,
        lng: r.geocode?.lng ?? null,
        created_by: admin.userId,
      });
    }
    const inserted = await insertSeniorsMany(supabase, toInsert);
    const errorCsv = buildErrorReport(rejected);
    return NextResponse.json({
      inserted,
      failed: rejected.length,
      errorCsv: errorCsv ? Buffer.from(errorCsv, "utf8").toString("base64") : null,
    });
  }

  return NextResponse.json({ error: "invalid step" }, { status: 400 });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add app/api/import/seniors/route.ts tests/integration/msw-mapbox.ts
git commit -m "feat(api): seniors CSV import preview+commit route, msw mapbox helper"
```

---

## Task 21: Integration test — CSV import preview (MSW)

**Files:**
- Create: `tests/fixtures/seniors-valid.csv`
- Create: `tests/fixtures/seniors-mixed.csv`
- Create: `tests/integration/seniors-import-preview.test.ts`

- [ ] **Step 1: Write fixtures**

Create `tests/fixtures/seniors-valid.csv`:

```csv
first_name,last_name,phone,email,address_line1,address_line2,city,province,postal_code,notes
Margaret,Chen,6045550134,m@x.com,1245 Robson St,,Vancouver,BC,V6E 1B9,
Bruce,Wayne,6045550135,b@x.com,900 W Georgia St,,Vancouver,BC,V6C 2W6,
Olivia,Park,6045550136,o@x.com,800 Hornby St,,Vancouver,BC,V6Z 2C5,
```

Create `tests/fixtures/seniors-mixed.csv`:

```csv
first_name,last_name,phone,email,address_line1,address_line2,city,province,postal_code,notes
Good,One,6045550140,,1245 Robson St,,Vancouver,BC,V6E 1B9,
Good,Two,6045550141,,900 W Georgia St,,Vancouver,BC,V6C 2W6,
Good,Three,6045550142,,800 Hornby St,,Vancouver,BC,V6Z 2C5,
Good,Four,6045550143,,1 Unreachable Rd,,Vancouver,BC,V6E 1B9,
,NoFirst,6045550144,,1 Main St,,Vancouver,BC,V6E 1B9,
Bad,Phone,123,,1 Main St,,Vancouver,BC,V6E 1B9,
```

- [ ] **Step 2: Write the integration test**

Create `tests/integration/seniors-import-preview.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSeniorsCsv } from "@/lib/csv/parse-seniors";
import { geocodeAddress } from "@/lib/mapbox/geocode";
import { makeMapboxServer } from "./msw-mapbox";

const fixturePath = path.resolve(__dirname, "../fixtures/seniors-mixed.csv");

const server = makeMapboxServer({
  "1245 Robson St": {
    features: [{ center: [-123.1265, 49.2845], place_name: "1245 Robson St, Vancouver" }],
  },
  "900 W Georgia St": {
    features: [{ center: [-123.1197, 49.2827], place_name: "900 W Georgia St, Vancouver" }],
  },
  "800 Hornby St": {
    features: [{ center: [-123.1232, 49.2807], place_name: "800 Hornby St, Vancouver" }],
  },
  "Unreachable": { features: [] },
});

beforeAll(() => {
  process.env.MAPBOX_SECRET_TOKEN = "sk.test";
  server.listen();
});
afterAll(() => server.close());

describe("CSV import preview logic", () => {
  it("classifies rows into valid, geocode-failed, and invalid", async () => {
    const csv = readFileSync(fixturePath, "utf8");
    const parsed = parseSeniorsCsv(csv);

    const results = await Promise.all(
      parsed.map(async (r) => {
        if (r.errors.length > 0) return { ...r, geocode: null as { lat: number; lng: number } | null };
        const full = `${r.data.address_line1}, ${r.data.city}, ${r.data.province}, ${r.data.postal_code}, Canada`;
        const geo = await geocodeAddress(full);
        return {
          ...r,
          geocode: geo.ok ? { lat: geo.lat, lng: geo.lng } : null,
        };
      }),
    );

    const valid = results.filter((r) => r.errors.length === 0 && r.geocode);
    const warning = results.filter((r) => r.errors.length === 0 && !r.geocode);
    const invalid = results.filter((r) => r.errors.length > 0);

    expect(valid).toHaveLength(3);
    expect(warning).toHaveLength(1);
    expect(invalid).toHaveLength(2);
    expect(invalid[0].errors.join(",")).toMatch(/first_name/);
    expect(invalid[1].errors.join(",")).toMatch(/phone/);
  });
});
```

- [ ] **Step 3: Run the test**

Run:
```bash
npm run test:integration -- seniors-import-preview
```
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/seniors-valid.csv tests/fixtures/seniors-mixed.csv tests/integration/seniors-import-preview.test.ts
git commit -m "test(import): preview classifies valid/geocode-failed/invalid rows (MSW-mocked Mapbox)"
```

---

## Task 22: Import wizard page + client component

**Files:**
- Create: `app/(admin)/admin/seniors/import/import-wizard.tsx`
- Create: `app/(admin)/admin/seniors/import/page.tsx`

- [ ] **Step 1: Implement the wizard client component**

Create `app/(admin)/admin/seniors/import/import-wizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type PreviewRow = {
  rowNumber: number;
  errors: string[];
  data: unknown;
  raw: Record<string, string>;
  geocode: { lat: number; lng: number } | null;
};
type PreviewResponse = {
  rows: PreviewRow[];
  summary: { total: number; valid: number; geocodeFailed: number; invalid: number };
};
type CommitResponse = {
  inserted: number;
  failed: number;
  errorCsv: string | null;
};

export function ImportWizard() {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onUpload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("step", "preview");
      fd.set("file", file);
      const res = await fetch("/api/import/seniors", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as PreviewResponse;
      const initial = new Set(
        data.rows.filter((r) => r.errors.length === 0).map((r) => r.rowNumber),
      );
      setPreview(data);
      setConfirmed(initial);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (rowNumber: number) => {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const uncheckGeocodeFailed = () => {
    if (!preview) return;
    setConfirmed((prev) => {
      const next = new Set(prev);
      for (const r of preview.rows) {
        if (r.errors.length === 0 && !r.geocode) next.delete(r.rowNumber);
      }
      return next;
    });
  };

  const onCommit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("step", "commit");
      fd.set(
        "payload",
        JSON.stringify({ rows: preview.rows, confirmed: Array.from(confirmed) }),
      );
      const res = await fetch("/api/import/seniors", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as CommitResponse;
      setResult(data);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadErrorCsv = () => {
    if (!result?.errorCsv) return;
    const blob = new Blob([atob(result.errorCsv)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seniors-import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <ol className="flex gap-4 text-sm">
        <li className={step === "upload" ? "font-semibold" : "text-muted-foreground"}>1. Upload</li>
        <li className={step === "preview" ? "font-semibold" : "text-muted-foreground"}>2. Preview</li>
        <li className={step === "done" ? "font-semibold" : "text-muted-foreground"}>3. Result</li>
      </ol>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {step === "upload" ? (
        <div className="space-y-3">
          <a
            href="/templates/seniors-import.csv"
            className="text-sm underline"
            download
          >
            Download template
          </a>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
            disabled={busy}
          />
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <div className="space-y-3">
          <p className="text-sm">
            {preview.summary.valid} will import • {preview.summary.geocodeFailed} with no coordinates •{" "}
            {preview.summary.invalid} rejected
          </p>
          <Button variant="outline" size="sm" onClick={uncheckGeocodeFailed}>
            Uncheck all geocode-failed rows
          </Button>
          <table className="w-full border-collapse text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Include</th>
                <th>Row</th>
                <th>Name</th>
                <th>Address</th>
                <th>Status</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => {
                const isValid = r.errors.length === 0;
                const isGeoFail = isValid && !r.geocode;
                return (
                  <tr
                    key={r.rowNumber}
                    className={isGeoFail ? "bg-amber-50" : !isValid ? "bg-red-50" : ""}
                  >
                    <td className="py-1">
                      <input
                        type="checkbox"
                        disabled={!isValid}
                        checked={confirmed.has(r.rowNumber)}
                        onChange={() => toggle(r.rowNumber)}
                      />
                    </td>
                    <td>{r.rowNumber}</td>
                    <td>
                      {r.raw.first_name} {r.raw.last_name}
                    </td>
                    <td>
                      {r.raw.address_line1}, {r.raw.city}
                    </td>
                    <td>
                      {!isValid ? "✗ invalid" : isGeoFail ? "⚠ no coords" : "✓ geocoded"}
                    </td>
                    <td className="text-xs">{r.errors.join("; ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep("upload")} disabled={busy}>
              Back
            </Button>
            <Button onClick={onCommit} disabled={busy || confirmed.size === 0}>
              Import {confirmed.size} row(s)
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="space-y-2">
          <p className="text-sm">
            Imported {result.inserted}. {result.failed > 0 ? `${result.failed} failed.` : ""}
          </p>
          {result.errorCsv ? (
            <Button variant="outline" onClick={downloadErrorCsv}>
              Download error report
            </Button>
          ) : null}
          <div>
            <a href="/admin/seniors" className="text-sm underline">
              Back to seniors list
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Implement the page**

Create `app/(admin)/admin/seniors/import/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/seniors" className="text-sm underline">
          ← Back to seniors
        </Link>
        <h2 className="mt-2 text-xl font-semibold">Import seniors from CSV</h2>
      </div>
      <ImportWizard />
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test**

In the running dev server, visit `/admin/seniors/import`, download the template, fill a row or two, upload, confirm the preview, and verify the success page.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/admin/seniors/import/page.tsx app/\(admin\)/admin/seniors/import/import-wizard.tsx
git commit -m "feat(seniors): CSV import wizard — upload → preview → commit"
```

---

## Task 23: Map page — `/admin/map`

**Files:**
- Create: `app/(admin)/admin/map/page.tsx`

- [ ] **Step 1: Implement**

Create `app/(admin)/admin/map/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSeniors } from "@/lib/db/queries/seniors";
import { MapView, type MapPin } from "@/components/map/MapView";

type SearchParams = Promise<{ city?: string }>;

export default async function AdminMapPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const activeResult = await listSeniors(supabase, { limit: 1000, city: sp.city });
  const active = activeResult.rows;
  const geocoded = active.filter((s) => s.lat !== null && s.lng !== null);
  const missing = active.length - geocoded.length;

  const cities = Array.from(new Set(active.map((s) => s.city))).sort();
  const pins: MapPin[] = geocoded.map((s) => ({
    id: s.id,
    lat: s.lat as number,
    lng: s.lng as number,
    popupHtml: `<div style="font-size:13px">
      <strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong><br/>
      ${escapeHtml(s.city)}<br/>
      <a href="/admin/seniors/${s.id}">Open detail →</a>
    </div>`,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Seniors map</h2>
        {missing > 0 ? (
          <Link
            href="/admin/seniors?not_geocoded=true"
            className="text-sm text-amber-700 underline"
          >
            {missing} seniors not shown (no coordinates) — fix
          </Link>
        ) : null}
      </div>
      <form action="/admin/map" className="flex items-end gap-2">
        <label className="text-sm">
          City
          <select
            name="city"
            defaultValue={sp.city ?? ""}
            className="ml-2 h-9 rounded-md border px-2 text-sm"
          >
            <option value="">All</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button className="h-9 rounded-md border px-3 text-sm" type="submit">
          Apply
        </button>
      </form>
      <MapView pins={pins} cluster className="h-[70vh] w-full rounded-md border" />
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 2: Smoke-test**

In the running dev server visit `/admin/map`. Expected: map loads, pins render for any geocoded seniors, city filter narrows the set. If `NEXT_PUBLIC_MAPBOX_TOKEN` is not set, the component logs and shows an empty map container — set it in `.env.local`.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/map/page.tsx
git commit -m "feat(map): /admin/map seniors-only map with city filter and clustering"
```

---

## Task 24: E2E — admin senior lifecycle

**Files:**
- Create: `tests/e2e/admin-senior-lifecycle.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `tests/e2e/admin-senior-lifecycle.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("admin creates, edits, archives, and unarchives a senior", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/admin/seniors/new");
  await page.getByLabel("First name").fill("Margaret");
  await page.getByLabel("Last name").fill("Chen");
  await page.getByLabel("Phone").fill("(604) 555-0134");
  await page.getByLabel("Address line 1").fill("1245 Robson St");
  await page.getByLabel("City").fill("Vancouver");
  await page.getByLabel("Postal code").fill("V6E 1B9");
  await page.getByRole("button", { name: /create senior/i }).click();

  await expect(page).toHaveURL(/\/admin\/seniors\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: /Margaret Chen/ })).toBeVisible();

  await page.getByLabel("City").fill("Burnaby");
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByLabel("City")).toHaveValue("Burnaby");

  await page.getByRole("button", { name: /^archive$/i }).click();

  await page.goto("/admin/seniors");
  await expect(page.getByText("Margaret Chen")).toHaveCount(0);

  await page.goto("/admin/seniors?archived=true");
  await expect(page.getByText("Margaret Chen")).toBeVisible();

  await page.getByRole("link", { name: /Margaret Chen/ }).click();
  await page.getByRole("button", { name: /unarchive/i }).click();

  await page.goto("/admin/seniors");
  await expect(page.getByText("Margaret Chen")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E test**

Ensure the dev server is running on port 3000 and local Supabase is up, seeded with the dev admin.

Run:
```bash
npm run test:e2e -- admin-senior-lifecycle
```
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-senior-lifecycle.spec.ts
git commit -m "test(e2e): admin creates, edits, archives, and unarchives a senior"
```

---

## Task 25: Full verification

**Files:**
- None modified

- [ ] **Step 1: Run the whole test suite**

Run in sequence:
```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
```
Expected: all pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: successful Next.js build.

- [ ] **Step 3: No commit**

Verification only. If anything fails, treat it as a new task (diagnose, fix, re-verify) before moving on.

---

## Plan self-review

Spec coverage — every spec section maps to at least one task:

- Objective + scope — Tasks 8, 14, 17, 18, 22, 23 (all the surfaces)
- Migration (archived_at + cascade RPC) — Task 2
- RLS (no change, extend test) — Task 10
- Routes table — covered by Tasks 16–19, 22, 23
- List + filters + search — Task 17
- Create form — Tasks 15, 16
- Detail with inline map + re-geocode rule + manual override — Tasks 14, 18
- Archive / unarchive / permanent-delete with typed-name — Tasks 14, 18
- CSV import three-step wizard + error-report CSV — Tasks 5, 6, 7, 20, 22
- `/admin/map` with clustering and city filter + not-shown banner — Tasks 12, 23
- Validation (postal, phone, Zod) + provinces — Tasks 3, 4
- Query helpers — Task 8
- Server actions — Task 14
- Route handlers — Tasks 19, 20
- MapView component — Task 12
- UI primitives — Task 13
- Unit tests — Tasks 3, 4, 5, 6, 13
- Integration tests — Tasks 9, 10, 11, 21
- E2E — Task 24
- Dependencies — Task 1
- Final verification — Task 25

Placeholders — none. Every step ships code.

Type consistency — `SeniorsInsert`/`SeniorsUpdate` come from generated types regenerated in Task 2, then used in Task 8 (helpers) and Task 14 (actions). `ParsedRow` is defined in Task 5 and consumed unchanged in Task 20. `MapPin` is defined in Task 12 and consumed unchanged in Tasks 18 and 23. `PreviewRow` is defined in Task 20 and mirrored exactly in Task 22. `seniorCreateSchema` / `seniorUpdateSchema` / `seniorRowSchema` are defined in Task 4 and consumed consistently downstream. Action names are stable: `createSenior`, `updateSenior`, `archiveSenior`, `unarchiveSenior`, `permanentlyDeleteSenior`.

One small note: the new-senior form redirects via the server action's `redirect()`, which throws a special error that `startTransition` will surface — that behavior is intentional and matches the existing signup/login flows in this codebase.
