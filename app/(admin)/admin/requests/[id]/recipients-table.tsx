import type { RecipientRow } from "@/lib/db/queries/service-requests";
import { StatusBadge } from "@/components/ui/status-badge";
import { RetryButton } from "./retry-button";

export function RecipientsTable({ rows }: { rows: RecipientRow[] }) {
  const summary = {
    total: rows.length,
    accepted: rows.filter(r => r.token_action === "accept").length,
    declined: rows.filter(r => r.token_action === "decline").length,
    superseded: rows.filter(r => r.token_action === "superseded").length,
    pending: rows.filter(r => r.token_action === null).length,
    failed: rows.filter(r => r.notification_status === "failed").length,
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Recipients</h2>
      <p className="text-sm text-muted-foreground">
        Sent to {summary.total} · {summary.accepted} accepted · {summary.declined} declined · {summary.pending} pending
        {summary.superseded > 0 && ` · ${summary.superseded} superseded`}
        {summary.failed > 0 && ` · ${summary.failed} failed`}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border"><th className="py-2">Volunteer</th><th>Sent</th><th>State</th><th>Response</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const state =
              r.token_action === "accept" ? "accepted" :
              r.token_action === "decline" ? "declined" :
              r.token_action === "superseded" ? "superseded" :
              r.notification_status === "failed" ? "failed" :
              "pending";
            return (
              <tr key={r.notification_id} className="border-t hover:bg-muted">
                <td className="py-2">{r.volunteer_first_name} {r.volunteer_last_name}</td>
                <td>{new Date(r.sent_at).toLocaleString("en-CA")}</td>
                <td>
                  <StatusBadge variant={state as "accepted" | "declined" | "superseded" | "failed" | "pending"}>{state}</StatusBadge>
                </td>
                <td>{r.token_used_at ? new Date(r.token_used_at).toLocaleString("en-CA") : "—"}</td>
                <td>{state === "failed" && <RetryButton notificationId={r.notification_id} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
