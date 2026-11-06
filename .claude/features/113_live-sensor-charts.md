---
id: "113"
slug: live-sensor-charts
title: Live sensor charts dashboard (recharts)
role: frontend
type: feature
extends: null
---

# Live sensor charts dashboard (recharts)

## Description
Dashboard of continuously updating charts on `/telemetry` showing the live value of every numeric sensor. Uses recharts. It also introduces a widget configuration model so a future editor (feature 114) can show/hide and reorder charts without reworking the dashboard. Fills the "Climate history" region reserved by 111 with this grid until 112 adds historical charts next to it. Builds on 105 (live store) and 111 (telemetry page).

## Requirements
- Add dependency `recharts` (exact pinned version in package.json). It is the chart library for the whole app (112 reuses it); no hand-rolled SVG charts.
- **Live buffer** (`src/features/telemetry/liveBuffer.ts`, pure and unit-testable): per sensor entity a ring buffer of `{ t, v }` points, window = last 5 min, max 300 points. Fed by the 103/105 store on every state change, plus a 1 s sampling tick that appends the last known value (sample-and-hold) so lines advance even when a sensor is quiet. Tick uses one shared timer, paused when the tab is hidden (`visibilitychange`) and cleaned on unmount. Non-numeric or `unavailable` states append a gap (null), not 0.
- **Widget model** (`src/features/telemetry/widgets.ts`): `Widget = { id, entityId, kind: "line" | "area" | "bar" | "gauge", visible: boolean, order: number }`. Default derivation from the store: one widget per numeric sensor (`state_class` measurement or numeric `device_class`), kind by device class (temperature/humidity/co2/power → area/line, `%` → gauge, energy → bar), all `visible: true`, stable order (area, then name). Persisted in `localStorage` key `hc.telemetry.widgets.v1` with a schema version; new sensors are appended visible, removed sensors dropped, corrupt/unknown version → defaults. Storage access wrapped in try/catch. API: `loadWidgets`, `saveWidgets`, `reconcileWidgets(saved, sensors)`. The dashboard only renders `visible` widgets, sorted by `order`.
- **Dashboard** (`TelemetryChartsGrid`): responsive grid (1/2/3 columns mobile/tablet/desktop) of `SensorChartCard` (new, in `src/components/cards`, uses `Card`): title (friendly name + area), big current value + unit in mono, trend chip vs. 1 min ago, recharts chart per `kind` (`ResponsiveContainer`, `isAnimationActive={false}` for live updates, no dots, time axis hidden or minimal, tooltip with value + time). Colors only from CSS tokens (read via `getComputedStyle` helper shared with 3D scene); no hex literals (lint:tokens must pass).
- Header line of the section: "LIVE • <n> CHARTS" with the 105 connection beacon; when disconnected show RECONNECTING and keep last data dimmed.
- **States:** loading skeleton cards, empty ("NO NUMERIC SENSORS"), error with Retry (store error). If every widget is hidden show "ALL CHARTS HIDDEN" (the editor will fix this later).
- Performance: memoize cards; a card re-renders only when its own buffer changes; cap total rendered charts at 24 per page with a "SHOW MORE" button.
- Accessibility: each chart `role="img"` with `aria-label` = "<name>: <value> <unit>, <trend>"; values also visible as text; respects `prefers-reduced-motion` (no animations anyway).
- **Coverage:** unit tests for the ring buffer (window/size cap, gap handling, sample-and-hold), widget derivation by device class, `reconcileWidgets` (new/removed/corrupt/version mismatch) and the storage wrapper. Playwright in mock mode (the 110 stream drifts sensors every 5 s): `/telemetry` shows one chart card per fixture sensor; a card's value text changes over time; pre-seeded `localStorage` with a hidden widget hides that card after reload; `?mock=empty` shows the empty state. Extend `e2e/pages/telemetry.ts`.

## Touches existing endpoints
no new ones (consumes the live store fed by GET /api/areas and GET /api/stream)

## Done when
- `/telemetry` shows live-updating recharts charts for every numeric sensor in mock mode, with trend and current value.
- Hidden widgets in localStorage are respected; model is ready for the editor.
- Unit + E2E coverage in place; lint:tokens clean.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
