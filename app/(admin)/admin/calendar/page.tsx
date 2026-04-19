import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCalendarEvents } from "@/lib/db/queries/service-requests";
import { CalendarShell } from "./calendar-shell";

export default async function AdminCalendarPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString();
  const to = new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString();

  const [events, catsRes, volsRes] = await Promise.all([
    listCalendarEvents(supabase, { from, to }),
    supabase
      .from("volunteer_categories")
      .select("slug, name")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("volunteers")
      .select("id, first_name, last_name")
      .eq("status", "active")
      .order("last_name"),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-h2">Calendar</h2>
      <CalendarShell
        events={events}
        categories={catsRes.data ?? []}
        volunteers={volsRes.data ?? []}
        fetchedFrom={from}
        fetchedTo={to}
      />
    </div>
  );
}
