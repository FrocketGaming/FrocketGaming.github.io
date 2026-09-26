# Flow: module contracts

Vanilla JS, classic `<script>` tags, no build. Load order (see `index.html`):
`flow-static.js` -> `flow-core.js` -> `flow-canvas.js` -> `flow-nodes.js` -> `flow-edges.js` ->
`flow-interact.js` -> `flow-panel.js` -> `flow-io.js` -> `flow-snippets.js` -> `flow-app.js`.
Everything hangs off `window.Flow` (plus the standalone `window.FlowStatic`). Each piece
module exposes `init()`; `flow-app.js` calls them in that order and then loads a document.

| File | Piece | Owns |
|---|---|---|
| `flow-static.js` | shared | Pure geometry (anchors, auto sides, connector paths, arrowheads, label placement), markdown to safe HTML, static SVG renderer. No editor state. Also loaded by `tools/snippets` for the `.canvas` preview. |
| `flow-core.js` | core | The document, selection, view, tool, undo/redo, events, render scheduler, pointer dispatch. |
| `flow-canvas.js` | P1 | Viewport, pan/zoom (wheel, pinch, space/middle drag, hand tool), grid, toolbar, zoom + undo footer, hint line, toasts, empty state, fit/ensureVisible. |
| `flow-nodes.js` | P2 | DOM for text/link/file/group nodes, markdown display, inline editors, resize handles, selection frame, `createCard` / `createGroup`. |
| `flow-edges.js` | P3 | SVG connectors + labels, hover ports, drag-to-connect (or drop on empty space for a new card), endpoint reconnect, label editor, auto-side refresh. |
| `flow-interact.js` | P4 | Select/marquee/multi-drag with alignment guides + grid snap, creation tools, double-click, keyboard map (`SHORTCUTS`), clipboard, duplicate, group/ungroup, align/distribute, `addConnectedCard` (Ctrl+Arrow), `navigate` (Alt+Arrow). |
| `flow-panel.js` | P2/P3 UI | Left properties panel: colour (6 presets + custom), card shape, arrowheads, route, line style, arrange, actions. Stateless: reads the selection, writes through `core.change`. |
| `flow-io.js` | P5 | `parse` / `serialize`, import (file picker, drag-drop, paste of files), export `.canvas`; the Export image dialog (PNG/SVG, scale 1x/2x/3x, whole chart by default or "Only selected", background on/off), copy PNG; the portable SVG text layout. |
| `flow-snippets.js` | P6 | `Flow.store`: per-chart localStorage working copies, cross-tab sync, boot restore. `Flow.snippets`: save to / open from the IndexedDB `snippets` store (versions like Snippets), conflict + delete detection, Open dialog (incl. Unsaved work), Save-as-new, inline new category, Firebase push when signed in. |
| `flow-app.js` | glue | Chart identity state (title, snippetId/draftId, saved content + updatedAt, conflict/detached flags), the debounced autosave timer (writes via `Flow.store.write`), status line, menu, dialogs, shortcuts sheet. |

## The document (never rebuild it)

`Flow.core.doc` IS the JSON Canvas 1.0 object that was loaded, mutated in place.
Nodes and edges are the original objects, so unknown fields and key order survive
export untouched. Rules for every module:

- Mutate fields on existing objects; never replace a node/edge with a fresh object
  (except `core.undo/redo`, which restores whole snapshots).
