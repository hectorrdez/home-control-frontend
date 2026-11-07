import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Area, ConnectionState, Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import TelemetryPage from "./TelemetryPage";

const ent = (
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
  extra: Partial<Entity> = {},
): Entity => {
  const [domain, ...rest] = entityId.split(".");
  return {
    entityId,
    domain,
    name: rest.join(" ").replace(/_/g, " "),
    state,
    attributes,
    area: "kitchen",
    lastChanged: "2026-11-06T10:00:00.000Z",
    ...extra,
  };
};

const sensorAttrs = (deviceClass: string, unit?: string) => ({
  state_class: "measurement",
  device_class: deviceClass,
  ...(unit ? { unit_of_measurement: unit } : {}),
});

const fullHouse: Entity[] = [
  ent("sensor.kitchen_temperature", "21.5", sensorAttrs("temperature", "°C")),
  ent("sensor.living_temperature", "23.1", sensorAttrs("temperature", "°C"), { area: "living" }),
  ent("sensor.kitchen_humidity", "48", sensorAttrs("humidity", "%")),
  ent("sensor.kitchen_co2", "650", sensorAttrs("carbon_dioxide", "ppm")),
  ent("sensor.kitchen_pm25", "8", sensorAttrs("pm25", "µg/m³")),
  ent("sensor.house_total_power", "1500", sensorAttrs("power", "W")),
  ent("sensor.energy_today", "4.2", sensorAttrs("energy", "kWh")),
  ent("sensor.solar_power", "300", sensorAttrs("power", "W")),
  ent("light.kitchen_ceiling", "on", {}),
  ent("binary_sensor.front_door", "off", { device_class: "door" }, { area: "living" }),
];

const areasOf = (entities: Entity[]): Area[] => [
  { areaId: "kitchen", name: "Kitchen", entities: entities.filter((e) => e.area === "kitchen") },
  { areaId: "living", name: "Living", entities: entities.filter((e) => e.area === "living") },
];

interface Setup {
  areas?: Area[] | "pending" | "reject";
  connection?: ConnectionState;
}

function harness(setup: Setup) {
  let onEntity: (e: Entity) => void = () => undefined;
  let onConnection: (s: ConnectionState) => void = () => undefined;
  const getAreas = vi.fn(() => {
    if (setup.areas === "pending") return new Promise<Area[]>(() => undefined);
    if (setup.areas === "reject") return Promise.reject(new Error("down"));
    return Promise.resolve(setup.areas ?? areasOf(fullHouse));
  });
  const api = {
    getStatus: vi.fn(async () => ({ online: true, version: "1" })),
    getAreas,
    getEntities: vi.fn(),
    runAction: vi.fn(),
    getHistory: vi.fn(async () => []),
    getAliases: vi.fn(async () => []),
    setAlias: vi.fn(),
    deleteAlias: vi.fn(),
    subscribe: vi.fn((e: (x: Entity) => void, c: (s: ConnectionState) => void) => {
      onEntity = e;
      onConnection = c;
      return () => undefined;
    }),
  } as unknown as HomeApi;
  return {
    api,
    getAreas,
    emitEntity: (e: Entity) => act(() => onEntity(e)),
    emitConnection: (s: ConnectionState) => act(() => onConnection(s)),
  };
}

