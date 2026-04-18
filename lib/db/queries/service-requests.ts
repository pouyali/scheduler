import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

// Populated in the Service Request Management sub-project.
export async function listServiceRequests(supabase: Client) {
  const { data, error } = await supabase
    .from("service_requests")
    .select("*")
    .order("requested_date", { ascending: false });
  if (error) throw error;
  return data;
}