- New nodes: `{ id, type, text|url|file|label, x, y, width, height, color? }` in that key
  order (Obsidian's). Create them with `Flow.nodes.createCard/createGroup` or `core.addNode`.
- New edges: `{ id, fromNode, fromSide, toNode, toSide }` via `core.addEdge(edge, { auto })`.
- Positions and sizes are integers (`Math.round`).
- Only write a field when the user asked for it. Clearing a value deletes the key
  (e.g. `delete node.color`), it doesn't write `null`.
- Extensions beyond the spec live in `styleAttributes` (Advanced Canvas compatible):
  nodes `styleAttributes.shape` = `pill|diamond|circle`; edges `styleAttributes.pathfindingMethod`
  = `direct|square` and `styleAttributes.path` = `dashed|dotted`. Other apps ignore them; we keep them.
- Step labels: a text card's `styleAttributes.step` (free text, max 32 chars; presets `sql python api
  email schedule manual` in `FlowStatic.STEP_TYPES`, each with a colour preset; a custom label takes the
  card's colour) is drawn as a chip: top-left on rects, centred over the text on pills, diamonds and
  circles. `FlowStatic.stepChip` places it and `cardPadding` gives the text padding with room for it;
  the editor CSS, the export (`flow-io.js` `cardContent`) and the Snippets preview all use those numbers.
  Set from the panel's Step section; a card whose text would no longer fit grows to the next grid line
  in the same undo step.
- `core.exportDoc()` is what gets written: it omits a top-level `nodes`/`edges` array
  that was absent in the source and is still empty. It copies keys with `Object.defineProperty`
  so a literal `"__proto__"` key survives the round-trip.
- Duplicate node ids (invalid, but real files have them) are never rewritten. `flow-nodes.js`
  keys card elements by occurrence (`id`, then `id + "\u0000" + n`, in `data-node-key`), so every
  card is drawn; pressing on one of them makes it the object `core.getNode(id)` returns until the
  next `reindex`, so select/drag/edit act on the card that was clicked.
- Display clamps, never data clamps: `FlowStatic`'s number formatter clamps SVG numbers to ±1e9
  (a 1e300 coordinate no longer produces "bad path d"); image export leaves out cards beyond ±1e7
  and says so in the toast.
- File values are hostile until proven otherwise (security rules for every module):
  - Card markdown: ONLY through `FlowStatic.renderMarkdown` (marked, then `sanitize`). `sanitize` is
    DOMPurify 3.4.16, vendored at `src/vendor/purify.min.js` (sha256 base64
    `LJCptG1kY/JgOKKbaG6CvJHeAf2snVIp58/js2ATTqI=`, loaded before `flow-static.js` by Flow AND Snippets)
    with a strict config: markdown tags only (no svg/math/form/input/button/iframe/object/embed/style/
    template/details), attributes `href src alt title class colspan rowspan align start` only
    (style/id/name/form/formaction/on* forbidden, SANITIZE_DOM + SANITIZE_NAMED_PROPS on: no overlays,
    no url() beacons, no DOM clobbering); `href` only http/https/mailto or an unambiguous relative URL,
    decided by `new URL()` (`FlowStatic.safeHref`); links get `target=_blank rel="noopener noreferrer"`;
    `img src` only inline `data:image/(png|gif|jpeg|webp);base64` (no network request from card
    content; others render as `img.md-img-blocked` with their alt text). Task checkboxes become
    `span.md-task` glyphs. Without DOMPurify, card HTML is shown as escaped text, never raw.
  - Field values can be any JSON (objects, arrays): read display text through `FlowStatic.str(v)`
    (strings and finite numbers only; never an implicit `String()` of an object, which can throw).
    `escapeHtml` uses it. The node renderer wraps each node (`safeUpdate`) so one bad node never
    stops the others; `toSVG` does the same for card text.
  - Colours: display a `color` ONLY through `FlowStatic.safeColor(c)` / `hasColor(c)` (or
    `varPaint().color` / `resolvedPaint().color`, which use it). Accepted: `"1".."6"`, `#hex` with
    3/4/6/8 digits, or a plain CSS colour (named, rgb(), hsl(), hwb()) that `CSS.supports` accepts,
    re-serialised by the browser to `#rrggbb`/`rgba()`. Anything else stays in the data but is
    drawn as no colour. Never interpolate a raw colour string.
  - Any doc-derived string that goes into an HTML/SVG string (ids, labels, urls, types...) goes
    through `FlowStatic.escapeHtml`, attributes included (`data-node-id="${S.escapeHtml(id)}"`).
    Prefer `textContent` / `dataset` / `style.setProperty`.
  - Coordinates may be strings (`"x": "100"`): geometry reads them via `Number()` (FlowStatic
    `center/anchor/bbox`, `toSVG` draws numeric copies); drag/nudge/resize/align/distribute do the
    maths on numbers and write a number back only when the value actually changes.
- Card auto-height (inline editor): opening an editor never changes the document (open +
  Escape records nothing). After a real edit the card grows to the 20px grid only when the text
  overflows, and shrinks back as text is removed, never below the height it had when editing began.
- `core.autoEdges` (Set of edge ids) is runtime-only (persisted in autosave, not in the file):
  those edges re-pick their sides when their cards move (`Flow.edges.refreshAutoSides`).
  Every edge is auto by default: all UI-created edges (port drag, connector tool, drop on empty
  space, Ctrl+Arrow, paste) and every edge of a chart opened from a file or snippet (P3 adds them
  on the `load` event when `source` is `file`/`snippet`). An edge is pinned (removed from the set)
  when the user drops a new connector or a reconnected end on a side dot, or holds Alt while dropping. Loading never
  rewrites sides; they change only when one of the edge's cards moves, and only sides that are
  stored: an edge the file saved without `fromSide`/`toSide` keeps them omitted (render-time
  routing picks them); a side is written for it only by a user action (reconnect / pin). Pins are deliberately not
  written into the .canvas (keeps the file plain JSON Canvas), so a pin survives reloads via
  autosave but not a save/reopen through Snippets.

### Connector routing (P3, `flow-static.js`)

JSON Canvas stores only `fromSide`/`toSide`; the drawn route is derived at render time from the
layout, identically in the editor and in `FlowStatic.toSVG` (export + Snippets preview):
- `edgeGeometry(edge, byId, { nodes, cache })` - with `nodes` the connector avoids obstacles: other
  cards (20px clearance) and groups it doesn't belong to (a group holding one end is crossed once,
  square to that card; a group holding both ends is never left). The plain path (bezier for
  `curve`, elbow for `square`) is used when clear; otherwise an orthogonal A* route over a sparse
  grid built from nearby obstacle edges (bend cost, mild penalty for hugging an obstacle) is drawn
  with rounded corners (big radius for curve style). Returns `d`, tips/dirs, `poly` (sampled path),
  `len`, `at(t)`, `dirAt(t)`, `mid`, `labelT`, `routed`. `cache` (a Map) keeps detours while they
  stay valid, so drags don't re-run the router for every connector.
