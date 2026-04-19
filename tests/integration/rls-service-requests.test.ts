import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser, signIn } from "./helpers";

describe("RLS — service_requests and notifications", () => {
  test("volunteer cannot read a request they were not notified about", async () => {
    const admin = adminClient();
    const ts = Date.now();
    const a = await createAdminUser(`a-${ts}@t.local`);
    const vA = await createVolunteerUser(`va-${ts}@t.local`, "active");
    const vB = await createVolunteerUser(`vb-${ts}@t.local`, "active");

    const { data: senior } = await admin.from("seniors").insert({
      first_name: "S", last_name: "X", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const { data: req } = await admin.from("service_requests").insert({
      senior_id: senior!.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
    }).select().single();

    // Notify only vA.
    await admin.from("notifications").insert({
      request_id: req!.id, volunteer_id: vA.userId, channel: "email", status: "sent", event_type: "invite",
    });

    const clientB = await signIn(vB.email);
    const { data: visible } = await clientB.from("service_requests").select("id").eq("id", req!.id);
    expect(visible ?? []).toEqual([]);
  });

  test("volunteer can read a request they were notified about", async () => {
    const admin = adminClient();
    const ts = Date.now();
    const a = await createAdminUser(`a2-${ts}@t.local`);
    const vA = await createVolunteerUser(`va2-${ts}@t.local`, "active");

    const { data: senior } = await admin.from("seniors").insert({
      first_name: "S", last_name: "X", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    }).select().single();

    const { data: req } = await admin.from("service_requests").insert({
      senior_id: senior!.id, category: "transportation", priority: "normal",
      requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "notified",
    }).select().single();

    await admin.from("notifications").insert({
      request_id: req!.id, volunteer_id: vA.userId, channel: "email", status: "sent", event_type: "invite",
    });

    const clientA = await signIn(vA.email);
    const { data } = await clientA.from("service_requests").select("id").eq("id", req!.id);
    expect(data?.length).toBe(1);
  });

  test("volunteer cannot read seniors directly", async () => {
    const admin = adminClient();
    const ts = Date.now();
    const v = await createVolunteerUser(`v-sen-${ts}@t.local`, "active");
    const a = await createAdminUser(`a-sen-${ts}@t.local`);
    await admin.from("seniors").insert({
      first_name: "S", last_name: "X", phone: "x", address_line1: "1", city: "Toronto",
      province: "ON", postal_code: "M1A1A1", created_by: a.userId,
    });

    const c = await signIn(v.email);
    const { data } = await c.from("seniors").select("id");
    expect(data ?? []).toEqual([]);
  });

  test("volunteer cannot read response_tokens", async () => {
    const admin = adminClient();
    const ts = Date.now();
    const v = await createVolunteerUser(`v-tok-${ts}@t.local`, "active");
    const c = await signIn(v.email);
    const { data } = await c.from("response_tokens").select("id");
    expect(data ?? []).toEqual([]);
  });
});
