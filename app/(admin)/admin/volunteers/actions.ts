"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import {
  approveVolunteer,
  rejectVolunteer,
  reactivateVolunteer,
} from "@/lib/db/queries/volunteers";

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
