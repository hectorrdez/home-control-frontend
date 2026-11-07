---
id: "132"
slug: client-identity-server-events
title: Client identity + server events on the SSE stream
role: frontend
type: change
extends: "105"
---

# Client identity + server events on the SSE stream

## Description
Foundation for cross-device sync (persistence decision 2026-11-07: backend gets Postgres, settings/alerts/events move server-side). Each panel (browser or Electron) gets a stable client id and a readable name sent to the API, and the stream subscription learns the new backend SSE events (`resource_changed`, `event`, `ha_link`, `alert`, `alert_acked`). No UI change. Needs backend 016 for live; unknown frames are ignored, so it is safe against an older backend.

## Requirements
- `src/api/clientIdentity.ts`: `getClientId()` = UUID v4 from `crypto.randomUUID()`, persisted in `localStorage` key `hc.client.v1` (`{ v: 1, id }`); storage unavailable or corrupt -> a new id kept in memory for the session (never throws). `getClientName()` = `"Electron"` when running in the 107 shell (reuse its existing detection), else `"<Browser> <OS>"` from `navigator.userAgent` (Firefox/Chrome/Edge/Safari x Windows/macOS/Linux/Android/iOS, else `"Browser"`), max 40 chars.
- `liveApi.request` adds headers `X-Client-Id` and `X-Client-Name` on every call. `streamUrl` adds `&clientId=<id>` (token handling unchanged, never logged).
- `src/api/types.ts`: `ServerEvent` union:
  - `{ type: "resource_changed"; resource: "aliases" | "calibrations" | "alert_rules" | "settings"; keys: string[]; by: string | null }` (`keys: []` = refetch all)
  - `{ type: "event"; event: LoggedEvent }` with `LoggedEvent = { id: string; ts: string; type: string; source: string; entityId: string | null; level: string | null; clientId: string | null; clientName: string | null; payload: Record<string, unknown> }`
  - `{ type: "ha_link"; connected: boolean; at: string }`
  - `{ type: "alert"; alert: ServerAlert }`, `{ type: "alert_acked"; id: string; ackedAt: string; ackedBy: string | null }` with `ServerAlert = { id; ruleId: string | null; entityId; level: "low" | "medium" | "high"; text; firedAt; ackedAt: string | null; ackedBy: string | null; clientId: string | null }`.
- `liveSubscribe.ts`: `parseServerEvent(eventName, data): ServerEvent | null` (malformed -> null, never throws). `HomeApi.subscribe(onEntity, onConnection, onServerEvent?)`: optional third callback; live impl registers `addEventListener` for the five names. Existing callers unchanged.
- Server-event fan-out for the app: `src/api/serverEvents.ts` tiny pub/sub (`subscribeServerEvents(fn) => unsubscribe`, `publishServerEvent(e)`); `EntitiesProvider` (owner of the single subscription) passes `publishServerEvent` as the third callback. One SSE connection per panel stays the rule.
- Helper `isOwnChange(e)` = `e.by === getClientId()` (consumers skip refetch for their own writes when they already have the result).
- Mock (`createMockApi`): supports the third callback; its own writes (aliases, calibrations, alert rules, later settings) emit `resource_changed` with `by` = mock client id; new scenario `?mock=remote-change` emits, 1 s after subscribe, `resource_changed { resource: "aliases", keys: [<first alias entity>], by: "other-device" }` after changing that alias in the mock store (simulates another device).
- Update `.claude/endpoints.md` copy from the backend repo (after backend 016).

## Touches existing endpoints
GET /api/stream (new frames, `clientId` query); every request gets `X-Client-Id` / `X-Client-Name` (backend 016).

## Done when
**Unit (Vitest)**
- clientIdentity: id created once and reused; corrupt storage -> new id; storage throwing -> in-memory id stable within the session; name for Electron and 3 UA samples, <= 40 chars.
- liveApi sends both headers (fake fetch); streamUrl has `clientId`.
- parseServerEvent: each of the 5 types valid; malformed JSON / missing fields -> null.
- Fake EventSource: `resource_changed` frame reaches `onServerEvent`; entity events unchanged; subscribe without the third arg still works.
- serverEvents pub/sub + `isOwnChange`.

**E2E (Playwright, mock)**
- none new (no UI); existing suite green (`realtime-updates`, `devices-live-connection` unaffected).

**Bruno**
- n/a (frontend). test.cjs green.
