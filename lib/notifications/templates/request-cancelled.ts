import type { Email } from "../index";

export type RequestCancelledInput = {
  to: string;
  volunteerFirstName: string;
  category: string;
  requestedAt: string; // ISO timestamp
  reason?: string;
  dashboardUrl: string;
};

export function renderRequestCancelled(input: RequestCancelledInput): Email {
  const prettyDate = new Date(input.requestedAt).toLocaleString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });

  const subject = `A request you were invited to is no longer needed`;

  const reasonBlock = input.reason
    ? `<p><strong>Reason:</strong> ${esc(input.reason)}</p>`
    : "";
  const reasonText = input.reason ? `Reason: ${input.reason}\n\n` : "";

  const html = `
<p>Hi ${esc(input.volunteerFirstName)},</p>
<p>The <strong>${esc(input.category)}</strong> request for <strong>${esc(prettyDate)}</strong> that we emailed you about has been cancelled. No action is needed.</p>
${reasonBlock}
<p>Thanks for being available — we'll reach out again soon.</p>
<p><a href="${input.dashboardUrl}">View your dashboard</a></p>
<p>Better At Home</p>
`.trim();

  const text = [
    `Hi ${input.volunteerFirstName},`,
    ``,
    `The ${input.category} request for ${prettyDate} that we emailed you about has been cancelled. No action is needed.`,
    ``,
    `${reasonText}Thanks for being available — we'll reach out again soon.`,
    ``,
    `Dashboard: ${input.dashboardUrl}`,
    ``,
    `Better At Home`,
  ].join("\n");

  return { to: input.to, subject, html, text };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
