import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;
type SeniorsInsert = Database["public"]["Tables"]["seniors"]["Insert"];
type SeniorsUpdate = Database["public"]["Tables"]["seniors"]["Update"];
type SeniorsRow = Database["public"]["Tables"]["seniors"]["Row"];

export type ListSeniorsFilters = {
  q?: string;
  city?: string;
  archived?: boolean;
  notGeocoded?: boolean;
  cursor?: { last_name: string; id: string } | null;
  limit?: number;
};

export async function listSeniors(
  supabase: Client,
  filters: ListSeniorsFilters = {},
): Promise<{ rows: SeniorsRow[]; nextCursor: { last_name: string; id: string } | null }> {
  const limit = filters.limit ?? 50;
  let q = supabase.from("seniors").select("*");

  if (filters.archived === true) q = q.not("archived_at", "is", null);
  else q = q.is("archived_at", null);

  if (filters.city) q = q.eq("city", filters.city);
  if (filters.notGeocoded) q = q.is("lat", null);

  if (filters.q && filters.q.trim()) {
    const escaped = filters.q.trim().replace(/[%_]/g, "").replace(/"/g, '""');
    const term = `"%${escaped}%"`;
    q = q.or(
      `first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},address_line1.ilike.${term}`,
    );
  }

  if (filters.cursor) {
    const ln = `"${filters.cursor.last_name.replace(/"/g, '""')}"`;
    const id = `"${filters.cursor.id.replace(/"/g, '""')}"`;
    q = q.or(
      `last_name.gt.${ln},and(last_name.eq.${ln},id.gt.${id})`,
    );
  }

  q = q.order("last_name", { ascending: true }).order("id", { ascending: true }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as SeniorsRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? { last_name: last.last_name, id: last.id } : null;
  return { rows: page, nextCursor };
}

export async function getSenior(supabase: Client, id: string): Promise<SeniorsRow | null> {
  const { data, error } = await supabase.from("seniors").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function insertSenior(
  supabase: Client,
  input: SeniorsInsert,
): Promise<SeniorsRow> {
  const { data, error } = await supabase.from("seniors").insert(input).select().single();
  if (error) throw error;
  return data as SeniorsRow;
}

export async function insertSeniorsMany(
  supabase: Client,
  inputs: SeniorsInsert[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const { error, count } = await supabase
    .from("seniors")
    .insert(inputs, { count: "exact" });
  if (error) throw error;
  return count ?? inputs.length;
}

export async function updateSeniorRow(
  supabase: Client,
  id: string,
  patch: SeniorsUpdate,
): Promise<SeniorsRow> {
  const { data, error } = await supabase
    .from("seniors")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SeniorsRow;
}

export async function setArchived(
  supabase: Client,
  id: string,
  value: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("seniors")
    .update({ archived_at: value ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export type SeniorCounts = { openRequests: number; lastRequestAt: string | null };

export async function countsBySenior(
  supabase: Client,
  seniorIds: string[],
): Promise<Map<string, SeniorCounts>> {
  const out = new Map<string, SeniorCounts>();
  if (seniorIds.length === 0) return out;
  // Safety cap: at 50 seniors per page × 100 historical requests = 5,000 rows.
  // Anything above that would indicate a schema/operational change that should be revisited.
  const { data, error } = await supabase
    .from("service_requests")
    .select("senior_id, status, requested_at")
    .in("senior_id", seniorIds)
    .limit(5000);
  if (error) throw error;
  for (const id of seniorIds) out.set(id, { openRequests: 0, lastRequestAt: null });
  for (const r of data ?? []) {
    const entry = out.get(r.senior_id)!;
    if (["open", "notified", "accepted"].includes(r.status as string)) entry.openRequests += 1;
    if (!entry.lastRequestAt || r.requested_at > entry.lastRequestAt) {
      entry.lastRequestAt = r.requested_at;
    }
  }
  return out;
}

export async function listSeniorCities(supabase: Client): Promise<string[]> {
  const { data, error } = await supabase
    .from("seniors")
    .select("city")
    .is("archived_at", null)
    .not("lat", "is", null);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.city))).sort();
}
