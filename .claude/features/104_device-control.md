---
id: "104"
slug: device-control
title: Device control in device modules
role: frontend
type: feature
extends: null
---

# Device control in device modules

## Description
Make the 103 device modules interactive with the controls shown in `design/stitch/home_3d_control_center/code.html` (switch, intensity slider, climate stepper + mode chips, blinds slider + presets, scene trigger), calling `HomeApi.runAction` with optimistic updates.

## Requirements
- New library primitives in `src/components/controls` (DESIGN.md specs): `Switch` (if 109 did not already add it), `Slider` (native range, domain-hue fill, value text with unit, `aria-valuetext`), `Stepper` (-/+ 44px, mono value, min/max/step).
- Per domain (only render a control when the entity supports it, based on HA attributes):
  - light: Switch (toggle); if brightness supported, "INTENSITY" Slider 0-100% -> `turn_on { brightness_pct }` (commit on release, not on every move).
  - switch / fan: Switch; plug power sensor value shown as "DRAW METRIC <W>" when linked (103 mapping).
  - climate: header "CURRENT AMBIENT <current_temperature>" and "TARGET SETPOINT <temperature>"; Stepper using `target_temp_step` (default 0.5) within `min_temp..max_temp` -> `set_temperature { temperature }` (debounced 600 ms); `hvac_modes` / `preset_modes` as chips -> `set_hvac_mode` / `set_preset_mode`.
  - cover: "<position>% OPEN" Slider -> `set_cover_position { position }`; preset buttons "SHUT (0%)", "FULL (100%)" -> close/open.
  - lock: Switch-like secured/unsecured -> `lock`/`unlock` with a confirm step for unlock (destructive style).
  - scene / script: "ACTIVATE" button -> `turn_on`.
  - sensor / binary_sensor: no control (read-only).
- Optimistic update through the 103 store: apply the expected state immediately, mark the module pending (controls disabled + "SENDING" chip), replace with the returned entity on success, roll back + error toast ("Could not update <name>") on failure. One in-flight action per entity; a newer action supersedes the older optimistic value.
- Toast primitive (`src/components/feedback/Toast`), `role="status"`, auto-dismiss 4 s, used for errors.
- Coverage choice: Playwright for the journeys (mock mode): toggle a light on -> module shows ON and indicator lit; move brightness -> value persists after action; climate + raises setpoint by step and respects max; cover SHUT sets 0%; `?mock=action-error` toggle rolls back and shows the toast. Unit tests for the optimistic reducer (apply/confirm/rollback/supersede) and for the action-builder per domain (entity + control -> `{ action, params }`).

## Touches existing endpoints
yes: consumes POST /api/entities/:entityId/action (backend 003) via `HomeApi.runAction`

## Done when
- Every control in the reference card types works against the mock house and sends the correct action payload.
- Failures roll back with a toast; covered by E2E + unit.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
