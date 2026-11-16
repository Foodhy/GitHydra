export const ACTIVITY_HOLD_MS = 700;

export function holdRemaining(
  startedAt: number,
  now: number,
  minimum = ACTIVITY_HOLD_MS,
): number {
  return Math.max(0, minimum - (now - startedAt));
}
