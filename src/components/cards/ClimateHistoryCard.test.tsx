import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { cloneElement, createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Entity, HistorySeries } from "@/api/types";
import { ApiError } from "@/api/types";
import { zoneColorToken } from "@/features/zones/zoneColors";
import { ZoneColorsProvider } from "@/features/zones/ZoneColorsContext";
import ClimateHistoryCard from "./ClimateHistoryCard";

// Feature 131: per-room lines in ALL ROOMS, legend, zone colors. Feature 144: temperature and humidity charts.
describe("ClimateHistoryCard ALL ROOMS (feature 131)", () => {
  // Stroke of every drawn line/area in DOM order (recharts renders them as paths).
  const strokes = (container: HTMLElement) =>
    [...container.querySelectorAll(".recharts-line-curve, .recharts-area-curve")].map((el) => el.getAttribute("stroke"));

  afterEach(() => {
    document.documentElement.style.removeProperty("--color-zone-coral");
    document.documentElement.style.removeProperty("--color-zone-blue");
  });

  it("draws one temperature line per room plus the mean, with a legend", async () => {
    const { container } = renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms temperature/ });

    const legend = screen.getByRole("list", { name: "Chart legend" });
    const items = within(legend).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(legend).getByText("Kitchen")).toBeTruthy();
    expect(within(legend).getByText("Bedroom")).toBeTruthy();
    expect(within(legend).getByText("TOTAL MEAN")).toBeTruthy();
    expect(strokes(container)).toHaveLength(6); // temp: 2 rooms + mean; humidity: 2 rooms + mean (feature 144)
  });

  it("colors each room line with its zone token and keeps the mean on top", async () => {
    const kitchen = zoneColorToken("kitchen");
    const bedroom = zoneColorToken("bedroom");
    document.documentElement.style.setProperty(`--color-${kitchen}`, "kitchen-test-color");
    document.documentElement.style.setProperty(`--color-${bedroom}`, "bedroom-test-color");
    const { container } = renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms temperature/ });

    const drawn = strokes(container);
    expect(drawn).toContain("kitchen-test-color");
    expect(drawn).toContain("bedroom-test-color");
    // The total mean is drawn last (thicker, on top of the room lines).
    const curves = container.querySelectorAll(".recharts-line-curve");
    expect(curves[curves.length - 1]?.getAttribute("stroke-width")).toBe("3");
  });

  it("the room pills show the zone dot", async () => {
    const { container } = renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms temperature/ });
    const kitchenPill = screen.getByRole("button", { name: "Kitchen" });
    expect(kitchenPill.querySelector(`[data-zone-token="${zoneColorToken("kitchen")}"]`)).not.toBeNull();
    expect(container.querySelectorAll("[data-zone-token]").length).toBeGreaterThanOrEqual(2);
  });

  it("a single room has no legend and colors its temperature area with the room's zone token", async () => {
    const kitchen = zoneColorToken("kitchen");
    document.documentElement.style.setProperty(`--color-${kitchen}`, "kitchen-test-color");
    const { container } = renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms temperature/ });

    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    await screen.findByRole("img", { name: /Kitchen temperature, 24H:/ });
    expect(screen.queryByRole("list", { name: "Chart legend" })).toBeNull();
    expect(strokes(container)[0]).toBe("kitchen-test-color");
    expect(container.querySelectorAll(".recharts-line-curve")).toHaveLength(1); // humidity only
  });

  it("the hidden data table has one column per room plus the total mean", async () => {
    renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms temperature/ });
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Time", "Kitchen °C", "Bedroom °C", "Total mean °C", "Kitchen humidity %", "Bedroom humidity %", "Total mean humidity %"]);
  });
});

