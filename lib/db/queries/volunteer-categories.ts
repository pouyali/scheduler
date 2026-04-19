import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { slugify } from "@/lib/utils/slugify";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["volunteer_categories"]["Row"];

export type ListCategoriesOptions = {
  includeArchived?: boolean;
};

export async function listCategories(
  supabase: Client,
  opts: ListCategoriesOptions = {},
): Promise<Row[]> {
  let q = supabase.from("volunteer_categories").select("*").order("name", { ascending: true });
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getCategoryBySlug(supabase: Client, slug: string): Promise<Row | null> {
  const { data, error } = await supabase
    .from("volunteer_categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCategory(
  supabase: Client,
  input: { name: string; description?: string },
): Promise<Row> {
  const base = slugify(input.name);
  if (!base) throw new Error("Name produces an empty slug");

  // Try slug, slug_2, slug_3 ... until insert succeeds or we give up.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt === 0 ? base : `${base}_${attempt + 1}`;
    const { data, error } = await supabase
      .from("volunteer_categories")
      .insert({ slug: candidate, name: input.name, description: input.description })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw error;    // not a unique-violation → real error
  }
  throw new Error("Unable to generate a unique slug after 10 attempts");
}

export async function updateCategory(
  supabase: Client,
  id: string,
  input: { name: string; description?: string },
): Promise<Row> {
  const { data, error } = await supabase
    .from("volunteer_categories")
    .update({ name: input.name, description: input.description })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveCategory(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase
    .from("volunteer_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function unarchiveCategory(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase
    .from("volunteer_categories")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
}
