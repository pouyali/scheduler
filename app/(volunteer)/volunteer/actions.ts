"use server";

import { revalidatePath } from "next/cache";
import { requireActiveVolunteer } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function respondFromPortal(input: { requestId: string; action: "accept" | "decline" }) {
  const user = await requireActiveVolunteer();
  const outcome = await _respondFromPortal({
    requestId: input.requestId,
    volunteerId: user.userId,
    action: input.action,
  });
  revalidatePath("/volunteer/dashboard");
  return outcome;
}

export async function _respondFromPortal(input: {
  requestId: string;
  volunteerId: string;
  action: "accept" | "decline";
}): Promise<"accepted" | "declined" | "already_filled" | "expired" | "invalid"> {
  const admin = createSupabaseAdminClient();

  // Look for an active (unused, non-expired) token first.
  const { data: tok } = await admin
    .from("response_tokens")
    .select("token")
    .eq("request_id", input.requestId)
    .eq("volunteer_id", input.volunteerId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!tok) {
    // Check whether a sibling accept already won — the trigger marks this
    // volunteer's token as 'superseded' when the request flips to 'accepted'.
    const { data: superseded } = await admin
      .from("response_tokens")
      .select("action")
      .eq("request_id", input.requestId)
      .eq("volunteer_id", input.volunteerId)
      .eq("action", "superseded")
      .maybeSingle();
    if (superseded) return "already_filled";
    return "invalid";
  }

  const { data, error } = await admin.rpc("consume_response_token", {
    p_token: tok.token,
    p_action: input.action,
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "40P01" || code === "55P03") return "already_filled";
    throw error;
  }
  return (data as { outcome: "accepted" | "declined" | "already_filled" | "expired" | "invalid" }).outcome;
}
