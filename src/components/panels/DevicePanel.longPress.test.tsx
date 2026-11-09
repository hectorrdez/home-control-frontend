import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import { AliasesProvider } from "@/state/AliasesProvider";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { PresetsProvider } from "@/state/PresetsProvider";
import { ToastProvider } from "@components/feedback/Toast";
import DevicePanel from "./DevicePanel";

// Feature 156: the Home 3D panel wires the tile long press to the actuator menu (one menu open at a time).
function renderPanel() {
  render(
    <ApiProvider api={createMockApi({ actionDelayMs: 0 })}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <CalibrationsProvider>
              <PresetsProvider>
                <MemoryRouter>
                  <DevicePanel />
                </MemoryRouter>
              </PresetsProvider>
            </CalibrationsProvider>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
}

afterEach(cleanup);

describe("DevicePanel long-press menu (156)", () => {
  it("the ContextMenu key on a device tile opens its actuator menu, Escape closes it", async () => {
    renderPanel();
    const list = await screen.findByRole("list", { name: "Devices" });
    const tile = within(list).getAllByRole("button")[0];
    const name = tile.getAttribute("aria-label") ?? "";
    expect(name).not.toBe("");

    fireEvent.keyDown(tile, { key: "ContextMenu" });
    const dialog = await screen.findByRole("dialog", { name });
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ir a detalles del dispositivo" })).toBeTruthy();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
