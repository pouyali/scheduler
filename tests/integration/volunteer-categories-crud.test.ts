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
