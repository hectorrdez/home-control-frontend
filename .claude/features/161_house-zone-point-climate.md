---
id: "161"
slug: house-zone-point-climate
title: Zone points show mean temperature and humidity (whole house and floor views)
role: frontend
type: change
extends: "150"
---

# Zone points show mean temperature and humidity

## Description
In the 3D house view the zone points (the ball of each zone) must show the temperature and humidity of that zone, also in the whole-house view where the room labels are hidden (150). If the zone has one sensor of a metric, that is the value; if it has several, the value is their mean. Today `roomLabel` (106) only reads the first sensor found.

## Requirements
- New pure helper `roomClimate(entities)` in `src/house/glow.ts` returning `{ temperature: number | null, humidity: number | null }`: mean of all `sensor` entities of the area with `attributes.device_class` = `temperature` / `humidity`. Ignore `unavailable`, `unknown` and non-numeric states. No valid sensor of a metric -> null for that metric.
- `roomLabel` and `roomStatus` use `roomClimate` (mean instead of first sensor). Format with the existing `formatTemperature` (1 decimal, `°C`) and `formatHumidity` (rounded, `% RH`). Absent parts are omitted.
- Zone point chip: each zone point shows a small chip next to its ball with the values, e.g. `21.5 °C · 48%`. Parts without data are omitted; a zone with no sensor shows no chip.
  - Whole-house view (HOUSE): chips visible on every present zone; room name labels stay hidden as in 150.
  - Isolated floor view: chips on that floor's zones, together with the existing name label (which now uses the mean).
- Chip is an HTML overlay positioned over the zone `marker`, same mechanism as labels (`setLabelElements`), following the camera and hidden when behind the model. React owns the text, the scene only positions it. Chips update live with the entity states (SSE).
- Chip must not block orbit/drag or marker click (154): `pointer-events: none`.
- Accessibility: the aria-live room list keeps `roomStatus` (now with mean temperature, plus mean humidity).
- Only tokens from `src/index.css` / DESIGN.md; `lint:tokens` clean. Works in mock and live mode; the mock house already has temperature/humidity sensors.
- Unit tests: `roomClimate` (1 sensor, N sensors mean, unavailable/non-numeric ignored, no sensors, only one metric), `roomLabel`/`roomStatus`, `HouseStage` (chips in HOUSE and in floor view, no chip without sensors, live update), `HouseScene` (chip positioning/hidden when behind). E2E in the testing repo is updated separately.

## Touches existing endpoints
no (consumes the entities already in state; see endpoints.md areas/stream)

## Done when
- In the whole-house view every zone point shows its mean temperature and humidity when it has sensors, and nothing when it has none.
- Two temperature sensors in one zone show their mean; one sensor shows its own value.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
