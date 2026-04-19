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
  cursor?: { requested_at: string; id: string } | null;
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
): Promise<{ rows: Row[]; nextCursor: { requested_at: string; id: string } | null }> {
  const limit = filters.limit ?? 50;

  // Base select. When `q` is provided, inner-join seniors so we can filter by name.
  const selectStr = filters.q?.trim()
    ? "*, seniors!inner(first_name, last_name)"
    : "*";

  let q = supabase.from("service_requests").select(selectStr);

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("requested_at", filters.dateFrom);
  if (filters.dateTo) q = q.lte("requested_at", filters.dateTo);

  if (filters.q?.trim()) {
    const escaped = filters.q.trim().replace(/[%_]/g, "").replace(/"/g, '""');
    const term = `"%${escaped}%"`;
    q = q.or(`first_name.ilike.${term},last_name.ilike.${term}`, { foreignTable: "seniors" });
  }

  if (filters.cursor) {
    const d = filters.cursor.requested_at;
    const id = filters.cursor.id;
    q = q.or(`requested_at.lt.${d},and(requested_at.eq.${d},id.gt.${id})`);
  }

  q = q
    .order("requested_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit + 1);

  const { data, error } = await q;
  if (error) throw error;

  // When we inner-joined seniors for search, the returned rows carry a `seniors`
  // field we don't need. Cast through unknown to the Row type; the extra field
  // is harmless to consumers and avoids an object spread on every row.
  const rowsData = data as unknown as Row[];

  const hasMore = rowsData.length > limit;
  const rows = hasMore ? rowsData.slice(0, limit) : rowsData;
  const last = rows[rows.length - 1];
  const nextCursor =
    hasMore && last ? { requested_at: last.requested_at, id: last.id } : null;
  return { rows, nextCursor };
}

export type CreateInput = {
  senior_id: string;
  category: string;
  priority: Priority;
  requested_at: string;
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
  "senior_id", "category", "requested_at",
];

export type UpdateInput = Partial<{
  senior_id: string;
  category: string;
  priority: Priority;
  requested_at: string;
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

export type DashboardCounts = {
  openRequests: number;
  awaitingResponse: number;
  pendingVolunteers: number;
  activeSeniors: number;
};

export async function getDashboardCounts(supabase: Client): Promise<DashboardCounts> {
  const [openR, notR, pendV, actS] = await Promise.all([
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "notified"),
    supabase.from("volunteers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("seniors").select("id", { count: "exact", head: true }).is("archived_at", null),
  ]);
  return {
    openRequests: openR.count ?? 0,
    awaitingResponse: notR.count ?? 0,
    pendingVolunteers: pendV.count ?? 0,
    activeSeniors: actS.count ?? 0,
  };
}

export type UpcomingRow = {
  id: string;
  category: string;
  requested_at: string;
  status: Status;
  senior_first_name: string;
  senior_city: string;
};

export async function listUpcomingRequestsForDashboard(
  supabase: Client,
  opts: { days?: number; limit?: number } = {},
): Promise<UpcomingRow[]> {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 10;
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const { data, error } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_at, status,
      seniors:seniors!inner(first_name, city)
    `)
    .gte("requested_at", now.toISOString())
    .lte("requested_at", until.toISOString())
    .in("status", ["open", "notified", "accepted"])
    .order("requested_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((r) => {
    // Supabase JS can't narrow a join shape from a select string — same pattern used
    // elsewhere in this module (listRecipientsForRequest).
    const s = (r as unknown as { seniors: { first_name: string; city: string } }).seniors;
    return {
      id: r.id, category: r.category, requested_at: r.requested_at, status: r.status,
      senior_first_name: s.first_name, senior_city: s.city,
    };
  });
}

export type DashboardActivityEvent = {
  at: string;
  kind: "created" | "broadcast" | "accepted" | "declined" | "cancelled" | "reopened" | "completed";
  text: string;
  requestId: string;
};

export async function listRecentActivity(
  supabase: Client,
  limit: number = 20,
): Promise<DashboardActivityEvent[]> {
  // 1) status-transition events
  const { data: reqs } = await supabase
    .from("service_requests")
    .select(`
      id, cancelled_at, cancelled_reason, reopened_at, completed_at, created_at,
      seniors:seniors!inner(first_name)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  // 2) broadcast events: first notification.sent_at per request, plus count
  const { data: notifs } = await supabase
    .from("notifications")
    .select("request_id, sent_at")
    .order("sent_at", { ascending: false })
    .limit(200);
  const firstBroadcast = new Map<string, string>();
  const countPerRequest = new Map<string, number>();
  for (const n of (notifs ?? []).slice().reverse()) {
    if (!firstBroadcast.has(n.request_id)) firstBroadcast.set(n.request_id, n.sent_at);
    countPerRequest.set(n.request_id, (countPerRequest.get(n.request_id) ?? 0) + 1);
  }

  // 3) per-invite responses
  const { data: tokens } = await supabase
    .from("response_tokens")
    .select(`
      request_id, action, used_at,
      volunteers:volunteers!inner(first_name, last_name),
      service_requests:service_requests!inner(seniors:seniors!inner(first_name))
    `)
    .not("used_at", "is", null)
    .order("used_at", { ascending: false })
    .limit(50);

  const events: DashboardActivityEvent[] = [];

  for (const r of reqs ?? []) {
    const senior = (r as unknown as { seniors: { first_name: string } }).seniors.first_name;
    events.push({ at: r.created_at, kind: "created", text: `Request created for ${senior}`, requestId: r.id });
    const bc = firstBroadcast.get(r.id);
    if (bc) {
      const n = countPerRequest.get(r.id) ?? 0;
      events.push({ at: bc, kind: "broadcast", text: `Broadcast to ${n} volunteer${n === 1 ? "" : "s"} for ${senior}`, requestId: r.id });
    }
    if (r.cancelled_at) {
      const reason = r.cancelled_reason ? ` (${r.cancelled_reason})` : "";
      events.push({ at: r.cancelled_at, kind: "cancelled", text: `Request cancelled for ${senior}${reason}`, requestId: r.id });
    }
    if (r.reopened_at) events.push({ at: r.reopened_at, kind: "reopened", text: `Admin reopened request for ${senior}`, requestId: r.id });
    if (r.completed_at) events.push({ at: r.completed_at, kind: "completed", text: `Request completed for ${senior}`, requestId: r.id });
  }

  for (const t of tokens ?? []) {
    if (!t.used_at) continue;
    const vol = (t as unknown as { volunteers: { first_name: string; last_name: string } }).volunteers;
    const reqSen = (t as unknown as { service_requests: { seniors: { first_name: string } } }).service_requests.seniors;
    const who = `${vol.first_name} ${vol.last_name}`;
    if (t.action === "accept") {
      events.push({ at: t.used_at, kind: "accepted", text: `${who} accepted ${reqSen.first_name}'s request`, requestId: t.request_id });
    } else if (t.action === "decline") {
      events.push({ at: t.used_at, kind: "declined", text: `${who} declined ${reqSen.first_name}'s request`, requestId: t.request_id });
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events.slice(0, limit);
}
