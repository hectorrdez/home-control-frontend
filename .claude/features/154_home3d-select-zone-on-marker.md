---
id: "154"
slug: home3d-select-zone-on-marker
title: Select the zone when clicking its marker in home3d
role: frontend
type: change
extends: 106
---

# Select the zone when clicking its marker in home3d

## Description
In the home3d page, clicking the zone's ball (marker) must select the zone exactly as clicking the area does. Today only the area/room mesh selects.

## Requirements
- In src/house/HouseScene.ts / HouseStage.tsx, make the zone marker (ball) part of the raycast and call the same onSelect(areaId) path (setSelectedArea).
- If the zone is on another floor than the visible one, switch to that floor like room selection already does (features 149/150).
- Device markers keep their own behavior; do not break orbit/drag (a drag must not select).
- Unit tests for the raycast hit on the marker; update house-3d-view e2e notes for the testing repo.

## Touches existing endpoints
no

## Done when
- Clicking a zone marker selects that zone (same state as clicking the area) and switches floor if needed.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