- `layoutEdges(edges, byId, { nodes, cache, arrowSize })` - geometry for all edges at once; this is
  what the editor and `toSVG` draw. Connectors sharing a side are spread along it, ordered by
  where their other end is. On rects they spread along the side; on diamonds along the two faces
  next to the vertex; on circles and pill ends around the outline (`sidePoint`). Mixed in/out
  sides get extra spacing, so no two ends share a point.
  Track separation is global: every orthogonal run of every routed connector takes part. Long
  end runs are split into a 16px stub plus the rest, so the rest can move (leaving a small jog).
  Clusters are overlapping runs within 11px of each other. They are spread 5-12px apart in
  alternating vertical/horizontal passes that repeat until clean; an immovable end run keeps its
  line. A shift that would run into a card is skipped.
  `edgeGeometry` is the single-edge version, with no spreading or track separation. The returned
  Map has `.lines` (every connector's polyline), which is used for label avoidance.
- Clearance adapts: routes try 20px clearance, then 10, then 4, rather than falling back through
  a card. The blocked check tests the connector's own cards by shape (diamond, circle), not their
  bounding box.
- Self-loops (`fromNode === toNode`) leave and return on two neighbouring sides; a stored pair of
  equal sides renders as side plus the next side clockwise.
- `bestSides(a, b, nodes, route, current, used)` - the side pair with the cheapest drawn path
  (length + bends, penalising paths that double back). `used` = `{a|b: {side: {in, out}}}`:
  sharing a side with connectors going the same way costs a little (they get spread), a bit more
  on a diamond or circle; sharing with connectors going the other way costs a lot; an end buried
  under another card costs the most. `current` wins unless another pair is better by
  max(40, 12%) (hysteresis). `refreshAutoSides` uses it. It skips edges whose two cards overlap,
  and also re-picks edges whose end a moved card now covers.
- `labelPoint(geo, nodes, {w, h}, placed, lines)` scores candidates and picks the cleanest.
  Candidates, best first: on the line (only with clear line on both sides), then beside it, then
  further out. Penalties are cards 1000, placed labels 800, and 60 for each other connector
  (`lines`) the label box would cover. It appends its own box to `placed`.
- Label text rule, shared with export: `LABEL_MAX_EM` (18) and `labelLines(text, font)`.
  Newlines are kept and each line is ellipsised. The editor pill uses the same 18em CSS limit and
  shows the full text as a `title` tooltip when a line is cut off.
- Zoom legibility (editor only): line width, arrowhead size (`10/zoom`, 11..22 world px) and label
  text (at least ~11.5 screen px) grow as you zoom out. The edge renderer re-runs on zoom
  changes. The static SVG keeps its fixed 1:1 sizes.

Colours: `"1".."6"` map to `--hue-red|orange|yellow|green|cyan|purple` (defined per theme in
`src/stylesheet.css`); `#rrggbb` is used as-is. Always go through `FlowStatic.varPaint().color()`
(live) or `FlowStatic.resolvedPaint()` (export) rather than writing colours by hand.

## Core API (`Flow.core`)

State: `doc`, `selection = { nodes: Set, edges: Set }`, `view = { x, y, zoom }`
(screen = world * zoom + (x, y), relative to the viewport), `tool`, `toolLocked`,
`editing` (`{ kind, id }` while an inline editor is open), `prefs = { snap, grid }`, `GRID = 20`.

Reading: `nodes()`, `edges()`, `getNode(id)`, `getEdge(id)`, `nodeIndex()`,
`groupChildren(group)`, `expandWithGroupContents(ids)`, `nodeAt(worldPoint, { exclude, cardsOnly })`,
`selectedNodes()`, `selectedEdges()`, `hasSelection()`.

Changing the document (always one of these, so undo and autosave work):
- `core.change(label, fn)` - one undoable step; `fn` mutates `core.doc`.
- `core.begin(label)` ... mutate ... `core.commit()` (or `core.cancel()` to roll back) for drags
  and editors. Nested begins fold into the outer one. `commit` records undo only if the JSON changed.
- `addNode(node, { index })`, `addEdge(edge, { auto })`, `removeItems(nodeIds, edgeIds)`
  (removing nodes removes their edges) - call inside a transaction.
- After mutating inside a drag, call `core.invalidate('nodes', ids)` to redraw.

Other: `load(doc, { keepHistory, autoEdges })`, `undo()`, `redo()`, `select(nodeIds, edgeIds, { add })`,
`toggleSelect(kind, id)`, `clearSelection()`, `setTool(tool, locked)`, `setView({x,y,zoom})`,
`screenToWorld(clientX, clientY)`, `worldToScreen(x, y)`, `viewCenter()`, `snapToGrid(v)`,
`newId()` (16 hex chars), `toast(msg, kind)`, `setPref(key, value)`.

Events (`core.on(name, fn)`): `change` (after every committed step, undo, redo), `load`,
`selection`, `view`, `tool`, `history`, `editing`, `prefs`, `toast`.

Rendering: `core.invalidate(kind, ids)` with kind `all|structure|nodes|edges|selection|view`
schedules one rAF. Modules register `core.addRenderer(name, fn(dirty), order)`; `dirty` has
`all, structure, edges, selection, view` booleans and `nodes` (Set of ids). Orders in use:
view -100, nodes 0, edges 10, selection frame 50, edge UI 60, ports 70. `core.renderNow()` flushes.

Pointer gestures: the viewport's `pointerdown` goes to `core.dispatchPointerDown`, which runs
handlers registered with `core.addPointerHandler(priority, fn(e, hit, worldPoint))` from high
to low until one returns true. `hit` comes from `core.hitTest(target)` and data attributes:
`data-port` (+`data-node-id`), `data-handle`, `data-edge-end`, `data-edge-id` (+`data-edge-label`),
`data-node-id` (+`data-group-label`), `data-ui`. Priorities in use: 2000 finish editors (never claims),
1000 pan, 950 ports/edge ends, 940 grab a connector near its end, 900 resize handles, 800 connector tool, 600 creation tools,
500 select/marquee/move. Use `core.trackDrag(e, { move, up, cancel })` for the drag itself
(Escape calls `cancel`).

## Cross-module calls (the only ones)

- `Flow.canvas`: `init, zoomAt, zoomBy, zoomTo, animateTo, fit(nodes?, {instant, maxZoom}), ensureVisible(rect), setHint(html|null), isTyping(e)`
- `Flow.nodes`: `init, createCard(point, opts), createGroup(rect, label), startEdit(id, { isNew, ownTxn, select }), stopEdit(), isEditing(), elementFor(id), cssColor(color), DEFAULT_W, DEFAULT_H`
  - `ownTxn: true` means the caller already did `core.begin()`; the editor's close commits it,
    so "create + type" is one undo step. `isNew: true` deletes the card if it's left empty.
- `Flow.edges`: `init, geometry(edge), pickSides(a, b, route, current?, edgeId?), refreshAutoSides(nodeIds), startConnect(e, nodeId, side|null, opts), editLabel(id), stopLabelEdit(), isEditingLabel(), hidePorts()`
  - Hover ports: a drag from a port (dot or its halo) connects; only a click right on the visible
    dot adds a connected card, a click on the halo selects the edge/label/card underneath. A card
    made by dropping on empty space is nudged to the nearest spot clear of other cards. A dot
    click places the new card along the port's axis, stepping past cards in the way; only
    earlier children on that same side fan out sideways.
  - `geometry(edge)` returns what was last drawn (spread + tracks). It falls back to a single-edge
    computation before the first render.
  - Reconnect: drag either end of any connector onto another card. A press on the line within
    40 screen px of an end (at most 35% of its length, so a short connector's middle still just
    selects) grabs that end directly (pointer handler 940, grab cursor there); a click without a
    4px move selects the connector. The endpoint handles of a selected connector do the same.
    Dropping on empty space changes nothing; Alt pins the sides.
  - Drop targets (`snapTarget`): while a connector or an end is dragged, the card under it shows its
    four dots (`.flow-drop-ports`, display only). Within 18 screen px of a dot the end snaps to that
    side and the edge is pinned; on the card body (or up to 18px off its edge) Flow picks the side.
    Cards beat groups: a group is a target only near its frame, so a drop that just misses a card
    inside a group never lands on the group. Groups are also sources: their hover dots show when
    the pointer is on the frame or title tab (the only parts of a group that take pointer events),
    and a drag from a group never turns into a self-loop, so it can end on a card inside the group.
    A drag started from a dot keeps that side (`pickSides`
    with `fixed`, `FlowStatic.bestSides(..., fixed)`); on a dot drop the unmoved end keeps its side.
  - Dragging a connector back onto its own card, after leaving it or moving 24px or more, makes a
    self-loop on a neighbouring side. A small wiggle that stays on the card does nothing.
- `Flow.interact`: `init, finishEditing, addConnectedCard(id, 'up'|'down'|'left'|'right'), navigate(dir), nudge, duplicate, deleteSelection, groupSelection, ungroupSelection, reorder(toFront), align(how), distribute(axis), cloneItems, pasteText(text), SHORTCUTS`
- `Flow.panel`: `init, render`
- `Flow.io`: `init, parse(text), serialize(doc?), importFile(file), importText(text, title), chooseImport, exportCanvas, openExport('png'|'svg'), exportSVG(opts?), exportPNG(opts?), copyPNG(opts?), renderPNG(opts), buildSVG(opts), download`
  - `exportPNG()` / `exportSVG()` with no argument open the Export image dialog (menu items and
    Ctrl+Shift+E). `{ direct: true, scope: 'all'|'selection', scale: 1|2|3, background, theme }`
    exports straight away; `theme` = `'current'` (page theme) | `'light'` | `'dark'` (fixed palettes
    in `EXPORT_THEMES`, passed to `FlowStatic.resolvedPaint(el, vars)`). The dialog remembers format,
    scale, background and colours in `localStorage['flow-export']`. `copyPNG()` copies the whole
    chart at 2x with the remembered colours/background.
  - Group and edge labels are single-line and ellipsised in exports exactly like the editor
    (`FlowStatic.fitLabel`: group label to the group width at 600 16px, edge label pill max 18em at 13px).
  - `buildSVG(opts)` is async -> `{ svg, width, height, skipped, fontsEmbedded }`. It calls
    `FlowStatic.toSVG` with a `cardContent` hook, so card text is `<text>/<tspan>` (markdown blocks:
    headings, bold/italic/code/links, bullets/numbers/tasks, quotes, code blocks, tables as rows,
    wrapped with canvas metrics of the editor's fonts) instead of `<foreignObject>`. Raleway /
    JetBrains Mono are embedded as `@font-face` data URLs, subset through the Google Fonts
    `text=` parameter to the characters and faces actually used; offline, the font stack
    (`Raleway, 'Segoe UI', system-ui, …`) is used. The PNG rasterises that same SVG.
  - `FlowStatic.toSVG(doc, opts)` extra opts: `cardContent(node, innerBox, shape)` -> SVG markup
    (replaces the foreignObject and the HTML `<style>`), `defs` (markup inserted after `<svg>`).
    Without them it renders as before (Snippets preview).
- `Flow.snippets`: `init, quickSave, saveDialog({asNew}), saveAsDialog, save({id,name,type,description}), openDialog, refreshOpenDialog, openSnippet(id, opts), openSlot(key), checkLinked, listCanvas`
- `Flow.store`: `write, read(key), resolve(key), list, unsavedElsewhere, isUnsaved(rec), keyFor(state), currentKey, snippetKey(id), newDraftId, move(oldKey), leave, stashCurrent(suffix), remove(key), boot`
- `Flow.app`: `title(), link(), state(), setState(patch), openDocument(doc, opts) -> note, setLink(patch), newChart(), refreshStatus(), isDirty(), openDialog(id), closeDialog(id), showShortcuts(), autosaveNow(), autosavePending()`

## Persistence

- Working copies (`Flow.store`, flow-snippets.js): one localStorage slot per chart, so tabs never
  overwrite each other. `flow-chart:s:<snippetId>` for a chart linked to a snippet, `flow-chart:d:<draftId>`
  for a draft. A slot holds canvas text, title, snippetId/draftId, `savedContent` + `savedUpdatedAt`
  (the snippet version it is based on), category, view, autoEdges, `savedAt`. Written synchronously
  (250 ms debounce + beforeunload/hidden), so a reload never loses work. `sessionStorage['flow-tab-slot']`
  remembers which slot this tab shows. The old single `flow-autosave-v1` key is migrated once.
- Switching charts never deletes: the old slot stays and is listed under Open > "Unsaved work" (non-empty
  drafts and snippet slots whose canvas != savedContent); the Open button shows a count badge. Empty
  drafts are dropped when left. Discard is two clicks on the row's x. Clean snippet slots (kept only for
  their view) are pruned to 20.
- Identity changes: first save and "snippet deleted" call `store.move(oldKey)`, which leaves `{ movedTo }`
  in the old slot so other tabs on it follow. Save as new (`setLink({ fork: true })`) moves only the saving
  tab; the original slot and the tabs on it are left alone.
- Cross-tab merge (Excalidraw-style): beside the pure JSON Canvas `canvas`, a slot keeps `meta` =
  `{ 'n:<id>' | 'e:<id>' | 'on' | 'oe' | 'root' | 'title': [version, nonce, deleted, time, (order ids)] }`.
  Each tab keeps a shadow of what it last synced; `stamp()` turns local differences into new versions
  (a removed element becomes a tombstone, deleted = 1; absence never means deletion). `reconcile()` takes
  the higher [version, nonce] per key; order = the winning order register's id list, then any other live
  ids sorted; edges to cards deleted in the merge are dropped (edges already dangling in the file are kept).
  Element identity is id + occurrence number (`keysOf`), so duplicate ids never collapse, and root/element
  keys are written with defineProperty so a literal "__proto__" key survives. It is commutative, so all tabs converge. Remote results
  are applied in place (object identity kept, so an open card editor survives) and the undo/redo stacks
  and an open transaction are rebased with the same delta: Ctrl+Z / Esc only undo this tab's own edits.
  Every write re-reads the slot and merges first; every `storage` event is merged and, if this tab has
  something the writer lacked, re-published. Tombstones expire after 30 days.
  Stress test: scratchpad/p6-r2/stress.mjs (2-3 tabs, random add/edit/move/delete/connect/undo, 20-200 ms
  gaps, concurrent bursts; asserts identical docs in every tab, slot == docs, no add lost, no dangling edge).
- Saved charts: IndexedDB `QoLToolsDB.snippets`, `extension: "canvas"`, `content` = JSON Canvas text;
  re-saves write a `snippetVersions` snapshot first (same shape and 30-version pruning as Snippets).
  `FirebaseSync.pushSnippet/pushSnippetVersion` only when signed in. Flow and Snippets ping each other on
  `BroadcastChannel('qol-snippets')` after writes; both also re-check on focus/visibilitychange.
- `snippets.checkLinked()` compares the record with `savedUpdatedAt`: deleted -> the chart becomes a draft
  ("Draft · deleted from Snippets"); saved elsewhere + no local edits -> reload; + local edits -> status
  "Changed elsewhere" and Ctrl+S opens a chooser (save mine as new / overwrite, theirs stays in History /
  load theirs, mine kept as a draft). No confirm()/prompt() anywhere.
- `?snippet=<id>` opens that snippet; unsaved edits to it in this browser are restored, never replaced.
  Only `extension === "canvas"` is ever linked or written back; another snippet whose JSON is a non-empty
  chart opens as a new unlinked draft, anything else is refused with a toast. Invalid JSON in a linked
  snippet -> status "Snippet content invalid", the last good local copy stays (Ctrl+S replaces the broken
  text, which stays in History). A category rename in Snippets is picked up even though updatedAt
  doesn't change. `updatedAt` may be an ISO string or a number: always compare through `ts()`.
- Save as new: Ctrl+Alt+S (Ctrl+Shift+S is Export .canvas), the clone half of the split Save button,
  or the menu item.
- Categories: if `snippetTypes` is empty, Flow seeds Snippets' 8 defaults (same ids) before adding one.
- Prefs: `localStorage['flow-prefs']` (`snap`, `grid`).

## Asset versions

`index.html` loads every `flow-*.js` / `flow-styles.css` with `?v=<hash>` (one md5 of all of them,
line endings normalised), as does the Snippets page's `flow-static.js` tag. `version-assets.mjs`
writes it; `.github/workflows/flow-asset-versions.yml` runs it on pushes to `main` that touch Flow and
commits the result as a bot (so `git pull` after pushing a Flow change). Pages caches CSS/JS for
4 hours but HTML for 10 minutes; without this a new page could run with stale scripts. Adding a
`flow-*.js` file needs only its `<script>` tag; the script picks it up.

## Checks

Harness scripts live outside the repo (scratchpad). The invariants worth re-running after any change:
import `sample.canvas` -> export -> deep-equal (and exact key order); a file with unknown fields on
the root, nodes and edges round-trips; no console errors while building a chart; all 8 themes render.
