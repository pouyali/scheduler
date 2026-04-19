import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listServiceRequests } from "@/lib/db/queries/service-requests";
import { RequestsFilters } from "./requests-filters";

type Search = { status?: string; dateFrom?: string; dateTo?: string };

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = (sp.status ?? "open") as
    | "all"
    | "open"
    | "notified"
    | "accepted"
    | "completed"
    | "cancelled";

  const supabase = await createSupabaseServerClient();
  const { rows } = await listServiceRequests(supabase, {
    status,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    limit: 100,
  });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Service requests</h1>
        <Link
          href="/admin/requests/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          New request
        </Link>
      </header>

      <RequestsFilters currentStatus={status} />

      <table className="w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-2">Date</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2">{r.requested_date}</td>
              <td>{r.category}</td>
              <td>{r.priority}</td>
              <td>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{r.status}</span>
              </td>
              <td className="text-right">
                <Link href={`/admin/requests/${r.id}`} className="text-blue-600 underline">
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-500">
                No requests match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
