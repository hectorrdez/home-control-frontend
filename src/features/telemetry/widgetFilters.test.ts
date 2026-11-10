import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import type { Widget } from "./widgets";
import {
  EMPTY_FILTERS,
  buildDeviceRows,
  categoryOf,
  facetCounts,
  filterDevices,
  isFiltered,
  kindsOf,
  normalize,
  parseStoredFilters,
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
  opts: { visible?: boolean; label?: string; deviceName?: string; zoneId?: string; zoneName?: string } = {},
): ChartRow => {
  const widget: Widget = { id: `widget.${e.entityId}`, entityId: e.entityId, kind: "line", visible: opts.visible ?? true, order: 0 };
  return {
    widget,
    entity: e,
    label: opts.label ?? e.name,
    deviceName: opts.deviceName ?? "",
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
    expect(isFiltered(filters({ kinds: ["sensor"] }))).toBe(true);
    expect(isFiltered(filters({ visibility: "added" }))).toBe(true);
    expect(isFiltered(filters({ visibility: "notAdded" }))).toBe(true);
  });
});

// Two devices, one light: kitchen thermostat (temp + humidity, added), bedroom plug (power + battery, one field shown),
// office lamp (light only, has no chart so it is not a device row), loose co2 sensor (standalone).
const kTemp = entity("sensor.kitchen_temperature", { device_class: "temperature" }, { area: "kitchen", deviceName: "Thermo" });
const kHum = entity("sensor.kitchen_humidity", { device_class: "humidity" }, { area: "kitchen", deviceName: "Thermo" });
const bPower = entity("sensor.bed_plug_power", { device_class: "power" }, { area: "bedroom", deviceName: "Plug" });
const bBattery = entity("sensor.bed_plug_battery", { device_class: "battery" }, { area: "bedroom", deviceName: "Plug" });
const bSwitch = entity("switch.bed_plug", {}, { domain: "switch", area: "bedroom", deviceName: "Plug" });
const lamp = entity("light.office_lamp", {}, { domain: "light", area: "office" });
const loopCo2 = entity("sensor.loose_co2", { device_class: "co2" });

const chartRows: ChartRow[] = [
  row(kTemp, { zoneName: "Kitchen", deviceName: "Thermo", label: "Temperature", visible: false }),
  row(kHum, { zoneName: "Kitchen", deviceName: "Thermo", label: "Humidity", visible: false }),
  row(bPower, { zoneName: "Bedroom", deviceName: "Plug", label: "Power", visible: true }),
  row(bBattery, { zoneName: "Bedroom", deviceName: "Plug", label: "Battery", visible: false }),
  row(loopCo2, { zoneName: "Unassigned", label: "CO2", visible: false }),
];
const allEntities = [kTemp, kHum, bPower, bBattery, bSwitch, lamp, loopCo2];
const devices = buildDeviceRows(chartRows, allEntities);
const byName = (name: string) => devices.find((d) => d.name === name)!;

describe("kindsOf", () => {
  it("is sensor for a measurement field, actuator for a controllable member, both for a smart plug", () => {
    expect([...kindsOf([chartRows[2]], [])]).toEqual(["sensor"]);
    expect([...kindsOf([], [lamp])]).toEqual(["actuator"]);
    expect([...kindsOf([chartRows[2]], [bSwitch])].sort()).toEqual(["actuator", "sensor"]);
  });

  it("is other when there is no measurement field and no controllable member", () => {
    expect([...kindsOf([chartRows[3]], [bBattery])]).toEqual(["other"]);
  });
});

describe("buildDeviceRows", () => {
  it("groups fields by device key and keeps the first-seen order", () => {
    expect(devices.map((d) => d.name)).toEqual(["Thermo", "Plug", "CO2"]);
    expect(byName("Thermo").fields.map((f) => f.entity.entityId)).toEqual([kTemp.entityId, kHum.entityId]);
  });

  it("takes the zone from the device and counts visible fields", () => {
    expect(byName("Thermo").zoneId).toBe("kitchen");
    expect(byName("Thermo").zoneName).toBe("Kitchen");
    expect(byName("Thermo").addedCount).toBe(0);
    expect(byName("Thermo").added).toBe(false);
    expect(byName("Plug").addedCount).toBe(1);
    expect(byName("Plug").added).toBe(true);
  });

  it("collects every member entity id, including controllable ones", () => {
    expect(byName("Plug").entityIds.sort()).toEqual([bBattery.entityId, bPower.entityId, bSwitch.entityId].sort());
  });

  it("falls back to the field label for a standalone entity", () => {
    expect(byName("CO2").kinds).toEqual(new Set(["sensor"]));
    expect(byName("CO2").added).toBe(false);
  });

  it("gives each device its kinds from members and fields", () => {
    expect(byName("Plug").kinds).toEqual(new Set(["sensor", "actuator"]));
    expect(byName("Thermo").kinds).toEqual(new Set(["sensor"]));
  });
});

