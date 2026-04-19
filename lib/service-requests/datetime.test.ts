import { describe, test, expect } from "vitest";
import { combineDateTimeToIso, splitIsoToDateTime } from "./datetime";

describe("combineDateTimeToIso", () => {
  test("typical summer day — EDT (-04:00)", () => {
    const iso = combineDateTimeToIso("2026-06-15", "14:30");
    expect(iso).toBe("2026-06-15T18:30:00.000Z");
  });

  test("typical winter day — EST (-05:00)", () => {
    const iso = combineDateTimeToIso("2026-12-06", "16:30");
    expect(iso).toBe("2026-12-06T21:30:00.000Z");
  });

  test("fall-back boundary (2026-11-01 01:30 is ambiguous; prefer EST)", () => {
    const iso = combineDateTimeToIso("2026-11-01", "01:30");
    // 01:30 EST (-05:00) = 06:30 UTC
    expect(iso).toBe("2026-11-01T06:30:00.000Z");
  });
});

describe("splitIsoToDateTime", () => {
  test("summer round-trip", () => {
    const iso = combineDateTimeToIso("2026-06-15", "14:30");
    expect(splitIsoToDateTime(iso)).toEqual({ date: "2026-06-15", time: "14:30" });
  });

  test("winter round-trip", () => {
    const iso = combineDateTimeToIso("2026-12-06", "16:30");
    expect(splitIsoToDateTime(iso)).toEqual({ date: "2026-12-06", time: "16:30" });
  });
});
