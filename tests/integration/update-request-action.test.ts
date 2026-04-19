import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser } from "./helpers";
import { _updateRequestForAdmin } from "@/app/(admin)/admin/requests/[id]/edit/actions";

describe("updateRequestAction", () => {
  test("allows description edit when notified", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`u-${Date.now()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();
    const { data: r } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: "2030-01-01T17:00:00.000Z", description: "x", created_by: a.userId, status: "notified",
    }).select().single();

    const updated = await _updateRequestForAdmin(admin, r!.id, { description: "new desc" });
    expect(updated.description).toBe("new desc");
  });

  test("rejects category edit when notified", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`u2-${Date.now()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();
    const { data: r } = await admin.from("service_requests").insert({
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: "2030-01-01T17:00:00.000Z", description: "x", created_by: a.userId, status: "notified",
    }).select().single();

    await expect(
      _updateRequestForAdmin(admin, r!.id, { category: "groceries" }),
    ).rejects.toThrow(/locked/i);
  });
});
