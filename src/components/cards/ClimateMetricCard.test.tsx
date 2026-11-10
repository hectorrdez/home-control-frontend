import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { cloneElement, createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Entity, HistorySeries } from "@/api/types";
import { ApiError } from "@/api/types";
import { zoneColorToken } from "@/features/zones/zoneColors";
import { ZoneColorsProvider } from "@/features/zones/ZoneColorsContext";
import ClimateMetricCard, { type ClimateMetric } from "./ClimateMetricCard";

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

const sensor = (entityId: string, deviceClass: string, area: string | null, state: string): Entity => ({
  entityId,
  domain: "sensor",
  name: `${area ?? "loose"} ${deviceClass}`,
  state,
  attributes: { device_class: deviceClass, unit_of_measurement: deviceClass === "temperature" ? "°C" : "%" },
  area,
  lastChanged: "2026-11-06T10:00:00.000Z",
});

const T0 = Date.parse("2026-11-06T10:00:00.000Z");
const points = (t0: number) => [
  { t: new Date(t0).toISOString(), v: 20 },
  { t: new Date(t0 + 15 * 60_000).toISOString(), v: 21 },
  { t: new Date(t0 + 30 * 60_000).toISOString(), v: 22 },
];

function house() {
  const n = ++seq;
  return [
    sensor(`sensor.kitchen_temp_${n}`, "temperature", "kitchen", "21.5"),
    sensor(`sensor.kitchen_hum_${n}`, "humidity", "kitchen", "40"),
    sensor(`sensor.bed_temp_${n}`, "temperature", "bedroom", "19"),
    sensor(`sensor.bed_hum_${n}`, "humidity", "bedroom", "50"),
  ];
}

function apiWith(getHistory: HomeApi["getHistory"]) {
  return { getHistory } as unknown as HomeApi;
}

const readyApi = (): HomeApi =>
  apiWith(async (ids: string[]) => ids.map((entityId): HistorySeries => ({ entityId, unit: null, points: points(T0) })));

const constantApi = (values: Record<string, number>): HomeApi =>
  apiWith(async (ids: string[]) =>
    ids.map((entityId): HistorySeries => ({
      entityId,
      unit: null,
      points: points(T0).map((p) => ({ t: p.t, v: values[entityId] ?? 0 })),
    })),
  );

const areaName = (id: string | null) => (id === "kitchen" ? "Kitchen" : id === "bedroom" ? "Bedroom" : "Other");

function renderCard(entities: Entity[], api: HomeApi, metric: ClimateMetric = "temperature") {
  return render(
    <ApiProvider api={api}>
      <ClimateMetricCard metric={metric} entities={entities} areaName={areaName} />
    </ApiProvider>,
  );
}

// Stroke of every drawn line/area in DOM order (recharts renders them as paths).
const strokes = (container: HTMLElement) =>
  [...container.querySelectorAll(".recharts-line-curve, .recharts-area-curve")].map((el) => el.getAttribute("stroke"));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  chartEvents.move.length = 0;
  chartEvents.leave.length = 0;
  document.documentElement.style.removeProperty("--color-zone-coral");
});

