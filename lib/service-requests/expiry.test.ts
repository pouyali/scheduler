import { describe, test, expect } from "vitest";
import { computeTokenExpiry } from "./expiry";

describe("computeTokenExpiry", () => {
  test("future date — expires at 23:59:59 America/Toronto", () => {
    const now = new Date("2026-05-10T10:00:00-04:00");
    const out = computeTokenExpiry("2026-05-20", now);
    // 2026-05-20 23:59:59 America/Toronto (EDT, -04:00) = 2026-05-21 03:59:59 UTC
    expect(out.toISOString()).toBe("2026-05-21T03:59:59.000Z");
  });

  test("same-day — applies 24h floor", () => {
    const now = new Date("2026-05-10T14:00:00-04:00");
    const out = computeTokenExpiry("2026-05-10", now);
    // now + 24h > same-day 23:59 EDT (which is 2026-05-11T03:59:59Z);
    // now + 24h = 2026-05-11T18:00:00Z, which is later — floor wins.
    expect(out.toISOString()).toBe("2026-05-11T18:00:00.000Z");
  });

  test("past-dated request — 24h floor from now", () => {
    const now = new Date("2026-05-10T10:00:00-04:00");
    const out = computeTokenExpiry("2026-05-01", now);
    expect(out.toISOString()).toBe("2026-05-11T14:00:00.000Z");
  });

  test("DST boundary — EST side of fall-back", () => {
    // 2026-11-01 is fall-back day in America/Toronto; after 02:00 local it's EST (-05:00).
    const now = new Date("2026-10-30T10:00:00-04:00");
    const out = computeTokenExpiry("2026-11-05", now);
    // 2026-11-05 23:59:59 EST = 2026-11-06 04:59:59 UTC
    expect(out.toISOString()).toBe("2026-11-06T04:59:59.000Z");
  });
});
