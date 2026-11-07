---
id: "125"
slug: telemetry-fixed-panels-toggle
title: Telemetry fixed panels can be turned on/off
role: frontend
type: change
extends: "113"
---

# Telemetry fixed panels can be turned on/off

## Description
`/telemetry` has always-on panels the user cannot hide: KPI cards (Climate mean, Air quality, Power, Nodes), the "Levels" ring gauges (any sensor in `%`, which includes phone `battery_level` such as "Bateria 82 %") and the Climate history / Power history cards. Let the user turn each one on/off from the CHARTS side panel (118). Extends 113 and 118. Frontend only.

## Requirements
- New pure module `src/features/telemetry/panelVisibility.ts` (no React): panel ids `kpi:climate|air|power|nodes`, `history:climate`, `history:power`, `gauge:<entityId>` (and `gauge:avg:humidity`); `isHidden(id, hidden)`; storage key `hc.telemetry.panels.v1` storing `{ v: 1, hidden: string[] , seen: string[] }` with try/catch around every read/write (page works with storage unavailable).
- Default: everything visible, EXCEPT ring gauges whose entity has `device_class === "battery"` (phone batteries), hidden the first time they are seen (tracked in `seen`, so a later user toggle ON is respected).
- `TelemetryPage`: KPI cards, each gauge in "Levels" (omit the whole section when none visible), ClimateHistoryCard and PowerHistoryBars render only when not hidden. `ringGauges` stays pure; filtering happens in the page. Gauge entries need the entity's device_class exposed (extend `GaugeReading` with `deviceClass`).
- CHARTS panel (`TelemetryChartsGrid` / `ChartFilters`, 118): new group "Fixed panels" below the chart toggles list: one `Switch aria-label="Show {label}"` per available panel (only panels that exist: no gauge entry if the sensor is absent, no KPI if its data is absent). Labels: KPI titles, "Climate history", "Power history", gauge label (displayName). The 118 search query also filters this group; ALL/NONE buttons stay chart-only.
- State shared between page and panel via a small hook `usePanelVisibility()` (React state + storage), provided where both can reach it (page passes props or context; no global singleton).
- DESIGN.md tokens only; reuse `Switch`.

## Touches existing endpoints
no

## Done when
- Unit tests: panelVisibility (defaults, battery gauge default hidden, user toggle persists, storage throwing), page hides/shows panels, panel switches toggle them.
- test.cjs is green.
