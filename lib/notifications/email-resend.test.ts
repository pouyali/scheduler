import { describe, it, expect, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { ResendEmailService } from "@/lib/notifications/email-resend";

describe("ResendEmailService", () => {
  it("returns ok with id on success", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "re_abc" }, error: null });
    const svc = new ResendEmailService("key", "from@test.com");
    const r = await svc.sendEmail({ to: "a@b.com", subject: "s", html: "<p>h</p>" });
    expect(r).toEqual({ ok: true, id: "re_abc" });
    expect(sendMock).toHaveBeenCalledWith({
      from: "from@test.com",
      to: "a@b.com",
      subject: "s",
      html: "<p>h</p>",
      text: undefined,
    });
  });

  it("returns error on failure", async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const svc = new ResendEmailService("key", "from@test.com");
    const r = await svc.sendEmail({ to: "a@b.com", subject: "s", html: "<p>h</p>" });
    expect(r).toEqual({ ok: false, error: "boom" });
  });
});
