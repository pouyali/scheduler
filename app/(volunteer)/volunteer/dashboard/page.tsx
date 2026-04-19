import { getUserRole } from "@/lib/auth/roles";

export default async function VolunteerDashboardPage() {
  const role = await getUserRole();
  const status = role.role === "volunteer" ? role.status : undefined;

  if (status === "inactive") {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-h2">Your application wasn&apos;t accepted</h2>
        <p className="text-sm text-muted-foreground">
          Thanks for your interest in Better At Home. If you believe this is a mistake or
          you&apos;d like to discuss, please contact the admin team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-h2">Dashboard</h2>
      {status === "pending" ? (
        <div className="rounded-[var(--radius-lg)] border border-border p-3 text-sm">
          Your account is awaiting admin approval. You&apos;ll receive an email when it&apos;s
          active.
        </div>
      ) : null}
      {status === "active" ? (
        <p className="text-sm text-muted-foreground">
          No pending invites. Feature sub-projects will light this up.
        </p>
      ) : null}
    </div>
  );
}
