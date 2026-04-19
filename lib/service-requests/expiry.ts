const TZ = "America/Toronto";

export function computeTokenExpiry(
  requestedDate: string,
  now: Date = new Date(),
): Date {
  // Build 23:59:59.999 on requested_date in America/Toronto, as a UTC Date.
  const endOfDayInTz = zonedEndOfDay(requestedDate, TZ);
  const floor = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return endOfDayInTz.getTime() > floor.getTime() ? endOfDayInTz : floor;
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
