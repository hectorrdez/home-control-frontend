---
id: "119"
slug: home-no-page-scroll
title: Home 3D without page scroll
role: frontend
type: change
extends: "106"
---

# Home 3D without page scroll

## Description
On `/` (Home 3D) the whole page must never scroll vertically; the page fits the viewport (`100dvh`) and ONLY the device list (actuators) scrolls inside its own container. Fixes the current layout where `Page` uses `min-h-screen` and the panel/stage grow past the viewport.

## Requirements
- `/` : document height = viewport (header 4rem fixed, footer, mobile BottomRail accounted for); no vertical scrollbar on `html`/`body` at any viewport width (mobile 390x844, tablet, desktop 1440x900, short 1280x600).
- Only the device list scrolls (`overflow-y-auto`, `min-h-0` chain through flex/grid parents); filter pills and status header of `DevicePanel` stay fixed above it.
- 3D stage fills the remaining height (no fixed `min-h-96` overflow); on mobile stack stage + panel so both fit and the list takes the rest.
- Other routes (`/telemetry`) keep their normal page scroll; scope the change to Home (e.g. route-aware layout class), no regression on telemetry.
- Footer: keep inside the fitted height or hide it on Home; decide and document.
- Tokens only; keep a11y roles/names. Playwright: at 3 viewports assert `document.documentElement.scrollHeight <= innerHeight` on Home with the mock house and with many devices (`?seed=` or fixtures), and that the device list `scrollHeight > clientHeight` is scrollable; telemetry still scrolls.

## Touches existing endpoints
no

## Done when
- No page-level vertical scroll on Home at the tested viewports; the device list scrolls.
- test.cjs green; Sonar gate OK.
