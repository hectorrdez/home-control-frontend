---
id: "110"
slug: mock-data-layer
title: Mock data layer (typed HomeApi mock)
role: frontend
type: feature
extends: null
---

# Mock data layer (typed HomeApi mock)

## Description
A deterministic, stateful in-browser implementation of `HomeApi` (102) with a house that matches the Stitch reference (4 rooms, mixed device domains, sensors). It lets every UI feature (103-106, 111, 112) be built and E2E-tested without the backend or Home Assistant, and is the default for dev and Playwright.

## Requirements
- `src/api/mock/` implementing `HomeApi`; selected when `VITE_API_MODE=mock`. Must not be bundled in production `live` builds (dynamic import behind the mode check).
- Fixture house `src/api/mock/fixtures.ts`, realistic HA shapes (entity ids, domains, attributes as HA exposes them):
  - Areas `living_room`, `kitchen`, `bedroom`, `office` (names "Living room", "Kitchen", "Master suite", "Office") + `unassigned` group.
  - Per area at least: one `light` (attrs `brightness` 0-255, `supported_color_modes`, optional `color_temp_kelvin`), one `sensor` temperature (`device_class: temperature`, `unit_of_measurement: "°C"`) and humidity (`%`).
  - `climate.living_room` (attrs `current_temperature`, `temperature`, `hvac_modes`, `hvac_action`, `preset_modes`, `min_temp`, `max_temp`, `target_temp_step`), `cover.bedroom_blinds` (`current_position`), `switch.office_desk` + `sensor.office_desk_power` (`W`), `binary_sensor.entry_motion` (`device_class: motion`), `lock.front_door`, `sensor.house_power` (W), `sensor.energy_today` (kWh), `sensor.co2` (ppm), `sensor.pm25` (µg/m³), `sensor.hvac_filter_life` (%), `sensor.solar_power` (W), a battery sensor (%), and a `scene.dawn` in `unassigned`.
- Behavior:
  - `runAction` mutates the in-memory state per HA semantics (toggle/turn_on/turn_off; `brightness_pct`; climate `set_temperature`/`set_hvac_mode`/`set_preset_mode` via action + params; cover `open_cover`/`close_cover`/`set_cover_position`; scene `turn_on`), updates `lastChanged`, resolves with the new entity after ~150 ms, and emits it on the stream.
  - `subscribe` emits, every 5 s, small deterministic drifts of temperature/power sensors and occasionally `binary_sensor.entry_motion` on/off; reports `open` immediately.
  - `getHistory(ids, hours)` returns seeded deterministic series (points every 15 min for <=24h, hourly beyond) for numeric sensors; non-numeric ids return empty points.
  - Seeded PRNG so the same seed gives the same data; `?seed=` overrides.
- Scenario switch (mock mode only), via URL query `?mock=` read once at startup: `default`, `empty` (no areas/entities), `error` (every read rejects `ApiError("unavailable")`), `slow` (reads delayed 2 s), `action-error` (runAction rejects), `stream-drop` (stream goes `reconnecting` after 3 s, back to `open` after 6 s), `offline` (getStatus `online:false`), `no-history` (getHistory rejects `not_found`).
- Playwright `webServer` env sets `VITE_API_MODE=mock`; document scenarios in README and notes.md.
- Coverage choice: unit only (pure logic, no UI): fixture shape validates against `types.ts`; each action mutates correctly; stream emits after action; history deterministic for a given seed; each scenario behaves as listed. One Playwright check is not needed (consumers' specs exercise it).

## Touches existing endpoints
no (mocks the contract of backend 001-005 and the proposed history endpoint)

## Done when
- `npm run dev` with no backend shows the panel online with the fixture house (header ONLINE).
- Unit tests cover actions, stream, history, scenarios; production build does not contain the fixtures (check the built chunk list).
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
