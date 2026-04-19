import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listServiceRequests, getNotificationCountsByRequest } from "@/lib/db/queries/service-requests";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
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
  const counts = await getNotificationCountsByRequest(supabase, rows.map(r => r.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h2">Service requests</h2>
        <Button asChild>
          <Link href="/admin/requests/new">New request</Link>
        </Button>
      </div>

      <RequestsFilters currentStatus={status} />

      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2">Date</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t hover:bg-muted">
              <td className="py-2">{new Date(r.requested_at).toLocaleString("en-CA", {
                timeZone: "America/Toronto",
                year: "numeric", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}</td>
              <td>{r.category}</td>
              <td>
                <StatusBadge variant={r.priority as "low" | "normal" | "high"}>{r.priority}</StatusBadge>
              </td>
              <td>
                <StatusBadge variant={r.status as "open" | "notified" | "accepted" | "completed" | "cancelled"}>{r.status}</StatusBadge>
                {(r.status === "notified" || r.status === "accepted") && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    sent {counts.get(r.id)?.sent ?? 0} · accepted {counts.get(r.id)?.accepted ?? 0}
                  </span>
                )}
              </td>
              <td className="text-right">
                <Link href={`/admin/requests/${r.id}`} className="underline underline-offset-2">
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted-foreground">
                No requests match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
