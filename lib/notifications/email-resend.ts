import type { Email, NotificationService, SendResult } from "./index";

export class ResendEmailService implements NotificationService {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendEmail(_email: Email): Promise<SendResult> {
    return { ok: false, error: "Resend impl pending (Task 21)" };
  }
}
