---
id: "111"
slug: telemetry-view
title: Telemetry and sensors view (live)
role: frontend
type: feature
extends: null
---

# Telemetry and sensors view (live)

## Description
The `/telemetry` screen from `design/stitch/telemetry_sensors_analytics/code.html`, limited to what Home Assistant current states provide: KPI cards, ring gauges for percentage sensors and a live event feed. History charts are 112. Everything is derived from the 103 store kept live by 105.

## Requirements
- Page header: title "Telemetry & sensors" (headline), `label-caps` subline "<N> SENSORS • LIVE" with a beacon reflecting 105 connection state.
- KPI row (KpiCard, new in `src/components/cards`), each hidden if its source entities are absent:
  - CLIMATE MEAN: mean of temperature sensors (`device_class: temperature`), with MIN/MAX and the rooms they belong to.
  - AIR QUALITY: CO2 (ppm) and PM2.5 (µg/m³) values with a grade chip (CO2 <800 GOOD secondary, <1200 FAIR tertiary, else POOR error; thresholds in one constants file).
  - POWER: current house power (W/kW per DESIGN.md formatting), "TODAY <x> kWh" from an energy sensor, "SOLAR <x>" if a solar power sensor exists.
  - NODES: entities total / available (`state !== "unavailable"`), as "<a>/<t> ONLINE" and percentage.
- Ring gauges (RingGauge, new in `src/components/cards`): one per sensor with `unit_of_measurement: "%"` that is not humidity-per-room (e.g. filter life, battery, average humidity), max 6, sorted by lowest value first; arc hue secondary >50, tertiary 20-50, error <20.
- Event feed: newest-first list (max 50, in memory, this session only) of stream events that change state for binary_sensor, lock, cover, climate hvac_action, light/switch on/off; each item icon + "<Name> <new state>" + mono time + area. Empty state "WAITING FOR EVENTS". Note in UI copy that the feed is session-only (HA logbook endpoint does not exist in the backend).
- Drop from the reference anything not backed by HA data (mesh latency, packet loss, routing core, CPU/RAM, fake costs).
- Header status strip slot (109): "SENSORS <n> • <a>/<t> ONLINE" shown on desktop.
- Layout per reference: KPI row 4 cols desktop / 2 tablet / 1 mobile; gauges grid; feed column `xl:col-span-4`; reserve a `xl:col-span-8` region labelled "Climate history" with a placeholder that 112 fills.
- States: loading skeletons, empty (no sensors), error with Retry (reuses store error).
- Coverage choice: unit for the derivation selectors (climate mean/min/max, AQ grade thresholds, power formatting, nodes count, gauge selection/sort/hue). Playwright (mock mode): `/telemetry` shows the 4 KPIs with fixture values; a mock stream motion event appears at the top of the feed; `?mock=empty` shows the empty state. Page object `e2e/pages/telemetry.ts`.

## Touches existing endpoints
no new ones (uses store fed by GET /api/areas and GET /api/stream)

## Done when
- `/telemetry` renders KPIs, gauges and the live feed from the mock house and updates live.
- Selectors unit-tested; journey covered by E2E.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
