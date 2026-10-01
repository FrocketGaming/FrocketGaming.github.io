/**
 * P8 - Find on canvas (Ctrl+F): searches card text, link and file cards, group titles,
 * step labels and connector labels; rings every match, steps through them with Enter / Shift+Enter.
 * Owns a small bar and one overlay layer; never writes to the document.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;

    const find = Flow.find = {};
    let bar, input, countEl, layer, open = false, query = '';
    let matches = [];   // [{ kind: 'node' | 'edge', id }]
    let current = -1;

    /** The text a node can be found by. */
    function nodeText(n) {
        const parts = [];
        if (n.type === 'group') parts.push(S.str(n.label));
        else if (S.imageCard(n)) parts.push(S.imageCard(n).alt);   // never the picture's base64
        else if (n.type === 'text') parts.push(S.str(n.text));
        else if (n.type === 'link') parts.push(S.str(n.url));
        else if (n.type === 'file') parts.push(S.str(n.file), S.str(n.subpath));
        const step = S.stepType(n);
        if (step) parts.push(step);
        return parts.join('\n').toLowerCase();
    }

    /** Recompute the match list for the current query, keeping the current match when it survives. */
    function search(keep) {
        const q = query.trim().toLowerCase();
        const prev = keep && matches[current];
        matches = [];
        if (q) {
            const sc = core.scene();
            for (const n of core.nodes()) {
                if (sc && sc.hidden.has(n.id)) continue;   // inside a collapsed group
                if (nodeText(n).includes(q)) matches.push({ kind: 'node', id: n.id });
            }
            for (const e of core.edges()) if (S.str(e.label).toLowerCase().includes(q)) matches.push({ kind: 'edge', id: e.id });
        }
        const at = prev ? matches.findIndex(m => m.kind === prev.kind && m.id === prev.id) : -1;
        current = matches.length ? Math.max(0, at) : -1;
        updateCount();
        core.invalidate('view');
    }

    function updateCount() {
        if (!countEl) return;
        countEl.textContent = !query.trim() ? '' : matches.length ? `${current + 1} of ${matches.length}` : 'No matches';
        countEl.classList.toggle('is-empty', !!query.trim() && !matches.length);
        for (const b of bar.querySelectorAll('[data-find-step]')) b.disabled = matches.length < 2;
    }

    /** The world rect of a match (a connector label is a small box at the middle of its line). */
    function rectOf(m) {
        if (m.kind === 'node') {
            const n = core.getNode(m.id);
            if (!n) return null;
            const sc = core.scene(), bar = sc && sc.bars.get(n.id);
            const b = bar || n;
            return { x: Number(b.x) || 0, y: Number(b.y) || 0, width: Number(b.width) || 0, height: Number(b.height) || 0 };
        }
        const e = core.getEdge(m.id);
        const geo = e && Flow.edges.geometry(e);
        if (!geo || !geo.mid) return null;
        return { x: geo.mid.x - 40, y: geo.mid.y - 16, width: 80, height: 32 };
    }

    /** Ring every match (softer) and the current one (strong) in a layer inside the world. */
    function render() {
        if (!layer) return;
        if (!open || !matches.length) { layer.replaceChildren(); return; }
        const frag = document.createDocumentFragment();
        matches.forEach((m, i) => {
            const r = rectOf(m);
            if (!r) return;
            const d = document.createElement('div');
            d.className = 'flow-find-ring' + (i === current ? ' is-current' : '');
            d.style.left = r.x + 'px'; d.style.top = r.y + 'px';
            d.style.width = r.width + 'px'; d.style.height = r.height + 'px';
            frag.appendChild(d);
        });
        layer.replaceChildren(frag);
    }

    /** Select the current match and scroll it into view. */
    function reveal() {
        const m = matches[current];
        if (!m) return;
        if (m.kind === 'node') core.select([m.id], []); else core.select([], [m.id]);
        const r = rectOf(m);
        if (r) Flow.canvas.ensureVisible(r);
        updateCount();
        core.invalidate('view');
    }

    function step(dir) {
        if (!matches.length) return;
        current = (current + dir + matches.length) % matches.length;
        reveal();
    }

    find.open = function () {
        open = true;
        bar.hidden = false;
        const sel = window.getSelection && String(window.getSelection() || '').trim();
        if (sel && !sel.includes('\n')) input.value = query = sel;
        input.focus();
        input.select();
        search(true);
    };

    find.close = function () {
        if (!open) return;
        open = false;
        bar.hidden = true;
        matches = []; current = -1;
        render();
        if (core.viewportEl) core.viewportEl.focus({ preventScroll: true });
    };

    find.isOpen = () => open;

    find.init = function () {
        bar = document.getElementById('flowFind');
        input = document.getElementById('flowFindInput');
        countEl = document.getElementById('flowFindCount');
        layer = document.createElement('div');
        layer.className = 'flow-layer flow-layer-find';
        layer.setAttribute('aria-hidden', 'true');
        document.getElementById('flowWorld').appendChild(layer);

        input.addEventListener('input', () => { query = input.value; search(false); if (matches.length) reveal(); });
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); if (!matches.length) search(false); step(e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); find.close(); }
        });
        bar.addEventListener('pointerdown', (e) => e.stopPropagation());
        const openBtn = document.getElementById('flowFindBtn');
        if (openBtn) openBtn.addEventListener('click', () => { if (open) find.close(); else find.open(); });
        bar.addEventListener('click', (e) => {
            const b = e.target.closest('[data-find-step],[data-find-close]');
            if (!b) return;
            if (b.dataset.findClose != null) find.close(); else step(Number(b.dataset.findStep));
        });
        // Ctrl+F is ours while the chart is up; the browser's own find would miss most of the text anyway.
        document.addEventListener('keydown', (e) => {
            if (!((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f')) return;
            if (document.querySelector('.flow-dialog-backdrop:not([hidden])')) return;
            const t = e.target;
            if (t && t !== input && t.matches && t.matches('input, textarea, [contenteditable]') && !(t.closest && t.closest('#flowFind'))) return;
            e.preventDefault();
            find.open();
        }, true);
        // Keep the rings and the count right as the chart changes under the bar.
        core.on('change', () => { if (open) search(true); });
        core.on('load', () => { if (open) search(false); });
        core.addRenderer('find', () => render(), 55);
    };
})();
