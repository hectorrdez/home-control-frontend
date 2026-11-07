---
id: "120"
slug: home-interactive-sidebar
title: Home 3D sidebar shows only interactive devices
role: frontend
type: change
extends: "119"
---

# Home 3D sidebar shows only interactive devices

## Description
The right-hand panel of Home 3D (`DevicePanel`) lists only entities the user can act on. Read-only entities (`sensor`, `binary_sensor`, and any other domain without a control) leave this panel; the full inventory moves to the Devices page (121). Keeps the no-page-scroll layout of 119, the room selection driven by the 3D stage (106), live updates (105), optimistic controls (104/117) and renames (115).

## Requirements

### 1. Shared predicate `isInteractive` (`src/state/selectors.ts`)
- Export `INTERACTIVE_DOMAINS = new Set(["light", "switch", "fan", "climate", "cover", "lock", "scene", "script"])`. This is exactly the set of domains that `DeviceControls.tsx` renders a control for (keep the two in sync; add a one-line comment pointing at `DeviceControls`).
- Export `isInteractive(entity: Entity): boolean` = `INTERACTIVE_DOMAINS.has(entity.domain)`. Domain only. It does not look at availability (unavailable entities are still hidden by the existing `isUnavailable` filter) and does not look at `device_class`.
- It lives in `selectors.ts` (state layer, no UI imports) so 121 can import it. Do not put it in `deviceState.ts`.
- Mock house (`src/api/mock/fixtures.ts`, `createFixtureEntities`, 26 entities), expected result:
  - true (9): `light.living_room_ceiling`, `light.kitchen_ceiling`, `light.bedroom_lamp`, `light.office_desk`, `climate.living_room`, `cover.bedroom_blinds`, `switch.office_desk`, `lock.front_door`, `scene.dawn`.
  - false (17): the 8 room sensors `sensor.{living_room,kitchen,bedroom,office}_{temperature,humidity}`, `sensor.office_desk_power`, `sensor.house_power`, `sensor.energy_today`, `sensor.co2`, `sensor.pm25`, `sensor.hvac_filter_life`, `sensor.solar_power`, `sensor.entry_motion_battery`, `binary_sensor.entry_motion`.

