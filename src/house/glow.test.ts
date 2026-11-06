import { describe, expect, it } from "vitest";
import type { Entity } from "@/api/types";
import { roomGlow, roomLabel, roomStatus } from "./glow";

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
