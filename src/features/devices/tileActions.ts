import type { Entity } from "@/api/types";
import type { Intent } from "@/state/actions";

// Feature 155: what a tap on an actuator tile does. Switch-like devices toggle, scenes and scripts run.
// Everything else opens the device detail page, where its controls live (feature 157 changes cover taps).
export function tapIntentFor(entity: Entity): Intent | null {
  switch (entity.domain) {
    case "light":
    case "switch":
    case "fan":
      return { kind: "power", on: entity.state !== "on" };
    case "scene":
    case "script":
      return { kind: "activate" };
    default:
      return null;
  }
}
