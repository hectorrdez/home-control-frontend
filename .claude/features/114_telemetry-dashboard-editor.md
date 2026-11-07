---
id: "114"
slug: telemetry-dashboard-editor
title: Telemetry dashboard editor
role: frontend
type: feature
extends: "113"
---

# Telemetry dashboard editor

## Description
Edit mode for the live charts grid on `/telemetry` (113): the user can reorder charts, change each chart's type, make a chart wide, hide it, and reset the whole layout to the defaults. Everything edits the existing 113 widget model and persists in `localStorage` (no backend layout endpoint exists; per-user sync is out of scope). Show/hide via switches, search and filters already live in the CHARTS side panel (118) and are NOT reimplemented here: hidden charts are re-added from that panel.

## Decisions (refined 2026-11-07)
- Persistence: `localStorage`, same key `hc.telemetry.widgets.v1`, same schema `version: 1` (the new field is optional, old data stays valid). No backend.
- Reorder = "Move up" / "Move down" buttons (keyboard and touch friendly). Pointer drag-and-drop is OUT of scope (possible later feature).
- Resize = two sizes only: normal (1 grid column) and wide (2 columns from `md`). No free resize.
- "Add" = re-enable a hidden chart in the CHARTS panel (118 switch, Visibility OFF filter finds them). "Remove" = HIDE button in edit mode. No custom/multi-sensor widgets, no thresholds.
- Edit mode is session UI state (plain `useState`), never persisted: every load starts in view mode.
- Out of scope: drag-and-drop, backend sync, custom widgets, editing fixed panels (125), editing filters (118).

## Requirements

### 114a - model + pure editor logic (do first; unit tests only)
**`src/features/telemetry/widgets.ts`** (113, minimal change):
- `Widget` gains optional `wide?: boolean` (absent = false). `isWidget` accepts `wide` absent or boolean; any other type -> invalid (whole saved layout falls back to defaults, as today). `deriveWidgets` / appended widgets in `reconcileWidgets` do not set it. `reconcileWidgets` keeps `wide` (and `kind`) of saved widgets unchanged. `SCHEMA_VERSION` stays 1.

**New `src/features/telemetry/widgetEditor.ts`** (pure, no React, no storage). Every function returns a NEW array; orders are renumbered 0..n-1 in array order; unknown id -> input returned unchanged:
- `KIND_LABEL: Record` WidgetKind to label: line LINE, area AREA, bar BAR, gauge GAUGE.
- `validKinds(entity): WidgetKind[]` in this fixed order: unit `%` -> `["line", "area", "gauge"]`; any other unit -> `["line", "area", "bar"]`. (Gauge is 0..100 only.)
- `moveWidget(widgets, id, dir: -1 | 1)`: sorts by `order`, then swaps the widget with the nearest VISIBLE widget in direction `dir` (hidden widgets in between are skipped and keep their relative place). No visible neighbour (first/last visible) or hidden target widget -> unchanged.
- `canMove(widgets, id, dir): boolean` (true when `moveWidget` would change something; drives disabled state).
- `setVisible(widgets, id, visible)`, `setKind(widgets, id, kind)`, `setWide(widgets, id, wide)`.
- `resetWidgets(sensors: Entity[]): Widget[]` = `deriveWidgets(sensors)` (all visible, default kinds, not wide, default order).

### 114b - UI + E2E
**`TelemetryChartsGrid`** (113/118/125):
- Header row: new `Button variant="secondary"` "EDIT" placed before CHARTS, `aria-pressed={editing}`; while editing its text is "DONE". Toggling only flips `editing` (layout is already saved on every change through the existing `saveWidgets` effect).
- While editing, show below the header: `Button variant="secondary"` "RESET LAYOUT". Click -> inline two-step confirm (same pattern as the 104 unlock confirm): `Button variant="destructive"` "CONFIRM RESET" + `Button variant="secondary"` "CANCEL". Confirm -> `setSaved(resetWidgets(numeric))`, close confirm, announce "Layout reset". Cancel -> nothing changes. Leaving edit mode (DONE) also cancels a pending confirm. Reset does NOT touch fixed panels (125), aliases (115) or filters (118).
- Grid container gets `role="list" aria-label="Live charts"`; each card is wrapped in a `role="listitem"` element that carries the column span: `md:col-span-2` when `widget.wide`, nothing otherwise. `SensorChartCard` itself is not changed (stays memoized).
- While editing, each listitem renders a new `ChartEditBar` below its card.
- One polite live region (`role="status" aria-label="Layout changes"`, visually `sr-only`) in the grid announcing: "Moved {label} to position {n} of {m}" (n/m among visible charts), "{label} hidden", "Layout reset".
- Edit mode does not change the 24-per-page SHOW MORE behaviour; "ALL CHARTS HIDDEN" text unchanged, but while editing it is followed by "OPEN CHARTS TO ADD THEM BACK" (same label-caps style).
- Names: every accessible name below uses `{label}` = `names.displayName(entity)` (115), same as the CHARTS panel switches.

