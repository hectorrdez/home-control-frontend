---
id: "160"
slug: chart-size-quarter
title: Chart width options 25 and 75 percent
role: frontend
type: change
extends: "146"
---

# Chart width options 25 and 75 percent

## Description
The editable telemetry charts (114/146) offer FULL, HALF and THIRD. The user wants two more widths: 25 percent, so four charts fit in one row, and 75 percent, so a 75 percent chart and a 25 percent chart share a row. This adds the sizes `quarter` and `threeQuarters` and moves the xl grid from 6 to 12 columns, because 25 percent is not a whole number of 6 columns.

## Decisions (agreed: user asked for it directly, no further discussion)
- New `WidgetSize` values: `quarter` (25 percent) and `threeQuarters` (75 percent). Existing `full`, `half`, `third` keep their stored value and meaning; no migration, `SCHEMA_VERSION` stays 1. A stored layout with the new values is read by this version; an older client would treat it as invalid and fall back to defaults (accepted).
- Selector order and labels: FULL, 75%, HALF, THIRD, 25% (`SIZES` order and `SIZE_LABEL`: full FULL, threeQuarters 75%, half HALF, third THIRD, quarter 25%).
- xl grid becomes 12 columns. Spans: full 12, threeQuarters 9, half 6, third 4, quarter 3. md (2 columns): full and threeQuarters span 2, the rest 1. Below md: one column for all.
- Default size is unchanged (absent = third). Reset layout = all third.
- Applies to every chart in the editable grid. Fixed panels (125) and the climate cards of 158/159 are out of scope here; 159 reuses this size set when it ships.

## Requirements
- `src/features/telemetry/widgets.ts`: extend `WidgetSize` and `WIDGET_SIZES`; `isWidget` accepts the new values; any other value still invalidates the whole saved layout.
- `src/features/telemetry/widgetEditor.ts`: `SIZES` and `SIZE_LABEL` with the five sizes in the order above; `setSize` unchanged in contract.
- `TelemetryChartsGrid.tsx`: list container `grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-12`; `sizeClass` returns literal class strings (so Tailwind generates them): full `md:max-xl:col-span-2 xl:col-span-12`, threeQuarters `md:max-xl:col-span-2 xl:col-span-9`, half `xl:col-span-6`, third `xl:col-span-4`, quarter `xl:col-span-3`.
- `ChartEditBar`: the width group shows the five options (one selected). Keep the 44x44 touch target and visible focus; the group may wrap on narrow screens.
- Live region announces "{label} width {FULL|75%|HALF|THIRD|25%}".
- Update existing unit tests, the mock E2E spec `telemetry-dashboard-editor.spec.ts` and the page object in the testing repo `../home-control-frontend-testing` (`widthOption(label, size)` takes the new sizes) and any test asserting 6-column spans.
- DESIGN.md tokens only; `lint:tokens` clean.

## Touches existing endpoints
GET and PUT /api/settings/telemetry.widgets (135): same key, same schema version 1, widgets may now carry `size` quarter or threeQuarters. See endpoints.md.

## Done when
**Unit (Vitest)**
- `widgets.test.ts`: `quarter` and `threeQuarters` are accepted, saved and kept by `reconcileWidgets`; an unknown size still invalidates the layout.
- `widgetEditor.test.ts`: `setSize` works for the new sizes; `SIZES` has the five sizes in order with the labels above; reset clears size.
- `TelemetryChartsGrid.test.tsx`: the width group shows FULL, 75%, HALF, THIRD, 25%; each option adds its class (`xl:col-span-12`, `-9`, `-6`, `-4`, `-3`); the list has `xl:grid-cols-12`; the choice persists.
**E2E (Playwright, mock, in the testing repo)**
- At 1440px four charts set to 25% sit on one row, each about a quarter of the list width; a 75% chart and a 25% chart share one row; THIRD, HALF and FULL keep their widths.
- `node .claude/scripts/test.cjs` green.