describe("filterDevices", () => {
  const names = (f: Partial<ChartFilters>) => filterDevices(devices, filters(f)).map((d) => d.name);

  it("returns every device in input order for empty filters", () => {
    expect(names({})).toEqual(["Thermo", "Plug", "CO2"]);
  });

  it("matches the device name, field labels, zone name and entityIds, accent- and case-insensitively", () => {
    expect(names({ query: "THERMO" })).toEqual(["Thermo"]);
    expect(names({ query: "humidity" })).toEqual(["Thermo"]);
    expect(names({ query: "kitchen" })).toEqual(["Thermo"]);
    expect(names({ query: "switch.bed_plug" })).toEqual(["Plug"]);
    expect(names({ query: "zzz" })).toEqual([]);
  });

  it("ANDs groups and ORs values within a group", () => {
    expect(names({ zones: ["kitchen", "bedroom"] })).toEqual(["Thermo", "Plug"]);
    expect(names({ zones: ["kitchen"], categories: ["power"] })).toEqual([]);
    expect(names({ categories: ["humidity", "co2"] })).toEqual(["Thermo", "CO2"]);
    expect(names({ query: "sensor", zones: ["unassigned"] })).toEqual(["CO2"]);
  });

  it("passes a device when ANY of its fields has the category", () => {
    expect(names({ categories: ["battery"] })).toEqual(["Plug"]);
  });

  it("filters by kind, multi-select with OR", () => {
    expect(names({ kinds: ["actuator"] })).toEqual(["Plug"]);
    expect(names({ kinds: ["sensor"] })).toEqual(["Thermo", "Plug", "CO2"]);
    expect(names({ kinds: ["other"] })).toEqual([]);
    expect(names({ kinds: ["actuator", "other"] })).toEqual(["Plug"]);
  });

  it("filters by status", () => {
    expect(names({ visibility: "added" })).toEqual(["Plug"]);
    expect(names({ visibility: "notAdded" })).toEqual(["Thermo", "CO2"]);
  });
});

describe("facetCounts", () => {
  it("counts zones and categories per device", () => {
    const facets = facetCounts(devices);
    expect(facets.zones).toEqual([
      { id: "bedroom", name: "Bedroom", count: 1 },
      { id: "kitchen", name: "Kitchen", count: 1 },
      { id: UNASSIGNED_ZONE, name: "Unassigned", count: 1 },
    ]);
    expect(facets.categories).toEqual([
      { id: "temperature", label: "TEMPERATURE", count: 1 },
      { id: "humidity", label: "HUMIDITY", count: 1 },
      { id: "co2", label: "CO2", count: 1 },
      { id: "power", label: "POWER", count: 1 },
      { id: "battery", label: "BATTERY", count: 1 },
    ]);
  });

  it("counts kinds per device and omits zero counts", () => {
    expect(facetCounts(devices).kinds).toEqual([
      { id: "sensor", label: "SENSOR", count: 3 },
      { id: "actuator", label: "ACTUATOR", count: 1 },
    ]);
  });

  it("sorts zones by name and puts unassigned last even when it sorts first", () => {
    const attic = buildDeviceRows([row(entity("sensor.e", { device_class: "power" }, { area: "attic" }), { zoneName: "Attic" })], []);
    const facets = facetCounts([...attic, ...devices]);
    expect(facets.zones.map((z) => z.id)).toEqual(["attic", "bedroom", "kitchen", UNASSIGNED_ZONE]);
  });

  it("returns empty facets for no devices", () => {
    expect(facetCounts([])).toEqual({ zones: [], categories: [], kinds: [] });
  });
});

describe("stored filters", () => {
  it("reads the legacy visibility values as added / notAdded and defaults kinds to []", () => {
    expect(parseStoredFilters({ v: 1, query: "", zones: [], categories: [], visibility: "on" })).toEqual({
      v: 1,
      query: "",
      zones: [],
      categories: [],
      kinds: [],
      visibility: "added",
    });
    expect(parseStoredFilters({ v: 1, query: "", zones: [], categories: [], visibility: "off" })?.visibility).toBe("notAdded");
  });

  it("drops unknown kinds and rejects an unknown visibility", () => {
    expect(parseStoredFilters({ v: 1, query: "", zones: [], categories: [], kinds: ["sensor", "x"], visibility: "all" })?.kinds).toEqual(["sensor"]);
    expect(parseStoredFilters({ v: 1, query: "", zones: [], categories: [], visibility: "maybe" })).toBeNull();
  });
});
