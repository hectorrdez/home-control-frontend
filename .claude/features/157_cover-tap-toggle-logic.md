---
id: "157"
slug: cover-tap-toggle-logic
title: Cover tile tap: smart toggle, live percentage and stop
role: frontend
type: feature
extends: 155
---

# Cover tile tap: smart toggle, live percentage and stop

## Description
Tapping a cover tile toggles it intelligently, shows live progress while moving, and tapping during motion stops it and notifies where it stopped.

## Requirements
- Tap on a cover tile (home3d): if idle, calibrated cover goes to the nearest extreme (80% -> 100%, 30% -> 0%); uncalibrated goes opposite to the last command (last was close -> open).
- While moving, the tile shows the running percentage (estimated_position for calibrated covers).
- Tap while moving sends the real stop (action stop_cover, same as the existing STOP button in DeviceControls cover controls, which maps to cover_stop) and shows a toast with the percentage it stopped at (calibrated only).
- After a stop, the next tap goes in the opposite direction of the previous move.
- Keep last-command per cover in memory (and optionally persisted); reuse cover calibration/percent code (features 127/128) and handle pending states without double-sending.
- Tests: decision logic as pure function (nearest extreme, opposite of last, stop reversal), tile behaviour while moving.

## Touches existing endpoints
no. Uses POST /api/entities/:entityId/action (open_cover, close_cover, stop_cover) and POST /api/entities/:entityId/cover-percent.

## Done when
- Tap toggles per the rules, shows percentage while moving, stops on tap during motion with a notification of the stop percentage, and reverses after a stop.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
