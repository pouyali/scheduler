import Link from "next/link";
import type { DashboardActivityEvent } from "@/lib/db/queries/service-requests";

function relative(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ events }: { events: DashboardActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div>
        <h3 className="text-h3">Recent activity</h3>
        <p className="mt-2 text-muted-foreground text-sm">No activity yet.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-h3">Recent activity</h3>
      <ol className="mt-2 space-y-1 text-sm">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3">
            <time className="w-24 text-muted-foreground">{relative(e.at)}</time>
            <Link href={`/admin/requests/${e.requestId}`} className="hover:underline">{e.text}</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
