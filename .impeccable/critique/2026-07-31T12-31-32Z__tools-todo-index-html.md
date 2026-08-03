---
target: the to-do page
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-07-31T12-31-32Z
slug: tools-todo-index-html
---
Method: dual-agent (A: ac14fc50a99fb1abc · B: a58b1bdc991b1dc72)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Storage-save failures are swallowed to `console.error` only, no user-facing indication |
| 2 | Match System / Real World | 3/4 | Shorthand/project metaphors read naturally for the target dev audience |
| 3 | User Control and Freedom | 2/4 | Undo exists but is fragile; Escape only visually collapses the composer, doesn't clear it |
| 4 | Consistency and Standards | 2/4 | Native `alert()`/`confirm()` breaks the app's own custom-toast pattern; drag/priority-cycle have no keyboard equivalent |
| 5 | Error Prevention | 2/4 | Reversible-delete pattern undermined by a rapid-delete bug and an unprotected Import/Replace path |
| 6 | Recognition Rather Than Recall | 3/4 | Hint legend shown right when composer opens; still requires recall if tray is never expanded |
| 7 | Flexibility and Efficiency | 3/4 | Shorthand, shortcuts, search, filters, drag/drop — undercut by a rename bug and mouse-only reorder |
| 8 | Aesthetic and Minimalist Design | 3/4 | Consistent flat/glow system; hardcoded priority/recurrence colors leak outside the theme-token system |
| 9 | Error Recovery | 2/4 | Import errors surface via blocking `alert()` with generic text |
| 10 | Help and Documentation | 3/4 | `?` shortcuts overlay is real, task-focused documentation |
| **Total** | | **26/40** | **Acceptable — significant improvements needed before users are happy** |

## Design Specificity Verdict

**LLM assessment**: Not a generic to-do template. The inline shorthand mini-language (`::h`/`::m`/`::l`, `::today`/`::tomorrow`/`::Xd`, `::p[Name]`, `::daily`/`::weekly`/`::every:Xd`), due-date bucket grouping, drag-to-reparent-into-project, recurrence-on-completion, and a documented keyboard layer (`N`, `/`, `F`, `?`, `Esc`, dblclick-rename) all reflect deliberate authorship for a fast, keyboard-leaning daily driver. The problem isn't genericness — it's that execution has seams that specifically undermine repeat use: interactions that work once but misbehave on the 50th/100th repetition. The intent is bespoke; the polish hasn't fully caught up.

**Deterministic scan**: `detect.mjs` returned exactly one finding on `tools/todo/index.html` — a `broken-image` warning at line 66 (`<img id="userAvatar" ... src="">`). Flagged as a likely false positive: the element lives inside `#userInfo`, hidden by default (`display:none`) and only shown once `todo-app.js`'s `updateAuthUI` sets both `avatar.src` and visibility together on sign-in. Residual real risk: if a signed-in Google account has no `photoURL`, the container still becomes visible with an empty `src`, producing a genuine broken-image box — worth a defensive fallback even though the common path is fine. No other structural, contrast, or pattern issues were caught by the detector; it does not overlap with any of the design-review findings below.

**Visual overlays**: Not available this session — no browser automation tool is connected (Claude in Chrome extension not set up), so the live-server injection/overlay step was skipped rather than approximated. No user-visible overlay exists to point to; all findings below come from source reading.

## Overall Impression

The bones are genuinely good — a shorthand-driven composer built for someone who adds tasks dozens of times a day, non-blocking undo instead of blocking confirms, and disciplined progressive disclosure that keeps the resting UI lean. But the *reliability* of the fast paths is what's actually cumbersome: the undo safety net silently fails on back-to-back deletes, the composer can silently carry stale state into your next task, and the one keyboard-forward feature you'll use constantly — double-click rename — visibly glitches every time. None of these are visible in a cold read of the UI; they only surface through the exact repeat-use pattern this tool is supposed to reward. The single biggest opportunity: make the fast paths (batch cleanup, quick-add, rename) behave correctly under rapid repetition, since that's precisely the failure mode a daily user notices and a first glance never catches.

## What's Working

1. **The inline shorthand parser** — typing `Ship v2 ::h ::tomorrow ::p[Launch]` and hitting Enter fully tags a task with zero mouse use. This is the clearest evidence the tool was built for constant daily use, not a first-time visitor.
2. **Non-blocking undo-toast deletion** (5s window) instead of a blocking `confirm()` — the right pattern choice for someone tidying a list quickly, even though its current implementation has a real bug (see Priority Issues).
3. **Consistent progressive disclosure** — composer tray, stats panel, and per-task detail panel are all collapsed-by-default, so the resting UI stays lean despite supporting projects, subtasks, recurrence, and descriptions underneath.

## Priority Issues

**[P0] Rapid sequential deletes silently and permanently destroy earlier items**
**Why it matters**: `deleteTodo()` and `clearCompleted()` both finalize any already-pending delete immediately when a new one comes in, before queuing the new one. Deleting Task A then Task B inside the 5-second undo window — a completely natural "clean up my list" motion — permanently purges Task A the instant B is deleted, with no toast and no way to recover. The one safety net the app visibly offers fails exactly during the workflow (batch cleanup) where a daily user is most likely to lean on it.
**Fix**: Accumulate multiple pending deletes into a queue instead of finalizing-on-conflict, or extend/restart the timer per new delete and show a running count ("3 tasks deleted — Undo").
**Suggested command**: `/impeccable harden`

