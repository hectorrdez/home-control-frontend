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
Add search and filters to the left "CHARTS" side panel of `/telemetry` (`TelemetryChartsGrid` + `SideDrawer`) so the user can quickly find the chart to enable or disable. Also formalizes that panel (one `Switch` per numeric sensor, ALL/NONE), built in 113 without its own feature. Takes over the search/filter bullet of 114 (114 must not reimplement it; already in notes.md).

## Requirements
**Module `src/features/telemetry/widgetFilters.ts`** (pure, no React, no storage):
- `type ChartCategory` + `CATEGORIES: readonly { id: ChartCategory; label: string }[]` in this fixed display order (id / UPPERCASE label):
  `temperature` TEMPERATURE, `humidity` HUMIDITY, `co2` CO2, `voc` VOC, `pm25` PM2.5, `pm10` PM10, `pressure` PRESSURE, `illuminance` LIGHT, `power` POWER, `energy` ENERGY, `voltage` VOLTAGE, `current` CURRENT, `frequency` FREQUENCY, `battery` BATTERY, `signal` SIGNAL, `data_rate` NETWORK, `gas` GAS, `water` WATER, `other` OTHER.
- `categoryOf(entity)`: 1) by `attributes.device_class` (string, lowercase): temperature; humidity; carbon_dioxide|co2 -> co2; volatile_organic_compounds|volatile_organic_compounds_parts -> voc; pm25; pm10; pressure|atmospheric_pressure -> pressure; illuminance; power|apparent_power|reactive_power -> power; energy -> energy; voltage; current; frequency; battery; signal_strength -> signal; data_rate -> data_rate; gas; water. 2) else by exact `unit_of_measurement`: °C|°F|K -> temperature; ppm -> co2; µg/m³ -> other (ambiguous PM size); hPa|mbar|Pa|kPa|bar|psi|inHg|mmHg -> pressure; lx -> illuminance; W|kW|MW -> power; Wh|kWh|MWh -> energy; V|mV -> voltage; A|mA -> current; Hz|kHz|MHz|GHz -> frequency; dBm|dB -> signal; bit/s|kbit/s|Mbit/s|Gbit/s|B/s|kB/s|MB/s -> data_rate; m³|ft³ -> gas; L|gal -> water. `%` alone is NOT mapped (humidity/battery need device_class). 3) else `other`.
- `const UNASSIGNED_ZONE = "unassigned"`; zone id of a sensor = `entity.area ?? UNASSIGNED_ZONE`.
- `interface ChartRow { widget: Widget; entity: Entity; label: string /* displayName */; zoneId: string; zoneName: string }`.
- `type Visibility = "all" | "on" | "off"`; `interface ChartFilters { query: string; zones: string[]; categories: ChartCategory[]; visibility: Visibility }`; `EMPTY_FILTERS` (query "", [], [], "all"); `isFiltered(f)` true when any field differs from EMPTY_FILTERS (query compared after trim).
- `normalize(s)`: lowercase, NFD + strip combining marks, trim. `filterRows(rows, f)` keeps rows that pass ALL groups: query (normalized substring of label OR raw `entity.name` OR zoneName OR entityId; empty query passes); zones (empty passes, else zoneId in list = OR); categories (empty passes, else categoryOf in list = OR); visibility (on = `widget.visible`, off = `!widget.visible`). Input order preserved (widget order).
- `facetCounts(rows)` -> `{ zones: { id; name; count }[]; categories: { id; label; count }[] }` over ALL rows (not the filtered set, counts are static). Only count > 0 entries. Zones sorted by name (`localeCompare`), unassigned last; categories in CATEGORIES order.

**Panel** (`TelemetryChartsGrid` builds rows with `names.displayName` and the `areaName` prop; new `src/components/panels/ChartFilters.tsx` renders the controls; grid keeps ALL/NONE + list):
- Filter state is plain `useState(EMPTY_FILTERS)` in `TelemetryChartsGrid`; never written to storage, URL or context (reset on every load; closing/reopening the drawer keeps it within the session). Only the widget model stays in localStorage (113).
- Layout inside the drawer, top to bottom, `flex flex-col gap-space-sm`, DESIGN.md tokens only:
  1. Search: `<input type="search">`, `aria-label="Search charts"`, placeholder "Search", styled like `EditableName` input (full width, min-h-11).
  2. Row: counter text `{shown} OF {total}` (`label-caps`, `role="status"`, `aria-label="Charts shown"`) + `Button variant="secondary"` "CLEAR", disabled when `!isFiltered`, resets to EMPTY_FILTERS.
  3. `role="group" aria-label="Zones"`: one `FilterPill` per zone (label = zone name UPPERCASE, `count`), flex-wrap gap-space-xs; toggles membership.
  4. `role="group" aria-label="Categories"`: same, per category with count > 0.
  5. `role="group" aria-label="Visibility"`: three single-select `FilterPill`s ALL / ON / OFF (no count).
  6. ALL / NONE buttons (existing): set `visible` only for rows in the filtered list; others untouched. List re-filters immediately (e.g. NONE under ON empties it).
  7. `<ul aria-label="Chart toggles">` of filtered rows (existing `Switch aria-label="Show {label}"`), or `NO MATCHES` (`label-caps`, on-surface-variant) when filtered list is empty.
- Every FilterPill gets `aria-label` = `"{LABEL} {count}"` for zone/category pills (e.g. "POWER 3"), `"{LABEL}"` for visibility; `aria-pressed` comes from FilterPill. No data-testid needed.
- Grid outside the drawer is unaffected by filters (filters only narrow the panel list).

## Touches existing endpoints
no

## Done when
- Unit `src/features/telemetry/widgetFilters.test.ts`: categoryOf for each device_class mapping, unit fallback (°F, kW, Mbit/s, hPa), `%` without class -> other, µg/m³ without class -> other, unknown -> other; query matches alias label, raw name, zone name, entityId, case/accent-insensitive ("temperatura" matches "Temperatura", "batería" matches "Bateria"); AND across groups, OR within; visibility on/off; empty filters return all rows in order; facetCounts counts/sort/unassigned-last/omits zero; isFiltered with whitespace-only query = false.
- Page object `e2e/pages/telemetry.ts` adds `chartSearch()`, `chartFilter(group, label)` (group role by name, button name `^{label}( \d+)?$`), `chartsShown()`, `chartsClear()`, `noMatches()`. Spec in `e2e/specs/telemetry-charts.spec.ts` (default mock: 16 numeric sensors): open CHARTS -> "16 OF 16"; search "kitchen" -> 2 toggles; CLEAR -> 16; POWER (3) + zone OFFICE -> only "Show Desk outlet power"; switch it off; Visibility OFF -> still listed, ON -> NO MATCHES; reload + reopen -> "16 OF 16", CLEAR disabled, Desk outlet power switch still off; after CLEAR, NONE with only CO2 category selected hides only CO2 (other switches stay on).
- `node .claude/scripts/test.cjs` green (mark-ended.cjs enforces it).
