---
id: "134"
slug: synced-setting-store
title: Synced setting store (server-backed, offline cache, one-time localStorage import)
role: frontend
type: feature
extends: null
---

# Synced setting store (server-backed, offline cache, one-time localStorage import)

## Description
One generic, reusable store that replaces each `localStorage`-only preference with a server-backed shared setting (backend 017) while keeping the current synchronous `load*/save*` style, so existing modules (widgets 113/114, panels 125, filters 118) migrate by swapping their two storage functions only. localStorage stays as the offline cache. Depends on 132 and 133.

## Requirements
- `src/features/settings/syncedSetting.ts` (no React):
  `createSyncedSetting<T>({ key, legacyKey?, parse: (raw: unknown) => T | null, debounceMs = 500 })` returns `{ get(): T | null; set(value: T): void; subscribe(fn: () => void): () => void; status(): "local" | "synced" | "pending" | "offline" | "unavailable"; start(api: HomeApi): Promise<void>; stop(): void }`.
  - Cache key `hc.setting.<key>` in localStorage: `{ v: 1, value, version: number | null, pending: boolean }`. Every access try/catch (storage may throw); failure -> memory only.
  - `get()` is synchronous: memory -> cache -> null. `parse` validates every value coming from cache, server or legacy (invalid -> treated as absent). Callers keep their own defaults (e.g. `reconcileWidgets(null, ...)`).
  - `set(value)`: memory + cache (`pending: true`) immediately, notify subscribers, then debounced `putSetting(key, value, lastVersion ?? undefined)`. Success -> store version, `pending: false`. `SettingConflictError` -> SERVER WINS: apply `current.value` (if it parses) + version, notify. Network/5xx -> keep pending, status `offline`, retry on the next stream `ready` (reconnect) or after 30 s, whichever first. Same value as memory (JSON compare) -> no PUT.
  - `start(api)`: `getSetting(key)`.
    - server has a value -> if cache is `pending` (offline edits) push the cached value with `baseVersion` = cached version (conflict -> server wins); else adopt the server value + version.
    - server has none -> ONE-TIME IMPORT: value = cache value, else `legacyKey` from localStorage parsed with `parse`; if found, PUT it (no baseVersion); on success write cache and set `hc.migrated.<key>` = "1". The legacy key is NOT deleted (rollback safety). Already migrated -> no import.
    - `not_found` on the list/endpoint missing (backend without 017) -> status `unavailable`, behaves exactly like the old localStorage-only code (cache only, no retries).
  - Remote change: `subscribeServerEvents` (132): `resource_changed` with resource `settings` and `keys` empty or containing `key`, and `!isOwnChange` -> `getSetting(key)` and adopt (if not pending; if pending, the next PUT resolves via conflict). Debounce refetch 200 ms.
  - Stream reconnect (`ready` after a drop): refetch once.
- React hook `useSyncedSetting<T>(store)` via `useSyncExternalStore` -> `[value: T | null, set]`; `SyncedSettingsProvider` in the app shell calls `start(api)` for every registered store once the api is ready (registry `registerSyncedSetting(store)`), `stop()` on unmount.
- Mock mode works the same (mock HomeApi from 133).
- No visible UI in this feature. Optional dev-only `console.debug` lines are not allowed (keep logs clean).
- `add-note.cjs`: "all persisted UI prefs go through createSyncedSetting; localStorage only as cache `hc.setting.*`; legacy keys imported once and kept".

## Touches existing endpoints
GET/PUT /api/settings/:key (backend 017), GET /api/stream (`resource_changed`).

## Done when
**Unit (Vitest, fake HomeApi + fake timers + fake localStorage)**
- get from cache synchronously before start; invalid cache ignored.
- set: immediate get + notify; one debounced PUT for 3 rapid sets; same value no PUT.
- conflict -> server value applied, version updated.
- offline: PUT fails -> pending persisted in cache -> retried after `ready` / 30 s -> synced.
- start with server value adopts it; with pending cache pushes it; server empty + legacy key -> imported once (PUT called once across two starts), legacy key kept, `hc.migrated.*` set; invalid legacy ignored.
- backend without settings -> `unavailable`, set works local-only, no network calls after start.
- remote `resource_changed` for the key refetches and notifies; other keys / own changes ignored.
- storage throwing everywhere -> still works in memory.
- hook re-renders on remote change.

**E2E**
- covered by 135 (widgets journey). test.cjs green.
