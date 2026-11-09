---
id: "148"
slug: extract-e2e
title: Move the Playwright E2E suite to the sibling repo home-control-frontend-testing
role: frontend
type: feature
extends: null
---

# Move the Playwright E2E suite to the sibling repo home-control-frontend-testing

## Description
The E2E (Playwright) suite of this frontend moves to its own repo `home-control-frontend-testing`, so the same specs can run in mock mode against this repo (dev gate) and against the deployed PRO panel (`@pro` smoke, scheduled by Jenkins). This repo keeps its unit/component tests (Vitest) and drops `@playwright/test`.

## Requirements
- Remove `e2e/`, `playwright.config.ts` and the `@playwright/test` devDependency from this repo. Unit tests are untouched.
- `.claude/scripts/test.cjs` step 5 runs `npm --prefix ../home-control-frontend-testing test` with `FRONTEND_DIR` = this repo root. `BASE_URL` is stripped so the gate always runs mock mode. Fails clearly if the sibling repo is missing.
- CLAUDE.md, AGENTS.md and README point E2E to the sibling repo.
- Electron shell spec moves with the suite; it reads `electron/main.cjs` and the electron binary from `FRONTEND_DIR`.

## Touches existing endpoints
no

## Done when
- `node .claude/scripts/test.cjs` is green: typecheck, lint, build, unit tests, and the moved suite in mock mode (128 passing, as before the move).
