import { describe, it, expect, beforeEach } from "vitest";
import { adminClient, truncate, createAdminUser } from "./helpers";

const admin = adminClient();

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
}

describe("seed_dev_fixtures", () => {
  beforeEach(async () => {
    await truncate(admin, ["service_requests", "volunteers", "seniors", "admins"]);
    await createAdminUser(uniqueEmail("admin"));
  });

  it("is idempotent: running twice leaves the same row counts", async () => {
    const { error: e1 } = await admin.rpc("seed_dev_fixtures");
    expect(e1).toBeNull();
    const after1 = await Promise.all([
      admin.from("volunteers").select("id", { count: "exact", head: true }),
      admin.from("seniors").select("id", { count: "exact", head: true }),
      admin.from("service_requests").select("id", { count: "exact", head: true }),
    ]);
    const counts1 = after1.map((r) => r.count);

    const { error: e2 } = await admin.rpc("seed_dev_fixtures");
    expect(e2).toBeNull();
    const after2 = await Promise.all([
      admin.from("volunteers").select("id", { count: "exact", head: true }),
      admin.from("seniors").select("id", { count: "exact", head: true }),
      admin.from("service_requests").select("id", { count: "exact", head: true }),
    ]);
    const counts2 = after2.map((r) => r.count);

    expect(counts2).toEqual(counts1);
  });

  it("produces volunteers across all three statuses", async () => {
    await admin.rpc("seed_dev_fixtures");
    const { data } = await admin.from("volunteers").select("status");
    const statuses = new Set((data ?? []).map((r) => r.status));
    expect(statuses.has("pending")).toBe(true);
    expect(statuses.has("active")).toBe(true);
    expect(statuses.has("inactive")).toBe(true);
  });
});
