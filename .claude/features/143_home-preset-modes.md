---
id: "143"
slug: home-preset-modes
title: MODES button on Home 3D for actuators with saved positions
role: frontend
type: feature
extends: "120"
---

# MODES button on Home 3D for actuators with saved positions

## Description
On the Home 3D page the right-hand device panel (`DevicePanel`, 120) lists the controllable devices. When a cover has at least one saved position (142 / backend 021), its card shows a "MODES" button that opens a small menu with those positions; picking one runs it (`applyPreset`). Covers without presets look exactly like today. Depends on 142.

## Requirements
- Reuse `usePresets()` (142). No new API call besides `applyPreset`.
- In the cover controls rendered by `DevicePanel` (`DeviceControls` cover branch, the card used on Home 3D): if `presetsFor(entityId).length > 0` add a `Button variant="secondary"` "MODES" (`aria-haspopup="menu"`, `aria-expanded`). Rendered only in the Home 3D panel context (prop/flag from `DevicePanel`), not on the device detail page (142 already lists them there) nor on the Devices list.
- Click -> `DropdownFloating` (existing) with `role="menu"`, one `role="menuitem"` per preset: `{NAME} {percent}%`, sorted like 142. Keyboard: arrows move, Enter applies, Esc closes and returns focus to MODES. Click outside closes.
- Selecting an item: closes the menu, calls `applyPreset(id)`, shows the 117 pending/busy state on the card until the reply or the stream update; failure -> existing Toast error with the 142 messages (`position_unknown`, `preset_not_applicable`, generic).
- The active preset is NOT tracked (positions are estimates); no "selected" mark in the menu.
- Unavailable cover: MODES disabled like the other controls.
- Live: presets changed on another device (142/138 refetch) update the button (appears/disappears) without reload.
- DESIGN.md tokens and canonical components only; fits the no-page-scroll layout (119): the menu floats, it does not grow the card.

## Touches existing endpoints
POST /api/presets/:id/apply (backend 021, via 142); GET /api/presets (via 142 provider).

## Done when
**Unit (Vitest)**
- MODES appears only with >= 1 preset and only in the Home panel context; menu lists presets in order; Enter/click applies the right id; Esc returns focus; failure shows the toast; disabled when unavailable.

**E2E (Playwright, mock)**
- Home 3D, mock calibrated cover with a preset "HALF 50%": MODES visible -> open -> pick HALF -> card shows `50% OPEN (EST.)`. A cover with no presets shows no MODES.
- test.cjs green.
