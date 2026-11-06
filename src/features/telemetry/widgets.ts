import type { Entity } from "@/api/types";

// Feature 113: widget model for the live dashboard. Feature 114 (editor) edits the same model.

export type WidgetKind = "line" | "area" | "bar" | "gauge";

export interface Widget {
  id: string;
  entityId: string;
  kind: WidgetKind;
  visible: boolean;
  order: number;
}

export const WIDGET_STORAGE_KEY = "hc.telemetry.widgets.v1";
const SCHEMA_VERSION = 1;
const KINDS: readonly WidgetKind[] = ["line", "area", "bar", "gauge"];
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
    KINDS.includes(w.kind as WidgetKind)
  );
}

// Corrupt JSON, unknown schema version or bad shape -> null (caller falls back to defaults).
// Storage access can throw (private mode, blocked site data), so every access is guarded.
export function parseWidgets(raw: string | null): Widget[] | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as { version?: unknown; widgets?: unknown };
    if (data.version !== SCHEMA_VERSION || !Array.isArray(data.widgets)) return null;
    return data.widgets.every(isWidget) ? data.widgets : null;
  } catch {
    return null;
  }
}

export function loadWidgets(): Widget[] | null {
  try {
    return parseWidgets(window.localStorage.getItem(WIDGET_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveWidgets(widgets: Widget[]): void {
  try {
    window.localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, widgets }));
  } catch {
    // Storage unavailable: the layout still works for this session.
  }
}
