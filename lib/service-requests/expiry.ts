const TZ = "America/Toronto";

export function computeTokenExpiry(
  requestedAt: string,
  now: Date = new Date(),
): Date {
  // requestedAt may be a full ISO timestamp (e.g. "2030-01-15T17:00:00.000Z")
  // or a legacy date-only string ("2030-01-15"). Extract the local date in
  // America/Toronto so the expiry is end-of-that-calendar-day in Toronto.
  const localDate = isoToLocalDate(requestedAt, TZ);
  const endOfDayInTz = zonedEndOfDay(localDate, TZ);
  const floor = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return endOfDayInTz.getTime() > floor.getTime() ? endOfDayInTz : floor;
}

/** Convert an ISO string (timestamp or date-only) to a YYYY-MM-DD string in tz. */
function isoToLocalDate(iso: string, tz: string): string {
  const date = new Date(iso);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(date); // en-CA gives YYYY-MM-DD
}

function zonedEndOfDay(dateIso: string, tz: string): Date {
  // Intl-based: get the UTC instant for Y-M-D 23:59:59.000 at TZ.
  const [y, m, d] = dateIso.split("-").map(Number);
  // Start with a guess of UTC 23:59:59 of that local date, then correct.
  const guess = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 0));
  const offsetMs = tzOffsetMs(guess, tz);
  return new Date(guess.getTime() - offsetMs);
}

function tzOffsetMs(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - at.getTime();
}
