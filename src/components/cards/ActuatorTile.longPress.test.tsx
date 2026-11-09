import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@components/feedback/Toast";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/api/types";
import ActuatorTile from "./ActuatorTile";

// Feature 156: the tile opens the actuator menu on long press, the ContextMenu key, Shift+F10 or a right click.
// A long press is not also a tap. The action hook is mocked so pending state is set directly.
const hoisted = vi.hoisted(() => ({
  send: vi.fn(),
  pending: false,
}));

vi.mock("./useDeviceAction", () => ({
  useDeviceAction: () => ({ send: hoisted.send, pending: hoisted.pending, settling: false, feedback: null }),
}));

vi.mock("@/features/names/useEntityName", () => ({
  useEntityName: () => ({
    displayName: (e: { name: string }) => e.name,
    shortName: (e: { name: string }) => e.name,
  }),
}));

const kitchen: Entity = {
  entityId: "light.kitchen_ceiling",
  domain: "light",
  name: "Kitchen ceiling",
  state: "off",
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
};

function renderTile(onLongPress = vi.fn()) {
  render(
    <ToastProvider><MemoryRouter>
      <ActuatorTile entity={kitchen} areaName="KITCHEN" onLongPress={onLongPress} />
    </MemoryRouter></ToastProvider>,
  );
  return { onLongPress, tile: screen.getByRole("button", { name: "Kitchen ceiling" }) };
}

beforeEach(() => {
  vi.useFakeTimers();
  hoisted.send.mockReset();
  hoisted.pending = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ActuatorTile long press (156)", () => {
  it("opens the menu after a hold of about 450 ms and does not tap", () => {
    const { onLongPress, tile } = renderTile();
    fireEvent.pointerDown(tile, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(449));
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onLongPress).toHaveBeenCalledWith(kitchen);
    fireEvent.pointerUp(tile);
    fireEvent.click(tile);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("still opens the menu while the device has a pending action", () => {
    hoisted.pending = true;
    const { onLongPress, tile } = renderTile();
    fireEvent.pointerDown(tile, { button: 0 });
    act(() => vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("a short press is still a tap and does not open the menu", () => {
    const { onLongPress, tile } = renderTile();
    fireEvent.pointerDown(tile, { button: 0 });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerUp(tile);
    fireEvent.click(tile);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(hoisted.send).toHaveBeenCalledWith({ kind: "power", on: true });
  });

  it("moving the pointer away cancels the hold", () => {
    const { onLongPress, tile } = renderTile();
    fireEvent.pointerDown(tile, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(tile, { clientX: 60, clientY: 10 });
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("leaving the tile cancels the hold", () => {
    const { onLongPress, tile } = renderTile();
    fireEvent.pointerDown(tile, { button: 0 });
    fireEvent.pointerLeave(tile);
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("the ContextMenu key opens the menu, Enter stays a tap", () => {
    const { onLongPress, tile } = renderTile();
    fireEvent.keyDown(tile, { key: "ContextMenu" });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(tile, { key: "Enter" });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("Shift+F10 opens the menu, plain F10 does not", () => {
    const { onLongPress, tile } = renderTile();
    fireEvent.keyDown(tile, { key: "F10" });
    expect(onLongPress).not.toHaveBeenCalled();
    fireEvent.keyDown(tile, { key: "F10", shiftKey: true });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("a right click (contextmenu) opens the menu and suppresses the native menu", () => {
    const { onLongPress, tile } = renderTile();
    const notCancelled = fireEvent.contextMenu(tile);
    expect(notCancelled).toBe(false);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("without an onLongPress handler nothing opens and the tap still works", () => {
    render(
      <ToastProvider><MemoryRouter>
        <ActuatorTile entity={kitchen} areaName="KITCHEN" />
      </MemoryRouter></ToastProvider>,
    );
    const tile = screen.getByRole("button", { name: "Kitchen ceiling" });
    fireEvent.keyDown(tile, { key: "ContextMenu" });
    fireEvent.click(tile);
    expect(hoisted.send).toHaveBeenCalledWith({ kind: "power", on: true });
  });
});
