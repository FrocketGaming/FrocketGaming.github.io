/**
 * P16 - Trace and flow: two ambient effects that work any time, not only while playing.
 *  - Flowing lines: dashes march along every connector in its direction, faintly; a connector that leaves a
 *    card flagged "doing" or "done" (the Status flag) flows at full strength, so progress still reads.
 *    Off until switched on (menu or corner button). Pref `lines` === true.
 *  - Hover trace: point at a card and everything upstream and downstream of it stays lit while the rest of
 *    the chart steps back. Paused while dragging, connecting, typing or using another tool. Pref `trace`.
 * Hover trace is on unless its pref is false, flowing lines only when theirs is true; both switch from the
 * menu (lines also from the footer button) and give way to play mode, which draws its own motion. They only toggle classes and add one dash path per flowing connector; the
 * document is never written to.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);
    const NS = 'http://www.w3.org/2000/svg';

    const trace = Flow.trace = {};
    const MAX_FLOWING = 60;   // beyond this many moving connectors a chart is too busy to animate

    const linesOn = () => core.prefs.lines === true;
    const traceOn = () => core.prefs.trace !== false;
    const playing = () => document.body.classList.contains('flow-playing');
    const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    let hoverId = null, force = false, current = null;
    /** The cards on the hovered card's path (a Set of ids), or null. The minimap lights these. */
    trace.current = () => current;

    /** A connector's direction as drawn: from -> to, unless only its start has an arrowhead. */
    function flowOf(e) {
        return e.fromEnd === 'arrow' && e.toEnd === 'none' ? { from: e.toNode, to: e.fromNode, rev: true } : { from: e.fromNode, to: e.toNode, rev: false };
    }

    function edgeEls() {
        const m = new Map();
        document.querySelectorAll('#flowEdges .flow-edge').forEach(g => m.set(g.dataset.edgeId, g));
        return m;
    }
    function labelEls() {
        const m = new Map();
        document.querySelectorAll('#flowLabels .flow-edge-label').forEach(l => m.set(l.dataset.edgeId, l));
        return m;
    }

    // ── Flowing lines ───────────────────────────────────────────────────────

    function lines(d) {
        if (!(force || d.all || d.structure || d.edges || d.nodes.size)) return;
        force = false;
        const on = linesOn() && !playing() && !reduced();
        const els = edgeEls();
        const strong = new Set(), moving = new Set();
        if (on) {
            // Flagged connectors first, so a busy chart spends its cap on the ones that carry meaning.
            const cand = [];
            for (const e of core.edges()) {
                const f = flowOf(e), src = core.getNode(f.from);
                if (!src || src.type === 'group' || !core.getNode(f.to)) continue;
                cand.push({ e, flagged: !!S.statusOf(src) });
            }
            cand.sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0));
            for (const c of cand.slice(0, MAX_FLOWING)) { moving.add(c.e.id); if (c.flagged) strong.add(c.e.id); }
        }
        for (const e of core.edges()) {
            const g = els.get(e.id);
            if (!g) continue;
            const f = flowOf(e);
            const live = moving.has(e.id);
            if (live) {
                const line = g._line || (g._line = g.querySelector('.flow-edge-line'));
                const dd = line && line.getAttribute('d');
                let m = g._march;
                if (!m) {
                    m = g._march = document.createElementNS(NS, 'path');
                    m.setAttribute('class', 'flow-edge-march');
                    g.insertBefore(m, g.querySelector('.flow-edge-hit'));
                }
                if (dd && m._d !== dd) { m._d = dd; m.setAttribute('d', dd); }
            }
            const strongNow = strong.has(e.id);
            if (g._flow !== live || g._rev !== (live && f.rev) || g._strong !== strongNow) {
                g._flow = live; g._rev = live && f.rev; g._strong = strongNow;
                g.classList.toggle('is-flowing', live);
                g.classList.toggle('is-flowing-strong', strongNow);
                g.classList.toggle('is-flowing-rev', live && f.rev);
            }
        }
    }

    // ── Hover trace ─────────────────────────────────────────────────────────

    /** Everything upstream and downstream of a card, as ids. */
    function related(id) {
        const up = new Map(), down = new Map();
        for (const e of core.edges()) {
            if (!core.getNode(e.fromNode) || !core.getNode(e.toNode)) continue;
            const f = flowOf(e);
            (down.get(f.from) || down.set(f.from, []).get(f.from)).push(f.to);
            (up.get(f.to) || up.set(f.to, []).get(f.to)).push(f.from);
        }
        const out = new Set([id]);
        for (const adj of [up, down]) {
            const q = [id], seen = new Set([id]);
            while (q.length) for (const n of adj.get(q.shift()) || []) if (!seen.has(n)) { seen.add(n); out.add(n); q.push(n); }
        }
        return out;
    }

    function apply(id) {
        hoverId = id;
        const rel = id ? related(id) : null;
        current = rel;
        core.emit('trace', rel);
        for (const n of core.nodes()) {
            const el = Flow.nodes.elementFor(n.id);
            if (!el) continue;
            const dim = !!rel && !rel.has(n.id) && n.type !== 'group';
            el.classList.toggle('is-trace-dim', dim);
            el.classList.toggle('is-trace-hit', !!rel && n.id === id);
        }
        const els = edgeEls(), labels = labelEls();
        for (const e of core.edges()) {
            const f = flowOf(e);
            const inPath = !!rel && rel.has(f.from) && rel.has(f.to);
            const g = els.get(e.id), l = labels.get(e.id);
            if (g) { g.classList.toggle('is-trace-dim', !!rel && !inPath); g.classList.toggle('is-trace-path', inPath); }
            if (l) l.classList.toggle('is-trace-dim', !!rel && !inPath);
        }
    }

    /** Whether a hover should trace right now: not mid-gesture, not typing, only with the select tool or in view only. */
    function allowed() {
        if (!traceOn() || playing() || core.dragging || core.editing) return false;
        if (document.body.classList.contains('flow-moving')) return false;
        return core.viewOnly || core.tool === 'select';
    }

    let btn = null;
    function syncButton() {
        if (!btn) return;
        btn.classList.toggle('is-active', linesOn());
        btn.setAttribute('aria-pressed', linesOn() ? 'true' : 'false');
    }

    trace.init = function () {
        const vp = core.viewportEl;
        core.addRenderer('trace-lines', lines, 85);
        vp.addEventListener('pointerover', (e) => {
            if (e.pointerType === 'touch') return;
            const holder = e.target.closest && e.target.closest('[data-node-id]');
            const n = holder && core.getNode(holder.dataset.nodeId);
            const id = n && n.type !== 'group' && allowed() ? n.id : null;
            if (id !== hoverId) apply(id);
        });
        vp.addEventListener('pointerleave', () => { if (hoverId) apply(null); });
        // A press starts a gesture: stop dimming straight away.
        vp.addEventListener('pointerdown', () => { if (hoverId) apply(null); }, true);
        const clear = () => { if (hoverId) apply(null); };
        core.on('change', clear);
        core.on('load', clear);
        core.on('tool', clear);
        core.on('viewonly', () => { clear(); force = true; core.invalidate('edges'); });
        core.on('play', () => { clear(); force = true; core.invalidate('edges'); });
        core.on('prefs', () => { if (!traceOn()) clear(); syncButton(); force = true; core.invalidate('edges'); });
        btn = $('flowLinesBtn');
        if (btn) { btn.addEventListener('click', () => core.setPref('lines', !linesOn())); syncButton(); }
    };
})();
