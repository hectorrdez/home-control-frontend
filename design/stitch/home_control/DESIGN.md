---
name: Home Control
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#343944'
  surface-container-lowest: '#090e17'
  surface-container-low: '#171c25'
  surface-container: '#1b2029'
  surface-container-high: '#252a34'
  surface-container-highest: '#30353f'
  on-surface: '#dee2f0'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#dee2f0'
  inverse-on-surface: '#2c303b'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#fff3ea'
  on-tertiary: '#472a00'
  tertiary-container: '#ffd19c'
  on-tertiary-container: '#855300'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0f131d'
  on-background: '#dee2f0'
  surface-variant: '#30353f'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
  title-md:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  telemetry-lg:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: 0.02em
  telemetry-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an architectural tech aesthetic tailored for tactile smart home automation and mission-critical telemetry. Drawing inspiration from modern aerospace interfaces and minimalist cyberpunk HUDs, the system prioritizes clarity, structural discipline, and immediate situational awareness without visual noise.

### Brand Narrative
- **Atmospheric & Controlled:** Deep, matte cosmic foundations strip away distractions, focusing attention strictly on device state and environmental feedback.
- **Architectural Precision:** Every module feels engineered—aligned precisely to physical zones, sensor thresholds, and operational nodes.
- **Tactile High-Tech:** Optimized for wall-mounted touch displays, tablets, and rapid handheld interaction, ensuring immediate haptic reassurance and zero ambiguity.

### Aesthetic Direction
- **Style Mix:** Minimalist Sci-Fi HUD meets Architectural Tech.
- **Visual Tenets:** Flat matte layering, delicate structural ghost-borders, selective high-chroma neon accents signifying live physical energy, and crisp telemetry displays.

## Colors

The palette leverages a deep matte foundation punctuated by luminous, functionally semantic neon accents. Neon is never decorative; it strictly maps to active states, telemetry thresholds, and hardware statuses.

### Palette Hierarchy & Intent
- **Primary (`#00f0ff` Cyan / Electric Blue):** Represents illumination, active connectivity, power relays, and primary system commands.
- **Secondary (`#10b981` Emerald Green):** Signals operational vitality, nominal telemetry, secure perimeters, and active energy generation.
- **Tertiary (`#f59e0b` Warm Amber):** Reserved for thermal metrics, climate nodes, warnings, and environmental thresholds.
- **Neutral Base (`#0a0f18` Obsidian Surface):** Deep, non-reflective base canvas ensuring zero glare in dark residential environments.
- **Elevated Canvas (`#0e1726` Deep Navy-Slate):** Surface container background for modules, widgets, and modal sheets.
- **Structural Borders (`#1e293b` Slate):** Low-luminance structural frame lines that articulate spatial boundaries without visual fatigue.
- **Subdued Text / Inactive Nodes (`#64748b` Steel Slate):** Neutralized typography for inactive toggles and tertiary metadata.

## Typography

The typographic hierarchy pairs the structured geometric precision of Space Grotesk with the monospaced utility of JetBrains Mono. 

### Typographic Rules
- **Structural Text:** Space Grotesk manages all primary interaction labels, room titles, zone headers, and standard prose.
- **Telemetry & Hardware Status:** JetBrains Mono is strictly used for real-time sensor readouts, wattage monitors, temperature readings, device identifiers, and timestamp stamps.
- **Case Conventions:** Monospace utility labels and status chips are always rendered in uppercase with positive letter spacing (`0.05em` to `0.1em`) for rapid tactical scanning.

## Layout & Spacing

The layout utilizes a fluid, grid-oriented dashboard structure tailored for responsive tablet consoles and multi-column desktop control rooms.

### Breakpoints & Layout Adaptations
- **Compact Handheld (<768px):** 4-column layout. Room cards and device controls reflow into full-width vertical blocks. Side navigation converts to an anchor-docked persistent bottom rail.
- **Tablet / Touch Console (768px - 1199px):** 8-column layout. Optimized for wall docks; grid cards span 2 or 4 columns. Gutter width scales to `gutter-tablet` (`1.25rem`).
- **Command Deck / Desktop (1200px+):** 12-column layout. Room nodes, telemetry feeds, and global scene switchers sit in unified viewport proximity with `gutter-desktop` (`1.5rem`).

