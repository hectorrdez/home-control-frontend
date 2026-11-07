import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
import type { Intent } from "@/state/actions";
import { AliasesProvider } from "@/state/AliasesProvider";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import DeviceControls from "./DeviceControls";

// Feature 127: a cover without position feedback, calibrated (percentage slider) or not (SHUT / STOP / OPEN).
const cover = (attributes: Record<string, unknown>, state = "open"): Entity => ({
  entityId: "cover.salon_blind",
  domain: "cover",
  name: "Salon blind",
  state,
  attributes,
  area: "living_room",
  lastChanged: "2026-11-07T10:00:00.000Z",
});

async function renderCover(entity: Entity, { calibrated = true, disabled = false } = {}) {
  const api = createMockApi({ scenario: "cover-calibration", actionDelayMs: 0 });
  if (calibrated) await api.putCalibration(entity.entityId, { openMs: 5000, closeMs: 4000 });
  const send = vi.fn<(intent: Intent) => void>();
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <CalibrationsProvider>
              <DeviceControls entity={entity} disabled={disabled} send={send} />
            </CalibrationsProvider>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  // The calibration list loads asynchronously; the controls switch once it is ready.
  if (calibrated) await waitFor(() => expect(screen.queryByRole("button", { name: "SHUT" })).toBeNull());
  return send;
}

afterEach(cleanup);

describe("DeviceControls: calibrated cover without position", () => {
  it("shows the estimate and sends a percentage from the slider", async () => {
    const send = await renderCover(cover({ estimated_position: 40 }));
    expect(screen.getByText("40% OPEN (EST.)")).toBeTruthy();

    const slider = screen.getByRole("slider", { name: /EST\./ });
    expect((slider as HTMLInputElement).value).toBe("40");
    expect((slider as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(slider, { target: { value: "70" } });
    fireEvent.pointerUp(slider);
    expect(send).toHaveBeenLastCalledWith({ kind: "cover_percent", percent: 70 });
  });

  it("sends the SHUT (0%) and FULL (100%) ends", async () => {
    const send = await renderCover(cover({ estimated_position: 40 }));
    fireEvent.click(screen.getByRole("button", { name: "SHUT (0%)" }));
    expect(send).toHaveBeenLastCalledWith({ kind: "cover_percent", percent: 0 });
    fireEvent.click(screen.getByRole("button", { name: "FULL (100%)" }));
    expect(send).toHaveBeenLastCalledWith({ kind: "cover_percent", percent: 100 });
  });

  it("with an unknown position the slider is disabled and only the ends can be sent", async () => {
    const send = await renderCover(cover({ estimated_position: null }, "closed"));
    expect(screen.getByText("POSITION UNKNOWN: move to an end first")).toBeTruthy();
    expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "FULL (100%)" }));
    expect(send).toHaveBeenLastCalledWith({ kind: "cover_percent", percent: 100 });
  });

  it("shows MOVING while a move is in flight", async () => {
    await renderCover(cover({ estimated_position: null }), { disabled: true });
    expect(screen.getByText("MOVING")).toBeTruthy();
    expect((screen.getByRole("button", { name: "SHUT (0%)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the SHUT / STOP / OPEN buttons until the cover is calibrated", async () => {
    const send = await renderCover(cover({ estimated_position: null }, "unknown"), { calibrated: false });
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "STOP" }));
    expect(send).toHaveBeenLastCalledWith({ kind: "cover_stop" });
  });
});
