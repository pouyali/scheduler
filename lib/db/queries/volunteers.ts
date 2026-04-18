import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

export async function getVolunteerById(supabase: Client, id: string) {
  const { data, error } = await supabase.from("volunteers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
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
) {
  const { data, error } = await supabase
    .from("volunteers")
    .insert({ ...input, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
