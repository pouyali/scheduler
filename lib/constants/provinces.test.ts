import { describe, it, expect } from "vitest";
import { PROVINCES, PROVINCE_CODES, isProvinceCode } from "./provinces";

describe("PROVINCES", () => {
  it("has 13 entries", () => {
    expect(PROVINCES).toHaveLength(13);
  });

  it("every code is a unique two-letter uppercase string", () => {
    const codes = PROVINCES.map((p) => p.code);
    expect(new Set(codes).size).toBe(13);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{2}$/);
  });

  it("PROVINCE_CODES mirrors PROVINCES", () => {
    expect(PROVINCE_CODES).toEqual(PROVINCES.map((p) => p.code));
  });

  it("isProvinceCode accepts known codes and rejects unknown", () => {
    expect(isProvinceCode("BC")).toBe(true);
    expect(isProvinceCode("ON")).toBe(true);
    expect(isProvinceCode("XX")).toBe(false);
    expect(isProvinceCode("bc")).toBe(false);
  });
});
