import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import { ToastProvider } from "@components/feedback/Toast";
import CoverCalibrationPanel from "./CoverCalibrationPanel";

vi.mock("@/state/EntitiesProvider", () => ({ useEntities: () => ({ sendIntent: vi.fn(async () => true) }) }));

const cover: Entity = {
  entityId: "cover.salon_blind",
  domain: "cover",
  name: "Salon blind",
  state: "closed",
  attributes: {},
  area: "living_room",
  lastChanged: "2026-11-07T10:00:00.000Z",
};

// Renders the panel with the mock cover-calibration scenario; `calibrated` stores a timing first.
async function renderPanel({ calibrated = false, entity = cover, scenario = "cover-calibration" as "cover-calibration" | "error", disabled = false } = {}) {
  const api = createMockApi({ scenario, actionDelayMs: 0 });
  if (calibrated) await api.putCalibration(cover.entityId, { openMs: 5000, closeMs: 4000 });
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <CalibrationsProvider>
          <CoverCalibrationPanel entity={entity} disabled={disabled} />
        </CalibrationsProvider>
      </ToastProvider>
    </ApiProvider>,
  );
}

afterEach(cleanup);

describe("CoverCalibrationPanel", () => {
  it("offers CALIBRATE for an uncalibrated cover without position", async () => {
    await renderPanel();
    expect(await screen.findByRole("button", { name: "CALIBRATE" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "DELETE CALIBRATION" })).toBeNull();
  });

  it("shows the stored times with RECALIBRATE and DELETE CALIBRATION", async () => {
    await renderPanel({ calibrated: true });
    expect(await screen.findByText("CALIBRATED // CLOSE 4.0 s // OPEN 5.0 s")).toBeTruthy();
    expect(screen.getByRole("button", { name: "RECALIBRATE" })).toBeTruthy();
  });

  it("DELETE CALIBRATION removes the timing and offers CALIBRATE again", async () => {
    await renderPanel({ calibrated: true });
    fireEvent.click(await screen.findByRole("button", { name: "DELETE CALIBRATION" }));
    expect(await screen.findByRole("button", { name: "CALIBRATE" })).toBeTruthy();
    expect(screen.queryByText(/CALIBRATED \/\//)).toBeNull();
  });

  it("CALIBRATE opens the wizard in place of the panel", async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "CALIBRATE" }));
    expect(screen.getByRole("button", { name: "START" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "CALIBRATE" })).toBeNull();
  });

  it("disables the actions while the cover is busy", async () => {
    await renderPanel({ calibrated: true, disabled: true });
    expect((await screen.findByRole("button", { name: "RECALIBRATE" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "DELETE CALIBRATION" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("stays hidden for a cover that reports its own position", async () => {
    const withPosition = { ...cover, attributes: { current_position: 30 } };
    await renderPanel({ entity: withPosition });
    await act(async () => undefined);
    expect(screen.queryByRole("region", { name: "Calibration" })).toBeNull();
    expect(screen.queryByRole("button", { name: "CALIBRATE" })).toBeNull();
  });

  it("stays hidden when the calibrations endpoint is unavailable", async () => {
    await renderPanel({ scenario: "error" });
    await act(async () => undefined);
    expect(screen.queryByRole("button", { name: "CALIBRATE" })).toBeNull();
  });
});
