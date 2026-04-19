import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceRequestById, listRecipientsForRequest } from "@/lib/db/queries/service-requests";
import { rankEligibleVolunteers } from "@/lib/matching/eligibility";
import { DetailHeader } from "./detail-header";
import { EligiblePicker } from "./eligible-picker";
import { RecipientsTable } from "./recipients-table";
import { ActivityLog } from "./activity-log";
import { ActionMenu } from "./action-menu";

export default async function RequestDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const request = await getServiceRequestById(supabase, id);
  if (!request) notFound();

  const { data: senior } = await supabase.from("seniors").select("*").eq("id", request.senior_id).single();
  if (!senior) notFound();

  const { data: assignee } = request.assigned_volunteer_id
    ? await supabase.from("volunteers").select("first_name, last_name").eq("id", request.assigned_volunteer_id).single()
    : { data: null };

  let ranked: ReturnType<typeof rankEligibleVolunteers> = [];
  if (request.status === "open") {
    const { data: vols } = await supabase
      .from("volunteers")
      .select("id, first_name, last_name, categories, service_area, status")
      .eq("status", "active");
    ranked = rankEligibleVolunteers(vols ?? [], { city: senior.city }, request.category);
  }

  let reassignChoices: { id: string; label: string }[] = [];
  if (request.status === "accepted") {
    const { data: vols } = await supabase
      .from("volunteers")
      .select("id, first_name, last_name, categories, service_area, status")
      .eq("status", "active");
    const ranked2 = rankEligibleVolunteers(vols ?? [], { city: senior.city }, request.category);
    reassignChoices = ranked2
      .filter(v => v.id !== request.assigned_volunteer_id)
      .map(v => ({ id: v.id, label: `${v.first_name} ${v.last_name}${v.inArea ? " (in-area)" : ""}` }));
  }

  const recipients = ["notified", "accepted", "completed", "cancelled"].includes(request.status)
    ? await listRecipientsForRequest(supabase, request.id)
    : [];

  return (
    <section className="space-y-6">
      <DetailHeader
        request={request}
        senior={senior}
        assigneeName={assignee ? `${assignee.first_name} ${assignee.last_name}` : null}
      />
      <ActionMenu id={request.id} status={request.status} eligibleForReassign={reassignChoices} />
      {request.status === "open" && <EligiblePicker requestId={request.id} volunteers={ranked} />}
      {recipients.length > 0 && <RecipientsTable rows={recipients} />}
      <ActivityLog request={request} recipients={recipients} />
    </section>
  );
}
