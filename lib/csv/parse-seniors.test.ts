import { describe, it, expect } from "vitest";
import { parseSeniorsCsv } from "./parse-seniors";

const header =
  "first_name,last_name,phone,email,address_line1,address_line2,city,province,postal_code,notes";

describe("parseSeniorsCsv", () => {
  it("parses a valid row", () => {
    const csv = `${header}\nMargaret,Chen,6045550134,m@x.com,1245 Robson St,,Vancouver,BC,V6E 1B9,`;
    const rows = parseSeniorsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      errors: [],
      data: expect.objectContaining({
        first_name: "Margaret",
        phone: "(604) 555-0134",
        province: "BC",
      }),
    });
  });

  it("flags missing required fields per row", () => {
    const csv = `${header}\n,Chen,6045550134,,1245 Robson St,,Vancouver,BC,V6E 1B9,`;
    const rows = parseSeniorsCsv(csv);
    expect(rows[0].errors).toContain("first_name: Required");
  });

  it("rejects missing header", () => {
    expect(() => parseSeniorsCsv("no,header,row\n1,2,3")).toThrow(/header/i);
  });

  it("skips empty rows", () => {
    const csv = `${header}\n\nMargaret,Chen,6045550134,,1245 Robson St,,Vancouver,BC,V6E 1B9,\n`;
    const rows = parseSeniorsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(3);
  });

  it("tolerates BOM", () => {
    const csv = `\uFEFF${header}\nMargaret,Chen,6045550134,,1245 Robson St,,Vancouver,BC,V6E 1B9,`;
    const rows = parseSeniorsCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it("ignores extra unknown columns", () => {
    const csv = `${header},extra\nMargaret,Chen,6045550134,,1245 Robson St,,Vancouver,BC,V6E 1B9,,junk`;
    const rows = parseSeniorsCsv(csv);
    expect(rows[0].errors).toEqual([]);
  });
});
