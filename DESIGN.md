---
name: QoL Tools
description: A local-first developer utility belt, themed across 7 selectable palettes.
colors:
  bg-primary: "#1a1a1a"
  bg-secondary: "#2a2a2a"
  bg-tertiary: "#383838"
  bg-hover: "#333333"
  terminal-green: "#74a12e"
  lime-highlight: "#c6ee86"
  text-primary: "#ffffff"
  text-secondary: "#888888"
  border-color: "#444444"
  shadow-color: "#333333"
  error-color: "#ff6b6b"
  warning-color: "#ffa500"
  info-color: "#6ba3ff"
  scrim: "rgba(0, 0, 0, 0.4)"
typography:
  body:
    fontFamily: "Raleway, sans-serif"
    fontWeight: 400
    fontSize: "16px"
    lineHeight: "normal"
  headline:
    fontFamily: "JetBrains Mono, monospace"
    fontWeight: 400
    fontSize: "2.5em"
  micro:
    fontFamily: "Raleway, sans-serif"
    fontWeight: 400
    fontSize: "11px"
  label:
    fontFamily: "Raleway, sans-serif"
    fontWeight: 400
    fontSize: "12px"
  small:
    fontFamily: "Raleway, sans-serif"
    fontWeight: 500
    fontSize: "13px"
  compact:
    fontFamily: "Raleway, sans-serif"
    fontWeight: 400
    fontSize: "14px"
  title:
    fontFamily: "JetBrains Mono, monospace"
    fontWeight: 600
    fontSize: "24px"
  stat-sm:
    fontFamily: "Raleway, sans-serif"
    fontWeight: 400
    fontSize: "28px"
  stat:
    fontFamily: "Raleway, sans-serif"
    fontWeight: 400
    fontSize: "48px"
  code:
    fontFamily: "Consolas, Monaco, monospace"
    fontWeight: 400
    fontSize: "11px"
  math:
    fontFamily: "Georgia, Times New Roman, serif"
    fontWeight: 400
    fontSize: "12px"
rounded:
  sm: "3px"
  md: "5px"
  floating: "8px"
  lg: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "20px"
components:
  button-primary:
    backgroundColor: "{colors.terminal-green}"
    textColor: "{colors.bg-secondary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.lime-highlight}"
    textColor: "{colors.bg-primary}"
  button-ghost:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
  nav-link:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "28px 22px 24px"
---

# Design System: QoL Tools

## Overview

**Creative North Star: "The Developer's Workbench"**

QoL Tools is a dark, utilitarian dashboard of small browser-based dev utilities, built by its own owner for daily personal use. Nothing here performs for a first-time visitor — every surface is designed to be glanced at, used, and left alone. The system is deliberately unadorned at rest: flat panels, hairline borders, a single accent color per active theme. The whole site ships 7 interchangeable palettes (Default/green, Dracula, Catppuccin, Atom, Nord, Solarized, SynthWave), all driven by one shared CSS custom-property contract — the visual "shape" of the site never changes across themes, only its color values do.

The system currently carries a few generic-AI-interface tells worth naming rather than hiding: a gradient-clipped hero headline on the landing page, and colored top/side accent stripes on cards. This is descriptive of what ships today, not a prescription to keep it that way.

**Key Characteristics:**
- Flat at rest; every glow, border-color shift, or shadow is a response to hover/focus, never decoration
- One accent color per theme carries nearly all interactive signal (buttons, focus rings, active nav, links)
- Two typefaces: Raleway for body copy/controls, JetBrains Mono for all heading tags (`h1`–`h4`) — hierarchy within each voice still comes from size, weight, and glow
- Non-directional "ambient glow" shadows (colored, centered) rather than physical drop shadows implying a light source

## Colors

Each theme swaps one primary/secondary accent pair and one neutral ramp; the palette character is "dark ground, single loud accent, everything else quiet." Values below are the Default theme; every other theme (Dracula, Catppuccin, Atom, Nord, Solarized, SynthWave) restates the same roles with different hues — describe by role, not by one theme's hex.