**New `src/components/cards/ChartEditBar.tsx`** (DESIGN.md tokens only; reuse `Button`, `FilterPill`; lucide icons `ArrowUp`, `ArrowDown`, `EyeOff`, `Maximize2`):
- Root `role="group" aria-label="Edit {label}"`, `flex flex-wrap items-center gap-space-xs` with `mt-space-xs`.
- Props: `label`, `kind`, `kinds` (from `validKinds`), `wide`, `canUp`, `canDown`, callbacks `onMove(dir)`, `onKind(kind)`, `onWide(wide)`, `onHide()`.
- Icon buttons (`Button variant="secondary"`, icon `aria-hidden`): `aria-label="Move {label} up"` (disabled when `!canUp`), `aria-label="Move {label} down"` (disabled when `!canDown`).
- Chart type: inner `role="group" aria-label="Chart type for {label}"` with one `FilterPill` per entry in `kinds`, text = KIND_LABEL, `selected` = current kind. If the saved kind is not in `kinds`, no pill is selected (no auto-fix).
- WIDE: `FilterPill` text "WIDE", `aria-label="Wide {label}"`, `selected={wide}`, toggles.
- HIDE: `Button variant="secondary"` text "HIDE", `aria-label="Hide {label}"`.
- Focus: after a move the focus stays on the same move button of the moved card (the card's DOM node may be re-inserted; restore focus with a ref/effect keyed by widget id). If that button became disabled (card reached an edge), focus the opposite move button. After HIDE the focus goes to the EDIT/DONE button.
- All targets >= 44x44 (Button/FilterPill already min-h-11 / min-w-11). Visible focus ring from existing components.

**Edge cases**
- One visible chart: both move buttons disabled.
- Hidden charts sit between visible ones: a move skips them (see `moveWidget`).
- New sensor appears while editing: appended visible at the end (113 reconcile); removed sensor disappears.
- Storage throws: editing works for the session (existing guarded `saveWidgets`).
- Tampered storage with a kind not valid for the sensor (e.g. gauge on a W sensor): rendered as saved; the selector shows no pill selected; picking one fixes it.
- Disconnected stream (RECONNECTING): editing still works (local only).
- `?mock=empty`: no EDIT button (the "NO NUMERIC SENSORS" branch returns early, unchanged).

## Touches existing endpoints
no

## Done when
**Unit (Vitest)**
- `src/features/telemetry/widgetEditor.test.ts`: `validKinds` for `%`, `W`, `kWh`, no unit; `moveWidget` up/down swap, skips hidden neighbours, first-up / last-down unchanged, hidden id unchanged, unknown id unchanged, orders renumbered 0..n-1, input not mutated; `canMove` matches; `setVisible` / `setKind` / `setWide` change only the target; `resetWidgets` equals `deriveWidgets` (wide cleared, all visible).
- `src/features/telemetry/widgets.test.ts` (extend): parse accepts missing `wide`, rejects `wide: "yes"` (-> null), save/load round trip keeps `wide: true`; `reconcileWidgets` keeps saved `wide` and `kind`.
- `src/components/cards/TelemetryChartsGrid.test.tsx` (extend): EDIT toggles `aria-pressed` and DONE text and shows/hides the "Edit {label}" groups; first visible card "Move up" disabled, last "Move down" disabled; Move down reorders listitems and persists to `localStorage`; chart type pills offer only `validKinds` (humidity `%`: LINE/AREA/GAUGE, no BAR) and selecting one persists `kind`; WIDE adds `md:col-span-2` to that listitem and persists; HIDE removes the card and the CHARTS panel switch is unchecked; RESET LAYOUT -> CANCEL keeps layout, -> CONFIRM RESET restores defaults; live region text after a move; a fresh mount starts in view mode.

**E2E (Playwright, mock mode, port 5174; new `e2e/specs/telemetry-dashboard-editor.spec.ts`)**
- Page object `e2e/pages/telemetry.ts` adds: `editButton()` (button name `/^(EDIT|DONE)$/`), `editBar(label)` (group "Edit {label}"), `moveUp(label)`, `moveDown(label)`, `hideChart(label)`, `chartType(label, kind)` (button inside group "Chart type for {label}"), `wideToggle(label)`, `resetLayout()`, `confirmReset()`, `cancelReset()`, `chartOrder()` (aria-labels of the regions inside list "Live charts", in DOM order).
- Spec (start each test with a clean `localStorage`; default mock = 16 numeric sensors):
  1. EDIT shows edit bars; DONE hides them; reload -> view mode (no edit bars).
  2. In edit mode HIDE "Kitchen humidity" -> its card is gone; open CHARTS -> switch "Show Kitchen humidity" unchecked; switch it on -> card back.
  3. Read `chartOrder()`; Move down the first chart -> first two names swapped; reload -> order persisted; first card's "Move up" disabled in edit mode.
  4. Kitchen humidity: chart type LINE + WIDE -> reload, EDIT -> LINE pressed, GAUGE not pressed, WIDE pressed.
  5. After changes (hide + move), RESET LAYOUT -> CANCEL keeps them; RESET LAYOUT -> CONFIRM RESET -> `chartOrder()` equals the initial order, Kitchen humidity visible with GAUGE pressed and WIDE not pressed.
- `node .claude/scripts/test.cjs` green (mark-ended.cjs enforces it); `lint:tokens` clean.
- After shipping, append a note via `add-note.cjs`: widget `wide` field, editor module, ChartEditBar, no drag-and-drop.
