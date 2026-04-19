"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  cancelServiceRequest,
  reopenServiceRequest,
  markRequestCompleted,
  getServiceRequestById,
} from "@/lib/db/queries/service-requests";
import { computeTokenExpiry } from "@/lib/service-requests/expiry";
import { renderServiceRequestInvite } from "@/lib/notifications/templates/service-request-invite";
import { renderRequestCancelled } from "@/lib/notifications/templates/request-cancelled";
import { type NotificationService } from "@/lib/notifications";
import { createNotificationService } from "@/lib/notifications/factory";
import { randomBytes } from "node:crypto";

type Client = SupabaseClient<Database>;

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// --- SEND INVITES ---

const SendSchema = z.object({
  requestId: z.string().uuid(),
  volunteerIds: z.array(z.string().uuid()).min(1),
  confirmed: z.boolean().optional(),
});

export async function sendInvitesAction(input: z.infer<typeof SendSchema>) {
  const parsed = SendSchema.parse(input);
  await requireAdmin();
  // Use the service-role client here: response_tokens has no authenticated INSERT policy
  // (intentionally service-role only per spec). requireAdmin() above already verifies caller.
  const supabase = createSupabaseAdminClient();
  const res = await _sendInvitesForAdmin(supabase, {
    requestId: parsed.requestId,
    volunteerIds: parsed.volunteerIds,
    confirmed: parsed.confirmed ?? false,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    notifier: createNotificationService(),
  });
  revalidatePath(`/admin/requests/${parsed.requestId}`);
  return res;
}

export async function _sendInvitesForAdmin(
  supabase: Client,
  opts: {
    requestId: string;
    volunteerIds: string[];
    confirmed: boolean;
    appUrl: string;
    notifier: NotificationService;
  },
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (opts.volunteerIds.length > 25 && !opts.confirmed) {
    throw new Error("Please confirm before sending to more than 25 volunteers.");
  }

  const req = await getServiceRequestById(supabase, opts.requestId);
  if (!req) throw new Error("Request not found");

  // Fix S1: Guard against non-open request status to prevent accidental double-broadcast.
  // The UI already hides the picker when status != open, but defense in depth.
  if (req.status !== "open") {
    throw new Error(`Cannot send invites: request is ${req.status}, must be open.`);
  }

  const { data: senior, error: sErr } = await supabase
    .from("seniors")
    .select("first_name, city")
    .eq("id", req.senior_id)
    .single();
  if (sErr) throw sErr;

  const { data: vols, error: vErr } = await supabase
    .from("volunteers")
    .select("id, first_name, email")
    .in("id", opts.volunteerIds);
  if (vErr) throw vErr;

  // Fix C2: Skip volunteers who already hold an active token for this request.
  // A re-broadcast shouldn't issue a second token to someone who could still
  // accept via their first one — otherwise "first-to-accept wins" breaks.
  const { data: existingToks, error: etErr } = await supabase
    .from("response_tokens")
    .select("volunteer_id")
    .eq("request_id", req.id)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString());
  if (etErr) throw etErr;
  const alreadyLive = new Set((existingToks ?? []).map(t => t.volunteer_id));
  const toSend = (vols ?? []).filter(v => !alreadyLive.has(v.id));

  const expires = computeTokenExpiry(req.requested_date).toISOString();

  let sent = 0, failed = 0;
  for (const v of toSend) {
    const token = newToken();
    const { error: tErr } = await supabase.from("response_tokens").insert({
      token, request_id: req.id, volunteer_id: v.id, expires_at: expires,
    });
    if (tErr) throw tErr;

    const { data: notif, error: nErr } = await supabase.from("notifications").insert({
      request_id: req.id, volunteer_id: v.id, channel: "email",
      status: "sent", event_type: "invite",
    }).select().single();
    if (nErr) throw nErr;

    const email = renderServiceRequestInvite({
      to: v.email,
      volunteerFirstName: v.first_name,
      seniorFirstName: senior!.first_name,
      seniorCity: senior!.city,
      category: req.category,
      requestedDate: req.requested_date,
      descriptionExcerpt: (req.description ?? "").slice(0, 240),
      acceptUrl: `${opts.appUrl}/respond/${token}?action=accept`,
      declineUrl: `${opts.appUrl}/respond/${token}?action=decline`,
    });
    const res = await opts.notifier.sendEmail(email);
    if (res.ok) {
      sent++;
    } else {
      failed++;
      await supabase.from("notifications").update({ status: "failed" }).eq("id", notif!.id);
    }
  }

  // Fix C1: Only flip to 'notified' if at least one email got out. If every send failed,
  // leave the request 'open' so the admin can retry the whole broadcast or
  // individually via the failed notification rows.
  if (sent > 0) {
    await supabase.from("service_requests").update({ status: "notified" }).eq("id", req.id);
  }

  return { sent, failed, skipped: (vols?.length ?? 0) - toSend.length };
}

// --- CANCEL ---

