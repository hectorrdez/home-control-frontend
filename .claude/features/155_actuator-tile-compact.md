---
id: "155"
slug: actuator-tile-compact
title: Compact actuator tiles in home3d with icon, name and zone
role: frontend
type: change
extends: 143
---

# Compact actuator tiles in home3d with icon, name and zone

## Description
Redesign the actuator UI on the home 3D page to be much smaller: icon, name below and, smaller, the zone it belongs to. Visual states: coloured border when active, none when off, grey when unavailable. While commands are in flight the icon is replaced by a loader.

## Requirements
- Tile shows the device icon (lucide-react, already a dependency), the visible name via useEntityName() (shortName/displayName rules from feature 115) and the area name smaller below.
- Icon is editable from the device detail page: closed list of lucide icons (picker), persisted through createSyncedSetting (features/settings/syncedSetting.ts), with a sensible default per domain.
- Switch-like devices: border coloured (token colour) when on, uncoloured when off, grey when unavailable.
- While an action is pending or state is settling (see 116/117 actionConfirmed/pending), the icon becomes a loader and tap interaction is disabled; long-press stays allowed (feature 156 provides it).
- Follow .claude/DESIGN.md tokens, no hex. Replaces the current bigger actuator cards on that page (extends 143).
- Tests: component tests for the states (on/off/unavailable/pending), icon setting persistence.

## Touches existing endpoints
no. Uses entity actions already in endpoints.md (POST /api/entities/:entityId/action) and the settings API.

## Done when
- Home 3d page shows compact tiles with icon/name/zone, correct border states, loader while pending, and the icon can be changed from the device detail page.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
