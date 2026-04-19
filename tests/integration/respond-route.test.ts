import { describe, test, expect } from "vitest";
import { GET } from "@/app/respond/[token]/route";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";

async function seedTokenFor(action: "accept" | "decline", status: "notified" | "accepted" = "notified") {
  const admin = adminClient();
  const ts = Date.now();
  const a = await createAdminUser(`a-${ts}@t.local`);
  const v = await createVolunteerUser(`v-${ts}@t.local`, "active");
  const { data: s } = await admin.from("seniors").insert({
    first_name: "Jane", last_name: "Doe", phone: "x", address_line1: "1", city: "Toronto",
    province: "ON", postal_code: "M1A1A1", created_by: a.userId,
  }).select().single();
  const { data: r } = await admin.from("service_requests").insert({
    senior_id: s!.id, category: "transportation", priority: "normal",
    requested_at: "2030-01-01T17:00:00.000Z", description: "x", created_by: a.userId, status,
    // The "accepted" constraint requires an assignee when status = "accepted".
    ...(status === "accepted" ? { assigned_volunteer_id: v.userId } : {}),
  }).select().single();
  const token = `tok-${ts}-${Math.random()}`;
  await admin.from("response_tokens").insert({
    token, request_id: r!.id, volunteer_id: v.userId,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await admin.from("notifications").insert({
    request_id: r!.id, volunteer_id: v.userId, channel: "email", status: "sent", event_type: "invite",
  });
  return { token, requestId: r!.id, volunteerId: v.userId, adminId: a.userId, action };
}

function reqFor(token: string, action: "accept" | "decline") {
  return new Request(`http://localhost/respond/${token}?action=${action}`, { method: "GET" });
}

describe("GET /respond/[token]", () => {
  test("valid accept redirects to /respond/[token]/accepted", async () => {
    const { token } = await seedTokenFor("accept");
    const res = await GET(reqFor(token, "accept"), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/respond\/.+\/accepted$/);
  });

  test("valid decline redirects to declined", async () => {
    const { token } = await seedTokenFor("decline");
    const res = await GET(reqFor(token, "decline"), { params: Promise.resolve({ token }) });
    expect(res.headers.get("location")).toMatch(/\/declined$/);
  });

  test("missing action param → invalid", async () => {
    const { token } = await seedTokenFor("accept");
    const res = await GET(
      new Request(`http://localhost/respond/${token}`, { method: "GET" }),
      { params: Promise.resolve({ token }) },
    );
    expect(res.headers.get("location")).toMatch(/\/invalid$/);
  });

  test("unknown token → invalid", async () => {
    const res = await GET(reqFor("nope", "accept"), { params: Promise.resolve({ token: "nope" }) });
    expect(res.headers.get("location")).toMatch(/\/invalid$/);
  });

  test("valid accept against already-accepted request → already-filled", async () => {
    const { token } = await seedTokenFor("accept", "accepted");
    const res = await GET(reqFor(token, "accept"), { params: Promise.resolve({ token }) });
    expect(res.headers.get("location")).toMatch(/\/already-filled$/);
  });
});