### Primary
- **Terminal Green** (`--accent-primary`, `#74a12e`): the one interactive/signal color — button fills, hover glows, focus rings, active nav-link background, logo text-shadow.

### Secondary
- **Lime Highlight** (`--accent-secondary`, `#c6ee86`): the "peak" state — primary-button hover fill, focus-within border color, shimmer highlight on the landing-page divider, logo text color.

### Neutral
- **Chassis Black** (`--bg-primary`, `#1a1a1a`): page background.
- **Panel Gray** (`--bg-secondary`, `#2a2a2a`): card/box/nav-link resting background.
- **Component Gray** (`--bg-tertiary`, `#383838`): nested control backgrounds (toolbar buttons, icon chips).
- **Hover Gray** (`--bg-hover`, `#333333`): hover background for list/dropdown rows.
- **Primary Text** (`--text-primary`, `#ffffff`) / **Secondary Text** (`--text-secondary`, `#888888`): body copy vs. captions and meta text.
- **Border** (`--border-color`, `#444444`): all panel/card/input borders at rest.
- **Shadow** (`--shadow-color`, `#333333`): the ambient glow tint for resting panels.

### Status
- **Error** (`--error-color`, `#ff6b6b`), **Warning** (`--warning-color`, `#ffa500`), **Info** (`--info-color`, `#6ba3ff`): reserved status roles; lightly used today (destructive-hover states mainly).

### Utility
- **Scrim** (`rgba(0, 0, 0, 0.4)`): the neutral black overlay-separation shadow used by floating tooltips/modals (see Elevation & Depth). Theme-independent by design — a scrim dims what's behind it regardless of which palette is active, so it deliberately does not use a theme token.

### Named Rules
**The Single-Accent Rule.** Exactly one accent color (per active theme) carries interactive/focus/active signal across the entire site. A second color never competes for that job — the secondary accent is reserved for "peak/hover" states of the same interaction, not a second independent signal.

## Typography

**Body Font:** Raleway (with sans-serif fallback) — used for body copy, buttons, labels, and all non-heading UI text.

**Display Font:** JetBrains Mono (with monospace fallback) — used for every heading tag (`h1`–`h4`) site-wide: page headline, panel headers, modal titles, and the item-title heading inside a panel/view. A deliberate, dedicated design-system addition (added to pair with Raleway and give heading text distinct weight from body copy), not per-page drift — every tool loads it from the same Google Fonts request as Raleway.

**Character:** Two voices, cleanly split by role — JetBrains Mono marks "this is a heading" wherever an `h1`–`h4` tag is used; Raleway carries everything else, including non-heading text that happens to sit at a heading-adjacent size (e.g. list-row item names). Size, weight, and glow still carry hierarchy within each voice.

### Hierarchy
- **Headline** (JetBrains Mono, 400 weight, 2.5em, centered, `text-shadow: 0 0 3px var(--accent-primary)`): page `<h1>` — the accent-colored glow is the only thing distinguishing it from body text at the same weight.
- **Body** (Raleway, 400 weight, 1em / 16px): general copy, form labels, descriptions.
- **Title** (JetBrains Mono, 600 weight, 24px): the second-tier heading used inside a panel or view for the current item's name (e.g. the Snippets viewer's title, `.snippet-title-section h2`, and modal `<h3>` titles). Sits between Body and Headline; used once per view, never for list rows.
- **Micro** (Raleway, 400 weight, 11px): the smallest step — badges, tags, copy-count chips.
- **Label** (400 weight, 12px): the most common meta size — most row/meta text is Raleway; the one exception is panel-header `<h3>` (e.g. "Categories", "Snippets"), which is a heading tag and so renders in JetBrains Mono per the pairing rule below.
- **Small** (500 weight, 13px): item names and history-entry titles; slightly heavier than Label to carry a name over its metadata.
- **Compact** (400 weight, 14px): the largest micro step — sort/shortcuts controls, slightly more prominent captions.
- **Stat-sm / Stat** (400 weight, 28px / 48px): large numerals and icons used for modal close glyphs, empty-state icons, and similar one-off display moments. Not body-text sizes; reserved for a single dominant visual per view.
- **Code** (400 weight, 11px, `Consolas, Monaco, monospace`): `<kbd>` keys and rendered code. Monospace is functionally correct for code/key alignment, not a second brand voice.
- **Math** (400 weight, 12px, italic, `Georgia, Times New Roman, serif`): inline/display math-notation buttons in the Markdown toolbar (`.md-btn-math`, showing literal `$x$`/`$$x$$`). Serif italic is the standard typographic convention for math variables — matches KaTeX's own rendering, which this project already loads.
- **Logo/Label** (bold, uppercase, 3px letter-spacing, accent-primary text-shadow): the site logo and nav-adjacent labels.

