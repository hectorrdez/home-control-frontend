---
id: "117"
slug: device-action-feedback
title: Device action feedback and settling state
role: frontend
type: change
extends: "104"
---

# Device action feedback and settling state

## Description
Today, flipping a switch makes it go ON at once (optimistic), then back to OFF, then ON again: the HTTP response carries the state Home Assistant had BEFORE it applied the change, and only the later stream event carries the new one. Fix the flicker and give the control a clear "changing state" feedback: a loader on the control that triggered the action, held until the new state is really confirmed. Extends feature 104 (device control) and the reconcile rules of 105.

## Requirements
- Root cause fix (state, `src/state/entities.ts`): `actionConfirmed` must NOT overwrite the optimistic value with the HTTP response when that response still shows the old state. Keep the optimistic value and a `settling` marker (entity stays "in transition") until a stream event whose state equals the expected one arrives (clears it), or a settle timeout (about 5 s, constant) expires, then take the server state via the existing reconcile/refresh. A failure still rolls back to the baseline and shows the error toast.
- A newer action on the same entity supersedes the older (keep the `requestId` rule from 104); a stale stream event (older `lastChanged` than the action start, different from the expected state) must not flip the value (existing `reconcileEvent` rule), including during `settling`.
- New shared `Spinner` primitive in `src/components/controls/` (token colors, `motion-reduce` shows a static indicator); the control that sent the action shows it while `pending` or `settling`: the `Switch` (spinner inside the thumb), the ACTIVATE/lock buttons (spinner + label), mode chips and preset buttons. `Slider`/`Stepper` stay focusable (104 note) and only show a small inline spinner.
- Replace the separate "SENDING" chip with this in-control loader (keep an accessible live status: `aria-busy` on the control and an `aria-live` "SENDING"/"UPDATING" text for screen readers).
- On confirmation a brief success flash of the card/control (respect reduced motion); on failure a brief error highlight plus the existing toast.
- Reuse `Switch`, `Button`, `FilterPill`; derive the in-transition flag from state (`pending` or `settling`), do not duplicate state in components.
- Playwright (mock): `?mock=slow` shows the loader and a single transition without flicker (state goes off -> on once, never back to off); `?mock=action-error` rolls back and shows the toast. Unit tests for the reducer: confirm-with-stale-response keeps optimistic + settling, matching stream event clears it, timeout clears it.
- Mock: make the mock backend reproduce the real behavior (action response returns the OLD state, the stream event with the new state arrives after a short delay) so the flicker is reproducible in tests.

## Touches existing endpoints
yes: `POST /api/entities/:id/action` (response handling) and `GET /api/stream` events (reconcile), from endpoints.md; no contract change.

## Done when
- Toggling a light/switch shows the loader on the control and a single clean transition to the new state, no off-on flicker, in mock and live.
- Reducer unit tests + Playwright journey pass.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
