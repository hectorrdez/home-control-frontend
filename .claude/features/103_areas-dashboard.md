---
id: "103"
slug: areas-dashboard
title: Home control center - device panel
role: frontend
type: feature
extends: null
---

# Home control center - device panel

## Description
Left panel of the `/` screen (`design/stitch/home_3d_control_center/code.html`, the `xl:col-span-4` section): system summary, domain filter pills, room selection, and a scrollable deck of device modules read from `getAreas()`. Read-only here; controls arrive in 104, live updates in 105, the 3D stage in 106.

## Requirements
- Data: `api.getAreas()` (102/110) once on mount, held in a single store `src/state/entities.ts` (context + reducer keyed by `entityId`, plus area list) that 104/105/106/111 reuse. Exposes `selectedArea` (`null` = all) and `selectedDomainGroup`.
- Summary card (KpiCard style): title `label-caps` "ALL SYSTEMS SYNCHRONIZED" (secondary chip) when status online and no entity `unavailable`, else "ATTENTION" (tertiary chip) with the count of unavailable entities; subtitle "<N> ZONES MONITORED • <M> LIVE ACTUATORS" (zones = areas with entities, excluding unassigned; actuators = light/switch/climate/cover/fan/lock); "LOAD <x> kW" from `sensor.*` with `device_class: power` named house/total if present, else the sum of power sensors; hidden if none.
- Domain filter pills (FilterPill, 109) with live counts: ALL, LIGHTS (light), CLIMATE (climate + temperature/humidity sensors), SECURITY (lock, alarm_control_panel, binary_sensor motion/door/window), PLUGS (switch + power sensors bound to a switch by name/area). Groups with 0 entities are hidden except ALL.
- Room chips (FilterPill) "ALL ROOMS" + one per area (incl. "Unassigned" if non-empty); selecting one filters the deck and sets `selectedArea` (106 reads it).
- Device deck: one `DeviceModule` (new in `src/components/cards`, spec in DESIGN.md) per entity in the filtered set: domain icon (lucide), name, `label-caps` meta "<AREA NAME> // <entity_id>", beacon + state text (ON/OFF/OPEN 75%/21.5 °C/DETECTED...), domain-hue indicator when on. Read-only state rendering for every domain listed in 110 fixtures; unknown domains render a generic module with the raw state. Sensors render their value in `telemetry-md` with unit.
- Deck is scrollable inside the panel on desktop (panel height = viewport - header - footer), full flow on mobile. Order: area order, then domain group, then name.
- States (DESIGN.md): loading skeleton (3 modules), empty ("NO DEVICES IN THIS ZONE" / no areas at all), error (chip + Retry calls getAreas again), success.
- Coverage choice: Playwright (main journey, cross-component filter interaction) with mock scenarios: default shows 4 rooms and modules; LIGHTS pill shows only lights and the count matches; "Kitchen" room chip filters to kitchen entities; `?mock=empty` empty state; `?mock=error` error + Retry; `?mock=slow` skeleton visible first. Page object `e2e/pages/home.ts` composing `header`/`navigation` components and a `deviceDeck` component object. Unit tests for the grouping/summary selectors (domain group mapping, actuator count, load kW).

## Touches existing endpoints
yes: consumes GET /api/areas (backend 004) via `HomeApi.getAreas`

## Done when
- `/` left panel matches the reference structure and is fully driven by the mock house; all four states handled.
- Filters and room chips work and are covered by E2E; selectors covered by unit tests.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
