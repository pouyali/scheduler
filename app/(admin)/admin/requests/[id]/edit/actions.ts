"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateServiceRequest, type UpdateInput } from "@/lib/db/queries/service-requests";

const Schema = z.object({
  senior_id: z.string().uuid().optional(),
  category: z.string().min(1).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function updateRequestAction(id: string, input: unknown) {
  await requireAdmin();
  const parsed = Schema.parse(input);
  const supabase = await createSupabaseServerClient();
  try {
    await _updateRequestForAdmin(supabase, id, parsed);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  revalidatePath(`/admin/requests/${id}`);
  redirect(`/admin/requests/${id}`);
}

export async function _updateRequestForAdmin(
  supabase: SupabaseClient<Database>, id: string, input: UpdateInput,
) {
  return updateServiceRequest(supabase, id, input);
}
