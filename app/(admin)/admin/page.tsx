import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDashboardCounts,
  listUpcomingRequestsForDashboard,
  listRecentActivity,
} from "@/lib/db/queries/service-requests";
import { StatRow } from "./dashboard/stat-row";
import { UpcomingList } from "./dashboard/upcoming-list";
import { ActivityFeed } from "./dashboard/activity-feed";
import { DevTools } from "./dev-tools";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [counts, upcoming, activity] = await Promise.all([
    getDashboardCounts(supabase),
    listUpcomingRequestsForDashboard(supabase, { days: 7, limit: 10 }),
    listRecentActivity(supabase, 20),
  ]);

  const showDevTools =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";

  return (
    <div className="space-y-6">
      <h2 className="text-h2">Dashboard</h2>
      <StatRow counts={counts} />
      <UpcomingList rows={upcoming} />
      <ActivityFeed events={activity} />
      {showDevTools ? <DevTools /> : null}
    </div>
  );
}
