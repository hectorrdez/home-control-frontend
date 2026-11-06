# Design system - Home Control (frontend)
# Read before building or changing any UI. Tokens live in code; this file gives usage rules and pointers only.
# Visual reference: design/stitch/ (Stitch export "Cyberpunk 3D smart home dashboard").
#   - home_3d_control_center/code.html  -> route `/`  (device panel + 3D house)
#   - telemetry_sensors_analytics/code.html -> route `/telemetry`
#   - three.js/code.html -> procedural 3D house scene (walls, furniture, room glows, hotspots)
#   - home_control/DESIGN.md -> original token spec (source the @theme values were copied from)
#   The screen.png files are UNSTYLED captures (Tailwind CDN failed). Open code.html in a browser with
#   network access to see the real look. Never copy code.html verbatim: it uses CDN Tailwind, Material
#   Symbols and three r125; we use Tailwind 4 @theme, lucide-react and npm `three`.

## Direction
Minimal sci-fi HUD + architectural tech. Dark only (no light theme). Flat matte layers, 1px ghost borders,
neon ONLY to signal live state (on, active, nominal, warning). No decorative glow, no blurry drop shadows.

## Tokens - source of truth: `src/index.css` `@theme` (feature 109)
Names match the Stitch spec 1:1 so code.html class names translate directly (`bg-surface-container`,
`text-on-surface-variant`, `font-label-caps`, `gap-space-md`...).
- Colors: `--color-*` = every key of `colors:` in design/stitch/home_control/DESIGN.md frontmatter.
- Fonts: `--font-sans` = Space Grotesk, `--font-mono` = JetBrains Mono (self-hosted via @fontsource, no CDN).
- Type scale: `--text-{display-lg,headline-lg,headline-md,title-md,body-lg,body-md,telemetry-lg,telemetry-md,label-caps}` (+ `--line-height`/`--letter-spacing`/`--font-weight` companions).
- Spacing: `--spacing-{space-xs,space-sm,space-md,space-lg,space-xl,gutter,gutter-tablet,gutter-desktop,margin,margin-tablet,margin-desktop}`.
- Radius: `--radius-sm` 2px (sliders, chips edge), `--radius` 4px (cards, buttons, chips), `--radius-lg` 8px (modals/drawers max).
- Glow: `--shadow-glow-primary|secondary|tertiary|error` (0 0 12px semantic hue at ~25%). The only shadows allowed.
- 3D scene colors: read from the same CSS variables at mount (`getComputedStyle`), never hex literals in TS.
Rule: no raw hex/rgb, no arbitrary `[...]` values in components. Missing token -> add it to `@theme` first.

## Color semantics
- Canvas: `background`/`surface`; header/footer `surface-container-lowest`; cards L1 `surface-container`
  (hover `surface-container-high`); flyouts/drawers L2 `surface-container-high` + border `primary-container`/20.
- Borders: `outline-variant` (structural, often /30-/40). Body text `on-surface`; meta/inactive `on-surface-variant`.
- `primary-container` (cyan): lights, connectivity, primary actions, selected nav/filter, focus ring.
- `secondary` (emerald): nominal/online, sensors OK, energy generation, "synchronized".
- `tertiary-fixed-dim` (amber): climate/thermal, warnings, thresholds.
- `error`/`error-container`: offline, failed action, alarms. Destructive button = `error-container` bg + `error` border.
- Domain -> hue: light=cyan, climate=amber, sensor/binary_sensor=emerald, switch/plug=cyan, cover=cyan, alarm/lock=emerald (armed) / error (triggered).

## Typography
- Space Grotesk (`font-sans`): names, room/zone titles, nav, prose. One `display`/`headline` per view.
- JetBrains Mono (`font-mono`): every live number (temps, %, W/kWh, ppm), entity ids, timestamps, status chips.
- `label-caps`: monospace, UPPERCASE, tracked; used for metadata lines ("LIVING ZONE A // light.arc") and chips.
- Mobile (<768px) uses the `-mobile` variants of display/headline.

## Layout & spacing
- Breakpoints: <768 handheld (4 cols, full-width blocks, nav becomes bottom rail), 768-1199 tablet (8 cols,
  gutter-tablet), >=1200 desktop (12 cols, gutter-desktop). Map to Tailwind `md` (768) and `xl` (1200, define in @theme).
- Shell: fixed top header h-16 (logo + HA status line | nav tabs "Home 3D" / "Telemetry" | system strip + clock),
  `main` pt-16, footer status strip (`label-caps`). Desktop `/`: left panel xl:col-span-4, 3D stage xl:col-span-8.
- Card padding `space-md` (dense) or `space-lg` (zone overviews). Gaps from the spacing scale only.

## Components - reuse, do not re-roll
Existing library (restyled in 109): `src/components/controls` (Button, ButtonLink, ButtonToogle),
`src/components/cards` (Card), `src/components/placing` (Row, Column...), `src/components/dropdowns`; frame in `src/layouts`.
Canonical design components (add to the library when first needed, then reuse):
- `StatusChip` (controls): h-6, semantic wash bg (/8), border (/30), `label-caps` text, optional 6px beacon dot.
- `FilterPill` (controls): min-h-11, icon + label + count; selected = `primary-container` bg + glow.
- `Switch` (controls; may replace ButtonToogle): 48x28 track, pip slides; `role="switch"` + `aria-checked`.
- `Slider` (controls): 8px flat track, filled segment in domain hue, 28px thumb; native `<input type=range>` styled.
- `Stepper` (controls): -/+ buttons 44px with mono value between (climate setpoint).
- `DeviceModule` (cards): icon tile 44px + name + `label-caps` meta + beacon; domain controls below; ON = left/top
  indicator border + glow in domain hue.
- `KpiCard` (cards): `label-caps` title, `telemetry-lg` value + unit, delta/min/max line, small icon.
- `RingGauge` (cards): SVG circle 36x36 viewBox, track `surface-container-highest`, arc in semantic hue, % centered.
- `EventFeedItem`: icon, title, mono timestamp, meta line.
Icons: lucide-react only (map Material Symbols names from code.html to the nearest lucide icon).

## States (every data view)
- loading: skeleton blocks in `surface-container` with subtle pulse (respect reduced motion); never a blank panel.
- empty: `on-surface-variant` message + icon inside the card frame ("NO DEVICES IN THIS ZONE").
- error: `error` StatusChip + one-line message + Retry button; layout never crashes.
- success: data. Stale/disconnected (SSE down): header beacon turns amber, "RECONNECTING" chip; values keep last state.
- Pending action: control disabled + mono "SENDING"; failure rolls back and shows an error toast.

## Interaction & accessibility
- Touch targets >= 44x44 (48 preferred on primary controls). Visible focus: 2px `primary-container` ring, never removed.
- Transitions 150-200ms on color/border only; honor `prefers-reduced-motion` (no pulse, 3D auto-rotate off).
- Contrast: body text on surfaces >= 4.5:1 (`on-surface`, `on-surface-variant` pass; do not use `outline` for text).
- Every control has an accessible name (`aria-label` from the entity name); switches use role switch; sliders expose value text with unit.
- 3D canvas is decorative-interactive: always provide the accessible room list/chips that drive the same selection; WebGL unavailable -> message + panel still usable.
- Never convey state by color alone: pair the hue with text ("ON", "OFFLINE", "23.1 °C").

## UI copy
English, terse, HUD tone. Labels/chips UPPERCASE (`label-caps`); names and messages sentence case.
Numbers always with unit; temps 1 decimal, % integers, power W < 1000 else kW 2 decimals.
