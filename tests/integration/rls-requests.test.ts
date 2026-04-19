import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser, signIn } from "./helpers";

describe("RLS: service_requests", () => {
  let admin: { userId: string };
  let volunteerA: { userId: string; email: string };
  let volunteerB: { userId: string; email: string };
  let seniorId: string;
  let requestId: string;

  beforeAll(async () => {
    admin = await createAdminUser("admin-req@test.com");
    volunteerA = await createVolunteerUser("vol-req-a@test.com", "active");
    volunteerB = await createVolunteerUser("vol-req-b@test.com", "active");

    const svc = adminClient();
    const { data: senior, error: sErr } = await svc
      .from("seniors")
      .insert({
        first_name: "S",
        last_name: "X",
        phone: "555-0001",
        address_line1: "1",
        city: "C",
        province: "ON",
        postal_code: "M1M 1M1",
        created_by: admin.userId,
      })
      .select()
      .single();
    if (sErr) throw sErr;
    seniorId = senior.id;

    const { data: req, error: rErr } = await svc
      .from("service_requests")
      .insert({
        senior_id: seniorId,
        category: "transportation",
        requested_at: "2026-05-01T17:00:00.000Z",
        created_by: admin.userId,
      })
      .select()
      .single();
    if (rErr) throw rErr;
    requestId = req.id;

    const { error: nErr } = await svc.from("notifications").insert({
      request_id: requestId,
      volunteer_id: volunteerA.userId,
      channel: "email",
    });
    if (nErr) throw nErr;
  });

  it("notified volunteer can read the request", async () => {
    const client = await signIn(volunteerA.email);
    const { data } = await client.from("service_requests").select("*").eq("id", requestId);
    expect(data).toHaveLength(1);
  });

  it("un-notified volunteer cannot read the request", async () => {
    const client = await signIn(volunteerB.email);
    const { data } = await client.from("service_requests").select("*").eq("id", requestId);
    expect(data).toEqual([]);
  });
});
