import type { Entity } from "@/api/types";

// Feature 111: session-only event feed (HA logbook endpoint does not exist). Newest first, in memory.
export const FEED_LIMIT = 50;

export interface FeedEvent {
  key: string;
  entityId: string;
  name: string;
  deviceName?: string | null; // feature 115: name is resolved at render time (alias may arrive later)
  value: string;
  area: string | null;
  at: string;
}

// The value a feed tracks per entity, or null when the domain is not in the feed.
export function feedValue(entity: Entity): string | null {
  switch (entity.domain) {
    case "binary_sensor":
    case "lock":
    case "cover":
      return entity.state;
    case "climate":
      return typeof entity.attributes.hvac_action === "string" ? entity.attributes.hvac_action : null;
    case "light":
    case "switch":
      return entity.state === "on" || entity.state === "off" ? entity.state : null;
    default:
      return null;
  }
}

// Prepends an event when a tracked value changed between two known versions of an entity.
export function recordChange(feed: FeedEvent[], before: Entity | undefined, after: Entity | undefined): FeedEvent[] {
  if (!before || !after) return feed;
  const previous = feedValue(before);
  const next = feedValue(after);
  if (previous === null || next === null || previous === next) return feed;
  const event: FeedEvent = {
    key: `${after.entityId}@${after.lastChanged}`,
    entityId: after.entityId,
    name: after.name,
    deviceName: after.deviceName,
    value: next,
    area: after.area,
    at: after.lastChanged,
  };
  return [event, ...feed].slice(0, FEED_LIMIT);
}
