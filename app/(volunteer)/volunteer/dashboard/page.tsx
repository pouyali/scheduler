import { getUserRole } from "@/lib/auth/roles";

export default async function VolunteerDashboardPage() {
  const role = await getUserRole();
  const status = role.role === "volunteer" ? role.status : undefined;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      {status === "pending" ? (
        <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm">
          Your account is awaiting admin approval. You&apos;ll receive an email when it&apos;s
          active.
        </div>
      ) : null}
      {status === "inactive" ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
          Your account is inactive. Contact an admin if this is unexpected.
        </div>
      ) : null}
      {status === "active" ? (
        <p className="text-muted-foreground text-sm">
          No pending invites. Feature sub-projects will light this up.
        </p>
      ) : null}
    </div>
  );
}
