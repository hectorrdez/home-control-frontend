import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertCenterValue, HighAlert } from "@/features/alerts/useAlerts";
import AlertBanner, { AlertSoundControl } from "./AlertBanner";

const alert = (id: string, text: string): HighAlert => ({ id, entityId: "lock.front_door", name: "Front door", areaName: null, text });

function value(overrides: Partial<AlertCenterValue> = {}): AlertCenterValue {
  return { queue: [], soundEnabled: true, enableSound: vi.fn(), dismiss: vi.fn(), dismissAll: vi.fn(), ...overrides };
}

afterEach(() => cleanup());

describe("AlertBanner (feature 129)", () => {
  it("renders nothing without a HIGH alert", () => {
    const { container } = render(<AlertBanner {...value()} />);
    expect(container.firstChild).toBeNull();
  });

  it("is an alertdialog named by its title, and moves focus to DISMISS", () => {
    render(<AlertBanner {...value({ queue: [alert("a", "UNLOCKED")] })} />);
    const dialog = screen.getByRole("alertdialog", { name: "HIGH ALERT: Front door" });
    expect(dialog.textContent).toContain("NO AREA · UNLOCKED");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "DISMISS" }));
  });

  it("dismisses the shown alert from DISMISS", () => {
    const dismiss = vi.fn();
    render(<AlertBanner {...value({ queue: [alert("a", "UNLOCKED")], dismiss })} />);
    fireEvent.click(screen.getByRole("button", { name: "DISMISS" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("shows the queue count, the area and the sound hint when sound is blocked", () => {
    const queue = [{ ...alert("a", "UNLOCKED"), areaName: "Entry" }, alert("b", "DISCONNECTS")];
    render(<AlertBanner {...value({ queue, soundEnabled: false })} />);
    expect(screen.getByText("Entry · UNLOCKED")).toBeTruthy();
    expect(screen.getByText("+1 MORE QUEUED")).toBeTruthy();
    expect(screen.getByText("SOUND BLOCKED: ENABLE ALERT SOUND TO HEAR IT")).toBeTruthy();
  });

  it("moves focus to the next alert's DISMISS after one is dismissed", () => {
    const { rerender } = render(<AlertBanner {...value({ queue: [alert("a", "ONE"), alert("b", "TWO")] })} />);
    rerender(<AlertBanner {...value({ queue: [alert("b", "TWO")] })} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "DISMISS" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("TWO");
  });
});

describe("AlertSoundControl", () => {
  it("offers ENABLE ALERT SOUND until enabled, then shows the state", () => {
    const enableSound = vi.fn();
    const { rerender } = render(<AlertSoundControl soundEnabled={false} enableSound={enableSound} />);
    fireEvent.click(screen.getByRole("button", { name: "ENABLE ALERT SOUND" }));
    expect(enableSound).toHaveBeenCalledTimes(1);

    rerender(<AlertSoundControl soundEnabled enableSound={enableSound} />);
    expect(screen.queryByRole("button", { name: "ENABLE ALERT SOUND" })).toBeNull();
    expect(screen.getByText("ALERT SOUND ON")).toBeTruthy();
  });
});
