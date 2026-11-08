---
id: "145"
slug: alert-system-notifications
title: OS notifications for server alerts when the panel is not visible
role: frontend
type: change
extends: "139"
---

# OS notifications for server alerts when the panel is not visible

## Description
Board card HOME-74 asked to "store alerts in the database and, when they fire, raise them on every connected device". That is already specified: backend 020 (server-side engine, `alerts` table from 013, `alert` / `alert_acked` SSE frames, shared ack) and frontend 139 (consume server alerts, dismiss everywhere). The part still missing: the 139 banner/toast/sound only appear INSIDE the page, so a device whose panel is in a background tab, a minimized window, or the Electron app hidden in the tray (107) does not notice the alert. This feature adds operating-system notifications for those cases. Depends on 139 (server mode) and 107 (Electron shell).

## Requirements
- Module `src/features/alerts/systemNotify.ts` (pure decision + thin adapter over the Web `Notification` API, which Electron renderers also support):
  - `shouldNotify(alert, ctx)` -> true when the alert arrived as a LIVE `alert` frame (not from the start list of 139), level `medium` or `high`, and the page is not visible/focused (`document.visibilityState !== "visible"` OR `!document.hasFocus()`). LOW never notifies.
  - Notification: title `HOME CONTROL • <LEVEL>`, body `<device display name> • <area>: <text>`, `tag = alert.id` (no duplicates; an `alert_acked` frame closes the matching notification), `requireInteraction: true` for HIGH.
  - Click: `window.focus()`, navigate like 129 (HIGH -> Home 3D with highlight, MEDIUM -> `/devices/:key`), close the notification. Clicking does NOT ack (ack stays on the in-app DISMISS).
- Permission: never asked on load. A "ENABLE SYSTEM NOTIFICATIONS" control next to the existing "ENABLE ALERT SOUND" (129) calls `Notification.requestPermission()`; states shown: ENABLED / BLOCKED BY BROWSER / NOT SUPPORTED. Preference (user turned it off) kept in `localStorage` key `hc.alerts.systemNotify` (per device by nature; wrapped in try/catch).
- Electron (107): if `window.focus()` does not restore a window hidden in the tray, add a minimal preload with `contextBridge.exposeInMainWorld("homeControl", { showWindow })` -> IPC -> main `win.show(); win.focus()`; no other Node exposure (keeps 107's rule). Electron sets `app.setAppUserModelId` on Windows so notifications show the app name.
- Works only in server mode (139). In local fallback mode (129, no `/api/alerts`) do nothing new.
- HIGH alert while the page is visible: unchanged 139 behaviour, no OS notification.

## Touches existing endpoints
no new ones (GET /api/stream `alert` / `alert_acked` as consumed by 139)

## Done when
**Unit (Vitest, fake Notification + visibility)**
- `shouldNotify` table (visible vs hidden, live vs start list, levels); tag = id; `alert_acked` closes it; click focuses + navigates per level; permission states; preference off -> no notification; local mode -> no notification.

**E2E (Playwright, mock)**
- Grant notification permission in the context, emulate hidden page, `?mock=alerts` HIGH -> a Notification is constructed with the alert tag (spy via `addInitScript`); visible page -> none.
- Electron: `electron/lib.test.mjs` covers the show-window IPC handler if the preload is added.
- test.cjs green.
