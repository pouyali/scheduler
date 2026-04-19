import { describe, test, expect } from "vitest";
import { adminClient, createAdminUser, createVolunteerUser } from "./helpers";
import { _sendInvitesForAdmin } from "@/app/(admin)/admin/requests/[id]/actions";
import type { NotificationService } from "@/lib/notifications";

function recordingService(): NotificationService & { sent: { to: string; subject: string }[] } {
  const sent: { to: string; subject: string }[] = [];
  return {
    sent,
    async sendEmail(email) {
      sent.push({ to: email.to, subject: email.subject });
      return { ok: true, id: "test-" + sent.length };
    },
  };
}

async function seed() {
  const admin = adminClient();
  const ts = Date.now();
  const a = await createAdminUser(`a-${ts}-${Math.random()}@t.local`);
  const v1 = await createVolunteerUser(`v1-${ts}-${Math.random()}@t.local`, "active");
  const v2 = await createVolunteerUser(`v2-${ts}-${Math.random()}@t.local`, "active");
  const { data: s } = await admin.from("seniors").insert({
    first_name: "J", last_name: "D", phone: "x", address_line1: "1", city: "Toronto",
    province: "ON", postal_code: "M1A1A1", created_by: a.userId,
  }).select().single();
  const { data: r } = await admin.from("service_requests").insert({
    senior_id: s!.id, category: "transportation", priority: "normal",
    requested_date: "2030-01-01", description: "x", created_by: a.userId, status: "open",
  }).select().single();
  return { admin, request: r!, v1, v2 };
}

describe("sendInvites (admin)", () => {
  test("creates tokens + notifications, transitions to notified, sends emails", async () => {
    const { admin, request, v1, v2 } = await seed();
    const svc = recordingService();
    const res = await _sendInvitesForAdmin(admin, {
      requestId: request.id,
      volunteerIds: [v1.userId, v2.userId],
      confirmed: true,
      appUrl: "https://test.local",
      notifier: svc,
    });
    expect(res.sent).toBe(2);

    const { data: updated } = await admin.from("service_requests").select("status").eq("id", request.id).single();
    expect(updated?.status).toBe("notified");

    const { data: toks } = await admin.from("response_tokens").select("*").eq("request_id", request.id);
    expect(toks?.length).toBe(2);

    const { data: notifs } = await admin.from("notifications").select("*").eq("request_id", request.id);
    expect(notifs?.length).toBe(2);
    expect(notifs?.every(n => n.event_type === "invite")).toBe(true);

    expect(svc.sent.length).toBe(2);
  });

  test("rejects >25 recipients without confirmation", async () => {
    const { admin, request } = await seed();
    const ids = Array.from({ length: 26 }, (_, i) => `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`);
    await expect(
      _sendInvitesForAdmin(admin, {
        requestId: request.id, volunteerIds: ids, confirmed: false,
        appUrl: "https://test.local", notifier: recordingService(),
      }),
    ).rejects.toThrow(/confirm/i);
  });
});
