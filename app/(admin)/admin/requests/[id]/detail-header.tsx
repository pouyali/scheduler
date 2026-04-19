import type { Database } from "@/lib/db/types";

type Request = Database["public"]["Tables"]["service_requests"]["Row"];
type Senior = Pick<Database["public"]["Tables"]["seniors"]["Row"],
  "first_name" | "last_name" | "address_line1" | "city" | "province" | "postal_code" | "phone">;

export function DetailHeader({
  request, senior, assigneeName,
}: { request: Request; senior: Senior; assigneeName: string | null }) {
  return (
    <header className="space-y-1 border-b pb-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">
          {senior.first_name} {senior.last_name} — {request.category}
        </h1>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase">{request.status}</span>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs uppercase">{request.priority}</span>
      </div>
      <p className="text-sm text-gray-600">
        {request.requested_date} · {senior.address_line1}, {senior.city}, {senior.province} {senior.postal_code} · {senior.phone}
      </p>
      {assigneeName && <p className="text-sm">Assigned: <strong>{assigneeName}</strong></p>}
      {request.description && <p className="mt-2 whitespace-pre-wrap">{request.description}</p>}
    </header>
  );
}
