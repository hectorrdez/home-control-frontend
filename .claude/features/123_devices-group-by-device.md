---
id: "123"
slug: devices-group-by-device
title: Devices list shows physical devices, not their entities
role: frontend
type: change
extends: "121"
---

# Devices list shows physical devices, not their entities

## Description
`/devices` (121) lists every entity, so one physical device (e.g. a sensor) appears several times (Battery, Temperature, ...). The list must show one row per physical device; the entities/characteristics of a device (battery, temperature, state, ...) are shown in its detail page (122). User report: "Bateria" appears as a device although it is a characteristic of a sensor.

Extends 121 (list, filters) and 122 (detail page). Frontend only.

## Backend dependency
**None blocking.** The backend exposes no device id: backend 009 (ENDED) only adds `deviceName` (HA `name_by_user` or `name`, `null` when no device / lookup failed) to every normalized entity, everywhere (`/api/entities`, `/api/areas`, action response, stream). No device registry endpoint exists. Grouping by `deviceName` + area is reliable enough for this house (names are per device, entities inherit the device area). Known, accepted limits: two different devices with the same name in the same area merge into one row; an entity whose area was overridden in HA forms its own group in that area. Optional future backend feature (not part of 123): add `deviceId` (`device_id(s.entity_id)` in the same 009 template) for exact grouping; if added later, a new frontend feature switches the key.
Backend without 009 (no `deviceName`) -> every entity is standalone -> the list behaves exactly as 121.

## Requirements

### Grouping model (pure, `src/features/devices/deviceFilters.ts`, no React)
- Iterate `state.areas` groups as `buildDeviceRows` does today; the entity's area is the group it lives in (`group.areaId`, `UNASSIGNED` for none).
- `deviceSlug(name)`: NFKD, strip combining marks, lowercase, every run of chars that are not `\p{L}` or `\p{N}` -> `_`, trim leading/trailing `_`. E.g. `"ENCERRADO EN EL PATIO"` -> `encerrado_en_el_patio`, `"RT-AC65P"` -> `rt_ac65p`, `"Cocina Baño"` -> `cocina_bano`.
- Entity is **device-backed** when `deviceName` is a string and `deviceSlug(deviceName)` is non-empty. Otherwise (absent, `null`, empty/whitespace, or a name with no letters/digits) it is **standalone**.
- Device key:
  - device-backed: `${areaId}~${deviceSlug(deviceName)}` (e.g. `office~desk_plug`, `unassigned~encerrado_en_el_patio`). Never contains `.`, so it can never equal an HA entity id.
  - standalone: the entity id itself (e.g. `lock.front_door`), so 121/122 URLs of standalone entities stay identical.
- Entities with the same device key form one group (names that slug the same are the same device).
- Member order inside a group (also the primary choice = first member):
  1. interactive domains in this order: light, switch, fan, climate, cover, lock, media_player, scene, script;
  2. binary_sensor;
  3. sensor, by `attributes.device_class`: temperature, then any other non-battery class (or none), then battery last;
  4. any other domain;
  5. tie -> `entityId` localeCompare.
  Availability is NOT part of the order (the row icon must not jump when an entity goes unavailable).
- `DeviceRow` becomes: `{ key, label, areaId, areaName, primary: Entity, entities: Entity[] (ordered members), interactive: boolean (any member interactive), domains: string[] (distinct member domains) }`. Keep the exported name `DeviceRow` and `buildDeviceRows(state, label)`.
- `label`: device-backed -> `cleanName({ entityId: primary.entityId, name: deviceName })` from `features/names/displayName` (whitespace collapse + ALL CAPS fix; e.g. `ENCERRADO EN EL PATIO` -> `Encerrado en el patio`). Device names have no alias (aliases are per entity, 115). Standalone -> the `label(entity)` callback (displayName, as 121).
- Sort: areas in `state.areas` order with Unassigned last, then `label` localeCompare (as 121).
- New pure helper `resolveDeviceKey(rows, param): { row: DeviceRow; canonical: boolean } | null`: param equals a row key -> that row, `canonical: true`; param is an entity id that is a member of some row -> that row, `canonical: param === row.key`; else `null`.

