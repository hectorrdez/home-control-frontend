---
id: "151"
slug: house-cad-export
title: 3D CAD drawing of the house (model + plan/elevation/section per floor)
role: frontend
type: feature
extends: null
---

# 3D CAD drawing of the house

## Description
Generates, from the refined plan data `src/house/dwgPlan.json` (149/150), a CAD drawing of the whole house: a 3D model (ground floor, upper floor, altillo, continuous stairs, terrace L, patio, taller, gable roof, real wall heights) plus, laid out next to it on the same sheet, the planta, alzado and perfil (section) of each floor. Reproducible with a dependency-free Node script. Output: DXF (AutoCAD opens it) and a DWG converted with LibreDWG `dxf2dwg` (experimental writer).

## Requirements
- `scripts/dwg-plan/cad-export.cjs [plan.json] [out.dxf]` (defaults `src/house/dwgPlan.json`, `../casa-3d.dxf` = `F:\proyectos\home-control\casa-3d.dxf`). Node, no deps. ASCII DXF R12 (AC1009), units metres (`$INSUNITS` 6), `$DWGCODEPAGE` ANSI_1252, file written latin1. Entities: LINE, 3DFACE, TEXT only.
- Layers: 3D model `M3D-WALL`, `M3D-GLAZ`, `M3D-STAIR`, `M3D-FURN`, `M3D-SLAB`, `M3D-ROOF`, `M3D-ANNO`. 2D views `A-WALL`, `A-DOOR`, `A-GLAZ`, `A-STAIR`, `A-FURN`, `A-ROOF`, `A-DIMS`, `A-ANNO`, `A-VIEW`. Distinct ACI colors.
- 3D model at the origin, levels stacked at z = level * 2.7 m. Boxes become 6 3DFACEs. Windows: sill 0–0.9 m, lintel 2.1 m to the wall top, glass face. Upper slabs 0.15 m per room part (the void and the stairwell stay open). Roof prism from the knee to the ridge. Room labels as TEXT.
- Sheet to the right of the model, one column per floor (planta / alzado / perfil rows), with titles, room labels (name + m²), and overall dimensions drawn with lines, ticks and text. The alzado is the street elevation (facade-zone elements + floor and roof outline). The perfil is a vertical section at a fixed x per floor (cut boxes, with stairs projected). No hidden-line removal.
- Validate: re-read the DWG with LibreDWG `dwgread` and render a preview image.
- Unit test: the generator on the real plan yields a DXF with the expected layers and 3DFACE count > 0 and TEXT for every room.

## Touches existing endpoints
no

## Done when
- `casa-3d.dxf` and `casa-3d.dwg` exist in `F:\proyectos\home-control\` and re-read correctly; the preview shows the model and the 9 views.
- test.cjs is green.
