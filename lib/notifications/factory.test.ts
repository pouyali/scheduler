import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createNotificationService } from "@/lib/notifications/factory";
import { ConsoleEmailService } from "@/lib/notifications/email-console";

describe("createNotificationService", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns ConsoleEmailService when NOTIFICATION_DRIVER=console", () => {
    process.env.NOTIFICATION_DRIVER = "console";
    expect(createNotificationService()).toBeInstanceOf(ConsoleEmailService);
  });

  it("defaults to console when driver unset", () => {
    delete process.env.NOTIFICATION_DRIVER;
    expect(createNotificationService()).toBeInstanceOf(ConsoleEmailService);
  });

  it("throws when driver=resend but no API key", () => {
    process.env.NOTIFICATION_DRIVER = "resend";
    delete process.env.RESEND_API_KEY;
    expect(() => createNotificationService()).toThrow(/RESEND_API_KEY/);
  });
});