### 2. Selectors used by the panel (`src/state/selectors.ts`)
- `deckSections(state, selectedArea, filter)`: keep only entities that are `!isUnavailable(e) && isInteractive(e)`. Ordering (group rank, then name) and the "section kept when `selectedArea !== null` even if empty" rule stay as they are.
- `groupCounts(state)`: count only available interactive entities, for ALL and for every pill. Mock house result: `{ all: 9, lights: 4, climate: 1, security: 1, plugs: 1 }` (cover and scene are group `other`: they count in ALL only, as today).
- `plugPowerSensorIds` / `domainGroupOf` unchanged. `plugDrawBySwitch(allEntities(state))` keeps using ALL entities, so the switch card still shows its DRAW METRIC from the (now hidden) power sensor.
- `summarize` / `houseLoad` unchanged: the status chip (ALL SYSTEMS SYNCHRONIZED / ATTENTION // n UNAVAILABLE), `n ZONES MONITORED • n LIVE ACTUATORS` and `LOAD` stay house-wide (system health, not list content). Mock house: `4 ZONES MONITORED • 8 LIVE ACTUATORS`, `LOAD 1.24 kW`.

### 3. `DevicePanel.tsx`
- Room chips (`rooms`): a room is shown only if it has at least one entity that is available AND interactive. Mock house: ALL ROOMS + LIVING ROOM, KITCHEN, MASTER SUITE, OFFICE, UNASSIGNED = 6 buttons (unchanged count; UNASSIGNED stays because of `lock.front_door` and `scene.dawn`).
- Filter pills: counts come from the new `groupCounts`; pills with count 0 stay hidden (current rule).
- Empty state (when the filtered list is empty), one `<p role="status">` with the existing token classes (`rounded border border-outline-variant/30 p-space-md font-label-caps text-label-caps uppercase text-on-surface-variant`), no new colors:
  - `state.areas.length === 0` -> `NO DEVICES` (unchanged, e2e relies on it).
  - otherwise, `selectedArea !== null` -> `NO CONTROLLABLE DEVICES IN THIS ZONE` (covers both: a room picked from the 3D stage that only has sensors, and a pill + room combo with no match).
  - otherwise (`selectedArea === null`, house has only read-only/unavailable entities, or pill has no match) -> `NO CONTROLLABLE DEVICES`.
  - When shown, the `Devices` list is not rendered (as today).
- A room selected from the 3D stage that has no interactive device (not in the chips) must still be honored: the panel shows the zone empty state; no crash, ALL ROOMS chip remains clickable to reset.
- Do NOT add an "All devices" link/button: 121 is not built yet. 121 adds it (no dead link).
- Keep 119: the `min-h-0` chain and `overflow-y-auto` on the list untouched; only the list scrolls.

### 4. Files to touch (only these)
- `src/state/selectors.ts`, `src/state/selectors.test.ts`
- `src/components/panels/DevicePanel.tsx`, `src/components/panels/DevicePanel.test.tsx`
- `src/api/mock/fixtures.ts`, `src/api/mock/scenarios.ts`, `src/api/mock/createMockApi.ts` (new scenario, see 5)
- `e2e/specs/areas-dashboard.spec.ts`, `e2e/specs/home-device-cards.spec.ts`, `e2e/specs/home-no-scroll.spec.ts`, new `e2e/specs/home-interactive-sidebar.spec.ts`
- `e2e/components/device-deck.ts` only if a new operation is needed (e.g. `emptyState()`); no selectors in specs.
- No change to `DeviceModule`, `DeviceControls`, `deviceState.ts`, `HouseStage`, `EntitiesProvider`, `TelemetryPage`.

### 5. Mock scenario `many-devices` (keeps the 119 scroll proof deterministic)
- With 9 cards the list may no longer overflow at every 119 viewport. Add `"many-devices"` to `SCENARIOS` and `createManyDeviceEntities()` in `fixtures.ts`: 20 lights `light.strip_01` .. `light.strip_20` ("Strip 01".."Strip 20", state `off`, `supported_color_modes: ["brightness"]`, `brightness: 0`), area `office`. Appended to the default house in `createMockApi` the same way `raw-names` is.
- `home-no-scroll.spec.ts` "the device list scrolls inside its own container" opens `?mock=many-devices`; "the document does not scroll vertically" runs both on the default house and on `?mock=many-devices`.

### 6. Tests
Unit `selectors.test.ts`:
- `isInteractive` is true for each of `light, switch, fan, climate, cover, lock, scene, script` and false for `sensor`, `binary_sensor`, `alarm_control_panel`, `input_boolean`, `button`, `weather`, `""` (synthetic entities).
- `isInteractive` over `createFixtureEntities()` returns exactly the 9 ids of section 1 (assert the sorted id list, not just a count).
- An unavailable `light` is still `isInteractive === true` but is excluded by `deckSections` / `groupCounts`.
- `groupCounts` on the fixture house = `{ all: 9, lights: 4, climate: 1, security: 1, plugs: 1 }`.
- `deckSections(fixtures, null, "all")` contains no `sensor.*` / `binary_sensor.*`; `deckSections(fixtures, "office", "all")` = `["light.office_desk", "switch.office_desk"]` (order by group rank: lights then plugs).
- Update existing expectations that counted sensors (domain-groups / deck-sections / unavailable tests) to the new numbers; do not delete the cases.

Component `DevicePanel.test.tsx` (existing harness):
- Kitchen fixture: list shows `Kitchen ceiling` and `Kettle`, NOT `Kettle power`; PLUGS pill count is 1. Replace the old "42 W" list assertion with: the `Kettle` card shows the draw `42 W` (drawText still wired).
- An area whose only entities are `sensor` / `binary_sensor` (add `areaOf("garden", "Garden", [sensor temp, binary_sensor motion])`) has no room chip.
- Selecting that area via the provider (`setSelectedArea("garden")`, e.g. a tiny test consumer or by rendering with the stage hook) shows `NO CONTROLLABLE DEVICES IN THIS ZONE` with `role="status"` and no `Devices` list.
- A house with only sensors -> `NO CONTROLLABLE DEVICES`, no `Rooms` group, ALL pill count 0.
- Header still house-wide: existing `ZONES MONITORED • n LIVE ACTUATORS` and `LOAD 1.50 kW` assertions stay green (sensor `house_total_power` hidden from the list but still feeds LOAD).
- Rename existing `NO DEVICES IN THIS ZONE` assertion to `NO CONTROLLABLE DEVICES IN THIS ZONE`; `NO DEVICES` case unchanged.

Playwright (mock house, via `HomePage` / `DeviceDeck` objects):
- New `home-interactive-sidebar.spec.ts`:
  - default house: `deck.modules()` count 9; ALL pill contains `9`; no article named `Living room temperature`, `Entry motion`, `House power`, `Desk outlet power`, `CO2`; articles `Thermostat`, `Front door`, `Dawn`, `Bedroom blinds`, `Desk outlet` visible.
  - CLIMATE pill -> 1 module (`Thermostat`); SECURITY -> 1 (`Front door`); PLUGS -> 1 (`Desk outlet`).
  - Controls still work: toggling `Kitchen ceiling` power flips `aria-checked` (reuse `DeviceCard`).
- `areas-dashboard.spec.ts`: ALL `26` -> `9`, modules 26 -> 9, rooms buttons stay 6, LIGHTS 4 unchanged, KITCHEN room -> 1 module.
- `home-device-cards.spec.ts`: count 26 -> 9 (6th/7th card still exist).
- `realtime-updates.spec.ts` must stay green unchanged (the `°C` comes from the Thermostat card; the in-place change comes from LOAD / Desk outlet DRAW drift). If it fails, retarget it to the `Desk outlet` card draw text; do not delete it.
- `home-no-scroll.spec.ts` per section 5.

### Edge cases
- Unavailable/unknown interactive entity: hidden (unchanged), counted in ATTENTION.
- Entity with no area (`null` / `UNASSIGNED`): shown under UNASSIGNED if interactive.
- Live stream event for a hidden sensor: list unchanged, no re-order flicker; LOAD and DRAW METRIC update.
- Selected pill whose count drops to 0 after the filter (e.g. old CLIMATE from sensors): pill hidden; if it was selected, the list shows `NO CONTROLLABLE DEVICES` until ALL is chosen (no auto-reset required).

## Touches existing endpoints
no (reads entities from the existing state provider)

## Done when
- Home 3D panel never shows sensor/binary_sensor entities; controls, renames, live updates still work.
- Unit tests for `isInteractive` and selectors, component tests for the panel, Playwright spec on Home with the mock house; updated specs green.
- test.cjs green; Sonar gate OK.
