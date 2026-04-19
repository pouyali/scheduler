"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import {
  createCategorySchema,
  updateCategorySchema,
} from "@/lib/validations/volunteer-categories";
import {
  createCategory,
  updateCategory,
  archiveCategory,
  unarchiveCategory,
} from "@/lib/db/queries/volunteer-categories";

export type CategoryFormState = { error?: string; ok?: boolean } | undefined;

export async function createCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAdmin();
  const parsed = createCategorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createSupabaseServerClient();
  try {
    await createCategory(supabase, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create" };
  }
  revalidatePath("/admin/volunteers/categories");
  return { ok: true };
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = updateCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const supabase = await createSupabaseServerClient();
  await updateCategory(supabase, id, parsed.data);
  revalidatePath("/admin/volunteers/categories");
}

export async function archiveCategoryAction(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await archiveCategory(supabase, id);
  revalidatePath("/admin/volunteers/categories");
}

export async function unarchiveCategoryAction(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await unarchiveCategory(supabase, id);
  revalidatePath("/admin/volunteers/categories");
}
