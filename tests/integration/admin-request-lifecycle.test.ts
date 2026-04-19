import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";
import { _sendInvitesForAdmin } from "@/app/(admin)/admin/requests/[id]/actions";
import type { NotificationService } from "@/lib/notifications";

function recorder(): NotificationService & { sent: { to: string; subject: string }[]; mode: "ok" | "fail" } {
  const r = {
    sent: [] as { to: string; subject: string }[],
    mode: "ok" as "ok" | "fail",
    async sendEmail(email: { to: string; subject: string }) {
      this.sent.push({ to: email.to, subject: email.subject });
      return this.mode === "ok"
        ? ({ ok: true, id: "t-" + this.sent.length } as const)
        : ({ ok: false, error: "simulated" } as const);
    },
  };
  return r;
}

async function seedRequest(status: "open" | "notified" = "open") {
  const admin = adminClient();
  const ts = Date.now() + Math.random();
  const a = await createAdminUser(`a-${ts}@t.local`);
  const v1 = await createVolunteerUser(`v1-${ts}@t.local`, "active");
  const v2 = await createVolunteerUser(`v2-${ts}@t.local`, "active");
  const { data: s } = await admin.from("seniors").insert({
    first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
    province: "ON", postal_code: "M1A1A1", created_by: a.userId,
  }).select().single();
  const { data: r } = await admin.from("service_requests").insert({
    senior_id: s!.id, category: "transportation", priority: "normal",
    requested_at: "2030-01-01T17:00:00.000Z", description: "x", created_by: a.userId, status,
  }).select().single();
  return { admin, request: r!, v1, v2 };
}

describe("sendInvites failure + duplicate handling", () => {
  test("total-failure send leaves request open (no status transition)", async () => {
    const { admin, request, v1 } = await seedRequest();
    const svc = recorder();
    svc.mode = "fail";
    const res = await _sendInvitesForAdmin(admin, {
      requestId: request.id, volunteerIds: [v1.userId], confirmed: true,
      appUrl: "https://test.local", notifier: svc,
    });
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(1);
    const { data: req } = await admin.from("service_requests").select("status").eq("id", request.id).single();
    expect(req?.status).toBe("open");
  });

  test("re-broadcast skips volunteers with an active token", async () => {
    const { admin, request, v1, v2 } = await seedRequest();
    const svc = recorder();
    // First broadcast to v1 only.
    await _sendInvitesForAdmin(admin, {
      requestId: request.id, volunteerIds: [v1.userId], confirmed: true,
      appUrl: "https://test.local", notifier: svc,
    });
    // Request is now 'notified'; but sendInvites now also guards non-open.
    // Reopen it so the second broadcast proceeds (simulates admin reopen).
    await admin.from("service_requests").update({ status: "open", assigned_volunteer_id: null }).eq("id", request.id);

    // Second broadcast includes both; v1 already has an active token and should be skipped.
    svc.sent.length = 0;
    const res2 = await _sendInvitesForAdmin(admin, {
      requestId: request.id, volunteerIds: [v1.userId, v2.userId], confirmed: true,
      appUrl: "https://test.local", notifier: svc,
    });
    expect(res2.sent).toBe(1);
    expect(res2.skipped).toBe(1);

    const { data: toks } = await admin.from("response_tokens").select("volunteer_id").eq("request_id", request.id);
    // v1 has its original token only, v2 got one new token — exactly 2 rows.
    expect(toks?.length).toBe(2);
    expect(toks?.filter(t => t.volunteer_id === v1.userId).length).toBe(1);
    expect(toks?.filter(t => t.volunteer_id === v2.userId).length).toBe(1);
  });

  test("sendInvites rejects when request status is not open", async () => {
    const { admin, request, v1 } = await seedRequest("notified");
    const svc = recorder();
    await expect(
      _sendInvitesForAdmin(admin, {
        requestId: request.id, volunteerIds: [v1.userId], confirmed: true,
        appUrl: "https://test.local", notifier: svc,
      }),
    ).rejects.toThrow(/must be open/i);
  });
});
