---
id: "128"
slug: alert-rules-editor
title: Alert rules editor on the device detail page
role: frontend
type: feature
extends: null
---

# Alert rules editor on the device detail page

## Description
First half of the notification center. On the device detail page (122) the user configures, per entity of the device, whether and how to be alerted: one rule per case (connects, disconnects, becomes a value, goes above/below a number, user interacts), each with its own level: OFF, LOW, MEDIUM or HIGH. Depends on backend 012. The alerts themselves are produced by feature 129.

## Requirements
- API layer (`HomeApi`, liveApi, mock): `listAlertRules()`, `createAlertRule(rule)`, `updateAlertRule(id, rule)`, `deleteAlertRule(id)`; mock in memory; refresh the read-only `endpoints.md` copy. Provider/hook `useAlertRules()` loaded once; failure/404 -> editor shows "ALERTS UNAVAILABLE" and nothing else breaks.
- Pure module `src/features/alerts/rules.ts`: types mirroring backend 012; `triggerLabel(trigger)`; `availableTriggers(entity)` (every entity: connects, disconnects, interacted; binary_sensor/switch/light/lock/cover: state_becomes with the entity's real states; numeric sensors: above/below with the unit); `levelOrder`.
- Detail page section "ALERTS" per entity: list of its rules, each row = trigger text + level selector (4 single-select FilterPills with semantic hues: OFF neutral, LOW secondary, MEDIUM tertiary, HIGH error token) + delete. "ADD ALERT" opens an inline form: trigger type, value (when needed), level, optional message (max 120); duplicates (same entity + trigger) are blocked with the backend `duplicate_rule` message. Changing a level saves immediately with optimistic update and rollback + toast on error (same pattern as aliases/actions).
- Default for an entity with no rule: no alert (equivalent to OFF).
- DESIGN.md tokens and existing components only. Unit tests for rules.ts and the section; one Playwright spec with the mock (add rule, change level, delete).

## Touches existing endpoints
GET/POST/PUT/DELETE /api/alert-rules (new, backend 012).

## Done when
- Rules can be created, edited and deleted from the detail page in the mock E2E; test.cjs green.
