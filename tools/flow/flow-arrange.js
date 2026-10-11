/**
 * P7 - Arranging and styling helpers: lock, collapse/expand groups, fit a group to its contents,
 * equal size, auto layout, format painter, connector label presets.
 * Every action is one undo step through core.change. Buttons live in flow-panel.js.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;

    const arrange = Flow.arrange = {};
    const N = (v) => Number(v) || 0;   // coordinates may be strings in a hand-written file

    /** Connector label presets: the branches a flowchart usually needs. */
    arrange.LABEL_PRESETS = ['Yes', 'No', 'Success', 'Failure', 'Retry', 'Timeout'];

    /** Set (value) or remove (null) a key of styleAttributes, dropping the object when it empties. */
    function setStyleAttr(obj, key, value) {
        if (value == null) {
            if (obj.styleAttributes && typeof obj.styleAttributes === 'object') {
                delete obj.styleAttributes[key];
                if (!Object.keys(obj.styleAttributes).length) delete obj.styleAttributes;
            }
            return;
        }
        if (!obj.styleAttributes || typeof obj.styleAttributes !== 'object') obj.styleAttributes = {};
        obj.styleAttributes[key] = value;
    }
    arrange.setStyleAttr = setStyleAttr;

    /** Write a numeric field only when it really changes (a "x": "100" string stays if unmoved). */
    function setNum(n, key, v) { if (v !== Number(n[key])) n[key] = v; }

    // ── Lock ────────────────────────────────────────────────────────────────

    /** Lock the selected cards and groups; if all of them are already locked, unlock them. */
    arrange.toggleLock = function () {
        const sel = core.selectedNodes();
        if (!sel.length) return;
        const lock = sel.some(n => !S.isLocked(n));
        core.change(lock ? 'Lock' : 'Unlock', () => {
            for (const n of sel) setStyleAttr(n, 'locked', lock ? true : null);
            core.invalidate('all');
        });
        core.toast(lock ? (sel.length === 1 ? 'Locked' : `${sel.length} locked`) : 'Unlocked');
    };

    // ── Status flags ────────────────────────────────────────────────────────

    /** Set ('doing' | 'done') or with '' clear the status of the selected cards (groups have none). */
    arrange.setStatus = function (status) {
        const cards = core.selectedNodes().filter(n => n.type !== 'group');
        if (!cards.length) return;
        const name = (S.STATUSES.find(([v]) => v === status) || [])[1];
        core.change(name ? 'Status: ' + name : 'Clear status', () => {
            for (const n of cards) setStyleAttr(n, 'status', name ? status : null);
            core.invalidate('all');
        });
    };

    /** Alt+S: no status -> in progress -> done -> no status (from the first selected card's). */
    arrange.cycleStatus = function () {
        const cards = core.selectedNodes().filter(n => n.type !== 'group');
        if (!cards.length) return;
        const order = ['', ...S.STATUSES.map(([v]) => v)];
        const next = order[(order.indexOf(S.statusOf(cards[0])) + 1) % order.length];
        arrange.setStatus(next);
        core.toast(next ? (S.STATUSES.find(([v]) => v === next) || [])[1] : 'Status cleared');
    };

    // ── Groups: collapse and fit ────────────────────────────────────────────

    /** Collapse the selected groups to their title bar; if all of them are collapsed, expand them. */
    arrange.toggleCollapse = function (groupIds) {
        const groups = (groupIds ? groupIds.map(core.getNode) : core.selectedNodes()).filter(n => n && n.type === 'group');
        if (!groups.length) return;
        const collapse = groups.some(g => !S.isCollapsed(g));
        core.change(collapse ? 'Collapse group' : 'Expand group', () => {
            for (const g of groups) setStyleAttr(g, 'collapsed', collapse ? true : null);
            core.invalidate('all');
        });
        if (collapse) {
            // Cards that just disappeared cannot stay selected.
            const sc = core.scene();
            if (sc) core.select([...core.selection.nodes].filter(id => !sc.hidden.has(id)), [...core.selection.edges]);
        }
    };

    /** Resize each selected group to hug the cards inside it (30px margin, like a new group). */
    arrange.fitGroups = function () {
        const groups = core.selectedNodes().filter(n => n.type === 'group' && !S.isLocked(n));
        if (!groups.length) return;
        groups.sort((a, b) => N(a.width) * N(a.height) - N(b.width) * N(b.height));   // inner groups first
        const pad = 30;
        let fitted = 0;
        core.change('Fit group to contents', () => {
            for (const g of groups) {
                const kids = core.groupChildren(g);
                if (!kids.length) continue;
                const b = S.bbox(kids);
                setNum(g, 'x', Math.round(b.x - pad)); setNum(g, 'y', Math.round(b.y - pad));
                setNum(g, 'width', Math.round(b.width + pad * 2)); setNum(g, 'height', Math.round(b.height + pad * 2));
                fitted++;
            }
            core.invalidate('all');
        });
        if (!fitted) core.toast('These groups are empty');
    };

    // ── Equal size ──────────────────────────────────────────────────────────

    /** Give the selected cards the largest width, height or both: 'w' | 'h' | 'both'. */
    arrange.equalSize = function (mode) {
        const sel = core.selectedNodes().filter(n => n.type !== 'group' && !S.isLocked(n));
        if (sel.length < 2) return;
        const maxW = Math.max(...sel.map(n => N(n.width))), maxH = Math.max(...sel.map(n => N(n.height)));
        core.change('Equal size', () => {
            for (const n of sel) {
                let w = mode === 'h' ? N(n.width) : maxW;
                let h = mode === 'w' ? N(n.height) : maxH;
                if (S.nodeShape(n) === 'circle') w = h = mode === 'h' ? maxH : maxW;   // a circle stays round
                setNum(n, 'width', w); setNum(n, 'height', h);
            }
            Flow.edges.refreshAutoSides(sel.map(n => n.id));
            core.invalidate('all');
        });
    };

    // ── Auto layout ─────────────────────────────────────────────────────────

    const LAYER_GAP = 80, NODE_GAP = 60;

    /**
     * Pure layout: layered (Sugiyama-style) placement of `nodes` following `edges`.
     * dir 'down' (layers are rows) or 'right' (layers are columns). Returns Map id -> {x, y}
     * relative to the first layer's start, cards inside a layer centred on one axis.
     * Cycles are broken by ignoring the edge that closes them; unconnected cards sit in the first layer.
     */
    arrange.layout = function (nodes, edges, dir) {
        const byId = new Map(nodes.map(n => [n.id, n]));
        const order0 = new Map(nodes.map((n, i) => [n.id, i]));
        const succ = new Map(nodes.map(n => [n.id, []])), pred = new Map(nodes.map(n => [n.id, []]));
        // Depth-first, ignoring back edges: what is left is acyclic.
        const state = new Map();   // 1 = on the stack, 2 = done
        const dag = [];
        const out = new Map(nodes.map(n => [n.id, []]));
        for (const e of edges) if (byId.has(e.fromNode) && byId.has(e.toNode) && e.fromNode !== e.toNode) out.get(e.fromNode).push(e.toNode);
        const topo = [];
        const visit = (id) => {
            state.set(id, 1);
            for (const to of out.get(id)) {
                if (state.get(to) === 1) continue;   // back edge
                dag.push([id, to]);
                if (!state.has(to)) visit(to);
            }
            state.set(id, 2);
            topo.push(id);
        };
        // Start from the leftmost / topmost cards so the layout follows what is on screen.
        const cross = dir === 'down' ? 'x' : 'y', main = dir === 'down' ? 'y' : 'x';
        const starts = [...nodes].sort((a, b) => N(a[main]) - N(b[main]) || N(a[cross]) - N(b[cross]));
        for (const n of starts) if (!state.has(n.id)) visit(n.id);
        for (const [a, b] of dag) { if (!succ.get(a).includes(b)) { succ.get(a).push(b); pred.get(b).push(a); } }
        // Longest-path layers (topo is reverse post-order).
        const layer = new Map();
        for (const id of [...topo].reverse()) {
            let l = 0;
            for (const p of pred.get(id)) l = Math.max(l, layer.get(p) + 1);
            layer.set(id, l);
        }
        const count = Math.max(0, ...layer.values()) + 1;
        const rows = Array.from({ length: count }, () => []);
        for (const n of [...nodes].sort((a, b) => N(a[cross]) - N(b[cross]) || order0.get(a.id) - order0.get(b.id))) rows[layer.get(n.id)].push(n.id);
        // Barycentre sweeps reduce crossings; ties keep the current order.
        const pos = new Map();
        const reindex = () => rows.forEach(r => r.forEach((id, i) => pos.set(id, i)));
        reindex();
        const sweep = (down) => {
            const seq = down ? rows.slice(1) : rows.slice(0, -1).reverse();
            for (const row of seq) {
                const key = new Map(row.map(id => {
                    const nb = (down ? pred : succ).get(id);
                    return [id, nb.length ? nb.reduce((s, x) => s + pos.get(x), 0) / nb.length : pos.get(id)];
                }));
                row.sort((a, b) => key.get(a) - key.get(b) || pos.get(a) - pos.get(b));
                row.forEach((id, i) => pos.set(id, i));
            }
        };
        for (let i = 0; i < 4; i++) { sweep(true); sweep(false); }
        // Coordinates: a layer's cards side by side, every layer centred on the same axis.
        const size = (id, k) => N(byId.get(id)[k]);
        const along = dir === 'down' ? 'height' : 'width', across = dir === 'down' ? 'width' : 'height';
        const result = new Map();
        let offset = 0;
        for (const row of rows) {
            const total = row.reduce((s, id) => s + size(id, across), 0) + NODE_GAP * Math.max(0, row.length - 1);
            let at = -total / 2;
            const depth = Math.max(0, ...row.map(id => size(id, along)));
            for (const id of row) {
                const a = at, m = offset + (depth - size(id, along)) / 2;   // centred within the layer's depth too
                result.set(id, dir === 'down' ? { x: a, y: m } : { x: m, y: a });
                at += size(id, across) + NODE_GAP;
            }
            offset += depth + LAYER_GAP;
        }
        return result;
    };

    /** Tidy the selection (2+ cards) or, with none selected, the whole chart: 'down' | 'right'. */
    arrange.autoLayout = function (dir) {
        const sc = core.scene();
        const visible = (n) => !(sc && sc.hidden.has(n.id));
        let targets = core.selectedNodes().filter(n => n.type !== 'group' && !S.isLocked(n) && visible(n));
        let skipped = 0;
        if (targets.length < 2) {
            // Whole chart: cards inside groups stay where they are (a group's members are geometric).
            const groups = core.nodes().filter(n => n.type === 'group');
            const all = core.nodes().filter(n => n.type !== 'group' && !S.isLocked(n) && visible(n));
            targets = all.filter(n => !groups.some(g => core.groupChildren(g).includes(n)));
            skipped = all.length - targets.length;
        }
        if (targets.length < 2) { core.toast('Select two or more cards to tidy'); return; }
        const ids = new Set(targets.map(n => n.id));
        const edges = core.edges().filter(e => ids.has(e.fromNode) && ids.has(e.toNode));
        const rel = arrange.layout(targets, edges, dir === 'right' ? 'right' : 'down');
        const b = S.bbox(targets);
        let minX = Infinity, minY = Infinity;
        for (const p of rel.values()) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
        core.change('Auto layout', () => {
            for (const n of targets) {
                const p = rel.get(n.id);
                setNum(n, 'x', core.snapToGrid(b.x + p.x - minX));
                setNum(n, 'y', core.snapToGrid(b.y + p.y - minY));
            }
            Flow.edges.refreshAutoSides([...ids]);
            core.invalidate('all');
        });
        Flow.canvas.fit(targets, { maxZoom: 1 });
        if (skipped) core.toast(`${skipped} card${skipped === 1 ? '' : 's'} inside groups left in place`);
    };

    // ── Connector label presets ─────────────────────────────────────────────

    /** Set the label of the selected connectors ('' removes it). */
    arrange.setLabel = function (text) {
        const list = core.selectedEdges();
        if (!list.length) return;
        core.change(text ? 'Connector label' : 'Remove label', () => {
            for (const e of list) { if (text) e.label = text; else delete e.label; }
            core.invalidate('all');
        });
    };

    // ── Reverse direction ───────────────────────────────────────────────────

    /**
     * Flip each selected connector: it now starts at the card it ended on, and the sides swap with
     * the ends. Arrowheads stay with their role (start / end), so an A to B arrow becomes B to A
     * and its head moves to A; a two-headed or headless connector looks the same. Label and
     * colour are untouched.
     */
    arrange.reverseEdges = function () {
        const list = core.selectedEdges();
        if (!list.length) return;
        core.change('Reverse direction', () => {
            for (const e of list) {
                const swap = (a, b) => {
                    const va = Object.prototype.hasOwnProperty.call(e, a) ? e[a] : undefined;
                    const vb = Object.prototype.hasOwnProperty.call(e, b) ? e[b] : undefined;
                    if (vb === undefined) delete e[a]; else e[a] = vb;
                    if (va === undefined) delete e[b]; else e[b] = va;
                };
                swap('fromNode', 'toNode');
                swap('fromSide', 'toSide');
            }
            core.invalidate('all');
        });
    };

    // ── Format painter ──────────────────────────────────────────────────────

    let brush = null;   // { kind: 'node' | 'edge', ... } while a style is held

    /** The paintable style of one card, group or connector. */
    function styleOf(item, kind) {
        if (kind === 'edge') {
            const sa = item.styleAttributes || {};
            return { kind, color: item.color, fromEnd: item.fromEnd, toEnd: item.toEnd, route: sa.pathfindingMethod, dash: sa.path };
        }
        return { kind, type: item.type, color: item.color, shape: item.type === 'text' ? S.nodeShape(item) : undefined };
    }

    function paintNode(n, st) {
        if (st.color) n.color = st.color; else delete n.color;
        if (n.type !== 'text' || st.type !== 'text' || !st.shape) return;
        const was = S.nodeShape(n);
        setStyleAttr(n, 'shape', st.shape === 'rect' ? null : st.shape);
        if ((st.shape === 'diamond' || st.shape === 'circle') && was !== st.shape && n.height < n.width * 0.6) {
            n.height = Math.round(Math.max(n.height, n.width * (st.shape === 'diamond' ? 0.6 : 1)) / 20) * 20;
        }
        if (st.shape === 'circle') n.height = n.width = Math.max(n.width, n.height);
    }

    function paintEdge(e, st) {
        if (st.color) e.color = st.color; else delete e.color;
        for (const k of ['fromEnd', 'toEnd']) { if (st[k] != null) e[k] = st[k]; else delete e[k]; }
        setStyleAttr(e, 'pathfindingMethod', st.route == null ? null : st.route);
        setStyleAttr(e, 'path', st.dash == null ? null : st.dash);
    }

    function endPainting() {
        if (!brush) return;
        brush = null;
        document.body.classList.remove('flow-painting');
        Flow.canvas.setHint(null);
        core.emit('selection');   // the panel redraws its button state
    }

    /** Take the style of the selected card or connector. With arm, the next click paints it. */
    arrange.copyStyle = function (arm) {
        const n = core.selectedNodes()[0], e = core.selectedEdges()[0];
        if (!n && !e) { core.toast('Select a card or connector first'); return; }
        brush = n ? styleOf(n, 'node') : styleOf(e, 'edge');
        if (arm) {
            document.body.classList.add('flow-painting');
            Flow.canvas.setHint('Click a card or connector to paint its style <kbd>Esc</kbd> cancel');
        } else core.toast('Style copied');
        core.emit('selection');
    };

    /** Apply the held style to the selection (or the given items). */
    arrange.pasteStyle = function (items) {
        if (!brush) { core.toast('Copy a style first'); return; }
        const nodes = items ? items.nodes : core.selectedNodes();
        const edges = items ? items.edges : core.selectedEdges();
        const st = brush;
        if (!(st.kind === 'node' ? nodes.length : edges.length)) { core.toast(st.kind === 'node' ? 'Select a card or group to paint' : 'Select a connector to paint'); return; }
        core.change('Paste style', () => {
            if (st.kind === 'node') { for (const n of nodes) paintNode(n, st); Flow.edges.refreshAutoSides(nodes.map(n => n.id)); }
            else for (const e of edges) paintEdge(e, st);
            core.invalidate('all');
        });
    };

    arrange.hasBrush = () => !!brush;
    arrange.isPainting = () => document.body.classList.contains('flow-painting');

    // ── Wiring ──────────────────────────────────────────────────────────────

    arrange.init = function () {
        // Armed painter: the next press on a card or connector paints it; anything else disarms.
        core.addPointerHandler(550, (e, hit) => {
            if (!arrange.isPainting() || e.button !== 0) return false;
            if (hit.kind === 'node' || hit.kind === 'edge') {
                const sel = hit.kind === 'node' ? core.selection.nodes : core.selection.edges;
                const ids = sel.has(hit.id) ? [...sel] : [hit.id];
                const items = hit.kind === 'node' ? { nodes: ids.map(core.getNode).filter(Boolean), edges: [] } : { nodes: [], edges: ids.map(core.getEdge).filter(Boolean) };
                if (brush && brush.kind === hit.kind) arrange.pasteStyle(items);
                else core.toast(brush && brush.kind === 'node' ? 'That style is for cards and groups' : 'That style is for connectors');
                endPainting();
                return true;
            }
            if (hit.kind === 'ui') return false;
            endPainting();
            return false;
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && arrange.isPainting()) { e.preventDefault(); e.stopPropagation(); endPainting(); return; }
            if (e.defaultPrevented || Flow.canvas.isTyping(e) || document.querySelector('.flow-dialog-backdrop:not([hidden])')) return;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.altKey && e.code === 'KeyC') { e.preventDefault(); arrange.copyStyle(false); return; }
            if (mod && e.altKey && e.code === 'KeyV') { e.preventDefault(); arrange.pasteStyle(); return; }
            if (e.altKey && !mod && !e.shiftKey && e.code === 'KeyL') { e.preventDefault(); arrange.toggleLock(); return; }
            if (e.altKey && !mod && !e.shiftKey && e.code === 'KeyG') { e.preventDefault(); arrange.toggleCollapse(); return; }
            if (e.altKey && !mod && !e.shiftKey && e.code === 'KeyR') { e.preventDefault(); arrange.reverseEdges(); return; }
            if (e.altKey && !mod && !e.shiftKey && e.code === 'KeyS') { e.preventDefault(); arrange.cycleStatus(); }
        }, true);
        core.on('load', () => { if (brush) endPainting(); });
    };
})();
