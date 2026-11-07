---
id: "127"
slug: cover-calibration-wizard
title: Cover calibration wizard and percentage control
role: frontend
type: feature
extends: null
---

# Cover calibration wizard and percentage control

## Description
Covers without position feedback (e.g. Persiana Salon Cortina) only have open/close/stop. The user calibrates them from the device detail page: step 1 sends close and asks "press Done when the cover has finished"; step 2 sends open and asks again; the two measured times go to the backend (010) and from then on a percentage slider works (backend 011). Depends on backend 010 and 011.

## Requirements
- API layer (`HomeApi`, liveApi, mock): `getCalibrations()`, `putCalibration(entityId, {openMs, closeMs})`, `deleteCalibration(entityId)`, `setCoverPercent(entityId, percent)` (POST `/api/entities/:id/cover-percent`); refresh `.claude/endpoints.md` read-only copy from the backend. Mock implements the same behaviour with timers so E2E works.
- Provider/hook `useCalibrations()` (loaded once, like aliases; 404/failure -> calibration UI hidden, no crash).
- Device detail page (122), for each member entity with domain `cover` and no `current_position` attribute: a "CALIBRATE" button (tokens/Button only). It opens a dialog/panel with the wizard:
  1. "Step 1/2: the cover will CLOSE. Press DONE when it has fully closed." Sends `close_cover`, starts a timer, shows elapsed seconds, DONE button (and CANCEL which sends `stop_cover` and aborts).
  2. Same for OPEN (`open_cover`).
  3. Summary with both times, SAVE (PUT) or RETRY. Times under 0.5 s or over 300 s are rejected with a message.
  - Measured time = press timestamp minus the moment the action request resolved; the user is told reaction time is included.
- After calibration the cover controls (`CoverControls`, 124-era buttons SHUT/STOP/OPEN) additionally show a percentage slider (0..100) using `setCoverPercent`, with the label `{n}% OPEN (EST.)` from `attributes.estimated_position`, or `POSITION UNKNOWN: move to an end first` when null (intermediate values disabled until then). RECALIBRATE and DELETE CALIBRATION actions on the detail page.
- Stream events carrying a new `estimated_position` update the slider; a pending move shows the existing busy state (117).
- Unit tests: wizard state machine (timers faked), API mapping, CoverControls with/without calibration. One Playwright spec with the mock: calibrate then move to 50%.

## Touches existing endpoints
GET/PUT/DELETE /api/calibrations and POST /api/entities/:id/cover-percent (new, backend 010/011); `attributes.estimated_position` on covers.

## Done when
- A cover without position can be calibrated and moved to a percentage in the mock E2E; test.cjs green.
