import type { AlertLevel, Entity } from "@/api/types";
import { isUnavailable } from "./availability";

// Feature 111: session-only event feed (HA logbook endpoint does not exist). Newest first, in memory.
export const FEED_LIMIT = 50;

// Feature 126: members of one device that flip availability within this window share one feed event.
export const DEVICE_DEDUPE_MS = 2000;

export type AvailabilityValue = "disconnected" | "reconnected";

export interface FeedEvent {
  key: string;
  entityId: string;
  name: string;
  deviceName?: string | null; // feature 115: name is resolved at render time (alias may arrive later)
  value: string;
  area: string | null;
  at: string;
  deviceKey?: string; // feature 126: set on availability events only (see deviceKeyOf)
  alert?: Exclude<AlertLevel, "off">; // feature 129: an alert raised by a rule (own style in the feed)
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

// Feature 126: members of one physical device (same HA device name in the same area) share a key; standalone
// entities key on their own id.
export function deviceKeyOf(entity: Entity): string {
  const device = typeof entity.deviceName === "string" ? entity.deviceName.trim().toLowerCase() : "";
  return device ? `${entity.area ?? ""}~${device}` : entity.entityId;
}

// Feature 126: available -> unavailable is "disconnected", unavailable -> available is "reconnected", any domain.
export function availabilityChange(before: Entity, after: Entity): AvailabilityValue | null {
  const was = isUnavailable(before);
  const now = isUnavailable(after);
  if (was === now) return null;
  return now ? "disconnected" : "reconnected";
}

function sameDeviceRecently(feed: FeedEvent[], deviceKey: string, value: string, at: string): boolean {
  const time = Date.parse(at);
  return feed.some(
    (event) =>
      event.deviceKey === deviceKey &&
      event.value === value &&
      Math.abs(time - Date.parse(event.at)) < DEVICE_DEDUPE_MS,
  );
}

// Feature 129: prepends one event, keeping the newest FEED_LIMIT.
export function prependEvent(feed: FeedEvent[], event: FeedEvent): FeedEvent[] {
  return [event, ...feed].slice(0, FEED_LIMIT);
}

// Prepends an event when a tracked value or the availability changed between two known versions of an entity.
export function recordChange(feed: FeedEvent[], before: Entity | undefined, after: Entity | undefined): FeedEvent[] {
  if (!before || !after) return feed;

  const availability = availabilityChange(before, after);
  if (availability) {
    const deviceKey = deviceKeyOf(after);
    if (sameDeviceRecently(feed, deviceKey, availability, after.lastChanged)) return feed;
    return prependEvent(feed, {
      key: `${after.entityId}@${after.lastChanged}:${availability}`,
      entityId: after.entityId,
      name: after.name,
      deviceName: after.deviceName,
      value: availability,
      area: after.area,
      at: after.lastChanged,
      deviceKey,
    });
  }

  const previous = feedValue(before);
  const next = feedValue(after);
  if (previous === null || next === null || previous === next) return feed;
  return prependEvent(feed, {
    key: `${after.entityId}@${after.lastChanged}`,
    entityId: after.entityId,
    name: after.name,
    deviceName: after.deviceName,
    value: next,
    area: after.area,
    at: after.lastChanged,
  });
}
