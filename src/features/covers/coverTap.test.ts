import { describe, expect, it } from "vitest";
import { decideCoverTap, estimateMotionPercent, type CoverDirection, type CoverMotion, type CoverTapInput } from "./coverTap";

// Feature 157: the cover tap decision. Every combination of the inputs is checked against the rules.
const base: CoverTapInput = { calibrated: false, position: null, moving: false, lastCommand: null, lastWasStopped: false };
const move = (direction: CoverDirection) => ({ kind: "move", direction });
const STOP = { kind: "stop" };

describe("decideCoverTap: moving", () => {
  it.each([
    ["uncalibrated", { calibrated: false, position: null }],
    ["calibrated at 0", { calibrated: true, position: 0 }],
    ["calibrated at 42", { calibrated: true, position: 42 }],
    ["calibrated at 100", { calibrated: true, position: 100 }],
    ["calibrated, position unknown", { calibrated: true, position: null }],
  ])("a tap while moving stops the cover (%s)", (_name, extra) => {
    for (const lastCommand of [null, "open", "close"] as const) {
      for (const lastWasStopped of [false, true]) {
        expect(decideCoverTap({ ...base, ...extra, moving: true, lastCommand, lastWasStopped })).toEqual(STOP);
      }
    }
  });
});

describe("decideCoverTap: idle, calibrated (nearest extreme)", () => {
  it.each([
    [0, "close"],
    [1, "close"],
    [30, "close"],
    [49, "close"],
    [50, "open"],
    [51, "open"],
    [80, "open"],
    [99, "open"],
    [100, "open"],
  ] as const)("position %i goes to %s", (position, direction) => {
    expect(decideCoverTap({ ...base, calibrated: true, position })).toEqual(move(direction));
  });

  it("ignores the last command when the cover is calibrated and idle", () => {
    expect(decideCoverTap({ ...base, calibrated: true, position: 80, lastCommand: "close" })).toEqual(move("open"));
    expect(decideCoverTap({ ...base, calibrated: true, position: 30, lastCommand: "open" })).toEqual(move("close"));
  });
});

describe("decideCoverTap: idle, uncalibrated (opposite of the last command)", () => {
  it("no command yet -> open", () => {
    expect(decideCoverTap({ ...base, lastCommand: null })).toEqual(move("open"));
  });

  it("last close -> open", () => {
    expect(decideCoverTap({ ...base, lastCommand: "close" })).toEqual(move("open"));
  });

  it("last open -> close", () => {
    expect(decideCoverTap({ ...base, lastCommand: "open" })).toEqual(move("close"));
  });

  it("calibrated with unknown position uses the same rule", () => {
    expect(decideCoverTap({ ...base, calibrated: true, position: null, lastCommand: null })).toEqual(move("open"));
    expect(decideCoverTap({ ...base, calibrated: true, position: null, lastCommand: "open" })).toEqual(move("close"));
    expect(decideCoverTap({ ...base, calibrated: true, position: null, lastCommand: "close" })).toEqual(move("open"));
  });

  it("a reported position without calibration does not pick the nearest extreme", () => {
    expect(decideCoverTap({ ...base, calibrated: false, position: 80, lastCommand: "open" })).toEqual(move("close"));
  });
});

describe("decideCoverTap: after a stop (reversal)", () => {
  it.each([
    ["calibrated, stopped while opening, at 80", { calibrated: true, position: 80 }, "open", "close"],
    ["calibrated, stopped while closing, at 80", { calibrated: true, position: 80 }, "close", "open"],
    ["uncalibrated, stopped while opening", { calibrated: false, position: null }, "open", "close"],
    ["uncalibrated, stopped while closing", { calibrated: false, position: null }, "close", "open"],
  ] as const)("%s: next tap goes opposite to the stopped move", (_name, extra, lastCommand, expected) => {
    expect(decideCoverTap({ ...base, ...extra, lastCommand, lastWasStopped: true })).toEqual(move(expected));
  });

  it("the reversal wins over the nearest extreme", () => {
    // Stopped while closing, now at 20 (nearest extreme would be close): still open.
    expect(decideCoverTap({ ...base, calibrated: true, position: 20, lastCommand: "close", lastWasStopped: true })).toEqual(
      move("open"),
    );
  });

  it("a stop without a known move falls through to the normal rules", () => {
    expect(decideCoverTap({ ...base, lastCommand: null, lastWasStopped: true })).toEqual(move("open"));
    expect(decideCoverTap({ ...base, calibrated: true, position: 70, lastCommand: null, lastWasStopped: true })).toEqual(
      move("open"),
    );
  });
});

describe("decideCoverTap: exhaustive combinations", () => {
  const positions = [null, 0, 49, 50, 100] as const;
  const commands = [null, "open", "close"] as const;
  const flags = [false, true] as const;
  const all: CoverTapInput[] = [];
  for (const calibrated of flags)
    for (const position of positions)
      for (const moving of flags)
        for (const lastCommand of commands)
          for (const lastWasStopped of flags) all.push({ calibrated, position, moving, lastCommand, lastWasStopped });

  it("always returns a stop while moving and a move otherwise", () => {
    for (const input of all) {
      const action = decideCoverTap(input);
      expect(action.kind).toBe(input.moving ? "stop" : "move");
    }
  });

  it("never returns a move with a direction outside open/close", () => {
    for (const input of all) {
      const action = decideCoverTap(input);
      if (action.kind === "move") expect(["open", "close"]).toContain(action.direction);
    }
  });
});

describe("estimateMotionPercent (stop percentage of a calibrated move)", () => {
  const motion = (overrides: Partial<CoverMotion>): CoverMotion => ({
    direction: "close",
    from: 60,
    target: 0,
    startedAt: 1_000,
    legMs: 20_000,
    ...overrides,
  });

  it("moves the start by the elapsed share of the full travel (close)", () => {
    expect(estimateMotionPercent(motion({}), 1_000 + 5_000)).toBe(35); // 25% of the leg = 25 points
  });

  it("moves up when opening", () => {
    expect(estimateMotionPercent(motion({ direction: "open", target: 100, from: 20 }), 1_000 + 10_000)).toBe(70);
  });

  it("never passes the target", () => {
    expect(estimateMotionPercent(motion({ from: 60, target: 50 }), 1_000 + 19_000)).toBe(50);
    expect(estimateMotionPercent(motion({}), 1_000 + 999_000)).toBe(0);
  });

  it("is unknown without a start position or a calibrated leg", () => {
    expect(estimateMotionPercent(motion({ from: null }), 2_000)).toBeNull();
    expect(estimateMotionPercent(motion({ legMs: null }), 2_000)).toBeNull();
  });
});
