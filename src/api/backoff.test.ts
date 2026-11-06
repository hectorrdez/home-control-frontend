import { describe, expect, it } from "vitest";
import { backoffDelay, RECONNECT_MAX_MS } from "./backoff";

describe("backoffDelay", () => {
  it("doubles from 1 s and caps at 30 s without jitter", () => {
    const mid = () => 0.5; // jitter factor 1.0
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, mid))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it("applies +-20% jitter and never exceeds the cap", () => {
    expect(backoffDelay(0, () => 0)).toBe(800);
    expect(backoffDelay(0, () => 0.999)).toBeCloseTo(1200, -1);
    expect(backoffDelay(10, () => 0.999)).toBe(RECONNECT_MAX_MS);
  });
});
