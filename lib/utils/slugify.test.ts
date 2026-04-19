import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and replaces spaces with underscores", () => {
    expect(slugify("Yard Work")).toBe("yard_work");
  });
  it("strips punctuation", () => {
    expect(slugify("Meal Delivery & Companionship")).toBe("meal_delivery_companionship");
  });
  it("collapses consecutive whitespace and trims", () => {
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple_spaces");
  });
  it("handles accents (strips them)", () => {
    expect(slugify("Café visit")).toBe("cafe_visit");
  });
  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});
