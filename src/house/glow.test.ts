import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { climateChip, roomClimate, roomGlow, roomLabel, roomStatus } from "./glow";

const e = (over: Partial<Entity>): Entity => ({
  entityId: "x.y",
  domain: "light",
  name: "n",
  state: "off",
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("room glow (106)", () => {
  it("is off when every light is off", () => {
    expect(roomGlow([e({ state: "off" }), e({ state: "off" })]).on).toBe(false);
  });

  it("scales intensity by the average brightness of lit lights", () => {
    const glow = roomGlow([
      e({ state: "on", attributes: { brightness: 255 } }),
      e({ state: "on", attributes: { brightness: 127 } }),
      e({ state: "off" }),
    ]);
    expect(glow.on).toBe(true);
    expect(glow.hue).toBe("light");
    expect(glow.intensity).toBeCloseTo((1 + 127 / 255) / 2, 2);
  });

  it("turns amber while climate is heating", () => {
    expect(roomGlow([e({ state: "on" }), e({ domain: "climate", state: "heat" })]).hue).toBe("climate");
  });
});

describe("room labels (106)", () => {
  const sensors = [
    e({ domain: "sensor", state: "21.456", attributes: { device_class: "temperature" } }),
    e({ domain: "sensor", state: "48.2", attributes: { device_class: "humidity" } }),
  ];

  it("formats temperature with one decimal and humidity as integer", () => {
    expect(roomLabel("Kitchen", sensors)).toBe("KITCHEN: 21.5 °C 48% RH");
  });

  it("omits absent fields", () => {
    expect(roomLabel("Office", [])).toBe("OFFICE:");
    expect(roomLabel("Office", sensors.slice(0, 1))).toBe("OFFICE: 21.5 °C");
  });

  it("builds the screen-reader status line", () => {
    expect(roomStatus("Kitchen", [e({ state: "on" }), sensors[0]])).toBe("Kitchen: lights on, 21.5 °C");
    expect(roomStatus("Office", [])).toBe("Office:");
  });
});

const sensor = (state: string, deviceClass: string) => e({ domain: "sensor", state, attributes: { device_class: deviceClass } });

describe("room climate (161)", () => {
  it("takes the single sensor value of each metric", () => {
    expect(roomClimate([sensor("21.5", "temperature"), sensor("48", "humidity")])).toEqual({ temperature: 21.5, humidity: 48 });
  });

  it("averages every numeric sensor of a metric", () => {
    const climate = roomClimate([sensor("20", "temperature"), sensor("23", "temperature"), sensor("40", "humidity"), sensor("50", "humidity")]);
    expect(climate.temperature).toBeCloseTo(21.5, 5);
    expect(climate.humidity).toBeCloseTo(45, 5);
  });

  it("ignores unavailable, unknown and non-numeric states", () => {
    const climate = roomClimate([
      sensor("22", "temperature"),
      sensor("unavailable", "temperature"),
      sensor("unknown", "temperature"),
      sensor("abc", "temperature"),
      sensor("", "temperature"),
    ]);
    expect(climate.temperature).toBe(22);
  });

  it("is null for a metric with no valid sensor, and for an area with no sensors", () => {
    expect(roomClimate([])).toEqual({ temperature: null, humidity: null });
    expect(roomClimate([sensor("unavailable", "humidity")])).toEqual({ temperature: null, humidity: null });
    expect(roomClimate([sensor("21", "temperature")]).humidity).toBeNull();
  });

  it("only counts sensor entities of the matching device_class", () => {
    expect(roomClimate([e({ domain: "light", state: "20", attributes: { device_class: "temperature" } })])).toEqual({ temperature: null, humidity: null });
  });
});

describe("room labels use the mean (161)", () => {
  it("roomLabel shows the mean temperature and humidity", () => {
    const entities = [sensor("20", "temperature"), sensor("23", "temperature"), sensor("47.6", "humidity")];
    expect(roomLabel("Kitchen", entities)).toBe("KITCHEN: 21.5 °C 48% RH");
  });

  it("roomStatus adds the mean humidity after the temperature", () => {
    const entities = [e({ state: "on" }), sensor("20", "temperature"), sensor("23", "temperature"), sensor("48", "humidity")];
    expect(roomStatus("Kitchen", entities)).toBe("Kitchen: lights on, 21.5 °C, 48% RH");
    expect(roomStatus("Kitchen", [sensor("21.5", "temperature")])).toBe("Kitchen: 21.5 °C");
  });

  it("climateChip builds the zone point chip and is null without values", () => {
    expect(climateChip([sensor("21.456", "temperature"), sensor("48.2", "humidity")])).toBe("21.5 °C · 48%");
    expect(climateChip([sensor("21.456", "temperature")])).toBe("21.5 °C");
    expect(climateChip([sensor("48.2", "humidity")])).toBe("48%");
    expect(climateChip([e({ state: "on" })])).toBeNull();
    expect(climateChip([sensor("unavailable", "temperature")])).toBeNull();
  });
});
