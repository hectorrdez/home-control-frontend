import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Alias, Area, Entity } from "@/api/types";
import { createFixtureEntities, FIXTURE_AREAS } from "@/api/mock/fixtures";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { UNASSIGNED } from "@/state/entities";
import { ToastProvider } from "@components/feedback/Toast";
import DevicesPage from "./DevicesPage";

// Features 121/123: the /devices list (one row per device) through the real providers, driven by a fake API.
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
  aliases?: Alias[];
}

function renderPage(setup: Setup = {}) {
  const getAreas = vi.fn(() => {
    if (setup.areas === "pending") return new Promise<Area[]>(() => undefined);
    if (setup.areas === "reject") return Promise.reject(new Error("down"));
    return Promise.resolve(setup.areas ?? areasOf(createFixtureEntities()));
  });
  const api = {
    getStatus: vi.fn(async () => ({ online: true, version: "2026.1" })),
    getAreas,
    getEntities: vi.fn(),
    runAction: vi.fn(),
    getHistory: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
    getAliases: vi.fn(async () => setup.aliases ?? []),
    setAlias: vi.fn(),
    deleteAlias: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as HomeApi;
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <MemoryRouter initialEntries={["/devices"]}>
              <DevicesPage />
            </MemoryRouter>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return { getAreas };
}

const list = () => screen.getByRole("list", { name: "Devices" });
const rowLinks = () => within(list()).getAllByRole("link");
const shown = () => screen.getByRole("status", { name: "Devices shown" });
const pill = (group: string, label: RegExp | string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name: label });

describe("DevicesPage", () => {
  afterEach(cleanup);

  it("lists 20 devices (one row per physical device), each linking to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Devices" })).toBeTruthy();
    expect(rowLinks()).toHaveLength(20);
    expect(shown().textContent).toBe("20 OF 20");

    expect(screen.getByRole("link", { name: "Living room ceiling" }).getAttribute("href")).toBe(
      "/devices/light.living_room_ceiling",
    );
    expect(screen.getByRole("link", { name: "Front door" }).getAttribute("href")).toBe("/devices/lock.front_door");
  });

  it("typing in search narrows the list and updates the shown count", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Living room ceiling" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search devices" }), { target: { value: "front door" } });
    expect(rowLinks()).toHaveLength(1);
    expect(shown().textContent).toBe("1 OF 20");
  });

  it("pills toggle aria-pressed, filters combine, and CLEAR resets them", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Living room ceiling" });
    const clear = screen.getByRole("button", { name: "CLEAR" });
    expect((clear as HTMLButtonElement).disabled).toBe(true);

    const readOnly = pill("Kind", "READ-ONLY");
    fireEvent.click(readOnly);
    expect(readOnly.getAttribute("aria-pressed")).toBe("true");
    expect(rowLinks()).toHaveLength(11);

    fireEvent.click(pill("Areas", /^KITCHEN \d+$/));
    expect(rowLinks()).toHaveLength(1);
    expect((clear as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(clear);
    expect(rowLinks()).toHaveLength(20);
    expect(readOnly.getAttribute("aria-pressed")).toBe("false");
    expect(shown().textContent).toBe("20 OF 20");
  });

  it("shows the alias as the device name", async () => {
    renderPage({ aliases: [{ entityId: "light.living_room_ceiling", alias: "Main light" }] });
    expect(await screen.findByRole("link", { name: "Main light" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Living room ceiling" })).toBeNull();
  });

  it("marks a device whose members are all unavailable with an OFFLINE chip (126)", async () => {
    const entities = createFixtureEntities().map((e) =>
      e.entityId === "light.kitchen_ceiling" ? { ...e, state: "unavailable" } : e,
    );
    renderPage({ areas: areasOf(entities) });
    const row = await screen.findByRole("link", { name: "Kitchen ceiling" });
    expect(row.textContent).toContain("OFFLINE");
    expect(row.textContent).not.toContain("UNAVAILABLE");
  });

  it("keeps a partly available device online (126)", async () => {
    const entities = createFixtureEntities().map((e) =>
      e.entityId === "switch.office_desk" ? { ...e, state: "unavailable" } : e,
    );
    renderPage({ areas: areasOf(entities) });
    const row = await screen.findByRole("link", { name: "Desk plug" });
    expect(row.textContent).not.toContain("OFFLINE");
    expect(row.textContent).toContain("43 W");
  });

  it("shows the loading state while devices load", () => {
    renderPage({ areas: "pending" });
    expect(screen.getByRole("region", { name: "Device list" }).getAttribute("aria-busy")).toBe("true");
  });

  it("shows the error state and RETRY reloads the devices", async () => {
    const { getAreas } = renderPage({ areas: "reject" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not load devices.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    await waitFor(() => expect(getAreas).toHaveBeenCalledTimes(2));
  });

  it("shows NO DEVICES when the house has no entities", async () => {
    renderPage({ areas: areasOf([]) });
    expect(await screen.findByText("NO DEVICES")).toBeTruthy();
  });

  it("shows NO MATCHING DEVICES when the filters match nothing, and CLEAR brings the list back", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Living room ceiling" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search devices" }), { target: { value: "zzzz" } });
    expect(await screen.findByText("NO MATCHING DEVICES")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
    expect(rowLinks()).toHaveLength(20);
  });

  it("a device with several entities is one row with its entity count and links to the device key", async () => {
    renderPage();
    const desk = await screen.findByRole("link", { name: "Desk plug" });
    expect(desk.getAttribute("href")).toBe("/devices/office~desk_plug");
    expect(desk.textContent).toContain("Office // 2 ENTITIES");
    expect(desk.textContent).toContain("ON");
    expect(screen.queryByRole("link", { name: "Desk outlet power" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Entry motion battery" })).toBeNull();
  });
});
