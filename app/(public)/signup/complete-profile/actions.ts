"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createVolunteerProfile } from "@/lib/db/queries/volunteers";

export type CompleteProfileState = { error?: string } | undefined;

export async function completeProfileAction(
  _prev: CompleteProfileState,
  formData: FormData,
): Promise<CompleteProfileState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { error: "Not authenticated" };

  const first_name = String(formData.get("first_name") ?? "").trim();
  const last_name = String(formData.get("last_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const service_area = String(formData.get("service_area") ?? "").trim();
  const categoriesRaw = String(formData.get("categories") ?? "").trim();

  if (!first_name || !last_name || !service_area) {
    return { error: "First name, last name, and service area are required" };
  }

  const categories = categoriesRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const provider = user.app_metadata.provider === "google" ? "google" : "email";

  try {
    await createVolunteerProfile(supabase, {
      id: user.id,
      first_name,
      last_name,
      email: user.email ?? "",
      phone: phone || undefined,
      categories,
      service_area,
      auth_provider: provider,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create profile" };
  }

  redirect("/volunteer/dashboard");
}
