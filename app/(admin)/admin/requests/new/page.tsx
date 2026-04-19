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
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">New service request</h1>
      <NewRequestForm categories={cats ?? []} />
    </section>
  );
}
