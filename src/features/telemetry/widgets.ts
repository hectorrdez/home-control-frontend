import type { Entity } from "@/api/types";
import { createSyncedSetting, registerSyncedSetting, type SyncedSetting } from "@/features/settings/syncedSetting";

// Feature 113: widget model for the live dashboard. Feature 114 (editor) edits the same model.

export type WidgetKind = "line" | "area" | "bar" | "gauge";

// Feature 146: width of a chart on the 6-column grid (xl). Absent on a Widget = "third".
export type WidgetSize = "full" | "half" | "third";

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
export const WIDGET_SIZES: readonly WidgetSize[] = ["full", "half", "third"];
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

// Default layout: every numeric sensor, visible, ordered by area then name.
export function deriveWidgets(sensors: Entity[]): Widget[] {
  return numericSensors(sensors)
    .sort((a, b) => (a.area ?? "").localeCompare(b.area ?? "") || a.name.localeCompare(b.name))
    .map((e, order) => ({ id: widgetId(e.entityId), entityId: e.entityId, kind: kindFor(e), visible: true, order }));
}

// Merges a saved layout with the current sensors: removed sensors are dropped, new ones appended visible.
// No saved layout (or none usable) -> the defaults.
export function reconcileWidgets(saved: Widget[] | null, sensors: Entity[]): Widget[] {
  if (saved === null) return deriveWidgets(sensors);
  const savedById = new Map(saved.map((w) => [w.entityId, w]));
  const current = numericSensors(sensors);
  const known: Widget[] = [];
  const added: Entity[] = [];
  for (const sensor of current) {
    const prev = savedById.get(sensor.entityId);
    if (prev) known.push(prev);
    else added.push(sensor);
  }
  const base = known.length > 0 ? Math.max(...known.map((w) => w.order)) + 1 : 0;
  const appended = added.map((e, i) => ({
    id: widgetId(e.entityId),
    entityId: e.entityId,
    kind: kindFor(e),
    visible: true,
    order: base + i,
  }));
  return [...known, ...appended]
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
