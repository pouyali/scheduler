import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";

describe("DB triggers", () => {
  let admin: { userId: string };
  let volunteer: { userId: string };

  beforeAll(async () => {
    admin = await createAdminUser("admin-trig@test.com");
    volunteer = await createVolunteerUser("vol-trig@test.com", "pending");
  });

  it("updated_at auto-advances on update", async () => {
    const svc = adminClient();
    const { data: before } = await svc
      .from("volunteers")
      .select("updated_at")
      .eq("id", volunteer.userId)
      .single();
    await new Promise((r) => setTimeout(r, 20));
    await svc.from("volunteers").update({ service_area: "Ottawa" }).eq("id", volunteer.userId);
    const { data: after } = await svc
      .from("volunteers")
      .select("updated_at")
      .eq("id", volunteer.userId)
      .single();
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );
  });

  it("approved_at auto-sets on status -> active", async () => {
    const svc = adminClient();
    await svc.from("volunteers").update({ status: "active" }).eq("id", volunteer.userId);
    const { data } = await svc
      .from("volunteers")
      .select("approved_at")
      .eq("id", volunteer.userId)
      .single();
    expect(data!.approved_at).not.toBeNull();
  });

  it("supersede trigger invalidates open tokens on accept", async () => {
    const svc = adminClient();
    const { data: senior } = await svc
      .from("seniors")
      .insert({
        first_name: "S",
        last_name: "Trig",
        phone: "555-1111",
        address_line1: "1",
        city: "C",
        province: "ON",
        postal_code: "M1M 1M1",
        created_by: admin.userId,
      })
      .select()
      .single();
    const { data: request } = await svc
      .from("service_requests")
      .insert({
        senior_id: senior!.id,
        category: "transportation",
        requested_date: "2026-05-10",
        created_by: admin.userId,
      })
      .select()
      .single();

    const volB = await createVolunteerUser("vol-trig-b@test.com", "active");

    await svc.from("response_tokens").insert([
      {
        token: "tok-1",
        request_id: request!.id,
        volunteer_id: volunteer.userId,
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      },
      {
        token: "tok-2",
        request_id: request!.id,
        volunteer_id: volB.userId,
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      },
    ]);

    await svc
      .from("service_requests")
      .update({ status: "accepted", assigned_volunteer_id: volunteer.userId })
      .eq("id", request!.id);

    const { data: tokens } = await svc
      .from("response_tokens")
      .select("*")
      .eq("request_id", request!.id)
      .order("token");
    expect(tokens!.every((t) => t.used_at !== null)).toBe(true);
    const superseded = tokens!.filter((t) => t.action === "superseded");
    expect(superseded.length).toBeGreaterThanOrEqual(1);
  });
});
