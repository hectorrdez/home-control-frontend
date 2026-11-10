import type { Entity } from "@/api/types";
import { createSyncedSetting, registerSyncedSetting, type SyncedSetting } from "@/features/settings/syncedSetting";
import type { Widget } from "./widgets";
import { deviceRowKeyIn } from "@/features/devices/deviceFilters";

// Feature 118: pure search/filter model for the CHARTS side panel. No React, no storage.

export type ChartCategory =
  | "temperature"
  | "humidity"
  | "co2"
  | "voc"
  | "pm25"
  | "pm10"
  | "pressure"
  | "illuminance"
  | "power"
  | "energy"
  | "voltage"
  | "current"
  | "frequency"
  | "battery"
  | "signal"
  | "data_rate"
  | "gas"
  | "water"
  | "other";

export const CATEGORIES: readonly { id: ChartCategory; label: string }[] = [
  { id: "temperature", label: "TEMPERATURE" },
  { id: "humidity", label: "HUMIDITY" },
  { id: "co2", label: "CO2" },
  { id: "voc", label: "VOC" },
  { id: "pm25", label: "PM2.5" },
  { id: "pm10", label: "PM10" },
  { id: "pressure", label: "PRESSURE" },
  { id: "illuminance", label: "LIGHT" },
  { id: "power", label: "POWER" },
  { id: "energy", label: "ENERGY" },
  { id: "voltage", label: "VOLTAGE" },
  { id: "current", label: "CURRENT" },
  { id: "frequency", label: "FREQUENCY" },
  { id: "battery", label: "BATTERY" },
  { id: "signal", label: "SIGNAL" },
  { id: "data_rate", label: "NETWORK" },
  { id: "gas", label: "GAS" },
  { id: "water", label: "WATER" },
  { id: "other", label: "OTHER" },
];

const CLASS_TO_CATEGORY = new Map<string, ChartCategory>([
  ["temperature", "temperature"],
  ["humidity", "humidity"],
  ["carbon_dioxide", "co2"],
  ["co2", "co2"],
  ["volatile_organic_compounds", "voc"],
  ["volatile_organic_compounds_parts", "voc"],
  ["pm25", "pm25"],
  ["pm10", "pm10"],
  ["pressure", "pressure"],
  ["atmospheric_pressure", "pressure"],
  ["illuminance", "illuminance"],
  ["power", "power"],
  ["apparent_power", "power"],
  ["reactive_power", "power"],
  ["energy", "energy"],
  ["voltage", "voltage"],
  ["current", "current"],
  ["frequency", "frequency"],
  ["battery", "battery"],
  ["signal_strength", "signal"],
  ["data_rate", "data_rate"],
  ["gas", "gas"],
  ["water", "water"],
]);

// Exact unit matches. "%" and "µg/m³" are deliberately absent (ambiguous -> other).
const UNIT_TO_CATEGORY = new Map<string, ChartCategory>([
  ["°C", "temperature"],
  ["°F", "temperature"],
  ["K", "temperature"],
  ["ppm", "co2"],
  ["hPa", "pressure"],
  ["mbar", "pressure"],
  ["Pa", "pressure"],
  ["kPa", "pressure"],
  ["bar", "pressure"],
  ["psi", "pressure"],
  ["inHg", "pressure"],
  ["mmHg", "pressure"],
  ["lx", "illuminance"],
  ["W", "power"],
  ["kW", "power"],
  ["MW", "power"],
  ["Wh", "energy"],
  ["kWh", "energy"],
  ["MWh", "energy"],
  ["V", "voltage"],
  ["mV", "voltage"],
  ["A", "current"],
  ["mA", "current"],
  ["Hz", "frequency"],
  ["kHz", "frequency"],
  ["MHz", "frequency"],
  ["GHz", "frequency"],
  ["dBm", "signal"],
  ["dB", "signal"],
  ["bit/s", "data_rate"],
  ["kbit/s", "data_rate"],
  ["Mbit/s", "data_rate"],
  ["Gbit/s", "data_rate"],
  ["B/s", "data_rate"],
  ["kB/s", "data_rate"],
  ["MB/s", "data_rate"],
  ["m³", "gas"],
  ["ft³", "gas"],
  ["L", "water"],
  ["gal", "water"],
]);

export function categoryOf(entity: Entity): ChartCategory {
  const cls = typeof entity.attributes.device_class === "string" ? entity.attributes.device_class.toLowerCase() : "";
  const byClass = CLASS_TO_CATEGORY.get(cls);
  if (byClass) return byClass;
  const unit = typeof entity.attributes.unit_of_measurement === "string" ? entity.attributes.unit_of_measurement : "";
  return UNIT_TO_CATEGORY.get(unit) ?? "other";
}

export const UNASSIGNED_ZONE = "unassigned";

export interface ChartRow {
  widget: Widget;
  entity: Entity;
  label: string; // displayName
  deviceName: string; // feature 124: cleaned device label, "" when the entity has none
  zoneId: string;
  zoneName: string;
}

