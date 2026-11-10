---
id: "163"
slug: telemetry-charts-add-flow
title: Charts drawer lists devices with ADD, field picker popup and filter modal
role: frontend
type: change
extends: "118"
---

# Charts drawer: devices, ADD flow, field popup and filter modal

## Description
The left CHARTS drawer of `/telemetry` (113/118) lists one `Switch` per numeric sensor entity, with search and inline pills (zone, category, visibility). The user wants it simpler: the list shows physical DEVICES (not entities), each with an ADD button; ADD opens a popup to choose which field (temperature, humidity, battery...) becomes a chart, and that field can be changed later from edit mode (114/159). Above the list: a search box and a filter button that opens a modal (zone, field category, device kind, added/not added) instead of inline pills.

## Decisions (agreed with the user)
- The word in the UI is DEVICE, never "sensor". Grouping by device reuses feature 123 (`deviceName` + area key via `deviceSlug`, standalone entities are their own device). Backend without `deviceName` -> every entity is its own device.
- A device with exactly one chartable field: ADD adds it directly, no popup. With 2+ fields: popup with one checkbox per field (label = displayName, category label, current value), at least one must be checked to confirm.
- Filter by field/category acts on the device: a device passes when ANY of its fields is of the chosen category (e.g. HUMIDITY = devices that have a humidity value).
- Device kind filter (proposed by the user, definition fixed here): `SENSOR` = the device has at least one measurement field (category temperature, humidity, co2, voc, pm25, pm10, pressure, illuminance, power, energy, voltage, current, frequency, gas, water). `ACTUATOR` = the device has at least one controllable entity (domain light, switch, cover, climate, lock, fan, scene, script, media_player), whatever fields it also has (battery, signal, connection, state). A device can be both (e.g. a smart plug with power). A device with only battery/signal/other fields and no controllable entity is OTHER. The filter is multi-select (SENSOR, ACTUATOR, OTHER; none selected = all).
- Still one widget per entity (no layout migration, `hc.telemetry.widgets.v1` / synced setting stays as is). ADD sets `visible: true` on the chosen field widgets, creating them if absent. Removing = REMOVE button on an added device (sets `visible: false` on all its widgets) or per field from the popup (re-open with EDIT).
- Fixed panel toggles (125) and climate card toggles (159) keep their switches in the drawer, unchanged.

## Requirements
- `src/features/telemetry/widgetFilters.ts` (pure): extend with device rows: `DeviceRow { key, name, zoneId, zoneName, fields: ChartRow[], kinds: Set<"sensor"|"actuator"|"other">, added: boolean }`, `buildDeviceRows(rows, entities)`, `kindsOf(device)`, `filterDevices(devices, filters)`; `ChartFilters` gets `kinds: DeviceKind[]` and `visibility` renamed semantics (all / added / not added). Keep `categoryOf`, `facetCounts` (counts per device now), `normalize`. Search matches device name, field labels, zone name, entityIds.
- `src/components/panels/ChartFilters.tsx` becomes: search input + `FILTERS` button (secondary, `aria-expanded`, `FILTERS · n` when active) + counter `{shown} OF {total}` + `CLEAR`. Filter modal (reuse the app modal/dialog primitive used for the reset confirmation in `TelemetryChartsGrid`): groups Zones, Fields (categories), Kind, Status (ALL / ADDED / NOT ADDED) with the same pills as 118 inside the modal, `APPLY`/`CLOSE`. Filters stay session state, never persisted (118 rule).
- `TelemetryChartsGrid` drawer list: `<ul aria-label="Devices">`, each row: device name, zone, field count, status chip ADDED n/m, button `ADD` (or `EDIT` + `REMOVE` when added). `ALL`/`NONE` buttons are replaced by none; no bulk add (keep it simple).
- Field popup (`FieldPickerDialog`): title = device name, checkbox list, confirm `ADD`/`SAVE`, cancel. Focus trap and ESC via the existing dialog primitive. Announce result in the existing aria-live region.
- Changing the field later from edit mode (114/159 chart edit bar): add a `FIELD` control on a chart of a multi-field device that opens the same popup for that device in single-replace mode (swap entityId inside the same device, keep position and size). Single-field devices do not show it.
- DESIGN.md tokens only, `lint:tokens` clean. Mock and live work the same.
- Unit tests: device grouping/kind/category filters in `widgetFilters.test.ts`, `ChartFilters` (search, modal, clear, counter), `TelemetryChartsGrid` (ADD single-field direct, multi-field popup, REMOVE, EDIT, FIELD swap keeps position/size), `FieldPickerDialog`. Existing 118/125/159 tests updated. E2E in the testing repo updated separately.

## Touches existing endpoints
no (entities and history already consumed; see endpoints.md)

## Done when
- The CHARTS drawer lists devices with ADD; ADD on a multi-field device opens the field popup; the filter modal narrows by zone, field, kind and status; search sits above the list.
- A chart's field can be swapped from edit mode without losing its place.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
