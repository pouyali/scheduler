"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import {
  seniorCreateSchema,
  seniorUpdateSchema,
} from "@/lib/validations/seniors";
import {
  getSenior,
  insertSenior,
  setArchived,
  updateSeniorRow,
} from "@/lib/db/queries/seniors";
import { geocodeAddress } from "@/lib/mapbox/geocode";

function fullAddress(input: {
  address_line1: string;
  city: string;
  province: string;
  postal_code: string;
}) {
  return `${input.address_line1}, ${input.city}, ${input.province}, ${input.postal_code}, Canada`;
}

export async function createSenior(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = seniorCreateSchema.parse(Object.fromEntries(formData));
  const supabase = await createSupabaseServerClient();

  const geo = await geocodeAddress(fullAddress(parsed));
  const row = await insertSenior(supabase, {
    ...parsed,
    lat: geo.ok ? geo.lat : null,
    lng: geo.ok ? geo.lng : null,
    created_by: admin.userId,
  });

  revalidatePath("/admin/seniors");
  redirect(`/admin/seniors/${row.id}`);
}

export async function updateSenior(id: string, formData: FormData) {
  await requireAdmin();
  const parsed = seniorUpdateSchema.parse(Object.fromEntries(formData));
  const supabase = await createSupabaseServerClient();

  let lat: number | null = parsed.lat ?? null;
  let lng: number | null = parsed.lng ?? null;

  if (!parsed.manual_pin_override) {
    const geo = await geocodeAddress(fullAddress(parsed));
    lat = geo.ok ? geo.lat : null;
    lng = geo.ok ? geo.lng : null;
  }

  const { manual_pin_override: _ignored, lat: _a, lng: _b, ...rest } = parsed;
  await updateSeniorRow(supabase, id, { ...rest, lat, lng });

  revalidatePath("/admin/seniors");
  revalidatePath(`/admin/seniors/${id}`);
}

export async function archiveSenior(id: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await setArchived(supabase, id, true);
  revalidatePath("/admin/seniors");
  revalidatePath(`/admin/seniors/${id}`);
}

export async function unarchiveSenior(id: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await setArchived(supabase, id, false);
  revalidatePath("/admin/seniors");
  revalidatePath(`/admin/seniors/${id}`);
}

export async function permanentlyDeleteSenior(id: string, typedName: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const senior = await getSenior(supabase, id);
  if (!senior) throw new Error("Senior not found");
  const expected = `${senior.first_name} ${senior.last_name}`;
  if (typedName.trim() !== expected) {
    throw new Error("Typed name does not match");
  }
  const { error } = await supabase.rpc("delete_senior_cascade", { p_senior_id: id });
  if (error) throw error;
  revalidatePath("/admin/seniors");
  redirect("/admin/seniors?archived=true");
}
