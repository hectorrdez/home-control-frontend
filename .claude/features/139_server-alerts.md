---
id: "139"
slug: server-alerts
title: Consume server-side alerts, acknowledge on all devices
role: frontend
type: change
extends: "129"
---

# Consume server-side alerts, acknowledge on all devices

## Description
Backend 020 evaluates alert rules on the server and broadcasts each alert once (`alert` SSE frame), with a shared acknowledge (`alert_acked`). The panel stops evaluating rules itself when the backend supports it, shows server alerts with the same LOW/MEDIUM/HIGH behaviour as 129, and dismissing a HIGH banner on one device dismisses it on all of them. Opening a panel later still shows alerts that are open (unacked, last 24 h). Fallback: backend without `/api/alerts` -> the 129 local engine keeps running unchanged. Depends on 132 and backend 020.

## Requirements
- `HomeApi`: `listAlerts(status: "open" | "all", limit?): Promise<ServerAlert[]>` (`GET /api/alerts`), `ackAlert(id): Promise<ServerAlert>` (`POST /api/alerts/:id/ack`), `ackAllAlerts(): Promise<ServerAlert[]>` (`POST /api/alerts/ack-all`). Live + mock (mock: in-memory alerts; its existing `?mock=alerts` timeline now produces SERVER alerts through `onServerEvent` instead of entity changes driving the local engine; `?mock=alerts-local` keeps the old local-engine path for the fallback test; `?mock=remote-ack` acks the first open alert from "other-device" 2 s after it fires).
- `AlertsProvider` / `useAlerts`:
  - On start call `listAlerts("open")`. Success -> mode `server`: local `evaluate` is NOT run (no duplicates). `not_found` -> mode `local`: 129 behaviour unchanged.
  - Server mode: open alerts loaded at start are shown as follows: HIGH -> banner queue (no auto-navigation and no sound for alerts older than 60 s at load; banner text adds "SINCE <hh:mm>"); MEDIUM/LOW -> feed only (no toast for old ones). Live `alert` frames -> exactly the 129 level behaviour (LOW feed, MEDIUM toast 8 s + click to device, HIGH sound + banner + navigate Home 3D + highlight).
  - Dedupe by alert id (the start list and a live frame may overlap).
  - DISMISS on the HIGH banner -> `ackAlert(id)` (optimistic remove; failure -> keep it, show "COULD NOT DISMISS"). A new "DISMISS ALL" button when the queue has > 1 -> `ackAllAlerts()`.
  - `alert_acked` frame (any device) -> remove that alert from the banner queue / stop the sound if it was the current one; feed entry stays.
  - Reconnect (`ready` after a drop) -> `listAlerts("open")` again and merge (catches missed frames).
- Feed entries for alerts show `clientName` when the trigger was `interacted` ("by <name>").
- Sound unlock (129) unchanged.

## Touches existing endpoints
GET /api/alerts, POST /api/alerts/:id/ack, POST /api/alerts/ack-all (backend 020), GET /api/stream (`alert`, `alert_acked`). GET /api/alert-rules still used by the 128 editor only.

## Done when
**Unit (Vitest)**
- Mode detection server vs local (404); no local `evaluate` call in server mode.
- Start list: old HIGH -> banner without navigation/sound; fresh live HIGH -> navigation + sound; dedupe start vs live.
- DISMISS calls ack and removes; failure keeps it; DISMISS ALL; `alert_acked` from another device removes and stops sound; reconnect merges.

**E2E (Playwright, mock)**
- `alert-engine.spec.ts` (update to server mode, same 3 journeys: MEDIUM toast click -> device, HIGH -> Home 3D + red banner, LOW only in feed).
- New journey `?mock=remote-ack`: HIGH banner disappears by itself within 3 s (acked elsewhere).
- New journey `?mock=alerts-local`: local fallback still raises the MEDIUM toast.
- test.cjs green.