// Feature 158: each card renders only its own metric, with its own title, filters and readout.
describe("ClimateMetricCard split (feature 158)", () => {
  it("the temperature card shows the TEMPERATURE title and no humidity chart", async () => {
    renderCard(house(), readyApi(), "temperature");
    expect(screen.getByRole("heading", { name: "TEMPERATURE" })).toBeTruthy();
    expect(await screen.findByRole("img", { name: /All rooms temperature, 24H:/ })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /humidity/ })).toBeNull();
  });

  it("the humidity card shows the HUMIDITY title and no temperature chart", async () => {
    renderCard(house(), readyApi(), "humidity");
    expect(screen.getByRole("heading", { name: "HUMIDITY" })).toBeTruthy();
    expect(await screen.findByRole("img", { name: /All rooms humidity, 24H:/ })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /temperature/ })).toBeNull();
  });

  it("each card lists only the rooms that have its metric", async () => {
    const entities = [sensor("sensor.k_t", "temperature", "kitchen", "20"), sensor("sensor.b_h", "humidity", "bedroom", "50")];
    renderCard(entities, readyApi(), "temperature");
    const rooms = within(await screen.findByRole("group", { name: "Rooms" })).getAllByRole("button");
    expect(rooms.map((b) => b.textContent)).toEqual(["ALL ROOMS", "Kitchen"]);
  });

  it("requests only its own metric sensors", async () => {
    const getHistory = vi.fn(readyApi().getHistory);
    renderCard(house(), apiWith(getHistory), "humidity");
    await screen.findByRole("img", { name: /All rooms humidity/ });
    const ids = getHistory.mock.calls[0][0];
    expect(ids.every((id) => id.includes("hum"))).toBe(true);
    expect(ids).toHaveLength(2);
  });

  it("changing one card's room or range does not change the other card", async () => {
    const getHistory = vi.fn(readyApi().getHistory);
    render(
      <ApiProvider api={apiWith(getHistory)}>
        <ClimateMetricCard metric="temperature" entities={house()} areaName={areaName} />
        <ClimateMetricCard metric="humidity" entities={house()} areaName={areaName} />
      </ApiProvider>,
    );
    await screen.findAllByRole("img", { name: /All rooms (temperature|humidity)/ });
    const [tempRooms, humRooms] = screen.getAllByRole("group", { name: "Rooms" });
    fireEvent.click(within(tempRooms).getByRole("button", { name: "Kitchen" }));
    await screen.findByRole("img", { name: /Kitchen temperature, 24H:/ });
    // The humidity card still shows ALL ROOMS and its 24H range.
    expect(within(humRooms).getByRole("button", { name: "ALL ROOMS" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: /All rooms humidity, 24H:/ })).toBeTruthy();

    fireEvent.click(within(screen.getAllByRole("group", { name: "Range" })[0]).getByRole("button", { name: "7D" }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith(expect.any(Array), 168));
    expect(screen.getByRole("img", { name: /Kitchen temperature, 7D:/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /All rooms humidity, 24H:/ })).toBeTruthy();
  });

  it("arrow keys move the cursor of one card only", async () => {
    render(
      <ApiProvider api={readyApi()}>
        <ClimateMetricCard metric="temperature" entities={house()} areaName={areaName} />
        <ClimateMetricCard metric="humidity" entities={house()} areaName={areaName} />
      </ApiProvider>,
    );
    const [tempCursor, humCursor] = await screen.findAllByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(tempCursor, { key: "ArrowLeft" });
    expect(tempCursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN 21\.0 °C/);
    expect(tempCursor.getAttribute("aria-valuetext")).not.toMatch(/%/);
    expect(humCursor.getAttribute("aria-valuetext")).toBe("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES");
  });

  it("the cursor label names its metric (aria-valuetext carries only that metric)", async () => {
    renderCard(house(), readyApi(), "humidity");
    const cursor = await screen.findByRole("slider", { name: /Chart cursor, humidity/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN 21 % • BEDROOM 21 % • MEAN 21 %$/);
  });

  it("hovering the chart moves only this card's reference line", async () => {
    const { container } = renderCard(house(), readyApi(), "temperature");
    await screen.findByRole("img", { name: /All rooms temperature/ });
    act(() => chartEvents.move[0]({ activeTooltipIndex: 1 }));
    expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(1);
    act(() => chartEvents.leave[0]());
    expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(0);
  });
});

