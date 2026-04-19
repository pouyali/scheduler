import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { VolunteerForm } from "./volunteer-form";

export default async function NewVolunteerPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const categories = await listCategories(supabase);
  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-h2">Add volunteer</h2>
      <p className="text-sm text-muted-foreground">
        An invite email will be sent. The volunteer sets their own password, and their account is
        active immediately.
      </p>
      <VolunteerForm categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
    </div>
  );
}
