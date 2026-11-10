import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Area, ConnectionState, Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import { widgetsSetting, type ClimateMetric, type StoredWidgets, type Widget } from "@/features/telemetry/widgets";
import { filtersSetting } from "@/features/telemetry/widgetFilters";

const CACHE_KEY = "hc.setting.telemetry.widgets";
import TelemetryChartsGrid from "./TelemetryChartsGrid";

const sensor = (id: string): Entity => ({
  entityId: `sensor.${id}`,
  domain: "sensor",
  name: `${id} sensor`,
  state: "21.5",
  attributes: { state_class: "measurement", unit_of_measurement: "C", device_class: "pressure" },
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
});

const text = (id: string): Entity => ({
  entityId: `sensor.${id}`,
  domain: "sensor",
  name: `${id} text`,
  state: "hello",
  attributes: {},
  area: null,
  lastChanged: "2026-11-06T10:00:00.000Z",
});

// A HomeApi whose areas resolve immediately; subscribe exposes the connection callback for tests.
function harness(areas: Area[]) {
  let onConnection: (s: ConnectionState) => void = () => undefined;
  const api = {
    getStatus: vi.fn(async () => ({ online: true, version: "1" })),
    getAreas: vi.fn(async () => areas),
    getEntities: vi.fn(),
    runAction: vi.fn(),
    getHistory: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
    getAliases: vi.fn(async () => []),
    setAlias: vi.fn(),
    deleteAlias: vi.fn(),
    subscribe: vi.fn((_e: unknown, c: (s: ConnectionState) => void) => {
      onConnection = c;
      return () => undefined;
    }),
  } as unknown as HomeApi;
  return { api, emitConnection: (s: ConnectionState) => act(() => onConnection(s)) };
}

function Providers({ api, children }: { api: HomeApi; children: ReactNode }) {
  return (
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>{children}</AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>
  );
}

function renderGrid(sensors: Entity[], connection: ConnectionState = "open") {
  const h = harness([{ areaId: "kitchen", name: "Kitchen", entities: sensors }]);
  const utils = render(
    <Providers api={h.api}>
      <TelemetryChartsGrid sensors={sensors} areaName={(id) => (id ? "Kitchen" : "Unassigned")} connection={connection} />
    </Providers>,
  );
  return { ...utils, h };
}

const panel = () => screen.getByLabelText("Charts");

