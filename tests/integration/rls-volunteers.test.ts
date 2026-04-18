import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, createVolunteerUser, signIn } from "./helpers";

describe("RLS: volunteers", () => {
  let volunteerA: { userId: string; email: string };
  let volunteerB: { userId: string; email: string };

  beforeAll(async () => {
    volunteerA = await createVolunteerUser("vol-a@test.com", "active");
    volunteerB = await createVolunteerUser("vol-b@test.com", "active");
  });

  it("volunteer can read own row", async () => {
    const client = await signIn(volunteerA.email);
    const { data, error } = await client.from("volunteers").select("*").eq("id", volunteerA.userId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("volunteer cannot read another volunteer's row", async () => {
    const client = await signIn(volunteerA.email);
    const { data } = await client.from("volunteers").select("*").eq("id", volunteerB.userId);
    expect(data).toEqual([]);
  });

  it("volunteer cannot read seniors", async () => {
    const admin = adminClient();
    const { data: inserted, error: insErr } = await admin
      .from("seniors")
      .insert({
        first_name: "S",
        last_name: "X",
        phone: "555-0000",
        address_line1: "1",
        city: "C",
        province: "ON",
        postal_code: "M1M 1M1",
      })
      .select()
      .single();
    expect(insErr).toBeNull();
    expect(inserted).not.toBeNull();

    const client = await signIn(volunteerA.email);
    const { data } = await client.from("seniors").select("*");
    expect(data).toEqual([]);
  });

  it("volunteer cannot read response_tokens", async () => {
    const client = await signIn(volunteerA.email);
    const { data } = await client.from("response_tokens").select("*");
    expect(data).toEqual([]);
  });
});
