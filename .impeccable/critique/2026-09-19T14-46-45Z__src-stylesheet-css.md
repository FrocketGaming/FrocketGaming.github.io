---
target: Dunder theme across the site
total_score: 11
max_score: 16
na_heuristics: 2,3,5,7,9,10
p0_count: 0
p1_count: 2
timestamp: 2026-09-19T14-46-45Z
slug: src-stylesheet-css
---
Method: DEGRADED single-context (sub-agent spawning not authorized in this session; assessments run sequentially, design review first).

# Critique: Dunder theme across the site

Scope: landing, newsletter, and all 14 tool pages at 1440px and 390px, Dunder theme, plus a static scan of every stylesheet for accent fills.

## Design Health Score (applicable heuristics only)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Active/focus states clear, but warning and accent were the same yellow |
| 2 | Match System / Real World | n/a | Not a property of a palette |
| 3 | User Control and Freedom | n/a | Not a property of a palette |
| 4 | Consistency and Standards | 2 | Light text on accent fills (1.4:1), hardcoded green glow, ramp far tighter than other themes |
| 5 | Error Prevention | n/a | Not a property of a palette |
| 6 | Recognition Rather Than Recall | 3 | Roles readable, but warning/accent collapsed |
| 7 | Flexibility and Efficiency | n/a | Not a property of a palette |
| 8 | Aesthetic and Minimalist Design | 3 | Strong identity; panels and borders nearly invisible |
| 9 | Error Recovery | n/a | Not a property of a palette |
| 10 | Help and Documentation | n/a | Not a property of a palette |
| **Total** | | **11/16 (69%)** | Acceptable, just under Good (as reviewed, before fixes) |

## Priority Issues

- [P1] Light text on accent fills: `.category-tab.active`, `.example-btn:hover` (no text color), `.sample-btn:hover`, `.export-btn:hover`, `.tool-btn-editor.active`, `.action-btn.primary` (`#fff`). About 1.4:1 on Dunder yellow. FIXED: dark ink (`--bg-primary`), better on every theme.
- [P1] Surface ramp far too tight: panels 1.05:1 against the page, borders 1.31:1, about 2 L* points per step versus about 7.5 on Green. FIXED: bg-secondary #161616, bg-tertiary #222222, bg-hover #1c1c1c, border #333333.
- [P2] `--warning-color` identical to `--accent-primary` (#ffd43b). FIXED: warning is now #f0883e.
- [P2] Hardcoded `rgba(116, 161, 46, 0.3)` glow on the chart builder's active panel stayed green on every theme. FIXED: `color-mix()` from the accent token.
- [P2] Browser surfaces unthemed: selection, caret, checkbox/radio/range accents. FIXED in `src/stylesheet.css` (all themes).
- [P3] Accent blue (#4b8bbe) is the dimmest text role. FIXED: lifted to #5a9dd6 (about 6.3:1 on panels). Newsletter band-2 keeps #4b8bbe.

## Not changed (noted)

- Timezone hour-coding (`#2d5a2d` / `#5a4a1a` / `#5a1a1a`) is theme-invariant by design and reads muddy on pure black. Documented exception; left alone.
- Header pill rail overlaps the theme selector on phones. Pre-existing, not theme-related.

## Detector (Assessment B)

`detect.mjs` ran in degraded mode (HTML parser modules unavailable, regex fallback: custom properties and computed contrast NOT evaluated). 178 findings, none Dunder-specific: design-system-radius 65, font-size 55, font 31, color 18, layout-transition 4, broken-image 3, side-tab 1, bounce-easing 1. It missed all of the real Dunder problems above; a purpose-written scan of accent fills found them. Browser overlay skipped: the extension tab renders unreliably here (screenshot timeouts).

## Persona red flags

Sam (accessibility): white text on yellow (1.4:1) in the regex tester and image editor; input and panel borders at 1.3:1.
Casey (mobile): header rail collides with the theme select at 390px (pre-existing).
