import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/api/types";
import {
  WIDGET_STORAGE_KEY,
  deriveWidgets,
  kindFor,
  loadWidgets,
  numericSensors,
  parseWidgets,
  reconcileWidgets,
  saveWidgets,
  type Widget,
} from "./widgets";

function entity(id: string, attributes: Record<string, unknown>, area: string | null = null, name = id): Entity {
  return { entityId: id, domain: id.split(".")[0], name, state: "1", attributes, area, lastChanged: "2026-11-06T08:00:00.000Z" };
}

const temp = entity("sensor.kitchen_temp", { device_class: "temperature", unit_of_measurement: "°C" }, "kitchen", "Kitchen temp");
const humidity = entity("sensor.kitchen_humidity", { device_class: "humidity", unit_of_measurement: "%" }, "kitchen", "Kitchen humidity");
const power = entity("sensor.house_power", { device_class: "power", unit_of_measurement: "W" }, null, "House power");
const energy = entity("sensor.energy_today", { device_class: "energy", unit_of_measurement: "kWh" }, null, "Energy today");
const motion = entity("binary_sensor.entry_motion", { device_class: "motion" }, null, "Entry motion");
const light = entity("light.desk", {}, "office", "Desk");

describe("numericSensors", () => {
  it("keeps numeric sensors and drops binary sensors and actuators", () => {
    expect(numericSensors([temp, motion, light, power]).map((e) => e.entityId)).toEqual([
      "sensor.kitchen_temp",
      "sensor.house_power",
    ]);
  });

  it("accepts a sensor with state_class measurement even without a numeric device class", () => {
    const custom = entity("sensor.custom", { state_class: "measurement" });
    expect(numericSensors([custom]).map((e) => e.entityId)).toEqual(["sensor.custom"]);
  });
});

describe("kindFor", () => {
  it("picks the chart kind from the device class and unit", () => {
    expect(kindFor(humidity)).toBe("gauge");
    expect(kindFor(energy)).toBe("bar");
    expect(kindFor(temp)).toBe("area");
    expect(kindFor(power)).toBe("line");
  });
});

describe("deriveWidgets", () => {
  it("creates one visible widget per numeric sensor, ordered by area then name", () => {
    const widgets = deriveWidgets([power, energy, humidity, temp]);
    expect(widgets.map((w) => w.entityId)).toEqual([
      "sensor.energy_today",
      "sensor.house_power",
      "sensor.kitchen_humidity",
      "sensor.kitchen_temp",
    ]);
    expect(widgets.every((w) => w.visible)).toBe(true);
    expect(widgets.map((w) => w.order)).toEqual([0, 1, 2, 3]);
  });
});

describe("reconcileWidgets", () => {
  it("uses the defaults when there is no saved layout", () => {
    expect(reconcileWidgets(null, [temp])).toEqual(deriveWidgets([temp]));
  });

  it("keeps saved visibility and order, drops removed sensors, appends new ones visible", () => {
    const saved: Widget[] = [
      { id: "widget.sensor.house_power", entityId: "sensor.house_power", kind: "line", visible: false, order: 0 },
      { id: "widget.sensor.gone", entityId: "sensor.gone", kind: "line", visible: true, order: 1 },
      { id: "widget.sensor.kitchen_temp", entityId: "sensor.kitchen_temp", kind: "area", visible: true, order: 2 },
    ];
    const result = reconcileWidgets(saved, [temp, power, energy]);
    expect(result.map((w) => w.entityId)).toEqual(["sensor.house_power", "sensor.kitchen_temp", "sensor.energy_today"]);
    expect(result[0].visible).toBe(false);
    expect(result[2].visible).toBe(true);
    expect(result.map((w) => w.order)).toEqual([0, 1, 2]);
  });
});

describe("parseWidgets", () => {
  const valid = JSON.stringify({
    version: 1,
    widgets: [{ id: "w", entityId: "sensor.a", kind: "gauge", visible: false, order: 0 }],
  });

  it("returns null for missing, corrupt, unknown-version or malformed data", () => {
    expect(parseWidgets(null)).toBeNull();
    expect(parseWidgets("{not json")).toBeNull();
    expect(parseWidgets(JSON.stringify({ version: 2, widgets: [] }))).toBeNull();
    expect(parseWidgets(JSON.stringify({ version: 1, widgets: [{ id: "w", kind: "pie" }] }))).toBeNull();
  });

  it("returns the widgets for a valid payload", () => {
    expect(parseWidgets(valid)).toEqual([{ id: "w", entityId: "sensor.a", kind: "gauge", visible: false, order: 0 }]);
  });
});

describe("storage wrapper", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips a layout under the versioned key", () => {
    const widgets = deriveWidgets([temp]);
    saveWidgets(widgets);
    expect(JSON.parse(window.localStorage.getItem(WIDGET_STORAGE_KEY) ?? "null")).toEqual({ version: 1, widgets });
    expect(loadWidgets()).toEqual(widgets);
  });

  it("returns null when stored data is corrupt", () => {
    window.localStorage.setItem(WIDGET_STORAGE_KEY, "garbage");
    expect(loadWidgets()).toBeNull();
  });

  it("does not throw when storage access fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadWidgets()).toBeNull();
    expect(() => saveWidgets(deriveWidgets([temp]))).not.toThrow();
  });
});

describe("wide field (feature 114)", () => {
  const base: Widget = { id: "w", entityId: "sensor.a", kind: "line", visible: true, order: 0 };

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("accepts a widget without wide and one with a boolean wide", () => {
    expect(parseWidgets(JSON.stringify({ version: 1, widgets: [base] }))).toEqual([base]);
    const wide = { ...base, wide: true };
    expect(parseWidgets(JSON.stringify({ version: 1, widgets: [wide] }))).toEqual([wide]);
  });

  it("rejects a non-boolean wide and the whole layout falls back", () => {
    expect(parseWidgets(JSON.stringify({ version: 1, widgets: [{ ...base, wide: "yes" }] }))).toBeNull();
  });

  it("round-trips wide: true through storage", () => {
    const widgets: Widget[] = [{ ...base, wide: true }];
    saveWidgets(widgets);
    expect(loadWidgets()).toEqual(widgets);
  });

  it("reconcileWidgets keeps saved wide and kind for a sensor that is still present", () => {
    const saved: Widget[] = [
      { id: "widget.sensor.kitchen_humidity", entityId: "sensor.kitchen_humidity", kind: "gauge", visible: true, order: 0, wide: true },
    ];
    const result = reconcileWidgets(saved, [humidity]);
    expect(result).toEqual([
      { id: "widget.sensor.kitchen_humidity", entityId: "sensor.kitchen_humidity", kind: "gauge", visible: true, order: 0, wide: true },
    ]);
  });
});
