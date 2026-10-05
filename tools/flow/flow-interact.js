/**
 * P4 - Editing flow: selection, marquee, multi-drag with alignment guides and
 * grid snapping, creation tools, double-click, keyboard shortcuts, clipboard,
 * duplicate, keyboard-driven chart building (Ctrl+Arrow / Alt+Arrow), align/distribute.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);

    const interact = Flow.interact = {};
    let overlay, marqueeEl;
    core.lastPointer = null;

    interact.init = function () {
        overlay = $('flowOverlay');
        marqueeEl = $('flowMarquee');
        const vp = core.viewportEl;

        vp.addEventListener('pointermove', (e) => { core.lastPointer = core.screenToWorld(e.clientX, e.clientY); });
        vp.addEventListener('pointerleave', () => { core.lastPointer = null; });
        vp.addEventListener('dblclick', onDoubleClick);

        // Finish any inline editor when the user clicks elsewhere on the canvas.
        core.addPointerHandler(2000, (e) => {
            if (core.editing) finishEditing();
            return false;
        });
        core.addPointerHandler(600, onCreateTool);
        core.addPointerHandler(500, onSelectTool);

        window.addEventListener('keydown', onKeyDown);
        document.addEventListener('copy', (e) => onClipboard(e, 'copy'));
        document.addEventListener('cut', (e) => onClipboard(e, 'cut'));
        document.addEventListener('paste', onPaste);
    };

    function finishEditing() {
        if (Flow.nodes.isEditing()) Flow.nodes.stopEdit();
        if (Flow.edges.isEditingLabel()) Flow.edges.stopLabelEdit();
    }
    interact.finishEditing = finishEditing;

    function dialogOpen() {
        return !!document.querySelector('.flow-dialog-backdrop:not([hidden])');
    }

    // ── Creation tools ──────────────────────────────────────────────────────

    function afterCreate() {
        if (!core.toolLocked) core.setTool('select');
    }

    function onCreateTool(e, hit, p) {
        if (e.button !== 0) return false;
        const tool = core.tool;
        if (tool !== 'card' && tool !== 'group' && tool !== 'link') return false;
        if (hit.kind === 'port' || hit.kind === 'handle') return false;
        const start = p;
        const box = document.createElement('div');
        box.className = 'flow-draft-box flow-draft-' + tool;
        $('flowSelUI').appendChild(box);
        let rect = null;
        core.trackDrag(e, {
            move: (ev, q) => {
                const x1 = core.snapToGrid(Math.min(start.x, q.x)), y1 = core.snapToGrid(Math.min(start.y, q.y));
                const x2 = core.snapToGrid(Math.max(start.x, q.x)), y2 = core.snapToGrid(Math.max(start.y, q.y));
                rect = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
                Object.assign(box.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' });
            },
            up: () => {
                box.remove();
                const dragged = rect && rect.width >= 40 && rect.height >= 30;
                if (tool === 'group') {
                    const r = dragged ? rect : { x: core.snapToGrid(start.x - 200), y: core.snapToGrid(start.y - 130), width: 400, height: 260 };
                    core.begin('Add group');
                    const g = Flow.nodes.createGroup(r);
                    core.reindex();
                    core.invalidate('all');
                    afterCreate();
                    Flow.nodes.startEdit(g.id, { ownTxn: true });
                    return;
                }
                core.begin(tool === 'link' ? 'Add link' : 'Add card');
                const opts = tool === 'link' ? { type: 'link', width: 280, height: 80 } : {};
                const n = dragged
                    ? Flow.nodes.createCard({ x: rect.x, y: rect.y }, { ...opts, center: false, width: rect.width, height: rect.height })
                    : Flow.nodes.createCard(start, opts);
                core.reindex();
                core.invalidate('all');
                afterCreate();
                Flow.nodes.startEdit(n.id, { isNew: tool !== 'link', ownTxn: true });
            },
            cancel: () => box.remove(),
        });
        return true;
    }

    // ── Select tool: click, drag, marquee ───────────────────────────────────

    function onSelectTool(e, hit, p) {
        if (e.button !== 0) return false;
        if (core.tool !== 'select' && core.tool !== 'connect') return false;
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;

        if (hit.kind === 'node') {
            const id = hit.id;
            if (additive) {
                core.toggleSelect('node', id);
                if (!core.selection.nodes.has(id)) return true;
            } else if (!core.selection.nodes.has(id)) {
                core.select([id], []);
            }
            startMove(e, p);
            return true;
        }
        if (hit.kind === 'edge') {
            if (additive) core.toggleSelect('edge', hit.id);
            else if (!core.selection.edges.has(hit.id) || core.selection.nodes.size) core.select([], [hit.id]);
            return true;
        }
        if (hit.kind === 'canvas') {
            startMarquee(e, additive);
            return true;
        }
        return false;
    }

    function startMarquee(e, additive) {
        const base = additive ? { nodes: [...core.selection.nodes], edges: [...core.selection.edges] } : { nodes: [], edges: [] };
        if (!additive) core.clearSelection();
        const r0 = core.viewportRect();
        const sx = e.clientX, sy = e.clientY;
        let active = false;
        core.trackDrag(e, {
            move: (ev) => {
                if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
                active = true;
                const x1 = Math.min(sx, ev.clientX), y1 = Math.min(sy, ev.clientY);
                const x2 = Math.max(sx, ev.clientX), y2 = Math.max(sy, ev.clientY);
                marqueeEl.hidden = false;
                Object.assign(marqueeEl.style, { left: (x1 - r0.left) + 'px', top: (y1 - r0.top) + 'px', width: (x2 - x1) + 'px', height: (y2 - y1) + 'px' });
                const a = core.screenToWorld(x1, y1), b = core.screenToWorld(x2, y2);
                // Cards are picked up as soon as the box touches them; groups only when fully
                // enclosed (they are big, so touching one would grab it on almost every drag).
                // Numbers are coerced because a file can hold "x": "100".
                const scene = core.scene();
                const inside = core.nodes().filter(n => {
                    if (scene && scene.hidden.has(n.id)) return false;   // inside a collapsed group
                    const nx = Number(n.x) || 0, ny = Number(n.y) || 0;
                    const nw = Number(n.width) || 0, nh = Number(n.height) || 0;
                    if (n.type === 'group') return nx >= a.x && ny >= a.y && nx + nw <= b.x && ny + nh <= b.y;
                    return nx < b.x && ny < b.y && nx + nw > a.x && ny + nh > a.y;
                }).map(n => n.id);
                const insideSet = new Set(inside);
                const nodeSet = new Set([...base.nodes, ...inside]);
                // Connectors whose both ends are inside come along (so colour/delete apply to them too).
                const edgeIds = core.edges().filter(ed => insideSet.has(ed.fromNode) && insideSet.has(ed.toNode)).map(ed => ed.id);
                core.select([...nodeSet], [...base.edges, ...edgeIds]);
            },
            up: () => { marqueeEl.hidden = true; },
            cancel: () => { marqueeEl.hidden = true; core.select(base.nodes, base.edges); },
        });
    }

    function startMove(e, p0) {
        const sx = e.clientX, sy = e.clientY;
        let active = false, moving = null, starts = null, box0 = null, others = null;
        let duplicated = false, sidesFrame = 0, blocked = false;
        const begin = (ev) => {
            // Locked cards stay put: with nothing movable in the selection the press is only a click.
            if (!ev.altKey) {
                const probe = core.expandWithGroupContents([...core.selection.nodes]);
                if (![...probe].some(id => !S.isLocked(core.getNode(id)))) { blocked = true; return; }
            }
            active = true;
            core.begin('Move');
            S.setInteractive(true);
            if (ev.altKey) {
                // Alt-drag duplicates the selection and drags the copy (originals stay put).
                const ids = [...core.selection.nodes];
                const copy = cloneItems(ids, 0, 0);
                for (const id of copy.nodes) unlock(core.getNode(id));   // a copy is free to move
                core.select(copy.nodes, copy.edges);
                duplicated = true;
            }
            moving = core.expandWithGroupContents([...core.selection.nodes]);
            for (const id of [...moving]) if (S.isLocked(core.getNode(id))) moving.delete(id);
            starts = new Map();
            for (const id of moving) { const n = core.getNode(id); starts.set(id, { x: Number(n.x) || 0, y: Number(n.y) || 0 }); }  // "x": "100" in a file must not concatenate
            box0 = S.bbox([...moving].map(core.getNode));
            others = core.nodes().filter(n => !moving.has(n.id));
            document.body.classList.add('flow-moving');
            Flow.edges.hidePorts();
        };
        core.trackDrag(e, {
            move: (ev, p) => {
                if (!active) {
                    if (blocked || Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
                    begin(ev);
                    if (!active) return;
                }
                let dx = p.x - p0.x, dy = p.y - p0.y;
                const snapped = snapMove(box0, dx, dy, others, !(ev.ctrlKey || ev.metaKey));
                dx = snapped.dx; dy = snapped.dy;
                drawGuides(snapped.guides);
                for (const [id, s] of starts) {
                    const n = core.getNode(id);
                    if (!n) continue;   // deleted in another tab mid-drag
                    const nx = Math.round(s.x + dx), ny = Math.round(s.y + dy);
                    if (nx !== Number(n.x)) n.x = nx;   // write only real changes (keeps "100" if unmoved)
                    if (ny !== Number(n.y)) n.y = ny;
                }
                // Re-pick connector sides at most once per frame (fast mice fire many moves per
                // frame) and with a cheaper search; the full-quality pick runs once on drop.
                if (!sidesFrame) sidesFrame = requestAnimationFrame(() => {
                    sidesFrame = 0;
                    Flow.edges.refreshAutoSides([...moving], { fast: true });
                    core.invalidate('nodes', [...moving]);
                });
            },
            up: () => {
                drawGuides([]);
                document.body.classList.remove('flow-moving');
                if (sidesFrame) { cancelAnimationFrame(sidesFrame); sidesFrame = 0; }
                S.setInteractive(false);
                if (active) {
                    core.invalidate('edges');
                    Flow.edges.refreshAutoSides([...moving]);
                    core.invalidate('nodes', [...moving]);
                    core.commit();
                }
            },
            cancel: () => {
                drawGuides([]);
                document.body.classList.remove('flow-moving');
                if (sidesFrame) { cancelAnimationFrame(sidesFrame); sidesFrame = 0; }
                S.setInteractive(false);
                if (active) { core.cancel(); core.invalidate('edges'); }
            },
        });
    }

    /**
     * Alignment snapping. Tries to line up the moving box's left/centre/right (and top/middle/bottom)
     * with other cards; falls back to the grid. Returns the adjusted delta plus guide lines to draw.
     */
    function snapMove(box, dx, dy, others, enabled) {
        const guides = [];
        if (!enabled) return { dx: Math.round(dx), dy: Math.round(dy), guides };
        const th = 7 / core.view.zoom;
        const mx = [box.x + dx, box.x + dx + box.width / 2, box.x + dx + box.width];
        const my = [box.y + dy, box.y + dy + box.height / 2, box.y + dy + box.height];
        let bestX = null, bestY = null;
        const vr = core.viewportRect();
        const a = core.screenToWorld(vr.left, vr.top), b = core.screenToWorld(vr.right, vr.bottom);
        for (const n of others) {
            if (n.x > b.x || n.y > b.y || n.x + n.width < a.x || n.y + n.height < a.y) continue; // only visible ones
            const ox = [n.x, n.x + n.width / 2, n.x + n.width];
            const oy = [n.y, n.y + n.height / 2, n.y + n.height];
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                if ((i === 1) !== (j === 1)) continue; // centre only snaps to centre; edges to edges
                const ddx = ox[j] - mx[i];
                if (Math.abs(ddx) <= th && (!bestX || Math.abs(ddx) < Math.abs(bestX.d) - 0.01)) bestX = { d: ddx, x: ox[j], nodes: [n] };
                else if (bestX && Math.abs(ddx - bestX.d) < 0.01) bestX.nodes.push(n);
                const ddy = oy[j] - my[i];
                if (Math.abs(ddy) <= th && (!bestY || Math.abs(ddy) < Math.abs(bestY.d) - 0.01)) bestY = { d: ddy, y: oy[j], nodes: [n] };
                else if (bestY && Math.abs(ddy - bestY.d) < 0.01) bestY.nodes.push(n);
            }
        }
        if (bestX) dx += bestX.d;
        else if (core.prefs.snap) dx = core.snapToGrid(box.x + dx) - box.x;
        if (bestY) dy += bestY.d;
        else if (core.prefs.snap) dy = core.snapToGrid(box.y + dy) - box.y;
        dx = Math.round(dx); dy = Math.round(dy);
        const nb = { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height };
        if (bestX) {
            const all = [nb, ...bestX.nodes];
            guides.push({ x1: bestX.x, x2: bestX.x, y1: Math.min(...all.map(n => n.y)) - 12, y2: Math.max(...all.map(n => n.y + n.height)) + 12 });
        }
        if (bestY) {
            const all = [nb, ...bestY.nodes];
            guides.push({ y1: bestY.y, y2: bestY.y, x1: Math.min(...all.map(n => n.x)) - 12, x2: Math.max(...all.map(n => n.x + n.width)) + 12 });
        }
        return { dx, dy, guides };
    }

    function drawGuides(list) {
        overlay.querySelectorAll('.flow-guide').forEach(el => el.remove());
        for (const g of list) {
            const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            l.setAttribute('class', 'flow-guide');
            l.setAttribute('x1', g.x1); l.setAttribute('y1', g.y1);
            l.setAttribute('x2', g.x2); l.setAttribute('y2', g.y2);
            overlay.appendChild(l);
        }
    }

    // ── Double click ────────────────────────────────────────────────────────

    function onDoubleClick(e) {
        if (core.viewOnly || e.target.closest('input, textarea')) return;
        if (core.tool === 'hand') return;
        const hit = core.hitTest(e.target);
        const p = core.screenToWorld(e.clientX, e.clientY);
        if (hit.kind === 'node') { Flow.nodes.startEdit(hit.id); return; }
        if (hit.kind === 'edge') { Flow.edges.editLabel(hit.id); return; }
        if (hit.kind === 'canvas') {
            core.begin('Add card');
            const n = Flow.nodes.createCard(p);
            core.reindex();
            core.invalidate('all');
            Flow.nodes.startEdit(n.id, { isNew: true, ownTxn: true });
        }
    }

    // ── Structural helpers (used by keyboard, panel, clipboard) ─────────────

    /** Clone nodes (+ group contents + edges among them) with an offset. Call inside a transaction. */
    function cloneItems(nodeIds, ox, oy, extraEdgeIds) {
        const ids = core.expandWithGroupContents(nodeIds);
        const map = new Map();
        const newNodes = [], newEdges = [];
        // A copied pool title brings all its lanes: the copy is a new pool. A lane copied on its
        // own keeps its pool id, so it joins that pool as another lane.
        const pools = new Map();
        for (const n of core.nodes()) if (ids.has(n.id) && S.poolOf(n)) pools.set(S.poolOf(n), core.newId());
        for (const n of core.nodes()) {
            if (!ids.has(n.id)) continue;
            const c = JSON.parse(JSON.stringify(n));
            c.id = core.newId();
            if (pools.has(S.laneOf(n))) c.styleAttributes.lane = pools.get(S.laneOf(n));
            if (pools.has(S.poolOf(n))) c.styleAttributes.pool = pools.get(S.poolOf(n));
            c.x = (Number(n.x) || 0) + ox; c.y = (Number(n.y) || 0) + oy;
            map.set(n.id, c.id);
            core.addNode(c, n.type === 'group' ? undefined : undefined);
            newNodes.push(c.id);
        }
        for (const e of core.edges()) {
            if (map.has(e.fromNode) && map.has(e.toNode)) {
                const c = JSON.parse(JSON.stringify(e));
                c.id = core.newId();
                c.fromNode = map.get(e.fromNode); c.toNode = map.get(e.toNode);
                core.addEdge(c, { auto: core.autoEdges.has(e.id) });
                newEdges.push(c.id);
            }
        }
        core.reindex();
        return { nodes: newNodes, edges: newEdges };
    }
    interact.cloneItems = cloneItems;

    interact.duplicate = function () {
        if (!core.selection.nodes.size) return;
        core.change('Duplicate', () => {
            const c = cloneItems([...core.selection.nodes], 20, 20);
            core.select(c.nodes, c.edges);
        });
    };

    /** Clear the lock flag on a node (call inside a transaction). */
    function unlock(n) {
        if (!n || !S.isLocked(n)) return;
        delete n.styleAttributes.locked;
        if (!Object.keys(n.styleAttributes).length) delete n.styleAttributes;
    }

    interact.deleteSelection = function () {
        if (!core.hasSelection()) return;
        // Locked cards are not deleted: unlock them first.
        // A swimlane goes with what is in it (like deleting a row), so the lanes below can close up.
        const sel = [...core.selection.nodes];
        const lanes = sel.filter(id => S.laneOf(core.getNode(id)));
        const ids = lanes.length ? [...new Set([...sel, ...core.expandWithGroupContents(lanes)])] : sel;
        const doomed = ids.filter(id => !S.isLocked(core.getNode(id)));
        const kept = ids.length - doomed.length;
        if (kept) core.toast(kept === 1 ? 'A locked card was kept. Unlock it to delete it.' : `${kept} locked cards were kept. Unlock them to delete them.`);
        if (!doomed.length && !core.selection.edges.size) return;
        core.change('Delete', () => core.removeItems(doomed, [...core.selection.edges]));
        core.emit('selection');
    };

    interact.groupSelection = function () {
        const sel = core.selectedNodes();
        if (!sel.length) return;
        const b = S.bbox(sel);
        const pad = 30;
        core.begin('Group');
        const g = Flow.nodes.createGroup({ x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 });
        core.reindex();
        core.invalidate('all');
        Flow.nodes.startEdit(g.id, { ownTxn: true });
    };

    interact.ungroupSelection = function () {
        const groups = core.selectedNodes().filter(n => n.type === 'group');
        if (!groups.length) return;
        const kids = new Set();
        groups.forEach(g => core.groupChildren(g).forEach(c => kids.add(c.id)));
        core.change('Ungroup', () => {
            core.removeItems(groups.map(g => g.id), []);
            core.select([...kids].filter(id => core.getNode(id)), []);
        });
    };

    interact.reorder = function (toFront) {
        const ids = core.selection.nodes;
        if (!ids.size) return;
        core.change(toFront ? 'Bring to front' : 'Send to back', (doc) => {
            const sel = doc.nodes.filter(n => ids.has(n.id));
            const rest = doc.nodes.filter(n => !ids.has(n.id));
            doc.nodes = toFront ? [...rest, ...sel] : [...sel, ...rest];
        });
    };

    /** Align selected nodes: 'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'. */
    interact.align = function (how) {
        const sel = core.selectedNodes().filter(n => !S.isLocked(n));
        if (sel.length < 2) return;
        const b = S.bbox(sel);
        core.change('Align', () => {
            for (const n of sel) {
                // Number() maths; write only when the value really changes (string coords stay if unmoved).
                const w = Number(n.width) || 0, h = Number(n.height) || 0;
                let x = Number(n.x), y = Number(n.y);
                if (how === 'left') x = b.x;
                if (how === 'right') x = b.x + b.width - w;
                if (how === 'hcenter') x = Math.round(b.x + b.width / 2 - w / 2);
                if (how === 'top') y = b.y;
                if (how === 'bottom') y = b.y + b.height - h;
                if (how === 'vcenter') y = Math.round(b.y + b.height / 2 - h / 2);
                if (x !== Number(n.x)) n.x = x;
                if (y !== Number(n.y)) n.y = y;
            }
            Flow.edges.refreshAutoSides(sel.map(n => n.id));
        });
    };

    /** Distribute selected nodes with equal gaps: 'h' | 'v'. */
    interact.distribute = function (axis) {
        const sel = core.selectedNodes().filter(n => !S.isLocked(n));
        if (sel.length < 3) return;
        const k = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'width' : 'height';
        const N = (v) => Number(v) || 0;
        const sorted = [...sel].sort((a, b) => N(a[k]) - N(b[k]));
        const total = sorted.reduce((s, n) => s + N(n[size]), 0);
        const first = sorted[0], last = sorted[sorted.length - 1];
        const gap = (N(last[k]) + N(last[size]) - N(first[k]) - total) / (sorted.length - 1);
        core.change('Distribute', () => {
            let pos = N(first[k]);
            for (const n of sorted) { const v = Math.round(pos); if (v !== N(n[k])) n[k] = v; pos += N(n[size]) + gap; }
            Flow.edges.refreshAutoSides(sel.map(n => n.id));
        });
    };

    const DIRS = { up: [0, -1, 'top'], down: [0, 1, 'bottom'], left: [-1, 0, 'left'], right: [1, 0, 'right'] };

    /**
     * Keyboard flowcharting: create a new card next to `fromId` in direction dir
     * ('up'|'down'|'left'|'right'), connect it, and start typing in it.
     * Repeating the same direction fans the new cards out side by side.
     */
    interact.addConnectedCard = function (fromId, dir) {
        const from = core.getNode(fromId);
        if (!from || !DIRS[dir]) return;
        const [ux, uy, side] = DIRS[dir];
        const toSide = S.OPPOSITE[side];
        const w = from.type === 'text' || from.type === 'link' || from.type === 'file' ? from.width : Flow.nodes.DEFAULT_W;
        const h = from.type === 'text' || from.type === 'link' || from.type === 'file' ? from.height : Flow.nodes.DEFAULT_H;
        const shape = from.styleAttributes && from.styleAttributes.shape;
        const nw = shape === 'diamond' || shape === 'circle' ? Flow.nodes.DEFAULT_W : w;
        const nh = shape === 'diamond' || shape === 'circle' ? Flow.nodes.DEFAULT_H : h;
        const gap = ux ? 140 : 80; // sideways branches get room for a label ("yes"/"no")
        // existing children on this side
        const kids = core.edges().filter(e => e.fromNode === fromId && e.fromSide === side).map(e => core.getNode(e.toNode)).filter(Boolean);
        let x, y;
        if (ux) {
            x = ux > 0 ? from.x + from.width + gap : from.x - gap - nw;
            y = from.y + from.height / 2 - nh / 2;
        } else {
            x = from.x + from.width / 2 - nw / 2;
            y = uy > 0 ? from.y + from.height + gap : from.y - gap - nh;
        }
        if (kids.length) {
            // Fan out beside the previous siblings.
            if (ux) { y = Math.max(...kids.map(k => k.y + k.height)) + 40; x = kids[0].x; }
            else { x = Math.max(...kids.map(k => k.x + k.width)) + 40; y = kids[0].y; }
        }
        // Avoid landing on top of an existing card.
        for (let i = 0; i < 30; i++) {
            const hitNode = core.nodes().find(n => n.type !== 'group' && x < n.x + n.width + 20 && x + nw > n.x - 20 && y < n.y + n.height + 20 && y + nh > n.y - 20);
            if (!hitNode) break;
            if (ux) y = hitNode.y + hitNode.height + 40; else x = hitNode.x + hitNode.width + 40;
        }
        core.begin('Add connected card');
        const node = Flow.nodes.createCard({ x, y }, { center: false, width: nw, height: nh });
        node.x = Math.round(x); node.y = Math.round(y); // keep exact alignment with the parent
        core.addEdge({ id: core.newId(), fromNode: fromId, fromSide: side, toNode: node.id, toSide }, { auto: true });
        core.reindex();
        core.invalidate('all');
        Flow.canvas.ensureVisible(node);
        Flow.nodes.startEdit(node.id, { isNew: true, ownTxn: true });
    };

    /** Move the selection to the nearest card in a direction. */
    interact.navigate = function (dir) {
        const sel = core.selectedNodes();
        const from = sel[sel.length - 1];
        if (!from) { const any = core.nodes().find(n => n.type !== 'group'); if (any) core.select([any.id], []); return; }
        const [ux, uy] = DIRS[dir];
        const c = S.center(from);
        let best = null, bestScore = Infinity;
        for (const n of core.nodes()) {
            if (n === from || n.type === 'group') continue;
            const nc = S.center(n);
            const dx = nc.x - c.x, dy = nc.y - c.y;
            const along = dx * ux + dy * uy;
            if (along <= 1) continue;
            const across = Math.abs(dx * uy - dy * ux);
            const score = along + across * 2;
            if (score < bestScore) { bestScore = score; best = n; }
        }
        if (best) { core.select([best.id], []); Flow.canvas.ensureVisible(best); }
    };

    interact.nudge = function (dx, dy) {
        if (!core.selection.nodes.size) return;
        const ids = core.expandWithGroupContents([...core.selection.nodes]);
        for (const id of [...ids]) if (S.isLocked(core.getNode(id))) ids.delete(id);
        if (!ids.size) return;
        core.change('Nudge', () => {
            for (const id of ids) { const n = core.getNode(id); n.x = (Number(n.x) || 0) + dx; n.y = (Number(n.y) || 0) + dy; }
            Flow.edges.refreshAutoSides([...ids]);
        });
    };

    // ── Clipboard ───────────────────────────────────────────────────────────

    function selectionAsCanvas() {
        const ids = core.expandWithGroupContents([...core.selection.nodes]);
        const nodes = core.nodes().filter(n => ids.has(n.id));
        const edges = core.edges().filter(e => ids.has(e.fromNode) && ids.has(e.toNode));
        return { nodes, edges };
    }

    function onClipboard(e, kind) {
        if (Flow.canvas.isTyping(e) || dialogOpen() || core.editing || core.viewOnly) return;
        if (!core.selection.nodes.size) return;
        const data = JSON.stringify(selectionAsCanvas(), null, '\t');
        e.clipboardData.setData('text/plain', data);
        e.preventDefault();
        interact._lastCopy = data;
        if (kind === 'cut') interact.deleteSelection();
        else core.toast(`Copied ${core.selection.nodes.size} item${core.selection.nodes.size === 1 ? '' : 's'}`);
    }

    function onPaste(e) {
        if (Flow.canvas.isTyping(e) || dialogOpen() || core.editing) return;
        if (core.viewOnly) { core.emit('blocked', 'Paste'); return; }
        const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
        const files = e.clipboardData ? [...e.clipboardData.files] : [];
        // A copied picture or screenshot: an image card where the pointer is.
        if (files.some(f => Flow.images && Flow.images.isImageFile(f))) {
            e.preventDefault();
            Flow.images.addFiles(files, core.lastPointer || core.viewCenter());
            return;
        }
        if (!text && files.length && Flow.io) {
            const f = files.find(x => /\.(canvas|json)$/i.test(x.name));
            if (f) { e.preventDefault(); Flow.io.importFile(f); }
            return;
        }
        if (!text) return;
        e.preventDefault();
        interact.pasteText(text);
    }

    /** Paste text: JSON Canvas fragments become cards+connectors, URLs become link cards, anything else a text card. */
    const PASTE_MAX = 500000, PASTE_MAX_LINES = 20000;   // plain text in one pasted card
    interact.pasteText = function (text) {
        const at = core.lastPointer || core.viewCenter();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (err) { /* not JSON */ }
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) {
            const valid = parsed.nodes.filter(n => n && typeof n === 'object' && isFinite(n.x) && isFinite(n.y));
            if (!valid.length) return;
            const b = S.bbox(valid);
            const ox = core.snapToGrid(at.x - b.width / 2) - b.x, oy = core.snapToGrid(at.y - b.height / 2) - b.y;
            core.change('Paste', () => {
                const map = new Map();
                const nn = [], ne = [];
                for (const n of valid) {
                    const c = JSON.parse(JSON.stringify(n));
                    c.id = core.newId();
                    c.x = Math.round(Number(n.x) + ox); c.y = Math.round(Number(n.y) + oy);
                    if (!(c.width > 0)) c.width = Flow.nodes.DEFAULT_W;
                    if (!(c.height > 0)) c.height = Flow.nodes.DEFAULT_H;
                    map.set(n.id, c.id);
                    core.addNode(c);
                    nn.push(c.id);
                }
                for (const e of Array.isArray(parsed.edges) ? parsed.edges : []) {
                    if (!e || !map.has(e.fromNode) || !map.has(e.toNode)) continue;
                    const c = JSON.parse(JSON.stringify(e));
                    c.id = core.newId();
                    c.fromNode = map.get(e.fromNode); c.toNode = map.get(e.toNode);
                    core.addEdge(c, { auto: true });
                    ne.push(c.id);
                }
                core.reindex();
                core.select(nn, ne);
            });
            return;
        }
        const t = text.trim();
        if (/^https?:\/\/\S+$/i.test(t)) {
            core.change('Paste link', () => {
                const n = Flow.nodes.createCard(at, { type: 'link', url: t, width: 280, height: 80 });
                core.select([n.id], []);
            });
            return;
        }
        // A card is not the place for megabytes of text: refuse instead of freezing the page.
        let nl = 0;
        for (let i = t.indexOf('\n'); i !== -1 && nl <= PASTE_MAX_LINES; i = t.indexOf('\n', i + 1)) nl++;
        if (t.length > PASTE_MAX || nl > PASTE_MAX_LINES) {
            core.toast(`That paste is too large for one card (max ${PASTE_MAX / 1000}k characters / ${PASTE_MAX_LINES / 1000}k lines) · import it as a .canvas or split it`, 'error');
            return;
        }
        const lines = t.split('\n');
        let longest = 0;   // a loop, not Math.max(...lines): 200k lines overflow the call stack
        for (const l of lines) if (l.length > longest) longest = l.length;
        const w = Math.min(420, Math.max(160, Math.ceil((longest * 8.2 + 32) / 20) * 20));
        const h = Math.min(600, Math.max(60, Math.ceil((lines.length * 22 + 24) / 20) * 20));
        core.change('Paste text', () => {
            const n = Flow.nodes.createCard(at, { text: t, width: w, height: h });
            core.select([n.id], []);
        });
    };

    // ── Keyboard ────────────────────────────────────────────────────────────

    interact.SHORTCUTS = [
        ['Tools', [
            ['V / 1', 'Select'], ['H / 2', 'Pan (or hold Space)'], ['T / 3', 'Card'], ['A / 4', 'Connector'],
            ['G / 5', 'Group'], ['L / 6', 'Link card'], ['I / 7', 'Image (or drop / paste a picture)'], ['Q', 'Keep tool active'],
        ]],
        ['Build fast', [
            ['Double-click', 'New card here'], ['Ctrl + Arrow', 'New connected card in that direction (also while typing)'],
            ['Alt + Arrow', 'Jump to neighbouring card'], ['Enter / F2', 'Edit card or connector label'],
            ['Esc / Ctrl + Enter', 'Finish editing'], ['Drag edge dot', 'Connect (drop on a dot to fix that side), or drop on empty space for a new card'],
            ['Drag near a connector end', 'Move that end to another card or dot'],
            ['Click edge dot', 'New connected card on that side'],
        ]],
        ['Edit', [
            ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / redo'], ['Ctrl + C / X / V', 'Copy / cut / paste'],
            ['Ctrl + D', 'Duplicate'], ['Alt + drag', 'Duplicate while dragging'], ['Delete', 'Delete selection'],
            ['Ctrl + A', 'Select all'], ['Ctrl + G', 'Group selection'], ['Ctrl + Shift + G', 'Ungroup'],
            ['Arrows / Shift + Arrows', 'Nudge 1px / one grid step'], ['Ctrl + ] / [', 'Bring to front / send to back'],
            ['Ctrl while dragging', 'Move without snapping'],
            ['Alt + R', 'Reverse the selected connectors'],
            ['Alt + L', 'Lock / unlock (no moving, resizing or deleting)'], ['Alt + S', 'Status: none, in progress, done'], ['Alt + G', 'Collapse / expand the selected group'],
            ['Ctrl + Alt + C / V', 'Copy / paste style (or use the brush in the panel)'],
        ]],
        ['View', [
            ['Scroll / Shift + scroll', 'Pan'], ['Ctrl + scroll / pinch', 'Zoom'], ['Shift + 1', 'Zoom to fit'],
            ['Shift + 2', 'Zoom to selection'], ['Shift + 0', 'Reset zoom'], ['Ctrl + = / -', 'Zoom in / out'],
            ["Ctrl + '", 'Toggle snap to grid'], ["Ctrl + Shift + '", 'Toggle grid dots'],
            ['Ctrl + F', 'Find on canvas (Enter / Shift + Enter for next / previous)'], ['M', 'Toggle the minimap'],
            ['Alt + V', 'View only: hide the editing tools, drag or arrows to pan (or open with ?view=1)'],
        ]],
        ['File', [
            ['Ctrl + S', 'Save to Snippets'], ['Ctrl + O', 'Open from Snippets'], ['Ctrl + Shift + O', 'Import .canvas'],
            ['Ctrl + Shift + S', 'Export .canvas'], ['Ctrl + Shift + E', 'Export PNG'], ['Shift + Alt + C', 'Copy PNG'],
            ['Alt + N', 'New chart'], ['?', 'This list'],
        ]],
    ];

    /** What each shape usually means in a flowchart, shown in the help sheet: [icon class, name, meaning]. */
    interact.SHAPES = [
        ['flow-ico-rect', 'Rectangle', 'A step: something that gets done ("Pull data", "Send email")'],
        ['flow-ico-pill', 'Pill', 'Start or end of the flow ("Start", "Done")'],
        ['flow-ico-diamond', 'Diamond', 'A decision (if / else): a question, with labelled arrows out ("Yes" / "No")'],
        ['flow-ico-circle', 'Circle', 'A jump point: the same letter in two places continues the flow without a long line'],
        ['flow-ico-parallelogram', 'Parallelogram', 'Input or output: data coming in or going out ("Read CSV", "API response")'],
        ['flow-ico-hexagon', 'Hexagon', 'Preparation: setup before the real work ("Load config", "Open connection")'],
        ['flow-ico-cylinder', 'Cylinder', 'A database or table ("orders", "Warehouse")'],
        ['flow-ico-document', 'Document', 'A file or report that is produced or read ("Daily report.xlsx")'],
        ['flow-ico-step', 'Step label', 'What runs the step (sql, python, api...): the chip in the corner, set in the panel'],
        ['flow-ico-group', 'Group', 'Steps that belong together: a phase, a system or an owner'],
        ['flow-ico-line', 'Arrow label', 'The condition for taking that path ("Yes", "No", "Timeout")'],
    ];

    /** The selection panel's buttons and two on-canvas states, for the help sheet: [Font Awesome classes, name, meaning]. */
    interact.PANEL = [
        ['fa-solid fa-paintbrush', 'Format painter', 'Copy the selected card or connector style, then click what should get it (Esc cancels)'],
        ['fa-solid fa-sitemap', 'Tidy layout', 'Line up the selected cards (or the whole chart) in layers that follow the arrows, flowing down or right'],
        ['fa-solid fa-up-down-left-right', 'Same size', 'Make the selected cards the same width, height or both, matching the largest'],
        ['fa-solid fa-vector-square', 'Fit group', 'Resize a group to hug the cards inside it'],
        ['fa-solid fa-table-list', 'Swimlanes', 'Bands that stack edge to edge, one per system or owner (menu: Insert swimlanes, or make selected groups lanes). Resize a lane and the rest follow; drag a lane by its name to reorder it, or off the pool to take it out (also a panel button)'],
        ['fa-solid fa-circle-half-stroke', 'Status', 'Flag a step in progress (half circle) or done (check); no flag = not started. Alt+S cycles. Shows on the card and in exports'],
        ['fa-solid fa-heading', 'Pool title', 'A title band across the top of a set of swimlanes (Swimlane panel). Drag the band to move the whole pool, its handles to resize every lane together; double-click to rename; delete it to remove the title'],
        ['fa-regular fa-square-minus', 'Collapse group', 'Shrink a group to its title bar and hide its cards; connectors attach to the bar. Also the chevron on the group'],
        ['fa-solid fa-lock', 'Lock', 'A locked card or group cannot be moved, resized or deleted. A padlock shows in its corner'],
        ['fa-solid fa-right-left', 'Reverse direction', 'Flip a connector so it runs the other way: the arrow points at the card it started from'],
        ['fa-solid fa-font', 'Connector labels', 'Yes / No / Success / Failure / Retry / Timeout in one click; click the active one to clear it'],
    ];

    const TOOL_KEYS = { v: 'select', '1': 'select', h: 'hand', '2': 'hand', t: 'card', c: 'card', '3': 'card', a: 'connect', '4': 'connect', g: 'group', '5': 'group', l: 'link', '6': 'link' };

    function onKeyDown(e) {
        if (e.defaultPrevented) return;
        const typing = Flow.canvas.isTyping(e);
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

        // File shortcuts work even from the title field.
        if (mod && key === 's' && !e.shiftKey && !e.altKey) { e.preventDefault(); if (typing) e.target.blur(); Flow.snippets && Flow.snippets.quickSave(); return; }
        if (typing || dialogOpen()) return;
        if (core.dragging && key !== 'Escape') return;
        if (core.viewOnly) {
            // View only: arrows pan; zoom, fit, open, export and help keys fall through; nothing else.
            if (key.startsWith('Arrow') && !mod) {
                e.preventDefault();
                const step = e.shiftKey ? 240 : 60, [ux, uy] = DIRS[key.slice(5).toLowerCase()];
                core.setView({ x: core.view.x - ux * step, y: core.view.y - uy * step });
                return;
            }
            const allowed = (mod && ['=', '+', '-', '0', 'o'].includes(key)) || (mod && e.shiftKey && key === 'e')
                || (e.shiftKey && !mod && /^Digit[012]$/.test(e.code)) || key === '?' || (e.shiftKey && e.code === 'Slash')
                || (e.altKey && e.shiftKey && e.code === 'KeyC') || key === 'Escape';
            if (!allowed) return;
        }

        if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); core.undo(); return; }
        if ((mod && key === 'z' && e.shiftKey) || (mod && key === 'y')) { e.preventDefault(); core.redo(); return; }
        if (mod && key === 'o' && !e.shiftKey) { e.preventDefault(); Flow.snippets && Flow.snippets.openDialog(); return; }
        if (mod && key === 'o' && e.shiftKey) { e.preventDefault(); Flow.io && Flow.io.chooseImport(); return; }
        if (mod && key === 's' && e.shiftKey) { e.preventDefault(); Flow.io && Flow.io.exportCanvas(); return; }
        if (mod && key === 'e' && e.shiftKey) { e.preventDefault(); Flow.io && Flow.io.exportPNG(); return; }
        if (e.altKey && e.shiftKey && e.code === 'KeyC') { e.preventDefault(); Flow.io && Flow.io.copyPNG(); return; }
        if (e.altKey && !mod && e.code === 'KeyN') { e.preventDefault(); Flow.app && Flow.app.newChart(); return; }
        if (mod && key === 'a') {
            e.preventDefault();
            const sc = core.scene();
            const vis = (id) => !(sc && sc.hidden.has(id));
            core.select(core.nodes().map(n => n.id).filter(vis), core.edges().filter(ed => vis(ed.fromNode) || vis(ed.toNode)).map(ed => ed.id));
            return;
        }
        if (mod && key === 'd') { e.preventDefault(); interact.duplicate(); return; }
        if (mod && key === 'g' && !e.shiftKey) { e.preventDefault(); interact.groupSelection(); return; }
        if (mod && key === 'g' && e.shiftKey) { e.preventDefault(); interact.ungroupSelection(); return; }
        if (mod && (e.code === 'BracketRight')) { e.preventDefault(); interact.reorder(true); return; }
        if (mod && (e.code === 'BracketLeft')) { e.preventDefault(); interact.reorder(false); return; }
        if (mod && e.code === 'Quote') { e.preventDefault(); if (e.shiftKey) core.setPref('grid', !core.prefs.grid); else { core.setPref('snap', !core.prefs.snap); core.toast(core.prefs.snap ? 'Snap to grid on' : 'Snap to grid off'); } return; }
        if (mod && (key === '=' || key === '+')) { e.preventDefault(); Flow.canvas.zoomBy(1.2); return; }
        if (mod && key === '-') { e.preventDefault(); Flow.canvas.zoomBy(1 / 1.2); return; }
        if (mod && key === '0') { e.preventDefault(); Flow.canvas.zoomTo(1); return; }
        if (e.shiftKey && !mod && e.code === 'Digit1') { e.preventDefault(); Flow.canvas.fit(); return; }
        if (e.shiftKey && !mod && e.code === 'Digit2') { e.preventDefault(); const s = core.selectedNodes(); Flow.canvas.fit(s.length ? s : null, { maxZoom: 2 }); return; }
        if (e.shiftKey && !mod && e.code === 'Digit0') { e.preventDefault(); Flow.canvas.zoomTo(1); return; }
        if (key === '?' || (e.shiftKey && e.code === 'Slash')) { e.preventDefault(); Flow.app && Flow.app.showShortcuts(); return; }

        if (key.startsWith('Arrow')) {
            const dir = key.slice(5).toLowerCase();
            e.preventDefault();
            if (mod) {
                const sel = core.selectedNodes();
                if (sel.length === 1) interact.addConnectedCard(sel[0].id, dir);
                else if (!sel.length) {
                    // No selection: start a chart in the middle of the view.
                    core.begin('Add card');
                    const n = Flow.nodes.createCard(core.viewCenter());
                    core.reindex(); core.invalidate('all');
                    Flow.nodes.startEdit(n.id, { isNew: true, ownTxn: true });
                }
                return;
            }
            if (e.altKey) { interact.navigate(dir); return; }
            const step = e.shiftKey ? core.GRID : 1;
            const [ux, uy] = DIRS[dir];
            interact.nudge(ux * step, uy * step);
            return;
        }
        if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); interact.deleteSelection(); return; }
        if (key === 'Enter' || key === 'F2') {
            const sn = core.selectedNodes(), se = core.selectedEdges();
            if (sn.length === 1 && !se.length) { e.preventDefault(); Flow.nodes.startEdit(sn[0].id); }
            else if (se.length === 1 && !sn.length) { e.preventDefault(); Flow.edges.editLabel(se[0].id); }
            return;
        }
        if (key === 'Escape') {
            if (core.tool !== 'select') core.setTool('select');
            else core.clearSelection();
            return;
        }
        if (!mod && !e.altKey && key === 'q') { core.setTool(core.tool, !core.toolLocked); return; }
        if (!mod && !e.altKey && !e.shiftKey && (key === 'i' || key === '7') && Flow.images) { Flow.images.choose(); return; }
        if (!mod && !e.altKey && !e.shiftKey && TOOL_KEYS[key]) { core.setTool(TOOL_KEYS[key], core.toolLocked); return; }
    }
})();