### Named Rules
**The Heading/Body Pairing Rule.** Exactly two font families exist site-wide, split by role, never by ad hoc choice: JetBrains Mono for every `h1`–`h4` heading tag, Raleway for everything else. A given element's font is fully determined by whether it's a heading tag — hierarchy within each voice is still carried by size, weight, color, and glow, not by further font switching. Any future work that introduces a third font (beyond the two functional exceptions below) is a deliberate system change, not a drop-in. Two further sanctioned exceptions exist, both functional rather than decorative: `Consolas, Monaco, monospace` for `<kbd>` keys and rendered code, and `Georgia, Times New Roman, serif` (italic) for math-notation buttons matching KaTeX's rendering convention.

**The Fixed-Step Rule.** Every font-size in the codebase snaps to one of: 11px (Micro), 12px (Label), 13px (Small), 14px (Compact), 16px (Body), 24px (Title), 28 / 48px (Stat), 2.5em (Headline). A one-off size outside this list is drift, not a new tier — either it belongs to an existing step or the step list needs a deliberate addition here first. (Markdown-rendered content is the sole exception: `.markdown-preview h1-h4`/`code` use `em` multipliers on the Body base so arbitrary user content keeps a proportional internal hierarchy — that ramp is relative by design, not an absolute step.)

## Layout

Fixed-position header (logo + theme selector + tool nav) with `body { padding-top: 140px }` to clear it; `body` uses `display:flex; flex-direction:column; align-items:center`, so page containers must set `width: 100%` to fill available space. The landing page is a centered hero (max-width 700px) above a responsive card grid (`repeat(auto-fill, minmax(270px, 1fr))`). Tool pages generally use a two-panel or three-panel row layout (`.columns-row`, `.box` at `height: 50vh`) that collapses to a single column under 992px.

## Elevation & Depth

Flat by default. Resting panels (`.box`) carry a faint ambient glow (`box-shadow: 0 0 4px var(--shadow-color)`), not a directional drop shadow implying a light source — it reads as "distinct surface," not "lifted object." The one exception is the landing page's `.tool-card`, which does use a real directional shadow at rest (`0 2px 8px rgba(0,0,0,0.15)`) plus a colored glow + lift on hover — worth flagging as an inconsistency with the rest of the flat system rather than a deliberate second material.

