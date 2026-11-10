import type { Entity } from "@/api/types";
import { createSyncedSetting, registerSyncedSetting, type SyncedSetting } from "@/features/settings/syncedSetting";
import { numericState } from "./telemetry";

// Feature 113: widget model for the live dashboard. Feature 114 (editor) edits the same model.

export type WidgetKind = "line" | "area" | "bar" | "gauge";

// Feature 146: width of a chart on the 12-column grid (xl). Absent on a Widget = "third".
// Feature 160: adds quarter (25%) and threeQuarters (75%).
export type WidgetSize = "full" | "threeQuarters" | "half" | "third" | "quarter";

export interface Widget {
  id: string;
  entityId: string;
  kind: WidgetKind;
  visible: boolean;
  order: number;
  // Feature 146: replaces 114's `wide`. Absent = "third" (the default look).
  size?: WidgetSize;
  // Feature 114 legacy flag. Read only (migrated to `size` when parsed); never written again.
  wide?: boolean;
}

export const WIDGET_STORAGE_KEY = "hc.telemetry.widgets.v1";
const SCHEMA_VERSION = 1;
const KINDS: readonly WidgetKind[] = ["line", "area", "bar", "gauge"];
export const WIDGET_SIZES: readonly WidgetSize[] = ["full", "threeQuarters", "half", "third", "quarter"];
const NUMERIC_CLASSES = new Set([
  "temperature",
  "humidity",
  "carbon_dioxide",
  "co2",
  "power",
  "energy",
  "pm25",
  "pm10",
  "battery",
  "illuminance",
  "voltage",
  "current",
]);

const deviceClass = (e: Entity) => (typeof e.attributes.device_class === "string" ? e.attributes.device_class : "");
const unitOf = (e: Entity) => (typeof e.attributes.unit_of_measurement === "string" ? e.attributes.unit_of_measurement : "");

// Numeric sensors only: state_class measurement, or a numeric device class.
export function numericSensors(entities: Entity[]): Entity[] {
  return entities.filter(
    (e) =>
      e.domain === "sensor" && (e.attributes.state_class === "measurement" || NUMERIC_CLASSES.has(deviceClass(e))),
  );
}

export function kindFor(entity: Entity): WidgetKind {
  if (unitOf(entity) === "%") return "gauge";
  const cls = deviceClass(entity);
  if (cls === "energy") return "bar";
  if (cls === "temperature" || cls === "humidity" || cls === "carbon_dioxide" || cls === "co2") return "area";
  return "line";
}

function widgetId(entityId: string): string {
  return `widget.${entityId}`;
}

// Feature 159: the two climate history cards are synthetic widgets (id = entityId = `climate:<metric>`, kind "area",
// size half). They exist only while the house has a sensor of that metric and are never shown in the kind selector.
export type ClimateMetric = "temperature" | "humidity";
export const CLIMATE_METRICS: readonly ClimateMetric[] = ["temperature", "humidity"];
export const CLIMATE_LABEL: Record<ClimateMetric, string> = {
  temperature: "Climate temperature",
  humidity: "Climate humidity",
};

export function climateWidgetId(metric: ClimateMetric): string {
  return `climate:${metric}`;
}

// The metric of a synthetic climate widget, or null for a sensor widget.
export function climateMetricOf(w: Widget): ClimateMetric | null {
  return CLIMATE_METRICS.find((m) => w.id === climateWidgetId(m)) ?? null;
}

export function isClimateWidget(w: Widget): boolean {
  return climateMetricOf(w) !== null;
}

// Metrics the house has a numeric sensor for (same rule as the telemetry page's climate cards).
export function climateMetrics(entities: Entity[]): ClimateMetric[] {
  return CLIMATE_METRICS.filter((m) =>
    entities.some((e) => e.domain === "sensor" && e.attributes.device_class === m && numericState(e) !== null),
  );
}

export interface ClimateOptions {
  metrics: ClimateMetric[];
  // Metrics whose card starts hidden (migrated from the 125/158 fixed-panel toggles). Only read when a card is created.
  hiddenByDefault?: ClimateMetric[];
}

function climateWidget(metric: ClimateMetric, order: number, climate: ClimateOptions): Widget {
  const id = climateWidgetId(metric);
  return {
    id,
    entityId: id,
    kind: "area",
    visible: !(climate.hiddenByDefault ?? []).includes(metric),
    order,
    size: "half",
  };
}

