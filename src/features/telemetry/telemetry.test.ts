import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { airGrade, climateStats, gaugeHue, nodeHealth, ringGauges, solarPower } from "./telemetry";

function sensor(id: string, state: string, attributes: Record<string, unknown>, name = id, area: string | null = null): Entity {
  return { entityId: id, domain: id.split(".")[0], name, state, attributes, area, lastChanged: "2026-11-06T08:00:00.000Z" };
}

const roomName = (e: Entity) => (e.area === "kitchen" ? "Kitchen" : e.area === "office" ? "Office" : "Unassigned");

describe("climateStats", () => {
  it("averages temperature sensors and names the rooms of min and max", () => {
    const entities = [
      sensor("sensor.a", "20", { device_class: "temperature" }, "A", "kitchen"),
      sensor("sensor.b", "24", { device_class: "temperature" }, "B", "office"),
    ];
    const stats = climateStats(entities, roomName)!;
    expect(stats.mean).toBe(22);
    expect(stats.min).toEqual({ value: 20, room: "Kitchen" });
    expect(stats.max).toEqual({ value: 24, room: "Office" });
  });

  it("ignores unavailable readings and returns null without temperature sensors", () => {
    const entities = [sensor("sensor.a", "unavailable", { device_class: "temperature" })];
    expect(climateStats(entities, roomName)).toBeNull();
  });
});

describe("airGrade", () => {
  it("grades CO2 by the 800 and 1200 ppm thresholds", () => {
    expect(airGrade(799).grade).toBe("GOOD");
    expect(airGrade(800).grade).toBe("FAIR");
    expect(airGrade(1199).grade).toBe("FAIR");
    expect(airGrade(1200)).toEqual({ grade: "POOR", tone: "error" });
  });
});

describe("nodeHealth", () => {
  it("counts entities not in unavailable state", () => {
    const entities = [
      sensor("sensor.a", "1", {}),
      sensor("sensor.b", "unavailable", {}),
      sensor("sensor.c", "2", {}),
      sensor("sensor.d", "3", {}),
    ];
    expect(nodeHealth(entities)).toEqual({ online: 3, total: 4, percent: 75 });
    expect(nodeHealth([])).toBeNull();
  });
});

describe("solarPower", () => {
  it("reads a power sensor named solar only", () => {
    expect(solarPower([sensor("sensor.s", "960", { device_class: "power" }, "Solar power")])).toBe(960);
    expect(solarPower([sensor("sensor.p", "40", { device_class: "power" }, "House power")])).toBeNull();
  });
});

describe("gaugeHue", () => {
  it("uses secondary above 50, tertiary from 20 to 50, error below 20", () => {
    expect(gaugeHue(51)).toBe("secondary");
    expect(gaugeHue(50)).toBe("tertiary");
    expect(gaugeHue(20)).toBe("tertiary");
    expect(gaugeHue(19)).toBe("error");
  });
});

describe("ringGauges", () => {
  it("takes percentage sensors, skips per-room humidity, sorts lowest first and caps the count", () => {
    const entities = [
      sensor("sensor.battery", "87", { device_class: "battery", unit_of_measurement: "%" }),
      sensor("sensor.filter", "12", { device_class: "battery", unit_of_measurement: "%" }),
      sensor("sensor.hum_a", "40", { device_class: "humidity", unit_of_measurement: "%" }),
      sensor("sensor.hum_b", "60", { device_class: "humidity", unit_of_measurement: "%" }),
      sensor("sensor.temp", "22", { device_class: "temperature", unit_of_measurement: "°C" }),
    ];
    const gauges = ringGauges(entities);
    expect(gauges.map((g) => g.id)).toEqual(["sensor.filter", "avg:humidity", "sensor.battery"]);
    expect(gauges[0]).toMatchObject({ value: 12, hue: "error" });
    expect(gauges[1]).toMatchObject({ value: 50, hue: "tertiary" });
    expect(ringGauges(entities, 2)).toHaveLength(2);
  });
});
