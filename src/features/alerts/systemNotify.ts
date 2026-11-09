import type { AlertLevelServer, ServerAlert } from "@/api/types";

// Feature 145: OS notifications for server alerts when the panel is not visible (background tab, minimised window,
// Electron window hidden in the tray). Pure decision functions first; the Web Notification adapter is below.

export const SYSTEM_NOTIFY_KEY = "hc.alerts.systemNotify";

export type SystemNotifyStatus = "on" | "off" | "blocked" | "unsupported" | "ask";

export interface NotifyContext {
  fromList: boolean; // true for the start list or a reconnect merge; only live frames notify
  hidden: boolean; // page hidden or not focused (see isPageHidden)
}

// LOW never notifies; MEDIUM and HIGH notify only for a live alert while the page is not in front.
export function shouldNotify(alert: Pick<ServerAlert, "level">, ctx: NotifyContext): boolean {
  if (ctx.fromList || !ctx.hidden) return false;
  return alert.level === "medium" || alert.level === "high";
}

export function isPageHidden(doc: Document = document): boolean {
  return doc.visibilityState !== "visible" || !doc.hasFocus();
}

export function notificationTitle(level: AlertLevelServer): string {
  return `HOME CONTROL • ${level.toUpperCase()}`;
}

export function notificationBody(deviceName: string, areaName: string | null, text: string): string {
  return `${deviceName} • ${areaName ?? "NO AREA"}: ${text}`;
}

// Preference: stored in localStorage (per device by nature). Absent means on; only an explicit "off" disables.
export function readPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(SYSTEM_NOTIFY_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writePreference(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(SYSTEM_NOTIFY_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the preference lasts for this page only.
  }
}

export function isSupported(): boolean {
  return typeof globalThis.Notification !== "undefined";
}

// What the header control shows. "ask" = supported, permission not requested yet, or the user turned it off.
export function systemNotifyStatus(): SystemNotifyStatus {
  if (!isSupported()) return "unsupported";
  const permission = Notification.permission;
  if (permission === "denied") return "blocked";
  if (permission === "default") return "ask";
  return readPreference() ? "on" : "off";
}

// Permission is requested only from a user gesture (the header control), never on load.
export async function enableSystemNotify(): Promise<SystemNotifyStatus> {
  if (!isSupported()) return "unsupported";
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // Old browsers reject the promise form; the permission state below still tells the truth.
    }
  }
  if (Notification.permission === "granted") writePreference(true);
  return systemNotifyStatus();
}

export function disableSystemNotify(): SystemNotifyStatus {
  writePreference(false);
  return systemNotifyStatus();
}

// Electron preload (electron/preload.cjs): raises the hidden app window. Absent in the browser.
declare global {
  interface Window {
    homeControl?: { showWindow: () => void };
  }
}

const open = new Map<string, Notification>();

// Shows the notification for a live alert when the page is hidden. Returns whether one was created.
export function notifySystemAlert(
  alert: ServerAlert,
  info: { deviceName: string; areaName: string | null; ctx: NotifyContext; onClick: () => void },
): boolean {
  if (!shouldNotify(alert, info.ctx)) return false;
  if (systemNotifyStatus() !== "on") return false;
  const notification = new Notification(notificationTitle(alert.level), {
    body: notificationBody(info.deviceName, info.areaName, alert.text),
    tag: alert.id,
    requireInteraction: alert.level === "high",
  });
  open.set(alert.id, notification);
  notification.onclick = () => {
    window.focus();
    window.homeControl?.showWindow();
    info.onClick();
    notification.close();
  };
  notification.onclose = () => {
    if (open.get(alert.id) === notification) open.delete(alert.id);
  };
  return true;
}

// An alert acked anywhere (alert_acked frame) closes its notification here.
export function closeSystemAlert(id: string): void {
  const notification = open.get(id);
  if (!notification) return;
  open.delete(id);
  notification.close();
}

export function closeAllSystemAlerts(): void {
  for (const id of [...open.keys()]) closeSystemAlert(id);
}

// Test seam: forget open notifications between tests.
export function resetSystemNotifyForTests(): void {
  open.clear();
}
