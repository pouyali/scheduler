import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser } from "./helpers";
import { listCalendarEvents } from "@/lib/db/queries/service-requests";

describe("listCalendarEvents", () => {
  test("returns in-window events with joined senior first name", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`cal-${Date.now()}-${Math.random()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "Jane", last_name: "Doe", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const now = new Date();
    const in5d = new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString();
    const in90d = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString();

    const { data: r1 } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: in5d, description: "x", created_by: a.userId, status: "open",
    }).select().single();
    await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: in90d, description: "x", created_by: a.userId, status: "open",
    });

    const from = new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString();
    const events = await listCalendarEvents(admin, { from, to });
    const found = events.find(e => e.id === r1!.id);
    expect(found).toBeDefined();
    expect(found!.title).toContain("Jane");
    expect(found!.title).toContain("transportation");
    expect(found!.start.getTime()).toBe(new Date(in5d).getTime());
    expect(found!.end.getTime() - found!.start.getTime()).toBe(60 * 60 * 1000);
    expect(events.find(e => e.start.getTime() === new Date(in90d).getTime())).toBeUndefined();
  });
});
