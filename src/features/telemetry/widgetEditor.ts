import type { Entity } from "@/api/types";
import { deriveWidgets, type ClimateMetric, type Widget, type WidgetKind, type WidgetSize } from "./widgets";

// Feature 114a: pure editor logic for the telemetry dashboard layout. No React, no storage.
// Every function returns a NEW array (or the input reference when nothing applies).

export const KIND_LABEL: Record<WidgetKind, string> = {
  line: "LINE",
  area: "AREA",
  bar: "BAR",
  gauge: "GAUGE",
};

// Feature 146: the width modes, in pill order. Feature 160 adds 75% and 25%.
export const SIZE_LABEL: Record<WidgetSize, string> = {
  full: "FULL",
  threeQuarters: "75%",
  half: "HALF",
  third: "THIRD",
  quarter: "25%",
};
export const SIZES: readonly WidgetSize[] = ["full", "threeQuarters", "half", "third", "quarter"];

// Gauge is 0..100 only, so it is offered for "%" sensors and nothing else.
export function validKinds(entity: Entity): WidgetKind[] {
  const unit = typeof entity.attributes.unit_of_measurement === "string" ? entity.attributes.unit_of_measurement : "";
  return unit === "%" ? ["line", "area", "gauge"] : ["line", "area", "bar"];
}

function sortedByOrder(widgets: Widget[]): Widget[] {
  return [...widgets].sort((a, b) => a.order - b.order);
}

function renumbered(widgets: Widget[]): Widget[] {
  return widgets.map((w, order) => ({ ...w, order }));
}

// Swaps the widget with its nearest VISIBLE neighbour in direction dir.
// Hidden widgets in between keep their place. No visible neighbour, hidden target or unknown id -> input unchanged.
export function moveWidget(widgets: Widget[], id: string, dir: -1 | 1): Widget[] {
  const sorted = sortedByOrder(widgets);
  const idx = sorted.findIndex((w) => w.id === id);
  if (idx === -1 || !sorted[idx].visible) return widgets;
  let j = idx + dir;
  while (j >= 0 && j < sorted.length && !sorted[j].visible) j += dir;
  if (j < 0 || j >= sorted.length) return widgets;
  [sorted[idx], sorted[j]] = [sorted[j], sorted[idx]];
  return renumbered(sorted);
}

// True when moveWidget would change the layout (drives the disabled state of the move buttons).
export function canMove(widgets: Widget[], id: string, dir: -1 | 1): boolean {
  return moveWidget(widgets, id, dir) !== widgets;
}

// Patches one widget, then renumbers the whole layout 0..n-1 in its order (same as moveWidget).
function patchWidget(widgets: Widget[], id: string, patch: Partial<Widget>): Widget[] {
  if (!widgets.some((w) => w.id === id)) return widgets;
  return renumbered(sortedByOrder(widgets.map((w) => (w.id === id ? { ...w, ...patch } : { ...w }))));
}

export function setVisible(widgets: Widget[], id: string, visible: boolean): Widget[] {
  return patchWidget(widgets, id, { visible });
}

export function setKind(widgets: Widget[], id: string, kind: WidgetKind): Widget[] {
  return patchWidget(widgets, id, { kind });
}

export function setSize(widgets: Widget[], id: string, size: WidgetSize): Widget[] {
  return patchWidget(widgets, id, { size });
}

// Reset = the defaults: climate cards first (half, visible), then all sensors visible with default kind,
// default size (absent = third) and default order. Feature 159: metrics are the climate metrics the house has.
export function resetWidgets(sensors: Entity[], metrics: ClimateMetric[] = []): Widget[] {
  return deriveWidgets(sensors, { metrics });
}
