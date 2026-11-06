import type { Entity } from "@/api/types";
import type { LucideIcon } from "lucide-react";
import { Blinds, Cpu, Fan, Gauge, Lightbulb, Lock, Plug, Radar, ScrollText, Sparkles, Thermometer } from "lucide-react";

export type Hue = "primary" | "secondary" | "tertiary";

export interface StateView {
  text: string; // shown in the module, uppercase, numbers keep their unit
  on: boolean; // lit indicator + domain-hue border
  unavailable: boolean;
}

const ICONS: Record<string, LucideIcon> = {
  light: Lightbulb,
  switch: Plug,
  fan: Fan,
  climate: Thermometer,
  cover: Blinds,
  lock: Lock,
  scene: Sparkles,
  script: ScrollText,
  sensor: Gauge,
  binary_sensor: Radar,
};

export function domainIcon(domain: string): LucideIcon {
  return ICONS[domain] ?? Cpu;
}

// Domain hue (DESIGN.md): climate amber, sensors/locks emerald, everything else cyan.
export function domainHue(domain: string): Hue {
  if (domain === "climate") return "tertiary";
  if (domain === "sensor" || domain === "binary_sensor" || domain === "lock") return "secondary";
  return "primary";
}

const number = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return typeof v === "string" && v.trim() === "" ? null : Number.isFinite(n) ? n : null;
};

export function describeState(entity: Entity): StateView {
  const raw = entity.state.toLowerCase();
  const attrs = entity.attributes;
  const unit = typeof attrs.unit_of_measurement === "string" ? attrs.unit_of_measurement : "";
  const deviceClass = typeof attrs.device_class === "string" ? attrs.device_class : "";
  const view = (text: string, on: boolean): StateView => ({ text, on, unavailable: false });

  if (raw === "unavailable" || raw === "unknown") return { text: raw.toUpperCase(), on: false, unavailable: true };

  switch (entity.domain) {
    case "light":
    case "switch":
    case "fan":
      return view(raw === "on" ? "ON" : "OFF", raw === "on");
    case "lock":
      return view(raw.toUpperCase(), raw === "locked");
    case "cover": {
      const position = number(attrs.current_position);
      return position === null
        ? view(raw.toUpperCase(), raw === "open")
        : view(`${position}% OPEN`, position > 0);
    }
    case "climate": {
      const current = number(attrs.current_temperature);
      const temp = current === null ? raw.toUpperCase() : `${current.toFixed(1)} °C`;
      return view(temp, raw !== "off");
    }
    case "sensor": {
      const value = number(entity.state);
      const shown = value === null ? entity.state : value.toFixed(deviceClass === "power" || deviceClass === "carbon_dioxide" ? 0 : 1);
      return view(unit ? `${shown} ${unit}` : shown, false);
    }
    case "binary_sensor": {
      const on = raw === "on";
      if (deviceClass === "motion") return view(on ? "DETECTED" : "CLEAR", on);
      if (deviceClass === "door" || deviceClass === "window") return view(on ? "OPEN" : "CLOSED", on);
      return view(on ? "ON" : "OFF", on);
    }
    case "scene":
    case "script":
      return view("READY", false);
    default:
      return view(entity.state.toUpperCase(), false);
  }
}
