// Feature 157: what a tap on a cover tile does. Pure: no I/O, no React.

export type CoverDirection = "open" | "close";

export interface CoverTapInput {
  calibrated: boolean; // calibration (backend 010) exists for this cover
  position: number | null; // estimated_position (calibrated) or current_position (0..100), null = unknown
  moving: boolean; // the cover is running a move right now
  lastCommand: CoverDirection | null; // direction of the last move sent for this cover (in memory)
  lastWasStopped: boolean; // the last move was ended by a tap (stop)
}

export type CoverTapAction = { kind: "stop" } | { kind: "move"; direction: CoverDirection };

// A move started by the tile. `from` is the last known position (null = unknown), `legMs` the calibrated time for the
// full travel (null = not calibrated, so no estimate). The backend reports no position while a move runs.
export interface CoverMotion {
  direction: CoverDirection;
  from: number | null;
  target: number;
  startedAt: number;
  legMs: number | null;
}

const opposite = (direction: CoverDirection): CoverDirection => (direction === "open" ? "close" : "open");

// Rules, in order:
// 1. moving -> stop (the real stop command).
// 2. after a stop -> opposite of the direction of the move that was stopped.
// 3. calibrated with a known position -> nearest extreme (>= 50 open, else close; 80 -> open).
// 4. otherwise (uncalibrated, or calibrated with unknown position) -> opposite of the last command; none -> open.
export function decideCoverTap(input: CoverTapInput): CoverTapAction {
  if (input.moving) return { kind: "stop" };
  if (input.lastWasStopped && input.lastCommand !== null) {
    return { kind: "move", direction: opposite(input.lastCommand) };
  }
  if (input.calibrated && input.position !== null) {
    return { kind: "move", direction: input.position >= 50 ? "open" : "close" };
  }
  return { kind: "move", direction: input.lastCommand === "open" ? "close" : "open" };
}

// Feature 157 (fix): where a calibrated move is when it is stopped, estimated from its start with the same linear
// model as the backend (full travel = legMs). Used when the position is not reported while the move runs.
// null when the start position or the leg time is unknown.
export function estimateMotionPercent(motion: CoverMotion, now: number): number | null {
  if (motion.from === null || motion.legMs === null || motion.legMs <= 0) return null;
  const distance = Math.abs(motion.target - motion.from);
  const travel = Math.min(distance, ((now - motion.startedAt) / motion.legMs) * 100);
  const signed = motion.direction === "open" ? motion.from + travel : motion.from - travel;
  return Math.round(Math.min(100, Math.max(0, signed)));
}
