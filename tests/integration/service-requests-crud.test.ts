import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser } from "./helpers";
import {
  listServiceRequests,
  getServiceRequestById,
  createServiceRequest,
  updateServiceRequest,
  cancelServiceRequest,
  reopenServiceRequest,
  markRequestCompleted,
  listRecipientsForRequest,
  countRequestsByStatus,
  countPendingInvitesForVolunteer,
} from "@/lib/db/queries/service-requests";

async function seedSenior() {
  const admin = adminClient();
  const a = await createAdminUser(`admin-${Date.now()}-${Math.random()}@t.local`);
  const { data } = await admin.from("seniors").insert({
    first_name: "Jane", last_name: "Doe", phone: "416-555-0000",
    address_line1: "1 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: a.userId,
  }).select().single();
  return { admin, senior: data!, adminId: a.userId };
}

describe("service_requests queries", () => {
  test("create + getById + list", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id,
      category: "transportation",
      priority: "normal",
      requested_date: "2030-01-15",
      description: "ride to appt",
      created_by: adminId,
    });
    expect(created.status).toBe("open");

    const got = await getServiceRequestById(admin, created.id);
    expect(got?.id).toBe(created.id);

    const { rows } = await listServiceRequests(admin, { status: "open" });
    expect(rows.find(r => r.id === created.id)).toBeTruthy();
  });

  test("update respects edit-lock on notified", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });
    // Simulate notified state via direct write.
    await admin.from("service_requests").update({ status: "notified" }).eq("id", created.id);

    // Description and priority allowed.
    const updated = await updateServiceRequest(admin, created.id, {
      description: "new", priority: "high",
    });
    expect(updated.description).toBe("new");
    expect(updated.priority).toBe("high");

    // Category blocked while notified.
    await expect(
      updateServiceRequest(admin, created.id, { category: "groceries" }),
    ).rejects.toThrow(/locked/i);
  });

  test("cancelServiceRequest sets status + cancelled_at + supersedes tokens", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });
    // Fake a notified state + outstanding token.
    await admin.from("service_requests").update({ status: "notified" }).eq("id", created.id);
    const v = await adminClient().from("volunteers").select("id").limit(1);
    if (!v.data?.[0]) {
      // Seed a volunteer quickly.
      const { createVolunteerUser } = await import("./helpers");
      await createVolunteerUser(`v-cancel-${Date.now()}@t.local`, "active");
    }
    const vol = (await adminClient().from("volunteers").select("id").limit(1)).data![0];
    await admin.from("response_tokens").insert({
      token: `tok-${Date.now()}`, request_id: created.id, volunteer_id: vol.id,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    const cancelled = await cancelServiceRequest(admin, created.id, { reason: "Family cancelled" });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelled_at).not.toBeNull();
    expect(cancelled.cancelled_reason).toBe("Family cancelled");

    const { data: toks } = await admin.from("response_tokens").select("*").eq("request_id", created.id);
    expect(toks!.every(t => t.action === "superseded")).toBe(true);
  });

  test("reopen + markCompleted", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });

    // Put into accepted state directly via admin client (bypassing RPC for this specific test setup).
    const { createVolunteerUser } = await import("./helpers");
    const v = await createVolunteerUser(`v-re-${Date.now()}@t.local`, "active");
    await admin.from("service_requests").update({
      status: "accepted", assigned_volunteer_id: v.userId,
    }).eq("id", created.id);

    const reopened = await reopenServiceRequest(admin, created.id);
    expect(reopened.status).toBe("open");
    expect(reopened.assigned_volunteer_id).toBeNull();
    expect(reopened.reopened_at).not.toBeNull();

    // Re-accept for completion test.
    await admin.from("service_requests").update({
      status: "accepted", assigned_volunteer_id: v.userId,
    }).eq("id", created.id);
    const done = await markRequestCompleted(admin, created.id);
    expect(done.status).toBe("completed");
    expect(done.completed_at).not.toBeNull();
  });

  test("countRequestsByStatus", async () => {
    const { admin, senior, adminId } = await seedSenior();
    await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });
    const counts = await countRequestsByStatus(admin);
    expect(counts.open).toBeGreaterThan(0);
  });

  test("listRecipientsForRequest returns joined volunteer + token data", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });
    await admin.from("service_requests").update({ status: "notified" }).eq("id", created.id);

    const { createVolunteerUser } = await import("./helpers");
    const v = await createVolunteerUser(`v-rec-${Date.now()}@t.local`, "active");

    await admin.from("notifications").insert({
      request_id: created.id, volunteer_id: v.userId, channel: "email",
      status: "sent", event_type: "invite",
    });
    await admin.from("response_tokens").insert({
      token: `rec-tok-${Date.now()}`, request_id: created.id, volunteer_id: v.userId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    const rows = await listRecipientsForRequest(admin, created.id);
    expect(rows.length).toBe(1);
    expect(rows[0].volunteer_id).toBe(v.userId);
    expect(rows[0].volunteer_first_name).toBe("Test");
    expect(rows[0].event_type).toBe("invite");
    expect(rows[0].token_action).toBeNull();
  });

  test("countPendingInvitesForVolunteer — counts only unused, unexpired tokens", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });

    const { createVolunteerUser } = await import("./helpers");
    const v = await createVolunteerUser(`v-pend-${Date.now()}@t.local`, "active");

    // live token
    await admin.from("response_tokens").insert({
      token: `live-${Date.now()}`, request_id: created.id, volunteer_id: v.userId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    // expired token
    await admin.from("response_tokens").insert({
      token: `exp-${Date.now()}`, request_id: created.id, volunteer_id: v.userId,
      expires_at: new Date(Date.now() - 3600_000).toISOString(),
    });
    // used token
    await admin.from("response_tokens").insert({
      token: `used-${Date.now()}`, request_id: created.id, volunteer_id: v.userId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used_at: new Date().toISOString(), action: "decline",
    });

    const count = await countPendingInvitesForVolunteer(admin, v.userId);
    expect(count).toBe(1);
  });

  test("cancelServiceRequest rejects terminal (completed) requests", async () => {
    const { admin, senior, adminId } = await seedSenior();
    const created = await createServiceRequest(admin, {
      senior_id: senior.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-15", description: "x", created_by: adminId,
    });
    await admin.from("service_requests").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", created.id);
    await expect(
      cancelServiceRequest(admin, created.id, { reason: "nope" }),
    ).rejects.toThrow(/already|cannot be cancelled/i);
  });
});
