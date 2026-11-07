---
id: "138"
slug: resources-live-refetch
title: Aliases, calibrations and alert rules update live across devices
role: frontend
type: change
extends: "115"
---

# Aliases, calibrations and alert rules update live across devices

## Description
Aliases (115), cover calibrations (127) and alert rules (128) are already stored by the backend, but each panel loads them once, so an edit on one device only appears on another after a reload. With backend 016 `resource_changed` frames (parsed in 132), the providers refetch when another device changes them. Depends on 132 and backend 016.

## Requirements
- `AliasesProvider`, `CalibrationsProvider`, `AlertRulesProvider`: subscribe to `subscribeServerEvents`; on `resource_changed` for their resource (`aliases` | `calibrations` | `alert_rules`) and `!isOwnChange(e)` -> refetch the list (debounce 300 ms; at most one request in flight, a change during the request schedules one more). Own changes are already applied from the write response.
- Also refetch once after a stream reconnect (`ready` following a drop) because frames may have been missed.
- An open edit form (rename field 115, rule form 128, calibration wizard 127) is NOT overwritten: providers update the lists; forms keep their local draft. If the item being edited was deleted remotely, the form shows the existing not-found error path on save.
- A refetch failure keeps the old list (no error UI flash); next frame retries.
- Mock: `?mock=remote-change` (132) drives the E2E.

## Touches existing endpoints
GET /api/aliases, GET /api/calibrations, GET /api/alert-rules (refetch), GET /api/stream (`resource_changed`).

## Done when
**Unit (Vitest)**
- Each provider: remote frame -> one refetch (3 frames in 100 ms -> 1 request); own change -> no refetch; other resource -> no refetch; reconnect -> refetch; failure keeps the list.

**E2E (Playwright, mock)**
- `display-names.spec.ts` (extend) with `?mock=remote-change`: the device card name changes to the new alias within 3 s without reload.
- test.cjs green.
