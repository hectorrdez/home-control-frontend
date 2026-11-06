import type { Entity } from "./types";

export type EventSourceFactory = (url: string) => EventSource;

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

export function streamUrl(baseUrl: string, token: string): string {
  // EventSource cannot send headers, so the API token travels as ?token= (backend 005 accepts it on this route only).
  return `${baseUrl}/api/stream?token=${encodeURIComponent(token)}`;
}
