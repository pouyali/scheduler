"use client";

import type { Database } from "@/lib/db/types";

type Status = Database["public"]["Enums"]["request_status"];
const ALL_STATUSES: Status[] = ["open", "notified", "accepted", "completed", "cancelled"];

export type Filters = {
  status: Status[];
  category: string[];
  assignee: string; // volunteer UUID, "all", or "unassigned"
};

export function CalendarFilters({
  value,
  categories,
  volunteers,
  onChange,
}: {
  value: Filters;
  categories: { slug: string; name: string }[];
  volunteers: { id: string; first_name: string; last_name: string }[];
  onChange: (next: Filters) => void;
}) {
  const toggleStatus = (s: Status) => {
    const next = value.status.includes(s)
      ? value.status.filter((x) => x !== s)
      : [...value.status, s];
    onChange({ ...value, status: next });
  };

  const toggleCategory = (slug: string) => {
    const next = value.category.includes(slug)
      ? value.category.filter((x) => x !== slug)
      : [...value.category, slug];
    onChange({ ...value, category: next });
  };

  const setAssignee = (id: string) => onChange({ ...value, assignee: id });

  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="flex gap-1 flex-wrap">
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            aria-pressed={value.status.includes(s)}
            className={`rounded-[var(--radius)] border px-2 py-1 text-xs uppercase ${
              value.status.includes(s) ? "bg-muted" : "text-muted-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap">
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => toggleCategory(c.slug)}
            aria-pressed={value.category.includes(c.slug)}
            className={`rounded-[var(--radius)] border px-2 py-1 text-xs ${
              value.category.includes(c.slug) ? "bg-muted" : "text-muted-foreground"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <select
        value={value.assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="rounded-[var(--radius)] border px-2 py-1 text-sm"
      >
        <option value="all">All assignees</option>
        <option value="unassigned">Unassigned</option>
        {volunteers.map((v) => (
          <option key={v.id} value={v.id}>
            {v.first_name} {v.last_name}
          </option>
        ))}
      </select>
    </div>
  );
}
