import { describe, test, expect } from "vitest";
import { rankEligibleVolunteers } from "./eligibility";

type V = Parameters<typeof rankEligibleVolunteers>[0][number];

const mk = (overrides: Partial<V>): V => ({
  id: crypto.randomUUID(),
  first_name: "F",
  last_name: "Z",
  categories: ["transportation"],
  service_area: "",
  status: "active",
  ...overrides,
});

describe("rankEligibleVolunteers", () => {
  test("filters out non-active volunteers", () => {
    const v1 = mk({ last_name: "Adams", status: "pending" });
    const v2 = mk({ last_name: "Baker", status: "active" });
    const out = rankEligibleVolunteers([v1, v2], { city: "Toronto" }, "transportation");
    expect(out.map(v => v.last_name)).toEqual(["Baker"]);
  });

  test("filters out volunteers missing the category", () => {
    const v1 = mk({ last_name: "Adams", categories: ["groceries"] });
    const v2 = mk({ last_name: "Baker", categories: ["transportation"] });
    const out = rankEligibleVolunteers([v1, v2], { city: "Toronto" }, "transportation");
    expect(out.map(v => v.last_name)).toEqual(["Baker"]);
  });

  test("in-area volunteers sort before out-of-area, alpha within each group", () => {
    const v1 = mk({ last_name: "Zhang", service_area: "Toronto, North York" });
    const v2 = mk({ last_name: "Adams", service_area: "Ottawa" });
    const v3 = mk({ last_name: "Brown", service_area: "Toronto" });
    const v4 = mk({ last_name: "Clarke", service_area: "" });
    const out = rankEligibleVolunteers([v1, v2, v3, v4], { city: "Toronto" }, "transportation");
    expect(out.map(v => v.last_name)).toEqual(["Brown", "Zhang", "Adams", "Clarke"]);
  });

  test("service-area match is case-insensitive and whole-word", () => {
    const v1 = mk({ last_name: "A", service_area: "TORONTO" });
    const v2 = mk({ last_name: "B", service_area: "Torontonian district" });
    const out = rankEligibleVolunteers([v1, v2], { city: "Toronto" }, "transportation");
    // 'Torontonian' does not whole-word match 'Toronto'
    expect(out[0].last_name).toBe("A");
    expect(out[0].inArea).toBe(true);
    expect(out[1].inArea).toBe(false);
  });

  test("senior without city — everyone treated as out-of-area, alpha", () => {
    const v1 = mk({ last_name: "Zhao", service_area: "Toronto" });
    const v2 = mk({ last_name: "Adams", service_area: "Toronto" });
    const out = rankEligibleVolunteers([v1, v2], { city: null }, "transportation");
    expect(out.map(v => v.last_name)).toEqual(["Adams", "Zhao"]);
    expect(out.every(v => !v.inArea)).toBe(true);
  });

  test("in-area flag exposed on each row", () => {
    const v1 = mk({ last_name: "A", service_area: "Toronto" });
    const v2 = mk({ last_name: "B", service_area: "Ottawa" });
    const out = rankEligibleVolunteers([v1, v2], { city: "Toronto" }, "transportation");
    expect(out.find(v => v.last_name === "A")?.inArea).toBe(true);
    expect(out.find(v => v.last_name === "B")?.inArea).toBe(false);
  });
});
