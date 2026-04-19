import type { Database } from "@/lib/db/types";
import { StatusBadge } from "@/components/ui/status-badge";

type Request = Database["public"]["Tables"]["service_requests"]["Row"];
type Senior = Pick<Database["public"]["Tables"]["seniors"]["Row"],
  "first_name" | "last_name" | "address_line1" | "city" | "province" | "postal_code" | "phone">;

export function DetailHeader({
  request, senior, assigneeName,
}: { request: Request; senior: Senior; assigneeName: string | null }) {
  return (
    <header className="space-y-1 border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h2">
          {senior.first_name} {senior.last_name} — {request.category}
        </h2>
        <StatusBadge variant={request.status as "open" | "notified" | "accepted" | "completed" | "cancelled"}>{request.status}</StatusBadge>
        <StatusBadge variant={request.priority as "low" | "normal" | "high"}>{request.priority}</StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        {new Date(request.requested_at).toLocaleString("en-CA", {
          timeZone: "America/Toronto",
          year: "numeric", month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit",
        })} · {senior.address_line1}, {senior.city}, {senior.province} {senior.postal_code} · {senior.phone}
      </p>
      {assigneeName && <p className="text-sm">Assigned: <strong>{assigneeName}</strong></p>}
      {request.description && <p className="mt-2 whitespace-pre-wrap text-sm">{request.description}</p>}
    </header>
  );
}
