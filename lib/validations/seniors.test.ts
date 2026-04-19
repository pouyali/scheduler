import { describe, it, expect } from "vitest";
import {
  postalCodeRegex,
  phoneRegex,
  normalizePhone,
  seniorCreateSchema,
  seniorRowSchema,
  seniorUpdateSchema,
} from "./seniors";

describe("postalCodeRegex", () => {
  it("accepts valid Canadian codes with and without space", () => {
    expect(postalCodeRegex.test("V6E 1B9")).toBe(true);
    expect(postalCodeRegex.test("V6E1B9")).toBe(true);
    expect(postalCodeRegex.test("m1m 1m1")).toBe(true);
  });
  it("rejects invalid codes", () => {
    expect(postalCodeRegex.test("D1A 1A1")).toBe(false);
    expect(postalCodeRegex.test("12345")).toBe(false);
    expect(postalCodeRegex.test("")).toBe(false);
  });
});

describe("phoneRegex + normalizePhone", () => {
  it("accepts common formats", () => {
    expect(phoneRegex.test("(604) 555-0134")).toBe(true);
    expect(phoneRegex.test("604-555-0134")).toBe(true);
    expect(phoneRegex.test("6045550134")).toBe(true);
    expect(phoneRegex.test("+1 604 555 0134")).toBe(true);
  });
  it("rejects obviously wrong input", () => {
    expect(phoneRegex.test("123")).toBe(false);
    expect(phoneRegex.test("abcdefg")).toBe(false);
  });
  it("normalizes to (NPA) NXX-XXXX", () => {
    expect(normalizePhone("6045550134")).toBe("(604) 555-0134");
    expect(normalizePhone("+1 604 555 0134")).toBe("(604) 555-0134");
    expect(normalizePhone("604-555-0134")).toBe("(604) 555-0134");
  });
});

describe("seniorCreateSchema", () => {
  const base = {
    first_name: "Margaret",
    last_name: "Chen",
    phone: "(604) 555-0134",
    email: "m@example.com",
    address_line1: "1245 Robson St",
    address_line2: "",
    city: "Vancouver",
    province: "BC",
    postal_code: "V6E 1B9",
    notes: "",
  };
  it("accepts a valid payload", () => {
    const parsed = seniorCreateSchema.parse(base);
    expect(parsed.phone).toBe("(604) 555-0134");
    expect(parsed.email).toBe("m@example.com");
  });
  it("normalizes phone during parse", () => {
    const parsed = seniorCreateSchema.parse({ ...base, phone: "6045550134" });
    expect(parsed.phone).toBe("(604) 555-0134");
  });
  it("empty email becomes undefined", () => {
    const parsed = seniorCreateSchema.parse({ ...base, email: "" });
    expect(parsed.email).toBeUndefined();
  });
  it("rejects missing required fields", () => {
    expect(() => seniorCreateSchema.parse({ ...base, first_name: "" })).toThrow();
    expect(() => seniorCreateSchema.parse({ ...base, postal_code: "BAD" })).toThrow();
    expect(() => seniorCreateSchema.parse({ ...base, province: "XX" })).toThrow();
  });
});

describe("seniorRowSchema", () => {
  it("coerces empty strings in optional fields to undefined", () => {
    const parsed = seniorRowSchema.parse({
      first_name: "A",
      last_name: "B",
      phone: "6045550134",
      email: "",
      address_line1: "1 Main",
      address_line2: "",
      city: "Vancouver",
      province: "BC",
      postal_code: "V6E 1B9",
      notes: "",
    });
    expect(parsed.email).toBeUndefined();
    expect(parsed.address_line2).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });
});

describe("seniorUpdateSchema", () => {
  const base = {
    first_name: "Margaret",
    last_name: "Chen",
    phone: "(604) 555-0134",
    email: "m@example.com",
    address_line1: "1245 Robson St",
    address_line2: "",
    city: "Vancouver",
    province: "BC",
    postal_code: "V6E 1B9",
    notes: "",
  };

  it('manual_pin_override "true" resolves to boolean true', () => {
    const parsed = seniorUpdateSchema.parse({
      ...base,
      manual_pin_override: "true",
      lat: "49.28",
      lng: "-123.12",
    });
    expect(parsed.manual_pin_override).toBe(true);
  });

  it('manual_pin_override "false" resolves to boolean false', () => {
    const parsed = seniorUpdateSchema.parse({ ...base, manual_pin_override: "false" });
    expect(parsed.manual_pin_override).toBe(false);
  });

  it("accepts boolean manual_pin_override directly", () => {
    const parsed = seniorUpdateSchema.parse({ ...base, manual_pin_override: true });
    expect(parsed.manual_pin_override).toBe(true);
  });

  it("coerces numeric strings for lat/lng", () => {
    const parsed = seniorUpdateSchema.parse({
      ...base,
      manual_pin_override: false,
      lat: "49.28",
      lng: "-123.12",
    });
    expect(parsed.lat).toBe(49.28);
    expect(parsed.lng).toBe(-123.12);
  });

  it("empty lat/lng become undefined (not 0)", () => {
    const parsed = seniorUpdateSchema.parse({
      ...base,
      manual_pin_override: false,
      lat: "",
      lng: "",
    });
    expect(parsed.lat).toBeUndefined();
    expect(parsed.lng).toBeUndefined();
  });

  it("missing lat/lng fields become undefined", () => {
    const parsed = seniorUpdateSchema.parse({
      ...base,
      manual_pin_override: false,
    });
    expect(parsed.lat).toBeUndefined();
    expect(parsed.lng).toBeUndefined();
  });
});
