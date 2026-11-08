---
id: "146"
slug: chart-width-modes
title: Three width modes for every telemetry chart (full, half, third)
role: frontend
type: change
extends: "114"
---

# Three width modes for every telemetry chart (full, half, third)

## Description
Today the telemetry dashboard editor (114) only offers a WIDE toggle per chart (`widget.wide`, `md:col-span-2` in a `md:grid-cols-2 xl:grid-cols-3` grid), so on desktop a chart is 1/3 or 2/3 of the row and can never be full or exactly half. The user asked that, when editing ANY chart, the width selector has exactly three modes: FULL (1/1), HALF (1/2) and THIRD (1/3). This replaces the WIDE toggle with a three-option width selector and a grid that can render those three widths.

## Decisions / assumptions (marked on the card)
- Model: `Widget` gains optional `size?: "full" | "half" | "third"`; absent = `"third"` (today's default look on desktop). `wide` stays readable only for legacy data and is never written again.
- Legacy migration (saved layouts, localStorage and the synced setting of 135 if already shipped): `wide: true` -> `"half"` (2/3 is closest to 1/2), `wide` absent/false -> `"third"`. Migration happens when parsing (`isWidget`/load); the first save writes `size` and drops `wide`. `SCHEMA_VERSION` stays 1 (field is optional, old clients ignore it).
- Invalid `size` (any other value/type) -> the whole saved layout is invalid and falls back to defaults (same rule 114 applies to `wide`).
- Responsive: the three modes are exact from `xl` (6-column grid). At `md` (2 columns) FULL = 2 columns, HALF and THIRD = 1 column. Below `md` every chart is full width (1 column). A THIRD next to a HALF on xl simply flows (CSS grid auto-placement, no packing algorithm).
- Applies to every chart in the live charts grid (113/114), whatever its type (LINE/AREA/BAR/GAUGE). The CLIMATE HISTORY card (112/131/144) and fixed panels (125) are not part of the editable grid and are out of scope.
- Reset layout (114) = all charts `"third"`.

## Requirements
- `src/features/telemetry/widgets.ts`: add `WidgetSize` type + `size` field, `normalizeWidget` (legacy `wide` -> `size`), `isWidget` accepts `size` absent or one of the three values; `deriveWidgets`/appended widgets in `reconcileWidgets` leave it absent (= third); `reconcileWidgets` keeps saved `size`. Saved output never contains `wide`.
- `src/features/telemetry/widgetEditor.ts`: replace `setWide` with `setSize(widgets, id, size)` (same contract: new array, renumbered orders, unknown id -> unchanged). Export `SIZE_LABEL: Record<WidgetSize, string>` = FULL / HALF / THIRD and `SIZES` in that order. `resetWidgets` clears `size`.
- `TelemetryChartsGrid`: list container `grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-6`; listitem span from a pure helper `sizeClass(size)`: third -> `xl:col-span-2`, half -> `xl:col-span-3`, full -> `md:col-span-2 xl:col-span-6`. Tailwind classes must be literal strings (no string building) so they are generated.
- `ChartEditBar`: remove the WIDE pill; add inner `role="group" aria-label="Width for {label}"` with three `FilterPill`s FULL, HALF, THIRD (one `selected`, always exactly one since absent = THIRD). Prop `size` + `onSize(size)` replace `wide`/`onWide`. Same focus/touch rules as 114 (>= 44x44, visible focus).
- Live region (114): announce "{label} width {FULL|HALF|THIRD}" on change.
- Update existing tests/specs that use WIDE (`widgets.test.ts`, `widgetEditor.test.ts`, `TelemetryChartsGrid.test.tsx`, `e2e/specs/telemetry-dashboard-editor.spec.ts`, page object `e2e/pages/telemetry.ts`: replace `wideToggle(label)` with `widthOption(label, "FULL"|"HALF"|"THIRD")`).
- If 135 (widgets-synced) is already ENDED when this starts: its `parse` reuses `isWidget`, so the migration must also run on the server value; add a test for it. If 135 is not shipped yet, nothing extra (135 will reuse the new `isWidget`).
- DESIGN.md tokens only; `lint:tokens` clean.

## Touches existing endpoints
no (if 135 is shipped: same GET/PUT /api/settings/telemetry.widgets, schema still version 1 with the optional `size` field)

## Done when
**Unit (Vitest)**
- `widgets.test.ts`: `wide: true` -> `size "half"`, missing -> `"third"`, `size: "huge"` -> whole layout null, save output has `size` and no `wide`, reconcile keeps `size`.
- `widgetEditor.test.ts`: `setSize` changes only the target, renumbers, unknown id unchanged, input not mutated; `resetWidgets` clears size.
- `TelemetryChartsGrid.test.tsx`: edit mode shows group "Width for {label}" with exactly FULL/HALF/THIRD; default THIRD selected; FULL adds `xl:col-span-6` (and `md:col-span-2`), HALF adds `xl:col-span-3`, THIRD `xl:col-span-2`; choice persists; no "Wide" control remains.
**E2E (Playwright, mock)**
- Editor spec updated: Kitchen humidity -> FULL, reload, EDIT -> FULL pressed; at 1440px its card width ~= list width; HALF ~= 1/2 and THIRD ~= 1/3 of list width (tolerance for the gap); legacy localStorage with `wide: true` loads as HALF.
- `node .claude/scripts/test.cjs` green.
