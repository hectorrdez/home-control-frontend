import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import type { Widget } from "./widgets";
import {
  CATEGORIES,
  EMPTY_FILTERS,
  categoryOf,
  facetCounts,
  filterRows,
  isFiltered,
  normalize,
  UNASSIGNED_ZONE,
  type ChartFilters,
  type ChartRow,
} from "./widgetFilters";

const entity = (
  entityId: string,
  attributes: Record<string, unknown> = {},
  overrides: Partial<Entity> = {},
): Entity => ({
  entityId,
  domain: "sensor",
  name: entityId.split(".")[1].replace(/_/g, " "),
  state: "1",
  attributes,
  area: null,
  lastChanged: "2026-11-06T10:00:00.000Z",
  ...overrides,
});

const row = (
  e: Entity,
  opts: { visible?: boolean; label?: string; zoneId?: string; zoneName?: string } = {},
): ChartRow => {
  const widget: Widget = { id: `widget.${e.entityId}`, entityId: e.entityId, kind: "line", visible: opts.visible ?? true, order: 0 };
  return {
    widget,
    entity: e,
    label: opts.label ?? e.name,
    zoneId: opts.zoneId ?? e.area ?? UNASSIGNED_ZONE,
    zoneName: opts.zoneName ?? (e.area ? "Kitchen" : "Unassigned"),
  };
};

const filters = (patch: Partial<ChartFilters>): ChartFilters => ({ ...EMPTY_FILTERS, ...patch });

describe("categoryOf", () => {
  it.each([
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
  ])("maps device_class %s to %s", (deviceClass, expected) => {
    expect(categoryOf(entity("sensor.x", { device_class: deviceClass }))).toBe(expected);
  });

  it("lowercases the device_class before matching", () => {
    expect(categoryOf(entity("sensor.x", { device_class: "Temperature" }))).toBe("temperature");
  });

  it.each([
    ["°C", "temperature"],
    ["°F", "temperature"],
    ["K", "temperature"],
    ["ppm", "co2"],
    ["hPa", "pressure"],
    ["lx", "illuminance"],
    ["kW", "power"],
    ["kWh", "energy"],
    ["mV", "voltage"],
    ["mA", "current"],
    ["GHz", "frequency"],
    ["dBm", "signal"],
    ["Mbit/s", "data_rate"],
    ["ft³", "gas"],
    ["gal", "water"],
  ])("falls back to unit %s -> %s when there is no device_class", (unit, expected) => {
    expect(categoryOf(entity("sensor.x", { unit_of_measurement: unit }))).toBe(expected);
  });

  it("prefers device_class over unit", () => {
    expect(categoryOf(entity("sensor.x", { device_class: "humidity", unit_of_measurement: "°C" }))).toBe("humidity");
  });

  it("ignores a device_class that is not a string", () => {
    expect(categoryOf(entity("sensor.x", { device_class: 5, unit_of_measurement: "W" }))).toBe("power");
  });

  it("ignores a unit that is not a string", () => {
    expect(categoryOf(entity("sensor.x", { unit_of_measurement: 7 }))).toBe("other");
  });

  it("does not map % alone (humidity and battery need a device_class)", () => {
    expect(categoryOf(entity("sensor.x", { unit_of_measurement: "%" }))).toBe("other");
  });

  it("does not map µg/m³ without a device_class (ambiguous PM size)", () => {
    expect(categoryOf(entity("sensor.x", { unit_of_measurement: "µg/m³" }))).toBe("other");
  });

  it("maps unknown device classes and units to other", () => {
    expect(categoryOf(entity("sensor.x", { device_class: "timestamp", unit_of_measurement: "zz" }))).toBe("other");
    expect(categoryOf(entity("sensor.x"))).toBe("other");
  });

  it("does not resolve Object prototype keys to a category", () => {
    expect(categoryOf(entity("sensor.x", { device_class: "constructor" }))).toBe("other");
  });
});

describe("normalize", () => {
  it("lowercases, strips accents and trims", () => {
    expect(normalize("  Batería  ")).toBe("bateria");
    expect(normalize("TEMPERATURA")).toBe("temperatura");
  });
});

describe("isFiltered", () => {
  it("is false for the empty filters", () => {
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
  });

  it("is false for a whitespace-only query", () => {
    expect(isFiltered(filters({ query: "   " }))).toBe(false);
  });

  it("is true for each active field", () => {
    expect(isFiltered(filters({ query: "kit" }))).toBe(true);
    expect(isFiltered(filters({ zones: ["kitchen"] }))).toBe(true);
    expect(isFiltered(filters({ categories: ["power"] }))).toBe(true);
    expect(isFiltered(filters({ visibility: "on" }))).toBe(true);
    expect(isFiltered(filters({ visibility: "off" }))).toBe(true);
  });
});

