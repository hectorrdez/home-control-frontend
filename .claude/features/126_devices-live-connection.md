---
id: "126"
slug: devices-live-connection
title: Devices list reflects connect/disconnect live
role: frontend
type: change
extends: "121"
---

# Devices list reflects connect/disconnect live

## Description
The `/devices` list must keep itself up to date: when a device goes offline (HA state `unavailable`) or comes back, its row changes without reloading, and the change is recorded in the event feed. The SSE stream (105) already exists, so first DIAGNOSE why the list does not follow, then fix it. Extends 121/123 (list), 105 (stream) and 111 (event feed).

## Requirements
- Diagnose (write the findings in the commit message / a note via `add-note.cjs`): does the stream deliver `state_changed` to `unavailable` and back? Does the reducer apply it to entities used by `buildDeviceRows`? Does the stream drop silently (no reconnect, no resync after reconnect)? Does `/devices` re-render on store updates? Fix whatever is found; if the cause is in the backend, do NOT change it here: add a note and report it.
- Device row online/offline: a row is OFFLINE when every member entity is `unavailable`/`unknown`-as-unavailable (reuse `isUnavailable` incl. the 124-era cover/scene/script exception); show a clear `StatusChip`/indicator (tokens only) on the row, updating live. Partially available devices stay online.
- Resync: after a stream reconnect the entity list is re-fetched once (as areas already are) so changes missed while disconnected are applied; also refetch when the tab becomes visible after >60 s hidden.
- Event feed (111/`state/feed.ts`): record transitions available -> unavailable ("disconnected") and unavailable -> available ("reconnected") for ANY entity domain, once per device per transition (dedupe members of the same device within 2 s). Keep the feed limit and ordering.
- Unit tests: reducer/feed transitions, row online/offline derivation, resync trigger. One Playwright spec with the mock (`?mock=` scenario or a mock drift that flips a device to unavailable and back) proving the row and the feed update without reload. Add the mock hook if none exists.

## Touches existing endpoints
GET /api/entities, GET /api/areas, GET /api/stream (consumed, no change).

## Done when
- Row shows OFFLINE then ONLINE live in the mock E2E; feed shows both events; test.cjs green.
