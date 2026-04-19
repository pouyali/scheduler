import { describe, it, expect } from "vitest";
import { renderVolunteerInvite } from "./volunteer-invite";

describe("renderVolunteerInvite", () => {
  it("includes the recipient name and invite URL in HTML and text", () => {
    const r = renderVolunteerInvite({
      firstName: "Alex",
      inviteUrl: "https://example.com/setup?token=abc",
    });
    expect(r.subject).toMatch(/welcome|invite/i);
    expect(r.html).toContain("Alex");
    expect(r.html).toContain("https://example.com/setup?token=abc");
    expect(r.text).toContain("Alex");
    expect(r.text).toContain("https://example.com/setup?token=abc");
  });
});
