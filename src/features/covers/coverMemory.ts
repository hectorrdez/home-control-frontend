import type { CoverDirection, CoverMotion } from "./coverTap";

// Feature 157: per-cover tap memory, kept in memory only (reset on reload). `motion` marks a move that the tile
// started and that has not ended or been stopped yet (calibrated moves report no position while they run).
export interface CoverMemory {
  lastCommand: CoverDirection | null;
  lastWasStopped: boolean;
  motion: CoverMotion | null;
}

const EMPTY: CoverMemory = { lastCommand: null, lastWasStopped: false, motion: null };
const memory = new Map<string, CoverMemory>();

export function getCoverMemory(entityId: string): CoverMemory {
  return memory.get(entityId) ?? EMPTY;
}

export function recordMove(
  entityId: string,
  direction: CoverDirection,
  start: { from: number | null; legMs: number | null },
  now: number = Date.now(),
): void {
  const motion: CoverMotion = {
    direction,
    from: start.from,
    target: direction === "open" ? 100 : 0,
    startedAt: now,
    legMs: start.legMs,
  };
  memory.set(entityId, { lastCommand: direction, lastWasStopped: false, motion });
}

// A stop keeps the direction of the move it ended, so the next tap can go the other way.
export function recordStop(entityId: string): void {
  const current = getCoverMemory(entityId);
  memory.set(entityId, { ...current, lastWasStopped: current.lastCommand !== null, motion: null });
}

export function clearMotion(entityId: string): void {
  const current = getCoverMemory(entityId);
  if (current.motion !== null) memory.set(entityId, { ...current, motion: null });
}

export function resetCoverMemory(): void {
  memory.clear();
}
