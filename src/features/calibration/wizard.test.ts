import { describe, expect, it } from "vitest";
import { initialWizard, isValidMoveMs, MAX_MOVE_MS, MIN_MOVE_MS, RANGE_MESSAGE, wizardReducer, type WizardState } from "./wizard";

// Drives the close leg then the open leg to the summary; `at` values are plain ms timestamps.
function runBothLegs(closeMs: number, openMs: number): WizardState {
  let s = wizardReducer(initialWizard, { type: "sending", leg: "close", attempt: 1 });
  s = wizardReducer(s, { type: "sent", attempt: 1, at: 1_000 });
  s = wizardReducer(s, { type: "done", at: 1_000 + closeMs });
  s = wizardReducer(s, { type: "sending", leg: "open", attempt: 2 });
  s = wizardReducer(s, { type: "sent", attempt: 2, at: 5_000 });
  return wizardReducer(s, { type: "done", at: 5_000 + openMs });
}

describe("calibration wizard state machine", () => {
  it("measures each leg from the moment its request resolved and ends in the summary", () => {
    const done = runBothLegs(4_200, 3_900);
    expect(done).toMatchObject({ status: "summary", closeMs: 4_200, openMs: 3_900 });
  });

  it("starts the open leg after the close leg is done", () => {
    let s = wizardReducer(initialWizard, { type: "sending", leg: "close", attempt: 1 });
    s = wizardReducer(s, { type: "sent", attempt: 1, at: 0 });
    s = wizardReducer(s, { type: "done", at: 1_000 });
    expect(s).toMatchObject({ status: "sending", leg: "open", closeMs: 1_000 });
  });

  it("rejects a measured time under 0.5 s or over 300 s and keeps the leg for RETRY", () => {
    const moving = (ms: number) => {
      let s = wizardReducer(initialWizard, { type: "sending", leg: "close", attempt: 1 });
      s = wizardReducer(s, { type: "sent", attempt: 1, at: 0 });
      return wizardReducer(s, { type: "done", at: ms });
    };
    expect(moving(MIN_MOVE_MS - 1)).toMatchObject({ status: "failed", leg: "close", message: RANGE_MESSAGE });
    expect(moving(MAX_MOVE_MS + 1)).toMatchObject({ status: "failed", message: RANGE_MESSAGE });
    expect(moving(MIN_MOVE_MS)).toMatchObject({ status: "sending", leg: "open" });
    expect(moving(MAX_MOVE_MS)).toMatchObject({ status: "sending", leg: "open" });
  });

  it("ignores DONE when no leg is moving", () => {
    expect(wizardReducer(initialWizard, { type: "done", at: 9_999 })).toBe(initialWizard);
  });

  it("ignores answers of an older send (attempt mismatch)", () => {
    const sending = wizardReducer(initialWizard, { type: "sending", leg: "close", attempt: 2 });
    expect(wizardReducer(sending, { type: "sent", attempt: 1, at: 0 })).toBe(sending);
    expect(wizardReducer(sending, { type: "failed", attempt: 1, message: "x" })).toBe(sending);
  });

  it("turns a rejected send into a failed step with its message", () => {
    const sending = wizardReducer(initialWizard, { type: "sending", leg: "open", attempt: 3 });
    expect(wizardReducer(sending, { type: "failed", attempt: 3, message: "nope" })).toMatchObject({
      status: "failed",
      leg: "open",
      message: "nope",
    });
  });

  it("clears the failure message when a step is sent again, and reset returns to the intro", () => {
    const failed: WizardState = { ...initialWizard, status: "failed", message: "x" };
    const again = wizardReducer(failed, { type: "sending", leg: "close", attempt: 2 });
    expect(again.message).toBeUndefined();
    expect(wizardReducer(again, { type: "reset" })).toBe(initialWizard);
  });

  it("validates the move range inclusively", () => {
    expect(isValidMoveMs(MIN_MOVE_MS)).toBe(true);
    expect(isValidMoveMs(MAX_MOVE_MS)).toBe(true);
    expect(isValidMoveMs(MIN_MOVE_MS - 1)).toBe(false);
    expect(isValidMoveMs(Number.NaN)).toBe(false);
  });
});
