---
id: "142"
slug: actuator-presets-ui
title: Save and run named positions for covers (device detail)
role: frontend
type: feature
extends: "127"
---

# Save and run named positions for covers (device detail)

## Description
Backend 021 stores named positions ("presets") per cover and applies them (`POST /api/presets/:id/apply`, timed move for calibrated covers, `set_cover_position` for covers with feedback). This feature adds the API client and a "SAVED POSITIONS" section on the device detail page (122) next to the calibration panel (127): list, apply, rename, delete and save a new position, including right after finishing a calibration. 143 reuses the same provider for the Home 3D "MODES" button. Depends on backend 021 and 127; live refresh across devices uses 132/138 when present.

## Requirements
- Types + `HomeApi` (live + mock): `Preset { id, entityId, name, percent, createdAt }`; `getPresets(entityId?)`, `createPreset({ entityId, name, percent })`, `updatePreset(id, { name, percent })`, `deletePreset(id)`, `applyPreset(id): Promise<Entity>` (maps the `{ data: [entity] }` reply). Error kinds mapped from the codes in backend 021 (`duplicate_preset`, `too_many_presets`, `invalid_preset`, `preset_not_found`, `preset_not_applicable`, `position_unknown`). Refresh the read-only `.claude/endpoints.md` copy from the backend. Mock: in-memory presets + apply drives the mock cover to the percent with the existing 127 mock timers.
- `PresetsProvider` / `usePresets()` (loaded once at app start like calibrations; `presetsFor(entityId)` sorted by percent then name; 404/failure -> presets UI hidden, no crash). If 138 is ENDED: refetch on `resource_changed` `presets` from other clients (same debounce rule as 138); else load once (138 will add it).
- Eligibility helper `canUsePresets(entity, calibration)`: domain `cover` AND (calibrated OR numeric `attributes.current_position`). Pure, in `src/features/presets/`.
- Device detail page: for each eligible cover member, a "SAVED POSITIONS" card (Card + tokens from DESIGN.md, Button/FilterPill/EditableName only, no hand-rolled controls):
  - List rows: name, `{percent}%`, APPLY (`Button variant="secondary"`, busy while the request runs, uses the 117 pending/feedback state), rename (inline `EditableName`), DELETE (confirm inline: "DELETE <NAME>?" YES/NO).
  - "SAVE POSITION" form: name input (1..30) + percent `Slider` 0..100 prefilled with `attributes.estimated_position` (calibrated) or `current_position`, else 50; SAVE disabled while invalid. Max 10 per cover: at 10 the form is replaced by "MAX 10 POSITIONS".
  - Errors shown inline with existing error token text: duplicate -> "NAME ALREADY USED"; `position_unknown` on apply -> "POSITION UNKNOWN: move to an end first" (same wording as 127); `preset_not_applicable` -> "CALIBRATE THIS COVER FIRST".
- Calibration wizard (127) summary step, after SAVE succeeds: an extra optional "SAVE A POSITION" shortcut that scrolls/focuses the SAVE POSITION form (the wizard itself is not changed otherwise).
- Non-eligible covers (not calibrated, no feedback): the card shows only "CALIBRATE TO SAVE POSITIONS" (no form).
- Accessibility: list `aria-label="Saved positions"`, APPLY buttons `aria-label="Apply {name} {percent}%"`.

## Touches existing endpoints
GET/POST /api/presets, PUT/DELETE /api/presets/:id, POST /api/presets/:id/apply (new, backend 021); GET /api/stream `resource_changed` `presets` (016). GET /api/calibrations still used for eligibility.

## Done when
**Unit (Vitest)**
- API mapping + error kinds; `canUsePresets` truth table; provider sort/filter, 404 hides; form validation (name length, max 10); apply busy + error messages; rename + delete flows.

**E2E (Playwright, mock)**
- Device detail of the mock calibrated cover: save "HALF" at 50 % -> appears in the list; APPLY -> the cover card shows `50% OPEN (EST.)`; duplicate name shows the error; delete removes it.
- test.cjs green.
