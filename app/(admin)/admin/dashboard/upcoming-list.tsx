import Link from "next/link";
import type { UpcomingRow } from "@/lib/db/queries/service-requests";
import { StatusBadge } from "@/components/ui/status-badge";

const DT_FMT: Intl.DateTimeFormatOptions = {
  timeZone: "America/Toronto",
  weekday: "short", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit",
};

export function UpcomingList({ rows }: { rows: UpcomingRow[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="text-h3">Upcoming requests</h3>
        <p className="mt-2 text-muted-foreground text-sm">Nothing scheduled this week.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-h3">Upcoming requests</h3>
      <ul className="mt-2 divide-y divide-border rounded-[var(--radius)] border border-border">
        {rows.map(r => (
          <li key={r.id} className="p-3">
            <Link href={`/admin/requests/${r.id}`} className="flex items-center gap-3 hover:underline">
              <span className="text-sm w-48">{new Date(r.requested_at).toLocaleString("en-CA", DT_FMT)}</span>
              <StatusBadge variant={r.status}>{r.status}</StatusBadge>
              <span className="text-sm">{r.senior_first_name} · {r.category}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