// Feature 131 review fixes: total mean of room lines, single room = first sensor, empty rooms skipped.
describe("ClimateHistoryCard aggregation (feature 131)", () => {
  const constantApi = (values: Record<string, number>): HomeApi =>
    apiWith(async (ids: string[]) =>
      ids.map((entityId): HistorySeries => ({
        entityId,
        unit: null,
        points: points(T0).map((p) => ({ t: p.t, v: values[entityId] ?? 0 })),
      })),
    );

  function multiSensorHouse() {
    const n = ++seq;
    const k1 = `sensor.k1_${n}`;
    const k2 = `sensor.k2_${n}`;
    const b1 = `sensor.b1_${n}`;
    const loose = `sensor.loose_${n}`;
    const entities = [
      sensor(k1, "temperature", "kitchen", "20"),
      sensor(k2, "temperature", "kitchen", "30"),
      sensor(b1, "temperature", "bedroom", "10"),
      { ...sensor(loose, "temperature", "kitchen", "99"), area: null },
    ];
    return { entities, values: { [k1]: 20, [k2]: 30, [b1]: 10, [loose]: 99 } };
  }

  it("TOTAL MEAN averages the room lines (rooms weigh equally, unassigned sensors ignored)", async () => {
    const { entities, values } = multiSensorHouse();
    renderCard(entities, constantApi(values));
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    // kitchen mean 25, bedroom 10 -> 17.5 (a raw sensor mean would be 20 or 39.8)
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN 25\.0 °C/);
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/MEAN 17\.5 °C/);
  });

  it("a single room uses its first temperature series, not the average of its sensors", async () => {
    const { entities, values } = multiSensorHouse();
    renderCard(entities, constantApi(values));
    await screen.findByRole("img", { name: /All rooms temperature/ });
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    await screen.findByRole("img", { name: /Kitchen temperature, 24H:/ });
    const cursor = screen.getByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/20\.0 °C/);
    expect(cursor.getAttribute("aria-valuetext")).not.toMatch(/25\.0/);
  });

  it("a room with only humidity data gets no line and no legend entry", async () => {
    const n = ++seq;
    const entities = [
      sensor(`sensor.a_${n}`, "temperature", "kitchen", "20"),
      sensor(`sensor.b_${n}`, "temperature", "bedroom", "18"),
      sensor(`sensor.c_${n}`, "humidity", "other", "50"),
    ];
    const { container } = renderCard(entities, readyApi());
    await screen.findByRole("img", { name: /All rooms temperature/ });
    const legend = screen.getByRole("list", { name: "Chart legend" });
    expect(within(legend).getAllByRole("listitem")).toHaveLength(3);
    expect(within(legend).queryByText("Other")).toBeNull();
    expect(container.querySelectorAll(".recharts-line-curve")).toHaveLength(4); // 2 rooms + mean + humidity
  });

  it("ALL ROOMS humidity total is the mean of the room humidity lines (room-weighted, unassigned ignored)", async () => {
    const n = ++seq;
    const ids = { kt: `sensor.kt_${n}`, bt: `sensor.bt_${n}`, kh1: `sensor.kh1_${n}`, kh2: `sensor.kh2_${n}`, bh: `sensor.bh_${n}`, lh: `sensor.lh_${n}` };
    const entities = [
      sensor(ids.kt, "temperature", "kitchen", "20"),
      sensor(ids.bt, "temperature", "bedroom", "18"),
      sensor(ids.kh1, "humidity", "kitchen", "40"),
      sensor(ids.kh2, "humidity", "kitchen", "60"),
      sensor(ids.bh, "humidity", "bedroom", "10"),
      { ...sensor(ids.lh, "humidity", "kitchen", "90"), area: null },
    ];
    renderCard(entities, constantApi({ [ids.kt]: 20, [ids.bt]: 18, [ids.kh1]: 40, [ids.kh2]: 60, [ids.bh]: 10, [ids.lh]: 90 }));
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    // Room lines: kitchen (40 + 60) / 2 = 50, bedroom 10 -> total (50 + 10) / 2 = 30. A sensor-weighted mean would be 50 (40 + 60 + 10) / 3 = 36.7.
    // The unassigned sensor (90) is in no room line and is ignored.
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/MEAN 19\.0 °C • .* • MEAN 30 %$/);
  });

  it("several rooms with humidity but temperature in one room: humidity keeps its room lines, temperature is one area", async () => {
    const n = ++seq;
    const ids = { kt: `sensor.mkt_${n}`, kh: `sensor.mkh_${n}`, bh1: `sensor.mbh1_${n}`, bh2: `sensor.mbh2_${n}` };
    const entities = [
      sensor(ids.kt, "temperature", "kitchen", "20"),
      sensor(ids.kh, "humidity", "kitchen", "40"),
      sensor(ids.bh1, "humidity", "bedroom", "60"),
      sensor(ids.bh2, "humidity", "bedroom", "80"),
    ];
    const { container } = renderCard(entities, constantApi({ [ids.kt]: 20, [ids.kh]: 40, [ids.bh1]: 60, [ids.bh2]: 80 }));
    await screen.findByRole("img", { name: /All rooms temperature/ });

    expect(container.querySelectorAll('[data-testid="climate-temp-area"]').length).toBeGreaterThan(0); // area + its stroke path
    expect(container.querySelectorAll('[data-testid="climate-room-line"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="climate-humidity-room-line"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="climate-humidity-line"]')).toHaveLength(1);

    const cursor = screen.getByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    // Bedroom (60 + 80) / 2 = 70, kitchen 40, total (40 + 70) / 2 = 55 (sensor-weighted would be 60).
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/20\.0 °C • KITCHEN 40 % • BEDROOM 70 % • MEAN 55 %$/);
  });

  it("with no room temperature history the humidity mean still shows", async () => {
    const n = ++seq;
    const entities = [sensor(`sensor.h1_${n}`, "humidity", "kitchen", "40"), sensor(`sensor.h2_${n}`, "humidity", "bedroom", "60")];
    const { container } = renderCard(entities, constantApi({ [`sensor.h1_${n}`]: 40, [`sensor.h2_${n}`]: 60 }));
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    expect(screen.queryByText("NO HISTORY IN RANGE")).toBeNull();
    // Two rooms with humidity: one humidity line per room, the total mean, and the legend lists those rooms.
    expect(within(screen.getByRole("list", { name: "Chart legend" })).getAllByRole("listitem")).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="climate-humidity-room-line"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="climate-humidity-line"]')).toHaveLength(1);
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/-- °C • KITCHEN 40 % • BEDROOM 60 % • MEAN 50 %$/);
  });

  it("thinning a dense room never erases a sparse room's points", async () => {
    const n = ++seq;
    const dense = `sensor.dense_${n}`;
    const sparse = `sensor.sparse_${n}`;
    const entities = [sensor(dense, "temperature", "kitchen", "20"), sensor(sparse, "temperature", "bedroom", "18")];
    const at = (ms: number) => new Date(T0 + ms).toISOString();
    // Kitchen: 400 points a minute apart. Bedroom: 2 points between kitchen's first ones (merged rows 1 and 3 of 402).
    const api = apiWith(async (ids: string[]) =>
      ids.map((entityId): HistorySeries => ({
        entityId,
        unit: null,
        points:
          entityId === dense
            ? Array.from({ length: 400 }, (_, i) => ({ t: at(i * 60_000), v: 20 }))
            : [{ t: at(30_000), v: 18 }, { t: at(90_000), v: 18 }],
      })),
    );
    renderCard(entities, api);
    await screen.findByRole("img", { name: /All rooms temperature/ });
    // Columns: Time, Kitchen, Bedroom, Total mean, Humidity. The mean sits beside every kept bedroom point.
    const cells = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent));
    const bedroomRows = cells.filter((c) => c[2] === "18.0");
    expect(bedroomRows).toHaveLength(2);
    for (const c of bedroomRows) expect(c[3]).toBe("18.0"); // only bedroom has a point there -> mean = 18
    expect(cells.every((c) => c[3] !== "--")).toBe(true);
  });

  it("TOTAL MEAN matches the shown room values where thinning dropped one room's point", async () => {
    const n = ++seq;
    const dense = `sensor.dense2_${n}`;
    const sparse = `sensor.sparse2_${n}`;
    const entities = [sensor(dense, "temperature", "kitchen", "20"), sensor(sparse, "temperature", "bedroom", "18")];
    const at = (ms: number) => new Date(T0 + ms).toISOString();
    // Kitchen: 400 points a minute apart, thinned to 200 (drops minutes 1 and 3). Bedroom shares those two timestamps.
    const api = apiWith(async (ids: string[]) =>
      ids.map((entityId): HistorySeries => ({
        entityId,
        unit: null,
        points:
          entityId === dense
            ? Array.from({ length: 400 }, (_, i) => ({ t: at(i * 60_000), v: 20 }))
            : [{ t: at(60_000), v: 18 }, { t: at(180_000), v: 18 }],
      })),
    );
    renderCard(entities, api);
    await screen.findByRole("img", { name: /All rooms temperature/ });
    // Columns: Time, Kitchen, Bedroom, Total mean, Humidity.
    const cells = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent ?? ""));
    const shared = cells.filter((c) => c[2] === "18.0");
    expect(shared).toHaveLength(2);
    for (const c of shared) expect([c[1], c[3]]).toEqual(["--", "18.0"]); // kitchen dropped -> mean is bedroom only
    for (const c of cells) {
      const shown = [c[1], c[2]].filter((v) => v !== "--").map(Number);
      expect(Number(c[3])).toBeCloseTo(shown.reduce((a, b) => a + b, 0) / shown.length, 1);
    }
  });

  it("ALL ROOMS with one temperature room reads the same as selecting that room", async () => {
    const n = ++seq;
    const ids = { t1: `sensor.ot1_${n}`, t2: `sensor.ot2_${n}`, h1: `sensor.oh1_${n}`, h2: `sensor.oh2_${n}` };
    const entities = [
      sensor(ids.t1, "temperature", "kitchen", "20"),
      sensor(ids.t2, "temperature", "kitchen", "30"),
      sensor(ids.h1, "humidity", "kitchen", "40"),
      sensor(ids.h2, "humidity", "kitchen", "60"),
    ];
    renderCard(entities, constantApi({ [ids.t1]: 20, [ids.t2]: 30, [ids.h1]: 40, [ids.h2]: 60 }));
    const read = async () => {
      const cursor = screen.getByRole("slider", { name: /Chart cursor/ });
      fireEvent.keyDown(cursor, { key: "ArrowLeft" });
      const text = (cursor.getAttribute("aria-valuetext") ?? "").replace(/^\S+ /, "");
      fireEvent.blur(cursor);
      return text;
    };
    await screen.findByRole("img", { name: /All rooms temperature, 24H:/ });
    const all = await read();
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    await screen.findByRole("img", { name: /Kitchen temperature, 24H:/ });
    const kitchen = await read();
    expect(all).toBe("20.0 °C 40 %"); // first series, not the 25 °C / 50 % sensor mean
    expect(kitchen).toBe(all);
  });

  it("staggered timestamps show '--' for the room without a point in the readout", async () => {
    const n = ++seq;
    const entities = [sensor(`sensor.s1_${n}`, "temperature", "kitchen", "20"), sensor(`sensor.s2_${n}`, "temperature", "bedroom", "18")];
    const api = apiWith(async (ids: string[]) =>
      ids.map((entityId): HistorySeries => ({
        entityId,
        unit: null,
        points: entityId.includes("s1_")
          ? [{ t: new Date(T0).toISOString(), v: 20 }]
          : [{ t: new Date(T0 + 15 * 60_000).toISOString(), v: 18 }],
      })),
    );
    renderCard(entities, api);
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" }); // starts at last (bedroom only), steps back to first
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN 20\.0 °C/);
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/BEDROOM -- °C/);
  });
});