describe("filterRows", () => {
  const kitchenTemp = row(entity("sensor.kitchen_temperature", { device_class: "temperature" }, { area: "kitchen" }), {
    label: "Temperatura cocina",
    zoneName: "Kitchen",
  });
  const bedHumidity = row(entity("sensor.bed_humidity", { device_class: "humidity" }, { area: "bedroom" }), {
    label: "Humedad dormitorio",
    zoneName: "Bedroom",
  });
  const office = row(entity("sensor.desk_power", { device_class: "power" }, { area: "office" }), {
    label: "Bateria enchufe",
    zoneName: "Office",
    visible: false,
  });
  const loose = row(entity("sensor.loose_co2", { device_class: "co2" }), { label: "CO2", zoneName: "Unassigned" });
  const rows = [kitchenTemp, bedHumidity, office, loose];

  it("returns every row in input order for empty filters", () => {
    expect(filterRows(rows, EMPTY_FILTERS)).toEqual(rows);
  });

  it("matches the alias label accent- and case-insensitively", () => {
    expect(filterRows(rows, filters({ query: "temperatura" }))).toEqual([kitchenTemp]);
    expect(filterRows(rows, filters({ query: "batería" }))).toEqual([office]);
  });

  it("matches the raw entity name, zone name and entityId", () => {
    expect(filterRows(rows, filters({ query: "bed humidity" }))).toEqual([bedHumidity]);
    expect(filterRows(rows, filters({ query: "office" }))).toEqual([office]);
    expect(filterRows(rows, filters({ query: "sensor.loose" }))).toEqual([loose]);
  });

  it("treats a whitespace-only query as empty", () => {
    expect(filterRows(rows, filters({ query: "  " }))).toEqual(rows);
  });

  it("ANDs groups and ORs values within a group", () => {
    expect(filterRows(rows, filters({ zones: ["kitchen", "office"] }))).toEqual([kitchenTemp, office]);
    expect(filterRows(rows, filters({ zones: ["kitchen"], categories: ["humidity"] }))).toEqual([]);
    expect(filterRows(rows, filters({ categories: ["humidity", "co2"] }))).toEqual([bedHumidity, loose]);
    expect(filterRows(rows, filters({ query: "sensor", zones: ["unassigned"] }))).toEqual([loose]);
  });

  it("filters by visibility", () => {
    expect(filterRows(rows, filters({ visibility: "on" }))).toEqual([kitchenTemp, bedHumidity, loose]);
    expect(filterRows(rows, filters({ visibility: "off" }))).toEqual([office]);
  });
});

describe("facetCounts", () => {
  const a = row(entity("sensor.a", { device_class: "temperature" }, { area: "kitchen" }), { zoneName: "Kitchen" });
  const b = row(entity("sensor.b", { device_class: "temperature" }, { area: "kitchen" }), { zoneName: "Kitchen" });
  const c = row(entity("sensor.c", { device_class: "power" }, { area: "bedroom" }), { zoneName: "Bedroom" });
  const d = row(entity("sensor.d", { device_class: "power" }), { zoneName: "Unassigned" });
  const e = row(entity("sensor.e", { device_class: "power" }, { area: "attic" }), { zoneName: "Attic" });

  it("counts zones and categories over all rows", () => {
    const facets = facetCounts([a, b, c, d]);
    expect(facets.zones).toEqual([
      { id: "bedroom", name: "Bedroom", count: 1 },
      { id: "kitchen", name: "Kitchen", count: 2 },
      { id: UNASSIGNED_ZONE, name: "Unassigned", count: 1 },
    ]);
    expect(facets.categories).toEqual([
      { id: "temperature", label: "TEMPERATURE", count: 2 },
      { id: "power", label: "POWER", count: 2 },
    ]);
  });

  it("sorts zones by name and puts unassigned last even when it sorts first", () => {
    const facets = facetCounts([d, e, c, a]);
    expect(facets.zones.map((z) => z.id)).toEqual(["attic", "bedroom", "kitchen", UNASSIGNED_ZONE]);
  });

  it("orders categories by CATEGORIES order and omits zero counts", () => {
    const facets = facetCounts([c, a]);
    expect(facets.categories.map((x) => x.id)).toEqual(["temperature", "power"]);
    expect(facets.categories.every((x) => x.count > 0)).toBe(true);
    expect(CATEGORIES.map((x) => x.id).indexOf("temperature")).toBeLessThan(CATEGORIES.map((x) => x.id).indexOf("power"));
  });

  it("returns empty facets for no rows", () => {
    expect(facetCounts([])).toEqual({ zones: [], categories: [] });
  });
});
