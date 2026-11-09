---
id: "152"
slug: house-ha-areas-hatch
title: Map house rooms to the real HA areas + altillo hatch
role: frontend
type: change
extends: "150"
---

# Map house rooms to the real HA areas + altillo hatch

## Description
The user answered the 150 questions. The rooms of the 3D plan must bind to the real Home Assistant areas, and the altillo hatch (trampilla) sits in the ceiling right above the interior door of Habitación papá. Missing HA areas (Despensa, Taller, Baño Arriba) were created in the HA area registry on 2026-11-09.

## Requirements
- Converter room `areaIds` (first = mock id when the mock has one, then the real HA area_id): salon [living_room, salon], cocina [kitchen, cocina], despensa [despensa], bano-pb [bano, aseo], taller [taller], patio [patio], habitacion-papa [bedroom, dormitorio_papa], bano [bano_arriba], distribuidor [pasillo, hallway], habitacion-hector [office, dormitorio_hector], habitacion-nuria [dormitorio_nuria], terraza [terraza], altillo [altillo, attic]. Candidate lists stay disjoint.
- Altillo hatch: an attic `openings` entry `{kind: "hatch"}` plus a thin furniture box (h 0.05 m, layer `hatch`) over the door rect of Habitación papá (DWG x 1978.42–1979.24, y 1432.90–1433.62), so the 3D view and the CAD export show it.
- Regenerate `dwgPlan.json` and `casa-3d.dxf/.dwg`. Update the unit tests that assert room candidates.

## Touches existing endpoints
no

## Done when
- In live mode the rooms bind to salon, cocina, bano, despensa, taller, patio, dormitorio_papa, bano_arriba, pasillo, dormitorio_hector, dormitorio_nuria, terraza, altillo; the mock keeps working.
- test.cjs is green.
