import type { DashboardCounts } from "@/lib/db/queries/service-requests";
import { StatCard } from "./stat-card";

export function StatRow({ counts }: { counts: DashboardCounts }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard title="Open requests" count={counts.openRequests} href="/admin/requests?status=open" linkText="View open →" />
      <StatCard title="Awaiting response" count={counts.awaitingResponse} href="/admin/requests?status=notified" linkText="View notified →" />
      <StatCard title="Pending volunteers" count={counts.pendingVolunteers} href="/admin/volunteers?status=pending" linkText="Review →" />
      <StatCard title="Active seniors" count={counts.activeSeniors} href="/admin/seniors" linkText="View all →" />
    </div>
  );
}
