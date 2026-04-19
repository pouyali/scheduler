import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";

async function seedRequest(opts: {
  seniorCity?: string;
  category?: string;
  requestedDaysAhead?: number;
}) {
  const admin = adminClient();
  const ts = Date.now();
  const a = await createAdminUser(`a-${ts}@test.local`);
  const v1 = await createVolunteerUser(`v1-${ts}@test.local`, "active");
  const v2 = await createVolunteerUser(`v2-${ts}@test.local`, "active");

  const { data: senior, error: sErr } = await admin.from("seniors").insert({
    first_name: "Jane",
    last_name: "Doe",
    phone: "416-555-0000",
    address_line1: "1 Main St",
    city: opts.seniorCity ?? "Toronto",
    province: "ON",
    postal_code: "M1A 1A1",
    created_by: a.userId,
  }).select().single();
  if (sErr) throw sErr;

  const requestedDate = new Date();
  requestedDate.setDate(requestedDate.getDate() + (opts.requestedDaysAhead ?? 7));

  const { data: req, error: rErr } = await admin.from("service_requests").insert({
    senior_id: senior.id,
    category: opts.category ?? "transportation",
    priority: "normal",
    requested_at: requestedDate.toISOString(),
    description: "Test request",
    created_by: a.userId,
    status: "notified",
  }).select().single();
  if (rErr) throw rErr;

  const expiresAt = new Date(requestedDate);
  expiresAt.setHours(23, 59, 59, 999);

  const makeToken = async (volunteerId: string, token: string) => {
    const { error } = await admin.from("response_tokens").insert({
      token,
      request_id: req.id,
      volunteer_id: volunteerId,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;
    await admin.from("notifications").insert({
      request_id: req.id,
      volunteer_id: volunteerId,
      channel: "email",
      status: "sent",
      event_type: "invite",
    });
  };

  const t1 = `tok-${ts}-1`;
  const t2 = `tok-${ts}-2`;
  await makeToken(v1.userId, t1);
  await makeToken(v2.userId, t2);

  return { admin, request: req, senior, v1, v2, t1, t2 };
}

describe("consume_response_token", () => {
  test("accept transitions request, marks token used, supersedes siblings", async () => {
    const { admin, request, v1, t1, t2 } = await seedRequest({});
    const { data, error } = await admin.rpc("consume_response_token", {
      p_token: t1,
      p_action: "accept",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ outcome: "accepted", request_id: request.id });

    const { data: req } = await admin.from("service_requests").select("*").eq("id", request.id).single();
    expect(req?.status).toBe("accepted");
    expect(req?.assigned_volunteer_id).toBe(v1.userId);

    const { data: tok1 } = await admin.from("response_tokens").select("*").eq("token", t1).single();
    expect(tok1?.action).toBe("accept");
    expect(tok1?.used_at).not.toBeNull();

    const { data: tok2 } = await admin.from("response_tokens").select("*").eq("token", t2).single();
    expect(tok2?.action).toBe("superseded");
    expect(tok2?.used_at).not.toBeNull();
  });

  test("second accept on same request returns already_filled", async () => {
    const { admin, request, t1, t2 } = await seedRequest({});
    await admin.rpc("consume_response_token", { p_token: t1, p_action: "accept" });
    const { data } = await admin.rpc("consume_response_token", {
      p_token: t2,
      p_action: "accept",
    });
    expect(data).toMatchObject({ outcome: "already_filled", request_id: request.id });
  });

  test("valid unused token for a cancelled request returns already_filled", async () => {
    const { admin, request, t1 } = await seedRequest({});
    await admin.from("service_requests").update({ status: "cancelled" }).eq("id", request.id);
    const { data } = await admin.rpc("consume_response_token", {
      p_token: t1,
      p_action: "accept",
    });
    expect(data).toMatchObject({ outcome: "already_filled", request_id: request.id });
  });

  test("decline marks token used, does not change request status", async () => {
    const { admin, request, t1 } = await seedRequest({});
    const { data } = await admin.rpc("consume_response_token", {
      p_token: t1,
      p_action: "decline",
    });
    expect(data).toMatchObject({ outcome: "declined", request_id: request.id });
    const { data: req } = await admin.from("service_requests").select("status").eq("id", request.id).single();
    expect(req?.status).toBe("notified");
  });

  test("expired token returns expired", async () => {
    const { admin, request, v1 } = await seedRequest({});
    const token = `expired-${Date.now()}`;
    const past = new Date(Date.now() - 60_000).toISOString();
    await admin.from("response_tokens").insert({
      token,
      request_id: request.id,
      volunteer_id: v1.userId,
      expires_at: past,
    });
    const { data } = await admin.rpc("consume_response_token", { p_token: token, p_action: "accept" });
    expect(data).toMatchObject({ outcome: "expired" });
  });

  test("reused token returns invalid", async () => {
    const { admin, t1 } = await seedRequest({});
    await admin.rpc("consume_response_token", { p_token: t1, p_action: "decline" });
    const { data } = await admin.rpc("consume_response_token", { p_token: t1, p_action: "accept" });
    expect(data).toMatchObject({ outcome: "invalid" });
  });

  test("unknown token returns invalid", async () => {
    const { admin } = await seedRequest({});
    const { data } = await admin.rpc("consume_response_token", { p_token: "does-not-exist", p_action: "accept" });
    expect(data).toMatchObject({ outcome: "invalid" });
  });

  test("invalid action returns invalid", async () => {
    const { admin, t1 } = await seedRequest({});
    const { data } = await admin.rpc("consume_response_token", { p_token: t1, p_action: "nope" });
    expect(data).toMatchObject({ outcome: "invalid" });
  });
});
