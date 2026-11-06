---
id: "102"
slug: api-client
title: Typed API client, mode switch and HA status
role: frontend
type: feature
extends: null
---

# Typed API client, mode switch and HA status

## Description
One typed `HomeApi` interface for everything the panel needs from home-control-backend, with a `live` implementation over HTTP and a mode switch so the UI can run fully on mock data (110) while the backend is not ready. Wires the HA status line into the 109 header. Also introduces the unit-test runner used by later features.

## Requirements
- Types in `src/api/types.ts`, mirroring the backend contract (backend features 001-005; endpoints.md once refreshed):
  - `HaStatus { online: boolean; message: string; version: string | null }`
  - `Entity { entityId: string; domain: string; name: string; state: string; attributes: Record<string, unknown>; area: string | null; lastChanged: string }`
  - `Area { areaId: string; name: string; entities: Entity[] }` (the unassigned group uses `areaId: "unassigned"`)
  - `EntityAction { action: "turn_on" | "turn_off" | "toggle" | string; params?: Record<string, unknown> }`
  - `HistorySeries { entityId: string; unit: string | null; points: { t: string; v: number }[] }` (proposed contract, see 112)
- `src/api/HomeApi.ts` interface: `getStatus()`, `getAreas()`, `getEntities(filter?: { domain?: string; area?: string })`, `runAction(entityId, action)`, `subscribe(onEntity: (e: Entity) => void, onConnection: (s: "open" | "reconnecting" | "closed") => void): () => void`, `getHistory(entityIds: string[], hours: number)`.
- `src/api/liveApi.ts`: base URL `VITE_API_URL` (empty = same origin); sends `Authorization: Bearer ${VITE_API_TOKEN}`; unwraps `{ code, status, data, error }`; throws `ApiError { kind: "network" | "unauthorized" | "not_found" | "server" | "unavailable"; status?: number; message }` (401 -> unauthorized, 404 -> not_found, 503/HA down -> unavailable). `subscribe` and `getHistory` may be stubs that throw `ApiError("unavailable")` here; 105 and 112 implement them.
- `src/api/index.ts` exports `api: HomeApi` selected by `VITE_API_MODE` = `live` | `mock` (default `mock` in dev when unset, `live` in production builds). 110 provides the mock; until then `mock` may point to a minimal inline stub returning online status and empty areas. A React context/hook `useApi()` returns it (tests can inject).
- Vite dev proxy `/api` -> `http://localhost:3002` (overridable by `VITE_PROXY_TARGET`). `.env.example` with `VITE_API_URL`, `VITE_API_TOKEN`, `VITE_API_MODE`, `VITE_PROXY_TARGET`. Never `HA_TOKEN`.
- Header status (109 slot): `useHaStatus()` polls `getStatus()` every 30 s; renders beacon + `label-caps` text: `ONLINE // HA <version>` (secondary), `OFFLINE` (error), `CONNECTING` (on first load, on-surface-variant), `UNAUTHORIZED` (error, on 401). Polling stops on unmount; errors never crash the layout.
- Unit test runner: add Vitest + jsdom + @testing-library/react (`npm run test:unit`), and add a `test:unit` step to `.claude/scripts/test.cjs` before Playwright.
- Coverage choice: unit for the client logic (envelope unwrap, bearer header present, error mapping 401/404/503/network, mode selection); Playwright for the header journey: run with `VITE_API_MODE=live` in a dedicated Playwright project or per-test `page.route('**/api/ha/status')` -> online shows `ONLINE // HA 2026.x`, 503 shows `OFFLINE`, 401 shows `UNAUTHORIZED`. Header locators go in `e2e/components/header.ts`.

## Touches existing endpoints
yes: consumes GET /api/ha/status (backend 001); defines client methods for 002-005 and the proposed history endpoint (112).

## Done when
- Unit suite covers the client; the header status reflects online/offline/unauthorized with the API mocked.
- `VITE_API_MODE` switches implementation without code changes; real backend works through the proxy once backend 001 exists.
- test.cjs (now including `test:unit`) is green (the real gate; mark-ended.cjs enforces it).
