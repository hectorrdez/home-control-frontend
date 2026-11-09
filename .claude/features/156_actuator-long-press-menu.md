---
id: "156"
slug: actuator-long-press-menu
title: Long-press menu for actuators (options, details, rename, modes)
role: frontend
type: feature
extends: 155
---

# Long-press menu for actuators (options, details, rename, modes)

## Description
Holding click/press on an actuator tile opens a small modal with the extra options. Always present: Go to device details, Rename, Modes (only if the device has modes).

## Requirements
- Long-press (mouse hold and touch hold, with a clear threshold ~400-500 ms, cancel on move) opens the modal; it also works while the tile is pending.
- Options: 'Ir a detalles del dispositivo' (navigate to the detail page), 'Cambiar nombre' (reuse the rename flow from DeviceModule rename, feature 115/aliases), 'Modos' (visible only when modes exist).
- 'Modos' opens a second modal listing existing modes (apply), with create-new and edit-mode actions; reuse feature 142/143 (actuator presets UI, PresetModesMenu) and the calibrated cover modes.
- Calibrated cover: the modal also shows a range/slider to set the position (reuse CalibratedCover/cover-percent client).
- Accessible: keyboard alternative to open the menu (e.g. Enter/ContextMenu key), focus trap, Escape closes.
- Tests for long-press timing, menu contents per device type, rename and modes flows.

## Touches existing endpoints
no. Uses POST /api/entities/:entityId/cover-percent for the range, aliases endpoints for rename, settings API for modes (existing).

## Done when
- Holding a tile opens the modal with the right options per device; the modes modal lets the user apply, create and edit modes; calibrated covers show the range.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
