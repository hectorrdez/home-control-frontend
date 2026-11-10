---
id: "164"
slug: settings-page
title: Settings page with a RELOAD DEVICES action
role: frontend
type: feature
extends: null
---

# Settings page with RELOAD DEVICES

## Description
There is no settings page. The user added a device in Smart Life and it did not appear in the panel because Home Assistant had not reloaded the Tuya integration. This feature adds a `/settings` page with a first section, Integrations, whose RELOAD DEVICES button calls backend 024 (`POST /api/ha/reload`) so new devices show up. The page is the home for future settings.

## Requirements
- Route `settings` in `src/pages/Routes.tsx` (`ROUTE_PATHS.settings`), new `SettingsPage`, and a `Settings` entry (lucide `Settings` icon) at the end of `src/layouts/Navigation.tsx` (side nav and mobile nav, same pattern as the other items).
- Layout with DESIGN.md tokens and components only (reuse `Button`, `StatusChip`, panel/card containers from `src/components/`); `lint:tokens` clean. Section "Integrations": short text "Reload the device integrations (Tuya) so devices added in Smart Life appear here. Devices of those integrations can show as unavailable for a few seconds." and a `Button` RELOAD DEVICES (lucide `RefreshCw`).
- API: `HomeApi.reloadIntegrations()` returns `ReloadResult { entries: { entryId, domain, title, ok, error? }[]; entities: { before, after } }` in `src/api/` (live client and mock). Live: `POST /api/ha/reload`; 404 -> the section shows NOT AVAILABLE and the button is hidden; 409 -> "A reload is already running"; 429 -> "Wait N s before reloading again" using `retryAfterSeconds` (button disabled with a countdown); 502 -> "Home Assistant is not reachable"; other errors -> generic message. Never show tokens or URLs.
- While running: button disabled with the Spinner of 117 (`aria-busy`), label RELOADING. Result (aria-live polite): `n INTEGRATIONS RELOADED • k NEW ENTITIES` (k = max(after - before, 0)), plus one line per failed entry (`title: error`). Zero entries -> "No integrations to reload".
- On success refetch areas/entities through the existing state provider (the same call used after an SSE reconnect, notes 105), so the panel, devices list and 3D view update. The backend also emits `resource_changed` and the live refetch (138) may already do it: do not fetch twice within 1 s.
- Mock (110): `reloadIntegrations` succeeds after about 800 ms and, on its first call per session, adds one new mock device so the flow is visible; scenarios `?mock=error` -> 502 path, `?mock=slow` -> longer delay, `?mock=unavailable-reload` -> 404 path.
- Unit tests: SettingsPage states (idle, running, success with new entities, success with 0, partial failure, 404 NOT AVAILABLE, 409, 429 countdown, 502), navigation entry, api client and mock. E2E in the testing repo updated separately (mock only; the real reload is never run against PRO from tests).

## Touches existing endpoints
Consumes the new `POST /api/ha/reload` (backend 024; copy `.claude/endpoints.md` from the backend when it exists). Uses GET /api/areas for the refetch.

## Done when
- `/settings` is reachable from the nav and RELOAD DEVICES runs the reload, shows the result and the panel refreshes with the new devices (mock: the extra device appears).
- Without backend 024 (404) the page degrades to NOT AVAILABLE.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
