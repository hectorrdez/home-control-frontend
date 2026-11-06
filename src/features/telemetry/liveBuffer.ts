import type { Entity } from "@/api/types";
import { numericState } from "./telemetry";

// Feature 113: per-sensor live series for the charts. Pure; the React hook lives in useLiveBuffers.ts.

export const WINDOW_MS = 5 * 60_000;
export const MAX_POINTS = 300;
export const TREND_LOOKBACK_MS = 60_000;
export const TICK_MS = 1_000;

// v is null for unavailable/unknown/non-numeric states: a gap in the line, never a 0.
export interface Point {
  t: number;
  v: number | null;
}

export type Buffers = Record<string, Point[]>;

// Appends one point, drops points older than the window and caps the series at MAX_POINTS (oldest out first).
export function appendPoint(points: Point[], point: Point): Point[] {
  const cutoff = point.t - WINDOW_MS;
  const kept = points.filter((p) => p.t >= cutoff);
  kept.push(point);
  return kept.length > MAX_POINTS ? kept.slice(kept.length - MAX_POINTS) : kept;
}

// Sample-and-hold: every entity gets its current value at `now`, so a quiet sensor still advances its line.
export function sampleBuffers(buffers: Buffers, entities: Entity[], now: number): Buffers {
  const next: Buffers = { ...buffers };
  for (const entity of entities) {
    next[entity.entityId] = appendPoint(buffers[entity.entityId] ?? [], { t: now, v: numericState(entity) });
  }
  return next;
}

// Latest non-gap value of a series, or null when the series has none.
export function latestValue(points: Point[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i].v;
    if (v !== null) return v;
  }
  return null;
}

// Change of the latest value against the last non-gap value at or before `now - TREND_LOOKBACK_MS`.
export function trendDelta(points: Point[], now: number): number | null {
  const current = latestValue(points);
  if (current === null) return null;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.t <= now - TREND_LOOKBACK_MS && p.v !== null) return current - p.v;
  }
  return null;
}
