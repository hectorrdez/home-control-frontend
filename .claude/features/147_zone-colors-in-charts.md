---
id: "147"
slug: zone-colors-in-charts
title: Zone colors in every chart, unique per room and readable in legends/tooltips
role: frontend
type: change
extends: "130"
---

# Zone colors in every chart, unique per room and readable in legends/tooltips

## Description
User: "ponle colores a cada zona, en los graficos no se sabe bien que sitio es cada una". 130 created the 8-token zone palette (`src/features/zones/zoneColors.ts`, `ZoneDot`) but only the 3D house and the CLIMATE HISTORY card (131/144) use it. The live sensor charts (113, `SensorChartCard`) paint every series with fixed theme tokens (`secondary`/`primary-container`/`tertiary-fixed-dim`), so nothing tells which room a chart belongs to except a small text subtitle; the zone filter pills (118) have no color; the climate tooltip lists rooms without a color key; and the djb2 hash of 130 can give two REAL HA areas the same color (it was only tuned for the 4 mock areas). This feature makes the zone color the identity of a room in every chart.

MUST start after 144 (HOME-71, climate-history-split-charts) is ENDED: both touch `src/components/cards/ClimateHistoryCard.tsx` / `ClimateTooltip.tsx`.

## Decisions / assumptions (marked on the card)
- Unique colors: the color of an area is assigned by its index in the sorted (by id) list of ALL areas from `getAreas()` (EntitiesProvider), not by which areas have data, so it is stable while the HA area list does not change. Up to 8 areas -> all different. More than 8 -> wraps (index % 8) and the legend/tooltip text keeps them identifiable. Areas not in the list (or before areas load) -> the 130 hash fallback. Adding/removing an HA area may reshuffle colors: accepted.
- Unassigned zone (entity without area, `UNASSIGNED_ZONE`) -> neutral `on-surface-variant`, never a zone hue.
- Charts that show ONE room get that room's color; multi-room charts get one color per room. Charts that are not per-room (PowerHistoryBars, TOTAL MEAN line, gauges' OK/WARN/ERROR semantic fill) keep their semantic colors.
- Gauge (live grid): the value arc keeps semantic thresholds (OK/WARN/ERROR are meaning, not identity); the zone is shown by the colored dot + a thin zone-colored top border of the card.

## Requirements
- `src/features/zones/zoneColors.ts`: add `assignZoneTokens(areaIds: string[]): Map<string, ZoneToken>` (pure, sorted ids -> `ZONE_TOKENS[i % 8]`) and a way for components to get the assigned token: e.g. `ZoneColorsProvider` / `useZoneColor()` fed from the areas already loaded by `EntitiesProvider` (no new request). `zoneColorToken(areaId)` stays as the fallback (keeps 130 tests valid). `ZoneDot` and `HouseScene` use the assigned token when available so the 3D view, pills, legends and charts match.
- `SensorChartCard` (113): LINE/AREA/BAR series stroke/fill = zone color of `entity.area`; `ZoneDot` before the area name in the subtitle; `Tooltip` shows `{area name} · {label}: {value} {unit}` (custom formatter). Keep memoization (pass the token string as a prop, not a context read inside the memo'd card, or make sure the memo still holds).
- `ChartFilters` (118) zone pills: `ZoneDot` before each zone name (unassigned: no dot).
- `ClimateHistoryCard` / `ClimateTooltip` (131/144): tooltip and keyboard readout rows prefixed with the room's `ZoneDot` (decorative; text stays the identifier); legend already has dots, switch them to the assigned token.
- `EntityHistoryCard` (122, device detail): series in the zone color of the entity's area; neutral if unassigned.
- Accessibility: color is never the only cue: room name text stays in subtitle, legend and tooltip. Contrast: zone tokens are L=0.78 on dark surfaces (130); verify 3:1 for strokes against `surface-container` in both themes; if a token fails in light theme, add a light-theme value in `index.css` (DESIGN.md naming, no hex literals in TS).
- Tokens only (`cssToken`, `var(--color-zone-*)`), `lint:tokens` clean.

## Touches existing endpoints
no (uses areas already fetched by EntitiesProvider; same history/stream calls)

## Done when
**Unit (Vitest)**
- `zoneColors.test.ts`: `assignZoneTokens` gives 8 distinct tokens for 8 ids regardless of input order, same result for shuffled input, wraps at 9, unknown id falls back to hash.
- `SensorChartCard.test.tsx`: line/area/bar use the zone token of the entity's area; unassigned -> neutral; subtitle has a ZoneDot; gauge keeps semantic fill.
- `ChartFilters` test: zone pills render a ZoneDot with the assigned token.
- `ClimateTooltip.test.tsx`: each room row has a ZoneDot with the same token as its line.
**E2E (Playwright, mock)**
- `/telemetry`: two live charts from different areas show different `data-zone-token` dots; the same area shows the same token in the live chart, the CHARTS zone pill and the CLIMATE HISTORY legend; 3D view (106) specs still green.
- `node .claude/scripts/test.cjs` green.
