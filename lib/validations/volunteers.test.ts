import { describe, it, expect } from "vitest";
import {
  adminCreateVolunteerSchema,
  updateVolunteerSchema,
  completeProfileSchema,
} from "./volunteers";

describe("adminCreateVolunteerSchema", () => {
  const valid = {
    first_name: "Alex",
    last_name: "Chen",
    email: "alex@example.com",
    categories: ["transportation"],
    service_area: "Vancouver",
  };

  it("accepts a minimal valid payload", () => {
    const r = adminCreateVolunteerSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects a blank first name", () => {
    const r = adminCreateVolunteerSchema.safeParse({ ...valid, first_name: "  " });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = adminCreateVolunteerSchema.safeParse({ ...valid, email: "not-email" });
    expect(r.success).toBe(false);
  });

  it("rejects empty categories array", () => {
    const r = adminCreateVolunteerSchema.safeParse({ ...valid, categories: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a blank service area", () => {
    const r = adminCreateVolunteerSchema.safeParse({ ...valid, service_area: "  " });
    expect(r.success).toBe(false);
  });

  it("accepts optional phone, home_address, home_lat, home_lng", () => {
    const r = adminCreateVolunteerSchema.safeParse({
      ...valid,
      phone: "(604) 555-0134",
      home_address: "1245 Robson St",
      home_lat: 49.28,
      home_lng: -123.12,
    });
    expect(r.success).toBe(true);
  });
});

describe("updateVolunteerSchema", () => {
  it("does not accept an email field", () => {
    const schema = updateVolunteerSchema;
    const r = schema.parse({
      first_name: "A",
      last_name: "B",
      categories: ["transportation"],
      service_area: "Van",
      email: "x@y.z",
    } as unknown as Parameters<typeof schema.parse>[0]);
    expect("email" in r).toBe(false);
  });
});

describe("completeProfileSchema", () => {
  it("requires first_name, last_name, categories, service_area", () => {
    const r = completeProfileSchema.safeParse({
      first_name: "A",
      last_name: "B",
      categories: ["transportation"],
      service_area: "Van",
    });
    expect(r.success).toBe(true);
  });
  it("rejects missing categories", () => {
    const r = completeProfileSchema.safeParse({
      first_name: "A",
      last_name: "B",
      service_area: "Van",
    });
    expect(r.success).toBe(false);
  });
});
