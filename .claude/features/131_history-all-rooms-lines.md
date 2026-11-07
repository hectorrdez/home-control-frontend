---
id: "131"
slug: history-all-rooms-lines
title: History chart ALL ROOMS shows every room plus total mean
role: frontend
type: change
extends: "112"
---

# History chart ALL ROOMS shows every room plus total mean

## Description
Replaces the ALL ROOMS behavior of the climate history chart (112, `ClimateHistoryCard.tsx`): instead of a single mean series it shows one temperature line per room in that room's zone color (130) plus a thicker total-mean line. Also fixes the card title overlapping the room/range selector buttons.

## Requirements
- Depends on 130 (`zoneColorToken`). Reuse `meanAcrossSeries` from `src/features/telemetry/history.ts` for the total mean; extend history.ts with a helper that merges per-room series by timestamp.
- ALL ROOMS: temperature = one line per room (zone color, 1.5px) + TOTAL MEAN line (thicker, `tertiary`/on-surface token, drawn on top). Humidity = TOTAL MEAN only (single line on the right axis). A single room selected keeps today's behavior (temp area + humidity line, in that room's zone color for temperature).
- Legend under the chart: colored dot (`ZoneDot`) + room display name (115 `displayName`) per line, plus TOTAL MEAN. Room pills show the zone dot.
- Tooltip/crosshair readout in ALL ROOMS lists each room value and the mean; keyboard arrows keep working; hidden data table includes one column per room.
- Summary line (PEAK, TEMP VARIANCE, HUMIDITY mean) computed on the total mean in ALL ROOMS.
- Layout: title in its own row above the selector groups; selectors use `flex-wrap`; no overlap at 360px, 768px and desktop widths.
- Rooms with no temperature data are skipped (no empty line); one room only -> behaves like single room.
- Tests: unit for the per-room merge and total mean; component tests for line count, legend, colors from `zoneColorToken`; Playwright (mock): ALL ROOMS shows N room lines + mean (legend entries), switching to one room shows one line, title bounding box does not intersect the selector buttons at 360px viewport.

## Touches existing endpoints
no (same HomeApi.getHistory calls as 112)

## Done when
- ALL ROOMS shows every room in its zone color plus the total mean; title no longer overlaps controls.
- test.cjs is green.
