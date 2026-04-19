import { notFound } from "next/navigation";
import { requireActiveVolunteer } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function VolunteerRequestDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const user = await requireActiveVolunteer();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: r } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_at, description, status,
      seniors:seniors(first_name, last_name, address_line1, address_line2, city, province, postal_code, phone)
    `)
    .eq("id", id)
    .eq("assigned_volunteer_id", user.userId)
    .maybeSingle();
  if (!r) notFound();

  const s = (r as unknown as { seniors: { first_name: string; last_name: string; address_line1: string; address_line2: string | null; city: string; province: string; postal_code: string; phone: string } }).seniors;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <h2 className="text-h2">{s.first_name} {s.last_name}</h2>
      <p className="text-sm text-muted-foreground">
        {r.category} · {new Date((r as unknown as { requested_at: string }).requested_at).toLocaleString("en-CA", {
          timeZone: "America/Toronto",
          year: "numeric", month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit",
        })}
      </p>
      <p className="text-sm">{s.address_line1}{s.address_line2 ? `, ${s.address_line2}` : ""}<br />{s.city}, {s.province} {s.postal_code}</p>
      <p className="text-sm">{s.phone}</p>
      {r.description && <p className="whitespace-pre-wrap text-sm">{r.description}</p>}
    </div>
  );
}
