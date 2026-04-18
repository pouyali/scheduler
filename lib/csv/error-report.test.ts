import { describe, it, expect } from "vitest";
import { buildErrorReport } from "./error-report";

describe("buildErrorReport", () => {
  it("returns null when no rejected rows", () => {
    expect(buildErrorReport([])).toBeNull();
  });

  it("preserves original column order and appends error column", () => {
    const csv = buildErrorReport([
      {
        rowNumber: 2,
        errors: ["first_name: Required"],
        raw: {
          first_name: "",
          last_name: "Chen",
          phone: "6045550134",
          email: "",
          address_line1: "1 Main",
          address_line2: "",
          city: "Vancouver",
          province: "BC",
          postal_code: "V6E 1B9",
          notes: "",
        },
      },
    ]);
    expect(csv).toContain(
      "first_name,last_name,phone,email,address_line1,address_line2,city,province,postal_code,notes,error",
    );
    expect(csv).toContain(',Chen,6045550134,');
    expect(csv).toContain("first_name: Required");
  });

  it("joins multiple errors per row with '; '", () => {
    const csv = buildErrorReport([
      {
        rowNumber: 3,
        errors: ["phone: Invalid phone number", "postal_code: Invalid Canadian postal code"],
        raw: {
          first_name: "A",
          last_name: "B",
          phone: "123",
          email: "",
          address_line1: "1 Main",
          address_line2: "",
          city: "Van",
          province: "BC",
          postal_code: "BAD",
          notes: "",
        },
      },
    ])!;
    expect(csv).toContain("phone: Invalid phone number; postal_code: Invalid Canadian postal code");
  });
});
