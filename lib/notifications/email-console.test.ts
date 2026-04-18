import { describe, it, expect, vi } from "vitest";
import { ConsoleEmailService } from "@/lib/notifications/email-console";

describe("ConsoleEmailService", () => {
  it("returns ok with synthetic id and logs", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const svc = new ConsoleEmailService();
    const result = await svc.sendEmail({ to: "a@b.com", subject: "hi", html: "<p>hi</p>" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toMatch(/^console-/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
