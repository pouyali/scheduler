import { describe, test, expect } from "vitest";
import { renderRequestCancelled } from "./request-cancelled";

describe("renderRequestCancelled", () => {
  test("contains apology, optional reason, and dashboard link", () => {
    const email = renderRequestCancelled({
      to: "v@test.local",
      volunteerFirstName: "Alice",
      category: "transportation",
      requestedAt: "2026-05-20T17:00:00.000Z",
      reason: "Family cancelled.",
      dashboardUrl: "https://example.test/volunteer/dashboard",
    });
    expect(email.subject).toContain("no longer needed");
    expect(email.html).toContain("Alice");
    expect(email.html).toContain("Family cancelled");
    expect(email.html).toContain("https://example.test/volunteer/dashboard");
    expect(email.text).toContain("Alice");
  });

  test("omits reason when not provided", () => {
    const email = renderRequestCancelled({
      to: "v@test.local",
      volunteerFirstName: "Alice",
      category: "transportation",
      requestedAt: "2026-05-20T17:00:00.000Z",
      dashboardUrl: "https://example.test/volunteer/dashboard",
    });
    expect(email.html).not.toContain("Reason:");
  });
});
