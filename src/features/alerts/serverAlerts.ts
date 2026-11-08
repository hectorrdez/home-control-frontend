import type { ServerAlert } from "@/api/types";

// Feature 139: pure helpers for server-side alerts (backend 020). No React, no I/O.

// Alerts already open when the panel loads are shown without navigation or sound when older than this.
export const SILENT_AFTER_MS = 60_000;

export function isSilentAtLoad(alert: ServerAlert, now: number): boolean {
  return now - Date.parse(alert.firedAt) > SILENT_AFTER_MS;
}

// "hh:mm" of the fire time in local time, for the banner's SINCE line.
export function sinceLabel(firedAt: string): string {
  const date = new Date(firedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
