import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { cloneElement, createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import type { Entity, HistorySeries } from "@/api/types";
import { ApiError } from "@/api/types";
import ClimateHistoryCard from "./ClimateHistoryCard";

// Recharts measures its container; jsdom has no layout, so the container hands the chart a fixed size and it renders its SVG.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
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
});

describe("ClimateHistoryCard", () => {
  it("shows the room and range pills and a chart once history loads", async () => {
    renderCard(house(), readyApi());
    expect(screen.getByRole("group", { name: "Rooms" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Range" })).getByRole("button", { name: "24H" }).getAttribute("aria-pressed")).toBe("true");

    expect(await screen.findByRole("img", { name: /All rooms climate, 24H:/ })).toBeTruthy();
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
    await screen.findByRole("img", { name: /All rooms/ });

    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));
    expect(await screen.findByRole("img", { name: /Kitchen climate, 24H:/ })).toBeTruthy();
    const ids = getHistory.mock.calls.at(-1)![0];
    expect(ids.every((id) => id.includes("kitchen"))).toBe(true);
    expect(ids).toHaveLength(2);
  });

  it("requests the chosen range", async () => {
    const getHistory = vi.fn(readyApi().getHistory);
    renderCard(house(), apiWith(getHistory));
    await screen.findByRole("img", { name: /All rooms/ });

    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith(expect.any(Array), 168));
    expect(await screen.findByRole("img", { name: /7D:/ })).toBeTruthy();
  });

  it("shows the error state with a retry that fetches again", async () => {
    const getHistory = vi
      .fn<HomeApi["getHistory"]>()
      .mockRejectedValueOnce(new ApiError("server", "boom", 500))
      .mockImplementation(readyApi().getHistory);
    renderCard(house(), apiWith(getHistory));

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    expect(await screen.findByRole("img", { name: /All rooms/ })).toBeTruthy();
  });

  it("says there is no history when the range has no points", async () => {
    renderCard(house(), apiWith(async () => []));
    expect(await screen.findByText("NO HISTORY IN RANGE")).toBeTruthy();
  });

  it("renders the data table for screen readers", async () => {
    renderCard(house(), readyApi());
    await screen.findByRole("img", { name: /All rooms/ });
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(4); // header + 3 timestamps
  });
});
