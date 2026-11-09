import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { HomeApi } from "@/api/HomeApi";
import { ApiError, type Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { PresetsProvider } from "@/state/PresetsProvider";
import { ToastProvider } from "@components/feedback/Toast";
import DeviceControls from "./DeviceControls";

const COVER = "cover.salon_blind";
const cover: Entity = {
  entityId: COVER,
  domain: "cover",
  name: "Salon blind",
  state: "closed",
  attributes: { estimated_position: 0 },
  area: "living_room",
  lastChanged: "2026-11-08T10:00:00.000Z",
};

// Renders the cover controls with the Home-panel flag; `presets` are created on the mock first.
async function renderModes({
  api,
  presets = ["HALF"],
  modes = true,
  entity = cover,
}: { api?: HomeApi; presets?: string[]; modes?: boolean; entity?: Entity } = {}) {
  const mock = api ?? createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
  for (const name of presets) await mock.createPreset({ entityId: COVER, name, percent: 50 });
  render(
    <ApiProvider api={mock}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <CalibrationsProvider>
              <PresetsProvider>
                <DeviceControls entity={entity} disabled={false} send={vi.fn()} modes={modes} />
              </PresetsProvider>
            </CalibrationsProvider>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  // Let the presets and calibrations providers finish their one-time load.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

afterEach(cleanup);

describe("MODES on the Home panel (feature 143)", () => {
  it("shows MODES for a cover with saved positions", async () => {
    await renderModes();
    expect(await screen.findByRole("button", { name: "MODES" })).toBeTruthy();
  });

  it("shows no MODES without presets", async () => {
    await renderModes({ presets: [] });
    await waitFor(() => expect(screen.queryByRole("button", { name: "MODES" })).toBeNull());
    expect(screen.getByRole("slider")).toBeTruthy();
  });

  it("is not rendered outside the Home panel context", async () => {
    await renderModes({ modes: false });
    await waitFor(() => expect(screen.queryByRole("button", { name: "MODES" })).toBeNull());
  });

  it("applying a preset calls applyPreset with its id", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const applyPreset = vi.fn(base.applyPreset);
    await renderModes({ api: { ...base, applyPreset } });
    fireEvent.click(await screen.findByRole("button", { name: "MODES" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "HALF 50%" }));
    await waitFor(() => expect(applyPreset).toHaveBeenCalledTimes(1));
    expect(applyPreset.mock.calls[0][0]).toMatch(/^preset-/);
  });

  it("a failed apply shows the toast with the 142 wording", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const api: HomeApi = { ...base, applyPreset: () => Promise.reject(new ApiError("server", "position_unknown", 409)) };
    await renderModes({ api });
    fireEvent.click(await screen.findByRole("button", { name: "MODES" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "HALF 50%" }));
    expect(await screen.findByText("POSITION UNKNOWN: move to an end first")).toBeTruthy();
  });

  it("is disabled for an unavailable cover", async () => {
    await renderModes({ entity: { ...cover, state: "unavailable" } });
    const button = (await screen.findByRole("button", { name: "MODES" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
