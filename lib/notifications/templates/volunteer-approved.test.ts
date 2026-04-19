import { describe, it, expect } from "vitest";
import { renderVolunteerApproved } from "./volunteer-approved";

describe("renderVolunteerApproved", () => {
  it("includes the recipient name and the portal URL", () => {
    const r = renderVolunteerApproved({
      firstName: "Alex",
      portalUrl: "https://example.com/volunteer/dashboard",
    });
    expect(r.subject).toMatch(/approved|ready/i);
    expect(r.html).toContain("Alex");
    expect(r.html).toContain("https://example.com/volunteer/dashboard");
    expect(r.text).toContain("Alex");
  });
});
