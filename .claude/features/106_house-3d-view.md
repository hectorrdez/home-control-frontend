---
id: "106"
slug: house-3d-view
title: 3D house stage (three.js)
role: frontend
type: feature
extends: null
---

# 3D house stage (three.js)

## Description
The right `xl:col-span-8` stage of `/`: an isometric cutaway of the house built procedurally with three.js, following `design/stitch/three.js/code.html` and the overlay HUD in `home_3d_control_center/code.html`. Rooms are mapped to HA areas, glow from live light state, show temperature labels, and are selectable in sync with the 103 room chips.

## Requirements
- Use npm `three` directly (no react-three-fiber) + `OrbitControls` from `three/examples/jsm/controls/OrbitControls.js`. Port the Stitch scene (r125) to current three: grid floor, base plate with edge outline, cutaway walls (low front/right walls), abstract furniture boxes per room, one `PointLight` "room glow" per room, floating hotspot markers, `FogExp2`. Record in notes.md: "3D = plain three + OrbitControls, procedural plan".
- House plan `src/house/plan.ts` (typed JSON-like): rooms with `areaId`, footprint rect, floor index, furniture boxes, label anchor. Default plan = the Stitch 2x2 layout mapped to `living_room`, `kitchen`, `bedroom`, `office`. Rooms whose `areaId` is not in `getAreas()` render dimmed and unselectable.
- All scene colors come from CSS tokens (DESIGN.md "3D scene colors"), read once at mount. No hex literals in TS.
- Bindings to the 103 store (live via 105):
  - Room glow intensity = f(lights in that area: any on -> on; brightness average scales intensity; all off -> glow off). Hue by dominant on-domain (cyan lights, amber when climate heating).
  - HTML overlay labels per room (CSS2D or absolutely positioned DOM, mono): "<ROOM>: 21.5 °C 48% RH" from that area's temperature/humidity sensors; omitted fields when absent.
  - Clicking a room (raycast) sets `selectedArea` (same as the room chips) and highlights its walls; selecting a chip highlights the room. Hover cursor pointer.
- Overlay HUD (DOM over the canvas): top-left "LEVEL 01 • <n> ROOMS"; bottom room chips (reuse 103 component); floor chips "FL 01/FL 02" only if the plan has >1 floor; view buttons with aria-labels "Isometric view", "Top view", "Reset camera"; footer hint "ORBIT [LEFT DRAG] • PAN [RIGHT DRAG]". Drop decorative fake telemetry from the reference (FPS, raycast, mesh latency, TLS).
- Performance/lifecycle: render on demand (only when controls move, state changes, or an animation is running), cap pixel ratio at 2, dispose geometries/materials/renderer on unmount, resize via ResizeObserver. `prefers-reduced-motion`: no idle animation.
- Lazy loading: the stage is a `React.lazy` chunk with `manualChunks` naming three's chunk `three`; `/telemetry` must not load it.
- WebGL unavailable or context lost -> fallback panel "3D VIEW UNAVAILABLE" with the room chips still usable.
- Coverage choice: unit for pure logic (glow-from-lights function, plan->area mapping, label text formatting); Playwright (mock mode): `/` shows the "House view" region with a canvas (or the fallback text if headless WebGL is missing - assert one of both); clicking the "Kitchen" room chip highlights it and filters the device panel; toggling a kitchen light changes the room's accessible status text (expose `aria-live` per-room status list, e.g. "Kitchen: lights on, 22.8 °C"); navigating to `/telemetry` fresh does not request any `three` chunk (check `page.on('request')`).

## Touches existing endpoints
no (uses the 103 store fed by 102/105)

## Done when
- `/` shows the 3D house next to the panel, rooms glow with light state, labels show live temps, selection is two-way with the chips.
- three is in a lazy chunk not loaded by `/telemetry`; fallback works without WebGL.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