Floating overlays (tooltips, modal panels) are a distinct, legitimate second case: they use plain black directional shadows at varying opacity (e.g. Snippets' `.shortcuts-tooltip` at `rgba(0,0,0,0.4)`) to separate themselves from page content behind them. That's a real depth need — a themed accent glow doesn't read as "floating above" the way a neutral shadow does. Treat this as a second, narrower pattern (scrim/overlay separation), not a violation of the Ambient-Glow Rule, which governs in-flow component elevation.

### Shadow Vocabulary
- **Ambient panel glow** (`box-shadow: 0 0 4px var(--shadow-color)`): resting state for `.box` containers.
- **Focus glow** (`box-shadow: 0 0 15px var(--accent-primary)`): the shared focus-within/focus treatment for inputs, textareas, and select controls site-wide.
- **Interactive hover glow** (`box-shadow: 0 0 10px var(--accent-primary)`): nav-link and button hover.
- **Overlay separation shadow** (`box-shadow: [offsets] rgba(0,0,0,0.3-0.8)`): floating tooltips/modals lifting off page content; neutral black, not theme-colored.

### Named Rules
**The Ambient-Glow Rule.** Shadows are colored, non-directional glows tied to the active theme's tokens, not physical drop shadows. They exist to signal focus/hover/interactivity, not to imply elevation off the page.

## Shapes

Corners are consistently soft and small: 3px on primary/ghost buttons and small controls, 5px on `.box` containers, nav-links, and panels, 8px on floating elements (tooltips, modals, template cards), 10-12px on landing-page cards and their icon chips. A dedicated `pill` step (`999px`) exists for fully-rounded badges (e.g. `.snippet-type-badge`) — always use it for pill shapes rather than guessing a px value close to the element's height. No sharp corners anywhere. Borders are uniformly 1px at `--border-color`, and only change color (never thickness) to signal an interactive state.

### Named Rules
**The Six-Step Radius Rule.** Every `border-radius` snaps to one of: 3px (sm), 5px (md), 8px (floating), 10px (lg), 12px (xl), or 999px (pill, for fully-rounded badges). A value outside this list is drift.

## Components

### Buttons
- **Shape:** 3px radius, no border on primary.
- **Primary:** `.format-btn` — background `--accent-primary`, text `--bg-secondary`, padding `8px 16px`.
- **Hover:** background shifts to `--accent-secondary`, text flips to `--bg-primary`.
- **Ghost/Secondary:** `.clear-bnt` — background `--bg-tertiary`, text `--text-primary`; hover shifts to `--error-color` (it's used for destructive/clear actions specifically).

### Cards (landing page)
- **Corner Style:** 10px radius.
- **Background:** `--bg-secondary`.
- **Shadow Strategy:** real drop shadow at rest + colored glow/lift on hover (see Elevation exception above).
- **Border:** 1px `--border-color`, shifts to `--accent-primary` on hover; a top-edge accent stripe scales in on hover (`::before`, `scaleX(0)` → `scaleX(1)`).
- **Internal Padding:** `28px 22px 24px`.

### Inputs / Fields
- **Style:** `--bg-secondary`/`--bg-tertiary` background, 1px `--border-color` border, 4-5px radius, no native outline.
- **Focus:** border shifts to `--accent-secondary` plus the shared `0 0 15px var(--accent-primary)` glow (see Shadow Vocabulary) — this exact treatment is reused for every input, textarea, and select on the site.

### Navigation
- Fixed header, centered uppercase logo (3px letter-spacing, accent-primary text-shadow glow), right-aligned theme `<select>`. Nav links (`.tool-btn`): `--bg-secondary` background at rest, invert to `--accent-primary` background + `--bg-primary` text + glow + `translateY(-2px)` lift on hover; the current page's link uses `--accent-secondary` as a static "active" background.

## Do's and Don'ts

### Do:
- **Do** keep exactly one accent color driving interactive signal per theme; a second accent only ever represents that same signal's "peak" state.
- **Do** use the shared focus treatment (`border-color: var(--accent-secondary)` + `0 0 15px var(--accent-primary)` glow) for every new input/select/textarea, rather than inventing a new focus style per component.
- **Do** keep shadows as ambient, non-directional glows tinted from theme tokens — never a fixed black/gray shadow that ignores the active theme.
- **Do** make every new themeable component render correctly across all 7 existing palettes via the CSS custom-property contract; don't hardcode a color that only looks right in the Default theme.

### Don't:
- **Don't** introduce a second typeface without treating it as a deliberate, site-wide system change (see The One-Voice Type Rule) — don't drop one in for a single new component.
- **Don't** treat the landing-card's gradient-clipped headline or top-edge accent-stripe-on-hover as the system's default card/heading treatment; they're documented here as incumbent facts, not as patterns to repeat elsewhere.
- **Don't** add a physical drop shadow (implying a light source/elevation) to a panel or button — the system's depth language is glow, not lift.
- **Don't** copy Snippets' existing `rgba(116, 161, 46, 0.1-0.5)` usage (e.g. `.history-item.active`) into new code — it's the Default theme's green baked in as a literal triple, so it stays green under every other theme instead of adapting. This is pre-existing debt, not a pattern to repeat; new code should use `color-mix(in srgb, var(--accent-primary) X%, transparent)` instead.
