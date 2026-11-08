import type { Entity } from "@/api/types";
import { createSyncedSetting, registerSyncedSetting, type SyncedSetting } from "@/features/settings/syncedSetting";
import type { Widget } from "./widgets";

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

export type Visibility = "all" | "on" | "off";

export interface ChartFilters {
  query: string;
  zones: string[];
  categories: ChartCategory[];
  visibility: Visibility;
}

export const EMPTY_FILTERS: ChartFilters = { query: "", zones: [], categories: [], visibility: "all" };

export function isFiltered(f: ChartFilters): boolean {
  return f.query.trim() !== "" || f.zones.length > 0 || f.categories.length > 0 || f.visibility !== "all";
}

// Case- and accent-insensitive: "batería" matches "Bateria".
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

// Groups combine with AND; values inside a group combine with OR. Input order is preserved.
export function filterRows(rows: ChartRow[], f: ChartFilters): ChartRow[] {
  const q = normalize(f.query);
  return rows.filter((r) => {
    if (q && ![r.label, r.entity.name, r.deviceName, r.zoneName, r.entity.entityId].some((t) => normalize(t).includes(q))) return false;
    if (f.zones.length > 0 && !f.zones.includes(r.zoneId)) return false;
    if (f.categories.length > 0 && !f.categories.includes(categoryOf(r.entity))) return false;
    if (f.visibility === "on" && !r.widget.visible) return false;
    if (f.visibility === "off" && r.widget.visible) return false;
    return true;
  });
}

export interface FacetCounts {
  zones: { id: string; name: string; count: number }[];
  categories: { id: ChartCategory; label: string; count: number }[];
}

// Counts over ALL rows (static, not the filtered set). Zero-count entries are omitted.
export function facetCounts(rows: ChartRow[]): FacetCounts {
  const zones = new Map<string, { id: string; name: string; count: number }>();
  const cats = new Map<ChartCategory, number>();
  for (const r of rows) {
    const zone = zones.get(r.zoneId);
    if (zone) zone.count += 1;
    else zones.set(r.zoneId, { id: r.zoneId, name: r.zoneName, count: 1 });
    const cat = categoryOf(r.entity);
    cats.set(cat, (cats.get(cat) ?? 0) + 1);
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
  return { zones: zoneList, categories };
}

// Feature 137: the filters are a shared setting (telemetry.filters, 134). Stored value v1; the store debounces the PUT.
export const FILTERS_QUERY_MAX = 100;
export const FILTERS_ZONES_MAX = 50;
const VISIBILITIES: readonly Visibility[] = ["all", "on", "off"];
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

export interface StoredFilters {
  v: 1;
  query: string;
  zones: string[];
  categories: ChartCategory[];
  visibility: Visibility;
}

// Unknown categories are dropped; any other bad field makes the whole value invalid (null -> defaults).
export function parseStoredFilters(raw: unknown): StoredFilters | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { v, query, zones, categories, visibility } = raw as Record<string, unknown>;
  if (v !== 1 || typeof query !== "string" || query.length > FILTERS_QUERY_MAX) return null;
  if (!Array.isArray(zones) || zones.length > FILTERS_ZONES_MAX || !zones.every((z) => typeof z === "string")) return null;
  if (!Array.isArray(categories)) return null;
  if (!VISIBILITIES.includes(visibility as Visibility)) return null;
  return {
    v: 1,
    query,
    zones,
    categories: categories.filter((c): c is ChartCategory => typeof c === "string" && CATEGORY_IDS.has(c)),
    visibility: visibility as Visibility,
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
    visibility: f.visibility,
  };
}

export function fromStoredFilters(stored: StoredFilters | null): ChartFilters {
  if (!stored) return EMPTY_FILTERS;
  return { query: stored.query, zones: stored.zones, categories: stored.categories, visibility: stored.visibility };
}

// Zone ids no longer in the house (deleted in HA) are ignored when shown, so they never hide every chart.
// Only the next user change rewrites the stored value.
export function activeFilters(f: ChartFilters, zoneIds: ReadonlySet<string>): ChartFilters {
  const zones = f.zones.filter((z) => zoneIds.has(z));
  return zones.length === f.zones.length ? f : { ...f, zones };
}
