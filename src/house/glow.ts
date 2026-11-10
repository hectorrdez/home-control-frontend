import type { Entity } from "@/api/types";

export interface RoomGlow {
  on: boolean;
  intensity: number; // 0..1, scales the room PointLight
  hue: "light" | "climate";
}

const OFF: RoomGlow = { on: false, intensity: 0, hue: "light" };

// Glow from the lights of one area: any on -> on; intensity follows the average brightness; all off -> off.
// Heating climate tints the glow amber.
export function roomGlow(entities: Entity[]): RoomGlow {
  const lit = entities.filter((e) => (e.domain === "light" || e.domain === "switch") && e.state === "on");
  const heating = entities.some((e) => e.domain === "climate" && (e.state === "heat" || e.attributes.hvac_action === "heating"));
  if (lit.length === 0) return heating ? { on: true, intensity: 0.4, hue: "climate" } : OFF;
  const levels = lit.map((e) => {
    const brightness = Number(e.attributes.brightness);
    return Number.isFinite(brightness) ? Math.min(1, Math.max(0.2, brightness / 255)) : 0.7;
  });
  const average = levels.reduce((sum, v) => sum + v, 0) / levels.length;
  return { on: true, intensity: average, hue: heating ? "climate" : "light" };
}

export function formatTemperature(value: string): string | null {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)} °C` : null;
}

export function formatHumidity(value: string): string | null {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}% RH` : null;
}

export interface RoomClimate {
  temperature: number | null;
  humidity: number | null;
}

// Mean of the numeric states of every sensor of one device_class; unavailable, unknown and non-numeric states are ignored.
function meanOf(entities: Entity[], deviceClass: string): number | null {
  const values = entities
    .filter((e) => e.domain === "sensor" && e.attributes.device_class === deviceClass)
    .filter((e) => e.state !== "unavailable" && e.state !== "unknown" && e.state.trim() !== "")
    .map((e) => Number(e.state))
    .filter((n) => Number.isFinite(n));
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Mean temperature and humidity of one area (feature 161). A metric with no valid sensor is null.
export function roomClimate(entities: Entity[]): RoomClimate {
  return { temperature: meanOf(entities, "temperature"), humidity: meanOf(entities, "humidity") };
}

function climateParts(climate: RoomClimate): { temperature: string | null; humidity: string | null } {
  return {
    temperature: climate.temperature === null ? null : formatTemperature(String(climate.temperature)),
    humidity: climate.humidity === null ? null : formatHumidity(String(climate.humidity)),
  };
}

// "KITCHEN: 21.5 °C 48% RH"; absent parts are omitted.
export function roomLabel(name: string, entities: Entity[]): string {
  const { temperature, humidity } = climateParts(roomClimate(entities));
  return [`${name.toUpperCase()}:`, ...[temperature, humidity].filter((p): p is string => p !== null)].join(" ");
}

// Zone point chip (feature 161): "21.5 °C · 48%"; null when the zone has no sensor value.
export function climateChip(entities: Entity[]): string | null {
  const climate = roomClimate(entities);
  const temperature = climate.temperature === null ? null : formatTemperature(String(climate.temperature));
  const humidity = climate.humidity === null ? null : `${Math.round(climate.humidity)}%`;
  const parts = [temperature, humidity].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Live status line for the screen-reader room list: "Kitchen: lights on, 21.5 °C, 48% RH".
export function roomStatus(name: string, entities: Entity[]): string {
  const lights = entities.filter((e) => e.domain === "light");
  const lightPart = lights.length === 0 ? null : lights.some((e) => e.state === "on") ? "lights on" : "lights off";
  const { temperature, humidity } = climateParts(roomClimate(entities));
  const parts = [lightPart, temperature, humidity].filter((p): p is string => p !== null);
  return parts.length > 0 ? `${name}: ${parts.join(", ")}` : `${name}:`;
}
