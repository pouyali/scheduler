import { requireAdmin } from "@/lib/auth/roles";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <nav className="space-y-2 border-r p-4">
        <h1 className="font-semibold">Admin</h1>
        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/admin">Dashboard</Link>
          </li>
          <li>
            <Link href="/admin/volunteers">Volunteers</Link>
          </li>
          <li>
            <Link href="/admin/seniors">Seniors</Link>
          </li>
          <li>
            <Link href="/admin/requests">Requests</Link>
          </li>
          <li>
            <Link href="/admin/calendar">Calendar</Link>
          </li>
          <li>
            <Link href="/admin/map">Map</Link>
          </li>
          <li>
            <Link href="/admin/analytics">Analytics</Link>
          </li>
        </ul>
        <form action="/logout" method="post" className="pt-4">
          <button className="text-sm underline">Log out</button>
        </form>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
