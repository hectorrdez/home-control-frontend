---
id: "107"
slug: electron-shell
title: Electron shell
role: frontend
type: feature
extends: null
---

# Electron shell

## Description
Desktop app that loads the same panel; no local API.

## Requirements
- `electron/` (main process, TypeScript or JS) opening a window on the panel URL (config: default `https://home-control.hectorrdez.es`, overridable via env/config file); no preload exposure of Node.
- Tray icon (show/hide, quit), optional autostart, remember window size, external links open in the browser.
- Offline/unreachable page with retry (Tailscale down), styled with the design tokens (DESIGN.md; a static HTML page may inline the token values from `src/index.css` at build time, not hand-copied hex). Window background = `background` token to avoid a white flash; min window size 1024x700.
- Scripts: `electron:dev` (loads Vite dev server), `electron:build` (Windows installer, electron-builder).
- Does not alter the web build; web remains deployable without Electron deps.
- Verification: smoke test launching Electron against the dev server (Playwright electron or a scripted launch).

## Touches existing endpoints
no

## Done when
- App opens the panel, tray works, installer builds on Windows.
- Web build and test.cjs unaffected.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
