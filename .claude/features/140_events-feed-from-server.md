---
id: "140"
slug: events-feed-from-server
title: Event feed backed by the server event log + HA link indicator
role: frontend
type: change
extends: "111"
---

# Event feed backed by the server event log + HA link indicator

## Description
The event feed (111) is session-only: it starts empty on every load and differs per device. With backend 018/019 it is seeded from the persistent event log (`GET /api/events`) and kept live with `event` SSE frames, so every device shows the same recent history (actions from any device, config changes, availability, HA link, alerts). Also shows when the backend lost Home Assistant (`ha_link`), closing the 126 gap. Depends on 132 and backends 018 + 019.

## Requirements
- `HomeApi.listEvents(q: { types?: string[]; entityId?: string; from?: string; to?: string; before?: string; limit?: number }): Promise<LoggedEvent[]>` (`GET /api/events`), live + mock (mock: in-memory log fed by its own actions/config writes/alerts, newest first, same param validation, `?mock=no-events` -> `not_found`).
- `src/state/feed.ts`: `fromLoggedEvent(e, names)` maps server types to `FeedEvent`: `action` ("<name> <action> by <clientName>" / failed variant), `availability` (ONLINE / OFFLINE), `config_changed` ("<resource> changed by <clientName>"), `alert` (keeps the 129 alert style/level), `alert_acked`, `ha_link` ("HOME ASSISTANT LINK LOST" / "RESTORED"). Unknown types ignored. Names through `useEntityName` (115).
- Feed source: at start `listEvents({ limit: 50 })`; live `event` frames prepended; dedupe by server id. Local session entries from 111 `recordChange` for STATE changes stay (the server does not log plain state changes) and merge by time; when the server feed is available, local entries that duplicate a server `action`/`availability` entry (same entity, same transition, within 5 s) are dropped. Backend without `/api/events` (404) -> 111 behaviour unchanged.
- Reconnect -> `listEvents({ limit: 50 })` again and merge.
- HA link indicator: `ha_link connected=false` -> the header status (existing `useHaStatus` chip) shows "HA LINK LOST" (error tokens) until `connected=true`; does not replace the stream connection state from 105.
- Feed cap unchanged (same max entries as 111).

## Touches existing endpoints
GET /api/events (backend 018), GET /api/stream (`event`, `ha_link`; backend 018/019).

## Done when
**Unit (Vitest)**
- `fromLoggedEvent` for each type + unknown ignored; seed + live merge with dedupe by id; local/server duplicate drop within 5 s; 404 fallback keeps 111 behaviour; `ha_link false/true` toggles the header chip text.

**E2E (Playwright, mock)**
- `realtime-updates.spec.ts` or new `event-feed.spec.ts`: run a device action -> feed shows it with the client name; reload -> the entry is still there (seeded from the mock log); `?mock=ha-link-drop` (new: emits `ha_link false` after 1 s, `true` after 3 s) -> header shows HA LINK LOST then clears.
- test.cjs green.
