# To-Do Redesign — Built

Status: implemented (Flow Board kanban, Date/Project toggle, completed-tasks archive overlay, project autocomplete on `::p[`). This file is kept as the design record for why it looks the way it does; see git history for the implementation itself.

Approved mockup (static comps, for reference — not the real app):
https://claude.ai/artifact/Nr9SnbsaZizGVeau9ESXnr — boards **C (Flow Board, Date view)** and **C2 (Flow Board, Project view)**.

## Direction: "Flow Board" kanban

- Full-width board, 4 columns by default: **Overdue / Today / Upcoming / Later**, each a vertical lane of cards. This replaces the old single scrolling list (Today hero + stacked quiet sections) — the whole point is using the page's width for parallel columns instead of one stretched column.
- **Date / Project toggle** in the header switches what the columns mean: Project view turns the columns into project names (e.g. "Launch", "Website v2") plus a **"No Project"** column for standalone tasks. Each card keeps a small date tag in Project view so "when" isn't lost just because the grouping switched to "what project."
- **Composer**: a pinned, full-width bar directly under the header, above the columns — not floating at the bottom, not a card taking real estate inside a column. Terminal-style: `>` prompt glyph, monospace, live syntax-colored shorthand tokens as you type (this part is already built in the current code — see below — just needs to be re-skinned into this pinned-bar position).
- **Marking a task done**: a checkbox on the card itself, not drag-to-a-done-column (dragging between columns means "reschedule" or "reassign project," not "complete" — overloading it would be confusing). Checking a card plays the existing spring/overshoot completion animation, then the card fades out of its column and the column's count updates.
- **Completed tasks** live behind a small archive icon in the header (opens a plain list), not as a 5th board column — a "Done" column nobody wants staring at them most of the time would clutter a 4-column board.

## What's already in the live code (this session) vs. what still needs building

Already implemented and working in `tools/todo/` — keep these, they're independent of the layout:
- Stats panel and progress-strip removed entirely (no gamification).
- Composer is already terminal-styled with live syntax-colored shorthand (`::h`, `::p[Name]`, `::daily`, etc. color live inside the input via a transparent-input-over-mirrored-div technique) — reuse this, just reposition per the pinned-bar layout above.
- Completion motion is already a real spring/overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`), applied to the checkbox and to the Today-count number. Reuse as-is for the kanban cards.
- Fixed a real bug: `::today`/`::tomorrow`/`::Xd` shorthand used to build dates via `toISOString()` (UTC), which silently landed on the wrong day for part of every day outside UTC. Now uses a local-date helper (`toLocalDateString`). Don't reintroduce `toISOString()` for deadline math.
- Circular colored "date rail" node per row (day-of-week + day number, colored by urgency) replaced the old small gray deadline chip — this is the same visual idea as the kanban card's date tag; carry it over into the card design rather than reinventing it.

**Needs to be replaced** (built this session, then explicitly rejected by the user — do not redo this approach):
- The current app-shell (`#todoShellRail` vertical nav rail + single-view `#todoMainPane`) — feedback was that it read as "a sidebar bolted onto the old page," not a real redesign, and looked worse than before. Rip this structure out in favor of the Flow Board kanban's column layout and Date/Project toggle described above. The underlying data logic (`getDeadlineGroup`, `getSortFn`, project/subtask nesting) is still reusable — it's the visual/structural shell that needs to change, not the data plumbing.

## Constraints established across the session (don't relitigate)

- No stats, no completion-rate, no streaks — explicitly rejected by the user.
- Keep the site's 8-theme token system (`--accent-primary`, `--syntax-*`, etc.) — the mockups use Canary's literal hex values for clarity, but real implementation must use the CSS custom properties so it adapts across all 8 themes.
- Drag-and-drop reordering and project/subtask nesting are existing functionality — the kanban rebuild must not break them.
