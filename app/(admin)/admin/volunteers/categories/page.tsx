import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { CategoriesManager } from "./categories-manager";

export default async function VolunteerCategoriesPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const rows = await listCategories(supabase, { includeArchived: true });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-h2">Volunteer categories</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Rename anytime — the display name updates everywhere. Archiving hides the category from
          new selections but preserves it on existing volunteer records.
        </p>
      </div>
      <CategoriesManager
        rows={rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
          description: r.description,
          archived_at: r.archived_at,
        }))}
      />
    </div>
  );
}
