/**
 * P15 - Play: walk a chart. A light (a comet with a fading tail) travels the connectors from the first
 * card; the card it has reached shows a breathing ring, finished cards a check, and at a decision the
 * outgoing connectors grow choice pills. A run can be stepped, played, stepped back, failed at a card
 * (everything downstream of it fades) and reset. A layer can be played on its own: at each decision the
 * run takes the connector that belongs to that layer.
 *
 * A run is an overlay: it draws into #flowOverlay and toggles classes on card / connector elements, and
 * never writes to the document. Playing turns view only mode on (so nothing can be edited meanwhile) and
 * restores it on exit.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);
    const NS = 'http://www.w3.org/2000/svg';

    const play = Flow.play = {};
    const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const SPEEDS = [0.5, 1, 2];
    const BADGE = { done: 'var(--hue-green)', doing: 'var(--hue-orange)', ring: 'var(--bg-primary)', fill: 'var(--flow-card-bg)' };
    const N = (v) => Number(v) || 0;

    let bar, pillsEl, layer, appEl;
    let on = false, weSetView = false;
    // The run
    let order = [], visited = {}, taken = {}, takenList = [], cur = null, awaiting = false, busy = false;
    let auto = false, failedId = null, forced = null, speed = 1, previewEdge = null, startHint = null, timer = 0, runToken = 0;
    const prevStatus = {};
    const parts = new Map();   // edge id -> { march, comet: [path, path, path] }
    const rings = new Map();   // node id -> { ring, rip, badge }

    // ── Graph ───────────────────────────────────────────────────────────────

    /** A connector's direction as drawn: from -> to, unless only its start has an arrowhead. */
    function flowOf(e) {
        const rev = e.fromEnd === 'arrow' && e.toEnd === 'none';
        return rev ? { from: e.toNode, to: e.fromNode, rev: true } : { from: e.fromNode, to: e.toNode, rev: false };
    }
    function liveEdges() { return core.edges().filter(e => e && core.getNode(e.fromNode) && core.getNode(e.toNode)); }
    function outs(id) { return liveEdges().filter(e => flowOf(e).from === id); }
    function edgeById(id) { return core.getEdge(id); }
    function downstream(start) {
        const seen = { [start]: 0 }, q = [start], all = liveEdges();
        while (q.length) {
            const c = q.shift();
            for (const e of all) { const f = flowOf(e); if (f.from === c && seen[f.to] == null) { seen[f.to] = seen[c] + 1; q.push(f.to); } }
        }
        return seen;
    }
    function nodeTitle(n) {
        const t = S.str(n && n.text).split('\n').map(s => s.replace(/^[#>\-*+\s\d.)]+/, '').trim()).find(Boolean);
        return t || S.str(n && n.label) || 'Card';
    }
    function shortTitle(n) { const t = nodeTitle(n); return t.length > 22 ? t.slice(0, 21) + '…' : t; }
    function edgeName(e) { return S.str(e.label).trim() || shortTitle(core.getNode(flowOf(e).to)); }

    function pickStart() {
        const all = liveEdges();
        let cards = core.nodes().filter(n => n && n.type !== 'group' && !core.isHidden(n.id));
        if (forced) {
            const inLayer = cards.filter(n => Flow.layers.layersOf(n).includes(forced));
            if (inLayer.length) cards = inLayer;
        }
        const hasOut = new Set(), hasIn = new Set();
        for (const e of all) {
            if (forced && !Flow.layers.layersOf(e).includes(forced)) continue;
            const f = flowOf(e); hasOut.add(f.from); hasIn.add(f.to);
        }
        let cand = cards.filter(n => hasOut.has(n.id) && !hasIn.has(n.id));
        if (!cand.length) cand = cards.filter(n => hasOut.has(n.id));
        if (!cand.length) cand = cards;
        cand.sort((a, b) => N(a.y) - N(b.y) || N(a.x) - N(b.x));
        return cand[0] ? cand[0].id : null;
    }

    function state() {
        if (failedId) return 'failed';
        if (!cur) return 'idle';
        if (!outs(cur).length || (outs(cur).every(e => visited[flowOf(e).to]))) return 'done';
        return awaiting ? 'choice' : 'running';
    }
    function blockedMap() {
        if (!failedId) return {};
        const d = downstream(failedId), b = {};
        for (const k of Object.keys(d)) if (k !== failedId) b[k] = d[k];
        return b;
    }
    function statusOf(id, blocked) {
        if (id === failedId) return 'failed';
        if (blocked[id] != null) return 'blocked';
        if (id === cur) return state() === 'done' ? 'done' : 'doing';
        return visited[id] ? 'done' : 'todo';
    }
    function runColor() {
        if (forced) { const l = Flow.layers.list().find(x => x.id === forced); if (l) return l.css; }
        return 'var(--accent-primary)';
    }

    // ── Overlay drawing ─────────────────────────────────────────────────────

    const mk = (tag, cls, parent) => {
        const el = document.createElementNS(NS, tag);
        if (cls) el.setAttribute('class', cls);
        if (parent) parent.appendChild(el);
        return el;
    };

    function outline(n) {
        const x = N(n.x), y = N(n.y), w = N(n.width), h = N(n.height);
        const shape = n.type === 'group' || S.imageCard(n) ? 'rect' : S.nodeShape(n);
        const rr = (r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
        if (shape === 'rect') return rr(Math.min(8, w / 2, h / 2));
        if (shape === 'pill') return rr(Math.min(w, h) / 2);
        return S.shapePath(shape, x, y, w, h);
    }

    function ringsFor(id) {
        let r = rings.get(id);
        if (r) return r;
        const n = core.getNode(id);
        if (!n) return null;
        const d = outline(n);
        const ring = mk('path', 'flow-play-ring', layer); ring.setAttribute('d', d);
        const rip = mk('path', 'flow-play-rip', layer); rip.setAttribute('d', d);
        const badge = mk('g', 'flow-play-badge', layer);
        const p = S.statusPoint(n, n.type === 'group' || S.imageCard(n) ? 'rect' : S.nodeShape(n));
        badge.dataset.x = p.x; badge.dataset.y = p.y;
        r = { ring, rip, badge, key: '' };
        rings.set(id, r);
        return r;
    }

    /** Polyline helpers for one connector, in the direction a run travels it. */
    function pathOf(e) {
        const geo = Flow.edges.geometry(e);
        if (!geo || !geo.poly || geo.poly.length < 2) return null;
        let pts = geo.poly.map(p => [N(p.x), N(p.y)]);
        if (flowOf(e).rev) pts = pts.reverse();
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        return { pts, cum, len: cum[cum.length - 1], d: geo.d };
    }
    function pointAt(P, d) {
        d = Math.max(0, Math.min(P.len, d));
        for (let i = 1; i < P.pts.length; i++) {
            if (d <= P.cum[i] || i === P.pts.length - 1) {
                const seg = P.cum[i] - P.cum[i - 1], f = seg ? (d - P.cum[i - 1]) / seg : 1;
                return [P.pts[i - 1][0] + (P.pts[i][0] - P.pts[i - 1][0]) * f, P.pts[i - 1][1] + (P.pts[i][1] - P.pts[i - 1][1]) * f];
            }
        }
        return P.pts[0];
    }
    function sub(P, s, t) {
        s = Math.max(0, s); t = Math.min(P.len, t);
        if (t <= s + 0.5) return '';
        const out = [pointAt(P, s)];
        for (let i = 1; i < P.pts.length; i++) if (P.cum[i] > s && P.cum[i] < t) out.push(P.pts[i]);
        out.push(pointAt(P, t));
        return 'M' + out.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    }

    function partsFor(e) {
        let p = parts.get(e.id);
        if (p) return p;
        const P = pathOf(e);
        if (!P) return null;
        const march = mk('path', 'flow-play-march', layer); march.setAttribute('d', P.d);
        const comet = ['trail', 'mid', 'head'].map(k => mk('path', 'flow-play-comet is-' + k, layer));
        p = { P, march, comet };
        parts.set(e.id, p);
        return p;
    }

    // ── Run ─────────────────────────────────────────────────────────────────

    function ripple(id) {
        const r = ringsFor(id);
        if (!r || !r.rip.animate || reduced()) return;
        r.rip.animate([{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.12)' }], { duration: 700, easing: 'ease-out' });
    }
    function follow(id) {
        const n = core.getNode(id);
        if (n && Flow.canvas.ensureVisible) Flow.canvas.ensureVisible({ x: N(n.x), y: N(n.y), width: N(n.width), height: N(n.height) });
    }
    function visit(id, note, quiet) {
        visited[id] = true; order.push({ id, note: note || '' }); cur = id;
        awaiting = outs(id).filter(e => !visited[flowOf(e).to]).length > 1;
        if (!quiet) { ripple(id); follow(id); }
        paint();
    }
    function drawComet(p, head, tail) {
        const reach = [tail, 60, 16];
        p.comet.forEach((el, i) => el.setAttribute('d', sub(p.P, head - Math.min(reach[i], tail), head)));
    }
    function fly(e, arrive) {
        const p = partsFor(e);
        if (!p || reduced()) { const tok = runToken; timer = setTimeout(() => { if (tok === runToken) arrive(); }, p ? 220 : 160); return; }
        const tail = 110, dur = Math.max(p.P.len / (300 * speed), 0.45 / speed), pps = p.P.len / dur, tok = runToken;
        let t0 = null, arrived = false;
        const frame = (ts) => {
            if (tok !== runToken || !on) { p.comet.forEach(el => el.setAttribute('d', '')); return; }
            if (t0 === null) t0 = ts;
            const head = (ts - t0) / 1000 * pps;
            drawComet(p, head, tail);
            if (!arrived && head >= p.P.len) { arrived = true; arrive(); }
            if (head < p.P.len + tail) requestAnimationFrame(frame);
            else p.comet.forEach(el => el.setAttribute('d', ''));
        };
        requestAnimationFrame(frame);
    }
    function go(e, note) {
        busy = true; awaiting = false; previewEdge = null;
        taken[e.id] = true; takenList.push(e.id); paint();
        const tok = runToken;
        fly(e, () => {
            if (tok !== runToken) return;
            busy = false;
            visit(flowOf(e).to, note);
            const s = state();
            if (s === 'done') { auto = false; paint(); announce(); }
            else if (auto && (s === 'running' || (s === 'choice' && forcedPick()))) timer = setTimeout(stepForward, 300 / speed);
            else announce();
        });
    }
    function forcedPick() {
        if (!forced || !cur) return null;
        return outs(cur).filter(e => !visited[flowOf(e).to] && Flow.layers.layersOf(e).includes(forced))[0] || null;
    }
    function stepForward() {
        if (busy || !on) return;
        const s = state();
        if (s === 'idle') { const id = startHint && core.getNode(startHint) ? startHint : pickStart(); if (id) { visit(id); if (auto) timer = setTimeout(stepForward, 320 / speed); } return; }
        if (s === 'done' || s === 'failed') { auto = false; paint(); return; }
        const open = outs(cur).filter(e => !visited[flowOf(e).to]);
        if (s === 'choice') {
            const pick = forcedPick();
            if (!pick) { paint(); return; }
            go(pick, 'branch: ' + edgeName(pick));
            return;
        }
        go(open[0]);
    }
    function choose(eid) {
        if (busy || state() !== 'choice') return;
        const e = edgeById(eid);
        if (!e) return;
        if (forced && !Flow.layers.layersOf(e).includes(forced)) forced = null;
        go(e, 'branch: ' + edgeName(e));
    }
    function back() {
        if (busy) return;
        auto = false; clearTimeout(timer);
        if (failedId) { failedId = null; paint(); return; }
        if (!cur) return;
        delete visited[cur]; order.pop();
        const te = takenList.pop(); if (te) delete taken[te];
        cur = order.length ? order[order.length - 1].id : null;
        awaiting = cur ? outs(cur).filter(e => !visited[flowOf(e).to]).length > 1 : false;
        paint(); announce();
    }
    function reset(keepForced) {
        runToken++; clearTimeout(timer);
        auto = false; busy = false; order = []; visited = {}; taken = {}; takenList = []; cur = null; awaiting = false; failedId = null; previewEdge = null;
        if (!keepForced) forced = null;
        parts.forEach(p => p.comet.forEach(el => el.setAttribute('d', '')));
        paint();
    }
    function failStep() {
        const s = state();
        if (busy || !(s === 'running' || s === 'choice')) return;
        auto = false; clearTimeout(timer); failedId = cur; paint(); announce();
    }
    function togglePlay() {
        if (state() === 'done' || state() === 'failed') return;
        auto = !auto; paint();
        if (auto) stepForward();
    }

    // ── Painting ────────────────────────────────────────────────────────────

    function announce() {
        const s = state(), blocked = blockedMap(), nb = Object.keys(blocked).length;
        let t = '';
        if (s === 'idle') t = 'Ready';
        else if (s === 'running') t = 'Running';
        else if (s === 'choice') t = 'Choose a branch';
        else if (s === 'failed') t = nb ? `Stopped, ${nb} held up` : 'Stopped';
        else t = `Complete, ${order.length} step${order.length === 1 ? '' : 's'}`;
        $('flowPlayStat').textContent = '';
        const num = document.createElement('span'); num.className = 'flow-play-num'; num.textContent = 'Step ' + order.length;
        $('flowPlayStat').append(num, document.createTextNode(t));
    }

    function paint() {
        if (!on) return;
        const st = state(), blocked = blockedMap(), color = runColor();
        appEl.style.setProperty('--play-color', color);
        // Preview of a branch: the run so far plus what lies beyond that connector.
        let prev = null;
        if (previewEdge) {
            const pe = edgeById(previewEdge);
            if (pe) {
                const dn = downstream(flowOf(pe).to);
                prev = { nodes: {}, edges: {} };
                core.nodes().forEach(n => { if (visited[n.id] || dn[n.id] != null) prev.nodes[n.id] = true; });
                liveEdges().forEach(e => { const f = flowOf(e); if (taken[e.id] || e.id === pe.id || (dn[f.from] != null && dn[f.to] != null)) prev.edges[e.id] = true; });
            }
        }
        for (const n of core.nodes()) {
            const el = Flow.nodes.elementFor(n.id);
            if (!el) continue;
            const s = statusOf(n.id, blocked);
            el.classList.toggle('is-play-cur', s === 'doing');
            el.classList.toggle('is-play-done', s === 'done');
            el.classList.toggle('is-play-failed', s === 'failed');
            el.classList.toggle('is-play-blocked', s === 'blocked');
            el.classList.toggle('is-play-dim', !!prev && !prev.nodes[n.id]);
            el.style.transitionDelay = s === 'blocked' ? (blocked[n.id] * 170) + 'ms' : '';
            const interesting = s === 'doing' || s === 'done' || s === 'failed' || prevStatus[n.id] != null;
            if (!interesting) continue;
            const r = ringsFor(n.id);
            if (!r) continue;
            r.ring.classList.toggle('is-on', s === 'doing');
            const show = s === 'done' || s === 'doing' || s === 'failed';
            r.badge.style.display = show ? '' : 'none';
            if (show && r.key !== s) {
                r.key = s;
                const x = N(r.badge.dataset.x), y = N(r.badge.dataset.y);
                r.badge.innerHTML = s === 'failed'
                    ? `<circle cx="${x}" cy="${y}" r="11" style="fill:var(--error-color);stroke:var(--bg-primary);stroke-width:2"/><path d="M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}" style="fill:none;stroke:var(--bg-primary);stroke-width:2.6;stroke-linecap:round"/>`
                    : S.statusSvg(s, x, y, BADGE);
                if (r.badge.animate && !reduced() && (s === 'done' || s === 'failed') && prevStatus[n.id] !== s) {
                    r.badge.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
                }
            }
            prevStatus[n.id] = s;
        }
        const flowing = !reduced() && (st === 'running' || st === 'choice');
        const hiddenLabels = new Set();
        pillsEl.textContent = '';
        liveEdges().forEach(e => {
            const f = flowOf(e), g = document.querySelector(`#flowEdges .flow-edge[data-edge-id="${CSS.escape(e.id)}"]`);
            const lit = !!taken[e.id];
            if (g) {
                g.classList.toggle('is-play-lit', lit);
                g.classList.toggle('is-play-blocked', blocked[f.from] != null || f.from === failedId);
                g.classList.toggle('is-play-dim', !!prev && !prev.edges[e.id]);
            }
            const pt = lit ? partsFor(e) : parts.get(e.id);
            if (pt) pt.march.classList.toggle('is-on', flowing && lit);
            if (st === 'choice' && !busy && f.from === cur && !visited[f.to]) {
                const P = partsFor(e);
                if (!P) return;
                const mid = pointAt(P.P, P.P.len / 2), i = outs(cur).filter(x => !visited[flowOf(x).to]).indexOf(e) + 1;
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'flow-play-pill'; b.dataset.ui = ''; b.dataset.edge = e.id;
                b.style.left = mid[0] + 'px'; b.style.top = mid[1] + 'px';
                if (i <= 9) { const k = document.createElement('kbd'); k.textContent = String(i); b.appendChild(k); }
                b.appendChild(document.createTextNode(edgeName(e)));
                if (forced && Flow.layers.layersOf(e).includes(forced)) b.classList.add('is-path');
                pillsEl.appendChild(b);
                hiddenLabels.add(e.id);
            }
        });
        document.querySelectorAll('#flowLabels .flow-edge-label').forEach(l => l.classList.toggle('is-play-hidden', hiddenLabels.has(l.dataset.edgeId)));
        controls(st);
        announce();
    }

    function controls(st) {
        const pb = $('flowPlayPlay');
        pb.innerHTML = auto ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        pb.setAttribute('aria-label', auto ? 'Pause' : 'Play');
        pb.disabled = st === 'done' || st === 'failed';
        $('flowPlayStep').disabled = busy || st === 'done' || st === 'failed' || (st === 'choice' && !forcedPick());
        $('flowPlayBack').disabled = busy || !cur;
        $('flowPlayReset').disabled = busy || !cur;
        $('flowPlayFail').disabled = busy || !(st === 'running' || st === 'choice');
        $('flowPlaySpeed').textContent = speed + 'x';
    }

    // ── Entering and leaving ────────────────────────────────────────────────

    function clearLayer() {
        parts.clear(); rings.clear();
        while (layer.firstChild) layer.removeChild(layer.firstChild);
        pillsEl.textContent = '';
        for (const k of Object.keys(prevStatus)) delete prevStatus[k];
        const cls = ['is-play-cur', 'is-play-done', 'is-play-failed', 'is-play-blocked', 'is-play-dim'];
        document.querySelectorAll('#flowNodes .flow-node, #flowGroups .flow-group, #flowGroups .flow-node').forEach(el => { cls.forEach(c => el.classList.remove(c)); el.style.transitionDelay = ''; });
        document.querySelectorAll('#flowEdges .flow-edge').forEach(g => ['is-play-lit', 'is-play-blocked', 'is-play-dim'].forEach(c => g.classList.remove(c)));
        document.querySelectorAll('#flowLabels .is-play-hidden').forEach(l => l.classList.remove('is-play-hidden'));
    }

    play.isOn = () => on;

    play.enter = function (opts) {
        if (on) return;
        Flow.interact.finishEditing();
        const sel = core.selectedNodes().filter(n => n.type !== 'group');
        startHint = sel.length === 1 ? sel[0].id : null;
        if (!core.viewOnly) { Flow.view.set(true, { quiet: true }); weSetView = true; } else weSetView = false;
        on = true;
        document.body.classList.add('flow-playing');
        core.emit('play', true);
        bar.hidden = false;
        layer = document.createElementNS(NS, 'g');
        layer.setAttribute('class', 'flow-play-layer');
        $('flowOverlay').appendChild(layer);
        core.renderNow();   // connector geometry must be current before the first run reads it
        reset();
        if (!(opts && opts.idle)) stepForward();
    };

    play.exit = function () {
        if (!on) return;
        runToken++; clearTimeout(timer);
        auto = false; busy = false;
        clearLayer();
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
        const hadLayer = !!forced;
        on = false; forced = null;
        document.body.classList.remove('flow-playing');
        core.emit('play', false);
        bar.hidden = true;
        if (weSetView) { weSetView = false; Flow.view.set(false, { quiet: true }); }
        if (hadLayer) Flow.layers.clearActive();   // a played layer was switched on for the run
    };
    play.toggle = () => (on ? play.exit() : play.enter());

    /** Play one layer on its own: switch it on, start at its first card and take its connectors at decisions. */
    play.playLayer = function (id) {
        if (!on) play.enter({ idle: true });
        reset();
        forced = id;
        Flow.layers.setActive([id]);
        auto = true;
        paint();
        stepForward();
    };

    play.init = function () {
        bar = $('flowPlay');
        pillsEl = $('flowPlayPills');
        appEl = $('flowApp');
        if (!bar || !pillsEl) return;
        $('flowPlayReset').addEventListener('click', () => reset(false));
        $('flowPlayBack').addEventListener('click', back);
        $('flowPlayPlay').addEventListener('click', togglePlay);
        $('flowPlayStep').addEventListener('click', () => { auto = false; stepForward(); });
        $('flowPlayFail').addEventListener('click', failStep);
        $('flowPlayExit').addEventListener('click', play.exit);
        $('flowPlaySpeed').addEventListener('click', () => {
            speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
            appEl.style.setProperty('--play-speed', speed);
            paint();
        });
        pillsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-edge]'); if (b) choose(b.dataset.edge); });
        pillsEl.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-edge]'); if (b && previewEdge !== b.dataset.edge) { previewEdge = b.dataset.edge; paint(); } });
        pillsEl.addEventListener('pointerout', (e) => { if (e.target.closest('[data-edge]') && previewEdge) { previewEdge = null; paint(); } });
        pillsEl.addEventListener('focusin', (e) => { const b = e.target.closest('[data-edge]'); if (b) { previewEdge = b.dataset.edge; paint(); } });
        pillsEl.addEventListener('focusout', () => { if (previewEdge) { previewEdge = null; paint(); } });
        // Leaving view only by another route (Alt+V, Edit) also ends the run.
        core.on('viewonly', (v) => { if (!v && on) { weSetView = false; play.exit(); } });
        core.on('load', () => { if (on) play.exit(); });
        appEl.style.setProperty('--play-speed', speed);

        window.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
            if (Flow.canvas.isTyping(e) || document.querySelector('.flow-dialog-backdrop:not([hidden])')) return;
            if (e.altKey && !e.shiftKey && e.code === 'KeyP') { e.preventDefault(); e.stopImmediatePropagation(); play.toggle(); return; }
            if (!on || e.altKey) return;
            const t = e.target, tag = t && t.tagName;
            const onBtn = tag === 'BUTTON' || (t && t.getAttribute && t.getAttribute('role') === 'button');
            const k = e.key;
            const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
            if (k === ' ') { if (onBtn) return; eat(); togglePlay(); }
            else if (k === 'ArrowRight') { eat(); auto = false; stepForward(); }
            else if (k === 'ArrowLeft') { eat(); back(); }
            else if (k >= '1' && k <= '9') {
                const open = cur ? outs(cur).filter(x => !visited[flowOf(x).to]) : [];
                if (state() === 'choice' && open[Number(k) - 1]) { eat(); choose(open[Number(k) - 1].id); }
            }
            else if (k === 'f' || k === 'F') { eat(); failStep(); }
            else if (k === 'r' || k === 'R') { eat(); reset(false); }
            else if (k === 'Escape') { eat(); play.exit(); }
        }, true);
    };
})();
