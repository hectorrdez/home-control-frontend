import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Clock from "./Clock";

// Local time is set through the fake clock; the zone offset is stubbed so the test does not depend on the machine's TZ.
function offsetMinutes(minutes: number) {
  return vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(minutes);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date(2026, 10, 7, 9, 5, 3));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Clock", () => {
  it("shows the local time as HH:MM:SS with a positive UTC offset", () => {
    offsetMinutes(-60);
    render(<Clock />);
    expect(screen.getByText("09:05:03")).toBeTruthy();
    expect(screen.getByText("UTC+01:00")).toBeTruthy();
  });

  it("shows a negative UTC offset with minutes", () => {
    offsetMinutes(330);
    render(<Clock />);
    expect(screen.getByText("UTC-05:30")).toBeTruthy();
  });

  it("uses a plus sign for UTC itself", () => {
    offsetMinutes(0);
    render(<Clock />);
    expect(screen.getByText("UTC+00:00")).toBeTruthy();
  });

  it("ticks every second", () => {
    offsetMinutes(0);
    render(<Clock />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("09:05:05")).toBeTruthy();
  });

  it("stops the interval on unmount", () => {
    offsetMinutes(0);
    const { unmount } = render(<Clock />);
    const clear = vi.spyOn(globalThis, "clearInterval");
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
