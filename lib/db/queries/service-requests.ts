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

  // Base select. When `q` is provided, inner-join seniors so we can filter by name.
  const selectStr = filters.q?.trim()
    ? "*, seniors!inner(first_name, last_name)"
    : "*";

  let q = supabase.from("service_requests").select(selectStr);

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("requested_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("requested_date", filters.dateTo);

  if (filters.q?.trim()) {
    const escaped = filters.q.trim().replace(/[%_]/g, "").replace(/"/g, '""');
    const term = `"%${escaped}%"`;
    q = q.or(`first_name.ilike.${term},last_name.ilike.${term}`, { foreignTable: "seniors" });
  }

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

  // When we inner-joined seniors for search, strip the join data back out to match Row type.
  const raw = data as unknown as (Row & { seniors?: unknown })[];
  const rowsData: Row[] = raw.map(({ seniors: _s, ...rest }) => rest as Row);

  const hasMore = rowsData.length > limit;
  const rows = hasMore ? rowsData.slice(0, limit) : rowsData;
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

// Enforces the edit-lock rule at the app layer only (read status → check → write,
// no transaction). A concurrent status transition (e.g., open → notified) between
// the read and write could let a locked field through. Acceptable for Phase 1;
// Server Actions must re-read the returned row and surface stale-status to the UI.
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
  // Supabase's TS generator emits `p_reason: string` for the nullable Postgres
  // `text` arg. `cancelled_reason` is nullable in the table, and the RPC stores
  // whatever is passed — NULL included — directly. Cast via `unknown` to allow
  // null at the call site without reaching for `any`.
  const { error: rpcErr } = await supabase.rpc("cancel_service_request", {
    p_id: id,
    p_reason: (opts.reason ?? null) as unknown as string,
  });
  if (rpcErr) throw rpcErr;

  const row = await getServiceRequestById(supabase, id);
  if (!row) throw new Error(`Request ${id} not found after cancellation`);
  return row;
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
    // Supabase JS client can't narrow the relation join shape from a string select
    // expression. The volunteers FK is defined in the generated types, so the runtime
    // shape is safe; the cast is a TS-only workaround.
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
  const results = await Promise.all(
    statuses.map(async (s) => {
      const { count, error } = await supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      if (error) throw error;
      return [s, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results) as Record<Status, number>;
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

export async function getNotificationCountsByRequest(
  supabase: Client, requestIds: string[],
): Promise<Map<string, { sent: number; accepted: number }>> {
  if (requestIds.length === 0) return new Map();
  const { data: notifs } = await supabase
    .from("notifications")
    .select("request_id")
    .in("request_id", requestIds);
  const { data: toks } = await supabase
    .from("response_tokens")
    .select("request_id, action")
    .in("request_id", requestIds);

  const result = new Map<string, { sent: number; accepted: number }>();
  for (const id of requestIds) result.set(id, { sent: 0, accepted: 0 });
  for (const n of notifs ?? []) {
    const cur = result.get(n.request_id)!;
    cur.sent += 1;
  }
  for (const t of toks ?? []) {
    if (t.action === "accept") result.get(t.request_id)!.accepted += 1;
  }
  return result;
}
