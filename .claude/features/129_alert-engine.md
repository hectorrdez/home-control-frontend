---
id: "129"
slug: alert-engine
title: Alert engine and notification levels
role: frontend
type: feature
extends: "111"
---

# Alert engine and notification levels

## Description
Second half of the notification center. The panel evaluates the alert rules (128/backend 012) on every entity change from the SSE stream and raises alerts by level. Depends on 126 (reliable connect/disconnect), 128 (rules) and the event feed (111). Runs in the browser: it alerts only while the panel is open.

## Requirements
- Pure module `src/features/alerts/engine.ts`: `evaluate(rules, before, after, ctx)` -> list of `{ rule, entityId, level, text, at }`. Triggers: `connects` / `disconnects` (unavailable transitions), `state_becomes` (state changes to value), `above`/`below` (numeric state CROSSES the threshold: fires once on crossing, not on every sample; re-arms when it goes back), `interacted` (change whose pending action was started by this panel, see 104/117 `actionConfirmed`; changes from other clients/devices do not count). No alert on initial load/snapshot, only on changes after the first load. Level `off` never fires.
- Hook `useAlerts()` subscribed to the entity store changes; one alert per rule per event; dedupe the same rule within 2 s.
- Levels:
  - LOW: no popup; written to the event feed (111) as a feed event flagged `alert: low` (shown with its own style/icon), even if the plain feed would not track that domain.
  - MEDIUM: toast at bottom-right (existing Toast, extend it with position/duration/onClick if needed) showing device name + message for ~8 s; clicking it navigates to `/devices/:key` (device detail). Also written to the feed.
  - HIGH: plays an alarm sound, shows a large red overlay/banner (error tokens, role=alertdialog, focus moved to its DISMISS button, stays until dismissed) with device name, area and message, and navigates automatically to the Home 3D page (`/`) with the affected device/area highlighted (reuse the house glow/selection from 106); if already on Home it just highlights. Also written to the feed. Several HIGH alerts queue in the banner (count shown).
- Sound: Web Audio synthesized beep (no asset), looped until dismissed or 30 s. Browsers block audio before a user gesture: a one-time "ENABLE ALERT SOUND" control in the header/settings area unlocks the AudioContext (stored in sessionStorage-free memory only); until enabled, HIGH alerts show an explicit "sound blocked" hint. Honor `prefers-reduced-motion` for the banner animation (sound stays).
- Alert state is session-only (nothing new in storage). Alerts raised while the stream is reconnecting are evaluated after the resync from 126.
- Unit tests: engine for every trigger incl. threshold crossing and re-arm, interacted vs external change, no-fire on first load; hook; toast click navigation; HIGH banner focus + dismiss. One Playwright spec with mock rules: MEDIUM toast click goes to the device, HIGH navigates to Home 3D and shows the red banner, LOW only appears in the feed.

## Touches existing endpoints
GET /api/alert-rules (backend 012), GET /api/stream (consumed).

## Done when
- The three levels behave as described in the mock E2E; test.cjs green.
