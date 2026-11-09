import type { Entity, HistorySeries } from "@/api/types";
import { numericState } from "./telemetry";

// Feature 112: pure derivations for the history charts (range tabs, summary line, ALL ROOMS, power bars).

export const RANGES = [
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 168 },
  { label: "30D", hours: 720 },
] as const;

export type RangeLabel = (typeof RANGES)[number]["label"];

export const HISTORY_CACHE_MS = 60_000;
export const MAX_CHART_POINTS = 200;

export interface HistoryPoint {
  t: string;
  v: number;
}

// Server already downsamples; this keeps any longer series within the chart budget (even stride, last point kept).
export function downsample<T>(points: T[], max: number = MAX_CHART_POINTS): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

// ALL ROOMS: mean of the series per timestamp. Only timestamps present in at least one series count.
export function meanAcrossSeries(series: HistoryPoint[][]): HistoryPoint[] {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const points of series) {
    for (const p of points) {
      const b = buckets.get(p.t) ?? { sum: 0, n: 0 };
      b.sum += p.v;
      b.n += 1;
      buckets.set(p.t, b);
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([t, b]) => ({ t, v: b.sum / b.n }));
}

export interface HistorySummary {
  peak: HistoryPoint | null;
  variance: number | null;
  mean: number | null;
}

// PEAK = highest point, TEMP VARIANCE = max - min, mean over the range. Null fields when there are no points.
export function summarize(points: HistoryPoint[]): HistorySummary {
  if (points.length === 0) return { peak: null, variance: null, mean: null };
  let peak = points[0];
  let min = points[0].v;
  let sum = 0;
  for (const p of points) {
    if (p.v > peak.v) peak = p;
    if (p.v < min) min = p.v;
    sum += p.v;
  }
  return { peak, variance: peak.v - min, mean: sum / points.length };
}

// Hourly averages for the power bars. Buckets by local hour; returns the hours in time order.
export interface HourBar {
  hour: string;
  watts: number;
}

export function hourlyAverages(points: HistoryPoint[]): HourBar[] {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const d = new Date(p.t);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += p.v;
    b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()].map(([key, b]) => {
    const [y, m, day, h] = key.split("-").map(Number);
    return { hour: `${String(h).padStart(2, "0")}:00`, watts: b.sum / b.n, sortKey: Date.UTC(y, m, day, h) };
  })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ hour, watts }) => ({ hour, watts }));
}

// Room ids of one device class (temperature chips; humidity rooms feature 144): the area of each numeric sensor, unique, first-seen order.
export function climateRooms(entities: Entity[], deviceClass = "temperature"): string[] {
  const seen = new Set<string>();
  for (const e of entities) {
    if (e.domain === "sensor" && e.attributes.device_class === deviceClass && numericState(e) !== null && e.area) {
      seen.add(e.area);
    }
  }
  return [...seen];
}

// The house power sensor: a power sensor named house/total (same rule as houseLoad). null when none.
export function housePowerSensor(entities: Entity[]): Entity | null {
  return (
    entities.find(
      (e) => e.domain === "sensor" && e.attributes.device_class === "power" && /house|total/i.test(e.name),
    ) ?? null
  );
}

export function toPoints(series: HistorySeries | undefined): HistoryPoint[] {
  return series ? series.points : [];
}

// One chart row per timestamp across temperature and humidity (either may be missing at a timestamp).
export interface ClimateRow {
  t: string;
  temp: number | null;
  hum: number | null;
}

// ALL ROOMS: one room's temperature line (its own mean across the room's sensors).
export interface RoomLine {
  room: string;
  points: HistoryPoint[];
}

// A climate row plus each plotted room's temperature and humidity at that timestamp, keyed by area id (absent when no point).
// Feature 144: humRooms feeds the humidity chart; rooms feeds the temperature chart.
export interface RoomClimateRow extends ClimateRow {
  rooms: Partial<Record<string, number>>;
  humRooms: Partial<Record<string, number>>;
}

// ALL ROOMS, one device class (temperature or humidity): a room's line is the mean of its sensors of that class.
// Rooms with no points are skipped, so a room without that sensor type gets no line.
export function roomLines(rooms: string[], seriesOfRoom: (room: string) => HistoryPoint[][]): RoomLine[] {
  return rooms.flatMap((room): RoomLine[] => {
    const points = meanAcrossSeries(seriesOfRoom(room));
    return points.length > 0 ? [{ room, points }] : [];
  });
}

// ALL ROOMS merge: one row per timestamp across every room line (temperature and humidity), the total means.
export function mergeRoomClimate(
  lines: RoomLine[],
  temp: HistoryPoint[],
  hum: HistoryPoint[],
  humLines: RoomLine[] = [],
): RoomClimateRow[] {
  const rows = new Map<string, RoomClimateRow>();
  const rowAt = (t: string): RoomClimateRow => {
    const row = rows.get(t) ?? { t, temp: null, hum: null, rooms: {}, humRooms: {} };
    rows.set(t, row);
    return row;
  };
  for (const { room, points } of lines) for (const p of points) rowAt(p.t).rooms[room] = p.v;
  for (const { room, points } of humLines) for (const p of points) rowAt(p.t).humRooms[room] = p.v;
  for (const p of temp) rowAt(p.t).temp = p.v;
  for (const p of hum) rowAt(p.t).hum = p.v;
  return [...rows.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export function mergeClimate(temp: HistoryPoint[], hum: HistoryPoint[]): ClimateRow[] {
  const rows = new Map<string, ClimateRow>();
  for (const p of temp) rows.set(p.t, { t: p.t, temp: p.v, hum: null });
  for (const p of hum) {
    const row = rows.get(p.t) ?? { t: p.t, temp: null, hum: null };
    row.hum = p.v;
    rows.set(p.t, row);
  }
  return [...rows.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export function clock(t: string): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmt(v: number | null, digits = 1): string {
  return v === null ? "--" : v.toFixed(digits);
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

// Summary line shared by the visible text and the chart's accessible name.
export function climateSummary(rows: ClimateRow[]): string {
  const temps: HistoryPoint[] = rows.flatMap((r) => (r.temp === null ? [] : [{ t: r.t, v: r.temp }]));
  const s = summarize(temps);
  const humMean = mean(rows.flatMap((r) => (r.hum === null ? [] : [r.hum])));
  const peak = s.peak ? `${clock(s.peak.t)} ${fmt(s.peak.v)} °C` : "--";
  return `PEAK ${peak} • TEMP VARIANCE ${fmt(s.variance)} °C • HUMIDITY MEAN ${fmt(humMean)} %`;
}

