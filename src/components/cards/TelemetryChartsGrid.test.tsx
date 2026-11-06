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
