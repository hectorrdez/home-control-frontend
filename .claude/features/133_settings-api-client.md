---
id: "133"
slug: settings-api-client
title: Settings API client (live + mock)
role: frontend
type: feature
extends: null
---

# Settings API client (live + mock)

## Description
Adds the backend 017 settings endpoints to `HomeApi` (live HTTP and in-browser mock) so the synced-setting store (134) can read and write shared settings. No UI. Depends on 132 and backend 017.

## Requirements
- Types: `Setting<T = unknown> = { key: string; value: T; version: number; updatedAt: string; updatedBy: string | null }`.
- `HomeApi` gains:
  - `getSettings(): Promise<Setting[]>` (`GET /api/settings`)
  - `getSetting(key): Promise<Setting | null>` (`GET /api/settings/:key`; 404 `setting_not_found` -> `null`, NOT an error)
  - `putSetting(key, value, baseVersion?): Promise<Setting>` (`PUT /api/settings/:key` body `{ value, baseVersion? }`)
  - `deleteSetting(key): Promise<void>`
- Conflict: 409 `version_conflict` -> throw `SettingConflictError extends ApiError` (kind `server`, code `version_conflict`, status 409) carrying `current: Setting | null` parsed from the error body's `data[0]` (liveApi `request` must expose the parsed body for this one case; keep the change minimal, e.g. an optional `onErrorBody` hook).
- Backend without 017 (any 404 on `GET /api/settings` list) -> `ApiError` kind `not_found` (existing mapping); callers treat it as "settings unavailable".
- Mock: in-memory `Map<key, Setting>` per page load, same validation as backend 017 (key regex `^[a-z0-9]+(\.[a-z0-9_-]+){1,4}$` <= 80 chars, value <= 65536 bytes -> 413 `setting_too_large`, cap 200, baseVersion conflict 409 with current, same-value no bump). Emits `resource_changed { resource: "settings", keys: [key], by: <mock client id> }` on every real change. Scenario `?mock=no-settings` -> list/get reject `not_found`. Scenario `?mock=remote-settings` -> 1 s after subscribe, writes `telemetry.widgets` from "other-device" (value = current default layout with the first widget hidden) and emits `resource_changed` with `by: "other-device"` (consumed by 135's E2E).
- Mock seed for Playwright: `?seed=` unchanged; settings start empty.

## Touches existing endpoints
GET/PUT/DELETE /api/settings[/:key] (backend 017).

## Done when
**Unit (Vitest)**
- liveApi: each method's method/path/body; `getSetting` 404 -> null; 409 -> `SettingConflictError` with `current.version`; list 404 -> kind `not_found`.
- Mock: create v1, update v2, same value keeps version, conflict, size limit, key rule, emits `resource_changed`, `no-settings` scenario.

**E2E**
- none (no UI). test.cjs green.
