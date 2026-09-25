/**
 * P3 - Connectors: SVG rendering of JSON Canvas edges, labels, hover ports,
 * drag-to-connect (to a card, or to empty space to create a connected card),
 * endpoint reconnection and label editing.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);
    const SVGNS = 'http://www.w3.org/2000/svg';

    const edges = Flow.edges = {};
    const els = new Map();      // edge id -> { g, hit, line, headEnd, headStart }
    const labelEls = new Map(); // edge id -> label div
    let svg, labelsLayer, overlay, selUI, portsEl = null, hoverNodeId = null, hideTimer = 0;
    let labelEditor = null;
    // Arrowheads grow as you zoom out (up to 2x) so they stay readable at fit zoom.
    const arrowSize = () => Math.min(22, Math.max(11, 10 / (core.view.zoom || 1)));
    let lastZoom = 0;
    const routeCache = new Map(); // connector route plans, keyed by endpoints + sides (see FlowStatic.planPath)

    edges.init = function () {
        svg = $('flowEdges');
        labelsLayer = $('flowLabels');
        overlay = $('flowOverlay');
        selUI = $('flowSelUI');
        core.addRenderer('edges', renderEdges, 10);
        core.addRenderer('edge-ui', renderEdgeUI, 60);

        // Ports: drag from a card's side dot.
        core.addPointerHandler(950, (e, hit) => {
            if (e.button !== 0) return false;
            if (hit.kind === 'port') { edges.startConnect(e, hit.id, hit.side, { fromPort: true }); return true; }
            if (hit.kind === 'edge-end') { startReconnect(e, hit.id, hit.end); return true; }
            return false;
        });
        // Connector tool: drag from anywhere on a card.
        core.addPointerHandler(800, (e, hit) => {
            if (core.tool !== 'connect' || e.button !== 0) return false;
            if (hit.kind !== 'node') return false;
            edges.startConnect(e, hit.id, null, {});
            return true;
        });

        const vp = core.viewportEl;
        vp.addEventListener('pointermove', onHoverMove);
        vp.addEventListener('pointerleave', () => scheduleHidePorts());
        core.on('view', () => { if (portsEl) positionPorts(); });
        // Labels are laid out cheaply during drags; lay them all out again once it's committed.
        core.on('change', () => core.invalidate('edges'));
        core.on('load', (info) => {
            hidePorts(); stopLabelEdit(false);
            // A chart opened from a file or a snippet has no pin information (JSON Canvas
            // stores only the sides), so every edge is auto: its stored sides are drawn as-is
            // and only re-picked when the user moves one of its cards. The autosave restore
            // (source null) brings its own auto/pinned list.
            if (info && (info.source === 'file' || info.source === 'snippet')) {
                for (const e of core.edges()) if (e && typeof e.id === 'string') core.autoEdges.add(e.id);
            }
        });
    };

    // ── Geometry ────────────────────────────────────────────────────────────

    /** The geometry last drawn for an edge (ports spread, tracks separated), or a fresh single-edge one. */
    edges.geometry = function (edge) {
        const r = edge && els.get(edge.id);
        if (r && r.geo) return r.geo;
        return S.edgeGeometry(edge, core.nodeIndex(), { arrowSize: arrowSize(), nodes: core.nodes(), cache: routeCache });
    };

    /** Best sides for a connector between nodes a and b, avoiding the other cards. */
    function pickSides(a, b, route, current, edgeId, idx) {
        return S.bestSides(a, b, core.nodes(), route || 'curve', current, sideUse(a, b, edgeId), idx);
    }

    /** How many other connectors leave from / arrive at each side of nodes a and b. */
    function sideUse(a, b, edgeId) {
        const use = { a: {}, b: {} };
        const bump = (key, side, dir) => { const u = use[key][side] || (use[key][side] = { in: 0, out: 0 }); u[dir]++; };
        for (const e of core.edges()) {
            if (!e || e.id === edgeId) continue;
            for (const [key, n] of [['a', a], ['b', b]]) {
                if (e.fromNode === n.id && e.fromSide) bump(key, e.fromSide, 'out');
                if (e.toNode === n.id && e.toSide) bump(key, e.toSide, 'in');
            }
        }
        return use;
    }
    edges.pickSides = pickSides;

    /** Re-pick sides of auto-routed edges touching these nodes (call inside a transaction). */
    edges.refreshAutoSides = function (nodeIds) {
        if (!core.autoEdges.size) return;
        const set = nodeIds ? new Set(nodeIds) : null;
        // Edges whose end a moved card now sits on are re-picked too (their side is buried).
        const moved = set ? [...set].map(id => core.getNode(id)).filter(n => n && n.type !== 'group') : [];
        const covered = (n, side) => {
            if (!n || !side) return false;
            const p = S.anchor(n, side);
            return moved.some(m => m !== n && p.x > m.x - 2 && p.x < m.x + m.width + 2 && p.y > m.y - 2 && p.y < m.y + m.height + 2);
        };
        let idx = null; // one scene index for every re-pick in this pass
        for (const e of core.edges()) {
            if (!core.autoEdges.has(e.id)) continue;
            if (set && !set.has(e.fromNode) && !set.has(e.toNode) &&
                !covered(core.getNode(e.fromNode), e.fromSide) && !covered(core.getNode(e.toNode), e.toSide)) continue;
            const a = core.getNode(e.fromNode), b = core.getNode(e.toNode);
            if (!a || !b || a === b) continue;
            // A side the file left out stays out: render-time routing picks it (spec: sides are
            // optional). Only sides that are already stored get re-picked.
            const hasF = e.fromSide != null, hasT = e.toSide != null;
            if (!hasF && !hasT) continue;
            // While the cards overlap (mid-drag) any pair of sides is as bad as another: keep them.
            if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) continue;
            if (!idx) idx = S.sceneIndex(core.nodes());
            const [fs, ts] = pickSides(a, b, S.edgeRoute(e), [e.fromSide, e.toSide], e.id, idx);
            if (hasF && e.fromSide !== fs) e.fromSide = fs;
            if (hasT && e.toSide !== ts) e.toSide = ts;
        }
    };

    // ── Rendering ───────────────────────────────────────────────────────────

    function mk(tag, cls) {
        const el = document.createElementNS(SVGNS, tag);
        if (cls) el.setAttribute('class', cls);
        return el;
    }

    function renderEdges(d) {
        const zoomChanged = Math.abs(core.view.zoom - lastZoom) > 1e-4;
        if (!(d.all || d.structure || d.edges || d.nodes.size || (d.view && zoomChanged))) return;
        lastZoom = core.view.zoom;
        const seen = new Set();
        const list = core.edges();
        const AS = arrowSize();
        // Lay out every connector together: shared sides are spread, shared channels split.
        const layout = S.layoutEdges(list, core.nodeIndex(), { nodes: core.nodes(), cache: routeCache, arrowSize: AS });
        // Labels: the same layout as export (S.layoutLabels). While a drag is in progress only
        // the labels whose connector moved are re-placed, cheaply; the full layout runs on release.
        const labelAt = core.dragging ? null : S.layoutLabels(list, layout, layout.idx);
        const set = (el, name, v) => { if (el['_' + name] !== v) { el['_' + name] = v; el.setAttribute(name, v); } };
        let i = 0;
        for (const e of list) {
            if (!e || typeof e.id !== 'string') continue;
            seen.add(e.id);
            let r = els.get(e.id);
            if (!r) {
                const g = mk('g', 'flow-edge');
                g.dataset.edgeId = e.id;
                const line = mk('path', 'flow-edge-line');
                const headEnd = mk('path', 'flow-edge-head');
                const headStart = mk('path', 'flow-edge-head');
                const hit = mk('path', 'flow-edge-hit');
                g.append(line, headEnd, headStart, hit);
                r = { g, line, headEnd, headStart, hit };
                els.set(e.id, r);
            }
            if (svg.children[i] !== r.g) svg.insertBefore(r.g, svg.children[i] || null);
            i++;
            const geo = layout.get(e);
            if (!geo) { r.g.style.display = 'none'; r.geo = null; removeLabel(e.id); continue; }
            if (r.g.style.display) r.g.style.display = '';
            set(r.line, 'd', geo.d);
            set(r.hit, 'd', geo.d);
            const dash = S.edgeDash(e);
            if (r.line._dv !== dash) { r.line._dv = dash; if (dash) r.line.setAttribute('stroke-dasharray', dash); else r.line.removeAttribute('stroke-dasharray'); }
            const he = geo.arrowEnd ? '' : 'none', hs = geo.arrowStart ? '' : 'none';
            if (r.headEnd.style.display !== he) r.headEnd.style.display = he;
            if (geo.arrowEnd) set(r.headEnd, 'd', S.arrowPath(geo.endTip, geo.endDir, geo.endSize || AS));
            if (r.headStart.style.display !== hs) r.headStart.style.display = hs;
            if (geo.arrowStart) set(r.headStart, 'd', S.arrowPath(geo.startTip, geo.startDir, geo.startSize || AS));
            const has = S.hasColor(e.color);
            const col = has ? S.varPaint().color(e.color, '--text-secondary') : '';
            if (r._col !== col) { r._col = col; r.g.style.setProperty('--edge-color', col); }
            r.g.classList.toggle('has-color', has);
            r.g.classList.toggle('is-selected', core.selection.edges.has(e.id));
            const moved = !r.geo || r.geo.d !== geo.d;
            r.geo = geo;
            renderLabel(e, geo, labelAt, moved);
        }
        for (const [id, r] of els) {
            if (!seen.has(id)) { r.g.remove(); els.delete(id); removeLabel(id); }
        }
    }

    function renderLabel(e, geo, labelAt, moved) {
        const editing = labelEditor && labelEditor.id === e.id;
        let el = labelEls.get(e.id);
        const text = S.str(e.label); // label may be any JSON value
        if (!text && !editing) { removeLabel(e.id); return; }
        if (!el) {
            el = document.createElement('div');
            el.className = 'flow-edge-label';
            el.dataset.edgeId = e.id;
            el.dataset.edgeLabel = '';
            labelsLayer.appendChild(el);
            labelEls.set(e.id, el);
        }
        el.classList.toggle('is-selected', core.selection.edges.has(e.id));
        el.classList.toggle('has-color', S.hasColor(e.color));
        const col = S.hasColor(e.color) ? S.varPaint().color(e.color, '--text-secondary') : '';
        if (el._col !== col) { el._col = col; el.style.setProperty('--edge-color', col); }
        if (!editing && el._text !== text) { el._text = text; el.textContent = text; }
        // Box and position come from the shared layout (S.labelBox / S.layoutLabels): no DOM reads.
        const bx = S.labelBox(text || ' ');
        let lp = labelAt && labelAt.get(e);
        if (!lp) {
            // Mid-drag: keep the last spot unless this connector moved; then take the first valid spot.
            lp = !moved && el._lp ? el._lp : S.labelPoint(geo, null, { w: bx.w * S.LABEL_RESERVE, h: bx.h * S.LABEL_RESERVE });
        }
        el._lp = lp;
        // Long lines are ellipsised (S.LABEL_MAX_EM, same rule as export): show the full text on hover.
        const tip = !editing && bx.cut ? text : '';
        if (el._tip !== tip) { el._tip = tip; if (tip) el.title = tip; else el.removeAttribute('title'); }
        const left = lp.x + 'px', top = lp.y + 'px';
        if (el.style.left !== left) el.style.left = left;
        if (el.style.top !== top) el.style.top = top;
    }

    function removeLabel(id) {
        const el = labelEls.get(id);
        if (el) { el.remove(); labelEls.delete(id); }
    }

    /** Endpoint handles for a single selected edge. */
    function renderEdgeUI(d) {
        if (!(d.all || d.selection || d.structure || d.edges || d.nodes.size)) return;
        for (const [id, r] of els) {
            const on = core.selection.edges.has(id);
            r.g.classList.toggle('is-selected', on);
            const l = labelEls.get(id);
            if (l) l.classList.toggle('is-selected', on);
        }
        let box = selUI.querySelector('.flow-edge-ends');
        const sel = core.selectedEdges();
        if (sel.length !== 1 || core.selection.nodes.size) { if (box) box.remove(); return; }
        const e = sel[0];
        const r = els.get(e.id);
        if (!r || !r.geo) { if (box) box.remove(); return; }
        if (!box) { box = document.createElement('div'); box.className = 'flow-edge-ends'; selUI.appendChild(box); }
        box.innerHTML = `<div class="flow-edge-end" data-edge-end="from" data-edge-id="${S.escapeHtml(e.id)}" style="left:${+r.geo.startTip.x || 0}px;top:${+r.geo.startTip.y || 0}px"></div>` +
            `<div class="flow-edge-end" data-edge-end="to" data-edge-id="${S.escapeHtml(e.id)}" style="left:${+r.geo.endTip.x || 0}px;top:${+r.geo.endTip.y || 0}px"></div>`;
    }

    // ── Hover ports ─────────────────────────────────────────────────────────

    function onHoverMove(e) {
        if (core.dragging || core.editing || core.tool === 'hand' || core.viewportEl.classList.contains('is-space')) { if (!core.dragging) hidePorts(); return; }
        const t = e.target;
        if (t.closest('.flow-ports')) { clearTimeout(hideTimer); return; }
        const nodeEl = t.closest('.flow-node');
        let id = nodeEl ? nodeEl.dataset.nodeId : null;
        if (id && id !== hoverNodeId) {
            const n = core.getNode(id);
            const shape = n && S.nodeShape(n);
            if (shape === 'diamond' || shape === 'circle') {
                const p = core.screenToWorld(e.clientX, e.clientY);
                if (!S.inShape(n, p, -8)) id = null;
            }
        }
        if (!id) {
            // Also keep ports while the pointer is just outside the card, near a port.
            if (hoverNodeId) {
                const n = core.getNode(hoverNodeId);
                const p = core.screenToWorld(e.clientX, e.clientY);
                const m = 24 / core.view.zoom;
                if (n && p.x > n.x - m && p.x < n.x + n.width + m && p.y > n.y - m && p.y < n.y + n.height + m) { clearTimeout(hideTimer); return; }
            }
            scheduleHidePorts();
            return;
        }
        clearTimeout(hideTimer);
        if (id !== hoverNodeId) showPorts(id);
    }

    function showPorts(id) {
        hoverNodeId = id;
        if (!portsEl) {
            portsEl = document.createElement('div');
            portsEl.className = 'flow-ports';
            selUI.appendChild(portsEl);
        }
        portsEl.innerHTML = S.SIDES.map(s => `<div class="flow-port flow-port-${s}" data-port="${s}" data-node-id="${S.escapeHtml(id)}" title="Drag to connect (hold Alt to pin sides) · click the dot to add a connected card"></div>`).join('');
        positionPorts();
    }

    function positionPorts() {
        const n = core.getNode(hoverNodeId);
        if (!n || !portsEl) { hidePorts(); return; }
        portsEl.style.left = n.x + 'px';
        portsEl.style.top = n.y + 'px';
        portsEl.style.width = n.width + 'px';
        portsEl.style.height = n.height + 'px';
    }
    core.addRenderer('ports', (d) => { if (portsEl && (d.nodes.size || d.all || d.structure)) positionPorts(); }, 70);

    function scheduleHidePorts() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hidePorts, 160);
    }
    function hidePorts() {
        clearTimeout(hideTimer);
        if (portsEl) { portsEl.remove(); portsEl = null; }
        hoverNodeId = null;
    }
    edges.hidePorts = hidePorts;

    // ── Connect gesture ─────────────────────────────────────────────────────

    function tempPath() {
        const g = mk('g', 'flow-temp-edge');
        const line = mk('path', 'flow-edge-line');
        const head = mk('path', 'flow-edge-head');
        g.append(line, head);
        overlay.appendChild(g);
        return { g, line, head };
    }

    /** The card under p, by its drawn shape (a diamond's or circle's empty corners don't count). */
    function targetAt(p, excludeId) {
        const ex = new Set([excludeId]);
        for (let k = 0; k < 4; k++) {
            const n = core.nodeAt(p, { exclude: ex });
            if (!n || n.type === 'group' || S.inShape(n, p, -6)) return n;
            ex.add(n.id);
        }
        return null;
    }

    function setTargetHighlight(id) {
        document.querySelectorAll('.is-connect-target').forEach(el => el.classList.remove('is-connect-target'));
        if (id) {
            const el = Flow.nodes.elementFor(id);
            if (el) el.classList.add('is-connect-target');
        }
    }

    /**
     * Click on a port dot: a new card on that side, connected, ready to type.
     * A card in the way is stepped over along the port's axis (so "below" stays below);
     * only earlier children on the same side fan out sideways.
     */
    function addCardFromPort(fromId, side) {
        const from = core.getNode(fromId);
        if (!from) return;
        const [ux, uy] = S.NORMAL[side];
        const toSide = S.OPPOSITE[side];
        const sized = from.type === 'text' || from.type === 'link' || from.type === 'file';
        const shape = S.nodeShape(from);
        const round = shape === 'diamond' || shape === 'circle';
        const nw = sized && !round ? from.width : Flow.nodes.DEFAULT_W;
        const nh = sized && !round ? from.height : Flow.nodes.DEFAULT_H;
        const gap = ux ? 140 : 80;
        const kids = new Set(core.edges().filter(e => e.fromNode === fromId && e.fromSide === side).map(e => e.toNode));
        let x, y;
        if (ux) { x = ux > 0 ? from.x + from.width + gap : from.x - gap - nw; y = from.y + from.height / 2 - nh / 2; }
        else { x = from.x + from.width / 2 - nw / 2; y = uy > 0 ? from.y + from.height + gap : from.y - gap - nh; }
        for (let i = 0; i < 40; i++) {
            const hit = core.nodes().find(n => n.type !== 'group' && n.id !== fromId &&
                x < n.x + n.width + 20 && x + nw > n.x - 20 && y < n.y + n.height + 20 && y + nh > n.y - 20);
            if (!hit) break;
            if (kids.has(hit.id)) {
                // A sibling from this same side: fan out beside it.
                if (ux) y = hit.y + hit.height + 40; else x = hit.x + hit.width + 40;
            } else if (ux > 0) x = hit.x + hit.width + 60;
            else if (ux < 0) x = hit.x - 60 - nw;
            else if (uy > 0) y = hit.y + hit.height + 60;
            else y = hit.y - 60 - nh;
        }
        core.begin('Add connected card');
        const node = Flow.nodes.createCard({ x, y }, { center: false, width: nw, height: nh });
        node.x = Math.round(x); node.y = Math.round(y);
        core.addEdge({ id: core.newId(), fromNode: fromId, fromSide: side, toNode: node.id, toSide }, { auto: true });
        core.reindex();
        core.invalidate('all');
        if (Flow.canvas && Flow.canvas.ensureVisible) Flow.canvas.ensureVisible(node);
        Flow.nodes.startEdit(node.id, { isNew: true, ownTxn: true });
    }

    /** Is the screen point on the visible dot of `side` of node n (not just its halo)? */
    function onPortDot(n, side, clientX, clientY) {
        const a = S.anchor(n, side);
        const s = core.worldToScreen(a.x, a.y);
        return Math.hypot(s.x - clientX, s.y - clientY) <= 8;
    }

    /** A click on a port's halo (not its dot) acts on whatever is underneath: an edge, its label or the card. */
    function clickThrough(clientX, clientY, fromId) {
        const el = document.elementFromPoint(clientX, clientY);
        const hit = core.hitTest(el);
        if (hit.kind === 'edge') { core.select([], [hit.id]); return; }
        if (hit.kind === 'node') { core.select([hit.id], []); return; }
        core.select([fromId], []);
    }

    /** Nearest spot to rect r (x, y, w, h) that doesn't overlap a card (with a 24px gap). */
    function freeSpot(r, avoidIds) {
        const cards = core.nodes().filter(n => n.type !== 'group' || (avoidIds && avoidIds.has(n.id)));
        const gap = 24;
        const hits = (x, y) => cards.some(n => x < n.x + n.width + gap && x + r.w > n.x - gap && y < n.y + n.height + gap && y + r.h > n.y - gap);
        if (!hits(r.x, r.y)) return { x: r.x, y: r.y };
        const step = core.GRID || 20;
        const cands = [];
        for (let dx = -30; dx <= 30; dx++) for (let dy = -30; dy <= 30; dy++) {
            if (dx || dy) cands.push([dx * step, dy * step, Math.hypot(dx, dy)]);
        }
        cands.sort((p, q) => p[2] - q[2]);
        for (const [dx, dy] of cands) if (!hits(r.x + dx, r.y + dy)) return { x: r.x + dx, y: r.y + dy };
        return { x: r.x, y: r.y };
    }

    /**
     * Start dragging a new connector from node `fromId`.
     * side = the port it started from (or null for the connector tool).
     * The new edge is auto-sided (re-picked as cards move) unless Alt is held when it is
     * dropped: then the sides are pinned to the port it left from and the side nearest
     * the drop point.
     */
    edges.startConnect = function (downEvent, fromId, side, opts) {
        const from = core.getNode(fromId);
        if (!from) return;
        opts = opts || {};
        const onDot = opts.fromPort && side ? onPortDot(from, side, downEvent.clientX, downEvent.clientY) : false;
        hidePorts();
        const t = tempPath();
        const start = { x: downEvent.clientX, y: downEvent.clientY };
        let moved = false, target = null, toSide = null, fromSide = side, pin = false;
        let leftSource = false, overSource = false;
        const startWorld = core.screenToWorld(start.x, start.y);
        const NEXT = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
        document.body.classList.add('flow-connecting');

        const draw = (p, alt, ev) => {
            pin = !!alt;
            // Onto its own card after a deliberate drag (left it, or moved 24px+): a self-loop.
            overSource = p.x > from.x && p.x < from.x + from.width && p.y > from.y && p.y < from.y + from.height;
            if (!overSource || (ev && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) >= 24)) leftSource = true;
            target = overSource ? (leftSource ? from : null) : targetAt(p, fromId);
            let endPt = p, ts = null;
            if (target === from) {
                fromSide = side || S.nearestSide(from, startWorld);
                // A loop comes back on a neighbouring side (the one nearer the pointer), never the opposite one.
                const nb = [NEXT[fromSide], Object.keys(NEXT).find(k => NEXT[k] === fromSide)];
                const d2 = (sd) => { const q = S.anchor(from, sd); return (q.x - p.x) ** 2 + (q.y - p.y) ** 2; };
                ts = d2(nb[0]) <= d2(nb[1]) ? nb[0] : nb[1];
                endPt = S.anchor(from, ts);
            } else if (target) {
                if (pin) {
                    fromSide = side || S.facingSide(from, S.center(target));
                    ts = S.nearestSide(target, p);
                } else {
                    [fromSide, ts] = pickSides(from, target, 'curve');
                }
                endPt = S.anchor(target, ts);
            } else {
                fromSide = pin && side ? side : S.facingSide(from, p);
            }
            toSide = ts;
            const geo = S.connectorGeometry(S.anchor(from, fromSide), fromSide, endPt, ts, {
                arrowEnd: true, arrowSize: arrowSize(),
                ctx: target ? S.routeContext(from, target, core.nodes()) : null,
            });
            t.line.setAttribute('d', geo.d);
            t.head.setAttribute('d', S.arrowPath(geo.endTip, geo.endDir, arrowSize()));
            t.g.classList.toggle('is-pinned', pin);
            setTargetHighlight(target && target.id);
        };

        core.trackDrag(downEvent, {
            move: (ev, p) => {
                if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
                moved = true;
                draw(p, ev.altKey, ev);
            },
            up: (ev, p) => {
                // Settle the final target first, then clear every drag-only visual.
                if (moved) draw(p, ev.altKey, ev);
                if (moved && !target && overSource) {
                    // Wiggled on its own card without leaving it: nothing to do.
                    t.g.remove(); setTargetHighlight(null); document.body.classList.remove('flow-connecting');
                    return;
                }
                t.g.remove();
                setTargetHighlight(null);
                document.body.classList.remove('flow-connecting');
                if (moved && core.tool === 'connect' && !core.toolLocked) core.setTool('select');
                if (!moved) {
                    if (!opts.fromPort) return;
                    // Only a click right on the dot adds a connected card; a click on the
                    // halo around it selects what is underneath.
                    if (onDot) addCardFromPort(fromId, side);
                    else clickThrough(ev.clientX, ev.clientY, fromId);
                    return;
                }
                if (target) {
                    core.change('Connect', () => {
                        const edge = core.addEdge({ id: core.newId(), fromNode: fromId, fromSide: fromSide, toNode: target.id, toSide: toSide }, { auto: !pin });
                        core.select([], [edge.id]);
                    });
                    return;
                }
                // Dropped on empty canvas: create a new card there, connected, and start typing.
                const fs = fromSide;
                const a = S.anchor(from, fs);
                const dx = p.x - a.x, dy = p.y - a.y;
                let ts;
                if (Math.abs(dx) > Math.abs(dy)) ts = dx > 0 ? 'left' : 'right';
                else ts = dy > 0 ? 'top' : 'bottom';
                const w = from.type === 'text' ? from.width : Flow.nodes.DEFAULT_W;
                const h = from.type === 'text' ? from.height : Flow.nodes.DEFAULT_H;
                let x = p.x - w / 2, y = p.y - h / 2;
                if (ts === 'left') x = p.x; else if (ts === 'right') x = p.x - w;
                if (ts === 'top') y = p.y; else if (ts === 'bottom') y = p.y - h;
                // Never land on top of an existing card: take the nearest free spot.
                const spot = freeSpot({ x, y, w, h });
                core.begin('Add connected card');
                const node = Flow.nodes.createCard({ x: spot.x, y: spot.y }, { center: false, width: w, height: h });
                node.x = Math.round(spot.x); node.y = Math.round(spot.y);
                const [afs, ats] = pin ? [fs, ts] : pickSides(from, node, 'curve');
                core.addEdge({ id: core.newId(), fromNode: fromId, fromSide: afs, toNode: node.id, toSide: ats }, { auto: !pin });
                core.reindex();
                core.invalidate('all');
                Flow.nodes.startEdit(node.id, { isNew: true, ownTxn: true });
            },
            cancel: () => { t.g.remove(); setTargetHighlight(null); document.body.classList.remove('flow-connecting'); },
        });
    };

    function startReconnect(downEvent, edgeId, end) {
        const edge = core.getEdge(edgeId);
        if (!edge) return;
        const fixedId = end === 'from' ? edge.toNode : edge.fromNode;
        const fixed = core.getNode(fixedId);
        const r = els.get(edgeId);
        if (!fixed || !r) return;
        const t = tempPath();
        r.g.classList.add('is-reconnecting');
        const geo0 = r.geo;
        const fixedSide = end === 'from' ? geo0.toSide : geo0.fromSide;
        let target = null, tSide = null, fSide = fixedSide, pin = false;
        const route = S.edgeRoute(edge);
        const draw = (p, alt) => {
            pin = !!alt;
            target = targetAt(p, fixedId);
            let pt = p;
            tSide = null; fSide = fixedSide;
            if (target) {
                if (pin) tSide = S.nearestSide(target, p);
                else {
                    const [x, y] = end === 'to' ? pickSides(fixed, target, route, null, edge.id) : pickSides(target, fixed, route, null, edge.id);
                    if (end === 'to') { fSide = x; tSide = y; } else { tSide = x; fSide = y; }
                }
                pt = S.anchor(target, tSide);
            }
            const fa = S.anchor(fixed, fSide);
            const ctx = target ? (end === 'to' ? S.routeContext(fixed, target, core.nodes()) : S.routeContext(target, fixed, core.nodes())) : null;
            const o = { arrowEnd: true, arrowSize: arrowSize(), route, ctx };
            const geo = end === 'to' ? S.connectorGeometry(fa, fSide, pt, tSide, o) : S.connectorGeometry(pt, tSide, fa, fSide, o);
            t.line.setAttribute('d', geo.d);
            t.head.setAttribute('d', S.arrowPath(geo.endTip, geo.endDir, arrowSize()));
            t.g.classList.toggle('is-pinned', pin);
            setTargetHighlight(target && target.id);
        };
        core.trackDrag(downEvent, {
            move: (ev, p) => draw(p, ev.altKey),
            up: (ev, p) => {
                draw(p, ev.altKey);
                t.g.remove(); r.g.classList.remove('is-reconnecting'); setTargetHighlight(null);
                if (!target) return;
                core.change('Reconnect', () => {
                    if (end === 'to') { edge.toNode = target.id; edge.toSide = tSide; if (edge.fromSide !== fSide) edge.fromSide = fSide; }
                    else { edge.fromNode = target.id; edge.fromSide = tSide; if (edge.toSide !== fSide) edge.toSide = fSide; }
                    // Dropped plainly: auto (re-aims as cards move). With Alt: pinned to the side dropped on.
                    if (pin) core.autoEdges.delete(edge.id); else core.autoEdges.add(edge.id);
                });
            },
            cancel: () => { t.g.remove(); r.g.classList.remove('is-reconnecting'); setTargetHighlight(null); },
        });
    }

    // ── Label editing ───────────────────────────────────────────────────────

    edges.editLabel = function (id) {
        const e = core.getEdge(id);
        if (!e) return;
        if (Flow.nodes.isEditing()) Flow.nodes.stopEdit();
        stopLabelEdit(true);
        core.select([], [id]);
        core.begin('Label');
        labelEditor = { id, before: e.label };
        core.renderNow();
        let el = labelEls.get(id);
        if (!el) {
            const r = els.get(id);
            if (!r || !r.geo) { core.cancel(); labelEditor = null; return; }
            renderLabel(e, r.geo);
            el = labelEls.get(id);
        }
        el.classList.add('is-editing');
        el.textContent = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'flow-edge-label-input';
        input.value = S.str(e.label);
        input.placeholder = 'Label';
        input.size = Math.max(4, input.value.length + 1);
        el.appendChild(input);
        labelEditor.input = input;
        core.editing = { kind: 'edge', id };
        core.emit('editing', core.editing);
        input.addEventListener('input', () => {
            input.size = Math.max(4, input.value.length + 1);
            if (input.value) e.label = input.value; else delete e.label;
        });
        input.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
                ev.preventDefault();
                stopLabelEdit(true);
                if (Flow.snippets) Flow.snippets.quickSave();
                return;
            }
            if (ev.key === 'Enter' || ev.key === 'Escape' || ev.key === 'Tab') { ev.preventDefault(); stopLabelEdit(true); core.viewportEl.focus({ preventScroll: true }); }
        });
        input.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        input.addEventListener('blur', () => setTimeout(() => { if (labelEditor && labelEditor.input === input) stopLabelEdit(true); }, 0));
        input.focus();
        input.select();
    };

    function stopLabelEdit(commit) {
        if (!labelEditor) return;
        const ed = labelEditor;
        labelEditor = null;
        const e = core.getEdge(ed.id);
        if (e && e.label != null) e.label = String(e.label).trim() || undefined;
        if (e && e.label === undefined) delete e.label;
        const el = labelEls.get(ed.id);
        if (el) { el.classList.remove('is-editing'); el.textContent = e ? S.str(e.label) : ''; }
        core.editing = null;
        if (commit) core.commit(); else core.cancel();
        core.invalidate('edges');
        core.emit('editing', null);
    }
    edges.stopLabelEdit = () => stopLabelEdit(true);
    edges.isEditingLabel = () => !!labelEditor;
})();
