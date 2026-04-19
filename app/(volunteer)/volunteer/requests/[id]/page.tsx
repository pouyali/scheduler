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
      id, category, requested_date, description, status,
      seniors:seniors(first_name, last_name, address_line1, address_line2, city, province, postal_code, phone)
    `)
    .eq("id", id)
    .eq("assigned_volunteer_id", user.userId)
    .maybeSingle();
  if (!r) notFound();

  const s = (r as unknown as { seniors: { first_name: string; last_name: string; address_line1: string; address_line2: string | null; city: string; province: string; postal_code: string; phone: string } }).seniors;

  return (
    <section className="mx-auto max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold">{s.first_name} {s.last_name}</h1>
      <p className="text-gray-700">{r.category} · {r.requested_date}</p>
      <p>{s.address_line1}{s.address_line2 ? `, ${s.address_line2}` : ""}<br />{s.city}, {s.province} {s.postal_code}</p>
      <p>{s.phone}</p>
      {r.description && <p className="whitespace-pre-wrap">{r.description}</p>}
    </section>
  );
}
