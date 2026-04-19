"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import { format } from "date-fns/format";
import { parse } from "date-fns/parse";
import { startOfWeek } from "date-fns/startOfWeek";
import { getDay } from "date-fns/getDay";
import { enCA } from "date-fns/locale/en-CA";
import type { CalendarEvent } from "@/lib/db/queries/service-requests";
import { CalendarFilters, type Filters } from "./calendar-filters";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-CA": enCA },
});

export function CalendarShell({
  events,
  categories,
  volunteers,
  fetchedFrom,
  fetchedTo,
}: {
  events: CalendarEvent[];
  categories: { slug: string; name: string }[];
  volunteers: { id: string; first_name: string; last_name: string }[];
  fetchedFrom: string;
  fetchedTo: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [view, setView] = useState<View>("month");

  const filters: Filters = useMemo(
    () => ({
      status:
        (sp
          .get("status")
          ?.split(",")
          .filter(Boolean) as Filters["status"]) ??
        (["open", "notified", "accepted"] as Filters["status"]),
      category:
        sp.get("category")?.split(",").filter(Boolean) ??
        categories.map((c) => c.slug),
      assignee: sp.get("assignee") ?? "all",
    }),
    [sp, categories],
  );

  const visible = useMemo(
    () =>
      events.filter((e) => {
        if (!filters.status.includes(e.resource.status)) return false;
        if (!filters.category.includes(e.resource.category)) return false;
        if (filters.assignee === "unassigned" && e.resource.assigneeId)
          return false;
        if (
          filters.assignee !== "all" &&
          filters.assignee !== "unassigned" &&
          filters.assignee !== e.resource.assigneeId
        )
          return false;
        return true;
      }),
    [events, filters],
  );

  const onChange = (next: Filters) => {
    const params = new URLSearchParams();
    if (next.status.length) params.set("status", next.status.join(","));
    if (next.category.length) params.set("category", next.category.join(","));
    if (next.assignee !== "all") params.set("assignee", next.assignee);
    router.replace(`/admin/calendar?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <CalendarFilters
        value={filters}
        categories={categories}
        volunteers={volunteers}
        onChange={onChange}
      />
      <p className="text-xs text-muted-foreground">
        Showing events between {fetchedFrom.slice(0, 10)} and{" "}
        {fetchedTo.slice(0, 10)}. Navigate beyond this range and reload to
        recentre.
      </p>
      <div style={{ height: 640 }}>
        {/* CalendarEvent satisfies react-big-calendar's Event interface (title, start, end,
            resource). Using the generic form Calendar<CalendarEvent> threads the type
            through to onSelectEvent and eventPropGetter, avoiding any casts there. */}
        <Calendar<CalendarEvent>
          localizer={localizer}
          events={visible}
          views={["month", "week", "agenda"]}
          view={view}
          onView={setView}
          defaultView="month"
          onSelectEvent={(e) =>
            router.push(`/admin/requests/${e.resource.requestId}`)
          }
          eventPropGetter={(e) => ({
            className: `rbc-event--${e.resource.status}`,
          })}
        />
      </div>
    </div>
  );
}
