---
id: "105"
slug: realtime-updates
title: Live updates
role: frontend
type: feature
extends: null
---

# Live updates

## Description
Keep the panel (and later the 3D view and telemetry) in sync with Home Assistant without polling, through `HomeApi.subscribe` (SSE in live mode, simulated stream in mock mode).

## Requirements
- Implement `liveApi.subscribe` with `EventSource` on `GET /api/stream` (backend 005). EventSource cannot send headers: pass the token as the query parameter agreed with the backend (`?token=`) or a same-origin cookie; record the decision in notes.md and flag it to the backend if 005 does not support it yet.
- Reconnect with exponential backoff (1 s, 2 s, 4 s ... max 30 s, jitter); report `reconnecting`/`open` to `onConnection`; close on unmount. After reconnect, re-fetch `getAreas()` once to recover missed changes.
- A single app-level subscription (provider) merges entity events into the 103 store by `entityId`; events for unknown entities are added to their area (or unassigned).
- Reconcile with 104 optimistic updates: an event for a pending entity confirms it if it matches the expected state, otherwise it wins only if its `lastChanged` is newer than the action start.
- Connection state in the header (DESIGN.md "States"): beacon amber + chip "RECONNECTING" while not open; values keep last known state.
- Coverage choice: unit for backoff schedule, merge and reconcile rules (pure functions); Playwright (mock mode): a mock stream drift changes a sensor value on screen without reload; `?mock=stream-drop` shows RECONNECTING then returns to ONLINE.

## Touches existing endpoints
yes: consumes GET /api/stream (backend 005) via `HomeApi.subscribe`

## Done when
- Pushed events update modules without reload; drop + recovery visible and covered.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
