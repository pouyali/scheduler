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
