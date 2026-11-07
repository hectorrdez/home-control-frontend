// Feature 127: the calibration wizard as a pure state machine (no timers, no I/O). The component drives it:
// it sends the cover action for a leg, then marks the moment the request resolved (`sent`) and the DONE press (`done`).
export const MIN_MOVE_MS = 500;
export const MAX_MOVE_MS = 300_000;
export const RANGE_MESSAGE = "The measured time must be between 0.5 s and 300 s. RETRY this step.";
export const SEND_FAILED_MESSAGE = "The cover did not answer. RETRY this step.";

export type Leg = "close" | "open";
export type WizardStatus = "idle" | "sending" | "moving" | "failed" | "summary";

export interface WizardState {
  status: WizardStatus;
  leg: Leg; // the leg being measured: close first, then open
  attempt: number; // identifies the current send, so answers of an older send are ignored
  since: number; // when the action request resolved (moving)
  closeMs?: number;
  openMs?: number;
  message?: string;
}

export type WizardEvent =
  | { type: "sending"; leg: Leg; attempt: number }
  | { type: "sent"; attempt: number; at: number }
  | { type: "failed"; attempt: number; message: string }
  | { type: "done"; at: number }
  | { type: "reset" };

export const initialWizard: WizardState = { status: "idle", leg: "close", attempt: 0, since: 0 };

export function isValidMoveMs(ms: number): boolean {
  return Number.isFinite(ms) && ms >= MIN_MOVE_MS && ms <= MAX_MOVE_MS;
}

// Reaction time is part of the measurement: the clock starts when the action request resolved.
export function wizardReducer(state: WizardState, event: WizardEvent): WizardState {
  switch (event.type) {
    case "reset":
      return initialWizard;
    case "sending":
      return { ...state, status: "sending", leg: event.leg, attempt: event.attempt, message: undefined };
    case "sent":
      return state.status === "sending" && event.attempt === state.attempt
        ? { ...state, status: "moving", since: event.at }
        : state;
    case "failed":
      return state.status === "sending" && event.attempt === state.attempt
        ? { ...state, status: "failed", message: event.message }
        : state;
    case "done": {
      if (state.status !== "moving") return state;
      const ms = event.at - state.since;
      if (!isValidMoveMs(ms)) return { ...state, status: "failed", message: RANGE_MESSAGE };
      if (state.leg === "close") return { ...state, status: "sending", leg: "open", closeMs: ms, message: undefined };
      return { ...state, status: "summary", openMs: ms, message: undefined };
    }
  }
}
