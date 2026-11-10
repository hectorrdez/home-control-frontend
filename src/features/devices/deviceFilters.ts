import type { Entity } from "@/api/types";
import { UNASSIGNED, type EntitiesState } from "@/state/entities";
import {
  DOMAIN_GROUPS,
  INTERACTIVE_DOMAINS,
  allEntities,
  deckSections,
  domainGroupOf,
  isInteractive,
  plugPowerSensorIds,
  type DeckSection,
  type DomainGroup,
} from "@/state/selectors";
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

// Feature 129: the device row key of an entity inside one area (same rule buildDeviceRows uses).
export function deviceRowKeyIn(areaId: string, entity: Entity): string {
  const slug = slugOf(entity);
  return slug ? `${areaId}~${slug}` : entity.entityId;
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
      const key = deviceRowKeyIn(area.areaId, entity);
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

// Feature 162: multi-visibility for the Device panel drawer. Each switch is on by default; a device is shown when its
// type switch AND its room switch are on. Empty sets = everything visible. Pure: the panel owns the state.
export interface PanelVisibility {
  hiddenTypes: ReadonlySet<DomainGroup>;
  hiddenRooms: ReadonlySet<string>;
}

export const ALL_VISIBLE: PanelVisibility = { hiddenTypes: new Set(), hiddenRooms: new Set() };

// Every actuator type the drawer can list: the pill groups plus "other" (fans, covers, scenes, scripts), so NONE hides everything.
export const PANEL_TYPES: readonly DomainGroup[] = [...DOMAIN_GROUPS, "other"];

export function panelTypeLabel(type: DomainGroup): string {
  return type === "other" ? "OTHER" : type.toUpperCase();
}

// Interactive device count per actuator type over the whole house (same basis as groupCounts).
export function panelTypeCounts(state: EntitiesState): Record<DomainGroup, number> {
  const plugs = plugPowerSensorIds(allEntities(state));
  const counts: Record<DomainGroup, number> = { lights: 0, climate: 0, security: 0, plugs: 0, other: 0 };
  for (const entity of allEntities(state)) {
    if (isInteractive(entity)) counts[domainGroupOf(entity, plugs)] += 1;
  }
  return counts;
}

// Rooms that hold at least one interactive device, in state order, with their interactive device count.
export function panelRoomCounts(state: EntitiesState): { areaId: string; name: string; count: number }[] {
  const rooms: { areaId: string; name: string; count: number }[] = [];
  for (const area of state.areas) {
    const count = area.entityIds.filter((id) => {
      const e = state.entities[id];
      return e !== undefined && isInteractive(e);
    }).length;
    if (count > 0) rooms.push({ areaId: area.areaId, name: area.name, count });
  }
  return rooms;
}

// Deck sections after the multi-visibility filter. selectedArea (3D stage focus) still narrows the deck to one room when set.
export function visibleDeckSections(state: EntitiesState, selectedArea: string | null, v: PanelVisibility): DeckSection[] {
  const plugs = plugPowerSensorIds(allEntities(state));
  return deckSections(state, selectedArea, "all")
    .map((section) => ({
      ...section,
      entities: section.entities.filter(
        (e) => !v.hiddenRooms.has(section.area.areaId) && !v.hiddenTypes.has(domainGroupOf(e, plugs)),
      ),
    }))
    .filter((section) => section.entities.length > 0 || selectedArea !== null);
}

export function setTypeShown(v: PanelVisibility, type: DomainGroup, shown: boolean): PanelVisibility {
  const hiddenTypes = new Set(v.hiddenTypes);
  if (shown) hiddenTypes.delete(type);
  else hiddenTypes.add(type);
  return { ...v, hiddenTypes };
}

export function setRoomShown(v: PanelVisibility, areaId: string, shown: boolean): PanelVisibility {
  const hiddenRooms = new Set(v.hiddenRooms);
  if (shown) hiddenRooms.delete(areaId);
  else hiddenRooms.add(areaId);
  return { ...v, hiddenRooms };
}

// NONE: hide every listed type and room.
export function hideAllListed(types: readonly DomainGroup[], rooms: readonly string[]): PanelVisibility {
  return { hiddenTypes: new Set(types), hiddenRooms: new Set(rooms) };
}

// Switched-off entries among the listed types and rooms (drives the FILTERS · n label).
export function switchedOffCount(v: PanelVisibility, types: readonly DomainGroup[], rooms: readonly string[]): number {
  return types.filter((t) => v.hiddenTypes.has(t)).length + rooms.filter((r) => v.hiddenRooms.has(r)).length;
}
