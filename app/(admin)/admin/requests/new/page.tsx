import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewRequestForm } from "./new-request-form";

export default async function NewRequestPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: cats } = await supabase
    .from("volunteer_categories")
    .select("slug, name")
    .is("archived_at", null)
    .order("name");
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h2 className="text-h2">New service request</h2>
      <NewRequestForm categories={cats ?? []} />
    </div>
  );
}