**[P1] Double-clicking a task to rename it visibly flickers the detail panel open/closed first**
**Why it matters**: The delegated single-click handler for expanding the detail panel also fires on every click that's part of a double-click, toggling the panel open then immediately closed before the rename input replaces the content. Every single rename — one of the two documented core editing gestures — produces a visible glitch.
**Fix**: Exclude rename-eligible elements from the single-click detail-toggle handler, or gate the toggle behind a short debounce that lets a following dblclick cancel it.
**Suggested command**: `/impeccable harden`

**[P1] Composer tray state silently leaks into the next task**
**Why it matters**: Deadline/priority/project/recurrence values set in the tray are only cleared after a successful add. Abandoning an entry (click-away, or Escape — which only visually collapses the tray via CSS, never clears fields) leaves those values populated with no visual cue. The next quick task typed and submitted silently inherits the stale deadline/priority/project.
**Fix**: Reset tray fields whenever the composer collapses without a successful add, not only after `addTodo()` succeeds.
**Suggested command**: `/impeccable harden`

**[P1] Import's "Replace" confirmation inverts standard Cancel semantics and skips the app's own undo pattern**
**Why it matters**: The confirm dialog reads "Replace existing todos? (Cancel to append instead)" — pressing Cancel, the button used specifically to back out, still performs an import. The actually destructive branch (clearing all todos) has zero recovery path, unlike every other delete in the app, which gets a 5-second undo toast. The highest-stakes action in the tool gets the least protection.
**Fix**: Replace the single `confirm()` with an explicit three-way choice ("Replace" / "Append" / "Cancel"), and route the destructive path through the same undo-toast mechanism used elsewhere.
**Suggested command**: `/impeccable clarify`

**[P2] Priority-cycling and task reordering are mouse-only, inconsistent with the app's otherwise keyboard-forward design**
**Why it matters**: The priority badge on each task card is a plain, non-focusable element reachable only by click (a keyboard workaround exists via the detail panel). Drag-and-drop reordering has no keyboard alternative at all. This sits oddly next to an app that documents `N`, `/`, `F`, `?`, `Esc`, and dblclick as first-class interactions.
**Fix**: Make the priority badge focusable with Enter/Space handling; add keyboard-accessible move-up/move-down controls as a drag-and-drop alternative.
**Suggested command**: `/impeccable harden`

## Persona Red Flags

**Alex (Power User)**: Adding via shorthand (`N` → type → Enter) works beautifully. But checking off several stale tasks in quick succession triggers a full list re-render on every click — since the view is date-grouped, a completed task vanishes from its bucket and the list reflows under the cursor mid-streak, risking a misclick or double-toggle. Cleaning up 3 old tasks in a row hits the P0 delete bug directly, destroying the first 1-2 with zero warning right after Alex just watched undo work on a single delete. Trying to reorder tasks by keyboard fails silently — no path exists, forcing a mouse detour mid-flow.

**Sam (Accessibility-Dependent)**: The task-completion checkbox has no accessible name (no `aria-label`, no wrapping `<label>`) — in a list of 15 tasks, a screen reader announces 15 identical "checkbox, not checked" controls with no way to tell which task each belongs to. Priority chips toggle an `.active` class but never set `aria-pressed`. The priority badge isn't in the tab order at all, forcing a detour through the detail panel — which itself lacks `aria-expanded`/`aria-controls`, so its open/closed state isn't announced either. Several inputs set `outline: none` and rely solely on a thin border-color shift for focus visibility. Net effect: Sam can add a task fluently, but completing one means guessing among unlabeled checkboxes, and editing priority requires an extra detour most sighted users never take.

## Minor Observations

- Detector-flagged: `<img id="userAvatar" src="">` (line 66) is hidden until sign-in sets both `src` and visibility together — safe on the common path, but add a fallback avatar/initial for accounts with no `photoURL` so the empty-`src` edge case can't render visibly.
- Priority-chip and recurrence-badge colors are hardcoded hex values rather than the shared theme tokens, so they don't shift when the user swaps palettes — a design-system leak, not a functional bug.
- `alert()` is used for import success/error — jarring native dialogs next to an otherwise custom toast system.
- The project filter-chip row has no cap on count — grows unbounded with project count, no overflow handling.
- Inline-rename swaps the entire task-content block, so the deadline/description/recurrence meta row disappears and reappears around every rename — a small but noticeable flicker.

## Questions to Consider

- If the shorthand syntax is genuinely the fast path, why is its legend only shown once the tray is already expanded — could the composer placeholder rotate through examples instead?
- The app clearly decided blocking `confirm()`/`alert()` dialogs are wrong for this product (hence the undo toast) — so why does the single most destructive action (Import → Replace) still route through exactly that pattern, with inverted Cancel semantics on top?
- Given the list currently re-renders in full on every toggle/delete/edit, would a lighter per-item DOM patch change how "cumbersome" the day-100 experience feels, versus how it reads in a cold pass over the code?