// Feature 131: temperature ALL ROOMS lines, mean, legend and zone colors.
describe("ClimateMetricCard temperature (feature 131)", () => {
  it("draws one line per room plus the mean, with a legend", async () => {
    const { container } = renderCard(house(), readyApi(), "temperature");
    await screen.findByRole("img", { name: /All rooms temperature/ });
    const legend = screen.getByRole("list", { name: "Chart legend" });
    expect(within(legend).getAllByRole("listitem")).toHaveLength(3);
    expect(within(legend).getByText("Kitchen")).toBeTruthy();
    expect(within(legend).getByText("Bedroom")).toBeTruthy();
    expect(within(legend).getByText("TOTAL MEAN")).toBeTruthy();
    expect(strokes(container)).toHaveLength(3);
  });

  it("colors each room line with its zone token and keeps the mean on top", async () => {
    document.documentElement.style.setProperty(`--color-${zoneColorToken("kitchen")}`, "kitchen-test-color");
    document.documentElement.style.setProperty(`--color-${zoneColorToken("bedroom")}`, "bedroom-test-color");
    const { container } = renderCard(house(), readyApi(), "temperature");
    await screen.findByRole("img", { name: /All rooms temperature/ });
    const drawn = strokes(container);
    expect(drawn).toContain("kitchen-test-color");
    expect(drawn).toContain("bedroom-test-color");
    const curves = container.querySelectorAll(".recharts-line-curve");
    expect(curves[curves.length - 1]?.getAttribute("stroke-width")).toBe("3");
  });

  it("a single room has no legend and colors its temperature area with the room's zone token", async () => {
    document.documentElement.style.setProperty(`--color-${zoneColorToken("kitchen")}`, "kitchen-test-color");
    const { container } = renderCard(house(), readyApi(), "temperature");
    await screen.findByRole("img", { name: /All rooms temperature/ });
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    await screen.findByRole("img", { name: /Kitchen temperature, 24H:/ });
    expect(screen.queryByRole("list", { name: "Chart legend" })).toBeNull();
    expect(strokes(container)[0]).toBe("kitchen-test-color");
    expect(container.querySelectorAll(".recharts-line-curve")).toHaveLength(0);
  });

  it("the hidden data table has one column per room plus the total mean", async () => {
    renderCard(house(), readyApi(), "temperature");
    await screen.findByRole("img", { name: /All rooms temperature/ });
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Time", "Kitchen °C", "Bedroom °C", "Total mean °C"]);
  });

  it("TOTAL MEAN averages the room lines (rooms weigh equally, unassigned sensors ignored)", async () => {
    const n = ++seq;
    const values = { [`sensor.k1_${n}`]: 20, [`sensor.k2_${n}`]: 30, [`sensor.b1_${n}`]: 10, [`sensor.loose_${n}`]: 99 };
    const entities = [
      sensor(`sensor.k1_${n}`, "temperature", "kitchen", "20"),
      sensor(`sensor.k2_${n}`, "temperature", "kitchen", "30"),
      sensor(`sensor.b1_${n}`, "temperature", "bedroom", "10"),
      sensor(`sensor.loose_${n}`, "temperature", null, "99"),
    ];
    renderCard(entities, constantApi(values), "temperature");
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    // kitchen mean 25, bedroom 10 -> 17.5 (a raw sensor mean would be 20 or 39.8)
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN 25\.0 °C • BEDROOM 10\.0 °C • MEAN 17\.5 °C/);
  });

  it("a single room uses its first temperature series, not the average of its sensors", async () => {
    const n = ++seq;
    const entities = [
      sensor(`sensor.k1_${n}`, "temperature", "kitchen", "20"),
      sensor(`sensor.k2_${n}`, "temperature", "kitchen", "30"),
    ];
    renderCard(entities, constantApi({ [`sensor.k1_${n}`]: 20, [`sensor.k2_${n}`]: 30 }), "temperature");
    await screen.findByRole("img", { name: /All rooms temperature/ });
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    await screen.findByRole("img", { name: /Kitchen temperature, 24H:/ });
    const cursor = screen.getByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/20\.0 °C/);
    expect(cursor.getAttribute("aria-valuetext")).not.toMatch(/25\.0/);
  });

  it("thinning a dense room never erases a sparse room's points", async () => {
    const n = ++seq;
    const dense = `sensor.dense_${n}`;
    const sparse = `sensor.sparse_${n}`;
    const entities = [sensor(dense, "temperature", "kitchen", "20"), sensor(sparse, "temperature", "bedroom", "18")];
    const at = (ms: number) => new Date(T0 + ms).toISOString();
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
    renderCard(entities, api, "temperature");
    await screen.findByRole("img", { name: /All rooms temperature/ });
    const cells = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent));
    const bedroomRows = cells.filter((c) => c[2] === "18.0");
    expect(bedroomRows).toHaveLength(2);
    for (const c of bedroomRows) expect(c[3]).toBe("18.0");
    expect(cells.every((c) => c[3] !== "--")).toBe(true);
  });

  it("staggered timestamps show '--' for the room without a point in the readout", async () => {
    const n = ++seq;
    const kit = `sensor.sk_${n}`;
    const bed = `sensor.sb_${n}`;
    const entities = [sensor(kit, "temperature", "kitchen", "20"), sensor(bed, "temperature", "bedroom", "18")];
    const api = apiWith(async (ids: string[]) =>
      ids.map((entityId): HistorySeries => ({
        entityId,
        unit: null,
        points: entityId === kit ? points(T0) : [{ t: new Date(T0 + 60_000).toISOString(), v: 18 }],
      })),
    );
    renderCard(entities, api, "temperature");
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN 21\.0 °C • BEDROOM -- °C/);
  });
});

