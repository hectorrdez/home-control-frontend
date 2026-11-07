---
id: "135"
slug: widgets-synced
title: Telemetry dashboard layout shared across devices
role: frontend
type: change
extends: "114"
---

# Telemetry dashboard layout shared across devices

## Description
The live charts layout (113 widget model, edited by 114) moves from `localStorage` only to the shared setting `telemetry.widgets` (134), so hiding, reordering, resizing or changing a chart type on one device shows on every open panel. Existing local layouts are imported once. MUST start only after 114 is ENDED (114b keeps all persistence inside `loadWidgets`/`saveWidgets` in `widgets.ts`; this feature swaps only those). Depends on 134.

## Requirements
- `src/features/telemetry/widgets.ts`: new `widgetsSetting = createSyncedSetting({ key: "telemetry.widgets", legacyKey: WIDGET_STORAGE_KEY, parse })` where `parse(raw)` accepts the existing stored shape `{ version: 1, widgets: Widget[] }` (reuse `isWidget`; the raw stored by localStorage is the JSON string, the server value is the object: `parse` handles both) and returns `Widget[] | null`. Register it with `registerSyncedSetting`.
  - `loadWidgets()` -> `widgetsSetting.get()` (same return type `Widget[] | null`).
  - `saveWidgets(widgets)` -> `widgetsSetting.set(widgets)`; the server value is `{ version: 1, widgets }` (same schema as today).
  - `WIDGET_STORAGE_KEY` kept (legacy import source + tests).
- `TelemetryChartsGrid`: replace `useState(loadWidgets)` with `useSyncedSetting(widgetsSetting)` as the source of `saved`, so remote changes re-render; the save effect must not echo a remote value back (only call `saveWidgets` when the reconciled layout differs from the stored one, JSON compare).
- While EDIT mode (114) is on and a remote change arrives: apply it (last write wins), keep edit mode open, keep focus where possible, announce "Layout updated from another device" in the existing 114 live region.
- Reconcile (113) still runs locally against current sensors; a device missing a sensor does NOT write a layout without it unless the user edits (avoid one device deleting another's widgets): `saveWidgets` only on user edits, not on reconcile-only differences.
- Mock: `?mock=remote-settings` (133) changes the layout from "other-device".

## Touches existing endpoints
GET/PUT /api/settings/telemetry.widgets (backend 017), GET /api/stream (`resource_changed`).

## Done when
**Unit (Vitest)**
- `widgets.test.ts`: `parse` accepts the v1 object and the legacy JSON string, rejects bad shapes; `loadWidgets`/`saveWidgets` delegate to the synced setting; reconcile-only change does not call `set`.
- `TelemetryChartsGrid.test.tsx` (extend): a remote setting change re-renders the grid order; in edit mode the announcement text appears; user edit calls `set` once (debounce handled by the store).

**E2E (Playwright, mock)**
- `e2e/specs/telemetry-dashboard-sync.spec.ts`: (1) with old `hc.telemetry.widgets.v1` in localStorage (first chart hidden) and empty mock settings -> load `/telemetry` -> layout honours the legacy value (import). (2) `?mock=remote-settings` -> within 3 s the first chart disappears without reload. (3) hide a chart, reload -> still hidden (served from settings, localStorage cleared between steps except the mock store kept by `?seed=`).
- Existing `telemetry-dashboard-editor.spec.ts` green unchanged. test.cjs green.
