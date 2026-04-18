import type { NotificationService } from "./index";
import { ConsoleEmailService } from "./email-console";
import { ResendEmailService } from "./email-resend";

export function createNotificationService(): NotificationService {
  const driver = process.env.NOTIFICATION_DRIVER ?? "console";
  if (driver === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!key) throw new Error("NOTIFICATION_DRIVER=resend but RESEND_API_KEY not set");
    if (!from) throw new Error("NOTIFICATION_DRIVER=resend but RESEND_FROM_EMAIL not set");
    return new ResendEmailService(key, from);
  }
  return new ConsoleEmailService();
}
