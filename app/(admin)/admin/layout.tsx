import { requireAdmin } from "@/lib/auth/roles";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/volunteers", label: "Volunteers" },
  { href: "/admin/seniors", label: "Seniors" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/map", label: "Map" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-background text-foreground">
      <aside className="flex flex-col gap-6 border-r border-border p-6">
        <h2 className="text-h3 font-semibold tracking-tight">Better At Home</h2>
        <nav aria-label="Primary" className="flex flex-col gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--radius)] px-3 py-2 text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/logout" method="post" className="mt-auto">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            Log out
          </Button>
        </form>
      </aside>
      <main className="px-4 py-6 md:px-8 md:py-12">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
