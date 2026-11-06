import type { Entity, EntityAction } from "@/api/types";

// Feature 104: what a control asks for, and how it maps to HomeApi.runAction and to the optimistic state.
export type Intent =
  | { kind: "power"; on: boolean } // light, switch, fan
  | { kind: "brightness"; pct: number } // light
  | { kind: "temperature"; temperature: number } // climate
  | { kind: "hvac_mode"; mode: string } // climate
  | { kind: "preset"; preset: string } // climate
  | { kind: "cover_position"; position: number } // cover slider
  | { kind: "cover_open" } // cover FULL preset
  | { kind: "cover_close" } // cover SHUT preset
  | { kind: "lock"; locked: boolean } // lock / unlock (confirmed in the UI)
  | { kind: "activate" }; // scene / script

export function intentAction(intent: Intent): EntityAction {
  switch (intent.kind) {
    case "power":
      return { action: intent.on ? "turn_on" : "turn_off" };
    case "brightness":
      return { action: "turn_on", params: { brightness_pct: intent.pct } };
    case "temperature":
      return { action: "set_temperature", params: { temperature: intent.temperature } };
    case "hvac_mode":
      return { action: "set_hvac_mode", params: { hvac_mode: intent.mode } };
    case "preset":
      return { action: "set_preset_mode", params: { preset_mode: intent.preset } };
    case "cover_position":
      return { action: "set_cover_position", params: { position: intent.position } };
    case "cover_open":
      return { action: "open_cover" };
    case "cover_close":
      return { action: "close_cover" };
    case "lock":
      return { action: intent.locked ? "lock" : "unlock" };
    case "activate":
      return { action: "turn_on" };
  }
}

// Expected state after the action succeeds, shown immediately (optimistic). Pure: returns a new entity.
export function applyIntent(entity: Entity, intent: Intent): Entity {
  const next: Entity = { ...entity, attributes: { ...entity.attributes } };
  switch (intent.kind) {
    case "power":
      next.state = intent.on ? "on" : "off";
      break;
    case "brightness":
      next.state = intent.pct > 0 ? "on" : "off";
      next.attributes.brightness = Math.round((intent.pct / 100) * 255);
      break;
    case "temperature":
      next.attributes.temperature = intent.temperature;
      break;
    case "hvac_mode":
      next.state = intent.mode;
      break;
    case "preset":
      next.attributes.preset_mode = intent.preset;
      break;
    case "cover_position":
      next.attributes.current_position = intent.position;
      next.state = intent.position > 0 ? "open" : "closed";
      break;
    case "cover_open":
      next.attributes.current_position = 100;
      next.state = "open";
      break;
    case "cover_close":
      next.attributes.current_position = 0;
      next.state = "closed";
      break;
    case "lock":
      next.state = intent.locked ? "locked" : "unlocked";
      break;
    case "activate":
      break;
  }
  return next;
}
