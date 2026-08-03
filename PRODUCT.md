# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The site's own developer/owner, using these tools personally as a daily developer utility belt. The repo is public on GitHub and the site is hosted at its own custom domain (see Evidence on Hand), but this is incidental to hosting/sharing rather than an active effort to attract or onboard outside users — confirmed directly. Design and product decisions should keep optimizing for the owner's own repeat, fast, keyboard-friendly daily usage rather than first-time-visitor onboarding, discovery, or persuasion.

## Product Purpose

"QoL Tools" is a collection of browser-based developer quality-of-life utilities: text formatting/case conversion, a local-first code snippet manager, a to-do list, a CSV viewer with SQL query support, a regex tester, a canvas-based image annotator/editor, a chart builder (Plotly.js), a visual cron expression builder, a multi-timezone comparison tool, a text diff viewer, and a Markdown note-taking tool (unlinked from nav, direct-URL only). Everything runs client-side in the browser; no sign-up is required for any local-only feature. Success means the owner reaches the right tool and completes the task with minimal friction, repeatedly, every day.

## Positioning

Local-first: every tool works fully offline via IndexedDB (`QoLToolsDB`, shared `StorageManager` wrapper). Cloud sync (Snippets, Notes) via Firebase Firestore + Google OAuth is strictly opt-in and additive, never a requirement to use the tool. This differs from typical cloud-only alternatives (e.g. web-based snippet managers or note apps that require an account up front) in that nothing is gated behind sign-up, and no feature depends on a server the owner doesn't control.

## Operating Context

- Static site, no backend, no build step, no bundler, no framework — vanilla HTML/CSS/JS. Hosted on GitHub Pages with a custom domain (CNAME).
- Each tool is a self-contained page following the pattern `tools/{tool}/index.html` + `{tool}-app.js` + `{tool}-styles.css`; shared code (theme system, storage, Firebase sync) lives in `src/`.
- A site-wide theme system spans all tools: 7 selectable palettes (Default, Dracula, Catppuccin, Atom, Nord, Solarized, SynthWave) applied via `data-theme` on `<html>`, with an inline script to prevent a flash of the wrong theme on load.
- Firebase-dependent tools (Snippets, Notes) require the owner's own `src/firebase-config.js`; local-only features work without any configuration.
- A handful of CDN libraries are used per-tool as needed (Highlight.js, Marked, KaTeX, Plotly.js, Firebase SDK) — no dependency is added without a clear per-tool reason.

## Capabilities and Constraints

- No frameworks or bundlers may be introduced; any new tool or feature must work as plain HTML/CSS/JS loaded directly by the browser, consistent with every existing tool.
- Any new or modified UI must render correctly across all 7 existing themes via the established CSS custom-property system in `src/stylesheet.css` (`--bg-*`, `--accent-*`, `--text-*`, `--border-color`, `--shadow-color`, `--syntax-*`, etc.) — no hardcoded colors that lock a component to one theme.
- Local-first is non-negotiable: any feature must be fully usable offline via IndexedDB; Firebase sync (where present) must degrade gracefully when unconfigured or offline.
- Notes and Chart Builder are intentionally unlinked from the main navigation (direct-URL only); this is a deliberate scoping choice, not an oversight.

## Brand Commitments

Product name is "QoL Tools" — confirmed as the correct, current name; the `ords-toolkit.com` custom domain is an incidental hosting choice, not an active rebrand. No formal logo/brand guide exists beyond the site's own theme system and typography.

## Evidence on Hand

`README.md` (tool descriptions, architecture, project structure), `CLAUDE.md` (detailed per-tool implementation notes and shared conventions), and the existing codebase itself are the available evidence — this is a real, shipped project with no separate design spec. No user research, analytics, or testimonials exist (single-owner project); none should be fabricated.

## Product Principles

1. Speed and low-friction for a single repeat user outweighs onboarding polish, persuasion, or first-time-visitor discovery — every design decision should be judged by whether it helps the owner complete the task faster on the hundredth visit, not the first.
2. Local-first and honest about state: no feature may require an account or a server to provide its core value; cloud sync is always opt-in, never load-bearing.
3. One shared visual system (the 7-theme token set) spans every tool — new work extends it rather than forking a one-off palette or hardcoding colors.
4. No backend beyond the owner's own optional Firebase project; every feature must have a fully offline, fully local path.
5. Public repo and custom domain are a hosting/sharing choice, not a product-strategy pivot toward a general audience — do not add onboarding, marketing, or unfamiliar-user scaffolding unless explicitly requested.
