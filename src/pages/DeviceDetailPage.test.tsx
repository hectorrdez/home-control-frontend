import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { cloneElement, createElement, type ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Alias, Area, Entity, HistorySeries } from "@/api/types";
import { ApiError } from "@/api/types";
import { createFixtureEntities, FIXTURE_AREAS } from "@/api/mock/fixtures";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { UNASSIGNED } from "@/state/entities";
import { ToastProvider } from "@components/feedback/Toast";
import DeviceDetailPage from "./DeviceDetailPage";

// Features 122/123: the detail page through the real providers, driven by a fake API.

// Recharts measures its container; jsdom has no layout, so the container hands the chart a fixed size.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      createElement("div", null, cloneElement(children as ReactElement<{ width?: number; height?: number }>, { width: 400, height: 220 })),
  };
});

function areasOf(entities: Entity[]): Area[] {
  const areas: Area[] = FIXTURE_AREAS.map((a) => ({
    areaId: a.areaId,
    name: a.name,
    entities: entities.filter((e) => e.area === a.areaId),
  }));
  areas.push({ areaId: UNASSIGNED, name: "Unassigned", entities: entities.filter((e) => e.area === null) });
  return areas;
}

interface Setup {
  areas?: Area[] | "pending" | "reject";
  history?: (ids: string[], hours: number) => Promise<HistorySeries[]>;
  aliases?: Alias[];
}

// The history cache is module-level for 60 s: each test uses its own sensor where it matters.
function historyFor(ids: string[]): HistorySeries[] {
  return ids.map((entityId) => ({
    entityId,
    unit: "W",
    points: [
      { t: "2026-11-06T08:00:00.000Z", v: 100 },
      { t: "2026-11-06T09:00:00.000Z", v: 300 },
      { t: "2026-11-06T10:00:00.000Z", v: 200 },
    ],
  }));
}

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage(entityId: string, setup: Setup = {}) {
  const listeners: { onEntity?: (e: Entity) => void } = {};
  const getAreas = vi.fn(() => {
    if (setup.areas === "pending") return new Promise<Area[]>(() => undefined);
    if (setup.areas === "reject") return Promise.reject(new Error("down"));
    return Promise.resolve(setup.areas ?? areasOf(createFixtureEntities()));
  });
  const getHistory = vi.fn(setup.history ?? (async (ids: string[]) => historyFor(ids)));
  const api = {
    getStatus: vi.fn(async () => ({ online: true, version: "2026.1" })),
    getAreas,
    getEntities: vi.fn(),
    runAction: vi.fn(),
    getHistory,
    getAliases: vi.fn(async () => setup.aliases ?? []),
    setAlias: vi.fn(),
    deleteAlias: vi.fn(),
    subscribe: vi.fn((onEntity: (e: Entity) => void) => {
      listeners.onEntity = onEntity;
      return () => undefined;
    }),
  } as unknown as HomeApi;
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <MemoryRouter initialEntries={[`/devices/${encodeURIComponent(entityId)}`]}>
              <Routes>
                <Route path="/devices/:deviceKey" element={<DeviceDetailPage />} />
                <Route path="*" element={<div>other route</div>} />
              </Routes>
              <Location />
            </MemoryRouter>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return { getAreas, getHistory, listeners };
}

const location = () => screen.getByTestId("location").textContent;
const stateRegion = () => screen.getByRole("region", { name: "State" });

