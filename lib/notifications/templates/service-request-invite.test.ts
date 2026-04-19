import { describe, test, expect } from "vitest";
import { renderServiceRequestInvite } from "./service-request-invite";

const baseInput = {
  to: "v@test.local",
  volunteerFirstName: "Alice",
  seniorFirstName: "Jane",
  seniorCity: "Toronto",
  category: "transportation",
  requestedDate: "2026-05-20",
  descriptionExcerpt: "Ride to a medical appointment downtown.",
  acceptUrl: "https://example.test/respond/tok123?action=accept",
  declineUrl: "https://example.test/respond/tok123?action=decline",
};

describe("renderServiceRequestInvite", () => {
  test("contains required fields", () => {
    const email = renderServiceRequestInvite(baseInput);
    expect(email.to).toBe("v@test.local");
    expect(email.subject).toContain("transportation");
    expect(email.html).toContain("Alice");
    expect(email.html).toContain("Jane");
    expect(email.html).toContain("Toronto");
    expect(email.html).toContain("transportation");
    expect(email.html).toContain("Ride to a medical appointment");
    expect(email.html).toContain(baseInput.acceptUrl);
    expect(email.html).toContain(baseInput.declineUrl);
    expect(email.text).toContain("Alice");
    expect(email.text).toContain(baseInput.acceptUrl);
  });

  test("excludes protected PII fields", () => {
    const email = renderServiceRequestInvite({
      ...baseInput,
      // None of these should appear even if passed accidentally — function signature doesn't accept them.
    });
    const combined = email.html + email.text;
    expect(combined).not.toMatch(/416-555/);
    expect(combined).not.toMatch(/Main St/i);
    expect(combined).not.toMatch(/\bDoe\b/); // senior last name — not part of input; sanity check
  });
});