describe("TelemetryChartsGrid", () => {
  beforeEach(() => {
    window.localStorage.clear();
    widgetsSetting.forget();
    filtersSetting.forget();
  });
  afterEach(cleanup);

  it("shows the empty message when there are no numeric sensors", () => {
    renderGrid([text("notes")]);
    expect(screen.getByText("NO NUMERIC SENSORS")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /CHARTS/ })).toBeNull();
  });

  it("opens the chart panel from the CHARTS button and closes it with Escape", async () => {
    renderGrid([sensor("living"), sensor("bed")]);
    const button = screen.getByRole("button", { name: /CHARTS/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel().getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel().getAttribute("aria-hidden")).toBe("false");
    expect(within(screen.getByRole("list", { name: "Devices" })).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(panel().getAttribute("aria-hidden")).toBe("true"));
  });

  it("REMOVE and ADD hide and restore a single-field chart and persist the layout", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));

    const [remove] = screen.getAllByRole("button", { name: /^Remove / });
    fireEvent.click(remove);
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Add / })).toHaveLength(1);

    const saved = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}").value;
    expect(saved.version).toBe(1);
    expect(saved.widgets.filter((w: { visible: boolean }) => !w.visible)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /^Add / }));
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("REMOVE on every device hides every chart and ADD restores them", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));

    for (const button of screen.getAllByRole("button", { name: /^Remove / })) fireEvent.click(button);
    expect(screen.getByText("ALL CHARTS HIDDEN")).toBeTruthy();
    expect(screen.getByText("LIVE • 0 CHARTS")).toBeTruthy();

    for (const button of screen.getAllByRole("button", { name: /^Add / })) fireEvent.click(button);
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
  });

  describe("search and filters (feature 118, devices in feature 163)", () => {
    const counter = () => screen.getByRole("status", { name: "Devices shown" }).textContent;
    const deviceRows = () => within(screen.getByRole("list", { name: "Devices" })).queryAllByRole("listitem");
    const openPanel = () => fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
    const search = (value: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Search charts" }), { target: { value } });
    // Opens the FILTERS modal, clicks one pill in it and applies the draft.
    const filterBy = (group: string, name: RegExp) => {
      fireEvent.click(screen.getByRole("button", { name: /^FILTERS/ }));
      const dialog = screen.getByRole("dialog", { name: "FILTERS" });
      fireEvent.click(within(within(dialog).getByRole("group", { name: group })).getByRole("button", { name }));
      fireEvent.click(within(dialog).getByRole("button", { name: "APPLY" }));
    };

    // Office power sensor, unassigned pressure sensor, kitchen pressure sensor (sensor() has device_class pressure).
    const mixed = () => [
      { ...sensor("living"), area: "office", attributes: { device_class: "power", unit_of_measurement: "W", state_class: "measurement" } },
      { ...sensor("bed"), area: null },
      { ...sensor("kitchen_temp") },
    ];
    const areaOf = (id: string | null) => (id === "office" ? "Office" : id ? "Kitchen" : "Unassigned");
    function renderMixed() {
      const sensors = mixed();
      const h = harness([{ areaId: "kitchen", name: "Kitchen", entities: sensors }]);
      return render(
        <Providers api={h.api}>
          <TelemetryChartsGrid sensors={sensors} areaName={areaOf} connection="open" />
        </Providers>,
      );
    }

    it("shows the total and narrows the device list by search", () => {
      renderMixed();
      openPanel();
      expect(counter()).toBe("3 OF 3");
      search("kitchen");
      expect(counter()).toBe("1 OF 3");
      expect(deviceRows()).toHaveLength(1);
      search("zzz");
      expect(screen.getByText("NO MATCHES")).toBeTruthy();
      expect(screen.queryByRole("list", { name: "Devices" })).toBeNull();
    });

    it("filters by zone and field from the modal (OR inside, AND across) and clears them", () => {
      renderMixed();
      openPanel();
      filterBy("Zones", /^KITCHEN( \d+)?$/);
      expect(counter()).toBe("1 OF 3");
      filterBy("Zones", /^UNASSIGNED( \d+)?$/);
      expect(counter()).toBe("2 OF 3");
      filterBy("Fields", /^POWER( \d+)?$/);
      expect(counter()).toBe("0 OF 3");
      expect(screen.getByText("NO MATCHES")).toBeTruthy();
      expect(screen.getByRole("button", { name: "FILTERS · 3" })).toBeTruthy();

      filterBy("Fields", /^POWER( \d+)?$/);
      expect(counter()).toBe("2 OF 3");
      filterBy("Zones", /^KITCHEN( \d+)?$/);
      expect(counter()).toBe("1 OF 3");

      fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
      expect(counter()).toBe("3 OF 3");
      expect(screen.getByRole("button", { name: "CLEAR" }).hasAttribute("disabled")).toBe(true);
    });

    it("filters by kind (only kinds present are offered) and by status", () => {
      renderMixed();
      openPanel();
      fireEvent.click(screen.getByRole("button", { name: /^Remove living/ }));
      filterBy("Kind", /^SENSOR( \d+)?$/);
      expect(counter()).toBe("3 OF 3");
      fireEvent.click(screen.getByRole("button", { name: "FILTERS · 1" }));
      const dialog = screen.getByRole("dialog", { name: "FILTERS" });
      expect(within(within(dialog).getByRole("group", { name: "Kind" })).queryByRole("button", { name: /^ACTUATOR/ })).toBeNull();
      fireEvent.click(within(dialog).getByRole("button", { name: "CLOSE" }));

      filterBy("Status", /^NOT ADDED$/);
      expect(counter()).toBe("1 OF 3");
      expect(deviceRows()).toHaveLength(1);
      filterBy("Status", /^ADDED$/);
      expect(counter()).toBe("2 OF 3");
    });

    it("a device row changed through the filtered list stays in sync with the chart count", () => {
      renderMixed();
      openPanel();
      search("kitchen");
      fireEvent.click(screen.getByRole("button", { name: /^Remove / }));
      expect(counter()).toBe("1 OF 3");
      expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
      expect(screen.getByRole("button", { name: /^Add / })).toBeTruthy();
    });

    // Feature 137: filters are the shared setting telemetry.filters, so a fresh mount restores them.
    it("saves filters: a fresh mount restores them", () => {
      const first = renderMixed();
      openPanel();
      search("kitchen");
      expect(counter()).toBe("1 OF 3");
      first.unmount();
      renderMixed();
      openPanel();
      expect(counter()).toBe("1 OF 3");
      expect(filtersSetting.get()?.query).toBe("kitchen");
    });
  });

  it("restores a saved layout from localStorage", () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        v: 1,
        value: {
          version: 1,
          widgets: [
            { id: "widget.sensor.living", entityId: "sensor.living", kind: "line", visible: false, order: 0 },
            { id: "widget.sensor.bed", entityId: "sensor.bed", kind: "area", visible: true, order: 1 },
          ],
        },
        version: null,
        pending: false,
      }),
    );
    renderGrid([sensor("living"), sensor("bed")]);
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();
  });

  it("falls back to the defaults when the saved layout is corrupt", () => {
    window.localStorage.setItem(CACHE_KEY, "{not json");
    renderGrid([sensor("living")]);
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();
  });

  it("labels each connection state", () => {
    const first = renderGrid([sensor("living")], "reconnecting");
    expect(screen.getByRole("status", { name: "Chart connection" }).textContent).toBe("RECONNECTING • 1 CHARTS");
    first.unmount();

    renderGrid([sensor("living")], "closed");
    expect(screen.getByRole("status", { name: "Chart connection" }).textContent).toBe("OFFLINE • 1 CHARTS");
  });

  it("keeps the layout for the session when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      renderGrid([sensor("living")]);
      fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
      fireEvent.click(screen.getByRole("button", { name: /^Remove / }));
      expect(screen.getByText("ALL CHARTS HIDDEN")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("pages the charts with SHOW MORE once more than 24 are visible", () => {
    renderGrid(Array.from({ length: 26 }, (_, i) => sensor(`s${i}`)));
    expect(screen.getByText("LIVE • 26 CHARTS")).toBeTruthy();
    expect(screen.getAllByRole("img", { name: /°C|C,/ })).toHaveLength(24);

    fireEvent.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(screen.getAllByRole("img", { name: /°C|C,/ })).toHaveLength(26);
    expect(screen.queryByRole("button", { name: "SHOW MORE" })).toBeNull();
  });

  it("updates the connection label when the connection prop changes", () => {
    const sensors = [sensor("living")];
    const h = harness([{ areaId: "kitchen", name: "Kitchen", entities: sensors }]);
    const { rerender } = render(
      <Providers api={h.api}>
        <TelemetryChartsGrid sensors={sensors} areaName={() => "Kitchen"} connection="open" />
      </Providers>,
    );
    rerender(
      <Providers api={h.api}>
        <TelemetryChartsGrid sensors={sensors} areaName={() => "Kitchen"} connection="closed" />
      </Providers>,
    );
    expect(screen.getByRole("status", { name: "Chart connection" }).textContent).toBe("OFFLINE • 1 CHARTS");
  });
});

