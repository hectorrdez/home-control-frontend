import { getClientId } from "./clientIdentity";
import type { ConnectionState, ServerEvent } from "./types";

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

// Feature 134: stream connection state fan-out (open / reconnecting), so stores can re-sync after a reconnect.
type StreamStateListener = (state: ConnectionState) => void;

const streamListeners = new Set<StreamStateListener>();

export function subscribeStreamState(listener: StreamStateListener): () => void {
  streamListeners.add(listener);
  return () => {
    streamListeners.delete(listener);
  };
}

export function publishStreamState(state: ConnectionState): void {
  for (const listener of [...streamListeners]) listener(state);
}
