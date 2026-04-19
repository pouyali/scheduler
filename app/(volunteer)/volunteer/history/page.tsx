import Link from "next/link";
import { requireActiveVolunteer } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function VolunteerHistoryPage() {
  const user = await requireActiveVolunteer();
  const supabase = await createSupabaseServerClient();

  const today = new Date().toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_date, status,
      seniors:seniors(first_name, last_name)
    `)
    .eq("assigned_volunteer_id", user.userId)
    .or(`status.eq.completed,and(status.eq.accepted,requested_date.lt.${today})`)
    .order("requested_date", { ascending: false })
    .limit(200);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">History</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>Date</th><th>Senior</th><th>Category</th><th>Status</th></tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => {
            const s = (r as unknown as { seniors: { first_name: string; last_name: string } }).seniors;
            return (
              <tr key={r.id} className="border-t">
                <td className="py-2">{r.requested_date}</td>
                <td><Link href={`/volunteer/requests/${r.id}`} className="text-blue-600 underline">{s.first_name} {s.last_name}</Link></td>
                <td>{r.category}</td>
                <td>{r.status}</td>
              </tr>
            );
          })}
          {(rows ?? []).length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-500">No past assignments yet.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
