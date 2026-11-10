import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Area, Entity, HaStatus } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider, useEntities } from "@/state/EntitiesProvider";
import { UNASSIGNED } from "@/state/entities";
import { ToastProvider } from "@components/feedback/Toast";
import DevicePanel from "./DevicePanel";

const ent = (entityId: string, state: string, area: string | null, attributes: Record<string, unknown> = {}, name?: string): Entity => ({
  entityId,
  domain: entityId.split(".")[0],
  name: name ?? entityId.split(".")[1].replace(/_/g, " "),
  state,
  attributes,
  area,
  lastChanged: "2026-11-06T10:00:00.000Z",
});

const kitchen: Entity[] = [
  ent("light.kitchen_ceiling", "on", "kitchen", {}, "Kitchen ceiling"),
  ent("light.kitchen_lamp", "unavailable", "kitchen", {}, "Kitchen lamp"),
  ent("switch.kettle", "on", "kitchen", {}, "Kettle"),
  ent("sensor.kettle_power", "42", "kitchen", { device_class: "power", unit_of_measurement: "W" }, "Kettle power"),
];
const hall: Entity[] = [ent("lock.front_door", "locked", "hall", {}, "Front door")];
const living: Entity[] = [ent("climate.living", "heat", "living", {}, "Living thermostat")];
const ghost: Entity[] = [ent("light.ghost", "unavailable", "ghost", {}, "Ghost light")];
const loose: Entity[] = [ent("light.loose", "off", UNASSIGNED, {}, "Loose light")];
const meter: Entity[] = [ent("sensor.house_total_power", "1500", null, { device_class: "power", unit_of_measurement: "W" }, "House total power")];

const areaOf = (id: string, name: string, entities: Entity[]): Area => ({
  areaId: id,
  name,
  entities,
});

// Feature 120: an area with only read-only entities (no chip, no controllable device).
const garden: Area = areaOf("garden", "Garden", [
  ent("sensor.garden_temperature", "14", "garden", { device_class: "temperature", unit_of_measurement: "°C" }, "Garden temperature"),
  ent("binary_sensor.garden_motion", "off", "garden", { device_class: "motion" }, "Garden motion"),
]);

// Feature 120: a helper that picks a room the way the 3D stage does (provider state, no chip).
function SelectArea({ areaId }: { areaId: string }) {
  const { setSelectedArea } = useEntities();
  return <button onClick={() => setSelectedArea(areaId)}>{`pick ${areaId}`}</button>;
}

const houseAreas = (): Area[] => [
  areaOf("kitchen", "Kitchen", kitchen),
  areaOf("hall", "Hall", hall),
  areaOf("living", "Living", living),
  areaOf("ghost", "Ghost", ghost),
  areaOf(UNASSIGNED, "Unassigned", [...loose, ...meter]),
];

interface Setup {
  areas?: Area[] | "pending" | "reject";
  status?: "online" | "offline";
}