describe("DeviceDetailPage", () => {
  afterEach(cleanup);

  it("shows LOADING DEVICE while the house loads", () => {
    renderPage("light.office_desk", { areas: "pending" });
    expect(screen.getByText("LOADING DEVICE").getAttribute("role")).toBe("status");
  });

  it("shows the error state and RETRY reloads the house", async () => {
    const { getAreas } = renderPage("light.office_desk", { areas: "reject" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not load device.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    await waitFor(() => expect(getAreas).toHaveBeenCalledTimes(2));
  });

  it("an unknown id shows DEVICE NOT FOUND with a link back, and the URL is not redirected", async () => {
    renderPage("light.does_not_exist");
    expect(await screen.findByText("DEVICE NOT FOUND")).toBeTruthy();
    expect(screen.getByText("light.does_not_exist").className).toContain("font-mono");
    const back = screen.getByRole("link", { name: "BACK TO DEVICES" });
    expect(back.getAttribute("href")).toBe("/devices");
    expect(location()).toBe("/devices/light.does_not_exist");
  });

  it("a light shows its name, area, domain, ONLINE, controls and attributes", async () => {
    renderPage("light.office_desk");
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Desk light"); // shortName: the area is shown in the meta line
    expect(screen.getByText("OFFICE // LIGHT // light.office_desk", { exact: false })).toBeTruthy();
    expect(screen.getByText("ONLINE")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Office desk light power" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: /INTENSITY/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to devices/i }).getAttribute("href")).toBe("/devices");

    const attributes = screen.getByRole("region", { name: "Attributes" });
    const brightness = within(attributes).getAllByText("brightness").find((el) => el.tagName === "DT")!;
    expect(brightness.nextElementSibling?.textContent).toBe("255");
    expect(attributes.querySelector("time")?.getAttribute("dateTime")).toBe("2026-11-06T08:00:00.000Z");
    expect(document.title).toBe("Office desk light - Home Control");
  });

  it("a read-only power sensor shows its value, READ ONLY, no controls, and a history chart", async () => {
    renderPage("sensor.house_power");
    expect(await screen.findByText("1240 W")).toBeTruthy();
    expect(screen.getByText("READ ONLY")).toBeTruthy();
    expect(within(stateRegion()).queryAllByRole("button")).toHaveLength(0);
    expect(within(stateRegion()).queryByRole("switch")).toBeNull();
    expect(within(stateRegion()).queryByRole("slider")).toBeNull();
    expect(await screen.findByRole("img", { name: /House power history, 24H/ })).toBeTruthy();
  });

  it("selecting 7D requests a week of history for the sensor", async () => {
    const { getHistory } = renderPage("sensor.house_power");
    await screen.findByRole("img", { name: /House power history, 24H/ });
    fireEvent.click(within(screen.getByRole("group", { name: "Range" })).getByRole("button", { name: "7D" }));
    await waitFor(() => expect(getHistory).toHaveBeenCalledWith(["sensor.house_power"], 168));
    expect(await screen.findByRole("img", { name: /House power history, 7D/ })).toBeTruthy();
  });

  it("a light does not request history and shows no Range group", async () => {
    const { getHistory } = renderPage("light.office_desk");
    await screen.findByRole("heading", { level: 1 });
    expect(getHistory).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Range" })).toBeNull();
    expect(screen.queryByRole("region", { name: "History" })).toBeNull();
  });

  it("a history 404 shows HISTORY NOT AVAILABLE", async () => {
    renderPage("sensor.co2", {
      history: async () => {
        throw new ApiError("not_found", "no endpoint", 404);
      },
    });
    expect(await screen.findByText("HISTORY NOT AVAILABLE")).toBeTruthy();
  });

  it("an unavailable entity shows the UNAVAILABLE chip and no ONLINE chip", async () => {
    const entities = createFixtureEntities().map((e) =>
      e.entityId === "light.kitchen_ceiling" ? { ...e, state: "unavailable" } : e,
    );
    renderPage("light.kitchen_ceiling", { areas: areasOf(entities) });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByText("UNAVAILABLE").length).toBeGreaterThan(0);
    expect(screen.queryByText("ONLINE")).toBeNull();
  });

  it("a device with several entities shows its label, one section per entity in order, and the entity count", async () => {
    renderPage("office~desk_plug");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Desk plug");
    expect(screen.getByText("OFFICE // 2 ENTITIES")).toBeTruthy();
    expect(screen.getByText("ONLINE")).toBeTruthy();
    const sections = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label"))
      .filter((label) => label === "Desk outlet" || label === "Desk outlet power");
    expect(sections).toEqual(["Desk outlet", "Desk outlet power"]);
    expect(screen.getByRole("switch", { name: "Desk outlet power" })).toBeTruthy();
    expect(document.title).toBe("Desk plug - Home Control");
  });

  it("an old entity link to a member of a multi-entity device redirects to the device key", async () => {
    renderPage("sensor.office_desk_power");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Desk plug");
    expect(location()).toBe("/devices/office~desk_plug");
  });

  it("a device whose entities are all unavailable shows the UNAVAILABLE chip and no ONLINE chip", async () => {
    const entities = createFixtureEntities().map((e) =>
      e.domain === "switch" || e.entityId === "sensor.office_desk_power" ? { ...e, state: "unavailable" } : e,
    );
    renderPage("office~desk_plug", { areas: areasOf(entities) });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByText("UNAVAILABLE").length).toBeGreaterThan(0);
    expect(screen.queryByText("ONLINE")).toBeNull();
  });

  it("an entity that arrives through the stream after the not-found render is shown without reload", async () => {
    const { listeners } = renderPage("light.hall_lamp");
    expect(await screen.findByText("DEVICE NOT FOUND")).toBeTruthy();

    const lamp: Entity = {
      entityId: "light.hall_lamp",
      domain: "light",
      name: "Hall lamp",
      state: "off",
      attributes: { brightness: 0 },
      area: null,
      lastChanged: "2026-11-06T08:00:00.000Z",
      deviceName: null,
    };
    act(() => listeners.onEntity?.(lamp));

    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByText("DEVICE NOT FOUND")).toBeNull();
    expect(screen.getByRole("switch", { name: "Hall lamp power" })).toBeTruthy();
  });
});
