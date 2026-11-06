---
id: "112"
slug: telemetry-history
title: Telemetry history charts
role: frontend
type: feature
extends: null
---

# Telemetry history charts

## Description
Fill the "Climate history" region of `/telemetry` (111) with the reference's temperature/humidity chart and the hourly power bars, using `HomeApi.getHistory`. Mock-first; the live path depends on a backend history endpoint that does not exist yet (backend features 001-006 do not include it).

## Requirements
- Proposed backend contract (to request as a new backend feature, e.g. backend 007; record in notes.md): `GET /api/history?entityIds=a,b&hours=24` -> `data: HistorySeries[]` (102 types), numeric states only, server-side downsampled to <=200 points per series, wraps HA `GET /api/history/period/<start>?filter_entity_id=...&minimal_response`.
- `liveApi.getHistory` implements that call; a 404/not_found maps to a dedicated "HISTORY NOT AVAILABLE" state in the region (not an error banner), so production works before the backend ships it.
- Climate chart: SVG, no chart library (lines + gradient area as in the reference; hand-rolled with a small scale helper). Two series per selected room: temperature (tertiary, left axis °C) and humidity (primary-container, right axis %). Room chips "ALL ROOMS" (= mean across rooms) + per area; range tabs 6H / 24H / 7D / 30D. Hover/focus crosshair with tooltip "<time> <temp> °C <hum> %" in mono; keyboard: arrow keys move the crosshair when the chart is focused.
- Summary line under the chart: PEAK (time + value), TEMP VARIANCE (max-min over the range), HUMIDITY mean.
- Power bars: hourly kWh/average W bars for the house power sensor over 24 h (secondary fill, peak bar highlighted tertiary), hidden if no power sensor.
- Data: fetch on range/room change, cache per (ids, hours) for 60 s; abort stale requests.
- Accessibility: each chart has `role="img"` + `aria-label` summary and a visually hidden data table alternative.
- Coverage choice: unit for scale/downsampling, summary stats, series merging for ALL ROOMS, 404 mapping. Playwright (mock mode): range tab 6H -> 24H changes the summary text; selecting "Kitchen" changes the chart label; `?mock=no-history` shows "HISTORY NOT AVAILABLE".

## Touches existing endpoints
yes: consumes proposed GET /api/history (NOT yet in backend; needs a new backend feature)

## Done when
- Charts render from mock history with range and room switching, tooltip and keyboard crosshair.
- Live mode degrades to "HISTORY NOT AVAILABLE" until the backend endpoint exists.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
