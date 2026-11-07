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

// Feature 121: the /devices list through the real providers, driven by a fake API.
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

  it("lists all 26 devices, each linking to its detail page", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Devices" })).toBeTruthy();
    expect(rowLinks()).toHaveLength(26);
    expect(shown().textContent).toBe("26 OF 26");

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
    expect(shown().textContent).toBe("1 OF 26");
  });

  it("pills toggle aria-pressed, filters combine, and CLEAR resets them", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Living room ceiling" });
    const clear = screen.getByRole("button", { name: "CLEAR" });
    expect((clear as HTMLButtonElement).disabled).toBe(true);

    const readOnly = pill("Kind", "READ-ONLY");
    fireEvent.click(readOnly);
    expect(readOnly.getAttribute("aria-pressed")).toBe("true");
    expect(rowLinks()).toHaveLength(17);

    fireEvent.click(pill("Areas", /^KITCHEN \d+$/));
    expect(rowLinks()).toHaveLength(2);
    expect((clear as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(clear);
    expect(rowLinks()).toHaveLength(26);
    expect(readOnly.getAttribute("aria-pressed")).toBe("false");
    expect(shown().textContent).toBe("26 OF 26");
  });

  it("shows the alias as the device name", async () => {
    renderPage({ aliases: [{ entityId: "light.living_room_ceiling", alias: "Main light" }] });
    expect(await screen.findByRole("link", { name: "Main light" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Living room ceiling" })).toBeNull();
  });

  it("marks an unavailable device with an UNAVAILABLE chip", async () => {
    const entities = createFixtureEntities().map((e) =>
      e.entityId === "light.kitchen_ceiling" ? { ...e, state: "unavailable" } : e,
    );
    renderPage({ areas: areasOf(entities) });
    const row = await screen.findByRole("link", { name: "Kitchen ceiling" });
    expect(row.textContent).toContain("UNAVAILABLE");
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
    expect(rowLinks()).toHaveLength(26);
  });
});
