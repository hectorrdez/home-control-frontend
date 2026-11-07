import type { Entity } from "@/api/types";
import { displayName } from "@/features/names/displayName";
import { CO2_FAIR_MAX, CO2_GOOD_MAX, GAUGE_LIMIT, GAUGE_OK_ABOVE, GAUGE_WARN_ABOVE } from "./constants";

// Pure derivations for the telemetry view (feature 111). Components only render what these return.

export type Hue = "secondary" | "tertiary" | "error";

const deviceClass = (e: Entity) => (typeof e.attributes.device_class === "string" ? e.attributes.device_class : "");

// Numeric state, or null for unavailable/unknown/non-numeric states.
export function numericState(e: Entity): number | null {
  if (e.state === "unavailable" || e.state === "unknown") return null;
  const n = Number(e.state);
  return Number.isFinite(n) ? n : null;
}

interface Reading {
  entity: Entity;
  value: number;
}

function readingsOf(entities: Entity[], cls: string): Reading[] {
  const out: Reading[] = [];
  for (const entity of entities) {
    if (entity.domain !== "sensor" || deviceClass(entity) !== cls) continue;
    const value = numericState(entity);
    if (value !== null) out.push({ entity, value });
  }
  return out;
}

export function sensorCount(entities: Entity[]): number {
  return entities.filter((e) => e.domain === "sensor" || e.domain === "binary_sensor").length;
}

// CLIMATE MEAN: mean of temperature sensors with the rooms holding the min and max. null when none.
export interface ClimateStats {
  mean: number;
  min: { value: number; room: string };
  max: { value: number; room: string };
}

export function climateStats(entities: Entity[], roomOf: (e: Entity) => string): ClimateStats | null {
  const temps = readingsOf(entities, "temperature");
  if (temps.length === 0) return null;
  const mean = temps.reduce((sum, r) => sum + r.value, 0) / temps.length;
  let min = temps[0];
  let max = temps[0];
  for (const r of temps) {
    if (r.value < min.value) min = r;
    if (r.value > max.value) max = r;
  }
  return {
    mean,
    min: { value: min.value, room: roomOf(min.entity) },
    max: { value: max.value, room: roomOf(max.entity) },
  };
}

// AIR QUALITY: CO2 grade chip (thresholds in constants) plus PM2.5. null when neither sensor exists.
export type AirGrade = "GOOD" | "FAIR" | "POOR";

export function airGrade(co2: number): { grade: AirGrade; tone: Hue } {
  if (co2 < CO2_GOOD_MAX) return { grade: "GOOD", tone: "secondary" };
  if (co2 < CO2_FAIR_MAX) return { grade: "FAIR", tone: "tertiary" };
  return { grade: "POOR", tone: "error" };
}

export interface AirQuality {
  co2: number | null;
  pm25: number | null;
}

export function airQuality(entities: Entity[]): AirQuality | null {
  const co2 = readingsOf(entities, "carbon_dioxide")[0]?.value ?? null;
  const pm25 = readingsOf(entities, "pm25")[0]?.value ?? null;
  if (co2 === null && pm25 === null) return null;
  return { co2, pm25 };
}

// POWER extras: TODAY kWh from the first energy sensor, SOLAR W from a power sensor named solar.
export function energyToday(entities: Entity[]): number | null {
  return readingsOf(entities, "energy")[0]?.value ?? null;
}

export function solarPower(entities: Entity[]): number | null {
  const solar = readingsOf(entities, "power").find((r) => /solar/i.test(r.entity.name));
  return solar ? solar.value : null;
}

// NODES: entities total and available (state !== "unavailable"). null when the house is empty.
export interface NodeHealth {
  online: number;
  total: number;
  percent: number;
}

export function nodeHealth(entities: Entity[]): NodeHealth | null {
  const total = entities.length;
  if (total === 0) return null;
  const online = entities.filter((e) => e.state !== "unavailable").length;
  return { online, total, percent: Math.round((online / total) * 100) };
}

// RING GAUGES: one per "%" sensor except per-room humidity, plus one average humidity gauge.
// Sorted lowest value first, capped at GAUGE_LIMIT.
export interface GaugeReading {
  id: string;
  label: string;
  value: number;
  hue: Hue;
  deviceClass: string; // feature 125: "battery" gauges are hidden by default
}

export function gaugeHue(value: number): Hue {
  if (value > GAUGE_OK_ABOVE) return "secondary";
  if (value >= GAUGE_WARN_ABOVE) return "tertiary";
  return "error";
}

// Feature 115: labels come from labelOf (the alias-aware name); regexes above keep matching on the raw name.
export function ringGauges(entities: Entity[], limit: number = GAUGE_LIMIT, labelOf: (entity: Entity) => string = displayName): GaugeReading[] {
  const gauges: GaugeReading[] = [];
  const humidity: number[] = [];
  for (const entity of entities) {
    if (entity.domain !== "sensor" || entity.attributes.unit_of_measurement !== "%") continue;
    const value = numericState(entity);
    if (value === null) continue;
    if (deviceClass(entity) === "humidity") {
      humidity.push(value);
      continue;
    }
    gauges.push({ id: entity.entityId, label: labelOf(entity), value, hue: gaugeHue(value), deviceClass: deviceClass(entity) });
  }
  if (humidity.length > 0) {
    const avg = humidity.reduce((sum, v) => sum + v, 0) / humidity.length;
    gauges.push({ id: "avg:humidity", label: "Average humidity", value: avg, hue: gaugeHue(avg), deviceClass: "humidity" });
  }
  return gauges.sort((a, b) => a.value - b.value).slice(0, limit);
}
