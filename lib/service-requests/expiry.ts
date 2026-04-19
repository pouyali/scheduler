export function computeTokenExpiry(
  requestedAtIso: string,
  now: Date = new Date(),
): Date {
  const requestedAt = new Date(requestedAtIso);
  const floor = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return requestedAt.getTime() > floor.getTime() ? requestedAt : floor;
}
