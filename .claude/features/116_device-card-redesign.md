---
id: "116"
slug: device-card-redesign
title: Device cards redesign (Home 3D)
role: frontend
type: change
extends: "103"
---

# Device cards redesign (Home 3D)

## Description
Give the device cards of the Home 3D panel (`DeviceModule`, list built by `DevicePanel`) a more polished, "fancy" look while keeping the same data and behavior. Visual-only: no new endpoints and no change to state logic. Extends feature 103 (areas dashboard / device modules).

## Requirements
- Read `.claude/DESIGN.md`; colors, spacing, glows and motion only from tokens in `src/index.css` (`@theme`); no raw hex.
- Icon tile: a halo/glow in the domain hue (`domainHue`) that lights up when the device is on and goes flat when off or unavailable.
- Card surface: subtle gradient / border accent by state (on = hue accent, off = neutral, unavailable = dimmed with error accent); hover lifts the card (elevation + background shift).
- Clearer state line: the telemetry text (`describeState`) with a status beacon; keep DRAW METRIC for plugs.
- Staggered entrance of the list items; animations respect `prefers-reduced-motion` (use `motion-reduce:` variants).
- Reuse `Card`/`StatusChip`/`FilterPill` and `StringUtils.JoinClassName`; do not touch `DeviceControls` logic (loaders are feature 117).
- Accessibility: unchanged roles and names (`article` named by displayName, switches named "<name> power"); contrast stays AA.
- Unavailable devices are not shown at all in this view (existing behavior); do not reintroduce them.

## Touches existing endpoints
no

## Done when
- Cards show on/off/unavailable-free states with the new look, verified in the browser at mobile and desktop widths.
- Component test (vitest) for on / off visual state classes; existing E2E for Home still green.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
