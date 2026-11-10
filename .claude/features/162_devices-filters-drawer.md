---
id: "162"
slug: devices-filters-drawer
title: Device panel filters hidden by default, opened in a side drawer with switches
role: frontend
type: change
extends: "121"
---

# Device panel filters in a side drawer with switches

## Description
In the Device panel (home), the actuator-type pills and the zone pills are always visible and the SlidersHorizontal button only toggles them in line. The user wants them hidden by default and shown only when pressing that button, with the same interaction and format as the CHARTS button in telemetry (a left SideDrawer with simple switch toggles, no pills). The All devices button is removed.

## Requirements
- `src/components/panels/DevicePanel.tsx`:
  - Remove the `All devices` ButtonLink. The `/devices` route and the Navigation entry stay.
  - Remove the in-line `Device filters` and `Rooms` pill groups and the `filtersShown` toggle logic (hiding no longer clears filters).
  - Replace the `FilterPill` with a `Button variant="secondary"` using the `SlidersHorizontal` icon and the text `FILTERS`, `aria-expanded` bound to the drawer state, like CHARTS in `TelemetryChartsGrid`. When something is switched off the label is `FILTERS · n` (n = number of switched-off types plus zones).
  - Open a `SideDrawer side="left" title="Filters"` (closes with ESC, backdrop and close button, as CHARTS).
- Drawer content, same format as the CHARTS drawer: `ALL` / `NONE` secondary buttons; list `Actuator types` and list `Rooms`, each row `li` with label + device count and a `Switch` (`aria-label` `Show <label>`), classes as in the charts rows. No pills. Only rooms/types with devices are listed.
- Semantics change (single select -> multi visibility): all switches on by default = every device visible. A device is shown when its type switch AND its room switch are on. `ALL` turns every switch on, `NONE` turns every switch off (empty list shows the existing empty state). Closing the drawer keeps the state. State is not persisted (resets on load), like 118.
- `src/features/devices/deviceFilters.ts`: add the pure multi-visibility logic (hidden types set, hidden rooms set -> filtered devices, counts) with unit tests. Keep the existing single-select helpers used by `DevicesPage` and `DeviceFilters.tsx` untouched; `/devices` keeps its pills.
- Reuse `SideDrawer`, `Switch`, `Button`; DESIGN.md tokens only, `lint:tokens` clean. Mock and live work the same.
- Tests: `DevicePanel.test.tsx` (no filters by default, no All devices link, open/close drawer, switch type/room, ALL/NONE, state kept after close, `FILTERS · n`), `deviceFilters.test.ts`. E2E in the testing repo is updated separately.

## Touches existing endpoints
no

## Done when
- The Device panel shows no filter pills by default; the FILTERS button opens a left drawer with switches for types and rooms, like CHARTS.
- Switching a type or room off hides its devices; the filters survive closing the drawer.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
