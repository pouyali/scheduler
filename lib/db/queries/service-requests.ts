import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["service_requests"]["Row"];
type Priority = Database["public"]["Enums"]["request_priority"];
type Status = Database["public"]["Enums"]["request_status"];

export type ListFilters = {
  status?: Status | "all";
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: { requested_date: string; id: string } | null;
  limit?: number;
};

export async function getServiceRequestById(supabase: Client, id: string): Promise<Row | null> {
  const { data, error } = await supabase
    .from("service_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listServiceRequests(
  supabase: Client,
  filters: ListFilters = {},
): Promise<{ rows: Row[]; nextCursor: { requested_date: string; id: string } | null }> {
  const limit = filters.limit ?? 50;
  let q = supabase.from("service_requests").select("*");

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("requested_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("requested_date", filters.dateTo);
  if (filters.cursor) {
    const d = filters.cursor.requested_date;
    const id = filters.cursor.id;
    q = q.or(`requested_date.lt.${d},and(requested_date.eq.${d},id.gt.${id})`);
  }

  q = q
    .order("requested_date", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit + 1);

  const { data, error } = await q;
  if (error) throw error;
  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const last = rows[rows.length - 1];
  const nextCursor =
    hasMore && last ? { requested_date: last.requested_date, id: last.id } : null;
  return { rows, nextCursor };
}

export type CreateInput = {
  senior_id: string;
  category: string;
  priority: Priority;
  requested_date: string;
  description: string | null;
  created_by: string;
};

export async function createServiceRequest(supabase: Client, input: CreateInput): Promise<Row> {
  const { data, error } = await supabase
    .from("service_requests")
    .insert({ ...input, status: "open" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const LOCKED_WHEN_NOTIFIED: readonly (keyof UpdateInput)[] = [
  "senior_id", "category", "requested_date",
];

export type UpdateInput = Partial<{
  senior_id: string;
  category: string;
  priority: Priority;
  requested_date: string;
  description: string | null;
}>;

export async function updateServiceRequest(
  supabase: Client, id: string, input: UpdateInput,
): Promise<Row> {
  const current = await getServiceRequestById(supabase, id);
  if (!current) throw new Error(`Request ${id} not found`);

  if (current.status === "notified") {
    for (const key of LOCKED_WHEN_NOTIFIED) {
      if (key in input) {
        throw new Error(
          `Field "${key}" is locked while the request is notified. Cancel the request to change it.`,
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("service_requests").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function cancelServiceRequest(
  supabase: Client, id: string, opts: { reason?: string | null },
): Promise<Row> {
  // Supersede any outstanding tokens.
  const { error: tErr } = await supabase
    .from("response_tokens")
    .update({ used_at: new Date().toISOString(), action: "superseded" })
    .eq("request_id", id)
    .is("used_at", null);
  if (tErr) throw tErr;

  const { data, error } = await supabase
    .from("service_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: opts.reason ?? null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reopenServiceRequest(supabase: Client, id: string): Promise<Row> {
  const { data, error } = await supabase
    .from("service_requests")
    .update({
      status: "open",
      assigned_volunteer_id: null,
      reopened_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markRequestCompleted(supabase: Client, id: string): Promise<Row> {
  const { data, error } = await supabase
    .from("service_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type RecipientRow = {
  notification_id: string;
  volunteer_id: string;
  volunteer_first_name: string;
  volunteer_last_name: string;
  volunteer_email: string;
  sent_at: string;
  notification_status: Database["public"]["Enums"]["notification_status"];
  event_type: Database["public"]["Enums"]["notification_event_type"];
  token_action: Database["public"]["Enums"]["token_action"] | null;
  token_used_at: string | null;
};

export async function listRecipientsForRequest(
  supabase: Client, requestId: string,
): Promise<RecipientRow[]> {
  const { data: notifs, error } = await supabase
    .from("notifications")
    .select(`
      id, volunteer_id, sent_at, status, event_type,
      volunteers:volunteers ( first_name, last_name, email )
    `)
    .eq("request_id", requestId)
    .order("sent_at", { ascending: true });
  if (error) throw error;

  const { data: tokens, error: tErr } = await supabase
    .from("response_tokens")
    .select("volunteer_id, action, used_at")
    .eq("request_id", requestId);
  if (tErr) throw tErr;

  const tokByVol = new Map(tokens!.map(t => [t.volunteer_id, t]));

  return notifs!.map((n) => {
    const vol = (n as unknown as { volunteers: { first_name: string; last_name: string; email: string } }).volunteers;
    const tok = tokByVol.get(n.volunteer_id);
    return {
      notification_id: n.id,
      volunteer_id: n.volunteer_id,
      volunteer_first_name: vol.first_name,
      volunteer_last_name: vol.last_name,
      volunteer_email: vol.email,
      sent_at: n.sent_at,
      notification_status: n.status,
      event_type: n.event_type,
      token_action: tok?.action ?? null,
      token_used_at: tok?.used_at ?? null,
    };
  });
}

export async function countRequestsByStatus(
  supabase: Client,
): Promise<Record<Status, number>> {
  const statuses: Status[] = ["open", "notified", "accepted", "completed", "cancelled"];
  const result: Record<string, number> = {};
  for (const s of statuses) {
    const { count } = await supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    result[s] = count ?? 0;
  }
  return result as Record<Status, number>;
}

export async function countPendingInvitesForVolunteer(
  supabase: Client, volunteerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("response_tokens")
    .select("id", { count: "exact", head: true })
    .eq("volunteer_id", volunteerId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}
