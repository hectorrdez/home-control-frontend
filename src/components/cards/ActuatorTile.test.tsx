import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/api/types";
import { tileIconsSetting, withTileIcon } from "@/features/devices/tileIcons";
import { ToastProvider } from "@components/feedback/Toast";
import ActuatorTile from "./ActuatorTile";

// Feature 155: component states of the compact tile. The action hook is mocked so pending/settling/feedback are set directly.
const hoisted = vi.hoisted(() => ({
  send: vi.fn(),
  pending: false,
  settling: false,
  feedback: null as null | "success" | "error",
}));

vi.mock("@components/cards/useDeviceAction", () => ({
  useDeviceAction: () => ({ send: hoisted.send, pending: hoisted.pending, settling: hoisted.settling, feedback: hoisted.feedback }),
}));

vi.mock("@/features/names/useEntityName", () => ({
  useEntityName: () => ({
    displayName: (e: { name: string }) => e.name,
    shortName: (e: { name: string }) => e.name,
  }),
}));

const make = (domain: string, state: string, name = "Kitchen ceiling", entityId = `${domain}.kitchen_ceiling`): Entity => ({
  entityId,
  domain,
  name,
  state,
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
});

function renderTile(entity: Entity) {
  render(
    <ToastProvider><MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ActuatorTile entity={entity} areaName="KITCHEN" />} />
        <Route path="/devices/:deviceKey" element={<p>DETAIL PAGE</p>} />
      </Routes>
    </MemoryRouter></ToastProvider>,
  );
  return screen.getByRole("button", { name: entity.name });
}

beforeEach(() => {
  hoisted.send.mockReset();
  hoisted.pending = false;
  hoisted.settling = false;
  hoisted.feedback = null;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  tileIconsSetting.forget();
});

describe("ActuatorTile states (155)", () => {
  it("shows name and zone, with the domain-hue border when on", () => {
    const tile = renderTile(make("light", "on"));
    expect(tile.textContent).toContain("Kitchen ceiling");
    expect(tile.textContent).toContain("KITCHEN");
    expect(tile.dataset.state).toBe("on");
    expect(tile.className).toContain("border-primary-container");
    expect(screen.getByTestId("device-icon").className).toContain("shadow-glow-primary");
    expect(tile.getAttribute("aria-busy")).toBeNull();
  });

  it("has a neutral border and no halo when off", () => {
    const tile = renderTile(make("light", "off"));
    expect(tile.dataset.state).toBe("off");
    expect(tile.className).toContain("border-outline-variant/30");
    expect(tile.className).not.toContain("border-primary-container");
    expect(screen.getByTestId("device-icon").className).not.toContain("shadow-glow-primary");
  });

  it("is grey and inert when unavailable", () => {
    const tile = renderTile(make("light", "unavailable"));
    expect(tile.dataset.state).toBe("unavailable");
    expect(tile.className).toContain("border-outline");
    expect(tile.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(tile);
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("replaces the icon with a loader and ignores taps while pending", () => {
    hoisted.pending = true;
    const tile = renderTile(make("light", "on"));
    const icon = screen.getByTestId("device-icon");
    expect(icon.querySelector('[data-testid="spinner"]')).not.toBeNull();
    expect(icon.querySelector("svg")).toBeNull();
    expect(tile.getAttribute("aria-busy")).toBe("true");
    expect(tile.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("SENDING", { selector: "[aria-live]" })).toBeTruthy();
    fireEvent.click(tile);
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("reports UPDATING while the state is settling", () => {
    hoisted.pending = true;
    hoisted.settling = true;
    renderTile(make("light", "on"));
    expect(screen.getByText("UPDATING", { selector: "[aria-live]" })).toBeTruthy();
  });

  it("flashes the feedback state after an action", () => {
    hoisted.feedback = "success";
    expect(renderTile(make("light", "on")).dataset.feedback).toBe("success");
  });
});

describe("ActuatorTile tap (155)", () => {
  it("toggles a switch-like device", () => {
    fireEvent.click(renderTile(make("light", "off")));
    expect(hoisted.send).toHaveBeenCalledWith({ kind: "power", on: true });
  });

  it("runs a scene", () => {
    fireEvent.click(renderTile(make("scene", "scening", "Movie night", "scene.movie_night")));
    expect(hoisted.send).toHaveBeenCalledWith({ kind: "activate" });
  });

  it("opens the device detail page for the other domains instead of sending", () => {
    fireEvent.click(renderTile(make("climate", "heat", "Hall heating", "climate.hall")));
    expect(hoisted.send).not.toHaveBeenCalled();
    expect(screen.getByText("DETAIL PAGE")).toBeTruthy();
  });
});

describe("ActuatorTile icon (155)", () => {
  it("shows the domain default icon", () => {
    renderTile(make("light", "off"));
    expect(screen.getByTestId("device-icon").dataset.icon).toBe("Lightbulb");
  });

  it("shows the icon the user picked for this entity", () => {
    tileIconsSetting.set(withTileIcon(null, "light.kitchen_ceiling", "Fan"));
    renderTile(make("light", "off"));
    expect(screen.getByTestId("device-icon").dataset.icon).toBe("Fan");
  });
});
