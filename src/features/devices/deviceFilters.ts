import type { Entity } from "@/api/types";
import { UNASSIGNED, type EntitiesState } from "@/state/entities";
import { isInteractive } from "@/state/selectors";
import { normalize } from "@/features/telemetry/widgetFilters";

// Feature 121: pure search/filter model for the /devices list. No React, no storage.

export interface DeviceRow {
  entity: Entity;
  label: string; // displayName (115)
  areaId: string;
  areaName: string;
  interactive: boolean;
}

export type DeviceKind = "all" | "interactive" | "readonly";

export interface DeviceFilters {
  query: string;
  areas: string[];
  domains: string[];
  kind: DeviceKind;
}

export const EMPTY_DEVICE_FILTERS: DeviceFilters = { query: "", areas: [], domains: [], kind: "all" };

export function isFiltered(f: DeviceFilters): boolean {
  return f.query.trim() !== "" || f.areas.length > 0 || f.domains.length > 0 || f.kind !== "all";
}

// Rows in the page order: areas in state.areas order (Unassigned last), then label (localeCompare).
// Rows include unavailable and unknown entities.
export function buildDeviceRows(state: EntitiesState, label: (entity: Entity) => string): DeviceRow[] {
  const rank = (areaId: string, index: number) => (areaId === UNASSIGNED ? Number.MAX_SAFE_INTEGER : index);
  const rows: { row: DeviceRow; rank: number }[] = [];
  state.areas.forEach((group, index) => {
    for (const id of group.entityIds) {
      const entity = state.entities[id];
      if (!entity) continue;
      rows.push({
        row: {
          entity,
          label: label(entity),
          areaId: group.areaId,
          areaName: group.areaId === UNASSIGNED ? "Unassigned" : group.name,
          interactive: isInteractive(entity),
        },
        rank: rank(group.areaId, index),
      });
    }
  });
  rows.sort((a, b) => a.rank - b.rank || a.row.label.localeCompare(b.row.label));
  return rows.map((r) => r.row);
}

// Groups combine with AND; values inside a group combine with OR; empty group = no constraint. Input order is kept.
export function filterDeviceRows(rows: DeviceRow[], f: DeviceFilters): DeviceRow[] {
  const q = normalize(f.query);
  return rows.filter((r) => {
    if (q && ![r.label, r.entity.name, r.areaName, r.entity.entityId].some((t) => normalize(t).includes(q))) return false;
    if (f.areas.length > 0 && !f.areas.includes(r.areaId)) return false;
    if (f.domains.length > 0 && !f.domains.includes(r.entity.domain)) return false;
    if (f.kind === "interactive" && !r.interactive) return false;
    if (f.kind === "readonly" && r.interactive) return false;
    return true;
  });
}

export interface DeviceFacets {
  areas: { id: string; name: string; count: number }[];
  domains: { id: string; label: string; count: number }[];
}

export function domainLabel(domain: string): string {
  return domain.replaceAll("_", " ").toUpperCase();
}

// Counts over ALL rows (static, not the filtered set). Zero-count entries are omitted.
// Areas keep the rows' first-seen order with Unassigned last; domains are sorted by label.
export function deviceFacets(rows: DeviceRow[]): DeviceFacets {
  const areas = new Map<string, { id: string; name: string; count: number }>();
  const domains = new Map<string, number>();
  for (const r of rows) {
    const area = areas.get(r.areaId);
    if (area) area.count += 1;
    else areas.set(r.areaId, { id: r.areaId, name: r.areaName, count: 1 });
    domains.set(r.entity.domain, (domains.get(r.entity.domain) ?? 0) + 1);
  }
  const areaList = [...areas.values()].sort((a, b) => {
    if (a.id === UNASSIGNED) return 1;
    if (b.id === UNASSIGNED) return -1;
    return 0;
  });
  const domainList = [...domains.entries()]
    .map(([id, count]) => ({ id, label: domainLabel(id), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { areas: areaList, domains: domainList };
}
