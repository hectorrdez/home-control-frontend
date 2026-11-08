import { getClientId } from "./clientIdentity";
import type { ServerEvent } from "./types";

// Feature 132: fan-out of the non-entity stream frames. EntitiesProvider owns the one SSE subscription and publishes here.
type ServerEventListener = (event: ServerEvent) => void;

const listeners = new Set<ServerEventListener>();

export function subscribeServerEvents(listener: ServerEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishServerEvent(event: ServerEvent): void {
  for (const listener of [...listeners]) listener(event);
}

// True when a resource_changed was caused by this panel: consumers that already hold the result skip the refetch.
export function isOwnChange(event: { by: string | null }): boolean {
  return event.by === getClientId();
}
