import Link from "next/link";
import { getUserRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InviteCard } from "./invite-card";

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

  if (status === "pending") {
    return (
      <div className="space-y-4">
        <h2 className="text-h2">Dashboard</h2>
        <div className="rounded-[var(--radius-lg)] border border-border p-3 text-sm">
          Your account is awaiting admin approval. You&apos;ll receive an email when it&apos;s
          active.
        </div>
      </div>
    );
  }

  if (status !== "active" || role.role !== "volunteer") {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  // Pending invites: tokens unused, unexpired, request not terminal.
  const { data: invites } = await supabase
    .from("response_tokens")
    .select(`
      request_id,
      service_requests:service_requests!inner(
        id, category, requested_at, description, status,
        seniors:seniors!inner(first_name, city)
      )
    `)
    .eq("volunteer_id", role.userId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .in("service_requests.status", ["open", "notified"]);

  const inviteCards = (invites ?? []).map((r) => {
    const req = (r as unknown as {
      service_requests: {
        id: string; category: string; requested_at: string; description: string | null;
        seniors: { first_name: string; city: string };
      };
    }).service_requests;
    return {
      requestId: req.id,
      category: req.category,
      requestedAt: req.requested_at,
      seniorFirstName: req.seniors.first_name,
      seniorCity: req.seniors.city,
      descriptionExcerpt: (req.description ?? "").slice(0, 180),
    };
  });

  const { data: upcoming } = await supabase
    .from("service_requests")
    .select(`
      id, category, requested_at, description,
      seniors:seniors(first_name, last_name, address_line1, city, phone)
    `)
    .eq("assigned_volunteer_id", role.userId)
    .eq("status", "accepted")
    .gte("requested_at", new Date().toISOString())
    .order("requested_at");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Pending invites</h2>
        {inviteCards.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No pending invites right now.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {inviteCards.map((i) => <InviteCard key={i.requestId} invite={i} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Upcoming accepted</h2>
        {(upcoming ?? []).length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Nothing scheduled yet.</p>
        ) : (
          <ul className="space-y-2">
            {(upcoming ?? []).map((r) => {
              const s = (r as unknown as { seniors: { first_name: string; last_name: string; address_line1: string; city: string; phone: string } }).seniors;
              return (
                <li key={r.id} className="rounded-[var(--radius-lg)] border border-border p-3">
                  <Link href={`/volunteer/requests/${r.id}`} className="font-medium underline underline-offset-2">
                    {s.first_name} {s.last_name} — {r.category}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {new Date((r as unknown as { requested_at: string }).requested_at).toLocaleString("en-CA", {
                      timeZone: "America/Toronto",
                      year: "numeric", month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })} · {s.address_line1}, {s.city} · {s.phone}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
