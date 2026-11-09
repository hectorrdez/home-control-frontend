---
id: "150"
slug: house-whole-view
title: Whole-house 3D view (3 levels, stairs, terrace L, gable roof) with clickable floors
role: frontend
type: change
extends: "149"
---

# Whole-house 3D view with clickable floors

## Description
Feature 149 shows one floor at a time. The user wants the complete house first (ground floor, upper floor, altillo under a gable roof, continuous interior staircase, L-shaped terrace over the taller/patio) and then to click a floor to isolate it, as 149 does now. It also includes the user's corrections to the room names and layout (2026-11-09).

## Requirements
- Converter (`scripts/dwg-plan/convert.cjs`, already updated by the refiner) and regenerated `src/house/dwgPlan.json`:
  - rooms renamed: Habitación papá (`bedroom`), Habitación Héctor (`office`), Habitación Nuria.
  - new Despensa (pantry) under the whole first flight, entered from the taller (back-wall opening = door).
  - terrace = L (`parts`: left strip + band), the void over the patio has no floor; parapets 1.0 m around the L; the patio back wall rises to ground-floor height.
  - one continuous staircase on the ground floor with absolute elevations: flight A rises front -> back, landing, then flight B rises back -> front to the upper floor (`steps[].base` + `h` = tread slab).
  - third level `attic` (Altillo, areaIds `altillo`/`attic`) with a gable `roof` {x,y,w,d,knee,ridge,ridgeAxis:"x"} over the house part (`houseDepth`). Heights in metres; `walls[].h` real (level 2.7 m, parapet 1.0, knee 0.6).
- `plan.ts`: uniform scale (2 units per metre on all axes). Walls, glass, sills, lintels and furniture use real heights (window: sill 0.9 m, glass 0.9–2.1 m, lintel 2.1 m to the wall top). Steps keep `base`. Rooms get `parts` (floor hit/tint planes, default `[rect]`). Floors carry `level`, `height` (m * S) and optional `roof`. Each wall is tagged `cut: "low" | "normal"` (low = facade `y < 0.7 m` or right party wall) for the isolated view.
- `HouseScene`:
  - Whole-house mode (default, new): every floor group is visible and stacked at `y = level * 2.7 m * S`. Upper levels get a thin floor slab per room part; the void and the stairwell stay open. Roof: a transparent triangular prism (gable ends + 2 slopes, edges outlined) on top of the knee walls. Labels are hidden. A click picks the floor under the pointer -> `onFloorPick(index)`. No room selection in this mode.
  - Isolated floor mode (`setFloor(index)`, as in 149): only that group, at `y = 0`. A section cut with material clipping planes (`renderer.localClippingEnabled`) at 2.6 units for normal walls/furniture and 1.2 units for `cut: "low"` walls keeps the 149 cutaway look. Room picking, labels and highlight as in 149.
  - `setMode("house")` / `setFloor(i)`. The camera target/radius adapts (whole house: target y ≈ half the house height, radius ≈ 46; floor: as in 149). All colors from tokens, no hex.
- `HouseStage`:
  - chips `HOUSE` (aria-label "Whole house") + `FL 01..FL 03` (aria-labels = floor labels) in the `Floors` group, `aria-pressed`. Default = HOUSE.
  - HUD: `HOUSE • 3 LEVELS • n ROOMS` (n = present rooms) or `LEVEL 0n • k ROOMS`.
  - `onFloorPick` -> isolate that floor. Selecting an area (chip) switches to its floor.
  - The aria-live list is unchanged (all present rooms).
- User notes (same day): every terrace perimeter wall is the same half-height wall (1.0 m parapet, also any DWG wall in the terrace zone). The altillo walls are uniform very low walls on all four sides (`ALTILLO_WALL_H` = 0.2 m in the converter, exported as `wallHeight`; the user guesses 1-2 bricks and must confirm). Knee = that height, and the gable roof starts on them. The roof is visible only in the whole-house view, over the covered house part (not over the terrace, patio or void), and fully hidden in single-floor mode, the altillo included.
- Mock house unchanged. The e2e suite in the testing repo must stay green without edits.
- Coverage (unit): plan builder (3 levels, real heights, terrace parts, steps continuous 0 -> level height, attic roof), converter test updated (room list incl. despensa), scene mode switching (house shows all groups stacked, floor-pick callback, floor mode clipping enabled), stage chips/HUD/floor-pick.

## Touches existing endpoints
no

## Done when
- `/` opens on the whole house with the roof, stairs and terrace. Clicking a floor (or its chip) isolates it, and HOUSE returns to the whole view.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
