---
id: "149"
slug: house-plan-from-dwg
title: 3D house from the real DWG floor plans (2 floors)
role: frontend
type: change
extends: "106"
---

# 3D house from the real DWG floor plans (2 floors)

## Description
Replaces the Stitch 2x2 placeholder plan of feature 106 with the real house, taken from the AutoCAD file `planos casa reforma revisar.dwg` (parent folder, AC1032). The DWG holds two floor plans side by side (ground floor and upper floor, 5.0 x 10.4 m each, units = metres, no TEXT entities). A reproducible converter turns the LibreDWG JSON export into a versioned, refined plan file (walls, windows/doors, stairs, furniture, hand-named rooms), and the 3D stage renders it one floor at a time with floor chips.

## Requirements
- Converter `scripts/dwg-plan/convert.cjs` (Node, no deps): input = `dwgread -O JSON` output of LibreDWG 0.14; output = `src/house/dwgPlan.json` (metres, per floor, x along the facade, y from the facade to the back). Extracts walls (paired parallel `tabiqueria` lines + single-line party walls), windows cut out of walls, doors, stair treads, furniture footprints. Rooms (no text in the DWG) are refined by hand in the converter config with label, `areaIds` candidates and hue. Committed together with the generated JSON.
- Rooms: ground = Salón (`living_room`), Cocina-comedor (`kitchen`), Baño planta baja, Taller (workshop, enclosed strip of the back zone, under the terrace), Patio (outdoor); interior staircase on both floors (stair treads as rising steps); upper = Dormitorio principal (`bedroom`), Baño, Distribuidor, Dormitorio 2 (`office`), Dormitorio 3, Terraza. Each room has `areaIds` candidates (first = mock area id, then likely Spanish HA ids such as `salon`, `cocina`, `dormitorio`); `bindRooms` resolves the first candidate present in `getAreas()` (else the first) and marks `present`. Resolved ids must stay unique.
- `plan.ts`: `DEFAULT_PLAN` built from `dwgPlan.json` (2 scene units per metre, centred on the origin, facade towards +z so the cutaway low walls face the camera). Floors carry `label`; walls keep `Box`; new optional `glass` boxes (windows) and stair steps as furniture. Plate stays 22 so camera presets are unchanged.
- `HouseScene`: one group per floor; `setFloor(index)` shows only that floor (walls, rooms, furniture, labels), hidden rooms are not pickable. Facade and right walls low (cutaway), others full height; window glass uses a token color, no hex.
- `HouseStage`: floor chips `FL 01` / `FL 02` (buttons with `aria-pressed`, aria-label = floor label) only when the plan has >1 floor; HUD `LEVEL 0n • k ROOMS` counts present rooms of the shown floor; selecting an area (chip or click) whose room is on another floor switches to that floor. The `aria-live` status list keeps one line per present room of every floor ("Kitchen: ..."), so existing e2e specs keep passing. Read DESIGN.md: chips reuse the existing button classes/tokens.
- Mock house unchanged (areas living_room, kitchen, bedroom, office).
- Coverage: unit tests for the plan builder (2 floors, rooms inside the plate, unique ids, candidate resolution), the converter on a tiny synthetic LibreDWG JSON, HouseScene floor switching, HouseStage floor chips/auto-switch. Existing e2e (testing repo) must stay green.

## Touches existing endpoints
no (uses `getAreas()` via the 103 store)

## Done when
- `/` shows the real house (ground floor first) with floor chips; FL 02 shows the bedrooms; selecting "Master suite" switches to FL 02.
- `node scripts/dwg-plan/convert.cjs <plan.json>` regenerates `src/house/dwgPlan.json` byte-identical.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
