# Project brief

## Goal
home-control-frontend is the single panel to control the house. It runs in the browser, or inside an Electron shell that loads that same panel; it talks only to home-control-backend (which talks to Home Assistant on the homelab). Access is private over Tailscale. It includes a 3D view of the house.

## Stack
React 19 + TypeScript + Vite 8 + Tailwind 4 + React Router 7, `lucide-react`, `three` (3D view). Lint: oxlint. E2E: Playwright (chromium, `e2e/`). Electron shell in `electron/` (same repo).

## Repo type
frontend-web

## Scope - in
- Panel by areas with entity cards, device control, live updates (SSE).
- 3D house view (three.js) linked to the same entities and areas.
- Electron shell that loads the panel (tray, autostart, Windows packaging). No local API.
- Static deploy on Dokploy (homelab) behind Caddy, `/api` routed to the backend.

## Scope - out (explicitly NOT doing)
- Login, accounts, landing/pricing/policy pages (access is restricted by Tailscale).
- Device logic or automations (Home Assistant does that).
- Any local API inside Electron.
- Alexa.

## Conventions / decisions
- Reuse `src/components/` (cards, controls, placing, dropdowns) and `src/layouts/`; new shared primitives go there.
- Colors/spacing only from tokens in `src/index.css` (`@theme`); no raw hex in components.
- Backend base URL via `VITE_API_URL` (empty = same origin, `/api` proxied by Caddy/Vite dev proxy). Auth to the backend: `VITE_API_TOKEN` (= the shared `API_TOKEN`) sent as `Authorization: Bearer`. Never put `HA_TOKEN` (backend -> Home Assistant) in this repo.
- Backend contract: `.claude/endpoints.md` (read-only copy from home-control-backend; refresh it when the backend changes).
- E2E follows the Playwright architecture in CLAUDE.md (`e2e/specs|pages|components`); tests mock or use the real backend, never HA directly.
- Feature ids here start at 101 to avoid clashing with backend ids on the shared Plane board.
- Kanban: Plane project HomeControl; subtasks of the general `Main` card carry `repo:home-control-frontend`.