// Recharts measures its container; jsdom has no layout, so the container hands the chart a fixed size and it renders its SVG.
// jsdom has no chart layout; capture Recharts callbacks and exercise the shared cursor directly.
const chartEvents = vi.hoisted(() => ({ move: [] as Array<(value: { activeTooltipIndex: number }) => void>, leave: [] as Array<() => void> }));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ComposedChart: ({ onMouseMove, onMouseLeave, ...props }: React.ComponentProps<typeof actual.ComposedChart>) => {
      if (onMouseMove) chartEvents.move.push(onMouseMove as (value: { activeTooltipIndex: number }) => void);
      if (onMouseLeave) chartEvents.leave.push(onMouseLeave as () => void);
      return createElement(actual.ComposedChart, { ...props, onMouseMove, onMouseLeave });
    },
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      createElement("div", null, cloneElement(children as ReactElement<{ width?: number; height?: number }>, { width: 400, height: 220 })),
  };
});

// The history cache is module-level for 60 s: every test gets its own sensor ids so no test sees another's series.
let seq = 0;

const sensor = (entityId: string, deviceClass: string, area: string, state: string): Entity => ({
  entityId,
  domain: "sensor",
  name: `${area} ${deviceClass}`,
  state,
  attributes: { device_class: deviceClass, unit_of_measurement: deviceClass === "temperature" ? "°C" : "%" },
  area,
  lastChanged: "2026-11-06T10:00:00.000Z",
});