### Sizing & Ergonomic Directives
- **Touch Target Integrity:** Every interactive module, quick-toggle, slider thumb, and macro trigger must uphold a strict minimum bounding box of 44×44px (with 48px preferred on primary tablet hubs).
- **Component Padding:** Inner card contents rely on `space-md` for standard density or `space-lg` for large zone overviews.

## Elevation & Depth

Visual hierarchy does not rely on diffused, blurry drop shadows, which dilute the architectural HUD motif. Instead, the interface relies on tonal elevation and low-contrast perimeter lines.

### Depth Mechanics
- **Base Substrate:** `#0a0f18` serves as the primary floor canvas.
- **Level 1 Panels & Cards:** Rendered in `#0e1726` with a continuous `1px` border in `#1e293b`.
- **Level 2 Flyouts, Drawers & Overlays:** Surface shifts to `#131f33`, paired with a higher-contrast boundary of `rgba(0, 240, 255, 0.2)` when illuminated or focused.
- **Photonic Glow Accents:** When hardware toggles engage (e.g., HVAC on, smart lock secured, lights activated), panels emit a crisp inner or outer border highlight (`0 0 12px rgba(0, 240, 255, 0.25)` or equivalent semantic hue) rather than a heavy black shadow.

## Shapes

The interface embraces a strict, semi-angular structural aesthetic. Roundedness is kept to Level 1 (`0.25rem` / `4px`), evoking precision industrial equipment panels, aerospace instrumentation, and architectural blueprints rather than consumer soft-surfaces.

### Application
- **Device Modules & Room Containers:** `0.25rem` corners with `1px` structural boundary strokes.
- **Telemetry Chips & Action Toggles:** `0.25rem` corners.
- **Sliders & Step Trackers:** Linear flat bars with zero curvature (`0px`) or minimal edge breaks (`2px`).
- **Interactive Modals:** Strict `0.5rem` (`rounded-lg`) maximum radius to preserve technical posture.

## Components

### Buttons & Action Triggers
- **Primary Commands (Active Relay):** `#00f0ff` solid surface with `#0a0f18` heavy contrasting typography. Minimum touch dimension: 44px height.
- **Secondary / Offline:** `#0e1726` background, `1px` `#1e293b` border, and `#64748b` text. On hover or touch, the border transitions to `#00f0ff`.
- **Destructive / Perimeter Alert:** Deep dark wine background (`#200d14`) framed in `#ef4444` with white monospaced text.

### Telemetry Cards & Device Modules
- Surface: `#0e1726`.
- Border: `1px solid #1e293b`.
- Active States: When a device is toggled ON, the card's top or left indicator border lights up in the device's semantic hue (Cyan for lights, Amber for climate, Emerald for active sensors).
- Metadata Header: Upper line houses room and device ID in `label-caps` (`JetBrains Mono`), right-aligned with an active state beacon (`6px` circular indicator).

### Toggles, Checkboxes & Radio Controls
- **Switches:** Angular track (`44×24px`) with `#1e293b` fill. Thumb is an angular pip (`18×18px`) that slides from `#64748b` (OFF) to `#00f0ff` (ON). Active tracks emit a faint cyan rim.
- **Checkbox & Radio:** Box dimensions `20×20px` with a 44×44px hit-box envelope. Checked state displays a solid high-chroma center square with a bright perimeter ring.

### Sliders (Lighting Dimmer & HVAC Dial)
- **Track:** 8px thick linear track in `#1e293b` with filled active segment rendered in glowing cyan, amber, or emerald.
- **Thumb:** 28×28px rectangular tactile slider block with textured micro-grip lines in the center.

### Telemetry Badges & Status Chips
- Height: 24px.
- Background: Translucent wash of the semantic color (`rgba(0, 240, 255, 0.08)`).
- Border: `1px solid rgba(0, 240, 255, 0.3)`.
- Text: Rendered in `label-caps` with high-contrast foreground color.

### Form Inputs & Setpoint Steppers
- Height: 48px for instant touch accuracy.
- Base: `#0a0f18` recessed fill with `#1e293b` border.
- Focused State: Border shifts to `#00f0ff` with an ultra-thin inset line; caret flashes in electric cyan.