describe("TelemetryChartsGrid edit mode (feature 114)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    widgetsSetting.forget();
  });
  afterEach(cleanup);

  const humidity = (id: string): Entity => ({
    ...sensor(id),
    attributes: { state_class: "measurement", unit_of_measurement: "%", device_class: "pressure" },
  });
  const listItems = () => within(screen.getByRole("list", { name: "Live charts" })).getAllByRole("listitem");
  const editGroups = () => screen.queryAllByRole("group", { name: /^Edit / });
  const saved = () => JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}").value.widgets;

  it("EDIT toggles edit bars and a fresh mount starts in view mode", () => {
    const { unmount } = renderGrid([sensor("living"), sensor("bed")]);
    const edit = screen.getByRole("button", { name: "EDIT" });
    expect(edit.getAttribute("aria-pressed")).toBe("false");
    expect(editGroups()).toHaveLength(0);

    fireEvent.click(edit);
    expect(screen.getByRole("button", { name: "DONE" }).getAttribute("aria-pressed")).toBe("true");
    expect(editGroups()).toHaveLength(2);

    unmount();
    renderGrid([sensor("living"), sensor("bed")]);
    expect(editGroups()).toHaveLength(0);
  });

  it("move down reorders the cards and persists the order", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const firstName = listItems()[0].querySelector("[role=region]")!.getAttribute("aria-label")!;
    const moveDown = screen.getByRole("button", { name: `Move ${firstName} down` });
    fireEvent.click(moveDown);

    const newFirst = listItems()[0].querySelector("[role=region]")!.getAttribute("aria-label");
    expect(newFirst).not.toBe(firstName);
    expect(saved().map((w: { order: number }) => w.order)).toEqual([0, 1]);
    expect(saved()[0].visible).toBe(true);
  });

  it("offers only valid chart types and persists the selected kind", () => {
    renderGrid([humidity("hum")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const group = screen.getByRole("group", { name: /^Chart type for / });
    const names = within(group).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["LINE", "AREA", "GAUGE"]);

    fireEvent.click(within(group).getByRole("button", { name: "LINE" }));
    expect(within(group).getByRole("button", { name: "LINE" }).getAttribute("aria-pressed")).toBe("true");
    expect(saved()[0].kind).toBe("line");
  });

  it("width selector offers exactly FULL, 75%, HALF, THIRD, 25% (default THIRD) and sets the column span", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const group = () => screen.getAllByRole("group", { name: /^Width for / })[0];
    expect(within(group()).getAllByRole("button").map((b) => b.textContent)).toEqual(["FULL", "75%", "HALF", "THIRD", "25%"]);
    expect(within(group()).getByRole("button", { name: "THIRD" }).getAttribute("aria-pressed")).toBe("true");
    expect(listItems()[0].className).toContain("xl:col-span-4");

    fireEvent.click(within(group()).getByRole("button", { name: "FULL" }));
    expect(listItems()[0].className).toContain("md:max-xl:col-span-2");
    expect(listItems()[0].className).toContain("xl:col-span-12");
    expect(within(group()).getByRole("button", { name: "FULL" }).getAttribute("aria-pressed")).toBe("true");
    expect(saved()[0].size).toBe("full");

    fireEvent.click(within(group()).getByRole("button", { name: "75%" }));
    expect(listItems()[0].className).toContain("md:max-xl:col-span-2");
    expect(listItems()[0].className).toContain("xl:col-span-9");
    expect(saved()[0].size).toBe("threeQuarters");

    fireEvent.click(within(group()).getByRole("button", { name: "HALF" }));
    expect(listItems()[0].className).toContain("xl:col-span-6");
    expect(listItems()[0].className).not.toContain("md:max-xl:col-span-2");
    expect(saved()[0].size).toBe("half");

    fireEvent.click(within(group()).getByRole("button", { name: "25%" }));
    expect(listItems()[0].className).toContain("xl:col-span-3");
    expect(listItems()[0].className).not.toContain("md:max-xl:col-span-2");
    expect(within(group()).getByRole("button", { name: "25%" }).getAttribute("aria-pressed")).toBe("true");
    expect(saved()[0].size).toBe("quarter");
    expect(screen.getByRole("list", { name: "Live charts" }).className).toContain("xl:grid-cols-12");
    expect(screen.queryByRole("button", { name: /^Wide / })).toBeNull();
  });

  it("announces the chosen width in the live region", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const group = screen.getAllByRole("group", { name: /^Width for / })[0];
    fireEvent.click(within(group).getByRole("button", { name: "25%" }));
    expect(screen.getByRole("status", { name: "Layout changes" }).textContent).toBe("bed sensor width 25%");
  });

  it("RESET LAYOUT: cancel keeps the layout, confirm restores the defaults", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Hide / })[0]);
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "RESET LAYOUT" }));
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "RESET LAYOUT" }));
    fireEvent.click(screen.getByRole("button", { name: "CONFIRM RESET" }));
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Layout changes" }).textContent).toBe("Layout reset");
  });

  const labelAt = (i: number) => listItems()[i].querySelector("[role=region]")!.getAttribute("aria-label")!;
  const liveText = () => screen.getByRole("status", { name: "Layout changes" }).textContent;

  it("moving a chart down keeps focus on the same move button, or the opposite one at an edge", () => {
    renderGrid([sensor("living"), sensor("bed"), sensor("kitchen")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const first = labelAt(0);
    fireEvent.click(screen.getByRole("button", { name: `Move ${first} down` }));
    // Middle position: the moved chart can still go down, so its down button keeps focus.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: `Move ${first} down` }));

    fireEvent.click(screen.getByRole("button", { name: `Move ${first} down` }));
    // Now last: down is disabled, focus moves to the opposite (up) button.
    expect(screen.getByRole("button", { name: `Move ${first} down` }).hasAttribute("disabled")).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: `Move ${first} up` }));
  });

  it("exact live-region messages for move and hide", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const first = labelAt(0);
    fireEvent.click(screen.getByRole("button", { name: `Move ${first} down` }));
    expect(liveText()).toBe(`Moved ${first} to position 2 of 2`);

    const second = labelAt(0);
    fireEvent.click(screen.getByRole("button", { name: `Hide ${second}` }));
    expect(liveText()).toBe(`${second} hidden`);
  });

  it("HIDE returns focus to EDIT", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Hide / })[0]);
    // Still in edit mode, so the toggle reads DONE.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "DONE" }));
  });

  it("move buttons are both disabled when only one chart is visible", () => {
    renderGrid([sensor("living")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const label = labelAt(0);
    expect(screen.getByRole("button", { name: `Move ${label} up` }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: `Move ${label} down` }).hasAttribute("disabled")).toBe(true);
  });

  it("a chart moved past the first page is revealed and keeps focus (25 charts)", () => {
    renderGrid(Array.from({ length: 25 }, (_, i) => sensor(`s${i}`)));
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const moved = listItems()[23];
    const id = moved.dataset.widgetId;
    const label = labelAt(23);

    fireEvent.click(screen.getByRole("button", { name: `Move ${label} down` }));

    expect(listItems()).toHaveLength(25);
    expect(listItems()[24].dataset.widgetId).toBe(id);
    expect(screen.queryByRole("button", { name: "SHOW MORE" })).toBeNull();
    // It is now the last chart, so focus lands on its up button.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: `Move ${label} up` }));
    expect(liveText()).toBe(`Moved ${label} to position 25 of 25`);
  });
  it("keeps editing when storage throws on an editor control", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      const first = labelAt(0);
      fireEvent.click(screen.getByRole("button", { name: `Move ${first} down` }));
      expect(labelAt(1)).toBe(first);
      fireEvent.click(screen.getAllByRole("button", { name: /^Hide / })[0]);
      expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();
      expect(screen.getByRole("button", { name: "DONE" })).toBeTruthy();
      expect(editGroups()).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("editing works while RECONNECTING", () => {
    renderGrid([sensor("living"), sensor("bed")], "reconnecting");
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(editGroups()).toHaveLength(2);
    const first = labelAt(0);
    fireEvent.click(screen.getByRole("button", { name: `Move ${first} down` }));
    expect(labelAt(1)).toBe(first);
    expect(screen.getByRole("status", { name: "Chart connection" }).textContent).toBe("RECONNECTING • 2 CHARTS");
  });

  it("renders no EDIT button without sensors", () => {
    renderGrid([]);
    expect(screen.queryByRole("button", { name: /^(EDIT|DONE)$/ })).toBeNull();
  });

  it("sensors appearing and disappearing while editing update the edit bars", () => {
    const h = harness([]);
    const ui = (sensors: Entity[]) => (
      <Providers api={h.api}>
        <TelemetryChartsGrid sensors={sensors} areaName={() => "Kitchen"} connection="open" />
      </Providers>
    );
    const { rerender } = render(ui([sensor("living"), sensor("bed")]));
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(editGroups()).toHaveLength(2);

    rerender(ui([sensor("living"), sensor("bed"), sensor("new")]));
    expect(editGroups()).toHaveLength(3);
    expect(screen.getByRole("button", { name: "DONE" })).toBeTruthy();

    rerender(ui([sensor("bed"), sensor("new")]));
    expect(editGroups()).toHaveLength(2);
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "DONE" })).toBeTruthy();
    expect(labelAt(1)).toBe("new sensor");
    expect(screen.getByRole("region", { name: "new sensor" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Edit new sensor" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "living sensor" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Edit living sensor" })).toBeNull();
  });

  it("hiding every chart in edit mode says to open CHARTS to add them back, only while editing", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(screen.queryByText("OPEN CHARTS TO ADD THEM BACK")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^Hide / })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /^Hide / })[0]);

    expect(screen.getByText("ALL CHARTS HIDDEN")).toBeTruthy();
    expect(screen.getByText("OPEN CHARTS TO ADD THEM BACK")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Live charts" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "DONE" }));
    expect(screen.getByText("ALL CHARTS HIDDEN")).toBeTruthy();
    expect(screen.queryByText("OPEN CHARTS TO ADD THEM BACK")).toBeNull();
  });
});

