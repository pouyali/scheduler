import { describe, it, expect } from "vitest";
import {
  createCategorySchema,
  updateCategorySchema,
} from "./volunteer-categories";

describe("createCategorySchema", () => {
  it("accepts a valid name", () => {
    const r = createCategorySchema.safeParse({ name: "Yard Work" });
    expect(r.success).toBe(true);
  });
  it("trims leading/trailing whitespace", () => {
    const r = createCategorySchema.parse({ name: "  Yard Work  " });
    expect(r.name).toBe("Yard Work");
  });
  it("rejects empty names", () => {
    const r = createCategorySchema.safeParse({ name: "   " });
    expect(r.success).toBe(false);
  });
  it("rejects names over 80 chars", () => {
    const r = createCategorySchema.safeParse({ name: "x".repeat(81) });
    expect(r.success).toBe(false);
  });
});

describe("updateCategorySchema", () => {
  it("accepts name + description", () => {
    const r = updateCategorySchema.safeParse({ name: "Groceries", description: "help with shopping" });
    expect(r.success).toBe(true);
  });
  it("allows description to be omitted", () => {
    const r = updateCategorySchema.safeParse({ name: "Groceries" });
    expect(r.success).toBe(true);
  });
});
