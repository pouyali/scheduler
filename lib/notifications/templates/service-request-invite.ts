import type { Email } from "../index";

export type ServiceRequestInviteInput = {
  to: string;
  volunteerFirstName: string;
  seniorFirstName: string;
  seniorCity: string;
  category: string;
  requestedDate: string; // ISO date (YYYY-MM-DD)
  descriptionExcerpt: string;
  acceptUrl: string;
  declineUrl: string;
};

export function renderServiceRequestInvite(input: ServiceRequestInviteInput): Email {
  const prettyDate = new Date(`${input.requestedDate}T12:00:00-04:00`).toLocaleDateString(
    "en-CA",
    { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" },
  );

  const subject = `You've been invited to help with a ${input.category} request`;

  const html = `
<p>Hi ${esc(input.volunteerFirstName)},</p>
<p>${esc(input.seniorFirstName)} in ${esc(input.seniorCity)} has asked for help with a
<strong>${esc(input.category)}</strong> request on <strong>${esc(prettyDate)}</strong>.</p>
<p>${esc(input.descriptionExcerpt)}</p>
<p>
  <a href="${input.acceptUrl}" style="display:inline-block;padding:10px 16px;background:#1a7f37;color:#fff;text-decoration:none;border-radius:6px;margin-right:8px;">Accept</a>
  <a href="${input.declineUrl}" style="display:inline-block;padding:10px 16px;background:#6e7781;color:#fff;text-decoration:none;border-radius:6px;">Decline</a>
</p>
<p style="color:#6e7781;font-size:13px;">These buttons work until the end of the service date. If you've already responded, the newer click wins.</p>
<p>Thanks,<br>Better At Home</p>
`.trim();

  const text = [
    `Hi ${input.volunteerFirstName},`,
    ``,
    `${input.seniorFirstName} in ${input.seniorCity} has asked for help with a ${input.category} request on ${prettyDate}.`,
    ``,
    input.descriptionExcerpt,
    ``,
    `Accept:  ${input.acceptUrl}`,
    `Decline: ${input.declineUrl}`,
    ``,
    `These links work until the end of the service date.`,
    ``,
    `Thanks,`,
    `Better At Home`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