function house() {
  const n = ++seq;
  const entities = [
    sensor(`sensor.kitchen_temp_${n}`, "temperature", "kitchen", "21.5"),
    sensor(`sensor.kitchen_hum_${n}`, "humidity", "kitchen", "40"),
    sensor(`sensor.bed_temp_${n}`, "temperature", "bedroom", "19"),
    sensor(`sensor.bed_hum_${n}`, "humidity", "bedroom", "50"),
  ];
  return entities;
}

const points = (t0: number) => [
  { t: new Date(t0).toISOString(), v: 20 },
  { t: new Date(t0 + 15 * 60_000).toISOString(), v: 21 },
  { t: new Date(t0 + 30 * 60_000).toISOString(), v: 22 },
];

const T0 = Date.parse("2026-11-06T10:00:00.000Z");

function apiWith(getHistory: HomeApi["getHistory"]) {
  return { getHistory } as unknown as HomeApi;
}

function renderCard(entities: Entity[], api: HomeApi) {
  return render(
    <ApiProvider api={api}>
      <ClimateHistoryCard entities={entities} areaName={(id) => (id === "kitchen" ? "Kitchen" : id === "bedroom" ? "Bedroom" : "Other")} />
    </ApiProvider>,
  );
}

const readyApi = (): HomeApi =>
  apiWith(async (ids: string[]) =>
    ids.map((entityId): HistorySeries => ({ entityId, unit: null, points: points(T0) })),
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  chartEvents.move.length = 0;
  chartEvents.leave.length = 0;
});

