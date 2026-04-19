export type VolunteerApprovedInput = {
  firstName: string;
  portalUrl: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderVolunteerApproved(input: VolunteerApprovedInput): RenderedEmail {
  const subject = "You're approved — welcome to Better At Home";
  const text = [
    `Hi ${input.firstName},`,
    ``,
    `Your volunteer account has been approved. You can now log in and start helping.`,
    ``,
    input.portalUrl,
    ``,
    `— Better At Home`,
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; background:#f7f4ed; color:#1c1c1c; padding:24px;">
    <p>Hi ${escapeHtml(input.firstName)},</p>
    <p>Your volunteer account has been approved. You can now log in and start helping.</p>
    <p>
      <a href="${escapeHtml(input.portalUrl)}"
         style="display:inline-block; background:#1c1c1c; color:#fcfbf8; padding:8px 16px; border-radius:6px; text-decoration:none;">
        Go to my dashboard
      </a>
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
