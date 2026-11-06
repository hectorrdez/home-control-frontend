export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

// Delay before reconnect attempt `attempt` (0-based): 1 s, 2 s, 4 s ... capped at 30 s, with +-20% jitter.
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.min(RECONNECT_MAX_MS, Math.round(base * jitter));
}
