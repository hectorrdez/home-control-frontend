import { describe, expect, it } from "vitest";
import { Blinds, Cpu, Fan, Gauge, Lightbulb, Lock, Plug, Radar, ScrollText, Sparkles, Thermometer } from "lucide-react";
import type { Entity } from "@/api/types";
import { describeState, domainHue, domainIcon } from "./deviceState";

const make = (domain: string, state: string, attributes: Record<string, unknown> = {}): Entity => ({
  entityId: `${domain}.x`,
  domain,
  name: "x",
  state,
  attributes,
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
});

describe("domainIcon", () => {
  it("maps known domains to their icon and falls back to the generic chip", () => {
    expect(domainIcon("light")).toBe(Lightbulb);
    expect(domainIcon("switch")).toBe(Plug);
    expect(domainIcon("fan")).toBe(Fan);
    expect(domainIcon("climate")).toBe(Thermometer);
    expect(domainIcon("cover")).toBe(Blinds);
    expect(domainIcon("lock")).toBe(Lock);
    expect(domainIcon("scene")).toBe(Sparkles);
    expect(domainIcon("script")).toBe(ScrollText);
    expect(domainIcon("sensor")).toBe(Gauge);
    expect(domainIcon("binary_sensor")).toBe(Radar);
    expect(domainIcon("vacuum")).toBe(Cpu);
  });
});

describe("domainHue", () => {
  it("uses amber for climate, emerald for sensors and locks, cyan otherwise", () => {
    expect(domainHue("climate")).toBe("tertiary");
    expect(domainHue("sensor")).toBe("secondary");
    expect(domainHue("binary_sensor")).toBe("secondary");
    expect(domainHue("lock")).toBe("secondary");
    expect(domainHue("light")).toBe("primary");
    expect(domainHue("vacuum")).toBe("primary");
  });
});

describe("describeState", () => {
  it("flags unavailable and unknown states regardless of domain", () => {
    expect(describeState(make("light", "unavailable"))).toEqual({ text: "UNAVAILABLE", on: false, unavailable: true });
    expect(describeState(make("sensor", "Unknown"))).toEqual({ text: "UNKNOWN", on: false, unavailable: true });
  });

  it("shows power domains as ON/OFF", () => {
    expect(describeState(make("light", "on"))).toEqual({ text: "ON", on: true, unavailable: false });
    expect(describeState(make("switch", "off"))).toEqual({ text: "OFF", on: false, unavailable: false });
    expect(describeState(make("fan", "on"))).toMatchObject({ text: "ON", on: true });
  });

  it("shows locks as their state, lit only when locked", () => {
    expect(describeState(make("lock", "locked"))).toMatchObject({ text: "LOCKED", on: true });
    expect(describeState(make("lock", "unlocked"))).toMatchObject({ text: "UNLOCKED", on: false });
  });

  it("shows covers by position when reported, otherwise by state", () => {
    expect(describeState(make("cover", "open", { current_position: 40 }))).toEqual({ text: "40% OPEN", on: true, unavailable: false });
    expect(describeState(make("cover", "closed", { current_position: 0 }))).toMatchObject({ text: "0% OPEN", on: false });
    expect(describeState(make("cover", "open", { current_position: "n/a" }))).toMatchObject({ text: "OPEN", on: true });
    expect(describeState(make("cover", "closed"))).toMatchObject({ text: "CLOSED", on: false });
  });

  it("shows climate by current temperature, lit unless off", () => {
    expect(describeState(make("climate", "heat", { current_temperature: 21.456 }))).toEqual({ text: "21.5 °C", on: true, unavailable: false });
    expect(describeState(make("climate", "off", { current_temperature: "19" }))).toMatchObject({ text: "19.0 °C", on: false });
    expect(describeState(make("climate", "cool"))).toMatchObject({ text: "COOL", on: true });
  });

  it("shows sensors with their unit, rounding power and CO2 to whole numbers", () => {
    expect(describeState(make("sensor", "23.456", { unit_of_measurement: "°C" }))).toEqual({ text: "23.5 °C", on: false, unavailable: false });
    expect(describeState(make("sensor", "1234.5", { device_class: "power", unit_of_measurement: "W" }))).toMatchObject({ text: "1235 W" });
    expect(describeState(make("sensor", "400.7", { device_class: "carbon_dioxide", unit_of_measurement: "ppm" }))).toMatchObject({ text: "401 ppm" });
    expect(describeState(make("sensor", "78.25"))).toMatchObject({ text: "78.3" });
  });

  it("passes non-numeric sensor readings through unchanged", () => {
    expect(describeState(make("sensor", "Calibrating", { unit_of_measurement: "%" }))).toMatchObject({ text: "Calibrating %" });
    expect(describeState(make("sensor", "  "))).toMatchObject({ text: "  " });
  });

  it("names binary sensors by device class", () => {
    expect(describeState(make("binary_sensor", "on", { device_class: "motion" }))).toMatchObject({ text: "DETECTED", on: true });
    expect(describeState(make("binary_sensor", "off", { device_class: "motion" }))).toMatchObject({ text: "CLEAR", on: false });
    expect(describeState(make("binary_sensor", "on", { device_class: "door" }))).toMatchObject({ text: "OPEN", on: true });
    expect(describeState(make("binary_sensor", "off", { device_class: "window" }))).toMatchObject({ text: "CLOSED", on: false });
    expect(describeState(make("binary_sensor", "on"))).toMatchObject({ text: "ON", on: true });
    expect(describeState(make("binary_sensor", "off"))).toMatchObject({ text: "OFF", on: false });
  });

  it("shows scenes and scripts as READY, never lit", () => {
    expect(describeState(make("scene", "scening"))).toEqual({ text: "READY", on: false, unavailable: false });
    expect(describeState(make("script", "on"))).toEqual({ text: "READY", on: false, unavailable: false });
  });

  it("uppercases the raw state for any other domain", () => {
    expect(describeState(make("media_player", "playing"))).toEqual({ text: "PLAYING", on: false, unavailable: false });
  });
});
