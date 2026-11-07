import type { Entity } from "@/api/types";

// Domains whose state may legitimately be "unknown" (assumed-state covers, scenes and scripts never report a state).
export const UNKNOWN_STATE_DOMAINS = new Set(["cover", "scene", "script"]);

// Feature 126: "unavailable" (and "unknown" outside UNKNOWN_STATE_DOMAINS) means the entity has no live link.
export function isUnavailable(entity: Entity): boolean {
  if (entity.state === "unavailable") return true;
  return entity.state === "unknown" && !UNKNOWN_STATE_DOMAINS.has(entity.domain);
}
