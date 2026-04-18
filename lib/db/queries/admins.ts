import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

export async function getAdminById(supabase: Client, id: string) {
  const { data, error } = await supabase.from("admins").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