### Search and filters over devices
- `filterDeviceRows`: query (normalized, as 121) matches the row label, the area name, the raw `deviceName`, or ANY member's displayName / raw `name` / `entityId`. A match shows the whole device row.
- Areas: `row.areaId` in the selected areas.
- Types (domains): row matches when ANY member domain is selected.
- Kind: INTERACTIVE = any member interactive; READ-ONLY = no member interactive.
- Groups AND, values inside a group OR, empty = no constraint (unchanged).
- `deviceFacets`: area count = rows in that area; domain count = rows that contain at least one entity of that domain (a row counts once per domain). Still over ALL rows, zero counts omitted, same ordering rules.
- `N OF M` counts device rows.

### List row (`DeviceRow.tsx`)
- Link to `PathUtils.deviceDetailPath(row.key)`; `aria-label` = `row.label`.
- Icon, hue and on/off color from `primary` (`domainIcon`, `domainHue`, `describeState(primary)`).
- Right side: `UNAVAILABLE` chip when `primary` is unavailable, else `describeState(primary).text` (e.g. Desk plug -> `ON`, room sensor -> `22.4 °C`).
- Meta line: standalone `${areaName} // ${entityId}` (unchanged); device with N >= 2 members `${areaName} // ${N} ENTITIES`; device with 1 member `${areaName} // ${entityId}`.
- No controls in the row (unchanged).

### Detail route and resolution
- Route `deviceDetail: "/devices/:deviceKey"` in `routePaths.ts`; `PathUtils.deviceDetailPath(key)` keeps `encodeURIComponent` (`~` stays literal, unicode is encoded, RR7 decodes).
- `DeviceDetailPage`: loading / error views unchanged. Ready: build rows from the store (same `buildDeviceRows` + displayName), `resolveDeviceKey(rows, param)`:
  - `null` -> `DEVICE NOT FOUND` with the param (unchanged view, URL kept);
  - found but not canonical (old `/devices/<entityId>` link to an entity that belongs to a multi-entity device) -> `<Navigate replace>` to `deviceDetailPath(row.key)`;
  - canonical -> render the device.
- Live: the page re-resolves on every store change (stream updates flow in). If the key stops matching (device renamed/moved), NOT FOUND is acceptable.

### Detail page content
- Row with 1 member (standalone or single-entity device): exactly the 122 page (header with EditableName, meta, chip, State / History / Attributes regions). No visible change; existing 122 tests stay valid.
- Row with N >= 2 members:
  - Header: BACK TO DEVICES link; `h1` = row label (plain text, not renamable); meta `AREA // N ENTITIES` (area uppercase, same style as 122); chip `ONLINE` if any member is available, `UNAVAILABLE` if all are unavailable. `document.title` = `${label} - Home Control`.
  - Then one `<section aria-label={displayName(entity)}>` per member, in member order (primary first). Each section reuses the 122 entity body extracted into one component (e.g. `EntityDetail`) with: `h2` = EditableName of the entity (shortName, rename via 115), meta `DOMAIN // entityId`, State card (icon, value, DRAW METRIC for switches, DeviceControls or READ ONLY, live SR text), History card when the entity is a numeric sensor, Attributes card with LAST CHANGED. Inner region labels stay `State`, `History`, `Attributes` (scoped by the section).
  - Each section has its own `useDeviceAction(entity)` (feedback, pending, toasts per entity).
  - Layout: sections stack in `col-span-12`; inside a section keep the 122 split (State xl:5, History+Attributes xl:7). Tokens and components from DESIGN.md only.
- 122 refactor must not change the single-member page DOM roles/names.

