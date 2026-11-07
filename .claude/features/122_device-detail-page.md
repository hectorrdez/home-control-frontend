---
id: "122"
slug: device-detail-page
title: Device detail page
role: frontend
type: feature
extends: null
---

# Device detail page

## Description
New route `/devices/:entityId` showing everything about one device: identity, area, live state, controls, attributes and (numeric sensors) history. Reached by clicking a device in the Devices page (121); also deep-linkable and reload-safe. Depends on 121 (route `devices`, list rows linking here) and 120 (`isInteractive`). Reuses 104/116/117 controls behaviour, 112 history, 115 names.

## Requirements

### Routing (no change to `generateRoutes` needed)
- `PathUtils.generateRoutes` passes `path` verbatim to RR7 `<Route>`, so `:params` already work. Add `deviceDetail: "/devices/:entityId"` to `src/pages/routePaths.ts` (next to `devices` from 121) and `{ name: "deviceDetail", path: ROUTE_PATHS.deviceDetail, component: <DeviceDetailPage /> }` to `SiteMap` in `src/pages/Routes.tsx`. `src/types/page.ts` unchanged.
- Add `PathUtils.deviceDetailPath(entityId: string): string` = `/devices/${encodeURIComponent(entityId)}`. 121 rows must use it (if 121 already hard-codes the URL, switch it to this helper). The page reads the id with `useParams()` (already decoded by RR7).
- `deviceDetail` is NOT a nav item (no TopNav/BottomRail entry). The "Devices" nav entry from 121 stays active on `/devices/*` (NavLink prefix match, no `end`).
- The `*` catch-all redirect to `/` stays, but `/devices/<anything>` must never hit it.
- Page scrolls normally (not `fitViewport`; that stays home-only in `layouts/Page.tsx`).

### Page `src/pages/DeviceDetailPage.tsx`
Data only from `useEntities()` (`state.status`, `state.entities[id]`, `state.areas`, `state.pending`) - no new endpoint, no extra fetch for the entity.
- `status === "loading"`: skeleton blocks (`surface-container`, pulse off under reduced motion) + `role="status"` text `LOADING DEVICE`. Never blank.
- `status === "error"`: error `StatusChip` + one-line message + `RETRY` button calling `reload()` from the provider.
- `status === "ready"` and id not in `state.entities`: not-found state inside a Card: icon, `DEVICE NOT FOUND`, the raw id in mono, and a link `BACK TO DEVICES` to `/devices`. No redirect. If the entity later arrives via the stream (`entityUpdated` adds unknown entities), the page renders it without reload.
- Found: render the sections below. Live updates (stream, optimistic actions) re-render in place.

### Header
- Back link `BACK TO DEVICES` (ButtonLink to route name `devices`, lucide `ArrowLeft` icon, accessible name "Back to devices").
- `<h1>` containing `EditableName` (115) with exactly the props `DeviceModule` uses (`shown=shortName`, `label=displayName`, `raw=entity.name`, `canRename`, `onRename=renameEntity`). Rename here updates the name shown in the list (121) and Home (shared aliases).
- Meta line (`label-caps`, mono): area name (from `state.areas` group name; `null`/unknown area -> `UNASSIGNED`), domain uppercased, raw `entityId`; `deviceName` when present.
- Availability `StatusChip`: `UNAVAILABLE` (error hue) when `isUnavailable(entity)` (selectors.ts), else `ONLINE` (secondary hue). Text always paired with color.
- `document.title` = `<displayName> - Home Control`.

### Live state + controls
- Extract the send/feedback logic of `DeviceModule` (pending, settling, `sendIntent`, success flash / error highlight, error toast `Could not update <displayName>`, `aria-live` SENDING/UPDATING) into a hook `src/components/cards/useDeviceAction.ts` returning `{ send, pending, settling, feedback }`. `DeviceModule` uses it with no behaviour change (all existing `DeviceModule.*.test.tsx` stay green unmodified).
- Detail page "STATE" Card: domain icon tile + `describeState(entity).text` in `telemetry-lg` mono (unit from `unit_of_measurement` when numeric), then `<DeviceControls entity disabled={pending} send={send} />`. Same optimistic, supersede, settling (117) and rollback behaviour as the card.
- Read-only (`!isInteractive(entity)` from 120): value only, plus `READ ONLY` label-caps; no control rendered.
- Plug switch with a linked power sensor (`plugDrawBySwitch`): show `DRAW METRIC <formatPower>` line like the card.

