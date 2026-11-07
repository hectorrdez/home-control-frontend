---
id: "130"
slug: zone-color-palette
title: Shared per-zone color palette
role: frontend
type: feature
extends: null
---

# Shared per-zone color palette

## Description
Give every zone (area) a stable, distinct color from the design tokens, used by the 3D house view and by charts, so a room has the same color everywhere. Today the 3D scene (`src/house/HouseScene.ts`) tints rooms with theme tokens only and does not distinguish zones.

## Requirements
- New pure module (e.g. `src/features/zones/zoneColors.ts`): `zoneColorToken(areaId)` returns a CSS token name picked deterministically from an ordered list of distinct chart tokens in `index.css` (read `.claude/DESIGN.md`; no hex literals, `lint:tokens` must pass). Same area id always maps to the same token; the mapping must not depend on render order or on which areas currently have data (hash/sorted-id based, wraps when more areas than tokens).
- Add missing distinct tokens to `index.css` only if the existing palette cannot give at least 8 distinguishable colors; follow DESIGN.md naming.
- `HouseScene`: each room's tint/outline/marker uses its zone color (keep active/hover states readable). Respect `prefers-reduced-motion` and existing behavior otherwise.
- Export a small `ZoneDot` component (colored dot + a11y-hidden) reusable by pills and legends.
- Unit tests: determinism, uniqueness for the known mock areas, wrap-around, unknown id. Update `HouseScene.test.ts` for the new colors. Playwright: 3D view still renders in mock mode (existing 106 specs stay green).

## Touches existing endpoints
no

## Done when
- Each mock area has a distinct color, identical in the 3D view and exported helper.
- test.cjs is green.