### Mock fixtures (`src/api/mock/fixtures.ts`)
Give the default house multi-entity devices (names chosen so 115 prefix stripping does NOT change any existing entity label):
- `switch.office_desk` + `sensor.office_desk_power` -> `deviceName: "Desk plug"` (office).
- `binary_sensor.entry_motion` + `sensor.entry_motion_battery` -> `deviceName: "Entry PIR"` (unassigned).
- Each room's temperature + humidity -> `deviceName: "<Label> sensor"` (`Living room sensor`, `Kitchen sensor`, `Master suite sensor`, `Office sensor`).
- Every other entity keeps `deviceName: null` (standalone).
Result: default house = 26 entities -> **20 device rows** (9 interactive, 11 read-only). `raw-names` scenario adds 4 device rows (RT-AC65P, Samsung s24 hector, Backup, Encerrado en el patio) -> 24.
Update any unit/component test or spec whose counts depend on these fixtures (devices list 26 -> 20, READ-ONLY 17 -> 11; check `createMockApi.test.ts`, `DevicesPage.test.tsx`, home/telemetry specs only if they assert on `deviceName`).

## Tests
- Unit `src/features/devices/deviceFilters.test.ts`:
  - `deviceSlug`: accents, ALL CAPS, symbols/double spaces, name without letters/digits -> `""`.
  - grouping: same deviceName + area -> one row with ordered members; same name in two areas -> two rows; `deviceName` null / absent / `"  "` / `"---"` -> standalone keyed by entityId; key never contains `.`.
  - primary order: switch before power sensor; binary_sensor before battery sensor; temperature before humidity; battery last; tie by entityId; availability ignored.
  - label: cleanName of deviceName (`ENCERRADO EN EL PATIO` -> `Encerrado en el patio`); standalone uses the label callback.
  - filters: query on a member entityId / member name / deviceName returns the whole row; domain filter matches any member; INTERACTIVE/READ-ONLY on mixed devices; facets count rows per domain once.
  - `resolveDeviceKey`: device key -> canonical; member entityId of a multi-entity device -> non-canonical same row; standalone entityId -> canonical; unknown -> null.
- `src/utils/PathUtils.test.tsx`: `deviceDetailPath("office~desk_plug")` -> `/devices/office~desk_plug`; unicode key encoded and decoded back by `useParams`.
- Component `DevicesPage.test.tsx`: 20 rows; `Desk plug` row with `2 ENTITIES` meta, href `/devices/office~desk_plug`, state `ON`; no row named `Desk outlet power` or `Entry motion battery`.
- Component `DeviceDetailPage.test.tsx`: multi-entity device renders h1 label + one section per member in order; old entityId param of a member redirects to the device key; standalone and NOT FOUND unchanged; all-unavailable members -> UNAVAILABLE chip.
- Playwright (update page objects, no selectors in specs):
  - `e2e/pages/device-detail.ts`: add `entity(name)` = section by accessible name; `stateText()` / `power()` / `history()` accept an optional entity scope (unscoped keeps 122 behavior).
  - `devices-list.spec.ts`: counts `20 OF 20`, READ-ONLY 11; search `office_desk_power` -> 1 row `Desk plug` with href `/devices/office~desk_plug`; `?mock=raw-names` -> exactly one `Encerrado en el patio` row and no row whose name contains `Batería`/`Battery`.
  - `device-detail.spec.ts`: from the list, `Desk plug` opens `/devices/office~desk_plug`, h1 `Desk plug`, sections `Desk outlet` and `Desk outlet power`; the switch in `Desk outlet` flips ON -> OFF; `Desk outlet power` shows History. Old link `/devices/sensor.office_desk_power` ends at `/devices/office~desk_plug`. Existing 122 tests (Office desk light, house_power history, not found, no-history, action-error) keep passing; BACK returns to the list with 20 rows.

## Acceptance
- One row per physical device; a sensor's Battery/Temperature are never separate rows when they share a deviceName and area.
- The device page lists every entity of the device with its control/value/history/attributes.
- Old `/devices/<entityId>` links still open the right page.
- No backend change; `node .claude/scripts/test.cjs` green.
