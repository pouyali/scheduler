import { Resend } from "resend";
import type { Email, NotificationService, SendResult } from "./index";

export class ResendEmailService implements NotificationService {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async sendEmail(email: Email): Promise<SendResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error || !data) return { ok: false, error: error?.message ?? "unknown Resend error" };
    return { ok: true, id: data.id };
  }
}
