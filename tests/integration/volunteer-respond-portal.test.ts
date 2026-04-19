import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";
import { _respondFromPortal } from "@/app/(volunteer)/volunteer/actions";

async function seed() {
  const admin = adminClient();
  const ts = Date.now() + Math.random();
  const a = await createAdminUser(`a-${ts}@t.local`);
  const v = await createVolunteerUser(`v-${ts}@t.local`, "active");
  const { data: s } = await admin.from("seniors").insert({
    first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
    province: "ON", postal_code: "M1A1A1", created_by: a.userId,
  }).select().single();
  const { data: r } = await admin.from("service_requests").insert({
    senior_id: s!.id, category: "transportation", priority: "normal",
    requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
  }).select().single();
  const token = `tok-${ts}-${Math.random()}`;
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

  test("returns invalid when volunteer has no active token for the request", async () => {
    const admin = adminClient();
    const ts = Date.now() + Math.random();
    const a = await createAdminUser(`a2-${ts}@t.local`);
    const v = await createVolunteerUser(`v2-${ts}@t.local`, "active");
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();
    const { data: r } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
    }).select().single();
    // No token created for this volunteer.
    const outcome = await _respondFromPortal({ requestId: r!.id, volunteerId: v.userId, action: "accept" });
    expect(outcome).toBe("invalid");
  });
});
