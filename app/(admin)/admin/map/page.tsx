import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSeniors } from "@/lib/db/queries/seniors";
import { MapView, type MapPin } from "@/components/map/MapView";
import { Button } from "@/components/ui/button";

type SearchParams = Promise<{ city?: string }>;

export default async function AdminMapPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const activeResult = await listSeniors(supabase, { limit: 1000, city: sp.city });
  const active = activeResult.rows;
  const geocoded = active.filter((s) => s.lat !== null && s.lng !== null);
  const missing = active.length - geocoded.length;

  const cities = Array.from(new Set(active.map((s) => s.city))).sort();
  const pins: MapPin[] = geocoded.map((s) => ({
    id: s.id,
    lat: s.lat as number,
    lng: s.lng as number,
    popupHtml: `<div style="font-size:13px">
      <strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong><br/>
      ${escapeHtml(s.city)}<br/>
      <a href="/admin/seniors/${s.id}">Open detail →</a>
    </div>`,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-h2">Seniors map</h2>
        {missing > 0 ? (
          <Link
            href="/admin/seniors?not_geocoded=true"
            className="text-sm italic text-muted-foreground underline underline-offset-2"
          >
            {missing} seniors not shown (no coordinates) — fix
          </Link>
        ) : null}
      </div>
      <div className="border border-border rounded-[var(--radius-lg)] bg-card p-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-sm text-muted-foreground">City</span>
          <Button asChild variant="pill" size="sm" className="shrink-0">
            <Link href="/admin/map">All</Link>
          </Button>
          {cities.map((c) => (
            <Button key={c} asChild variant="pill" size="sm" className="shrink-0">
              <Link href={`/admin/map?city=${encodeURIComponent(c)}`}>{c}</Link>
            </Button>
          ))}
        </div>
      </div>
      <MapView
        pins={pins}
        cluster
        className="h-[70vh] w-full rounded-[var(--radius-lg)] border border-border"
      />
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
