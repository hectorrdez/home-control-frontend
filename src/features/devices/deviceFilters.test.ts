import { describe, expect, it } from "vitest";
import type { Area, Entity } from "@/api/types";
import { createFixtureEntities, FIXTURE_AREAS } from "@/api/mock/fixtures";
import { entitiesReducer, initialEntitiesState, UNASSIGNED, type EntitiesState } from "@/state/entities";
import {
  EMPTY_DEVICE_FILTERS,
  buildDeviceRows,
  deviceFacets,
  filterDeviceRows,
  isFiltered,
  type DeviceFilters,
  type DeviceRow,
} from "./deviceFilters";

// The mock house (26 entities; 9 interactive, 17 read-only) grouped the way the store groups it.
function stateOf(entities: Entity[]): EntitiesState {
  const areas: Area[] = FIXTURE_AREAS.map((a) => ({
    areaId: a.areaId,
    name: a.name,
    entities: entities.filter((e) => e.area === a.areaId),
  }));
  areas.push({ areaId: UNASSIGNED, name: "Unassigned", entities: entities.filter((e) => e.area === null) });
  return entitiesReducer(initialEntitiesState, { type: "loaded", areas });
}

const plainLabel = (entity: Entity) => (entity.entityId === "sensor.entry_motion_battery" ? "Batería" : entity.name);

function rows(): DeviceRow[] {
  return buildDeviceRows(stateOf(createFixtureEntities()), plainLabel);
}

const filter = (patch: Partial<DeviceFilters>) => filterDeviceRows(rows(), { ...EMPTY_DEVICE_FILTERS, ...patch });
const ids = (list: DeviceRow[]) => list.map((r) => r.entity.entityId);

describe("buildDeviceRows", () => {
  it("lists all 26 mock entities, areas in state order with Unassigned last", () => {
    const all = rows();
    expect(all).toHaveLength(26);
    const areaSequence = [...new Set(all.map((r) => r.areaId))];
    expect(areaSequence).toEqual(["living_room", "kitchen", "bedroom", "office", UNASSIGNED]);
    expect(all.find((r) => r.areaId === UNASSIGNED)?.areaName).toBe("Unassigned");
  });

  it("marks interactive rows from isInteractive", () => {
    expect(rows().filter((r) => r.interactive)).toHaveLength(9);
  });
});

describe("filterDeviceRows", () => {
  it("empty filters keep all rows in their order", () => {
    const all = rows();
    expect(ids(filterDeviceRows(all, EMPTY_DEVICE_FILTERS))).toEqual(ids(all));
    expect(isFiltered(EMPTY_DEVICE_FILTERS)).toBe(false);
  });

  it("matches the query on label, raw name, area name and entity id, ignoring case and accents", () => {
    expect(filter({ query: "ceiling" })).toHaveLength(2);
    expect(filter({ query: "CEILING" })).toHaveLength(2);
    expect(filter({ query: "desk" })).toHaveLength(3);
    expect(ids(filter({ query: "lock.front" }))).toEqual(["lock.front_door"]);
    expect(filter({ query: "master suite" })).toHaveLength(4);
    expect(filter({ query: "bateria" }).map((r) => r.label)).toEqual(["Batería"]);
    expect(filter({ query: "  " })).toHaveLength(26);
  });

  it("filters by kind", () => {
    expect(filter({ kind: "interactive" })).toHaveLength(9);
    expect(filter({ kind: "readonly" })).toHaveLength(17);
  });

  it("combines groups with AND and values inside a group with OR", () => {
    expect(filter({ areas: ["kitchen"], domains: ["light"] })).toHaveLength(1);
    expect(filter({ domains: ["light", "lock"] })).toHaveLength(5);
    expect(filter({ areas: ["kitchen", "office"] })).toHaveLength(8);
  });

  it("reports a filter as active only when a group or the query is set", () => {
    expect(isFiltered({ ...EMPTY_DEVICE_FILTERS, query: "x" })).toBe(true);
    expect(isFiltered({ ...EMPTY_DEVICE_FILTERS, kind: "readonly" })).toBe(true);
    expect(isFiltered({ ...EMPTY_DEVICE_FILTERS, domains: ["light"] })).toBe(true);
  });
});

describe("deviceFacets", () => {
  it("counts areas, Unassigned last", () => {
    const { areas } = deviceFacets(rows());
    expect(areas.map((a) => [a.id, a.count])).toEqual([
      ["living_room", 4],
      ["kitchen", 3],
      ["bedroom", 4],
      ["office", 5],
      [UNASSIGNED, 10],
    ]);
  });

  it("counts domains with uppercase spaced labels that sum to 26", () => {
    const { domains } = deviceFacets(rows());
    expect(domains.reduce((n, d) => n + d.count, 0)).toBe(26);
    expect(domains.find((d) => d.label === "BINARY SENSOR")?.count).toBe(1);
    expect(domains.map((d) => d.label)).toEqual([...domains.map((d) => d.label)].sort((a, b) => a.localeCompare(b)));
  });

  it("is computed over all rows, so it does not change with filters", () => {
    const all = rows();
    const before = deviceFacets(all);
    filterDeviceRows(all, { ...EMPTY_DEVICE_FILTERS, kind: "interactive", query: "desk" });
    expect(deviceFacets(all)).toEqual(before);
  });
});
