import type { Entity } from "@/api/types";
import { UNASSIGNED, type EntitiesState } from "@/state/entities";
import { INTERACTIVE_DOMAINS, isInteractive } from "@/state/selectors";
import { isUnavailable } from "@/state/availability";
import { normalize } from "@/features/telemetry/widgetFilters";
import { cleanName, displayName } from "@/features/names/displayName";

// Feature 121/123: pure search/filter/grouping model for the /devices list. No React, no storage.
// One row = one physical device (entities sharing deviceName + area). Standalone entities are their own row.

export interface DeviceRow {
  key: string; // `${areaId}~${slug}` for a device, the entity id for a standalone entity (never contains ".")
  label: string;
  areaId: string;
  areaName: string;
  primary: Entity; // first member in member order: the entity that drives the row icon and state
  entities: Entity[]; // ordered members (primary first)
  interactive: boolean; // any member interactive
  domains: string[]; // distinct member domains
  offline: boolean; // feature 126: every member unavailable (partly available devices stay online)
  statusEntity: Entity; // feature 126: the member whose state the row shows (primary, or the first available one)
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

// Lowercase ASCII-ish slug of a device name: accents stripped, every other run of non letter/digit -> "_".
export function deviceSlug(name: string): string {
  const parts = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return parts.join("_");
}

function slugOf(entity: Entity): string {
  return typeof entity.deviceName === "string" ? deviceSlug(entity.deviceName) : "";
}

const INTERACTIVE_ORDER = ["light", "switch", "fan", "climate", "cover", "lock", "media_player", "scene", "script"];

// Member order (primary = first): interactive domains, binary_sensor, sensors (temperature, other, battery), other domains.
function memberRank(entity: Entity): [number, number] {
  const interactive = INTERACTIVE_ORDER.indexOf(entity.domain);
  if (interactive >= 0) return [interactive, 0];
  if (entity.domain === "binary_sensor") return [INTERACTIVE_ORDER.length, 0];
  if (entity.domain === "sensor") {
    const deviceClass = entity.attributes.device_class;
    const sub = deviceClass === "temperature" ? 0 : deviceClass === "battery" ? 2 : 1;
    return [INTERACTIVE_ORDER.length + 1, sub];
  }
  return [INTERACTIVE_ORDER.length + 2, 0];
}

function compareMembers(a: Entity, b: Entity): number {
  const [ra, sa] = memberRank(a);
  const [rb, sb] = memberRank(b);
  return ra - rb || sa - sb || a.entityId.localeCompare(b.entityId);
}

interface Group {
  key: string;
  areaId: string;
  areaName: string;
  rank: number;
  members: Entity[];
  device: boolean;
}

// The /devices list holds only what can be controlled or read: no tts, conversation, event, zone, sun, ...
const LISTED_DOMAINS = new Set([...INTERACTIVE_DOMAINS, "sensor", "binary_sensor", "media_player"]);

// Rows in the page order: areas in state.areas order (Unassigned last), then label (localeCompare).
// Rows include unavailable and unknown entities; entities outside LISTED_DOMAINS are skipped. Standalone labels come from `label`, device labels from the device name.
export function buildDeviceRows(state: EntitiesState, label: (entity: Entity) => string): DeviceRow[] {
  const groups = new Map<string, Group>();
  state.areas.forEach((area, index) => {
    for (const id of area.entityIds) {
      const entity = state.entities[id];
      if (!entity || !LISTED_DOMAINS.has(entity.domain)) continue;
      const slug = slugOf(entity);
      const key = slug ? `${area.areaId}~${slug}` : entity.entityId;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          areaId: area.areaId,
          areaName: area.areaId === UNASSIGNED ? "Unassigned" : area.name,
          rank: area.areaId === UNASSIGNED ? Number.MAX_SAFE_INTEGER : index,
          members: [],
          device: slug !== "",
        };
        groups.set(key, group);
      }
      group.members.push(entity);
    }
  });

  const rows = [...groups.values()].map((group) => {
    const entities = [...group.members].sort(compareMembers);
    const primary = entities[0];
    const text = group.device && primary.deviceName ? cleanName({ entityId: primary.entityId, name: primary.deviceName }) : label(primary);
    const offline = entities.every(isUnavailable);
    const row: DeviceRow = {
      key: group.key,
      label: text,
      areaId: group.areaId,
      areaName: group.areaName,
      primary,
      entities,
      interactive: entities.some(isInteractive),
      domains: [...new Set(entities.map((e) => e.domain))],
      offline,
      statusEntity: isUnavailable(primary) ? (entities.find((e) => !isUnavailable(e)) ?? primary) : primary,
    };
    return { row, rank: group.rank };
  });
  rows.sort((a, b) => a.rank - b.rank || a.row.label.localeCompare(b.row.label));
  return rows.map((r) => r.row);
}

// Maps a route param to a row: a row key is canonical; a member entity id resolves to its device (canonical only when
// the entity is itself the key, i.e. standalone). Unknown params resolve to null.
export function resolveDeviceKey(rows: DeviceRow[], param: string): { row: DeviceRow; canonical: boolean } | null {
  const byKey = rows.find((r) => r.key === param);
  if (byKey) return { row: byKey, canonical: true };
  for (const row of rows) {
    if (row.entities.some((e) => e.entityId === param)) return { row, canonical: param === row.key };
  }
  return null;
}

function matchesQuery(row: DeviceRow, q: string): boolean {
  const texts = [row.label, row.areaName, row.primary.deviceName ?? ""];
  for (const e of row.entities) texts.push(displayName(e), e.name, e.entityId);
  return texts.some((t) => normalize(t).includes(q));
}

// Groups combine with AND; values inside a group combine with OR; empty group = no constraint. Input order is kept.
export function filterDeviceRows(rows: DeviceRow[], f: DeviceFilters): DeviceRow[] {
  const q = normalize(f.query);
  return rows.filter((r) => {
    if (q && !matchesQuery(r, q)) return false;
    if (f.areas.length > 0 && !f.areas.includes(r.areaId)) return false;
    if (f.domains.length > 0 && !r.domains.some((d) => f.domains.includes(d))) return false;
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
// A row counts once per domain it contains. Areas keep the rows' first-seen order with Unassigned last;
// domains are sorted by label.
export function deviceFacets(rows: DeviceRow[]): DeviceFacets {
  const areas = new Map<string, { id: string; name: string; count: number }>();
  const domains = new Map<string, number>();
  for (const r of rows) {
    const area = areas.get(r.areaId);
    if (area) area.count += 1;
    else areas.set(r.areaId, { id: r.areaId, name: r.areaName, count: 1 });
    for (const domain of r.domains) domains.set(domain, (domains.get(domain) ?? 0) + 1);
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
