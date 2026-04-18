import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/auth/roles";
import Link from "next/link";

export default async function VolunteerLayout({ children }: { children: React.ReactNode }) {
  const role = await getUserRole();
  if (role.role === "guest") redirect("/login");
  if (role.role === "admin") redirect("/admin");
  if (role.role === "incomplete") redirect("/signup/complete-profile");

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <nav className="space-y-2 border-r p-4">
        <h1 className="font-semibold">Volunteer</h1>
        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/volunteer/dashboard">Dashboard</Link>
          </li>
          <li>
            <Link href="/volunteer/history">History</Link>
          </li>
          <li>
            <Link href="/volunteer/profile">Profile</Link>
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
