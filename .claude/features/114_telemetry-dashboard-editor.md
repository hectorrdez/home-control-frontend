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
Edit mode for the live charts dashboard: choose which sensor charts are shown, reorder them and change the chart type. Extends feature 113 (writes the widget model it defines). Planned for later; refine the details (and whether layouts sync to the backend) before starting.

## Requirements
- Extends/replaces nothing in 113's data model: reads and writes `Widget[]` through `loadWidgets`/`saveWidgets` from 113.
- "EDIT DASHBOARD" toggle on `/telemetry`; in edit mode each card shows a visibility switch, drag handle (plus keyboard up/down reorder), and a chart-type selector limited to kinds valid for the sensor; "RESET TO DEFAULT" restores the derived widgets (with confirm).
- Panel listing hidden widgets so they can be re-enabled; search/filter by area or sensor name.
- Changes apply live and persist to `localStorage`; every control keyboard accessible with accessible names.
- Out of scope until decided: per-user sync through the backend, custom widgets (multi-sensor charts), thresholds/alerts.
- Coverage: unit for reorder/toggle/type-change reducers; Playwright (mock): hide a card, reorder two, reload and see the persisted layout, reset restores defaults.

## Touches existing endpoints
no

## Done when
- User can hide/show, reorder and retype charts in edit mode and the layout persists across reloads.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
