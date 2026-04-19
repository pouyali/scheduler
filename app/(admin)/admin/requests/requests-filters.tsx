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
    <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
      {TABS.map((t) => {
        const active = t.key === currentStatus;
        return (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/requests" : `/admin/requests?status=${t.key}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-[var(--radius)] px-3 py-1.5 text-sm ${
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
