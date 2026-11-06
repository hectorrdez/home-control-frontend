---
id: "101"
slug: template-cleanup
title: Clean the SaaS template
role: frontend
type: feature
extends: null
---

# Clean the SaaS template

## Description
The scaffold came from a SaaS template. Remove what a private home panel does not need and leave a clean, compiling base with the first E2E spec, so feature 109 can apply the Stitch design (design/stitch/) on top of it.

## Requirements
- Remove public pages (landing, pricing, products, resources, support, about-us, policies, cookies), login/create-account/forgot-password, AuthContext, RouteProtector, CookiesContext and CookiesCard, and their routes in `pages/Routes.tsx`.
- Remove the light-theme/template styling in `src/App.css` and the template color tokens' consumers that only served removed pages. Keep `layouts/`, `components/`, ThemeProvider, `src/index.css` (tokens get replaced in 109), `PathUtils`.
- Routes left: `/` (placeholder page, heading "Home 3D") and `/telemetry` (placeholder page, heading "Telemetry"), both inside the existing layout. Unknown paths redirect to `/`. No visual work here (109 does it).
- Remove unused assets (react.svg, vite.svg, hero.png) and the Vite README boilerplate; write a real README (what it is, scripts, env vars `VITE_API_URL`, `VITE_API_TOKEN`, `VITE_API_MODE`; link to `.claude/DESIGN.md` and `design/stitch/`).
- `design/stitch/` is reference material: exclude it from oxlint/tsc/build inputs if any tool picks it up.
- First Playwright spec `e2e/specs/smoke.spec.ts`: `/` shows heading "Home 3D"; `/telemetry` shows heading "Telemetry"; `/nope` lands on `/`. Use role/name locators; no page object yet (single use).
- Coverage choice: Playwright only (routing is the observable behavior; no isolated logic).

## Touches existing endpoints
no

## Done when
- `grep` finds no references to the removed pages/contexts; app boots on `/`.
- Smoke spec passes; `npm run lint`, `tsc`, `build` clean.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