### Attributes
- Card "ATTRIBUTES": `<dl>` of every key in `entity.attributes`, sorted by key; value formatting: string as-is, number/boolean `String(v)`, array `join(", ")`, object `JSON.stringify`, null/undefined `--`. Empty attributes -> `NO ATTRIBUTES`.
- `LAST CHANGED`: `<time dateTime={entity.lastChanged}>` with `toLocaleString()`; invalid date -> `--`.

### History (numeric sensors only)
- Shown only when `entity.domain === "sensor"` and `numericState(entity) !== null`; otherwise the section is absent and `getHistory` is NOT called.
- New `src/components/cards/EntityHistoryCard.tsx`: `useHistory([entityId], hours)`; range pills from `RANGES` (6H/24H/7D/30D, default 24H) in `role="group" aria-label="Range"` using `FilterPill`; body wrapped in `HistoryBody` (LOADING HISTORY / HISTORY NOT AVAILABLE on 404 / HISTORY ERROR + RETRY / NO HISTORY IN RANGE). Points via `toPoints` + `downsample`; recharts single-series area chart, colors via `cssToken` (no hex); wrapper `role="img"` with `aria-label="<displayName> history, <range>: <min/avg/max summary with unit>"`, plus sr-only table (time, value) like `ClimateHistoryCard`.
- Do not modify `ClimateHistoryCard`/`HistoryBody` behaviour.

### Layout
- `< xl` (1024px, `--breakpoint-xl`): single column, order header, STATE, HISTORY, ATTRIBUTES.
- `>= xl` (Galaxy Tab S7 landscape and desktop): header full width; grid `xl:grid-cols-12` gap from spacing scale; left `xl:col-span-5` = STATE; right `xl:col-span-7` = HISTORY then ATTRIBUTES (ATTRIBUTES moves right even when no history).
- Tokens/canonical components only (DESIGN.md); touch targets >= 44px; visible focus ring.

## Tests
- Unit `src/utils/PathUtils.test.tsx`: `deviceDetailPath("light.office_desk") === "/devices/light.office_desk"`; ids with `/`, space, `#` are encoded; a `generateRoutes` route with `:entityId` rendered in `MemoryRouter` at `/devices/light.x` exposes `entityId === "light.x"` via `useParams`.
- Unit: attribute value formatter (each type) if extracted as a function.
- Component `src/pages/DeviceDetailPage.test.tsx` (mock providers as existing page tests):
  1. loading -> `LOADING DEVICE` status;
  2. error -> RETRY calls `reload`;
  3. unknown id -> `DEVICE NOT FOUND`, link to `/devices`, URL not changed to `/`;
  4. `light.office_desk` -> h1 name, area `OFFICE`, domain `LIGHT`, `ONLINE`, switch + brightness slider present, attributes `brightness 255`, last changed `<time>`;
  5. read-only `sensor.house_power` -> value with `W`, `READ ONLY`, no switch/slider/button controls, history chart; clicking `7D` calls `getHistory(["sensor.house_power"], 168)`;
  6. `light.*` -> `getHistory` not called, no Range group;
  7. history 404 -> `HISTORY NOT AVAILABLE`;
  8. unavailable entity -> `UNAVAILABLE` chip;
  9. entity added via `entityUpdated` after not-found -> page shows it.
- Component `useDeviceAction`/existing `DeviceModule.feedback.test.tsx` unchanged and green.
- Playwright: page object `e2e/pages/device-detail.ts` (composes Header/Navigation; locators by role) and spec `e2e/specs/device-detail.spec.ts`, mock mode:
  1. `/devices` (121 page object) -> click "Office desk light" -> URL `/devices/light.office_desk`, h1 visible -> toggle switch -> state text flips (ON<->OFF) -> `BACK TO DEVICES` -> URL `/devices`;
  2. deep link `/devices/sensor.house_power` -> history chart visible, select `7D` -> chart label contains `7D`;
  3. `/devices/light.does_not_exist` -> `DEVICE NOT FOUND`, URL unchanged, back link works;
  4. `/devices/sensor.house_power?mock=no-history` -> `HISTORY NOT AVAILABLE`;
  5. `?mock=action-error` on `/devices/light.office_desk` -> toggle rolls back + toast.

## Touches existing endpoints
GET /api/history (read only, via existing `useHistory`), POST control actions via existing `sendIntent`. No new endpoint, no contract change.

## Done when
- Clicking any device in 121 opens its detail; controls work and update live; read-only devices show value only; numeric sensors show history with range selector; unknown id shows not-found (no redirect).
- All tests above pass; test.cjs green; Sonar gate OK.