// Feature 163: the CHARTS drawer lists physical devices. A device passes a kind filter by its kinds.
export type DeviceKind = "sensor" | "actuator" | "other";
export const DEVICE_KINDS: readonly { id: DeviceKind; label: string }[] = [
  { id: "sensor", label: "SENSOR" },
  { id: "actuator", label: "ACTUATOR" },
  { id: "other", label: "OTHER" },
];

// A device is a SENSOR when one of its chart fields is a measurement category.
const MEASUREMENT_CATEGORIES = new Set<ChartCategory>([
  "temperature",
  "humidity",
  "co2",
  "voc",
  "pm25",
  "pm10",
  "pressure",
  "illuminance",
  "power",
  "energy",
  "voltage",
  "current",
  "frequency",
  "gas",
  "water",
]);

// A device is an ACTUATOR when one of its entities is controllable, whatever else it has.
const ACTUATOR_DOMAINS = new Set(["light", "switch", "cover", "climate", "lock", "fan", "scene", "script", "media_player"]);

export interface DeviceRow {
  key: string; // deviceRowKeyIn: `${zoneId}~${slug}`, or the entity id for a standalone entity
  name: string;
  zoneId: string;
  zoneName: string;
  fields: ChartRow[]; // chartable fields (numeric sensors), in widget order
  entityIds: string[]; // every member entity (chart fields and the rest of the device)
  kinds: Set<DeviceKind>;
  added: boolean; // at least one field chart is visible
  addedCount: number;
}

// Kinds of a device from its chart fields and all its member entities. Never empty: no sensor and no actuator = other.
export function kindsOf(fields: ChartRow[], members: Entity[]): Set<DeviceKind> {
  const kinds = new Set<DeviceKind>();
  if (fields.some((f) => MEASUREMENT_CATEGORIES.has(categoryOf(f.entity)))) kinds.add("sensor");
  if (members.some((e) => ACTUATOR_DOMAINS.has(e.domain))) kinds.add("actuator");
  if (kinds.size === 0) kinds.add("other");
  return kinds;
}

// Groups the chart rows into devices (same key rule as the /devices list). `entities` is every entity on the page: it
// supplies the controllable members for the ACTUATOR kind. Devices come out in the first-seen order of `rows`.
export function buildDeviceRows(rows: ChartRow[], entities: Entity[]): DeviceRow[] {
  const groups = new Map<string, { fields: ChartRow[]; members: Entity[] }>();
  for (const row of rows) {
    const key = deviceRowKeyIn(row.zoneId, row.entity);
    const group = groups.get(key) ?? { fields: [], members: [] };
    group.fields.push(row);
    groups.set(key, group);
  }
  for (const entity of entities) {
    const group = groups.get(deviceRowKeyIn(entity.area ?? UNASSIGNED_ZONE, entity));
    if (group) group.members.push(entity);
  }
  return [...groups.entries()].map(([key, { fields, members }]) => {
    const first = fields[0];
    const addedCount = fields.filter((f) => f.widget.visible).length;
    const ids = [...new Set([...fields.map((f) => f.entity.entityId), ...members.map((e) => e.entityId)])];
    return {
      key,
      name: first.deviceName !== "" ? first.deviceName : first.label,
      zoneId: first.zoneId,
      zoneName: first.zoneName,
      fields,
      entityIds: ids,
      kinds: kindsOf(fields, members),
      added: addedCount > 0,
      addedCount,
    };
  });
}

export type Visibility = "all" | "added" | "notAdded";

export interface ChartFilters {
  query: string;
  zones: string[];
  categories: ChartCategory[];
  kinds: DeviceKind[];
  visibility: Visibility;
}

export const EMPTY_FILTERS: ChartFilters = { query: "", zones: [], categories: [], kinds: [], visibility: "all" };

export function isFiltered(f: ChartFilters): boolean {
  return f.query.trim() !== "" || f.zones.length > 0 || f.categories.length > 0 || f.kinds.length > 0 || f.visibility !== "all";
}

// Case- and accent-insensitive: "batería" matches "Bateria".
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

// Groups combine with AND; values inside a group combine with OR. A device passes a category when ANY field has it.
// Input order is preserved.
export function filterDevices(devices: DeviceRow[], f: ChartFilters): DeviceRow[] {
  const q = normalize(f.query);
  return devices.filter((d) => {
    if (q && ![d.name, d.zoneName, ...d.fields.map((x) => x.label), ...d.entityIds].some((t) => normalize(t).includes(q))) return false;
    if (f.zones.length > 0 && !f.zones.includes(d.zoneId)) return false;
    if (f.categories.length > 0 && !d.fields.some((x) => f.categories.includes(categoryOf(x.entity)))) return false;
    if (f.kinds.length > 0 && !f.kinds.some((k) => d.kinds.has(k))) return false;
    if (f.visibility === "added" && !d.added) return false;
    if (f.visibility === "notAdded" && d.added) return false;
    return true;
  });
}

