export type Email = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export interface NotificationService {
  sendEmail(email: Email): Promise<SendResult>;
}
