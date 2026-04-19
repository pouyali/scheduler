import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSeniors, countsBySenior } from "@/lib/db/queries/seniors";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

type SearchParams = Promise<{
  q?: string;
  city?: string;
  archived?: string;
  not_geocoded?: string;
}>;

export default async function SeniorsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { rows } = await listSeniors(supabase, {
    q: sp.q,
    city: sp.city,
    archived: sp.archived === "true",
    notGeocoded: sp.not_geocoded === "true",
  });
  const counts = await countsBySenior(
    supabase,
    rows.map((r) => r.id),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h2">Seniors</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/seniors/import">Import CSV</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/seniors/new">New senior</Link>
          </Button>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/admin/seniors">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search name, phone, address"
          className="h-9 flex-1 rounded-[var(--radius)] border px-2 text-sm"
        />
        <input
          type="text"
          name="city"
          defaultValue={sp.city ?? ""}
          placeholder="City"
          className="h-9 w-40 rounded-[var(--radius)] border px-2 text-sm"
        />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="archived" value="true" defaultChecked={sp.archived === "true"} />
          Archived
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            name="not_geocoded"
            value="true"
            defaultChecked={sp.not_geocoded === "true"}
          />
          Not geocoded
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2">Name</th>
            <th>Phone</th>
            <th>City</th>
            <th>Open requests</th>
            <th>Last request</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted-foreground">
                No seniors match these filters.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const c = counts.get(r.id);
              return (
                <tr key={r.id} className="border-t hover:bg-muted">
                  <td className="py-2">
                    <Link href={`/admin/seniors/${r.id}`} className="underline">
                      {r.first_name} {r.last_name}
                    </Link>
                  </td>
                  <td>{r.phone}</td>
                  <td>{r.city}</td>
                  <td>{c?.openRequests ?? 0}</td>
                  <td>{c?.lastRequestDate ?? "—"}</td>
                  <td className="space-x-1">
                    {r.archived_at ? <StatusBadge variant="archived">Archived</StatusBadge> : null}
                    {r.lat === null ? (
                      <StatusBadge variant="not-geocoded">No location</StatusBadge>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
