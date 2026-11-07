---
id: "137"
slug: chart-filters-synced
title: Persist telemetry chart filters as a shared setting
role: frontend
type: change
extends: "118"
---

# Persist telemetry chart filters as a shared setting

## Description
Reverses the 118 decision "filters are never persisted": the user now wants filters recorded and shared. The CHARTS side panel filters (query, zones, categories, visibility) are stored in the shared setting `telemetry.filters` (134) and restored on load on every device. Depends on 134.

## Requirements
- `src/features/telemetry/widgetFilters.ts`: `filtersSetting = createSyncedSetting({ key: "telemetry.filters", parse })` (no legacyKey: never stored before). Value `{ v: 1, query, zones, categories, visibility }`; `parse` validates types (query string <= 100 chars, zones string[] <= 50, categories only known `ChartCategory` ids (unknown dropped), visibility in `all|on|off`), else null.
- `TelemetryChartsGrid`: initial filters = `filtersSetting.get()` mapped to `ChartFilters`, else `EMPTY_FILTERS`; changes saved through `set` (the store debounces 500 ms, so typing in the search box writes once). Remote change applies live, except while the search input has focus (apply on blur) to avoid replacing what the user is typing.
- Stale zone ids (zone deleted in HA): when restoring, drop zone ids that are not in the current `facetCounts` zones, so a deleted zone never hides every chart. The stored value is only rewritten on the next user change.
- The "CLEAR FILTERS" action (118, if present) writes `EMPTY_FILTERS`.

## Touches existing endpoints
GET/PUT /api/settings/telemetry.filters (backend 017), GET /api/stream.

## Done when
**Unit (Vitest)**
- parse: valid, overlong query, unknown category dropped, bad visibility -> null; unknown zone ids dropped at read; grid restores filters from the setting; typing triggers one `set` after debounce; remote change ignored while input focused and applied on blur.

**E2E (Playwright, mock)**
- `telemetry-charts.spec.ts` (extend): set zone + category filters, reload -> CHARTS panel shows the same filters and the same filtered list; clear -> reload -> no filters.
- test.cjs green.
