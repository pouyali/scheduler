import { describe, test, expect } from "vitest";
import { computeTokenExpiry } from "./expiry";

describe("computeTokenExpiry", () => {
  test("requested_at far in the future returns requested_at", () => {
    const now = new Date("2026-05-10T10:00:00Z");
    const requestedAt = "2026-05-20T14:00:00Z";
    const out = computeTokenExpiry(requestedAt, now);
    expect(out.toISOString()).toBe("2026-05-20T14:00:00.000Z");
  });

  test("requested_at within 24h returns now+24h", () => {
    const now = new Date("2026-05-10T10:00:00Z");
    const requestedAt = "2026-05-10T20:00:00Z";
    const out = computeTokenExpiry(requestedAt, now);
    expect(out.toISOString()).toBe("2026-05-11T10:00:00.000Z");
  });

  test("requested_at in the past returns now+24h", () => {
    const now = new Date("2026-05-10T10:00:00Z");
    const out = computeTokenExpiry("2026-05-01T10:00:00Z", now);
    expect(out.toISOString()).toBe("2026-05-11T10:00:00.000Z");
  });

  test("tie at exactly now+24h — floor wins (non-strict comparison)", () => {
    const now = new Date("2026-05-10T10:00:00Z");
    const requestedAt = "2026-05-11T10:00:00Z";
    const out = computeTokenExpiry(requestedAt, now);
    expect(out.toISOString()).toBe("2026-05-11T10:00:00.000Z");
  });
});
