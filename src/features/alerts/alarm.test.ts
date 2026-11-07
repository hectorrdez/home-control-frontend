import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALARM_MAX_MS, BEEP_PERIOD_MS, createAlarm, type AlarmContext } from "./alarm";

function fakeContext() {
  const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createOscillator: () => {
      const osc = {
        type: "sine",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    },
    createGain: () => ({
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
  } as unknown as AlarmContext;
  return { ctx, oscillators };
}

describe("createAlarm (feature 129)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("beeps at once and then on every period until stopped", () => {
    const { ctx, oscillators } = fakeContext();
    const alarm = createAlarm(ctx);
    alarm.start();
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].start).toHaveBeenCalledWith(0);

    vi.advanceTimersByTime(BEEP_PERIOD_MS * 2);
    expect(oscillators).toHaveLength(3);

    alarm.stop();
    vi.advanceTimersByTime(BEEP_PERIOD_MS * 5);
    expect(oscillators).toHaveLength(3);
  });

  it("does not start a second loop while one is running", () => {
    const { ctx, oscillators } = fakeContext();
    const alarm = createAlarm(ctx);
    alarm.start();
    alarm.start();
    expect(oscillators).toHaveLength(1);
    alarm.stop();
  });

  it("stops by itself after ALARM_MAX_MS, and can start again afterwards", () => {
    const { ctx, oscillators } = fakeContext();
    const alarm = createAlarm(ctx);
    alarm.start();
    vi.advanceTimersByTime(ALARM_MAX_MS + BEEP_PERIOD_MS);
    const count = oscillators.length;
    vi.advanceTimersByTime(BEEP_PERIOD_MS * 5);
    expect(oscillators).toHaveLength(count);

    alarm.start();
    expect(oscillators.length).toBe(count + 1);
    alarm.stop();
  });

  it("stop without start is harmless", () => {
    const { ctx } = fakeContext();
    expect(() => createAlarm(ctx).stop()).not.toThrow();
  });
});
