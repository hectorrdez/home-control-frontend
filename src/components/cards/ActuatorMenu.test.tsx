import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { createMockApi } from "@/api/mock/createMockApi";
import { ApiError, type Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { PresetsProvider } from "@/state/PresetsProvider";
import { ToastProvider } from "@components/feedback/Toast";
import ActuatorMenu from "./ActuatorMenu";

// Feature 156: the long-press menu. Real providers over the mock API; the device action hook is mocked.
const hoisted = vi.hoisted(() => ({ send: vi.fn(), pending: false }));

vi.mock("./useDeviceAction", () => ({
  useDeviceAction: () => ({ send: hoisted.send, pending: hoisted.pending, settling: false, feedback: null }),
}));

const LIGHT = "light.kitchen_ceiling";
const COVER = "cover.salon_blind";

const light: Entity = {
  entityId: LIGHT,
  domain: "light",
  name: "Kitchen ceiling",
  state: "off",
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
};

const cover: Entity = {
  entityId: COVER,
  domain: "cover",
  name: "Salon blind",
  state: "closed",
  attributes: { estimated_position: 0 },
  area: "living_room",
  lastChanged: "2026-11-08T10:00:00.000Z",
};

interface Setup {
  api?: HomeApi;
  entity?: Entity;
  onClose?: () => void;
}

// Provides every provider the menu reads, then renders the menu on "/" and a stub detail page on the device route.
function renderMenu({ api = createMockApi({ actionDelayMs: 0 }), entity = light, onClose = vi.fn() }: Setup = {}) {
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <CalibrationsProvider>
              <PresetsProvider>
                <MemoryRouter initialEntries={["/"]}>
                  <Routes>
                    <Route path="/" element={<ActuatorMenu entity={entity} onClose={onClose} />} />
                    <Route path="/devices/:deviceKey" element={<p>DETAIL PAGE</p>} />
                  </Routes>
                </MemoryRouter>
              </PresetsProvider>
            </CalibrationsProvider>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return { api, onClose };
}

// Lets the aliases, calibrations and presets providers finish their one-time load.
async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  hoisted.send.mockReset();
  hoisted.pending = false;
});

afterEach(() => {
  cleanup();
});

describe("ActuatorMenu contents per device type (156)", () => {
  it("a light offers details and rename, no slider and no MODES", async () => {
    renderMenu();
    await settle();
    expect(screen.getByRole("dialog", { name: "Kitchen ceiling" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ir a detalles del dispositivo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cambiar nombre" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Modos" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("an uncalibrated cover has no position slider and no MODES", async () => {
    renderMenu({ entity: cover, api: createMockApi({ actionDelayMs: 0 }) });
    await settle();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: "Modos" })).toBeNull();
  });

  it("a calibrated cover shows the position slider and MODES", async () => {
    renderMenu({ entity: cover, api: createMockApi({ scenario: "cover-presets", actionDelayMs: 0 }) });
    await settle();
    expect(await screen.findByRole("button", { name: "Modos" })).toBeTruthy();
    expect(screen.getByRole("slider")).toBeTruthy();
  });

  it("the position slider sends cover_percent for a calibrated cover", async () => {
    renderMenu({ entity: cover, api: createMockApi({ scenario: "cover-presets", actionDelayMs: 0 }) });
    await settle();
    const slider = screen.getByRole("slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.pointerUp(slider);
    expect(hoisted.send).toHaveBeenCalledWith({ kind: "cover_percent", percent: 40 });
  });

  it("MODES is hidden when the presets endpoint is unavailable", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    renderMenu({ entity: cover, api: { ...base, getPresets: () => Promise.reject(new Error("404")) } });
    await settle();
    expect(screen.queryByRole("button", { name: "Modos" })).toBeNull();
  });
});

describe("ActuatorMenu navigation and dialog behaviour (156)", () => {
  it("Ir a detalles navigates to the device page and closes the menu", async () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Ir a detalles del dispositivo" }));
    expect(await screen.findByText("DETAIL PAGE")).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes the menu", async () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the close button closes the menu", () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Close Kitchen ceiling" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab inside the dialog (wraps from last to first and back)", () => {
    renderMenu();
    const dialog = screen.getByRole("dialog");
    const focusables = within(dialog).getAllByRole("button");
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("returns focus to the element that had it before the menu opened", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open tile
          </button>
          {open && <ActuatorMenu entity={light} onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(
      <ApiProvider api={createMockApi({ actionDelayMs: 0 })}>
        <ToastProvider>
          <EntitiesProvider>
            <AliasesProvider>
              <CalibrationsProvider>
                <PresetsProvider>
                  <MemoryRouter>
                    <Host />
                  </MemoryRouter>
                </PresetsProvider>
              </CalibrationsProvider>
            </AliasesProvider>
          </EntitiesProvider>
        </ToastProvider>
      </ApiProvider>,
    );
    const trigger = screen.getByRole("button", { name: "open tile" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("ActuatorMenu rename flow (156)", () => {
  it("Enter saves the alias and the dialog title follows it", async () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar nombre" }));
    const input = screen.getByRole("textbox", { name: `Name for ${LIGHT}` });
    expect((input as HTMLInputElement).value).toBe("Kitchen ceiling");
    fireEvent.change(input, { target: { value: "Cocina techo" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(screen.getByRole("dialog", { name: "Cocina techo" })).toBeTruthy();
  });

  it("Escape cancels the edit and keeps the dialog open", async () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar nombre" }));
    const input = screen.getByRole("textbox", { name: `Name for ${LIGHT}` });
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Kitchen ceiling" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("an empty name resets the alias to the cleaned name", async () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar nombre" }));
    fireEvent.change(screen.getByRole("textbox", { name: `Name for ${LIGHT}` }), { target: { value: "Cocina techo" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: `Name for ${LIGHT}` }), { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Cambiar nombre" }));
    fireEvent.change(screen.getByRole("textbox", { name: `Name for ${LIGHT}` }), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: `Name for ${LIGHT}` }), { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Kitchen ceiling" })).toBeTruthy());
  });

  it("a failed save shows the error and keeps the editor open", async () => {
    const base = createMockApi({ actionDelayMs: 0 });
    renderMenu({ api: { ...base, setAlias: () => Promise.reject(new Error("boom")) } });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar nombre" }));
    const input = screen.getByRole("textbox", { name: `Name for ${LIGHT}` });
    fireEvent.change(input, { target: { value: "Cocina techo" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("COULD NOT RENAME")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: `Name for ${LIGHT}` })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Kitchen ceiling" })).toBeTruthy();
  });

  it("hides the rename option when aliases are unavailable", async () => {
    const base = createMockApi({ actionDelayMs: 0 });
    renderMenu({ api: { ...base, getAliases: () => Promise.reject(new ApiError("not_found", "404", 404)) } });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cambiar nombre" })).toBeNull());
  });
});

describe("ActuatorMenu modes entry (156)", () => {
  it("MODES opens the modes dialog in place of the menu", async () => {
    renderMenu({ entity: cover, api: createMockApi({ scenario: "cover-presets", actionDelayMs: 0 }) });
    fireEvent.click(await screen.findByRole("button", { name: "Modos" }));
    expect(await screen.findByRole("dialog", { name: "Modos: Salon blind" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ir a detalles del dispositivo" })).toBeNull();
  });
});
