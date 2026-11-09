---
id: "153"
slug: events-panel-expand
title: Events panel can be expanded (fullscreen on mobile)
role: frontend
type: feature
extends: null
---

# Events panel can be expanded (fullscreen on mobile)

## Description
The events panel (EventFeed, used in TelemetryPage) gets an expand control. Expanded it shows a large overlay on desktop and takes the whole screen on mobile, so long event lists are readable.

## Requirements
- Add expand/collapse button to EventFeed (src/components/cards/EventFeed.tsx); reuse SideDrawer/overlay patterns and tokens from .claude/DESIGN.md.
- Desktop: large overlay/panel. Mobile (small breakpoint): fullscreen (100dvh, safe-area aware).
- Close via button and Escape; focus moves into the expanded panel and returns to the trigger; body scroll locked while open.
- Honor prefers-reduced-motion; event list keeps live updates while expanded.
- Add unit tests and an e2e scenario (desktop + mobile viewport) note for the testing repo.

## Touches existing endpoints
no. Consumes the events feed already used by EventFeed (feature 140/141).

## Done when
- A user can expand the events panel and collapse it again; on a mobile viewport the expanded panel covers the full screen.
- Escape and the close button collapse it; focus handling is correct.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