// Feature 144/147: humidity per-room lines, mean and single-series zone color.
describe("ClimateMetricCard humidity (feature 144/147)", () => {
  it("draws one humidity line per room plus the humidity mean, with a legend", async () => {
    const { container } = renderCard(house(), readyApi(), "humidity");
    await screen.findByRole("img", { name: /All rooms humidity/ });
    expect(container.querySelectorAll('[data-testid="climate-humidity-room-line"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="climate-humidity-line"]')).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Chart legend" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("humidity total is the mean of the room humidity lines (room-weighted, unassigned ignored)", async () => {
    const n = ++seq;
    const ids = { kh1: `sensor.kh1_${n}`, kh2: `sensor.kh2_${n}`, bh: `sensor.bh_${n}`, lh: `sensor.lh_${n}` };
    const entities = [
      sensor(ids.kh1, "humidity", "kitchen", "40"),
      sensor(ids.kh2, "humidity", "kitchen", "60"),
      sensor(ids.bh, "humidity", "bedroom", "10"),
      sensor(ids.lh, "humidity", null, "90"),
    ];
    renderCard(entities, constantApi({ [ids.kh1]: 40, [ids.kh2]: 60, [ids.bh]: 10, [ids.lh]: 90 }), "humidity");
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    // kitchen (40 + 60) / 2 = 50, bedroom 10 -> total 30. A sensor-weighted mean would be 36.7.
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/KITCHEN 50 % • BEDROOM 10 % • MEAN 30 %$/);
  });

  it("a single room draws one humidity series in the room's zone color", async () => {
    document.documentElement.style.setProperty(`--color-${zoneColorToken("bedroom")}`, "bedroom-test-color");
    const { container } = renderCard(house(), readyApi(), "humidity");
    await screen.findByRole("img", { name: /All rooms humidity/ });
    fireEvent.click(screen.getByRole("button", { name: "Bedroom" }));
    await screen.findByRole("img", { name: /Bedroom humidity, 24H:/ });
    expect(strokes(container)).toContain("bedroom-test-color");
    expect(screen.queryByRole("list", { name: "Chart legend" })).toBeNull();
  });

  it("the hidden data table has humidity columns only", async () => {
    renderCard(house(), readyApi(), "humidity");
    await screen.findByRole("img", { name: /All rooms humidity/ });
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Time", "Kitchen humidity %", "Bedroom humidity %", "Total mean humidity %"]);
  });

  it("with no room humidity the unassigned sensors' mean still shows", async () => {
    const n = ++seq;
    const entities = [
      { ...sensor(`sensor.u1_${n}`, "humidity", null, "40") },
      { ...sensor(`sensor.u2_${n}`, "humidity", null, "60") },
    ];
    renderCard(entities, readyApi(), "humidity");
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    expect(cursor.getAttribute("aria-valuetext")).toMatch(/21 %$/);
  });
});

// Fetch, error and empty states of one card.
describe("ClimateMetricCard states", () => {
  it("moves the cursor with the arrow keys and ignores other keys", async () => {
    renderCard(house(), readyApi(), "temperature");
    const cursor = await screen.findByRole("slider", { name: /Chart cursor/ });
    expect(screen.getByText("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES")).toBeTruthy();
    fireEvent.keyDown(cursor, { key: "a" });
    expect(screen.getByText("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES")).toBeTruthy();
    fireEvent.keyDown(cursor, { key: "ArrowLeft" });
    expect(screen.queryByText("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES")).toBeNull();
    fireEvent.blur(cursor);
    expect(screen.getByText("FOCUS THE CURSOR AND USE ARROW KEYS TO READ VALUES")).toBeTruthy();
  });

  it("fetches one room's sensors when a room is picked and requests the chosen range", async () => {
    const getHistory = vi.fn(readyApi().getHistory);
    renderCard(house(), apiWith(getHistory), "temperature");
    await screen.findByRole("img", { name: /All rooms temperature/ });
    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith(expect.arrayContaining([expect.stringContaining("kitchen_temp")]), 24));
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith(expect.any(Array), 168));
  });

  it("shows the error state with a retry that fetches again", async () => {
    const getHistory = vi
      .fn<HomeApi["getHistory"]>()
      .mockRejectedValueOnce(new ApiError("server", "boom", 500))
      .mockImplementation(readyApi().getHistory);
    renderCard(house(), apiWith(getHistory), "temperature");
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    expect(await screen.findByRole("img", { name: /All rooms temperature/ })).toBeTruthy();
  });

  it("says there is no history when the range has no points", async () => {
    renderCard(house(), apiWith(async () => []), "humidity");
    expect(await screen.findByText("NO HISTORY IN RANGE")).toBeTruthy();
  });
});

// Feature 147: the card's zone token colors its single series; both pills and legend use the same zone colors.
describe("ClimateMetricCard zone colors (feature 147)", () => {
  it("colors the chart with the assigned room token when one room is selected", async () => {
    document.documentElement.style.setProperty("--color-zone-coral", "coral-test-color");
    const { container } = render(
      <ApiProvider api={readyApi()}>
        <ZoneColorsProvider areaIds={["kitchen", "bedroom"]}>
          <ClimateMetricCard metric="humidity" entities={house()} areaName={areaName} />
        </ZoneColorsProvider>
      </ApiProvider>,
    );
    await screen.findByRole("img", { name: /All rooms humidity/ });
    fireEvent.click(screen.getByRole("button", { name: "Bedroom" }));
    await screen.findByRole("img", { name: /Bedroom humidity, 24H:/ });
    expect(container.querySelector(".recharts-line-curve")?.getAttribute("stroke")).toBe("coral-test-color");
  });
});
