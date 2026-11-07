import { describe, expect, it } from "vitest";
import { RESYNC_HIDDEN_MS, isStreamRecovery, shouldResyncAfterHidden } from "./resync";

describe("resync triggers (126)", () => {
  it("re-fetches only after a stream reconnect (reconnecting -> open)", () => {
    expect(isStreamRecovery("reconnecting", "open")).toBe(true);
    expect(isStreamRecovery("open", "open")).toBe(false);
    expect(isStreamRecovery("open", "reconnecting")).toBe(false);
  });

  it("re-fetches when the tab was hidden for more than 60 s", () => {
    const hiddenAt = Date.parse("2026-11-07T10:00:00.000Z");
    expect(RESYNC_HIDDEN_MS).toBe(60_000);
    expect(shouldResyncAfterHidden(hiddenAt, hiddenAt + 60_000)).toBe(false);
    expect(shouldResyncAfterHidden(hiddenAt, hiddenAt + 60_001)).toBe(true);
    expect(shouldResyncAfterHidden(hiddenAt, hiddenAt + 5_000)).toBe(false);
  });

  it("does nothing when the tab was never hidden", () => {
    expect(shouldResyncAfterHidden(null, Date.now())).toBe(false);
  });
});
