import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserRole =
  | { role: "guest" }
  | { role: "incomplete"; userId: string }
  | { role: "admin"; userId: string }
  | { role: "volunteer"; userId: string; status: "pending" | "active" | "inactive" };

export async function getUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getUserRole(): Promise<UserRole> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { role: "guest" };

  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (admin) return { role: "admin", userId: user.id };

  const { data: volunteer } = await supabase
    .from("volunteers")
    .select("id, status")
    .eq("id", user.id)
    .maybeSingle();
  if (volunteer) {
    return {
      role: "volunteer",
      userId: user.id,
      status: volunteer.status as "pending" | "active" | "inactive",
    };
  }

  return { role: "incomplete", userId: user.id };
}

export async function requireAdmin() {
  const r = await getUserRole();
  if (r.role !== "admin") redirect("/login");
  return r;
}

export async function requireActiveVolunteer() {
  const r = await getUserRole();
  if (r.role !== "volunteer") redirect("/login");
  if (r.status !== "active") redirect("/volunteer/dashboard");
  return r;
}
