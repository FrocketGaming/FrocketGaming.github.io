/**
 * Flow core: the single in-memory JSON Canvas document, selection, view,
 * undo/redo, event bus, render scheduling and pointer-gesture dispatch.
 *
 * Every other flow-*.js module talks to the document ONLY through this API.
 * See ARCHITECTURE.md for the contract.
 */
(function () {
    'use strict';

    const Flow = window.Flow = window.Flow || {};
    const listeners = {};
    const renderers = [];
    const pointerHandlers = [];
    const HISTORY_MAX = 200;

    const core = Flow.core = {
        /** The live JSON Canvas 1.0 document. Unknown fields on it, its nodes and edges are kept verbatim. */
        doc: { nodes: [], edges: [] },
        /** Which top-level arrays were absent in the loaded file (so export can omit them again). */
        docShape: { nodes: true, edges: true },
        selection: { nodes: new Set(), edges: new Set() },
        /** screen = world * zoom + (x, y), relative to the viewport element's top-left. */
        view: { x: 0, y: 0, zoom: 1 },
        tool: 'select',
        toolLocked: false,
        /** Edges whose sides are re-chosen automatically when their cards move (runtime + autosave only). */
        autoEdges: new Set(),
        editing: null,          // { kind: 'node'|'edge'|'group', id } while an inline editor is open
        prefs: { snap: true, grid: true },
        _nodeIndex: new Map(),
        _edgeIndex: new Map(),
        _undo: [],
        _redo: [],
        _txn: null,
        _dirty: { all: true, nodes: new Set(), edges: true, selection: true, view: true, structure: true },
        _frame: 0,
    };

    // ── Events ──────────────────────────────────────────────────────────────

    core.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => core.off(evt, fn); };
    core.off = function (evt, fn) { listeners[evt] = (listeners[evt] || []).filter(f => f !== fn); };
    core.emit = function (evt, data) {
        for (const fn of listeners[evt] || []) {
            try { fn(data); } catch (e) { console.error(`Flow: '${evt}' listener failed`, e); }
        }
    };

    // ── Prefs ───────────────────────────────────────────────────────────────

    try { Object.assign(core.prefs, JSON.parse(localStorage.getItem('flow-prefs') || '{}')); } catch (e) { /* ignore */ }
    core.setPref = function (key, value) {
        core.prefs[key] = value;
        try { localStorage.setItem('flow-prefs', JSON.stringify(core.prefs)); } catch (e) { /* ignore */ }
        core.emit('prefs', core.prefs);
        core.invalidate('view');
    };

    // ── Document access ─────────────────────────────────────────────────────

    core.nodes = () => core.doc.nodes;
    core.edges = () => core.doc.edges;
    core.getNode = (id) => core._nodeIndex.get(id);
    core.getEdge = (id) => core._edgeIndex.get(id);

    core.reindex = function () {
        core._nodeIndex = new Map(core.doc.nodes.map(n => [n.id, n]));
        core._edgeIndex = new Map(core.doc.edges.map(e => [e.id, e]));
        for (const id of [...core.selection.nodes]) if (!core._nodeIndex.has(id)) core.selection.nodes.delete(id);
        for (const id of [...core.selection.edges]) if (!core._edgeIndex.has(id)) core.selection.edges.delete(id);
        for (const id of [...core.autoEdges]) if (!core._edgeIndex.has(id)) core.autoEdges.delete(id);
    };

    core.nodeIndex = () => core._nodeIndex;

    core.newId = function () {
        let id;
        do {
            id = '';
            const bytes = crypto.getRandomValues(new Uint8Array(8));
            for (const b of bytes) id += b.toString(16).padStart(2, '0');
        } while (core._nodeIndex.has(id) || core._edgeIndex.has(id));
        return id;
    };

    /** Replace the whole document (import / open). Resets history unless keepHistory. */
    core.load = function (docObj, opts) {
        opts = opts || {};
        if (opts.keepHistory) core._pushUndo(core.snapshot());
        const doc = docObj && typeof docObj === 'object' ? docObj : {};
        core.docShape = { nodes: Array.isArray(doc.nodes), edges: Array.isArray(doc.edges) };
        if (!Array.isArray(doc.nodes)) doc.nodes = [];
        if (!Array.isArray(doc.edges)) doc.edges = [];
        core.doc = doc;
        core.selection.nodes.clear();
        core.selection.edges.clear();
        core.autoEdges = new Set(opts.autoEdges || []);
        core.reindex();
        if (!opts.keepHistory) { core._undo = []; core._redo = []; }
        core.invalidate('all');
        core.emit('load', { source: opts.source || null });
        core.emit('selection');
        core.emit('history');
    };

    /** The document as it should be written out (arrays that were absent and are still empty are omitted). */
    core.exportDoc = function () {
        const out = {};
        for (const k of Object.keys(core.doc)) {
            if (k === 'nodes' && !core.docShape.nodes && core.doc.nodes.length === 0) continue;
            if (k === 'edges' && !core.docShape.edges && core.doc.edges.length === 0) continue;
            // defineProperty, not out[k] = ..., so a literal "__proto__" key survives as data.
            Object.defineProperty(out, k, { value: core.doc[k], enumerable: true, writable: true, configurable: true });
        }
        return out;
    };

    // ── History / transactions ──────────────────────────────────────────────

    core.snapshot = function () {
        return {
            doc: JSON.stringify(core.doc),
            shape: { ...core.docShape },
            selNodes: [...core.selection.nodes],
            selEdges: [...core.selection.edges],
            auto: [...core.autoEdges],
        };
    };

    core._restore = function (snap) {
        core.doc = JSON.parse(snap.doc);
        core.docShape = { ...snap.shape };
        core.autoEdges = new Set(snap.auto);
        core.selection.nodes = new Set(snap.selNodes);
        core.selection.edges = new Set(snap.selEdges);
        core.reindex();
        core.invalidate('all');
        core.emit('selection');
        core.emit('change', { label: 'restore' });
    };

    core._pushUndo = function (snap) {
        core._undo.push(snap);
        if (core._undo.length > HISTORY_MAX) core._undo.shift();
        core._redo = [];
    };

    /** Start a transaction (for drags). Nested begins are folded into the outer one. */
    core.begin = function (label) {
        if (core._txn) { core._txn.depth++; return; }
        core._txn = { label, before: core.snapshot(), depth: 1 };
    };

    /** Finish a transaction; records an undo step only if the document actually changed. */
    core.commit = function () {
        const t = core._txn;
        if (!t) return false;
        if (--t.depth > 0) return false;
        core._txn = null;
        const now = JSON.stringify(core.doc);
        if (now === t.before.doc) return false;
        core._pushUndo(t.before);
        core.reindex();
        core.emit('change', { label: t.label });
        core.emit('history');
        return true;
    };

    /** Abort a transaction and roll the document back. */
    core.cancel = function () {
        const t = core._txn;
        if (!t) return;
        core._txn = null;
        core._restore(t.before);
    };

    core.inTransaction = () => !!core._txn;

    /** Run fn as one undoable step. fn may mutate core.doc freely. */
    core.change = function (label, fn) {
        core.begin(label);
        try { fn(core.doc); } catch (e) { console.error('Flow: change failed', e); }
        core.reindex();
        core.invalidate('all');
        return core.commit();
    };

    core.undo = function () {
        if (core._txn) core.commit();
        const snap = core._undo.pop();
        if (!snap) return false;
        core._redo.push(core.snapshot());
        core._restore(snap);
        core.emit('history');
        return true;
    };

    core.redo = function () {
        const snap = core._redo.pop();
        if (!snap) return false;
        core._undo.push(core.snapshot());
        core._restore(snap);
        core.emit('history');
        return true;
    };

    core.canUndo = () => core._undo.length > 0;
    core.canRedo = () => core._redo.length > 0;

    // ── Mutation helpers ────────────────────────────────────────────────────

    /** Add a node (inside a transaction). Keeps Obsidian's key order: id,type,...,x,y,width,height,color. */
    core.addNode = function (node, opts) {
        if (!node.id) node.id = core.newId();
        if (opts && opts.index != null) core.doc.nodes.splice(opts.index, 0, node);
        else if (node.type === 'group') {
            // Groups go before non-group nodes so the array order stays a sensible z-order.
            const i = core.doc.nodes.findIndex(n => n.type !== 'group');
            core.doc.nodes.splice(i < 0 ? core.doc.nodes.length : i, 0, node);
        } else core.doc.nodes.push(node);
        core._nodeIndex.set(node.id, node);
        core.invalidate('structure');
        return node;
    };

    core.addEdge = function (edge, opts) {
        if (!edge.id) edge.id = core.newId();
        core.doc.edges.push(edge);
        core._edgeIndex.set(edge.id, edge);
        if (opts && opts.auto) core.autoEdges.add(edge.id);
        core.invalidate('structure');
        return edge;
    };

    /** Delete nodes (and every edge touching them) and edges. */
    core.removeItems = function (nodeIds, edgeIds) {
        const nset = new Set(nodeIds || []);
        const eset = new Set(edgeIds || []);
        core.doc.nodes = core.doc.nodes.filter(n => !nset.has(n.id));
        core.doc.edges = core.doc.edges.filter(e => !eset.has(e.id) && !nset.has(e.fromNode) && !nset.has(e.toNode));
        core.reindex();
        core.invalidate('all');
    };

    /** Nodes whose rect lies fully inside the group's rect (JSON Canvas groups are geometric). */
    core.groupChildren = function (group) {
        const out = [];
        const N = (v) => Number(v) || 0;   // coordinates may be strings in a hand-written file
        const gx = N(group.x), gy = N(group.y), gx2 = gx + N(group.width), gy2 = gy + N(group.height);
        for (const n of core.doc.nodes) {
            if (n === group) continue;
            const x = N(n.x), y = N(n.y);
            if (x >= gx && y >= gy && x + N(n.width) <= gx2 && y + N(n.height) <= gy2) out.push(n);
        }
        return out;
    };

    /** The set of nodes that move when `ids` are dragged: the nodes plus the contents of any groups among them. */
    core.expandWithGroupContents = function (ids) {
        const result = new Set(ids);
        const stack = [...ids];
        while (stack.length) {
            const n = core.getNode(stack.pop());
            if (!n || n.type !== 'group') continue;
            for (const c of core.groupChildren(n)) {
                if (!result.has(c.id)) { result.add(c.id); stack.push(c.id); }
            }
        }
        return result;
    };

    // ── Selection ───────────────────────────────────────────────────────────

    core.select = function (nodeIds, edgeIds, opts) {
        if (!opts || !opts.add) { core.selection.nodes.clear(); core.selection.edges.clear(); }
        for (const id of nodeIds || []) if (core._nodeIndex.has(id)) core.selection.nodes.add(id);
        for (const id of edgeIds || []) if (core._edgeIndex.has(id)) core.selection.edges.add(id);
        core.invalidate('selection');
        core.emit('selection');
    };
    core.toggleSelect = function (kind, id) {
        const set = kind === 'edge' ? core.selection.edges : core.selection.nodes;
        if (set.has(id)) set.delete(id); else set.add(id);
        core.invalidate('selection');
        core.emit('selection');
    };
    core.clearSelection = function () {
        if (!core.selection.nodes.size && !core.selection.edges.size) return;
        core.select([], []);
    };
    core.selectedNodes = () => [...core.selection.nodes].map(core.getNode).filter(Boolean);
    core.selectedEdges = () => [...core.selection.edges].map(core.getEdge).filter(Boolean);
    core.hasSelection = () => core.selection.nodes.size + core.selection.edges.size > 0;

    // ── Tools ───────────────────────────────────────────────────────────────

    core.setTool = function (tool, locked) {
        core.tool = tool;
        core.toolLocked = !!locked;
        core.emit('tool', tool);
    };

    // ── View & coordinates ──────────────────────────────────────────────────

    core.viewportEl = null; // set by flow-canvas
    core.MIN_ZOOM = 0.1;
    core.MAX_ZOOM = 4;

    core.setView = function (v) {
        const z = Math.min(core.MAX_ZOOM, Math.max(core.MIN_ZOOM, v.zoom != null ? v.zoom : core.view.zoom));
        core.view = { x: v.x != null ? v.x : core.view.x, y: v.y != null ? v.y : core.view.y, zoom: z };
        core.invalidate('view');
        core.emit('view', core.view);
    };

    core.viewportRect = function () {
        return core.viewportEl ? core.viewportEl.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    };
    core.screenToWorld = function (clientX, clientY) {
        const r = core.viewportRect();
        return { x: (clientX - r.left - core.view.x) / core.view.zoom, y: (clientY - r.top - core.view.y) / core.view.zoom };
    };
    core.worldToScreen = function (x, y) {
        const r = core.viewportRect();
        return { x: x * core.view.zoom + core.view.x + r.left, y: y * core.view.zoom + core.view.y + r.top };
    };
    /** World point at the centre of the visible viewport. */
    core.viewCenter = function () {
        const r = core.viewportRect();
        return core.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    };

    // ── Render scheduling ───────────────────────────────────────────────────

    /**
     * Mark something as needing a redraw. kind: 'all' | 'structure' | 'nodes' | 'edges' | 'selection' | 'view'.
     * For 'nodes', pass ids to redraw just those nodes (their edges are redrawn too).
     */
    core.invalidate = function (kind, ids) {
        const d = core._dirty;
        if (kind === 'all') { d.all = true; d.structure = true; d.edges = true; d.selection = true; d.view = true; }
        else if (kind === 'structure') { d.structure = true; d.edges = true; d.selection = true; }
        else if (kind === 'nodes') { if (ids) for (const id of ids) d.nodes.add(id); else d.all = true; d.edges = true; d.selection = true; }
        else d[kind] = true;
        if (!core._frame) core._frame = requestAnimationFrame(core.renderNow);
    };

    /** Register a renderer. fn(dirty) is called once per frame with the dirty flags. Lower order runs first. */
    core.addRenderer = function (name, fn, order) {
        renderers.push({ name, fn, order: order || 0 });
        renderers.sort((a, b) => a.order - b.order);
    };

    core.renderNow = function () {
        core._frame = 0;
        const d = core._dirty;
        core._dirty = { all: false, nodes: new Set(), edges: false, selection: false, view: false, structure: false };
        for (const r of renderers) {
            try { r.fn(d); } catch (e) { console.error(`Flow: renderer '${r.name}' failed`, e); }
        }
    };

    // ── Pointer gesture dispatch ────────────────────────────────────────────

    /**
     * Classify what a DOM event target is. Elements opt in with data attributes:
     *   data-port="<side>" + data-node-id      connection port on a card
     *   data-handle="<nw|n|ne|e|se|s|sw|w>"    resize handle (on the selected node)
     *   data-edge-end="from|to" + data-edge-id endpoint handle of a selected edge
     *   data-edge-id                            connector or its label
     *   data-group-label + data-node-id         group title tab
     *   data-node-id                            card / group frame
     */
    core.hitTest = function (target) {
        const el = target && target.closest ? target.closest('[data-port],[data-handle],[data-edge-end],[data-edge-id],[data-node-id],[data-ui]') : null;
        if (!el) return { kind: 'canvas' };
        if (el.dataset.ui != null) return { kind: 'ui', el };
        if (el.dataset.port) return { kind: 'port', side: el.dataset.port, id: el.dataset.nodeId, el };
        if (el.dataset.handle) return { kind: 'handle', handle: el.dataset.handle, id: el.dataset.nodeId, el };
        if (el.dataset.edgeEnd) return { kind: 'edge-end', end: el.dataset.edgeEnd, id: el.dataset.edgeId, el };
        if (el.dataset.edgeId) return { kind: 'edge', id: el.dataset.edgeId, label: el.dataset.edgeLabel != null, el };
        if (el.dataset.nodeId) return { kind: 'node', id: el.dataset.nodeId, groupLabel: el.dataset.groupLabel != null, el };
        return { kind: 'canvas' };
    };

    /**
     * Register a pointerdown handler. Handlers run from highest priority down;
     * the first one that returns true owns the gesture.
     * fn(event, hit, worldPoint) -> boolean
     */
    core.addPointerHandler = function (priority, fn) {
        pointerHandlers.push({ priority, fn });
        pointerHandlers.sort((a, b) => b.priority - a.priority);
    };

    core.dispatchPointerDown = function (e) {
        const hit = core.hitTest(e.target);
        const p = core.screenToWorld(e.clientX, e.clientY);
        for (const h of pointerHandlers) {
            try { if (h.fn(e, hit, p)) return true; } catch (err) { console.error('Flow: pointer handler failed', err); }
        }
        return false;
    };

    /**
     * Track a drag after pointerdown. callbacks: move(ev, worldPoint), up(ev, worldPoint), cancel()
     * Escape cancels. Returns a function that ends tracking.
     */
    core.trackDrag = function (downEvent, cb) {
        const pid = downEvent.pointerId;
        const onMove = (ev) => { if (ev.pointerId === pid) cb.move && cb.move(ev, core.screenToWorld(ev.clientX, ev.clientY)); };
        const onUp = (ev) => { if (ev.pointerId !== pid) return; end(); cb.up && cb.up(ev, core.screenToWorld(ev.clientX, ev.clientY)); };
        const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(); cb.cancel && cb.cancel(); } };
        const end = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            window.removeEventListener('keydown', onKey, true);
            core.dragging = null;
        };
        core.dragging = cb;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('keydown', onKey, true);
        return end;
    };

    // ── Misc helpers ────────────────────────────────────────────────────────

    core.GRID = 20;
    core.snapToGrid = (v) => core.prefs.snap ? Math.round(v / core.GRID) * core.GRID : Math.round(v);

    /** Short status message in the corner of the canvas. */
    core.toast = function (msg, kind) { core.emit('toast', { msg, kind: kind || 'info' }); };

    /** Topmost node under a world point (cards before groups). */
    core.nodeAt = function (p, opts) {
        const nodes = core.doc.nodes;
        const exclude = opts && opts.exclude;
        for (let pass = 0; pass < 2; pass++) {
            for (let i = nodes.length - 1; i >= 0; i--) {
                const n = nodes[i];
                if ((pass === 0) === (n.type === 'group')) continue;
                if (exclude && exclude.has(n.id)) continue;
                if (p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height) return n;
            }
            if (opts && opts.cardsOnly) break;
        }
        return null;
    };
})();
