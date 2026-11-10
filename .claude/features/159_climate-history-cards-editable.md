---
id: "159"
slug: climate-history-cards-editable
title: Climate history cards join the editable telemetry layout
role: frontend
type: change
extends: "146"
---

# Climate history cards join the editable telemetry layout

## Description
After 158 the climate history is two cards (TEMPERATURE, HUMIDITY) rendered above the charts grid as fixed panels (125). The user wants them editable like the sensor charts: width FULL/HALF/THIRD, move up/down and hide, so the two can sit at 50% each on one row. This feature moves both cards into the editable grid layout (114/146) and stores their layout with the synced setting (135).

## Decisions (agreed with the user)
- Depends on 158 (ENDED first).
- Default width HALF for both cards, so they share a row out of the box. The user can change it in edit mode.
- Layout is saved with the existing synced widgets setting (135), schema version stays 1.
- Opus refines the model at the start of this feature. Preferred direction: represent the two cards as synthetic widgets in the layout (ids such as `climate:temperature` and `climate:humidity`) so `ChartEditBar`, `widgetEditor` (`setSize`, `moveWidget`, `setVisible`) and `sizeClass` are reused, not duplicated. If that proves worse than a small separate layout for these two cards, record the reason in the card and go with the alternative.

## Requirements
- `widgets.ts` / `reconcileWidgets`: synthetic climate widgets are accepted without a backing sensor entity, are never dropped by sensor reconciliation, are appended with `size: "half"` when absent, and only exist while the house has that metric. Their `kind` is not user-editable (no LINE/AREA/BAR/GAUGE selector).
- `TelemetryChartsGrid`: renders the two climate cards inside the 6-column grid with the same `sizeClass` helper as the charts; in edit mode they show the same `ChartEditBar` but without the kind selector. MOVE UP/DOWN swaps with the nearest visible neighbour, charts and climate cards together.
- Visibility: HIDE in edit mode and the switches in the CHARTS panel (118) control the climate cards. The separate fixed-panel toggles `history:climate-temp` and `history:climate-hum` of 125/158 are removed from the fixed panel list, and a stored hidden state is migrated once into the widgets' `visible` flag.
- RESET LAYOUT (114) restores the climate cards to HALF, visible, and puts them at their default position (first).
- Live region announces width, move and hide for the climate cards with their title ("Climate temperature width HALF").
- Responsive rules of 146 apply (xl 6 columns, md 2 columns, below md 1 column).
- Update unit tests, E2E specs and the page object; migration tests for legacy layouts without climate widgets.
- DESIGN.md tokens only; `lint:tokens` clean.

## Touches existing endpoints
GET and PUT /api/settings/telemetry.widgets (135), same schema version 1 with extra widget ids. See endpoints.md.

## Done when
**Unit (Vitest)**
- `reconcileWidgets` keeps and appends the two climate widgets (HALF by default) and drops them when the house has no sensor of that metric.
- `setSize`, `moveWidget` and `setVisible` work on climate widgets mixed with sensor widgets; reset restores defaults.
- Legacy layout without climate widgets loads with both cards appended; a legacy hidden `history:climate-*` panel state becomes `visible: false`.
- `TelemetryChartsGrid`: edit mode shows width group FULL/HALF/THIRD on the climate cards and no kind selector; HALF gives `xl:col-span-3`.
**E2E (Playwright, mock)**
- Default `/telemetry` at 1440px: TEMPERATURE and HUMIDITY on the same row, each about half of the list width.
- EDIT: set TEMPERATURE to FULL, move HUMIDITY up, hide one, reload, layout persists; RESET LAYOUT restores it.
- `node .claude/scripts/test.cjs` green.
