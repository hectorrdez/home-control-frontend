---
id: "121"
slug: devices-list-page
title: Devices page - list and search
role: frontend
type: feature
extends: null
---

# Devices page - list and search

## Description
New route `/devices` listing every entity of the house (interactive and read-only, available or not), with search and filters, so the user can find any device without the 3D view. Each row links to the device detail page `/devices/:entityId` (built by 122). Tablet-first: Galaxy Tab S7 landscape (~1280x800 CSS px) uses the `xl` layout (`--breakpoint-xl: 1024px` in `src/index.css`; DESIGN.md's "1200" is outdated, the code wins).

**Depends on 120** (must be ENDED first): reuses its `isInteractive(entity)` predicate. Do not redefine it; import it from wherever 120 put it (`src/state/selectors.ts` or `src/components/cards/deviceState.ts`). 122 depends on this feature.

## Requirements

### Route and navigation
- `src/pages/routePaths.ts`: add `devices: "/devices"` to `ROUTE_PATHS` and export a plain helper `devicePath(entityId: string): string` returning `` `/devices/${encodeURIComponent(entityId)}` `` (no component imports; keep the file cycle-free). Do NOT register `/devices/:entityId` here; 122 adds it.
- `src/pages/Routes.tsx`: add `{ name: "devices", path: ROUTE_PATHS.devices, component: <DevicesPage /> }` to `SiteMap` between home and telemetry. `PathUtils` needs no change.
- `src/layouts/Navigation.tsx`: add item `{ label: "Devices", name: "devices", icon: List }` (lucide-react `List`) between "Home 3D" and "Telemetry", in both `TopNav` and `BottomRail`. Home keeps `end`; Devices must NOT use `end` so it stays active (`aria-current="page"`) on `/devices/:entityId` too. Telemetry may keep `end`.
- `src/layouts/Page.tsx`: no change (only `/` fits the viewport; `/devices` scrolls like telemetry).
- Feature 120 deferred link: add to the `DevicePanel` header (Home 3D) a `ButtonLink`/`Link` "All devices" to `ROUTE_PATHS.devices` (accessible name "All devices"). Must not break 119's no-page-scroll.

### Data
- Source: `useEntities().state` (`EntitiesProvider`, live + mock); no new endpoint, no new provider. Rows recompute on every state change, so stream updates (105) and optimistic values (104/117) show immediately.
- Rows = `allEntities(state)` INCLUDING unavailable/unknown entities (unlike `deckSections`). Unavailable rows show a `StatusChip` tone error "UNAVAILABLE".
- Names: `useEntityName().displayName` (115) for the visible title and the accessible name; aliases apply. Area label = area name from `state.areas` ("Unassigned" for `UNASSIGNED`).
- Order: areas in `state.areas` order (Unassigned last), then `displayName` with `localeCompare`. Sorting does not change with filters.

### Search and filter logic (pure module)
- New `src/features/devices/deviceFilters.ts` (no React, no storage), same shape as 118's `src/features/telemetry/widgetFilters.ts`:
  - `DeviceRow { entity; label /*displayName*/; areaId; areaName; interactive: boolean }`.
  - `DeviceFilters { query: string; areas: string[]; domains: string[]; kind: "all" | "interactive" | "readonly" }`, `EMPTY_DEVICE_FILTERS`, `isFiltered(f)`.
  - `filterDeviceRows(rows, f)`: query matches `label`, raw `entity.name`, `areaName`, `entity.entityId` via substring after `normalize()` IMPORTED from `widgetFilters.ts` (case + diacritic insensitive, trimmed; do not copy it). Groups combine with AND, values inside a group with OR; empty group = no constraint; input order preserved. `kind` uses `row.interactive` (= `isInteractive(entity)` from 120).
  - `deviceFacets(rows)`: counts over ALL rows (static, not the filtered set), zero-count entries omitted; areas in `state.areas` order with Unassigned last; domains = raw HA `entity.domain`, label `domain.replaceAll("_", " ").toUpperCase()` ("BINARY SENSOR"), sorted by label.
- No debounce (synchronous, memoized with `useMemo`; same as 118). Filters live in page state only: never persisted, reset on reload/navigation.

### UI
- New `src/pages/DevicesPage.tsx` (one `headline` "Devices") and controlled `src/components/panels/DeviceFilters.tsx` mirroring `ChartFilters.tsx` (118): `input type="search"` aria-label "Search devices", `role="status"` aria-label "Devices shown" with text `` `${shown} OF ${total}` `` (polite live region), CLEAR `Button` disabled when `!isFiltered`, `FilterPill` groups `role="group"` aria-label "Areas" / "Types" / "Kind" (kind pills ALL / INTERACTIVE / READ-ONLY, single-select). Pill aria-label = `` `${LABEL} ${count}` `` like 118.
- Row (new `src/components/cards/DeviceRow.tsx`): react-router `Link` to `devicePath(entityId)`, whole row clickable, min-h 44px, visible focus ring (`primary-container`), `aria-label` = displayName exactly, `aria-describedby` -> meta line. Content: `domainIcon` tile in `domainHue`, displayName (`font-sans`), `label-caps` meta `AREA // entity.id` (mono), state text from `describeState` (mono, with unit; never color only). No controls in rows (quick toggle out of scope).
- Layout via `PageGrid`: `xl` (>=1024): filters `aside` `xl:col-span-4` (sticky under the header), list `xl:col-span-8` as a 2-column grid of rows; `md` (768-1023): filters above, list 2 columns; `<md`: filters above, single-column stacked list, bottom rail clearance kept. No horizontal page scroll at 390, 768, 1280 widths. Tokens only (no hex, no arbitrary `[...]` values).
- States (DESIGN.md): `loading` -> `aria-busy` + pulse skeleton rows (reduced-motion off); `error` -> `role="alert"`, error `StatusChip` "ERROR", "Could not load devices.", RETRY calls `reload()` (same as DevicePanel); ready with 0 entities -> "NO DEVICES"; filters match nothing -> "NO MATCHING DEVICES" + CLEAR.

### Tests
- Unit `src/features/devices/deviceFilters.test.ts` on `createFixtureEntities()` (26 entities; 9 interactive per 120: 4 light, climate, cover, switch, lock, scene; 17 read-only: 16 sensor + 1 binary_sensor; if 120's predicate differs, counts follow it):
  - empty filters -> 26, order preserved; `isFiltered(EMPTY)` false.
  - query "ceiling" and "CEILING" -> 2; "desk" -> 3 (light.office_desk, switch.office_desk, sensor.office_desk_power); "lock.front" (entity id) -> 1; "master suite" (area name) -> 4; "bateria" matches a row labelled "Batería" (diacritics); "  " -> 26.
  - kind interactive -> 9, readonly -> 17; areas [kitchen] + domains [light] -> 1; domains [light, lock] -> 5 (OR); areas [kitchen, office] -> 8.
  - facets: area counts living_room 4, kitchen 3, bedroom 4, office 5, unassigned 10 (last); domain counts sum 26; facets unchanged by filters.
- Component `src/pages/DevicesPage.test.tsx` (providers + MemoryRouter): 26 row links, status "26 OF 26"; typing filters and updates status; pill toggles `aria-pressed`; CLEAR resets; link href `/devices/light.living_room_ceiling`; alias shown as name; unavailable row shows "UNAVAILABLE"; loading, error (+RETRY calls reload), empty, no-match states. Update `Navigation.test.tsx` (3 items, Devices active on `/devices/x`) and `DevicePanel.test.tsx` ("All devices" link).
- Playwright: page object `e2e/pages/devices.ts` (search, filter by pill, rows, shown count); extend `e2e/components/navigation.ts` `Destination` with "Devices". Spec `e2e/specs/devices-list.spec.ts` (mock house):
  - 1280x800: Home -> nav "Devices" -> URL `/devices`, Devices `aria-current`, "26 OF 26"; search "front door" -> 1 row whose link href is `/devices/lock.front_door`; READ-ONLY -> 17; CLEAR -> 26; no horizontal scroll; filters aside is left of the list (bounding boxes).
  - 390x844: bottom rail "Devices" reaches the page; rows stacked one column.
  - `?mock=empty` -> "NO DEVICES"; `?mock=error` -> ERROR + RETRY.
  - Home 3D "All devices" link -> `/devices`.
  - Click-through to the detail page is NOT asserted here: until 122 registers `/devices/:entityId`, App's `*` route redirects to `/`. 122 owns the click -> detail -> back journey.

## Touches existing endpoints
GET /api/areas (via existing EntitiesProvider) - read only, no change. No new endpoint.

## Done when
- `/devices` lists all 26 mock entities, search/filters/count work as specified, every row links to `devicePath(entityId)`, nav + "All devices" link reach it.
- Unit, component and Playwright tests above pass; test.cjs green; Sonar gate OK.