// Default layout: the climate cards first, then every numeric sensor, visible, ordered by area then name.
export function deriveWidgets(sensors: Entity[], climate: ClimateOptions = { metrics: [] }): Widget[] {
  const climateWidgets = climate.metrics.map((m, order) => climateWidget(m, order, climate));
  const sensorWidgets = numericSensors(sensors)
    .sort((a, b) => (a.area ?? "").localeCompare(b.area ?? "") || a.name.localeCompare(b.name))
    .map((e, i) => ({
      id: widgetId(e.entityId),
      entityId: e.entityId,
      kind: kindFor(e),
      visible: true,
      order: climateWidgets.length + i,
    }));
  return [...climateWidgets, ...sensorWidgets];
}

// Merges a saved layout with the current sensors: removed sensors are dropped, new ones appended visible.
// Climate cards: a saved one is kept only while its metric is present; a missing one for a present metric is
// PREPENDED (hiddenByDefault applies). No saved layout (or none usable) -> the defaults.
export function reconcileWidgets(saved: Widget[] | null, sensors: Entity[], climate: ClimateOptions = { metrics: [] }): Widget[] {
  if (saved === null) return deriveWidgets(sensors, climate);
  const savedById = new Map(saved.map((w) => [w.entityId, w]));
  const current = numericSensors(sensors);
  const known: Widget[] = [];
  const added: Entity[] = [];
  for (const sensor of current) {
    const prev = savedById.get(sensor.entityId);
    if (prev) known.push(prev);
    else added.push(sensor);
  }
  const keptClimate = saved.filter((w) => {
    const m = climateMetricOf(w);
    return m !== null && climate.metrics.includes(m);
  });
  const missingClimate = climate.metrics.filter((m) => !keptClimate.some((w) => climateMetricOf(w) === m));
  const base = known.length > 0 ? Math.max(...known.map((w) => w.order)) + 1 : 0;
  const appended = added.map((e, i) => ({
    id: widgetId(e.entityId),
    entityId: e.entityId,
    kind: kindFor(e),
    visible: true,
    order: base + i,
  }));
  const existingOrders = [...known, ...keptClimate].map((w) => w.order);
  const firstOrder = existingOrders.length > 0 ? Math.min(...existingOrders) : 0;
  const prepended = missingClimate.map((m, i) =>
    climateWidget(m, firstOrder - (missingClimate.length - i), climate),
  );
  return [...prepended, ...keptClimate, ...known, ...appended]
    .sort((a, b) => a.order - b.order)
    .map((w, order) => ({ ...w, order }));
}

function isWidget(value: unknown): value is Widget {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    typeof w.entityId === "string" &&
    typeof w.visible === "boolean" &&
    typeof w.order === "number" &&
    (w.wide === undefined || typeof w.wide === "boolean") &&
    (w.size === undefined || WIDGET_SIZES.includes(w.size as WidgetSize)) &&
    KINDS.includes(w.kind as WidgetKind)
  );
}

// Feature 146 migration: a saved `size` wins; else legacy `wide: true` -> "half" (2/3 is closest to 1/2), else "third".
// The result always has a size and never carries `wide`.
export function normalizeWidget(w: Widget): Widget {
  const { wide, ...rest } = w;
  const size: WidgetSize = rest.size ?? (wide === true ? "half" : "third");
  return { ...rest, size };
}

// Feature 135: the stored value is the v1 object { version: 1, widgets }. parse also takes the legacy localStorage
// string (JSON). Corrupt JSON, unknown schema version or bad shape -> null (caller falls back to defaults).
export interface StoredWidgets {
  version: typeof SCHEMA_VERSION;
  widgets: Widget[];
}

export function parseStoredWidgets(raw: unknown): StoredWidgets | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const { version, widgets } = data as { version?: unknown; widgets?: unknown };
  if (version !== SCHEMA_VERSION || !Array.isArray(widgets) || !widgets.every(isWidget)) return null;
  return { version: SCHEMA_VERSION, widgets: widgets.map(normalizeWidget) };
}

export function parseWidgets(raw: string | null): Widget[] | null {
  if (raw === null) return null;
  return parseStoredWidgets(raw)?.widgets ?? null;
}

// Feature 135: the layout is shared across devices (backend setting telemetry.widgets, 134). WIDGET_STORAGE_KEY is
// only the one-time import source.
export const widgetsSetting = createSyncedSetting<StoredWidgets>({
  key: "telemetry.widgets",
  legacyKey: WIDGET_STORAGE_KEY,
  parse: parseStoredWidgets,
});
registerSyncedSetting(widgetsSetting as SyncedSetting<unknown>);

export function loadWidgets(): Widget[] | null {
  return widgetsSetting.get()?.widgets ?? null;
}

// Only user edits call this (never on reconcile), so a device missing a sensor cannot erase another device's widgets.
export function saveWidgets(widgets: Widget[]): void {
  widgetsSetting.set({ version: SCHEMA_VERSION, widgets: widgets.map(normalizeWidget) });
}
