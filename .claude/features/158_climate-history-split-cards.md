---
id: "158"
slug: climate-history-split-cards
title: Climate history split into one card per chart
role: frontend
type: change
extends: "144"
---

# Climate history split into one card per chart

## Description
Today the CLIMATE HISTORY panel (112/131/144) is one full-width panel with two stacked charts (temperature, humidity), one room and range filter and one shared cursor. The user wants one card per chart so each can be narrower (half width, two per row, see 159). This feature splits it into two independent cards, TEMPERATURE and HUMIDITY, each with its own filters, legend and readout.

## Decisions (agreed with the user)
- Filters are independent per card: each card has its own Rooms pills (ALL ROOMS plus one per room with that metric) and Range pills. No shared toolbar.
- The shared cursor between the two charts (144) is dropped. Each card has its own cursor, arrow-key readout and tooltip.
- 144 stays as shipped history; this is a new feature with `extends: 144`, the old file is not edited.
- Fixed panels (125): `history:climate` is replaced by `history:climate-temp` and `history:climate-hum` (labels "Climate temperature" and "Climate humidity"). Migration when parsing stored panel state: a hidden `history:climate` hides both new ids, then the old id is dropped on the next save. `historyPanelId` is extended accordingly.
- Default width is not decided here: until 159 ships both cards are full width as today's panel.

## Requirements
- Split `src/components/cards/ClimateHistoryCard.tsx` into two components, for example `ClimateTempCard.tsx` and `ClimateHumCard.tsx`, sharing the existing pure helpers in `features/telemetry/history.ts` and the `ClimateTooltip`. Extract common pieces (room pills, range pills, legend, readout) into a small shared module instead of duplicating them.
- Each card: own `useHistory` call for its metric sensors only (temperature sensors for the temperature card, humidity sensors for the humidity card), own `room` and `range` state, own cursor.
- Temperature card: keep 131 behavior (ALL ROOMS with 2+ rooms = zone-colored line per room plus thicker TOTAL MEAN; one room = area). Humidity card: keep 144/147 behavior (per-room lines plus mean, or a single series in the zone color).
- Each card shows its own title (TEMPERATURE, HUMIDITY), chart, legend (zone dots, 147) and readout with the `aria-valuetext` text of 144 for its metric only.
- A card is hidden (not rendered) when the house has no sensor of its metric. `TelemetryPage` computes `hasClimateTemp` and `hasClimateHum` separately and builds the two `FixedPanel` entries.
- Rooms pills list only rooms that have that metric (`climateRooms(entities, "temperature")` and `climateRooms(entities, "humidity")`).
- Update `TelemetryPage.tsx`, `panelVisibility.ts` (new ids, legacy migration), the CHARTS side panel listing, and existing tests (`ClimateHistoryCard.test.tsx`, `TelemetryPage.test.tsx`, panel visibility tests) plus the E2E specs and page objects that read "CLIMATE HISTORY" (the testing repo is updated separately).
- DESIGN.md tokens only; `lint:tokens` clean.

## Touches existing endpoints
Consumes the same history endpoint through `useHistory` (see endpoints.md). No change.

## Done when
**Unit (Vitest)**
- Each card renders only its metric, has its own Rooms and Range groups, and changing one card's room or range does not change the other.
- Temperature card keeps the 131 lines, TOTAL MEAN and legend; humidity card keeps the 144/147 lines and mean.
- A house with temperature sensors only renders just the temperature card, and the same for humidity only.
- `panelVisibility`: a stored hidden `history:climate` hides `history:climate-temp` and `history:climate-hum`; new ids toggle independently; corrupt data falls back to defaults.
- Keyboard: arrow keys move the cursor inside one card only; `aria-valuetext` carries that metric.
**E2E (Playwright, mock)**
- `/telemetry` shows two cards TEMPERATURE and HUMIDITY, each with its own filters; hiding one in the CHARTS panel leaves the other.
- `node .claude/scripts/test.cjs` green.
