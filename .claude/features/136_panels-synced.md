---
id: "136"
slug: panels-synced
title: Telemetry fixed-panel visibility shared across devices
role: frontend
type: change
extends: "125"
---

# Telemetry fixed-panel visibility shared across devices

## Description
The show/hide state of the telemetry fixed panels (125: KPI cards, Levels gauges, history panels, battery "seen" list) moves to the shared setting `telemetry.panels` (134). Existing local state is imported once. Depends on 134. Independent of 135.

## Requirements
- `src/features/telemetry/panelVisibility.ts`: `panelsSetting = createSyncedSetting({ key: "telemetry.panels", legacyKey: PANEL_STORAGE_KEY, parse })`; `parse` accepts `{ v: 1, hidden, seen }` (object or legacy JSON string, reuse `parsePanelState` logic) -> `PanelState | null`; registered. `loadPanelState()` -> `panelsSetting.get() ?? EMPTY_PANEL_STATE`; `savePanelState(state)` -> `panelsSetting.set(state)` (server value `{ v: 1, hidden, seen }`).
- `usePanelVisibility`: source `saved` from `useSyncedSetting(panelsSetting)` so remote changes apply live; save only when the computed state differs from the stored one (no echo of remote values). `hideNewBatteryGauges` merging stays: a device that sees a new battery gauge adds it to `seen`/`hidden` (union semantics; never removes ids another device added).
- Pure functions unchanged.

## Touches existing endpoints
GET/PUT /api/settings/telemetry.panels (backend 017), GET /api/stream.

## Done when
**Unit (Vitest)**
- parse object + legacy string; load/save delegate; hook re-renders on remote change; no PUT when the remote value is applied; new battery gauge merge keeps remote ids.

**E2E (Playwright, mock)**
- extend `telemetry.spec.ts` (or new `telemetry-panels-sync.spec.ts`): legacy `hc.telemetry.panels.v1` with a hidden KPI -> after load the KPI is hidden (import); toggle it on in CHARTS panel, reload -> on.
- test.cjs green.
