import type { ConnectionState } from "@/api/types";

// Feature 126: a tab hidden for longer than this re-fetches the entity list when it becomes visible again.
export const RESYNC_HIDDEN_MS = 60_000;

// The stream came back after a drop: the entity list is re-fetched once so missed changes are applied (105/126).
export function isStreamRecovery(previous: ConnectionState, next: ConnectionState): boolean {
  return previous === "reconnecting" && next === "open";
}

// hiddenSince = epoch ms when the tab was hidden, null when it was never hidden in this session.
export function shouldResyncAfterHidden(hiddenSince: number | null, now: number): boolean {
  return hiddenSince !== null && now - hiddenSince > RESYNC_HIDDEN_MS;
}
