"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/roles";
import {
  approveVolunteer,
  rejectVolunteer,
  reactivateVolunteer,
  findVolunteerByEmail,
  createVolunteerProfile,
} from "@/lib/db/queries/volunteers";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { adminCreateVolunteerSchema } from "@/lib/validations/volunteers";
import { renderVolunteerInvite } from "@/lib/notifications/templates/volunteer-invite";
import { createNotificationService } from "@/lib/notifications/factory";

export async function approveVolunteerAction(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await approveVolunteer(supabase, id, admin.userId);
  revalidatePath("/admin/volunteers");
}

export async function rejectVolunteerAction(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await rejectVolunteer(supabase, id);
  revalidatePath("/admin/volunteers");
}

export async function reactivateVolunteerAction(id: string): Promise<void> {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await reactivateVolunteer(supabase, id, admin.userId);
  revalidatePath("/admin/volunteers");
}

export type CreateVolunteerState =
  | { error?: string; fieldErrors?: Record<string, string>; existingId?: string }
  | undefined;

export async function createVolunteerAction(
  _prev: CreateVolunteerState,
  formData: FormData,
): Promise<CreateVolunteerState> {
  const admin = await requireAdmin();

  const rawCategories = formData.getAll("categories").map(String);
  const parsed = adminCreateVolunteerSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
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

  const serverSupabase = await createSupabaseServerClient();
  const adminSupabase = createSupabaseAdminClient();

  // Validate categories against the DB — all slugs must be active.
  const activeCategories = await listCategories(serverSupabase);
  const activeSlugs = new Set(activeCategories.map((c) => c.slug));
  const invalid = parsed.data.categories.filter((s) => !activeSlugs.has(s));
  if (invalid.length > 0) {
    return { error: `Unknown categories: ${invalid.join(", ")}` };
  }

  // Dup-check volunteers by email.
  const existingVolunteer = await findVolunteerByEmail(serverSupabase, parsed.data.email);
  if (existingVolunteer) {
    return {
      error: "A volunteer with that email already exists.",
      existingId: existingVolunteer.id,
    };
  }

  // Dup-check auth.users.
  const { data: users } = await adminSupabase.auth.admin.listUsers();
  const authHit = users?.users.find(
    (u) => (u.email ?? "").toLowerCase() === parsed.data.email.toLowerCase(),
  );
  if (authHit) {
    return {
      error:
        "An account with that email already exists in auth. Ask the user to finish their own signup, or use a different email.",
    };
  }

  // Generate the invite. Supabase sends the email; we pass the redirect URL via the token link.
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
  const { data: invited, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo },
  );
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Failed to send invite" };
  }

  // Also send an on-brand welcome email via NotificationService.
  const action = await adminSupabase.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email,
    options: { redirectTo },
  });
  const inviteUrl = action.data?.properties?.action_link ?? redirectTo;
  const email = renderVolunteerInvite({ firstName: parsed.data.first_name, inviteUrl });
  await createNotificationService().sendEmail({
    to: parsed.data.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  // Insert the volunteers row (pending first via createVolunteerProfile), then flip to active.
  try {
    await createVolunteerProfile(adminSupabase, {
      id: invited.user.id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      categories: parsed.data.categories,
      service_area: parsed.data.service_area,
      home_address: parsed.data.home_address,
      home_lat: parsed.data.home_lat,
      home_lng: parsed.data.home_lng,
      auth_provider: "admin_invite",
    });
    await adminSupabase
      .from("volunteers")
      .update({
        status: "active",
        approved_at: new Date().toISOString(),
        approved_by: admin.userId,
      })
      .eq("id", invited.user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save volunteer profile" };
  }

  revalidatePath("/admin/volunteers");
  redirect(`/admin/volunteers/${invited.user.id}`);
}
