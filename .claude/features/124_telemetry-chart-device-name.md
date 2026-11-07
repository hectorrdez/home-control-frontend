---
id: "124"
slug: telemetry-chart-device-name
title: Telemetry charts show the device name
role: frontend
type: change
extends: "113"
---

# Telemetry charts show the device name

## Description
Each live chart in `/telemetry` (`SensorChartCard`, 113) shows the measured value ("Temperature") and the zone, but not which physical device it belongs to. Show the device too, so several "Temperature" charts can be told apart. Extends 113 (chart card), 115 (names) and 118 (panel filters). Frontend only.

## Requirements
- `SensorChartCard`: the secondary line under the title (`font-mono text-label-caps uppercase text-on-surface-variant`) becomes `{DEVICE} · {ZONE}` when the entity has a device name, else just `{ZONE}` as today.
- Device label = `entity.deviceName` cleaned with `cleanName` (same as /devices, 123). Absent/null/blank `deviceName` (backend without 009) -> zone only.
- Do not repeat: if the visible title (`names.shortName(entity)`) already contains the cleaned device name (case/accent-insensitive via `normalize`), omit the device part.
- A user alias on the entity (115) never replaces the device label.
- `aria-label` of the card region and the `role="img"` summary: `{label}, {device}` when device is shown; unchanged otherwise.
- `src/features/telemetry/widgetFilters.ts`: `ChartRow` gains `deviceName: string`; `filterRows` query also matches the (cleaned) device name; `TelemetryChartsGrid` fills it. Panel toggle list (118) may append the device name next to the label when present.
- DESIGN.md tokens only; no new component.

## Touches existing endpoints
no (consumes `deviceName` already returned by GET /api/entities, backend 009)

## Done when
- Unit tests: `SensorChartCard` with and without `deviceName`, title containing the device name (no repeat), `filterRows` matching by device name.
- test.cjs is green.
