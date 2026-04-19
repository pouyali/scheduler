import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVolunteerById } from "@/lib/db/queries/volunteers";
import { listCategories } from "@/lib/db/queries/volunteer-categories";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { VolunteerEdit } from "./volunteer-edit";
import {
  approveVolunteerAction,
  rejectVolunteerAction,
  reactivateVolunteerAction,
  resendInviteAction,
} from "../actions";

export default async function VolunteerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [volunteer, categories] = await Promise.all([
    getVolunteerById(supabase, id),
    listCategories(supabase, { includeArchived: true }),
  ]);
  if (!volunteer) notFound();

  const statusBadge =
    volunteer.status === "active" ? (
      <StatusBadge variant="active">Active</StatusBadge>
    ) : volunteer.status === "pending" ? (
      <StatusBadge variant="not-geocoded">Pending</StatusBadge>
    ) : (
      <StatusBadge variant="archived">Inactive</StatusBadge>
    );

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-h2">
          {volunteer.first_name} {volunteer.last_name}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          {statusBadge}
          <span>
            {volunteer.auth_provider === "admin_invite"
              ? "Created by admin"
              : volunteer.auth_provider === "google"
                ? "Signed up via Google"
                : "Signed up via email"}
          </span>
        </div>
      </div>

      {volunteer.status === "pending" ? (
        <div className="rounded-[var(--radius-lg)] border border-border p-4">
          <p className="mb-2 text-sm">Review and decide.</p>
          <div className="flex gap-2">
            <form action={approveVolunteerAction.bind(null, volunteer.id)}>
              <Button type="submit">Approve</Button>
            </form>
            <form action={rejectVolunteerAction.bind(null, volunteer.id)}>
              <Button type="submit" variant="outline">
                Reject
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      <VolunteerEdit
        volunteer={{
          id: volunteer.id,
          first_name: volunteer.first_name,
          last_name: volunteer.last_name,
          email: volunteer.email,
          phone: volunteer.phone,
          categories: volunteer.categories,
          service_area: volunteer.service_area,
          home_address: volunteer.home_address,
          home_lat: volunteer.home_lat,
          home_lng: volunteer.home_lng,
        }}
        categories={categories.map((c) => ({
          slug: c.slug,
          name: c.name,
          archived: c.archived_at !== null,
        }))}
      />

      <section className="rounded-[var(--radius-lg)] border border-border p-4">
        <h3 className="text-sm font-semibold">Account</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {volunteer.auth_provider === "admin_invite" ? (
            <form action={resendInviteAction.bind(null, volunteer.id)}>
              <Button type="submit" variant="outline">
                Resend invite
              </Button>
            </form>
          ) : null}
          {volunteer.status === "active" ? (
            <form action={rejectVolunteerAction.bind(null, volunteer.id)}>
              <Button type="submit" variant="outline">
                Mark inactive
              </Button>
            </form>
          ) : volunteer.status === "inactive" ? (
            <form action={reactivateVolunteerAction.bind(null, volunteer.id)}>
              <Button type="submit" variant="outline">
                Reactivate
              </Button>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}
