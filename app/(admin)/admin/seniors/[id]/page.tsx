import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSenior } from "@/lib/db/queries/seniors";
import { SeniorEdit } from "./senior-edit";
import { DangerZone } from "./danger-zone";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function SeniorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const senior = await getSenior(supabase, id);
  if (!senior) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/seniors" className="text-sm underline">
          ← Back to seniors
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h2 className="text-xl font-semibold">
            {senior.first_name} {senior.last_name}
          </h2>
          {senior.archived_at ? <StatusBadge variant="archived">Archived</StatusBadge> : null}
          {senior.lat === null ? (
            <StatusBadge variant="not-geocoded">No location</StatusBadge>
          ) : null}
        </div>
      </div>

      <SeniorEdit senior={senior} />

      <section>
        <h3 className="text-sm font-semibold">Related activity</h3>
        <p className="text-sm text-muted-foreground">
          No requests yet. (Service requests ship in the next sub-project.)
        </p>
      </section>

      <DangerZone
        id={senior.id}
        fullName={`${senior.first_name} ${senior.last_name}`}
        archived={senior.archived_at !== null}
      />
    </div>
  );
}