describe("ClimateHistoryCard", () => {
  it("shows the room and range pills and a chart once history loads", async () => {
    renderCard(house(), readyApi());
    expect(screen.getByRole("group", { name: "Rooms" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Range" })).getByRole("button", { name: "24H" }).getAttribute("aria-pressed")).toBe("true");

    expect(await screen.findByRole("img", { name: /All rooms temperature, 24H:/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kitchen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bedroom" })).toBeTruthy();
    expect(screen.getByText(/PEAK/)).toBeTruthy();
  });

  it("moves the cursor with the arrow keys and reads the values at that point", async () => {
    renderCard(house(), readyApi());
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    expect(screen.getByText("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES")).toBeTruthy();

    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    // First ArrowLeft starts from the last point and steps back one: the middle reading.
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/21\.0 °C/);

    fireEvent.keyDown(cursor, { key: "ArrowRight" });
    fireEvent.keyDown(cursor, { key: "ArrowRight" });
    fireEvent.keyDown(cursor, { key: "ArrowRight" });
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/22\.0 °C/);
  });

  it("ignores other keys and resets the readout on blur", async () => {
    renderCard(house(), readyApi());
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "a" });
    expect(screen.getByText("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES")).toBeTruthy();

    fireEvent.keyDown(cursor, { key: "ArrowRight" });
    expect(screen.queryByText("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES")).toBeNull();
    fireEvent.blur(cursor);
    expect(screen.getByText("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES")).toBeTruthy();
  });

  it("fetches one room's sensors when a room is picked", async () => {
    const getHistory = vi.fn(readyApi().getHistory);
    renderCard(house(), apiWith(getHistory));
    await screen.findByRole("img", { name: /All rooms temperature/ });

    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    expect(await screen.findByRole("img", { name: /Kitchen temperature, 24H:/ })).toBeTruthy();
    const ids = getHistory.mock.calls.at(-1)![0];
    expect(ids.every((id) => id.includes("kitchen"))).toBe(true);
    expect(ids).toHaveLength(2);
  });

  it("requests the chosen range", async () => {
    const getHistory = vi.fn(readyApi().getHistory);
    renderCard(house(), apiWith(getHistory));
    await screen.findByRole("img", { name: /All rooms temperature/ });

    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith(expect.any(Array), 168));
    expect(await screen.findByRole("img", { name: /temperature, 7D:/ })).toBeTruthy();
  });

  it("shows the error state with a retry that fetches again", async () => {
    const getHistory = vi
      .fn<HomeApi["getHistory"]>()
      .mockRejectedValueOnce(new ApiError("server", "boom", 500))
      .mockImplementation(readyApi().getHistory);
    renderCard(house(), apiWith(getHistory));

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    expect(await screen.findByRole("img", { name: /All rooms temperature/ })).toBeTruthy();
  });

  it("says there is no history when the range has no points", async () => {
    renderCard(house(), apiWith(async () => []));
    expect(await screen.findByText("NO HISTORY IN RANGE")).toBeTruthy();
  });

  it("renders the data table for screen readers", async () => {
    renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms temperature/ });
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(4); // header + 3 timestamps
  });
});

