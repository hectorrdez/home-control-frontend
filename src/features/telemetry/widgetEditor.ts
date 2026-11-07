import type { Entity } from "@/api/types";
import { deriveWidgets, type Widget, type WidgetKind } from "./widgets";

// Feature 114a: pure editor logic for the telemetry dashboard layout. No React, no storage.
// Every function returns a NEW array (or the input reference when nothing applies).

export const KIND_LABEL: Record<WidgetKind, string> = {
  line: "LINE",
  area: "AREA",
  bar: "BAR",
  gauge: "GAUGE",
};

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

export function setWide(widgets: Widget[], id: string, wide: boolean): Widget[] {
  return patchWidget(widgets, id, { wide });
}

// Reset = the 113 defaults: all visible, default kinds, not wide, default order.
export function resetWidgets(sensors: Entity[]): Widget[] {
  return deriveWidgets(sensors);
}
