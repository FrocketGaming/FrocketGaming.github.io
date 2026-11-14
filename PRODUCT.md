# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The site's own developer/owner, using these tools personally as a daily developer utility belt. The repo is public on GitHub and the site is hosted at its own custom domain (see Evidence on Hand), but this is incidental to hosting/sharing rather than an active effort to attract or onboard outside users — confirmed directly. Design and product decisions should keep optimizing for the owner's own repeat, fast, keyboard-friendly daily usage rather than first-time-visitor onboarding, discovery, or persuasion.

## Product Purpose

"QoL Tools" is a collection of browser-based developer quality-of-life utilities: text formatting/case conversion, a local-first code snippet manager, a to-do list, a regex tester, a canvas-based image annotator/editor, a visual cron expression builder, and a text diff viewer. Everything runs client-side in the browser; no sign-up is required for any local-only feature. Success means the owner reaches the right tool and completes the task with minimal friction, repeatedly, every day.

The site also hosts Snake Charmer, a bi-weekly Python newsletter (package reviews, new repos, stdlib updates, and long-form deep dives) at `/newsletter/`. It is the one part of the site written to be read by other people. Issues are individual Markdown files in `newsletter/issues/`; the archive manifest `newsletter/issues.json` is generated from them by a small script that a GitHub Action runs, so the `.md` is the only file to edit. Issues render in the browser with no build step for the site itself; there is no email delivery, and RSS/Atom is deferred. A link to it sits at the far left of every page header, separate from the tool nav.

## Positioning

Local-first: every tool works fully offline via IndexedDB (`QoLToolsDB` for Snippets/To-Do, a dedicated store for Phase Board). Cloud sync (Snippets, Phase Board) via Firebase Firestore + Google OAuth is strictly opt-in and additive, never a requirement to use the tool; Phase Board opens from a local copy and merges local work into the cloud on sign-in. This differs from typical cloud-only alternatives (e.g. web-based snippet managers or note apps that require an account up front) in that nothing is gated behind sign-up, and no feature depends on a server the owner doesn't control.

## Operating Context

- Static site, no backend, no build step, no bundler, no framework — vanilla HTML/CSS/JS. Hosted on GitHub Pages with a custom domain (CNAME).
- Each tool is a self-contained page following the pattern `tools/{tool}/index.html` + `{tool}-app.js` + `{tool}-styles.css`; shared code (theme system, storage, Firebase sync) lives in `src/`.
- A site-wide theme system spans all tools: 8 selectable palettes (Default, Dracula, Catppuccin, Atom, Nord, Solarized, SynthWave, Canary) applied via `data-theme` on `<html>`, with an inline script to prevent a flash of the wrong theme on load.
- Firebase-dependent tools (Snippets, Phase Board) require the owner's own `src/firebase-config.js` for sync; both work locally without any configuration.
- A handful of CDN libraries are used per-tool as needed (Highlight.js, Marked, KaTeX, Firebase SDK) — no dependency is added without a clear per-tool reason.

## Capabilities and Constraints

- No frameworks or bundlers may be introduced; any new tool or feature must work as plain HTML/CSS/JS loaded directly by the browser, consistent with every existing tool.
- Any new or modified UI must render correctly across all 8 existing themes via the established CSS custom-property system in `src/stylesheet.css` (`--bg-*`, `--accent-*`, `--text-*`, `--border-color`, `--shadow-color`, `--syntax-*`, etc.) — no hardcoded colors that lock a component to one theme.
- Local-first is non-negotiable: any feature must be fully usable offline via IndexedDB; Firebase sync (where present) must degrade gracefully when unconfigured or offline. The Firebase SDKs load on demand, so a local-only visit makes no Firebase requests.
- The command palette is the keyboard-first route to tools, actions (new task/snippet/project) and local records; deep links (`?task=`, `?snippet=`, `?project=`) open a specific record.
- `/backup/` exports every local store and UI setting to one JSON file and restores it. It covers snippets, tasks, Phase Board projects and flows.
- The newsletter's issues are public on purpose (GitHub Pages is public and nothing internal is exposed), and it sends no email. Its colors must still come from theme tokens, so switching the theme recolors it live; every page defaults to the Canary theme when a visitor has no saved theme (`src/theme-manager.js`), and a page can override that with `data-default-theme`.

## Brand Commitments

The newsletter has its own name, Snake Charmer, which lives in the page template rather than in each issue. Product name is "QoL Tools" — confirmed as the correct, current name; the `ords-toolkit.com` custom domain is an incidental hosting choice, not an active rebrand. No formal logo/brand guide exists beyond the site's own theme system and typography.

## Evidence on Hand

`README.md` (tool descriptions, architecture, project structure), `CLAUDE.md` (detailed per-tool implementation notes and shared conventions), and the existing codebase itself are the available evidence — this is a real, shipped project with no separate design spec. No user research, analytics, or testimonials exist (single-owner project); none should be fabricated.

## Product Principles

1. Speed and low-friction for a single repeat user outweighs onboarding polish, persuasion, or first-time-visitor discovery — every design decision should be judged by whether it helps the owner complete the task faster on the hundredth visit, not the first.
2. Local-first and honest about state: no feature may require an account or a server to provide its core value; cloud sync is always opt-in, never load-bearing.
3. One shared visual system (the 7-theme token set) spans every tool — new work extends it rather than forking a one-off palette or hardcoding colors.
4. No backend beyond the owner's own optional Firebase project; every feature must have a fully offline, fully local path.
5. Public repo and custom domain are a hosting/sharing choice, not a product-strategy pivot toward a general audience — do not add onboarding, marketing, or unfamiliar-user scaffolding unless explicitly requested. The `/newsletter/` page is the explicitly requested exception: a reading surface for other people, not onboarding, and it does not change how the tools themselves are designed.
