import type { Database } from "@/lib/db/types";
import type { RecipientRow } from "@/lib/db/queries/service-requests";

type Request = Database["public"]["Tables"]["service_requests"]["Row"];

type Event = { at: string; label: string };

export function ActivityLog({ request, recipients }: { request: Request; recipients: RecipientRow[] }) {
  const events: Event[] = [];
  events.push({ at: request.created_at, label: "Request created" });

  const sentInvites = recipients.filter(r => r.event_type === "invite");
  if (sentInvites.length > 0) {
    events.push({
      at: sentInvites[0].sent_at,
      label: `Sent to ${sentInvites.length} volunteer${sentInvites.length === 1 ? "" : "s"}`,
    });
  }

  for (const r of recipients) {
    if (r.token_used_at && r.token_action === "accept") {
      events.push({ at: r.token_used_at, label: `${r.volunteer_first_name} ${r.volunteer_last_name} accepted` });
    } else if (r.token_used_at && r.token_action === "decline") {
      events.push({ at: r.token_used_at, label: `${r.volunteer_first_name} ${r.volunteer_last_name} declined` });
    }
  }

  if (request.cancelled_at) events.push({ at: request.cancelled_at, label: "Cancelled" });
  if (request.reopened_at) events.push({ at: request.reopened_at, label: "Reopened" });
  if (request.completed_at) events.push({ at: request.completed_at, label: "Completed" });

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Activity</h2>
      <ol className="space-y-1 text-sm">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3">
            <time className="w-40 text-gray-500">{new Date(e.at).toLocaleString("en-CA")}</time>
            <span>{e.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
