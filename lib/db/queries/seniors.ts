import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

// Populated in the Senior Management sub-project.
export async function listSeniors(supabase: Client) {
  const { data, error } = await supabase.from("seniors").select("*").order("last_name");
  if (error) throw error;
  return data;
}
