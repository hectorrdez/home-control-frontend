import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
import type { Intent } from "@/state/actions";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import DeviceControls from "./DeviceControls";

const base = { area: "kitchen", lastChanged: "2026-11-06T10:00:00.000Z" };

const entity = (overrides: Partial<Entity> & Pick<Entity, "entityId" | "domain">): Entity => ({
  name: "Kitchen ceiling",
  state: "off",
  attributes: {},
  ...base,
  ...overrides,
});

function renderControls(e: Entity, opts: { disabled?: boolean; send?: (i: Intent) => void } = {}) {
  const send = opts.send ?? vi.fn();
  const api = createMockApi({ actionDelayMs: 0 });
  const utils = render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <DeviceControls entity={e} disabled={opts.disabled ?? false} send={send} />
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return { ...utils, send };
}

afterEach(cleanup);

describe("DeviceControls: light", () => {
  it("sends power on the switch and the brightness on the intensity slider", () => {
    const light = entity({ entityId: "light.kitchen", domain: "light", state: "on", attributes: { brightness: 204 } });
    const { send } = renderControls(light);

    fireEvent.click(screen.getByRole("switch", { name: "Kitchen ceiling power" }));
    expect(send).toHaveBeenLastCalledWith({ kind: "power", on: false });

    const slider = screen.getByRole("slider", { name: /INTENSITY/ });
    expect((slider as HTMLInputElement).value).toBe("80");
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.pointerUp(slider);
    expect(send).toHaveBeenLastCalledWith({ kind: "brightness", pct: 40 });
  });

  it("hides the intensity slider when the light reports no brightness", () => {
    renderControls(entity({ entityId: "light.hall", domain: "light", state: "off", attributes: { brightness: "bright" } }));
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("honours the disabled flag", () => {
    renderControls(entity({ entityId: "light.kitchen", domain: "light" }), { disabled: true });
    expect((screen.getByRole("switch") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("DeviceControls: switch and fan", () => {
  it("turns a switch on when it is off", () => {
    const { send } = renderControls(entity({ entityId: "switch.coffee", domain: "switch", name: "Coffee", state: "off" }));
    fireEvent.click(screen.getByRole("switch", { name: "Coffee power" }));
    expect(send).toHaveBeenCalledWith({ kind: "power", on: true });
  });

  it("drives a fan with the same power control", () => {
    const { send } = renderControls(entity({ entityId: "fan.office", domain: "fan", name: "Office fan", state: "on" }));
    fireEvent.click(screen.getByRole("switch", { name: "Office fan power" }));
    expect(send).toHaveBeenCalledWith({ kind: "power", on: false });
  });
});

describe("DeviceControls: climate", () => {
  const climate = (attributes: Record<string, unknown> = {}) =>
    entity({
      entityId: "climate.living",
      domain: "climate",
      name: "Living thermostat",
      state: "heat",
      attributes: {
        temperature: 21,
        current_temperature: 19.5,
        hvac_modes: ["heat", "off"],
        preset_modes: ["eco", "comfort"],
        preset_mode: "eco",
        ...attributes,
      },
    });

  it("shows ambient and target readouts", () => {
    renderControls(climate());
    expect(screen.getByText("CURRENT AMBIENT 19.5 °C")).toBeTruthy();
    expect(screen.getByText("TARGET SETPOINT 21.0 °C")).toBeTruthy();
  });

  it("shows a dash when the current temperature is missing and uses defaults for limits", () => {
    renderControls(climate({ temperature: undefined, current_temperature: undefined, hvac_modes: undefined, preset_modes: undefined }));
    expect(screen.getByText("CURRENT AMBIENT -")).toBeTruthy();
    expect(screen.getByText("TARGET SETPOINT 7.0 °C")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "HVAC mode" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Preset" })).toBeNull();
  });

  it("debounces a stepped temperature into one temperature intent", async () => {
    const { send } = renderControls(climate());
    fireEvent.click(screen.getByRole("button", { name: "Increase Target temperature" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Target temperature" }));
    expect(screen.getByText("22.0 °C")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();

    await waitFor(() => expect(send).toHaveBeenCalledWith({ kind: "temperature", temperature: 22 }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when a pending step is undone before the debounce ends", async () => {
    const { send } = renderControls(climate());
    fireEvent.click(screen.getByRole("button", { name: "Increase Target temperature" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease Target temperature" }));
    await new Promise((ok) => setTimeout(ok, 700));
    expect(send).not.toHaveBeenCalled();
  });

  it("follows the store target when no local step is waiting", () => {
    const { rerender, send } = renderControls(climate());
    const next = climate({ temperature: 24 });
    rerender(
      <ApiProvider api={createMockApi({ actionDelayMs: 0 })}>
        <ToastProvider>
          <EntitiesProvider>
            <AliasesProvider>
              <DeviceControls entity={next} disabled={false} send={send} />
            </AliasesProvider>
          </EntitiesProvider>
        </ToastProvider>
      </ApiProvider>,
    );
    expect(screen.getByText("24.0 °C")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the HVAC mode and the preset picked from the pills", () => {
    const { send } = renderControls(climate());
    expect(screen.getByRole("button", { name: "HEAT" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "OFF" }));
    expect(send).toHaveBeenCalledWith({ kind: "hvac_mode", mode: "off" });

    const preset = screen.getByRole("group", { name: "Preset" });
    expect(preset).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "COMFORT" }));
    expect(send).toHaveBeenCalledWith({ kind: "preset", preset: "comfort" });
    expect(screen.getByRole("button", { name: "ECO" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("DeviceControls: cover", () => {
  const cover = (attributes: Record<string, unknown> = {}, state = "open") =>
    entity({ entityId: "cover.blinds", domain: "cover", name: "Blinds", state, attributes });

  it("sends a position from the slider and the SHUT and FULL presets", () => {
    const { send } = renderControls(cover({ current_position: 40 }));
    expect(screen.getByText("40% OPEN")).toBeTruthy();

    const slider = screen.getByRole("slider", { name: /OPEN/ });
    fireEvent.change(slider, { target: { value: "70" } });
    fireEvent.pointerUp(slider);
    expect(send).toHaveBeenLastCalledWith({ kind: "cover_position", position: 70 });

    fireEvent.click(screen.getByRole("button", { name: "SHUT (0%)" }));
    expect(send).toHaveBeenLastCalledWith({ kind: "cover_close" });
    fireEvent.click(screen.getByRole("button", { name: "FULL (100%)" }));
    expect(send).toHaveBeenLastCalledWith({ kind: "cover_open" });
  });

  it("derives the position from the open or closed state when no position is reported", () => {
    const { unmount } = renderControls(cover({}, "open"));
    expect(screen.getByText("100% OPEN")).toBeTruthy();
    unmount();

    renderControls(cover({}, "closed"));
    expect(screen.getByText("0% OPEN")).toBeTruthy();
  });

  it("disables the presets while disabled", () => {
    renderControls(cover({ current_position: 10 }), { disabled: true });
    expect((screen.getByRole("button", { name: "SHUT (0%)" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "FULL (100%)" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("DeviceControls: lock", () => {
  const lock = (state: string) => entity({ entityId: "lock.front", domain: "lock", name: "Front door", state });

  it("locks immediately without a confirm step", () => {
    const { send } = renderControls(lock("unlocked"));
    fireEvent.click(screen.getByRole("switch", { name: "Front door locked" }));
    expect(send).toHaveBeenCalledWith({ kind: "lock", locked: true });
  });

  it("asks for confirmation before unlocking and sends the unlock on CONFIRM", () => {
    const { send } = renderControls(lock("locked"));
    fireEvent.click(screen.getByRole("switch", { name: "Front door locked" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText("Unlock Front door?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "CONFIRM UNLOCK" }));
    expect(send).toHaveBeenCalledWith({ kind: "lock", locked: false });
    expect(screen.queryByText("Unlock Front door?")).toBeNull();
  });

  it("cancels the unlock without sending anything", () => {
    const { send } = renderControls(lock("locked"));
    fireEvent.click(screen.getByRole("switch", { name: "Front door locked" }));
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Front door locked" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("DeviceControls: scene, script and read-only domains", () => {
  it.each([
    ["scene", "scene.movie"],
    ["script", "script.goodnight"],
  ])("activates a %s", (domain, entityId) => {
    const { send } = renderControls(entity({ entityId, domain, name: "Scene" }));
    fireEvent.click(screen.getByRole("button", { name: "ACTIVATE" }));
    expect(send).toHaveBeenCalledWith({ kind: "activate" });
  });

  it("renders nothing for sensors, which are read-only", () => {
    const { container } = renderControls(entity({ entityId: "sensor.temp", domain: "sensor", name: "Temp" }));
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("DeviceControls: busy while an action is in flight (117)", () => {
  it("shows the loader in the control that sent the action and keeps the sliders focusable", () => {
    const light = entity({ entityId: "light.kitchen", domain: "light", state: "on", attributes: { brightness: 204 } });
    renderControls(light, { disabled: true });
    expect(screen.getByRole("switch", { name: "Kitchen ceiling power" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("slider", { name: /INTENSITY/ }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getAllByTestId("spinner").length).toBe(2);
    expect((screen.getByRole("slider", { name: /INTENSITY/ }) as HTMLInputElement).disabled).toBe(false);
  });

  it("marks the scene activation busy", () => {
    renderControls(entity({ entityId: "scene.movie", domain: "scene", name: "Movie" }), { disabled: true });
    expect(screen.getByRole("button", { name: "ACTIVATE" }).getAttribute("aria-busy")).toBe("true");
  });

  it("marks the mode and preset pills busy and the setpoint stepper busy, without disabling the stepper", () => {
    renderControls(
      entity({
        entityId: "climate.hall",
        domain: "climate",
        state: "heat",
        attributes: { temperature: 21, hvac_modes: ["off", "heat"], preset_modes: ["home"], preset_mode: "home" },
      }),
      { disabled: true },
    );
    expect(screen.getByRole("button", { name: "HEAT" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "HOME" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("group", { name: "Target temperature" }).getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: "Increase Target temperature" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("marks the cover presets and the position slider busy", () => {
    renderControls(entity({ entityId: "cover.blinds", domain: "cover", state: "open", attributes: { current_position: 10 } }), {
      disabled: true,
    });
    expect(screen.getByRole("button", { name: "SHUT (0%)" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("slider").getAttribute("aria-busy")).toBe("true");
  });

  it("shows no loader when nothing is in flight", () => {
    renderControls(entity({ entityId: "light.kitchen", domain: "light", state: "on", attributes: { brightness: 204 } }));
    expect(screen.queryByTestId("spinner")).toBeNull();
    expect(screen.getByRole("switch", { name: "Kitchen ceiling power" }).getAttribute("aria-busy")).toBeNull();
  });
});
