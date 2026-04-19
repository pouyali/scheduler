import { describe, it, expect, beforeEach } from "vitest";
import {
  adminClient,
  anonClient,
  createVolunteerUser,
  signIn,
  truncate,
} from "./helpers";

const admin = adminClient();

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
}

function uniqueSlug(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

describe("RLS: volunteer_categories", () => {
  beforeEach(async () => {
    // Wipe both tables so each test starts from a clean slate.
    // auth.users is not cleared here; unique emails per test avoid collisions
    // on repeated `npm run test:integration` runs (the setup hook resets the
    // whole DB once at suite start, so auth.users is empty initially).
    await truncate(admin, ["volunteer_categories", "volunteers"]);
  });

  it("volunteer can select categories", async () => {
    const slug = uniqueSlug("read");
    const { error: insErr } = await admin
      .from("volunteer_categories")
      .insert({ slug, name: "Readable" });
    expect(insErr).toBeNull();

    const volunteer = await createVolunteerUser(uniqueEmail("vol-read"), "active");
    const client = await signIn(volunteer.email);

    const { data, error } = await client.from("volunteer_categories").select("*");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).some((r) => r.slug === slug)).toBe(true);
  });

  it("volunteer cannot insert a category", async () => {
    const volunteer = await createVolunteerUser(uniqueEmail("vol-ins"), "active");
    const client = await signIn(volunteer.email);

    const slug = uniqueSlug("forbidden_ins");
    const { data } = await client
      .from("volunteer_categories")
      .insert({ slug, name: "Should Not Insert" })
      .select();
    // RLS may return an error OR silently affect zero rows.
    expect(data ?? []).toHaveLength(0);

    const { data: adminCheck } = await admin
      .from("volunteer_categories")
      .select("id")
      .eq("slug", slug);
    expect(adminCheck ?? []).toHaveLength(0);
  });

  it("volunteer cannot update a category", async () => {
    const slug = uniqueSlug("upd");
    const original = "Original Name";
    const { data: inserted, error: insErr } = await admin
      .from("volunteer_categories")
      .insert({ slug, name: original })
      .select()
      .single();
    expect(insErr).toBeNull();
    expect(inserted).not.toBeNull();

    const volunteer = await createVolunteerUser(uniqueEmail("vol-upd"), "active");
    const client = await signIn(volunteer.email);

    await client
      .from("volunteer_categories")
      .update({ name: "Hacked Name" })
      .eq("id", inserted!.id);

    const { data: after } = await admin
      .from("volunteer_categories")
      .select("name")
      .eq("id", inserted!.id)
      .single();
    expect(after?.name).toBe(original);
  });

  it("volunteer cannot delete a category", async () => {
    const slug = uniqueSlug("del");
    const { data: inserted, error: insErr } = await admin
      .from("volunteer_categories")
      .insert({ slug, name: "Keep Me" })
      .select()
      .single();
    expect(insErr).toBeNull();
    expect(inserted).not.toBeNull();

    const volunteer = await createVolunteerUser(uniqueEmail("vol-del"), "active");
    const client = await signIn(volunteer.email);

    await client.from("volunteer_categories").delete().eq("id", inserted!.id);

    const { data: after } = await admin
      .from("volunteer_categories")
      .select("id")
      .eq("id", inserted!.id);
    expect(after ?? []).toHaveLength(1);
  });

  it("unauthenticated cannot select categories", async () => {
    const slug = uniqueSlug("anon");
    const { error: insErr } = await admin
      .from("volunteer_categories")
      .insert({ slug, name: "Admin Only View" });
    expect(insErr).toBeNull();

    const client = anonClient();
    const { data } = await client.from("volunteer_categories").select("*");
    // No SELECT policy for anon → empty result set (or error). Either is acceptable.
    expect(data ?? []).toHaveLength(0);
  });
});
