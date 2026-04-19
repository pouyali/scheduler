import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";
import {
  getDashboardCounts,
  listUpcomingRequestsForDashboard,
  listRecentActivity,
} from "@/lib/db/queries/service-requests";

describe("dashboard queries", () => {
  test("getDashboardCounts returns per-status request counts + volunteer/senior counts", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`d-counts-${Date.now()}-${Math.random()}@t.local`);
    await createVolunteerUser(`d-v-${Date.now()}-${Math.random()}@t.local`, "pending");
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();
    await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: "2030-01-01T17:00:00.000Z", description: "x", created_by: a.userId, status: "open",
    });

    const counts = await getDashboardCounts(admin);
    expect(counts.openRequests).toBeGreaterThan(0);
    expect(counts.pendingVolunteers).toBeGreaterThan(0);
    expect(counts.activeSeniors).toBeGreaterThan(0);
    expect(counts).toHaveProperty("awaitingResponse");
  });

  test("listUpcomingRequestsForDashboard returns in-window non-terminal rows, ordered asc", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`d-upc-${Date.now()}-${Math.random()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const now = new Date();
    const in1day = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
    const in6days = new Date(now.getTime() + 6 * 24 * 3600 * 1000).toISOString();
    const in10days = new Date(now.getTime() + 10 * 24 * 3600 * 1000).toISOString();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

    const mk = async (ts: string, status: "open" | "notified" | "accepted" | "cancelled") => {
      const row: Record<string, unknown> = {
        senior_id: s!.id, category: "transportation", priority: "normal",
        requested_at: ts, description: "x", created_by: a.userId, status,
      };
      if (status === "accepted") {
        const v = await createVolunteerUser(`upc-v-${Date.now()}-${Math.random()}@t.local`, "active");
        row.assigned_volunteer_id = v.userId;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic row shape needed for conditional assigned_volunteer_id
      const { data } = await admin.from("service_requests").insert(row as any).select().single();
      return data!.id;
    };
    const id1 = await mk(in1day, "open");
    const id2 = await mk(in6days, "notified");
    await mk(in10days, "open");        // out of window
    await mk(yesterday, "open");       // past
    await mk(in1day, "cancelled");     // terminal

    const rows = await listUpcomingRequestsForDashboard(admin, { days: 7, limit: 10 });
    const ids = rows.map(r => r.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    expect(ids.indexOf(id1)).toBeLessThan(ids.indexOf(id2));
  });

  test("listRecentActivity returns merged chronological events with click-through ids", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`d-act-${Date.now()}-${Math.random()}@t.local`);
    const v = await createVolunteerUser(`d-v-act-${Date.now()}-${Math.random()}@t.local`, "active");
    const { data: s } = await admin.from("seniors").insert({
      first_name: "Jane", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const { data: r } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: "2030-01-01T17:00:00.000Z", description: "ride", created_by: a.userId, status: "notified",
    }).select().single();

    await admin.from("notifications").insert({
      request_id: r!.id, volunteer_id: v.userId, channel: "email", status: "sent", event_type: "invite",
    });
    await admin.from("response_tokens").insert({
      token: `act-${Date.now()}-${Math.random()}`, request_id: r!.id, volunteer_id: v.userId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used_at: new Date().toISOString(), action: "accept",
    });

    const events = await listRecentActivity(admin, 20);
    const forThisRequest = events.filter(e => e.requestId === r!.id);
    expect(forThisRequest.some(e => e.kind === "created")).toBe(true);
    expect(forThisRequest.some(e => e.kind === "accepted")).toBe(true);
  });
});
