import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/api/types";
import { resetCoverMemory } from "@/features/covers/coverMemory";
import { ToastProvider } from "@components/feedback/Toast";
import ActuatorTile from "./ActuatorTile";

// Feature 157: cover tile taps (decision, live percentage, stop + toast, reversal, no double send).
// The action hook is mocked: `send` records the intents and resolves true; pending is set directly.
const hoisted = vi.hoisted(() => ({
  send: vi.fn(),
  pending: false,
  calibrations: { status: "ready", calibrations: {} as Record<string, unknown> },
}));

vi.mock("./useDeviceAction", () => ({
  useDeviceAction: () => ({ send: hoisted.send, pending: hoisted.pending, settling: false, feedback: null }),
}));

vi.mock("@/state/CalibrationsProvider", () => ({
  useCalibrations: () => hoisted.calibrations,
}));

vi.mock("@/features/names/useEntityName", () => ({
  useEntityName: () => ({
    displayName: (e: { name: string }) => e.name,
    shortName: (e: { name: string }) => e.name,
  }),
}));

const ID = "cover.kitchen_blinds";
const NAME = "Kitchen blinds";

function cover(state: string, attributes: Record<string, unknown> = {}): Entity {
  return { entityId: ID, domain: "cover", name: NAME, state, attributes, area: "kitchen", lastChanged: "2026-11-09T10:00:00.000Z" };
}

const ui = (entity: Entity) => (
  <MemoryRouter initialEntries={["/"]}>
    <ToastProvider>
      <ActuatorTile entity={entity} areaName="KITCHEN" />
    </ToastProvider>
  </MemoryRouter>
);

const tile = () => screen.getByRole("button", { name: NAME });
const sent = () => hoisted.send.mock.calls.map((call) => call[0]);
const flush = () => act(async () => {});

function calibrate(on: boolean) {
  hoisted.calibrations = {
    status: "ready",
    calibrations: on ? { [ID]: { entityId: ID, openMs: 20000, closeMs: 20000, position: null, calibratedAt: "2026-11-01T00:00:00.000Z" } } : {},
  };
}

beforeEach(() => {
  hoisted.send.mockReset();
  hoisted.send.mockImplementation(() => Promise.resolve(true));
  hoisted.pending = false;
  calibrate(false);
  resetCoverMemory();
});

afterEach(() => {
  cleanup();
});

describe("cover tile: idle tap, calibrated", () => {
  it("goes to the nearest extreme: 80% -> fully open", async () => {
    calibrate(true);
    render(ui(cover("open", { estimated_position: 80 })));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_percent", percent: 100 }]);
  });

  it("30% -> fully closed", async () => {
    calibrate(true);
    render(ui(cover("open", { estimated_position: 30 })));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_percent", percent: 0 }]);
  });

  it("does not open the detail page on tap", async () => {
    calibrate(true);
    render(ui(cover("open", { estimated_position: 30 })));
    fireEvent.click(tile());
    await flush();
    expect(screen.queryByText("DETAIL PAGE")).toBeNull();
  });
});

describe("cover tile: idle tap, uncalibrated", () => {
  it("first tap opens, the next one closes (opposite of the last command)", async () => {
    const { rerender } = render(ui(cover("closed")));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_open" }]);

    rerender(ui(cover("open")));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_open" }, { kind: "cover_close" }]);
  });

  it("last close -> open", async () => {
    const { rerender } = render(ui(cover("closed")));
    fireEvent.click(tile()); // no command yet -> open
    await flush();
    rerender(ui(cover("open")));
    fireEvent.click(tile()); // last open -> close
    await flush();
    rerender(ui(cover("closed")));
    fireEvent.click(tile()); // last close -> open
    await flush();
    expect(sent()).toEqual([{ kind: "cover_open" }, { kind: "cover_close" }, { kind: "cover_open" }]);
  });
});

describe("cover tile: moving", () => {
  it("shows the live percentage while moving (calibrated estimate)", () => {
    calibrate(true);
    render(ui(cover("closing", { estimated_position: 42 })));
    expect(screen.getByTestId("cover-percent").textContent).toBe("42%");
  });

  it("a tap while moving sends the real stop and toasts the stop percentage (calibrated)", async () => {
    calibrate(true);
    render(ui(cover("closing", { estimated_position: 42 })));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_stop" }]);
    expect(await screen.findByText("Kitchen blinds stopped at 42%")).toBeTruthy();
  });

  it("a stop with no reported position toasts the estimate from the move start (calibrated)", async () => {
    calibrate(true);
    const { rerender } = render(ui(cover("open", { estimated_position: 30 })));
    fireEvent.click(tile()); // idle at 30 -> close, leg 20 s
    await flush();
    rerender(ui(cover("closing", { estimated_position: null })));
    fireEvent.click(tile()); // stop right away: the estimate is the start position
    await flush();
    expect(sent()).toEqual([{ kind: "cover_percent", percent: 0 }, { kind: "cover_stop" }]);
    expect(await screen.findByText("Kitchen blinds stopped at 30%")).toBeTruthy();
  });

  it("a stop of an uncalibrated cover shows no toast", async () => {
    render(ui(cover("opening")));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_stop" }]);
    expect(screen.queryByText(/stopped at/)).toBeNull();
  });

  it("a calibrated move (no position until it ends) counts as moving: the tap stops it", async () => {
    calibrate(true);
    const { rerender } = render(ui(cover("open", { estimated_position: 30 })));
    fireEvent.click(tile()); // idle at 30 -> close
    await flush();
    rerender(ui(cover("open", { estimated_position: null })));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_percent", percent: 0 }, { kind: "cover_stop" }]);
  });
});

describe("cover tile: reversal after a stop", () => {
  it("after a stop the next tap goes opposite to the stopped move", async () => {
    calibrate(true);
    const { rerender } = render(ui(cover("open", { estimated_position: 30 })));
    fireEvent.click(tile()); // idle at 30 -> close
    await flush();

    rerender(ui(cover("closing", { estimated_position: 25 })));
    fireEvent.click(tile()); // moving -> stop
    await flush();

    rerender(ui(cover("closed", { estimated_position: 25 })));
    fireEvent.click(tile()); // after the stop of a close -> open
    await flush();

    expect(sent()).toEqual([{ kind: "cover_percent", percent: 0 }, { kind: "cover_stop" }, { kind: "cover_percent", percent: 100 }]);
  });

  it("uncalibrated: stopping an opening cover, the next tap closes", async () => {
    const { rerender } = render(ui(cover("closed")));
    fireEvent.click(tile()); // open
    await flush();
    rerender(ui(cover("opening")));
    fireEvent.click(tile()); // stop
    await flush();
    rerender(ui(cover("closed")));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_open" }, { kind: "cover_stop" }, { kind: "cover_close" }]);
  });
});

describe("cover tile: no double send", () => {
  it("a second tap while the move is in flight sends only the stop (no second move)", async () => {
    hoisted.send.mockImplementation(() => new Promise(() => undefined)); // never settles
    render(ui(cover("closed")));
    fireEvent.click(tile());
    fireEvent.click(tile());
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_open" }, { kind: "cover_stop" }]);
  });

  it("a tap while another action is pending sends nothing", async () => {
    hoisted.pending = true;
    render(ui(cover("closed")));
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([]);
  });

  it("a second tap while the stop is in flight sends nothing", async () => {
    hoisted.send.mockImplementation(() => new Promise(() => undefined));
    render(ui(cover("opening")));
    fireEvent.click(tile());
    fireEvent.click(tile());
    await flush();
    expect(sent()).toEqual([{ kind: "cover_stop" }]);
  });
});
