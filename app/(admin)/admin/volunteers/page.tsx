import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listVolunteers, countVolunteers } from "@/lib/db/queries/volunteers";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { VolunteerRowActions } from "./volunteer-row-actions";

type SearchParams = Promise<{
  status?: "all" | "pending" | "active" | "inactive";
  q?: string;
}>;

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
] as const;

export default async function AdminVolunteersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.status ?? "all";
  const q = sp.q ?? "";
  const supabase = await createSupabaseServerClient();
  const [list, pendingCount, categories] = await Promise.all([
    listVolunteers(supabase, { status: tab, q }),
    countVolunteers(supabase, { status: "pending" }),
    listCategories(supabase),
  ]);

  const categoryNameBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h2">Volunteers</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/volunteers/categories">Categories</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/volunteers/new">Add volunteer</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          const href = `/admin/volunteers?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
          const showBadge = t.key === "pending" && pendingCount > 0;
          return (
            <Link
              key={t.key}
              href={href}
              className={`rounded-[var(--radius)] px-3 py-1.5 text-sm ${
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
              {showBadge ? (
                <span className="ml-2 rounded-full bg-foreground px-1.5 py-0.5 text-xs text-background">
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          );
        })}
        <form action="/admin/volunteers" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="status" value={tab} />
          <Input name="q" defaultValue={q} placeholder="Search name or email" className="w-60" />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      {list.rows.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No volunteers match.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Categories</th>
              <th>Service area</th>
              <th>Status</th>
              <th className="w-[220px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((v) => (
              <tr key={v.id} className="hover:bg-muted">
                <td className="py-2">
                  <Link
                    href={`/admin/volunteers/${v.id}`}
                    className="text-foreground underline underline-offset-2"
                  >
                    {v.first_name} {v.last_name}
                  </Link>
                </td>
                <td className="text-xs">{v.email}</td>
                <td className="text-xs">
                  {v.categories.map((s) => categoryNameBySlug[s] ?? s).join(", ")}
                </td>
                <td className="text-xs">{v.service_area ?? ""}</td>
                <td>
                  {v.status === "active" ? (
                    <StatusBadge variant="active">Active</StatusBadge>
                  ) : v.status === "pending" ? (
                    <StatusBadge variant="not-geocoded">Pending</StatusBadge>
                  ) : (
                    <StatusBadge variant="archived">Inactive</StatusBadge>
                  )}
                </td>
                <td>
                  <VolunteerRowActions id={v.id} status={v.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
