import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/api/types";
import {
  widgetsSetting,
  deriveWidgets,
  kindFor,
  loadWidgets,
  numericSensors,
  parseStoredWidgets,
  parseWidgets,
  reconcileWidgets,
  climateMetrics,
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
    expect(parseWidgets(valid)).toEqual([{ id: "w", entityId: "sensor.a", kind: "gauge", visible: false, order: 0, size: "third" }]);
  });
});

const CACHE_KEY = "hc.setting.telemetry.widgets";

describe("storage wrapper", () => {
  beforeEach(() => {
    window.localStorage.clear();
    widgetsSetting.forget();
    vi.restoreAllMocks();
  });

  it("round-trips a layout under the versioned key", () => {
    const widgets = deriveWidgets([temp]);
    saveWidgets(widgets);
    // Feature 146: the first save writes an explicit size (defaults are "third").
    const withSize = widgets.map((w) => ({ ...w, size: "third" }));
    expect(JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null").value).toEqual({ version: 1, widgets: withSize });
    expect(loadWidgets()).toEqual(withSize);
  });

  it("returns null when stored data is corrupt", () => {
    window.localStorage.setItem(CACHE_KEY, "garbage");
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

describe("size field (feature 146)", () => {
  const base: Widget = { id: "w", entityId: "sensor.a", kind: "line", visible: true, order: 0 };
  const layout = (widgets: unknown[]) => JSON.stringify({ version: 1, widgets });

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    widgetsSetting.forget();
  });

  it("migrates legacy wide: true to size half", () => {
    expect(parseWidgets(layout([{ ...base, wide: true }]))).toEqual([{ ...base, size: "half" }]);
  });

  it("migrates a widget without wide to size third", () => {
    expect(parseWidgets(layout([base]))).toEqual([{ ...base, size: "third" }]);
    expect(parseWidgets(layout([{ ...base, wide: false }]))).toEqual([{ ...base, size: "third" }]);
  });

  it("keeps a valid size and drops wide from the parsed result", () => {
    expect(parseWidgets(layout([{ ...base, size: "full", wide: true }]))).toEqual([{ ...base, size: "full" }]);
  });

  it.each(["full", "threeQuarters", "half", "third", "quarter"])("accepts size %s", (size) => {
    expect(parseWidgets(layout([{ ...base, size }]))).toEqual([{ ...base, size }]);
  });

  it("rejects an invalid size and the whole layout falls back", () => {
    expect(parseWidgets(layout([{ ...base, size: "huge" }]))).toBeNull();
    expect(parseWidgets(layout([{ ...base, size: 2 }]))).toBeNull();
    expect(parseWidgets(layout([{ ...base, size: null }]))).toBeNull();
  });

  it("rejects a non-boolean wide and the whole layout falls back", () => {
    expect(parseWidgets(layout([{ ...base, wide: "yes" }]))).toBeNull();
  });

  it("save output has size and never wide", () => {
    saveWidgets([{ ...base, wide: true }, { ...base, id: "x", entityId: "sensor.b" }]);
    const stored = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null").value;
    expect(stored.widgets).toEqual([
      { ...base, size: "half" },
      { ...base, id: "x", entityId: "sensor.b", size: "third" },
    ]);
    expect(stored.widgets.some((w: Record<string, unknown>) => "wide" in w)).toBe(false);
  });

  it("round-trips a size through storage", () => {
    const widgets: Widget[] = [{ ...base, size: "full" }];
    saveWidgets(widgets);
    expect(loadWidgets()).toEqual(widgets);
  });

  it("reconcileWidgets keeps saved size and kind for a sensor that is still present", () => {
    const saved: Widget[] = [
      { id: "widget.sensor.kitchen_humidity", entityId: "sensor.kitchen_humidity", kind: "gauge", visible: true, order: 0, size: "half" },
    ];
    const result = reconcileWidgets(saved, [humidity]);
    expect(result).toEqual([
      { id: "widget.sensor.kitchen_humidity", entityId: "sensor.kitchen_humidity", kind: "gauge", visible: true, order: 0, size: "half" },
    ]);
  });

  it("reconcileWidgets appends new sensors without a size (= third)", () => {
    const result = reconcileWidgets([], [humidity]);
    expect(result[0].size).toBeUndefined();
  });
});

describe("shared layout (feature 135)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    widgetsSetting.forget();
    vi.restoreAllMocks();
  });

  it("parses the v1 object and the legacy JSON string, rejects bad shapes", () => {
    const widgets = deriveWidgets([temp]);
    expect(parseStoredWidgets({ version: 1, widgets })?.widgets).toEqual(widgets.map((w) => ({ ...w, size: "third" })));
    expect(parseStoredWidgets(JSON.stringify({ version: 1, widgets }))?.widgets).toHaveLength(1);
    expect(parseStoredWidgets({ version: 2, widgets })).toBeNull();
    expect(parseStoredWidgets({ version: 1, widgets: [{ id: 1 }] })).toBeNull();
    expect(parseStoredWidgets("garbage")).toBeNull();
    expect(parseStoredWidgets(null)).toBeNull();
  });

  it("saveWidgets and loadWidgets delegate to the synced setting", () => {
    const set = vi.spyOn(widgetsSetting, "set");
    saveWidgets(deriveWidgets([temp]));
    expect(set).toHaveBeenCalledWith({ version: 1, widgets: expect.any(Array) });
    expect(loadWidgets()).toHaveLength(1);
  });

  it("reconcile-only differences never write the setting", () => {
    saveWidgets(deriveWidgets([temp]));
    const set = vi.spyOn(widgetsSetting, "set");
    reconcileWidgets(loadWidgets(), [temp, { ...temp, entityId: "sensor.new", attributes: temp.attributes, name: "New" }]);
    expect(set).not.toHaveBeenCalled();
  });
});

