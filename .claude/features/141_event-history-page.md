---
id: "141"
slug: event-history-page
title: History page (query the event log)
role: frontend
type: feature
extends: null
---

# History page (query the event log)

## Description
A new `/history` page to look back at what happened: device actions (who/which device), alerts and acknowledgements, availability, HA link and configuration changes, filtered by type, device and date range, with paging. Reads backend 018 `GET /api/events` through `listEvents` (140). Depends on 140.

## Requirements
- Route `/history` in `routePaths.ts` + nav entry "HISTORY" in the existing shell navigation (same component/pattern as the other entries; DESIGN.md tokens only, reuse `FilterPill`, `Button`, dropdowns from `src/components/`).
- Filters (state in the URL query so a view can be shared/reloaded: `?types=action,alert&entity=<id>&from=<yyyy-mm-dd>&to=<yyyy-mm-dd>`):
  - Type pills (multi): ACTIONS (`action`), ALERTS (`alert`,`alert_acked`), AVAILABILITY (`availability`), HA LINK (`ha_link`), CHANGES (`config_changed`). None selected = all.
  - Device: existing searchable dropdown over entities, labels from `useEntityName().displayName`.
  - Date range: two native `input type="date"`; `from` > `to` -> inline error "FROM MUST BE BEFORE TO", no request.
- List: `role="list" aria-label="Event history"`, newest first, each row: local time, type label, device display name (or "SYSTEM"), text (same mapping as 140 `fromLoggedEvent`), "by <clientName>" when present, level badge for alerts (existing level colors from 128/129). 100 per page; "LOAD MORE" uses `before=<last id>`; hidden when a page returns < 100.
- States: loading skeleton (existing pattern), empty "NO EVENTS FOR THESE FILTERS", error "HISTORY UNAVAILABLE" with RETRY, backend 404 -> "HISTORY NOT AVAILABLE ON THIS SERVER".
- Live: while on page 1 with no `to` filter, new `event` frames matching the filters are prepended.
- Mock: seeded log with >= 120 events across all types (deterministic with `?seed=`).

## Touches existing endpoints
GET /api/events (backend 018), GET /api/stream (`event`).

## Done when
**Unit (Vitest)**
- URL <-> filter state round trip; from > to blocks the request; query built from filters; LOAD MORE uses the last id and hides on a short page; live frame prepended only when it matches and no `to`; 404 / error / empty states.

**E2E (Playwright, mock; page object `e2e/pages/history.ts`, spec `e2e/specs/history.spec.ts`)**
1. Nav HISTORY -> list shows 100 rows; LOAD MORE -> more rows; reaching the end hides LOAD MORE.
2. Select ALERTS -> only alert rows; URL has `types=`; reload keeps the filter.
3. Pick a device -> only its rows; invalid range shows the error.
4. `?mock=no-events` -> "HISTORY NOT AVAILABLE ON THIS SERVER".
- test.cjs green.
