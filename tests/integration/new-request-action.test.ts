import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser } from "./helpers";
import { createRequestAction } from "@/app/(admin)/admin/requests/new/actions";

describe("createRequestAction", () => {
  test("rejects invalid payload with field errors", async () => {
    const result = await createRequestAction({
      senior_id: "",
      category: "",
      priority: "normal",
      requested_at: "",
      description: "",
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors)).toContain("senior_id");
  });

  test("creates a request for a real senior (admin session)", async () => {
    const admin = adminClient();
    const a = await createAdminUser(`a-${Date.now()}@t.local`);
    const { data: s } = await admin.from("seniors").insert({
      first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    // Server Actions read auth from cookies, which isn't available in unit context.
    // Call the non-auth helper directly (exported from the same module).
    const { _createRequestForAdmin } = await import("@/app/(admin)/admin/requests/new/actions");
    const req = await _createRequestForAdmin(admin, {
      senior_id: s!.id, category: "transportation", priority: "normal",
      requested_at: "2030-01-01T17:00:00.000Z", description: "x",
    }, a.userId);
    expect(req.status).toBe("open");
  });
});
