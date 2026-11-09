import type { Entity, ServerEvent, ServerResource } from "./types";

export type EventSourceFactory = (url: string) => EventSource;

// The SSE frame names the panel listens to besides state_changed (feature 132).
export const SERVER_EVENT_NAMES = ["resource_changed", "event", "ha_link", "alert", "alert_acked"] as const;

// Parses one `state_changed` payload (normalized entity, backend 005). Returns null for anything malformed.
export function parseStateChanged(data: unknown): Entity | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as Partial<Entity> | null;
    return parsed && typeof parsed.entityId === "string" ? (parsed as Entity) : null;
  } catch {
    return null;
  }
}

const RESOURCES: readonly ServerResource[] = ["aliases", "calibrations", "alert_rules", "settings", "presets"];
const ALERT_LEVELS = ["low", "medium", "high"];

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isStringOrNull = (value: unknown): value is string | null => value === null || typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

function parseEvent(body: Json): ServerEvent | null {
  if (!isString(body.id) || !isString(body.ts) || !isString(body.type) || !isString(body.source)) return null;
  if (!isStringOrNull(body.entityId) || !isStringOrNull(body.level)) return null;
  if (!isStringOrNull(body.clientId) || !isStringOrNull(body.clientName) || !isObject(body.payload)) return null;
  return { type: "event", event: body as unknown as Extract<ServerEvent, { type: "event" }>["event"] };
}

function parseAlert(body: Json): ServerEvent | null {
  if (!isString(body.id) || !isStringOrNull(body.ruleId) || !isStringOrNull(body.entityId)) return null;
  if (!isString(body.level) || !ALERT_LEVELS.includes(body.level) || !isString(body.text) || !isString(body.firedAt)) return null;
  if (!isStringOrNull(body.ackedAt) || !isStringOrNull(body.ackedBy) || !isStringOrNull(body.clientId)) return null;
  return { type: "alert", alert: body as unknown as Extract<ServerEvent, { type: "alert" }>["alert"] };
}

// Parses one named SSE frame (feature 132). Returns null for unknown names and malformed payloads; never throws.
export function parseServerEvent(eventName: string, data: unknown): ServerEvent | null {
  if (typeof data !== "string") return null;
  let body: unknown;
  try {
    body = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(body)) return null;

  switch (eventName) {
    case "resource_changed":
      if (!RESOURCES.includes(body.resource as ServerResource) || !isStringArray(body.keys)) return null;
      if (!isStringOrNull(body.by)) return null;
      return { type: "resource_changed", resource: body.resource as ServerResource, keys: body.keys, by: body.by };
    case "event":
      return parseEvent(body);
    case "ha_link":
      if (typeof body.connected !== "boolean" || !isString(body.at)) return null;
      return { type: "ha_link", connected: body.connected, at: body.at };
    case "alert":
      return parseAlert(body);
    case "alert_acked":
      if (!isString(body.id) || !isString(body.ackedAt) || !isStringOrNull(body.ackedBy)) return null;
      return { type: "alert_acked", id: body.id, ackedAt: body.ackedAt, ackedBy: body.ackedBy };
    default:
      return null;
  }
}

export function streamUrl(baseUrl: string, token: string, clientId: string): string {
  // EventSource cannot send headers, so the API token travels as ?token= (backend 005 accepts it on this route only).
  // clientId is identity only (backend 016); the header is not available here, so it goes in the query.
  return `${baseUrl}/api/stream?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`;
}