describe("climate cards (feature 159)", () => {
  const climateOpts = { metrics: ["temperature", "humidity"] as const };

  it("climateMetrics needs a numeric sensor of the metric", () => {
    const unavailable = { ...temp, entityId: "sensor.x", state: "unavailable" };
    expect(climateMetrics([temp, humidity, power])).toEqual(["temperature", "humidity"]);
    expect(climateMetrics([unavailable])).toEqual([]);
    expect(climateMetrics([power])).toEqual([]);
  });

  it("deriveWidgets puts the climate cards first, half wide and visible by default", () => {
    const widgets = deriveWidgets([temp, power], { metrics: [...climateOpts.metrics] });
    expect(widgets.slice(0, 2).map((w) => [w.id, w.kind, w.size, w.visible, w.order])).toEqual([
      ["climate:temperature", "area", "half", true, 0],
      ["climate:humidity", "area", "half", true, 1],
    ]);
    expect(widgets.slice(2).map((w) => w.order)).toEqual([2, 3]);
  });

  it("deriveWidgets honours hiddenByDefault for the climate cards only", () => {
    const widgets = deriveWidgets([temp], { metrics: ["temperature", "humidity"], hiddenByDefault: ["humidity"] });
    expect(widgets.find((w) => w.id === "climate:humidity")?.visible).toBe(false);
    expect(widgets.find((w) => w.id === "climate:temperature")?.visible).toBe(true);
  });

  it("reconcile keeps a saved climate card and its layout", () => {
    const saved: Widget[] = [
      { id: "climate:humidity", entityId: "climate:humidity", kind: "area", visible: false, order: 0, size: "full" },
      { id: "climate:temperature", entityId: "climate:temperature", kind: "area", visible: true, order: 1, size: "half" },
      { id: "widget.sensor.kitchen_temp", entityId: "sensor.kitchen_temp", kind: "area", visible: true, order: 2 },
    ];
    const result = reconcileWidgets(saved, [temp], { metrics: ["temperature", "humidity"] });
    expect(result.map((w) => [w.id, w.visible, w.size, w.order])).toEqual([
      ["climate:humidity", false, "full", 0],
      ["climate:temperature", true, "half", 1],
      ["widget.sensor.kitchen_temp", true, undefined, 2],
    ]);
  });

  it("reconcile drops a saved climate card when the house no longer has that metric", () => {
    const saved: Widget[] = [
      { id: "climate:humidity", entityId: "climate:humidity", kind: "area", visible: true, order: 0, size: "half" },
      { id: "widget.sensor.kitchen_temp", entityId: "sensor.kitchen_temp", kind: "area", visible: true, order: 1 },
    ];
    const result = reconcileWidgets(saved, [temp], { metrics: ["temperature"] });
    // humidity is dropped; temperature (present, not saved) is prepended.
    expect(result.map((w) => w.id)).toEqual(["climate:temperature", "widget.sensor.kitchen_temp"]);
  });

  it("a legacy layout without climate cards gets both prepended, half, with the migrated hidden flag", () => {
    const legacy: Widget[] = [{ id: "widget.sensor.kitchen_temp", entityId: "sensor.kitchen_temp", kind: "area", visible: true, order: 0 }];
    const result = reconcileWidgets(legacy, [temp], { metrics: ["temperature", "humidity"], hiddenByDefault: ["humidity"] });
    expect(result.map((w) => [w.id, w.visible, w.size, w.order])).toEqual([
      ["climate:temperature", true, "half", 0],
      ["climate:humidity", false, "half", 1],
      ["widget.sensor.kitchen_temp", true, undefined, 2],
    ]);
  });

  it("reconcile without climate metrics leaves the sensor-only behaviour unchanged", () => {
    expect(reconcileWidgets(null, [temp])).toEqual(deriveWidgets([temp]));
  });
});
