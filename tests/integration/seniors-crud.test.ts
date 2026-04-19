import { describe, it, expect, beforeAll } from "vitest";
import {
  insertSenior,
  getSenior,
  listSeniors,
  updateSeniorRow,
  setArchived,
} from "@/lib/db/queries/seniors";
import { adminClient, createAdminUser } from "./helpers";

describe("seniors CRUD helpers", () => {
  let admin: { userId: string };
  const sb = adminClient();

  beforeAll(async () => {
    admin = await createAdminUser("crud-admin@test.com");
  });

  it("inserts, reads, updates, and archives", async () => {
    const row = await insertSenior(sb, {
      first_name: "Crud",
      last_name: "Test",
      phone: "(604) 555-0000",
      address_line1: "1 Test Lane",
      city: "Vancouver",
      province: "BC",
      postal_code: "V6E 1B9",
      created_by: admin.userId,
    });
    expect(row.id).toBeTruthy();

    const fetched = await getSenior(sb, row.id);
    expect(fetched?.first_name).toBe("Crud");

    const updated = await updateSeniorRow(sb, row.id, { city: "Burnaby" });
    expect(updated.city).toBe("Burnaby");
    expect(updated.updated_at > row.updated_at).toBe(true);

    const { rows: activeRows } = await listSeniors(sb);
    expect(activeRows.find((r) => r.id === row.id)).toBeTruthy();

    await setArchived(sb, row.id, true);
    const { rows: defaultList } = await listSeniors(sb);
    expect(defaultList.find((r) => r.id === row.id)).toBeFalsy();

    const { rows: archivedList } = await listSeniors(sb, { archived: true });
    expect(archivedList.find((r) => r.id === row.id)).toBeTruthy();

    await setArchived(sb, row.id, false);
    const { rows: backActive } = await listSeniors(sb);
    expect(backActive.find((r) => r.id === row.id)).toBeTruthy();
  });

  it("search matches first_name, phone, address_line1", async () => {
    await insertSenior(sb, {
      first_name: "Searchable",
      last_name: "Zed",
      phone: "(604) 555-9999",
      address_line1: "900 Uniqueish Rd",
      city: "Vancouver",
      province: "BC",
      postal_code: "V6E 1B9",
      created_by: admin.userId,
    });

    const byName = await listSeniors(sb, { q: "Searchable" });
    expect(byName.rows.some((r) => r.first_name === "Searchable")).toBe(true);

    const byPhone = await listSeniors(sb, { q: "555-9999" });
    expect(byPhone.rows.some((r) => r.first_name === "Searchable")).toBe(true);

    const byAddress = await listSeniors(sb, { q: "Uniqueish" });
    expect(byAddress.rows.some((r) => r.first_name === "Searchable")).toBe(true);
  });
});