export async function cancelRequestAction(input: { id: string; reason?: string; notifyRecipients: boolean }) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const req = await getServiceRequestById(supabase, input.id);
  if (!req) throw new Error("Request not found");

  if (input.notifyRecipients) {
    // Fix I1: Use the authenticated server client (supabase) — it already has admin-level
    // access via RLS. No need for the service-role client here.
    const { data: recipients } = await supabase
      .from("notifications")
      .select("volunteer_id, volunteers:volunteers(first_name, email)")
      .eq("request_id", input.id);
    const notifier = createNotificationService();
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/volunteer/dashboard`;
    for (const r of recipients ?? []) {
      // Supabase JS client types the relation join as a union with arrays; the runtime
      // shape for a FK-joined single row is always the object form.
      const vol = (r as unknown as { volunteers: { first_name: string; email: string } }).volunteers;
      const email = renderRequestCancelled({
        to: vol.email,
        volunteerFirstName: vol.first_name,
        category: req.category,
        requestedDate: req.requested_date,
        reason: input.reason,
        dashboardUrl,
      });
      // Fix I2/S3: Capture send result and reflect actual status in the notification row.
      const sendRes = await notifier.sendEmail(email);
      await supabase.from("notifications").insert({
        request_id: input.id, volunteer_id: r.volunteer_id,
        channel: "email",
        status: sendRes.ok ? "sent" : "failed",
        event_type: "cancellation",
      });
    }
  }

  await cancelServiceRequest(supabase, input.id, { reason: input.reason ?? null });
  revalidatePath(`/admin/requests/${input.id}`);
}

// --- REOPEN ---

export async function reopenRequestAction(id: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await reopenServiceRequest(supabase, id);
  revalidatePath(`/admin/requests/${id}`);
}

// --- REASSIGN ---

export async function reassignRequestAction(input: { id: string; newVolunteerId: string }) {
  // Fix M2: Reassign is deliberately non-atomic: reopen → issue token → email → set notified.
  // A volunteer or admin loading the page during the gap sees the intermediate
  // `open` state (with no tokens). Risk window is tiny and Phase 1 scale; if it
  // becomes a problem, wrap these steps in a single RPC similar to cancel_service_request.
  await requireAdmin();
  // Use service-role client: response_tokens has no authenticated INSERT policy (service-role only per spec).
  const supabase = createSupabaseAdminClient();
  const req = await getServiceRequestById(supabase, input.id);
  if (!req) throw new Error("Request not found");

  await reopenServiceRequest(supabase, input.id);

  // Fix I3: Null-guard senior and volunteer lookups with explicit error messages.
  const { data: senior } = await supabase.from("seniors").select("first_name, city").eq("id", req.senior_id).single();
  if (!senior) throw new Error(`Senior ${req.senior_id} not found`);

  const { data: vol } = await supabase.from("volunteers").select("id, first_name, email").eq("id", input.newVolunteerId).single();
  if (!vol) throw new Error(`Volunteer ${input.newVolunteerId} not found`);

  const expires = computeTokenExpiry(req.requested_date).toISOString();
  const token = newToken();
  await supabase.from("response_tokens").insert({
    token, request_id: req.id, volunteer_id: vol.id, expires_at: expires,
  });
  await supabase.from("notifications").insert({
    request_id: req.id, volunteer_id: vol.id, channel: "email",
    status: "sent", event_type: "reassignment_invite",
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const email = renderServiceRequestInvite({
    to: vol.email,
    volunteerFirstName: vol.first_name,
    seniorFirstName: senior.first_name,
    seniorCity: senior.city,
    category: req.category,
    requestedDate: req.requested_date,
    descriptionExcerpt: (req.description ?? "").slice(0, 240),
    acceptUrl: `${appUrl}/respond/${token}?action=accept`,
    declineUrl: `${appUrl}/respond/${token}?action=decline`,
  });
  await createNotificationService().sendEmail(email);
  await supabase.from("service_requests").update({ status: "notified" }).eq("id", req.id);
  revalidatePath(`/admin/requests/${input.id}`);
}

// --- MARK COMPLETED ---

export async function markCompletedAction(id: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await markRequestCompleted(supabase, id);
  revalidatePath(`/admin/requests/${id}`);
}

// --- RETRY FAILED NOTIFICATION ---

export async function retryNotificationAction(notificationId: string) {
  await requireAdmin();
  // Use service-role client: response_tokens has no authenticated policy (service-role only per spec).
  const supabase = createSupabaseAdminClient();
  const { data: n } = await supabase
    .from("notifications")
    .select("request_id, volunteer_id, event_type")
    .eq("id", notificationId)
    .single();
  if (!n) throw new Error("Notification not found");

  const { data: tok } = await supabase
    .from("response_tokens")
    .select("token")
    .eq("request_id", n.request_id)
    .eq("volunteer_id", n.volunteer_id)
    .is("used_at", null)
    .maybeSingle();
  if (!tok) throw new Error("No active token to retry");

  const req = await getServiceRequestById(supabase, n.request_id);
  const { data: senior } = await supabase.from("seniors").select("first_name, city").eq("id", req!.senior_id).single();
  const { data: vol } = await supabase.from("volunteers").select("first_name, email").eq("id", n.volunteer_id).single();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const email = renderServiceRequestInvite({
    to: vol!.email,
    volunteerFirstName: vol!.first_name,
    seniorFirstName: senior!.first_name,
    seniorCity: senior!.city,
    category: req!.category,
    requestedDate: req!.requested_date,
    descriptionExcerpt: (req!.description ?? "").slice(0, 240),
    acceptUrl: `${appUrl}/respond/${tok.token}?action=accept`,
    declineUrl: `${appUrl}/respond/${tok.token}?action=decline`,
  });
  const res = await createNotificationService().sendEmail(email);
  await supabase.from("notifications")
    .update({ status: res.ok ? "sent" : "failed" })
    .eq("id", notificationId);
  revalidatePath(`/admin/requests/${n.request_id}`);
}
