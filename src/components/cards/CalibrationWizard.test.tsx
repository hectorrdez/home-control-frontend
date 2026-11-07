import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import CalibrationWizard from "./CalibrationWizard";

// The wizard only needs sendIntent from the store; a fake keeps the clock in the test's hands.
const hoisted = vi.hoisted(() => ({ sendIntent: vi.fn() }));
vi.mock("@/state/EntitiesProvider", () => ({ useEntities: () => ({ sendIntent: hoisted.sendIntent }) }));

const cover: Entity = {
  entityId: "cover.salon_blind",
  domain: "cover",
  name: "Salon blind",
  state: "closed",
  attributes: {},
  area: "living_room",
  lastChanged: "2026-11-07T10:00:00.000Z",
};

// Lets pending promises and zero-delay mock timers run.
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

function renderWizard(api = createMockApi({ scenario: "cover-calibration", actionDelayMs: 0 })) {
  const onClose = vi.fn();
  render(
    <ApiProvider api={api}>
      <CalibrationsProvider>
        <CalibrationWizard entity={cover} onClose={onClose} />
      </CalibrationsProvider>
    </ApiProvider>,
  );
  return { api, onClose };
}

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.useFakeTimers();
  hoisted.sendIntent.mockReset();
  hoisted.sendIntent.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CalibrationWizard", () => {
  it("runs close then open, measures both legs and saves the two times", async () => {
    const { api, onClose } = renderWizard();
    const put = vi.spyOn(api, "putCalibration");

    click("START");
    expect(hoisted.sendIntent).toHaveBeenLastCalledWith(cover, { kind: "cover_close" });
    await flush();
    expect(screen.getByText(/Step 1\/2: the cover is CLOSING/)).toBeTruthy();

    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByText("ELAPSED 1.6 s")).toBeTruthy();
    click("DONE");
    await flush();
    expect(hoisted.sendIntent).toHaveBeenLastCalledWith(cover, { kind: "cover_open" });
    expect(screen.getByText(/Step 2\/2: the cover is OPENING/)).toBeTruthy();

    act(() => vi.advanceTimersByTime(2000));
    click("DONE");
    expect(screen.getByText("CLOSE 1.6 s // OPEN 2.0 s")).toBeTruthy();

    click("SAVE");
    await flush();
    expect(put).toHaveBeenCalledWith("cover.salon_blind", { openMs: 2000, closeMs: 1600 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rejects a DONE press under 0.5 s and RETRY sends the leg again", async () => {
    renderWizard();
    click("START");
    await flush();
    act(() => vi.advanceTimersByTime(100));
    click("DONE");
    expect(screen.getByRole("alert").textContent).toMatch(/between 0\.5 s and 300 s/);

    click("RETRY");
    await flush();
    expect(hoisted.sendIntent).toHaveBeenCalledTimes(2);
    expect(hoisted.sendIntent).toHaveBeenLastCalledWith(cover, { kind: "cover_close" });
  });

  it("shows a failed send and RETRY sends the leg again", async () => {
    hoisted.sendIntent.mockResolvedValueOnce(false);
    renderWizard();
    click("START");
    await flush();
    expect(screen.getByRole("alert").textContent).toMatch(/did not answer/);

    click("RETRY");
    await flush();
    expect(screen.getByText(/Step 1\/2: the cover is CLOSING/)).toBeTruthy();
  });

  it("CANCEL while moving sends stop and closes the wizard", async () => {
    const { onClose } = renderWizard();
    click("START");
    await flush();
    click("CANCEL");
    expect(hoisted.sendIntent).toHaveBeenLastCalledWith(cover, { kind: "cover_stop" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the intro CANCEL closes without sending anything", () => {
    const { onClose } = renderWizard();
    click("CANCEL");
    expect(hoisted.sendIntent).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a failed save keeps the summary and shows the error; RETRY starts over", async () => {
    const { api, onClose } = renderWizard();
    vi.spyOn(api, "putCalibration").mockRejectedValueOnce(new Error("write failed"));
    click("START");
    await flush();
    act(() => vi.advanceTimersByTime(1000));
    click("DONE");
    await flush();
    act(() => vi.advanceTimersByTime(1000));
    click("DONE");

    click("SAVE");
    await flush();
    expect(screen.getByText("Could not save the calibration. Try again.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    click("RETRY");
    expect(screen.getByRole("button", { name: "START" })).toBeTruthy();
  });
});
