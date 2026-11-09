---
id: "144"
slug: climate-history-split-charts
title: Climate history split into separate temperature and humidity charts
role: frontend
type: change
extends: "131"
---

# Climate history split into separate temperature and humidity charts

## Description
The CLIMATE HISTORY card on `/telemetry` (`ClimateHistoryCard.tsx`, 112/131) draws everything in ONE chart with two Y axes: temperature room lines + total mean on the left axis and humidity on the right (0..100 %). With several rooms the lines cross and the humidity line is read against the wrong axis. This feature separates the lines: two stacked charts sharing the time axis and cursor, one for temperature and one for humidity, and humidity gets the same per-room lines as temperature in ALL ROOMS.

## Assumptions (card title only said "Separacion de la grafica de lineas en la pagina de Telemetria"; marked on the card)
- "Separación" = split the combined temperature/humidity chart into two charts (one metric per chart, one Y axis each). Not "one chart per room" (small multiples) and not the live sensor charts grid (113), which already has one chart per sensor.

## Requirements
- Same card, same room pills (ALL ROOMS + rooms) and range pills, same `useHistory` call (no new requests).
- Two `ResponsiveContainer` charts stacked, `TEMPERATURE` (height 180, unit °C, `auto` domain) and `HUMIDITY` (height 140, unit %, domain `auto` clamped to 0..100 with padding instead of the fixed 0..100, so small variations are visible). Each has its own small label-caps title. Same X axis domain and ticks in both (shared `rows`), X tick labels only on the bottom chart.
- ALL ROOMS (2+ rooms with data): temperature = per-room lines (zone color, 1.5px) + thicker TOTAL MEAN (131 unchanged). Humidity = per-room lines in the same zone colors + TOTAL MEAN, built with the same per-room merge helper from `history.ts` (extend it to take a device class; humidity rooms with no data are skipped). Single room: temperature area (room zone color) and humidity line in the chart below.
- Shared cursor: hovering either chart or using the keyboard slider (existing arrows behaviour) draws the `ReferenceLine` on BOTH charts; the readout line lists room temps + mean, then room humidity + mean. Tooltip per chart shows only its metric.
- Legend once, under both charts (rooms with `ZoneDot` + TOTAL MEAN), shared by both.
- Accessibility: each chart wrapper `role="img"` with its own `aria-label` (`<room> temperature, <range>: <summary>` / `<room> humidity, <range>: <summary>`); the sr-only table keeps one column per room temperature, total mean temperature, one per room humidity, total mean humidity.
- Summary line unchanged in content (PEAK, TEMP VARIANCE, HUMIDITY mean).
- Layout: no overlap at 360px / 768px / desktop; the card may grow in height but `/telemetry` keeps its existing scroll behaviour.
- `data-testid`s kept where tests rely on them (`climate-room-line`, `climate-mean-line`, `climate-temp-area`, `climate-humidity-line`); humidity room lines get `climate-humidity-room-line`.

## Touches existing endpoints
no (same HomeApi.getHistory calls as 112)

## Done when
**Unit (Vitest)**
- Merge helper per device class; humidity room lines skip empty rooms; component: two charts rendered, ALL ROOMS = N temperature room lines + mean AND N humidity room lines + mean, single room = area + one humidity line; shared cursor sets the reference line in both; sr-only table columns.

**E2E (Playwright, mock)**
- `/telemetry` ALL ROOMS: two charts (TEMPERATURE and HUMIDITY titles visible), legend entries = rooms + TOTAL MEAN; switching to one room keeps two charts; at 360px the two chart bounding boxes do not intersect each other nor the selector buttons.
- test.cjs green.