describe("TelemetryChartsGrid shared layout (feature 135)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    widgetsSetting.forget();
  });
  afterEach(cleanup);

  const remote = (livingVisible: boolean): StoredWidgets => ({
    version: 1,
    widgets: [
      { id: "widget.sensor.living", entityId: "sensor.living", kind: "line", visible: livingVisible, order: 0, size: "third" },
      { id: "widget.sensor.bed", entityId: "sensor.bed", kind: "area", visible: true, order: 1, size: "third" },
    ],
  });

  it("a remote layout change re-renders the grid without a reload", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
    act(() => widgetsSetting.set(remote(false)));
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();
  });

  it("in edit mode a remote change is announced and edit mode stays open", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    act(() => widgetsSetting.set(remote(false)));
    expect(screen.getByText("Layout updated from another device")).toBeTruthy();
    expect(screen.getByRole("button", { name: "DONE" })).toBeTruthy();
  });

  it("a user edit calls the setting once and is not announced as remote", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const set = vi.spyOn(widgetsSetting, "set");
    fireEvent.click(screen.getByRole("button", { name: "RESET LAYOUT" }));
    fireEvent.click(screen.getByRole("button", { name: "CONFIRM RESET" }));
    expect(set).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Layout updated from another device")).toBeNull();
  });
});
describe("TelemetryChartsGrid climate cards (feature 159)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    widgetsSetting.forget();
    filtersSetting.forget();
  });
  afterEach(cleanup);

  // A temperature/humidity sensor is both a climate card and a chart (sensor charts are unchanged).
  const thermo: Entity = {
    ...sensor("kitchen_temp"),
    attributes: { state_class: "measurement", unit_of_measurement: "C", device_class: "temperature" },
  };
  const hygro: Entity = {
    ...sensor("kitchen_hum"),
    attributes: { state_class: "measurement", unit_of_measurement: "%", device_class: "humidity" },
  };
  const itemIds = () => listItems().map((li) => li.getAttribute("data-widget-id") ?? "");
  const climateIds = () => itemIds().filter((id) => id.startsWith("climate:"));
  const listItems = () => within(screen.getByRole("list", { name: "Live charts" })).getAllByRole("listitem");
  const saved = () => JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}").value.widgets as Widget[];
  const liveRegion = () => screen.getByRole("status", { name: "Layout changes" });
  const renderClimate = (sensors: Entity[], climateHiddenByDefault?: ClimateMetric[]) => {
    const h = harness([{ areaId: "kitchen", name: "Kitchen", entities: sensors }]);
    return render(
      <Providers api={h.api}>
        <TelemetryChartsGrid
          sensors={sensors}
          areaName={(id) => (id ? "Kitchen" : "Unassigned")}
          connection="open"
          climateHiddenByDefault={climateHiddenByDefault}
        />
      </Providers>,
    );
  };
  const editOn = () => fireEvent.click(screen.getByRole("button", { name: "EDIT" }));

  it("renders the climate cards first, half width, and counts only charts", () => {
    renderClimate([sensor("living"), thermo, hygro]);
    expect(climateIds()).toEqual(["climate:temperature", "climate:humidity"]);
    expect(listItems()[0].className).toContain("xl:col-span-6");
    expect(listItems()[1].className).toContain("xl:col-span-6");
    expect(screen.getByText("LIVE • 3 CHARTS")).toBeTruthy();
  });

  it("edit bar: width group only, no chart type group, FULL persists", () => {
    renderClimate([thermo]);
    editOn();
    expect(screen.queryByRole("group", { name: "Chart type for Climate temperature" })).toBeNull();
    const widthGroup = screen.getByRole("group", { name: "Width for Climate temperature" });
    expect(within(widthGroup).getAllByRole("button").map((b) => b.textContent)).toEqual(["FULL", "75%", "HALF", "THIRD", "25%"]);
    fireEvent.click(within(widthGroup).getByRole("button", { name: "FULL" }));
    expect(listItems()[0].className).toContain("xl:col-span-12");
    expect(saved().find((w) => w.id === "climate:temperature")?.size).toBe("full");
    expect(liveRegion().textContent).toBe("Climate temperature width FULL");
  });

  it("hide announces the climate title and removes the card", () => {
    renderClimate([thermo, hygro]);
    editOn();
    fireEvent.click(screen.getByRole("button", { name: "Hide Climate humidity" }));
    expect(liveRegion().textContent).toBe("Climate humidity hidden");
    expect(climateIds()).toEqual(["climate:temperature"]);
  });

  it("move down swaps the climate card with the next visible sensor", () => {
    renderClimate([sensor("living"), thermo]);
    editOn();
    // Layout before: climate temperature, kitchen_temp, living. Moving down swaps with kitchen_temp.
    expect(itemIds().slice(0, 2)).toEqual(["climate:temperature", "widget.sensor.kitchen_temp"]);
    fireEvent.click(screen.getByRole("button", { name: "Move Climate temperature down" }));
    expect(itemIds().slice(0, 2)).toEqual(["widget.sensor.kitchen_temp", "climate:temperature"]);
    expect(liveRegion().textContent).toBe("Moved Climate temperature to position 2 of 3");
  });

  it("the CHARTS drawer switch hides and shows a climate card", () => {
    renderClimate([thermo, hygro]);
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
    const toggles = within(screen.getByRole("list", { name: "Climate card toggles" }));
    fireEvent.click(toggles.getByRole("switch", { name: "Show Climate temperature" }));
    expect(climateIds()).toEqual(["climate:humidity"]);
    expect(saved().find((w) => w.id === "climate:temperature")?.visible).toBe(false);
  });

  it("starts hidden when the legacy fixed-panel toggle was hidden", () => {
    renderClimate([thermo, hygro], ["humidity"]);
    expect(climateIds()).toEqual(["climate:temperature"]);
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
    expect(screen.getByRole("switch", { name: "Show Climate humidity" }).getAttribute("aria-checked")).toBe("false");
  });

  it("RESET LAYOUT restores both climate cards to half, visible, first", () => {
    renderClimate([sensor("living"), thermo, hygro]);
    editOn();
    fireEvent.click(screen.getByRole("button", { name: "Hide Climate temperature" }));
    fireEvent.click(screen.getByRole("button", { name: "RESET LAYOUT" }));
    fireEvent.click(screen.getByRole("button", { name: "CONFIRM RESET" }));
    expect(climateIds()).toEqual(["climate:temperature", "climate:humidity"]);
    expect(listItems()[0].className).toContain("xl:col-span-6");
    expect(listItems()[1].className).toContain("xl:col-span-6");
  });
});

