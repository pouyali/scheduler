import { describe, it, expect, beforeEach } from "vitest";
import {
  listVolunteers,
  countVolunteers,
  approveVolunteer,
  rejectVolunteer,
  reactivateVolunteer,
  findVolunteerByEmail,
} from "@/lib/db/queries/volunteers";
import { adminClient, truncate, createAdminUser, createVolunteerUser } from "./helpers";

const admin = adminClient();

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
}

describe("volunteers CRUD / transitions", () => {
  let adminId: string;

  beforeEach(async () => {
    await truncate(admin, ["volunteers", "admins"]);
    const a = await createAdminUser(uniqueEmail("admin"));
    adminId = a.userId;
  });

  it("listVolunteers filters by status", async () => {
    await createVolunteerUser(uniqueEmail("a"), "pending");
    const b = await createVolunteerUser(uniqueEmail("b"), "pending");
    await approveVolunteer(admin, b.userId, adminId);
    const pending = await listVolunteers(admin, { status: "pending" });
    const active = await listVolunteers(admin, { status: "active" });
    expect(pending.rows.length).toBe(1);
    expect(active.rows.length).toBe(1);
  });

  it("countVolunteers returns status-specific counts", async () => {
    await createVolunteerUser(uniqueEmail("a"), "pending");
    await createVolunteerUser(uniqueEmail("b"), "pending");
    const count = await countVolunteers(admin, { status: "pending" });
    expect(count).toBe(2);
  });

  it("approveVolunteer sets status=active, approved_at, approved_by", async () => {
    const v = await createVolunteerUser(uniqueEmail("a"), "pending");
    const r = await approveVolunteer(admin, v.userId, adminId);
    expect(r.status).toBe("active");
    expect(r.approved_at).not.toBeNull();
    expect(r.approved_by).toBe(adminId);
  });

  it("rejectVolunteer sets status=inactive; does not set approved_at", async () => {
    const v = await createVolunteerUser(uniqueEmail("a"), "pending");
    const r = await rejectVolunteer(admin, v.userId);
    expect(r.status).toBe("inactive");
    expect(r.approved_at).toBeNull();
  });

  it("reactivateVolunteer sets status=active and records approver", async () => {
    const v = await createVolunteerUser(uniqueEmail("a"), "pending");
    await rejectVolunteer(admin, v.userId);
    const r = await reactivateVolunteer(admin, v.userId, adminId);
    expect(r.status).toBe("active");
    expect(r.approved_by).toBe(adminId);
  });

  it("findVolunteerByEmail returns the row or null", async () => {
    const email = uniqueEmail("a");
    const v = await createVolunteerUser(email, "pending");
    const hit = await findVolunteerByEmail(admin, email);
    expect(hit?.id).toBe(v.userId);
    const miss = await findVolunteerByEmail(admin, "nope@example.com");
    expect(miss).toBeNull();
  });
});