export interface FacetCounts {
  zones: { id: string; name: string; count: number }[];
  categories: { id: ChartCategory; label: string; count: number }[];
  kinds: { id: DeviceKind; label: string; count: number }[];
}

// Counts over ALL devices (static, not the filtered set). A device counts once per category/kind it has.
// Zero-count entries are omitted.
export function facetCounts(devices: DeviceRow[]): FacetCounts {
  const zones = new Map<string, { id: string; name: string; count: number }>();
  const cats = new Map<ChartCategory, number>();
  const kinds = new Map<DeviceKind, number>();
  for (const d of devices) {
    const zone = zones.get(d.zoneId);
    if (zone) zone.count += 1;
    else zones.set(d.zoneId, { id: d.zoneId, name: d.zoneName, count: 1 });
    for (const cat of new Set(d.fields.map((f) => categoryOf(f.entity)))) cats.set(cat, (cats.get(cat) ?? 0) + 1);
    for (const kind of d.kinds) kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  const zoneList = [...zones.values()].sort((a, b) => {
    if (a.id === UNASSIGNED_ZONE) return 1;
    if (b.id === UNASSIGNED_ZONE) return -1;
    return a.name.localeCompare(b.name);
  });
  const categories = CATEGORIES.flatMap((c) => {
    const count = cats.get(c.id);
    return count ? [{ id: c.id, label: c.label, count }] : [];
  });
  const kindList = DEVICE_KINDS.flatMap((k) => {
    const count = kinds.get(k.id);
    return count ? [{ id: k.id, label: k.label, count }] : [];
  });
  return { zones: zoneList, categories, kinds: kindList };
}

// Feature 137: the filters are a shared setting (telemetry.filters, 134). Stored value v1; the store debounces the PUT.
// Feature 163: visibility is all / added / notAdded (the old v1 values on / off are read as added / notAdded) and
// kinds is optional (absent = none).
export const FILTERS_QUERY_MAX = 100;
export const FILTERS_ZONES_MAX = 50;
const VISIBILITIES: readonly Visibility[] = ["all", "added", "notAdded"];
const LEGACY_VISIBILITY: Record<string, Visibility> = { on: "added", off: "notAdded" };
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));
const KIND_IDS = new Set<string>(DEVICE_KINDS.map((k) => k.id));

export interface StoredFilters {
  v: 1;
  query: string;
  zones: string[];
  categories: ChartCategory[];
  kinds: DeviceKind[];
  visibility: Visibility;
}

// Unknown categories and kinds are dropped; any other bad field makes the whole value invalid (null -> defaults).
export function parseStoredFilters(raw: unknown): StoredFilters | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { v, query, zones, categories, kinds, visibility } = raw as Record<string, unknown>;
  if (v !== 1 || typeof query !== "string" || query.length > FILTERS_QUERY_MAX) return null;
  if (!Array.isArray(zones) || zones.length > FILTERS_ZONES_MAX || !zones.every((z) => typeof z === "string")) return null;
  if (!Array.isArray(categories)) return null;
  if (kinds !== undefined && !Array.isArray(kinds)) return null;
  const mapped = typeof visibility === "string" ? (LEGACY_VISIBILITY[visibility] ?? visibility) : visibility;
  if (!VISIBILITIES.includes(mapped as Visibility)) return null;
  return {
    v: 1,
    query,
    zones,
    categories: categories.filter((c): c is ChartCategory => typeof c === "string" && CATEGORY_IDS.has(c)),
    kinds: (kinds ?? []).filter((k): k is DeviceKind => typeof k === "string" && KIND_IDS.has(k)),
    visibility: mapped as Visibility,
  };
}

export const filtersSetting = createSyncedSetting<StoredFilters>({
  key: "telemetry.filters",
  parse: parseStoredFilters,
});
registerSyncedSetting(filtersSetting as SyncedSetting<unknown>);

export function toStoredFilters(f: ChartFilters): StoredFilters {
  return {
    v: 1,
    query: f.query.slice(0, FILTERS_QUERY_MAX),
    zones: f.zones.slice(0, FILTERS_ZONES_MAX),
    categories: [...f.categories],
    kinds: [...f.kinds],
    visibility: f.visibility,
  };
}

export function fromStoredFilters(stored: StoredFilters | null): ChartFilters {
  if (!stored) return EMPTY_FILTERS;
  return {
    query: stored.query,
    zones: stored.zones,
    categories: stored.categories,
    kinds: stored.kinds,
    visibility: stored.visibility,
  };
}

// Zone ids no longer in the house (deleted in HA) are ignored when shown, so they never hide every device.
// Only the next user change rewrites the stored value.
export function activeFilters(f: ChartFilters, zoneIds: ReadonlySet<string>): ChartFilters {
  const zones = f.zones.filter((z) => zoneIds.has(z));
  return zones.length === f.zones.length ? f : { ...f, zones };
}
