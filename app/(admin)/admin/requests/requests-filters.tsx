import Link from "next/link";

type StatusTab = "all" | "open" | "notified" | "accepted" | "completed" | "cancelled";

const TABS: { key: StatusTab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "notified", label: "Notified" },
  { key: "accepted", label: "Accepted" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export function RequestsFilters({ currentStatus }: { currentStatus: StatusTab }) {
  return (
    <nav className="flex gap-2 border-b">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === "all" ? "/admin/requests" : `/admin/requests?status=${t.key}`}
          aria-current={t.key === currentStatus ? "page" : undefined}
          className={`px-3 py-2 text-sm ${
            t.key === currentStatus ? "border-b-2 border-black font-semibold" : "text-gray-600"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