function harness(setup: Setup) {
  const getAreas = vi.fn(() => {
    if (setup.areas === "pending") return new Promise<Area[]>(() => undefined);
    if (setup.areas === "reject") return Promise.reject(new Error("down"));
    return Promise.resolve(setup.areas ?? houseAreas());
  });
  const getStatus = vi.fn(async (): Promise<HaStatus> => {
    if (setup.status === "offline") throw new Error("ha down");
    return { online: true, version: "2026.1" } as HaStatus;
  });
  const api = {
    getStatus,
    getAreas,
    getEntities: vi.fn(),
    runAction: vi.fn(),
    getHistory: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
    getAliases: vi.fn(async () => []),
    setAlias: vi.fn(),
    deleteAlias: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as HomeApi;
  return { api, getAreas };
}

function renderPanel(setup: Setup = {}, extra?: ReactNode) {
  const h = harness(setup);
  render(
    <ApiProvider api={h.api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <MemoryRouter>
              {extra}
              <DevicePanel />
            </MemoryRouter>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return h;
}

// Feature 162: the FILTERS drawer (left SideDrawer) holds the type and room switches.
function openFilters() {
  fireEvent.click(screen.getByRole("button", { name: /^FILTERS/ }));
}

describe("DevicePanel", () => {
  afterEach(cleanup);

  it("has no All devices link and no filter rows until FILTERS is pressed (feature 162)", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    expect(screen.queryByRole("link", { name: "All devices" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Device filters" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Rooms" })).toBeNull();
    expect(screen.getByRole("button", { name: "FILTERS" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the loading skeleton while the devices load", () => {
    renderPanel({ areas: "pending" });
    const panel = screen.getByRole("region", { name: "Device panel" });
    expect(panel.getAttribute("aria-busy")).toBe("true");
  });

  it("shows the error state and retries the load", async () => {
    const h = renderPanel({ areas: "reject" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not load devices.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    await waitFor(() => expect(h.getAreas).toHaveBeenCalledTimes(2));
  });

  it("reports ATTENTION with the unavailable count and shows unavailable devices as grey tiles", async () => {
    renderPanel();
    expect(await screen.findByText("ATTENTION // 2 UNAVAILABLE")).toBeTruthy();
    expect(screen.getByText("4 ZONES MONITORED • 7 LIVE ACTUATORS", { exact: false })).toBeTruthy();
    expect(screen.getByText("LOAD 1.50 kW")).toBeTruthy();

    const list = screen.getByRole("list", { name: "Devices" });
    const names = within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names.some((n) => n.includes("Ceiling"))).toBe(true);
    expect(names.some((n) => n.includes("Kettle power"))).toBe(false); // read-only sensors have no tile
    const ghost = within(list).getByRole("button", { name: /Ghost/i });
    expect(ghost.getAttribute("data-state")).toBe("unavailable");
    const lamp = within(list).getByRole("button", { name: "Kitchen lamp" });
    expect(lamp.getAttribute("data-state")).toBe("unavailable");
    expect(lamp.getAttribute("aria-disabled")).toBe("true");
    const kettle = within(list).getByRole("button", { name: "Kettle" });
    expect(kettle.textContent).toContain("KITCHEN");
    expect(kettle.textContent).not.toContain("42 W"); // feature 155: the compact tile has no draw line

    openFilters();
    const rooms = screen.getByRole("list", { name: "Rooms" });
    expect(within(rooms).getByText(/GHOST/)).toBeTruthy();
    expect(within(rooms).getByText(/KITCHEN/)).toBeTruthy();
    expect(within(rooms).getByText(/UNASSIGNED/)).toBeTruthy();
  });

  it("reports ALL SYSTEMS SYNCHRONIZED when online with nothing unavailable", async () => {
    const clean = [areaOf("kitchen", "Kitchen", [kitchen[0], kitchen[2]])];
    renderPanel({ areas: clean });
    expect(await screen.findByText("ALL SYSTEMS SYNCHRONIZED")).toBeTruthy();
    openFilters();
    expect(screen.getByRole("list", { name: "Rooms" })).not.toBeNull();
  });

  it("reports HA OFFLINE when the status check fails", async () => {
    renderPanel({ areas: [areaOf("kitchen", "Kitchen", [kitchen[0]])], status: "offline" });
    expect(await screen.findByText("ATTENTION // HA OFFLINE")).toBeTruthy();
  });

  it("switching a type off hides its devices, and switching it back on shows them again", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    const deviceCount = () => within(screen.getByRole("list", { name: "Devices" })).getAllByRole("listitem").length;
    const before = deviceCount();

    openFilters();
    fireEvent.click(screen.getByRole("switch", { name: "Show SECURITY" }));
    expect(screen.getByRole("button", { name: "FILTERS · 1" })).toBeTruthy();
    expect(deviceCount()).toBe(before - 1);
    expect(within(screen.getByRole("list", { name: "Devices" })).queryByText(/Front door/)).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Show SECURITY" }));
    expect(screen.getByRole("button", { name: "FILTERS" })).toBeTruthy();
    expect(deviceCount()).toBe(before);
  });

  it("switching a room off hides its devices and the room list keeps the switch state", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    openFilters();
    fireEvent.click(screen.getByRole("switch", { name: "Show KITCHEN" }));
    expect(screen.getByRole("switch", { name: "Show KITCHEN" }).getAttribute("aria-checked")).toBe("false");
    const names = within(screen.getByRole("list", { name: "Devices" })).getAllByRole("listitem");
    expect(names.some((li) => li.textContent?.includes("KITCHEN"))).toBe(false);
    expect(screen.getByRole("button", { name: "FILTERS · 1" })).toBeTruthy();
  });

  it("NONE switches everything off and shows the empty state, ALL turns everything back on", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "NONE" }));
    expect(screen.getByRole("switch", { name: "Show LIGHTS" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: "Show KITCHEN" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("NO CONTROLLABLE DEVICES")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Devices" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ALL" }));
    expect(screen.getByRole("switch", { name: "Show LIGHTS" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "FILTERS" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Devices" })).toBeTruthy();
  });

  it("keeps the switches after closing the drawer", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    openFilters();
    fireEvent.click(screen.getByRole("switch", { name: "Show LIGHTS" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Filters" }));
    expect(screen.getByRole("button", { name: "FILTERS · 1" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(screen.getByRole("list", { name: "Devices" })).getAllByRole("listitem").every((li) => !li.textContent?.includes("Kitchen ceiling"))).toBe(true);

    openFilters();
    expect(screen.getByRole("switch", { name: "Show LIGHTS" }).getAttribute("aria-checked")).toBe("false");
  });

  it("closes with ESC", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    openFilters();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "FILTERS" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the empty-zone message when the selected room has no devices in the filter", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    openFilters();
    fireEvent.click(screen.getByRole("switch", { name: "Show SECURITY" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show LIGHTS" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show CLIMATE" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show PLUGS" }));
    expect(screen.getByText("NO CONTROLLABLE DEVICES")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Devices" })).toBeNull();
  });

  it("lists PLUGS with 1 and never lists the Kettle power sensor as a device", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    openFilters();
    const plugs = screen.getByRole("switch", { name: "Show PLUGS" }).closest("li");
    expect(plugs?.textContent).toContain("1");
    expect(screen.queryByRole("article", { name: "Kettle power" })).toBeNull();
  });

  it("gives no room switch to an area with only sensors", async () => {
    renderPanel({ areas: [...houseAreas(), garden] });
    await screen.findByRole("list", { name: "Devices" });
    openFilters();
    expect(screen.queryByRole("switch", { name: "Show GARDEN" })).toBeNull();
  });

  it("shows the zone message when a room with only sensors is selected from the stage", async () => {
    renderPanel({ areas: [...houseAreas(), garden] }, <SelectArea areaId="garden" />);
    await screen.findByRole("list", { name: "Devices" });
    fireEvent.click(screen.getByRole("button", { name: "pick garden" }));
    const message = await screen.findByText("NO CONTROLLABLE DEVICES IN THIS ZONE");
    expect(message.getAttribute("role")).toBe("status");
    expect(screen.queryByRole("list", { name: "Devices" })).toBeNull();
  });

  it("shows NO CONTROLLABLE DEVICES when the house has only sensors", async () => {
    renderPanel({ areas: [garden] });
    const message = await screen.findByText("NO CONTROLLABLE DEVICES");
    expect(message.getAttribute("role")).toBe("status");
    openFilters();
    expect(screen.queryByRole("list", { name: "Rooms" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Actuator types" })).toBeNull();
  });

  it("shows NO DEVICES when the house has no areas", async () => {
    renderPanel({ areas: [] });
    expect(await screen.findByText("NO DEVICES")).toBeTruthy();
    openFilters();
    expect(screen.queryByRole("list", { name: "Rooms" })).toBeNull();
  });
});
