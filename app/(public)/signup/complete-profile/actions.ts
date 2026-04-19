"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createVolunteerProfile } from "@/lib/db/queries/volunteers";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { completeProfileSchema } from "@/lib/validations/volunteers";

export type CompleteProfileState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

export async function completeProfileAction(
  _prev: CompleteProfileState,
  formData: FormData,
): Promise<CompleteProfileState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { error: "Not authenticated" };

  const rawCategories = formData.getAll("categories").map(String);
  const parsed = completeProfileSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone"),
    categories: rawCategories,
    service_area: formData.get("service_area"),
    home_address: formData.get("home_address"),
    home_lat: formData.get("home_lat"),
    home_lng: formData.get("home_lng"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const activeCategories = await listCategories(supabase);
  const activeSlugs = new Set(activeCategories.map((c) => c.slug));
  const invalid = parsed.data.categories.filter((s) => !activeSlugs.has(s));
  if (invalid.length > 0) {
    return { error: `Unknown categories: ${invalid.join(", ")}` };
  }

  const provider = user.app_metadata.provider === "google" ? "google" : "email";

  try {
    await createVolunteerProfile(supabase, {
      id: user.id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: user.email ?? "",
      phone: parsed.data.phone,
      categories: parsed.data.categories,
      service_area: parsed.data.service_area,
      home_address: parsed.data.home_address,
      home_lat: parsed.data.home_lat,
      home_lng: parsed.data.home_lng,
      auth_provider: provider,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create profile" };
  }

  redirect("/volunteer/dashboard");
}
