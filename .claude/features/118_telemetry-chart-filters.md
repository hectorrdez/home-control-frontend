---
id: "118"
slug: telemetry-chart-filters
title: Telemetry chart panel filters
role: frontend
type: change
extends: "113"
---

# Telemetry chart panel filters

## Description
Add search and filters to the left "CHARTS" side panel of `/telemetry` (`TelemetryChartsGrid` + `SideDrawer`) so the user can quickly find the chart to enable or disable. Draft for Opus to refine; also formalizes that panel (switch per sensor, ALL/NONE), which was built without a feature. Takes over the search/filter bullet of 114.

## Requirements
- Search box: match on `displayName`/alias (feature 115), zone name and entity id.
- Zone filter: multi-select chips from areas that have numeric sensors, with counts.
- Category filter: as many categories as possible, derived from `device_class` / unit (temperature, humidity, CO2, PM2.5, PM10, power, energy, voltage, current, battery, illuminance, other, ...); multi-select chips with counts. Reuse `FilterPill`.
- State filter: ALL / ON / OFF (chart visible or hidden).
- AND between groups, OR within a group; CLEAR button and `N of M` counter; `NO MATCHES` empty state.
- ALL / NONE act only on the filtered list.
- Filters are NOT persisted: reset on every load. Only the widget model stays in localStorage (113).
- Pure filter logic in `src/features/telemetry/widgetFilters.ts` with unit tests; panel only renders it.
- 114 must not reimplement search/filter (note it).

## Touches existing endpoints
no

## Done when
- Search, zone, category and state filters narrow the list; toggling a filtered chart works; filters reset on reload.
- Unit tests for the filter module + Playwright (mock) journey; test.cjs is green (the real gate; mark-ended.cjs enforces it).