// Feature 144: two stacked charts (temperature, humidity) sharing one cursor.
describe("ClimateHistoryCard split charts (feature 144)", () => {
  it("renders a TEMPERATURE and a HUMIDITY chart with their own titles", async () => {
    renderCard(house(), readyApi());
    expect(await screen.findByRole("img", { name: /All rooms temperature/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /All rooms humidity/ })).toBeTruthy();
    expect(screen.getByText("TEMPERATURE")).toBeTruthy();
    expect(screen.getByText("HUMIDITY")).toBeTruthy();
  });

  it("draws one humidity line per room in ALL ROOMS plus the humidity mean", async () => {
    const { container } = renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms humidity/ });
    expect(container.querySelectorAll('[data-testid="climate-humidity-room-line"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="climate-humidity-line"]')).toHaveLength(1);
  });

  it("a single room keeps the temperature area and draws no humidity room lines", async () => {
    const { container } = renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms temperature/ });
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    await screen.findByRole("img", { name: /Kitchen humidity, 24H:/ });
    expect(container.querySelectorAll('[data-testid="climate-temp-area"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-testid="climate-humidity-room-line"]')).toHaveLength(0);
  });

  it("the keyboard cursor reads temperature rooms and then humidity rooms", async () => {
    renderCard(house(), readyApi());
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN 21\.0 °C • BEDROOM 21\.0 °C • MEAN 21\.0 °C • KITCHEN 21 % • BEDROOM 21 % • MEAN 21 %$/);
  });

  it("hovering either chart updates both reference lines and clears them on leave", async () => {
    const { container } = renderCard(house(), readyApi());
    await screen.findAllByRole("img", { name: /All rooms (temperature|humidity)/ });
    const cursor = screen.getByRole("slider", { name: /Chart cursor/ });
    const move = chartEvents.move.slice(0, 2);
    const leave = chartEvents.leave.slice(0, 2);
    expect(move).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      act(() => move[i]({ activeTooltipIndex: 1 }));
      expect(cursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN .*°C/);
      expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(2);
      act(() => leave[i]());
      expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(0);
    }
  });
});

describe("ClimateHistoryCard zone colors (feature 147)", () => {
  it("colors both charts with the assigned room token when one room is selected", async () => {
    document.documentElement.style.setProperty("--color-zone-coral", "coral-test-color");
    try {
      const { container } = render(
        <ApiProvider api={readyApi()}>
          <ZoneColorsProvider areaIds={["kitchen", "bedroom"]}>
            <ClimateHistoryCard entities={house()} areaName={(id) => id === "kitchen" ? "Kitchen" : "Bedroom"} />
          </ZoneColorsProvider>
        </ApiProvider>,
      );
      await screen.findByRole("img", { name: /All rooms humidity/ });
      fireEvent.click(screen.getByRole("button", { name: "Bedroom" }));
      await screen.findByRole("img", { name: /Bedroom humidity, 24H:/ });
      expect(container.querySelector('.recharts-area-curve')?.getAttribute("stroke")).toBe("coral-test-color");
      expect(container.querySelector('.recharts-line-curve')?.getAttribute("stroke")).toBe("coral-test-color");
    } finally {
      document.documentElement.style.removeProperty("--color-zone-coral");
    }
  });
});
