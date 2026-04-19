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
          requested_at: "2026-05-01T17:00:00.000Z",
          description: "x",
          created_by: admin.userId,
        },
        {
          senior_id: senior!.id,
          category: "companionship",
          priority: "normal",
          requested_at: "2026-05-02T17:00:00.000Z",
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
