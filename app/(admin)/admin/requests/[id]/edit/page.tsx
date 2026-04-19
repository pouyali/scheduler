import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceRequestById } from "@/lib/db/queries/service-requests";
import { EditForm } from "./edit-form";

export default async function EditRequestPage({
  params,
}: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const request = await getServiceRequestById(supabase, id);
  if (!request) notFound();
  const { data: cats } = await supabase.from("volunteer_categories").select("slug, name").is("archived_at", null).order("name");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h2 className="text-h2">Edit request</h2>
      <EditForm
        requestId={request.id}
        locked={request.status === "notified"}
        defaults={{
          category: request.category,
          priority: request.priority,
          requested_date: request.requested_date,
          description: request.description,
        }}
        categories={cats ?? []}
      />
    </div>
  );
}
