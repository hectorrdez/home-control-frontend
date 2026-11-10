import type { Entity } from "@/api/types";
import { UNASSIGNED, type AreaGroup, type EntitiesState } from "./entities";
import { isUnavailable } from "./availability";

export type DomainGroup = "lights" | "climate" | "security" | "plugs" | "other";
// Filter pills in display order (ALL is added by the panel). "other" has no pill.
export const DOMAIN_GROUPS = ["lights", "climate", "security", "plugs"] as const;
export type PillGroup = (typeof DOMAIN_GROUPS)[number];
export type DomainFilter = "all" | PillGroup;

const GROUP_RANK: Record<DomainGroup, number> = { lights: 0, climate: 1, security: 2, plugs: 3, other: 4 };

const ACTUATOR_DOMAINS = new Set(["light", "switch", "climate", "cover", "fan", "lock"]);
const SECURITY_SENSOR_CLASSES = new Set(["motion", "door", "window"]);
const CLIMATE_SENSOR_CLASSES = new Set(["temperature", "humidity"]);

const deviceClass = (e: Entity) => (typeof e.attributes.device_class === "string" ? e.attributes.device_class : "");

// A power sensor belongs to a plug when a switch in the same area has a name it starts with
// (e.g. switch "Desk outlet" + sensor "Desk outlet power").
export function plugPowerSensorIds(entities: Entity[]): Set<string> {
  const switches = entities.filter((e) => e.domain === "switch");
  const ids = new Set<string>();
  for (const sensor of entities) {
    if (sensor.domain !== "sensor" || deviceClass(sensor) !== "power") continue;
    const name = sensor.name.toLowerCase();
    const linked = switches.some(
      (sw) => sw.area === sensor.area && sw.area !== null && name.startsWith(sw.name.toLowerCase()),
    );
    if (linked) ids.add(sensor.entityId);
  }
  return ids;
}

export function domainGroupOf(entity: Entity, plugSensors: Set<string>): DomainGroup {
  if (entity.domain === "light") return "lights";
  if (entity.domain === "climate") return "climate";
  if (entity.domain === "sensor" && CLIMATE_SENSOR_CLASSES.has(deviceClass(entity))) return "climate";
  if (entity.domain === "lock" || entity.domain === "alarm_control_panel") return "security";
  if (entity.domain === "binary_sensor" && SECURITY_SENSOR_CLASSES.has(deviceClass(entity))) return "security";
  if (entity.domain === "switch" || plugSensors.has(entity.entityId)) return "plugs";
  return "other";
}

export { isUnavailable, UNKNOWN_STATE_DOMAINS } from "./availability";

// Domains with a control in DeviceControls.tsx: keep the two in sync.
export const INTERACTIVE_DOMAINS = new Set(["light", "switch", "fan", "climate", "cover", "lock", "scene", "script"]);

// Domain only: availability is handled by isUnavailable, device_class is not read.
export function isInteractive(entity: Entity): boolean {
  return INTERACTIVE_DOMAINS.has(entity.domain);
}

export function allEntities(state: EntitiesState): Entity[] {
  return Object.values(state.entities);
}

// Counts for ALL and each group, over the interactive entities in the house (the tiles shown, unavailable included).
export function groupCounts(state: EntitiesState): Record<DomainFilter, number> {
  const all = allEntities(state).filter(isInteractive);
  const plugs = plugPowerSensorIds(allEntities(state));
  const counts: Record<DomainFilter, number> = { all: all.length, lights: 0, climate: 0, security: 0, plugs: 0 };
  for (const e of all) {
    const group = domainGroupOf(e, plugs);
    if (group !== "other") counts[group] += 1;
  }
  return counts;
}

export interface DeckSection {
  area: AreaGroup;
  entities: Entity[];
}

// Deck = areas in API order, each area's entities filtered by group, ordered by group rank then name.
export function deckSections(
  state: EntitiesState,
  selectedArea: string | null,
  filter: DomainFilter,
): DeckSection[] {
  const plugs = plugPowerSensorIds(allEntities(state));
  const sections: DeckSection[] = [];
  for (const area of state.areas) {
    if (selectedArea !== null && area.areaId !== selectedArea) continue;
    const entities = area.entityIds
      .map((id) => state.entities[id])
      // Unavailable devices stay in the deck (grey tile, feature 155); only read-only entities are left out.
      .filter((e): e is Entity => e !== undefined && isInteractive(e))
      .filter((e) => filter === "all" || domainGroupOf(e, plugs) === filter)
      .sort((a, b) => {
        const rank = GROUP_RANK[domainGroupOf(a, plugs)] - GROUP_RANK[domainGroupOf(b, plugs)];
        return rank !== 0 ? rank : a.name.localeCompare(b.name);
      });
    if (entities.length > 0 || selectedArea !== null) sections.push({ area, entities });
  }
  return sections;
}

export interface PowerLoad {
  watts: number;
}

// House total when a power sensor is named house/total, else the sum of power sensors. null when none.
export function houseLoad(entities: Entity[]): PowerLoad | null {
  const power = entities.filter((e) => e.domain === "sensor" && deviceClass(e) === "power");
  const numeric = (e: Entity) => {
    const n = Number(e.state);
    return Number.isFinite(n) ? n : null;
  };
  const named = power.find((e) => /house|total/i.test(e.name) && numeric(e) !== null);
  if (named) return { watts: numeric(named)! };
  const values = power.map(numeric).filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  return { watts: values.reduce((sum, n) => sum + n, 0) };
}

// DESIGN.md: power W below 1000, kW with two decimals from 1000.
export function formatPower(watts: number): string {
  return watts < 1000 ? `${Math.round(watts)} W` : `${(watts / 1000).toFixed(2)} kW`;
}

export interface SystemSummary {
  unavailable: number;
  zones: number;
  actuators: number;
  load: PowerLoad | null;
}

export function summarize(state: EntitiesState): SystemSummary {
  const all = allEntities(state);
  return {
    unavailable: all.filter(isUnavailable).length,
    zones: state.areas.filter((a) => a.areaId !== UNASSIGNED && a.entityIds.length > 0).length,
    actuators: all.filter((e) => ACTUATOR_DOMAINS.has(e.domain)).length,
    load: houseLoad(all),
  };
}

// Feature 104: switch id -> linked plug power sensor (same rule as plugPowerSensorIds), for "DRAW METRIC".
export function plugDrawBySwitch(entities: Entity[]): Map<string, Entity> {
  const sensors = entities.filter((e) => e.domain === "sensor" && deviceClass(e) === "power");
  const map = new Map<string, Entity>();
  for (const sw of entities) {
    if (sw.domain !== "switch" || sw.area === null) continue;
    const linked = sensors.find(
      (sensor) => sensor.area === sw.area && sensor.name.toLowerCase().startsWith(sw.name.toLowerCase()),
    );
    if (linked) map.set(sw.entityId, linked);
  }
  return map;
}
