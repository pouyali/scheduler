import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["volunteers"]["Row"];
type Status = Database["public"]["Enums"]["volunteer_status"];

export type ListVolunteersFilters = {
  status?: Status | "all";
  q?: string;
  cursor?: { last_name: string; id: string } | null;
  limit?: number;
};

export async function getVolunteerById(supabase: Client, id: string): Promise<Row | null> {
  const { data, error } = await supabase.from("volunteers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listVolunteers(
  supabase: Client,
  filters: ListVolunteersFilters = {},
): Promise<{ rows: Row[]; nextCursor: { last_name: string; id: string } | null }> {
  const limit = filters.limit ?? 50;
  let q = supabase.from("volunteers").select("*");

  if (filters.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }

  if (filters.q && filters.q.trim()) {
    const escaped = filters.q.trim().replace(/[%_]/g, "").replace(/"/g, '""');
    const term = `"%${escaped}%"`;
    q = q.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`);
  }

  if (filters.cursor) {
    const ln = `"${filters.cursor.last_name.replace(/"/g, '""')}"`;
    const id = `"${filters.cursor.id.replace(/"/g, '""')}"`;
    q = q.or(`last_name.gt.${ln},and(last_name.eq.${ln},id.gt.${id})`);
  }

  q = q.order("last_name", { ascending: true }).order("id", { ascending: true }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw error;
  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? { last_name: last.last_name, id: last.id } : null;
  return { rows, nextCursor };
}

export async function countVolunteers(
  supabase: Client,
  filters: { status?: Status } = {},
): Promise<number> {
  let q = supabase.from("volunteers").select("id", { count: "exact", head: true });
  if (filters.status) q = q.eq("status", filters.status);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function createVolunteerProfile(
  supabase: Client,
  input: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    categories: string[];
    service_area: string;
    home_address?: string;
    home_lat?: number;
    home_lng?: number;
    auth_provider: "email" | "google" | "admin_invite";
  },
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .insert({ ...input, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type UpdateVolunteerInput = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  categories?: string[];
  service_area?: string;
  home_address?: string;
  home_lat?: number | null;
  home_lng?: number | null;
};

export async function updateVolunteerProfile(
  supabase: Client,
  id: string,
  input: UpdateVolunteerInput,
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveVolunteer(
  supabase: Client,
  id: string,
  approvedBy: string,
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .update({ status: "active", approved_at: new Date().toISOString(), approved_by: approvedBy })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function rejectVolunteer(supabase: Client, id: string): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .update({ status: "inactive" })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reactivateVolunteer(
  supabase: Client,
  id: string,
  approvedBy: string,
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteers")
    .update({ status: "active", approved_at: new Date().toISOString(), approved_by: approvedBy })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function findVolunteerByEmail(
  supabase: Client,
  email: string,
): Promise<Row | null> {
  const { data, error } = await supabase
    .from("volunteers")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}
