export type VolunteerInviteInput = {
  firstName: string;
  inviteUrl: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderVolunteerInvite(input: VolunteerInviteInput): RenderedEmail {
  const subject = "Welcome to Better At Home — set up your account";
  const text = [
    `Hi ${input.firstName},`,
    ``,
    `An admin has added you as a volunteer on Better At Home. Click the link below to set your password and get started.`,
    ``,
    input.inviteUrl,
    ``,
    `This link is valid for 24 hours. If it expires, ask the admin to resend.`,
    ``,
    `— Better At Home`,
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; background:#f7f4ed; color:#1c1c1c; padding:24px;">
    <p>Hi ${escapeHtml(input.firstName)},</p>
    <p>An admin has added you as a volunteer on Better At Home. Click the button below to set your password and get started.</p>
    <p>
      <a href="${escapeHtml(input.inviteUrl)}"
         style="display:inline-block; background:#1c1c1c; color:#fcfbf8; padding:8px 16px; border-radius:6px; text-decoration:none;">
        Set up my account
      </a>
    </p>
    <p style="color:#5f5f5d; font-size:14px;">
      This link is valid for 24 hours. If it expires, ask the admin to resend.
    </p>
    <p style="color:#5f5f5d; font-size:14px;">— Better At Home</p>
  </body>
</html>`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