function renderPage(setup: Setup = {}) {
  const h = harness(setup);
  const utils = render(
    <ApiProvider api={h.api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <TelemetryPage />
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return { ...utils, h };
}

// The header strip is portalled into [data-slot="status-strip"] when the app shell provides one.
function withStatusSlot(): HTMLElement {
  const slot = document.createElement("div");
  slot.setAttribute("data-slot", "status-strip");
  document.body.appendChild(slot);
  return slot;
}

describe("TelemetryPage", () => {
  afterEach(() => {
    cleanup();
    document.querySelectorAll('[data-slot="status-strip"]').forEach((n) => n.remove());
  });

  it("shows the skeleton while the areas are loading", () => {
    renderPage({ areas: "pending" });
    expect(screen.getByRole("heading", { name: "Telemetry & sensors" })).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("shows the error state and retries the load", async () => {
    const { h } = renderPage({ areas: "reject" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not load telemetry.")).toBeTruthy();
    expect(h.getAreas).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    await waitFor(() => expect(h.getAreas).toHaveBeenCalledTimes(2));
  });

  it("shows NO SENSORS when the house has no sensors", async () => {
    renderPage({ areas: [{ areaId: "kitchen", name: "Kitchen", entities: [ent("light.kitchen", "on")] }] });
    expect(await screen.findByText("NO SENSORS")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Key metrics" })).toBeNull();
  });

  it("renders the ready dashboard with KPIs, gauges, charts and the status strip", async () => {
    const slot = withStatusSlot();
    renderPage();

    expect(await screen.findByRole("region", { name: "Key metrics" })).toBeTruthy();
    expect(screen.getByText("Climate mean")).toBeTruthy();
    expect(screen.getByText("Air quality")).toBeTruthy();
    expect(screen.getByText("Power")).toBeTruthy();
    expect(screen.getByText("Nodes")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Levels" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Climate history" })).toBeTruthy();
    expect(screen.getByText(/LIVE • 8 CHARTS/)).toBeTruthy();

    await waitFor(() => expect(slot.textContent).toMatch(/SENSORS \d+ • \d+\/\d+ ONLINE/));
    expect(screen.getByRole("status", { name: "Live connection" }).textContent).toContain("LIVE");
    expect(screen.getByText("1.50")).toBeTruthy();
  });

  it("renders the lighter layout when only some sensors exist and no status slot is present", async () => {
    const sparse = [
      ent("sensor.balcony_pm25", "12", sensorAttrs("pm25", "µg/m³")),
      ent("sensor.garage_power", "500", sensorAttrs("power", "W")),
    ];
    renderPage({ areas: areasOf(sparse) });

    expect(await screen.findByText("Air quality")).toBeTruthy();
    expect(screen.queryByText("Climate mean")).toBeNull();
    expect(screen.queryByRole("region", { name: "Levels" })).toBeNull();
    expect(screen.getAllByText("500").length).toBeGreaterThan(0);
    expect(screen.getAllByText("W").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-slot="status-strip"]')).toBeNull();
  });

  it("toggles the live event feed drawer from the EVENTS button", async () => {
    const { h } = renderPage();
    const button = await screen.findByRole("button", { name: /EVENTS \(0\)/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const drawer = screen.getByLabelText("Live event feed");
    expect(drawer.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(drawer.getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByText("WAITING FOR EVENTS")).toBeTruthy();

    // A door opening arrives on the stream: the feed gains an event and the count updates.
    h.emitEntity(ent("binary_sensor.front_door", "on", { device_class: "door" }, { area: "living" }));
    expect(await screen.findByRole("button", { name: /EVENTS \(1\)/ })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Event feed items" }).children).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Close Live event feed/ }));
    expect(screen.getByLabelText("Live event feed").getAttribute("aria-hidden")).toBe("true");
  });

  it("reflects the connection state from the stream", async () => {
    const { h } = renderPage();
    await screen.findByRole("region", { name: "Key metrics" });
    h.emitConnection("closed");
    expect(screen.getByRole("status", { name: "Live connection" }).textContent).toContain("OFFLINE");
  });
});

describe("TelemetryPage fixed panels (feature 125)", () => {
  const battery = ent("sensor.phone_battery_level", "82", sensorAttrs("battery", "%"), { area: "kitchen" });
  const withBattery = () => areasOf([...fullHouse, battery]);

  const openCharts = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "CHARTS" }));
  };
  const fixedSwitch = (name: string | RegExp) =>
    within(screen.getByRole("list", { name: "Fixed panel toggles" })).getByRole("switch", { name });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.querySelectorAll('[data-slot="status-strip"]').forEach((n) => n.remove());
  });

  it("hides the phone battery gauge by default and keeps the other gauges", async () => {
    renderPage({ areas: withBattery() });
    const levels = await screen.findByRole("region", { name: "Levels" });
    const gauges = within(levels).getAllByRole("img");
    expect(gauges).toHaveLength(1);
    expect(gauges[0].getAttribute("aria-label")).toMatch(/^Average humidity:/);
  });

  it("shows a battery gauge again when its fixed panel switch is turned on, and keeps it after a reload", async () => {
    const first = renderPage({ areas: withBattery() });
    await screen.findByRole("region", { name: "Levels" });
    await openCharts();
    fireEvent.click(fixedSwitch(/battery/i));
    expect(within(screen.getByRole("region", { name: "Levels" })).getAllByRole("img")).toHaveLength(2);
    first.unmount();

    renderPage({ areas: withBattery() });
    await screen.findByRole("region", { name: "Levels" });
    expect(within(screen.getByRole("region", { name: "Levels" })).getAllByRole("img")).toHaveLength(2);
  });

  it("hides and restores a KPI card from the CHARTS panel", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Key metrics" });
    expect(screen.getByRole("region", { name: "Nodes" })).toBeTruthy();

    await openCharts();
    fireEvent.click(fixedSwitch("Show Nodes"));
    expect(screen.queryByRole("region", { name: "Nodes" })).toBeNull();

    fireEvent.click(fixedSwitch("Show Nodes"));
    expect(screen.getByRole("region", { name: "Nodes" })).toBeTruthy();
  });

  it("omits the Levels section when every gauge is hidden", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Levels" });
    await openCharts();
    fireEvent.click(fixedSwitch("Show Average humidity"));
    expect(screen.queryByRole("region", { name: "Levels" })).toBeNull();
  });

  it("lists only fixed panels that exist and filters them with the search box", async () => {
    renderPage({ areas: areasOf([ent("sensor.kitchen_co2", "650", sensorAttrs("carbon_dioxide", "ppm"))]) });
    await screen.findByRole("region", { name: "Key metrics" });
    await openCharts();
    expect(screen.queryByRole("switch", { name: "Show Climate mean" })).toBeNull();
    expect(fixedSwitch("Show Air quality")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search charts" }), { target: { value: "zzz" } });
    expect(screen.queryByRole("list", { name: "Fixed panel toggles" })).toBeNull();
  });
});
