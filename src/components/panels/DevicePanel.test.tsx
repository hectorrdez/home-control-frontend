import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Area, Entity, HaStatus } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
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
    getAliases: vi.fn(async () => []),
    setAlias: vi.fn(),
    deleteAlias: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as HomeApi;
  return { api, getAreas };
}

function renderPanel(setup: Setup = {}) {
  const h = harness(setup);
  render(
    <ApiProvider api={h.api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <DevicePanel />
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return h;
}

describe("DevicePanel", () => {
  afterEach(cleanup);

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

  it("reports ATTENTION with the unavailable count and hides unavailable devices and rooms", async () => {
    renderPanel();
    expect(await screen.findByText("ATTENTION // 2 UNAVAILABLE")).toBeTruthy();
    expect(screen.getByText("4 ZONES MONITORED • 7 LIVE ACTUATORS", { exact: false })).toBeTruthy();
    expect(screen.getByText("LOAD 1.50 kW")).toBeTruthy();

    const list = screen.getByRole("list", { name: "Devices" });
    const names = within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names.some((n) => n.includes("Kitchen lamp"))).toBe(false);
    expect(names.some((n) => n.includes("Ghost light"))).toBe(false);
    expect(names.some((n) => n.includes("Ceiling"))).toBe(true);
    expect(names.some((n) => n.includes("42 W"))).toBe(true);

    const rooms = screen.getByRole("group", { name: "Rooms" });
    expect(within(rooms).queryByRole("button", { name: /GHOST/ })).toBeNull();
    expect(within(rooms).getByRole("button", { name: /KITCHEN/ })).toBeTruthy();
    expect(within(rooms).getByRole("button", { name: /UNASSIGNED/ })).toBeTruthy();
  });

  it("reports ALL SYSTEMS SYNCHRONIZED when online with nothing unavailable", async () => {
    const clean = [areaOf("kitchen", "Kitchen", [kitchen[0], kitchen[2]])];
    renderPanel({ areas: clean });
    expect(await screen.findByText("ALL SYSTEMS SYNCHRONIZED")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Rooms" })).not.toBeNull();
  });

  it("reports HA OFFLINE when the status check fails", async () => {
    renderPanel({ areas: [areaOf("kitchen", "Kitchen", [kitchen[0]])], status: "offline" });
    expect(await screen.findByText("ATTENTION // HA OFFLINE")).toBeTruthy();
  });

  it("filters by domain group and by room", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });

    fireEvent.click(screen.getByRole("button", { name: /^SECURITY/ }));
    let names = within(screen.getByRole("list", { name: "Devices" })).getAllByRole("listitem");
    expect(names).toHaveLength(1);
    expect(names[0].textContent).toContain("Front door");

    fireEvent.click(screen.getByRole("button", { name: /^ALL\d*$/ }));
    fireEvent.click(screen.getByRole("button", { name: /KITCHEN/ }));
    names = within(screen.getByRole("list", { name: "Devices" })).getAllByRole("listitem");
    expect(names.every((li) => li.textContent?.includes("KITCHEN"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /^ALL ROOMS/ }));
    expect(within(screen.getByRole("list", { name: "Devices" })).getAllByRole("listitem").length).toBeGreaterThan(2);
  });

  it("shows an empty-zone message when the selected room has no devices in the filter", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Devices" });
    fireEvent.click(screen.getByRole("button", { name: /^SECURITY/ }));
    fireEvent.click(screen.getByRole("button", { name: /KITCHEN/ }));
    expect(screen.getByText("NO DEVICES IN THIS ZONE")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Devices" })).toBeNull();
  });

  it("shows NO DEVICES when the house has no areas", async () => {
    renderPanel({ areas: [] });
    expect(await screen.findByText("NO DEVICES")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Rooms" })).toBeNull();
  });
});
