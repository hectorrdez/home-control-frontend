---
id: "109"
slug: design-tokens-and-shell
title: Design tokens and app shell (Stitch design)
role: frontend
type: feature
extends: null
---

# Design tokens and app shell (Stitch design)

## Description
Apply the Stitch "Home Control" design system: replace the template tokens in `src/index.css` with the design tokens and rebuild the app frame (header, nav, footer, mobile bottom rail) to match `design/stitch/home_3d_control_center/code.html`. Every later UI feature builds on these tokens and on the restyled canonical components. Runs right after 101 (no backend or API needed).

## Requirements
- `src/index.css` `@theme`: replace template tokens with the tokens listed in `.claude/DESIGN.md` "Tokens" (values copied from `design/stitch/home_control/DESIGN.md` frontmatter; names identical so code.html classes translate 1:1). Include fonts, type scale (with line-height/letter-spacing/weight companions), spacing, radius, glow shadows, `xl` breakpoint = 1200px. Remove `--background-color-header`, footer, card template vars once their consumers are restyled.
- Fonts self-hosted: add `@fontsource/space-grotesk` and `@fontsource/jetbrains-mono` (weights used: 400/500/600), imported in `main.tsx`. No Google Fonts/CDN.
- Dark only: `body` uses `bg-background text-on-surface font-sans antialiased`. Drop any light-theme switching in ThemeProvider (keep the provider only if something still consumes it; otherwise remove it).
- Restyle canonical components to DESIGN.md (no API changes unless needed): `Card` (L1 surface, 1px `outline-variant` border, `--radius`), `Button` primary/secondary/destructive variants, `ButtonToogle` (or replace with the new `Switch`, then delete the old one and update imports).
- Add library primitives that the shell and every later feature need: `StatusChip` and `FilterPill` in `src/components/controls` (spec in DESIGN.md). Do NOT add Slider/Stepper/DeviceModule here (104/103 own them).
- Layout (`src/layouts`), from home_3d_control_center code.html:
  - Header fixed h-16, `surface-container-lowest/90` + bottom border: left logo tile (lucide `House`) + "HOME CONTROL" + status line slot (static `OFFLINE`-neutral placeholder until 102 wires it); center nav tabs "Home 3D" (`/`) and "Telemetry" (`/telemetry`) using NavLink, selected tab = `primary-container` bg + glow, `aria-current="page"`; right a live clock (HH:MM:SS + UTC offset, mono) and a status strip slot (empty until 111).
  - `<768px`: center nav hides and a fixed bottom rail with the same two destinations (icon + label, 44px min targets) appears; main content gets bottom padding so nothing is hidden behind it.
  - Footer status strip in `label-caps` ("HOME CONTROL // HUD" left, app version from package.json right).
  - Page grid helper: `/` page renders the 12-col desktop grid with two empty slots (left `xl:col-span-4` "panel", right `xl:col-span-8` "stage") each with an accessible region label ("Device panel", "House view"); `/telemetry` renders an empty 12-col grid. Mobile stacks.
- Lint guard: add an oxlint/grep step (script `npm run lint:tokens`, wired into `npm run lint`) that fails on hex colors (`#[0-9a-fA-F]{3,8}`) or `rgb(` in `src/**/*.tsx|ts` outside `src/index.css`.
- Coverage choice: Playwright (navigation is a critical journey + responsive layout). `e2e/components/navigation.ts` component object (`goTo(name)`, works for both top nav and bottom rail). Spec `e2e/specs/shell.spec.ts`: desktop 1280px navigate Home 3D -> Telemetry -> back, `aria-current` follows; mobile 390px viewport shows the bottom rail and navigation works; both regions on `/` are present. Update 101 smoke spec only if headings moved.

## Touches existing endpoints
no

## Done when
- Pages render on the dark design (fonts, colors, spacing from tokens); header/nav/footer/bottom rail match the reference layout at 390, 1024 and 1440px.
- `npm run lint` fails if a hex color is added to a component (proved once manually, then reverted).
- shell.spec passes.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
