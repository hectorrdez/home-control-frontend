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

function sensorValue(entities: Entity[], deviceClass: string, format: (v: string) => string | null): string | null {
  const sensor = entities.find((e) => e.domain === "sensor" && e.attributes.device_class === deviceClass);
  return sensor ? format(sensor.state) : null;
}

// "KITCHEN: 21.5 °C 48% RH"; absent sensor parts are omitted.
export function roomLabel(name: string, entities: Entity[]): string {
  const parts = [sensorValue(entities, "temperature", formatTemperature), sensorValue(entities, "humidity", formatHumidity)];
  return [`${name.toUpperCase()}:`, ...parts.filter((p): p is string => p !== null)].join(" ");
}

// Live status line for the screen-reader room list: "Kitchen: lights on, 21.5 °C".
export function roomStatus(name: string, entities: Entity[]): string {
  const lights = entities.filter((e) => e.domain === "light");
  const lightPart = lights.length === 0 ? null : lights.some((e) => e.state === "on") ? "lights on" : "lights off";
  const temp = sensorValue(entities, "temperature", formatTemperature);
  const parts = [lightPart, temp].filter((p): p is string => p !== null);
  return parts.length > 0 ? `${name}: ${parts.join(", ")}` : `${name}:`;
}
