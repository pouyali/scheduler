const TZ = "America/Toronto";

export function combineDateTimeToIso(
  dateStr: string,
  timeStr: string,
  tz: string = TZ,
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const timeStr2d = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

  // Construct a wall-clock UTC guess, then correct for the tz offset at that instant.
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
  let offsetMs = tzOffsetMs(guess, tz);

  // During DST fall-back, a given wall time can map to two UTC times.
  // Check if there's a larger offset (more negative, indicating standard time)
  // that also produces the same wall time. If so, prefer it.
  const candidate = new Date(guess.getTime() - offsetMs + 3600000); // Try 1 hour later in UTC
  const altOffsetMs = tzOffsetMs(candidate, tz);
  if (altOffsetMs !== offsetMs && altOffsetMs < offsetMs) {
    // Offset changed and is more negative. Check if it produces the same wall time.
    const altCandidate = new Date(guess.getTime() - altOffsetMs);
    const altWallTime = getWallTime(altCandidate, tz);
    if (altWallTime === timeStr2d) {
      // Same wall time with larger (more negative) offset = prefer standard time
      offsetMs = altOffsetMs;
    }
  }

  return new Date(guess.getTime() - offsetMs).toISOString();
}

function getWallTime(utcDate: Date, tz: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(utcDate).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${hour}:${parts.minute}`;
}

export function splitIsoToDateTime(
  iso: string,
  tz: string = TZ,
): { date: string; time: string } {
  const at = new Date(iso);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
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
    dtf.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}