// Feature 163: a two-field device (temperature + humidity of one thermostat) next to a single-field sensor.
const thermoTemp: Entity = {
  ...sensor("thermo_temp"),
  name: "Thermo temperature",
  deviceName: "Thermo",
  attributes: { device_class: "temperature", unit_of_measurement: "C", state_class: "measurement" },
};
const thermoHum: Entity = {
  ...sensor("thermo_hum"),
  name: "Thermo humidity",
  deviceName: "Thermo",
  attributes: { device_class: "humidity", unit_of_measurement: "%", state_class: "measurement" },
};
const liveIds = () =>
  within(screen.getByRole("list", { name: "Live charts" }))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-widget-id") ?? "");

describe("TelemetryChartsGrid device add flow (feature 163)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    widgetsSetting.forget();
    filtersSetting.forget();
  });
  afterEach(cleanup);

  it("ADD on a single-field device adds it directly, without a popup", () => {
    renderGrid([sensor("living"), thermoTemp, thermoHum]);
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Remove .*living/ }));
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Add .*living/ }));
    expect(screen.getByText("LIVE • 3 CHARTS")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ADD on a multi-field device opens the field popup; ADD stays disabled until one field is checked", () => {
    renderGrid([sensor("living"), thermoTemp, thermoHum]);
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Thermo" }));
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add Thermo" }));
    const dialog = screen.getByRole("dialog", { name: "Thermo" });
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    const confirm = within(dialog).getByRole("button", { name: "ADD" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.click(boxes[0]);
    expect(confirm.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirm);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
    expect(screen.getByText("ADDED 1/2")).toBeTruthy();
  });

  it("EDIT on an added multi-field device changes its fields; REMOVE hides all of them", () => {
    renderGrid([thermoTemp, thermoHum]);
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
    expect(screen.getByText("ADDED 2/2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit Thermo" }));
    const dialog = screen.getByRole("dialog", { name: "Thermo" });
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(boxes[1]);
    fireEvent.click(within(dialog).getByRole("button", { name: "SAVE" }));
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();
    expect(screen.getByText("ADDED 1/2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove Thermo" }));
    expect(screen.getByText("LIVE • 0 CHARTS")).toBeTruthy();
    expect(screen.getByText("NOT ADDED")).toBeTruthy();
  });

  it("the chart FIELD control swaps the field in place (same position) and is absent on single-field charts", () => {
    renderGrid([sensor("living"), thermoTemp, thermoHum]);
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Thermo" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Thermo" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Thermo" })).getAllByRole("checkbox")[0]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Thermo" })).getByRole("button", { name: "ADD" }));
    fireEvent.click(screen.getByRole("button", { name: "CHARTS" }));

    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(screen.getAllByRole("button", { name: /^Change field of / })).toHaveLength(1);
    const before = liveIds();
    const at = before.findIndex((id) => id.includes("thermo"));
    expect(at).toBeGreaterThanOrEqual(0);

    fireEvent.click(screen.getByRole("button", { name: /^Change field of / }));
    const dialog = screen.getByRole("dialog", { name: "Thermo" });
    const radios = within(dialog).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    fireEvent.click(radios.find((r) => !r.checked)!);
    fireEvent.click(within(dialog).getByRole("button", { name: "SAVE" }));

    const after = liveIds();
    expect(after).toHaveLength(before.length);
    expect(after[at]).not.toBe(before[at]);
    expect(after[at]).toMatch(/thermo/);
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
  });
});
