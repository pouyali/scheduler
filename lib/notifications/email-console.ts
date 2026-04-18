import type { Email, NotificationService, SendResult } from "./index";

export class ConsoleEmailService implements NotificationService {
  async sendEmail(email: Email): Promise<SendResult> {
    const id = `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.info("[email:console]", { id, to: email.to, subject: email.subject });
    return { ok: true, id };
  }
}
