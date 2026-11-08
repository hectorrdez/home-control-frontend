import type { AlertLevel, Entity, LoggedEvent } from "@/api/types";
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
  serverId?: string; // feature 140: id of the server event-log row this entry came from
}

// Feature 140: how many server rows seed the feed, and the window in which a local state entry and a server row
// describe the same change (the local one is then dropped).
export const SERVER_SEED_LIMIT = 50;
export const SERVER_DUPLICATE_MS = 5000;

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

// Feature 140: maps one event-log row (backend 018) to a feed entry. Unknown types return null (ignored).
// `lookup` gives the entity for a name and device (feed rows keep the name, the label is resolved at render time).
export function fromLoggedEvent(
  event: LoggedEvent,
  lookup: (entityId: string) => Entity | undefined = () => undefined,
): FeedEvent | null {
  const entity = event.entityId ? lookup(event.entityId) : undefined;
  const base: FeedEvent = {
    key: `srv:${event.id}`,
    serverId: event.id,
    entityId: event.entityId ?? "",
    name: entity?.name ?? event.entityId ?? "SYSTEM",
    deviceName: entity?.deviceName ?? null,
    value: "",
    area: entity?.area ?? null,
    at: event.ts,
  };
  const by = event.clientName ? ` by ${event.clientName}` : "";
  const payload = event.payload ?? {};
  switch (event.type) {
    case "action": {
      const action = String(payload.action ?? "action").replace(/_/g, " ");
      return { ...base, value: `${action}${payload.ok === false ? " FAILED" : ""}${by}` };
    }
    case "availability":
      return { ...base, value: payload.available === false ? "OFFLINE" : "ONLINE" };
    case "config_changed":
      return { ...base, entityId: "", name: "SYSTEM", value: `${String(payload.resource ?? "config")} changed${by}` };
    case "alert": {
      const level = event.level === "high" || event.level === "medium" ? event.level : "low";
      return { ...base, value: String(payload.text ?? ""), alert: level };
    }
    case "alert_acked":
      return { ...base, value: `ALERT ACKNOWLEDGED${by}` };
    case "ha_link":
      return {
        ...base,
        entityId: "",
        name: "SYSTEM",
        value: payload.connected === true ? "HOME ASSISTANT LINK RESTORED" : "HOME ASSISTANT LINK LOST",
      };
    default:
      return null;
  }
}

// Local entries that describe the same change as a server row (same entity, within 5 s): an availability row
// matches the same transition, an action row matches a plain state change, an alert row matches a local alert.
function duplicatesServer(local: FeedEvent, server: FeedEvent[]): boolean {
  const time = Date.parse(local.at);
  return server.some((row) => {
    if (!row.serverId || !local.entityId || row.entityId !== local.entityId) return false;
    if (Math.abs(time - Date.parse(row.at)) >= SERVER_DUPLICATE_MS) return false;
    if (row.alert) return local.alert !== undefined;
    if (row.value === "OFFLINE") return local.value === "disconnected";
    if (row.value === "ONLINE") return local.value === "reconnected";
    if (row.value.startsWith("ALERT ")) return false;
    return !local.alert && local.value !== "disconnected" && local.value !== "reconnected";
  });
}

// Feature 140: one feed from server rows (deduped by server id) and local state entries (111). A local entry that
// duplicates a server row is dropped; the rest merge by time and keep the newest FEED_LIMIT.
export function mergeFeeds(current: FeedEvent[], incoming: FeedEvent[] = []): FeedEvent[] {
  const seen = new Set<string>();
  const server: FeedEvent[] = [];
  for (const row of [...incoming, ...current.filter((e) => e.serverId)]) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    server.push(row);
  }
  const local = current.filter((e) => !e.serverId && !seen.has(e.key) && !(server.length > 0 && duplicatesServer(e, server)));
  const merged = [...server, ...local].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return merged.slice(0, FEED_LIMIT);
}
