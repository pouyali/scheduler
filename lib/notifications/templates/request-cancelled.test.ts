import { describe, test, expect } from "vitest";
import { renderRequestCancelled } from "./request-cancelled";

describe("renderRequestCancelled", () => {
  test("contains apology, optional reason, and dashboard link", () => {
    const email = renderRequestCancelled({
      to: "v@test.local",
      volunteerFirstName: "Alice",
      category: "transportation",
      requestedDate: "2026-05-20",
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
      requestedDate: "2026-05-20",
      dashboardUrl: "https://example.test/volunteer/dashboard",
    });
    expect(email.html).not.toContain("Reason:");
  });
});
