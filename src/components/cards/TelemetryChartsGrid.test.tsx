import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Area, ConnectionState, Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import { WIDGET_STORAGE_KEY } from "@/features/telemetry/widgets";
import TelemetryChartsGrid from "./TelemetryChartsGrid";

const sensor = (id: string): Entity => ({
  entityId: `sensor.${id}`,
  domain: "sensor",
  name: `${id} sensor`,
  state: "21.5",
  attributes: { state_class: "measurement", unit_of_measurement: "C", device_class: "temperature" },
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
    expect(within(screen.getByRole("list", { name: "Chart toggles" })).getAllByRole("switch")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(panel().getAttribute("aria-hidden")).toBe("true"));
  });

  it("switch hides and restores a chart and persists the layout", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));

    const [first] = screen.getAllByRole("switch");
    fireEvent.click(first);
    expect(first.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();

    const saved = JSON.parse(window.localStorage.getItem(WIDGET_STORAGE_KEY) ?? "{}");
    expect(saved.version).toBe(1);
    expect(saved.widgets.filter((w: { visible: boolean }) => !w.visible)).toHaveLength(1);

    fireEvent.click(first);
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
  });

  it("NONE hides every chart and ALL restores them", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));

    fireEvent.click(screen.getByRole("button", { name: "NONE" }));
    expect(screen.getByText("ALL CHARTS HIDDEN")).toBeTruthy();
    expect(screen.getByText("LIVE • 0 CHARTS")).toBeTruthy();

    // The Visibility pill is also named ALL (feature 118): pick the bulk button outside the filter groups.
    const bulkAll = screen.getAllByRole("button", { name: "ALL" }).find((b) => b.closest('[role="group"]') === null)!;
    fireEvent.click(bulkAll);
    expect(screen.queryByText("ALL CHARTS HIDDEN")).toBeNull();
    expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
  });

  describe("search and filters (feature 118)", () => {
    const counter = () => screen.getByRole("status", { name: "Charts shown" }).textContent;
    const toggles = () => within(screen.getByRole("list", { name: "Chart toggles" })).queryAllByRole("switch");
    const openPanel = () => fireEvent.click(screen.getByRole("button", { name: /CHARTS/ }));
    const pill = (group: string, name: RegExp) => within(screen.getByRole("group", { name: group })).getByRole("button", { name });
    const bulk = (name: string) =>
      screen.getAllByRole("button", { name }).find((b) => b.closest('[role="group"]') === null)!;

    // Office sensor (no own name match), kitchen sensors, and an unassigned power sensor.
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

    it("shows the total and narrows the list by search", () => {
      renderMixed();
      openPanel();
      expect(counter()).toBe("3 OF 3");
      fireEvent.change(screen.getByRole("searchbox", { name: "Search charts" }), { target: { value: "kitchen" } });
      expect(counter()).toBe("1 OF 3");
      expect(toggles()).toHaveLength(1);
      fireEvent.change(screen.getByRole("searchbox", { name: "Search charts" }), { target: { value: "zzz" } });
      expect(screen.getByText("NO MATCHES")).toBeTruthy();
      expect(screen.queryByRole("list", { name: "Chart toggles" })).toBeNull();
    });

    it("toggles zone and category pills (OR inside, AND across) and clears them", () => {
      renderMixed();
      openPanel();
      fireEvent.click(pill("Zones", /^KITCHEN( \d+)?$/));
      expect(counter()).toBe("1 OF 3");
      fireEvent.click(pill("Zones", /^UNASSIGNED( \d+)?$/));
      expect(counter()).toBe("2 OF 3");
      fireEvent.click(pill("Categories", /^POWER( \d+)?$/));
      expect(counter()).toBe("0 OF 3");
      expect(screen.getByText("NO MATCHES")).toBeTruthy();

      fireEvent.click(pill("Categories", /^POWER( \d+)?$/));
      expect(counter()).toBe("2 OF 3");
      fireEvent.click(pill("Zones", /^KITCHEN( \d+)?$/));
      expect(pill("Zones", /^KITCHEN( \d+)?$/).getAttribute("aria-pressed")).toBe("false");
      expect(counter()).toBe("1 OF 3");

      fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
      expect(counter()).toBe("3 OF 3");
      expect(screen.getByRole("button", { name: "CLEAR" }).hasAttribute("disabled")).toBe(true);
    });

    it("visibility pills filter by switch state", () => {
      renderMixed();
      openPanel();
      fireEvent.click(toggles()[0]);
      fireEvent.click(pill("Visibility", /^OFF$/));
      expect(counter()).toBe("1 OF 3");
      fireEvent.click(pill("Visibility", /^ON$/));
      expect(counter()).toBe("2 OF 3");
      fireEvent.click(pill("Visibility", /^ALL$/));
      expect(counter()).toBe("3 OF 3");
    });

    it("ALL and NONE only change the rows the filters show", () => {
      renderMixed();
      openPanel();
      fireEvent.click(pill("Categories", /^POWER( \d+)?$/));
      fireEvent.click(bulk("NONE"));
      expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
      expect(screen.getByRole("switch", { name: "Show living sensor" }).getAttribute("aria-checked")).toBe("false");
      expect(screen.queryByRole("switch", { name: "Show bed sensor" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "CLEAR" }));
      fireEvent.click(bulk("ALL"));
      expect(screen.getByText("LIVE • 3 CHARTS")).toBeTruthy();
    });

    it("keeps a switch toggled through the filtered list in sync", () => {
      renderMixed();
      openPanel();
      fireEvent.click(pill("Categories", /^POWER( \d+)?$/));
      fireEvent.click(screen.getByRole("switch", { name: "Show living sensor" }));
      expect(screen.getByText("LIVE • 2 CHARTS")).toBeTruthy();
    });

    it("does not persist filters: a fresh mount starts unfiltered", () => {
      const first = renderMixed();
      openPanel();
      fireEvent.change(screen.getByRole("searchbox", { name: "Search charts" }), { target: { value: "kitchen" } });
      expect(counter()).toBe("1 OF 3");
      first.unmount();
      renderMixed();
      openPanel();
      expect(counter()).toBe("3 OF 3");
    });
  });

  it("restores a saved layout from localStorage", () => {
    window.localStorage.setItem(
      WIDGET_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        widgets: [
          { id: "widget.sensor.living", entityId: "sensor.living", kind: "line", visible: false, order: 0 },
          { id: "widget.sensor.bed", entityId: "sensor.bed", kind: "area", visible: true, order: 1 },
        ],
      }),
    );
    renderGrid([sensor("living"), sensor("bed")]);
    expect(screen.getByText("LIVE • 1 CHARTS")).toBeTruthy();
  });

  it("falls back to the defaults when the saved layout is corrupt", () => {
    window.localStorage.setItem(WIDGET_STORAGE_KEY, "{not json");
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
      fireEvent.click(screen.getByRole("switch"));
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
  });
  afterEach(cleanup);

  const humidity = (id: string): Entity => ({
    ...sensor(id),
    attributes: { state_class: "measurement", unit_of_measurement: "%", device_class: "humidity" },
  });
  const listItems = () => within(screen.getByRole("list", { name: "Live charts" })).getAllByRole("listitem");
  const editGroups = () => screen.queryAllByRole("group", { name: /^Edit / });
  const saved = () => JSON.parse(window.localStorage.getItem(WIDGET_STORAGE_KEY) ?? "{}").widgets;

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

  it("width selector offers exactly FULL, HALF, THIRD (default THIRD) and sets the column span", () => {
    renderGrid([sensor("living"), sensor("bed")]);
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const group = () => screen.getAllByRole("group", { name: /^Width for / })[0];
    expect(within(group()).getAllByRole("button").map((b) => b.textContent)).toEqual(["FULL", "HALF", "THIRD"]);
    expect(within(group()).getByRole("button", { name: "THIRD" }).getAttribute("aria-pressed")).toBe("true");
    expect(listItems()[0].className).toContain("xl:col-span-2");

    fireEvent.click(within(group()).getByRole("button", { name: "FULL" }));
    expect(listItems()[0].className).toContain("md:max-xl:col-span-2");
    expect(listItems()[0].className).toContain("xl:col-span-6");
    expect(within(group()).getByRole("button", { name: "FULL" }).getAttribute("aria-pressed")).toBe("true");
    expect(saved()[0].size).toBe("full");

    fireEvent.click(within(group()).getByRole("button", { name: "HALF" }));
    expect(listItems()[0].className).toContain("xl:col-span-3");
    expect(listItems()[0].className).not.toContain("md:max-xl:col-span-2");
    expect(saved()[0].size).toBe("half");
    expect(screen.queryByRole("button", { name: /^Wide / })).toBeNull();
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
