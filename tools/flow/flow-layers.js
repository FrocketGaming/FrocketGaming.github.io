/**
 * P14 - Layers: named groups of cards and connectors (a route, a team, a failure mode) that can be
 * switched on to focus the chart. Definitions live at the document root (`flowLayers`), membership on
 * each card / connector (`styleAttributes.layers`, a list of layer ids). Which layers are switched on is
 * view state only: it is never saved and never touches the document. Switching layers on dims everything
 * outside them, rings and tints what is left, and shows a dot per layer on every card.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);

    const layers = Flow.layers = {};
    /** Preset colour keys handed out in turn to new layers (see FlowStatic.PRESETS). */
    const PALETTE = ['5', '6', '2', '4', '1', '3'];
    const MAX_NAME = 40;

    const active = new Set();   // layer ids switched on (view state)
    let pop, btn, list, renaming = null, force = false, decorated = false;

    const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const clean = (s) => S.str(s).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

    // ── Data ────────────────────────────────────────────────────────────────

    /** Layer definitions, read defensively: the file may hold anything. */
    function defs() {
        const a = core.doc && core.doc.flowLayers;
        return Array.isArray(a) ? a.filter(l => isObj(l) && typeof l.id === 'string' && l.id) : [];
    }
    /** Colour key of a layer: its own when valid, otherwise one from the palette by position. */
    function colorKey(l, i) { return S.hasColor(l.color) ? l.color : PALETTE[i % PALETTE.length]; }
    function css(l, i) { return Flow.nodes.cssColor(colorKey(l, i)); }
    function layersOf(o) {
        const sa = o && o.styleAttributes;
        return isObj(sa) && Array.isArray(sa.layers) ? sa.layers.filter(x => typeof x === 'string') : [];
    }

    layers.list = () => defs().map((l, i) => ({ id: l.id, name: clean(l.name) || 'Layer', css: css(l, i) }));
    layers.layersOf = layersOf;
    layers.isActive = (id) => active.has(id);
    layers.anyActive = () => active.size > 0;

    /** The selection, widened the way a person means it: a group takes its cards, and the connectors between chosen cards come along. */
    function targets() {
        const sel = core.selectedNodes();
        const ids = core.expandWithGroupContents(sel.map(n => n.id));
        const nodes = [...ids].map(id => core.getNode(id)).filter(Boolean);
        const set = new Set(nodes.map(n => n.id));
        const edges = new Set(core.selectedEdges());
        if (sel.length) for (const e of core.edges()) if (set.has(e.fromNode) && set.has(e.toNode)) edges.add(e);
        return { nodes, edges: [...edges] };
    }

    /** Add or remove one layer id on one object. Returns whether anything changed. */
    function setMember(o, id, on) {
        const cur = layersOf(o);
        if (cur.includes(id) === on) return false;
        if (o.styleAttributes != null && !isObj(o.styleAttributes)) return false;
        const next = on ? cur.concat(id) : cur.filter(x => x !== id);
        if (next.length) {
            if (!isObj(o.styleAttributes)) o.styleAttributes = {};
            o.styleAttributes.layers = next;
        } else if (isObj(o.styleAttributes)) {
            delete o.styleAttributes.layers;
            if (!Object.keys(o.styleAttributes).length) delete o.styleAttributes;
        }
        return true;
    }

    /** 'all' | 'some' | 'none': how much of the selection is in this layer. */
    layers.stateFor = function (id) {
        const t = targets();
        const items = [...t.nodes, ...t.edges];
        if (!items.length) return 'none';
        const n = items.filter(o => layersOf(o).includes(id)).length;
        return n === items.length ? 'all' : n ? 'some' : 'none';
    };

    layers.add = function (name, withSelection) {
        const nm = clean(name);
        if (!nm) return null;
        let id = null;
        core.change('New layer', (doc) => {
            if (!Array.isArray(doc.flowLayers)) doc.flowLayers = [];
            id = core.newId();
            const used = new Set(doc.flowLayers.map(l => l && l.color));
            const color = PALETTE.find(k => !used.has(k)) || PALETTE[doc.flowLayers.length % PALETTE.length];
            doc.flowLayers.push({ id, name: nm, color });
            if (withSelection) {
                const t = targets();
                [...t.nodes, ...t.edges].forEach(o => setMember(o, id, true));
            }
        });
        return id;
    };

    /** Put the selection into the layer, or take it out. */
    layers.assign = function (id, on) {
        const t = targets();
        const items = [...t.nodes, ...t.edges];
        if (!items.length) { core.toast('Select cards or connectors first'); return; }
        core.change(on ? 'Add to layer' : 'Remove from layer', () => items.forEach(o => setMember(o, id, on)));
    };
    /** Chip behaviour in the selection panel: all in it -> take out, otherwise put in. */
    layers.toggleSelection = function (id) { layers.assign(id, layers.stateFor(id) !== 'all'); };

    layers.rename = function (id, name) {
        const nm = clean(name);
        if (!nm) return;
        core.change('Rename layer', (doc) => { const l = defs().find(x => x.id === id); if (l) l.name = nm; });
    };
    layers.recolor = function (id) {
        core.change('Layer colour', () => {
            const all = defs(), i = all.findIndex(x => x.id === id);
            if (i < 0) return;
            const at = PALETTE.indexOf(colorKey(all[i], i));
            all[i].color = PALETTE[(at + 1) % PALETTE.length];
        });
    };
    layers.remove = function (id) {
        core.change('Delete layer', (doc) => {
            doc.flowLayers = defs().filter(l => l.id !== id);
            if (!doc.flowLayers.length) delete doc.flowLayers;
            for (const o of [...core.nodes(), ...core.edges()]) setMember(o, id, false);
        });
        active.delete(id);
        refresh();
    };

    layers.toggleActive = function (id) {
        if (active.has(id)) active.delete(id); else active.add(id);
        refresh();
    };
    layers.clearActive = function () { active.clear(); refresh(); };
    layers.setActive = function (ids) { active.clear(); ids.forEach(i => active.add(i)); refresh(); };

    function refresh() {
        force = true;
        core.invalidate('selection');
        render();
    }

    // ── Decorating the chart ────────────────────────────────────────────────

    /** Dim, ring, tint and dot every card and connector. Runs after the card and connector renderers. */
    function decorate(d) {
        const all = defs();
        if (!all.length && !decorated && !force) return;
        if (!(force || d.all || d.structure || d.edges || d.selection || d.nodes.size)) return;
        force = false;

        const byId = new Map(all.map((l, i) => [l.id, { name: clean(l.name) || 'Layer', col: css(l, i) }]));
        for (const id of [...active]) if (!byId.has(id)) active.delete(id);
        const filtering = active.size > 0;
        let any = false;

        const apply = (el, o, kind) => {
            const ids = layersOf(o).filter(id => byId.has(id));
            const lit = ids.filter(id => active.has(id));
            const dim = filtering && !lit.length;
            const tint = lit.length === 1 ? byId.get(lit[0]).col : '';
            const sig = ids.map(id => id + byId.get(id).col).join('|') + '#' + (dim ? 1 : 0) + '#' + tint;
            if (dim || ids.length) any = true;
            if (el._lyrSig === sig) return;
            el._lyrSig = sig;
            el.classList.toggle('is-layer-dim', dim);
            el.classList.toggle(kind === 'node' ? 'has-layer-ring' : 'has-layer-tint', !!tint);
            if (tint) el.style.setProperty('--layer-color', tint); else el.style.removeProperty('--layer-color');
            if (kind === 'node') dots(el, ids.map(id => byId.get(id).col));
        };

        for (const n of core.nodes()) {
            const el = Flow.nodes.elementFor(n.id);
            if (el) apply(el, n, 'node');
        }
        const edgeEls = new Map(), labelEls = new Map();
        document.querySelectorAll('#flowEdges .flow-edge').forEach(g => edgeEls.set(g.dataset.edgeId, g));
        document.querySelectorAll('#flowLabels .flow-edge-label').forEach(l => labelEls.set(l.dataset.edgeId, l));
        for (const e of core.edges()) {
            const g = edgeEls.get(e.id), l = labelEls.get(e.id);
            if (g) apply(g, e, 'edge');
            if (l) apply(l, e, 'edge');
        }
        decorated = any;
    }

    /** One small dot per layer at the bottom-left of a card. */
    function dots(el, cols) {
        let box = el.querySelector(':scope > .flow-layer-dots');
        if (!cols.length) { if (box) box.remove(); return; }
        if (!box) {
            box = document.createElement('span');
            box.className = 'flow-layer-dots';
            box.setAttribute('aria-hidden', 'true');
            el.appendChild(box);
        }
        box.textContent = '';
        for (const c of cols) { const i = document.createElement('i'); i.style.background = c; box.appendChild(i); }
    }

    // ── Popover ─────────────────────────────────────────────────────────────

    const ico = (cls) => `<i class="fa-solid ${cls}" aria-hidden="true"></i>`;
    const tool = (act, icon, title, extra) =>
        `<button type="button" class="flow-layer-tool" data-act="${act}" title="${S.escapeHtml(title)}" aria-label="${S.escapeHtml(title)}"${extra || ''}>${ico(icon)}</button>`;

    function counts() {
        const m = new Map();
        for (const n of core.nodes()) for (const id of layersOf(n)) m.set(id, (m.get(id) || 0) + 1);
        return m;
    }

    function render() {
        if (!pop || pop.hidden) return;
        const all = layers.list(), n = counts();
        const hasSel = core.selection.nodes.size + core.selection.edges.size > 0;
        let html = '';
        for (const l of all) {
            const on = active.has(l.id), c = n.get(l.id) || 0;
            html += `<li class="flow-layer-row" data-id="${S.escapeHtml(l.id)}" style="--lc:${l.css}">`;
            if (renaming === l.id) {
                html += `<input type="text" class="flow-layer-rename" data-act="rename-input" maxlength="${MAX_NAME}" value="${S.escapeHtml(l.name)}" aria-label="Layer name">`;
            } else {
                html += `<button type="button" class="flow-layer-main" data-act="toggle" aria-pressed="${on ? 'true' : 'false'}" title="${on ? 'Stop focusing on this layer' : 'Focus on this layer'}"><span class="flow-layer-dot"></span><span class="flow-layer-name">${S.escapeHtml(l.name)}</span><span class="flow-layer-count">${c}</span></button>`;
                html += '<span class="flow-layer-tools">';
                html += tool('play', 'fa-play', 'Play this layer on its own');
                html += tool('assign', 'fa-plus', 'Add the selection to this layer', hasSel ? '' : ' disabled');
                html += tool('unassign', 'fa-minus', 'Take the selection out of this layer', hasSel ? '' : ' disabled');
                html += tool('colour', 'fa-palette', 'Change colour');
                html += tool('rename', 'fa-pen', 'Rename');
                html += tool('delete', 'fa-trash-can', 'Delete layer (cards stay)');
                html += '</span>';
            }
            html += '</li>';
        }
        list.innerHTML = html || '<li class="flow-layers-empty">No layers yet. Select some cards, name a layer below, and they go in together.</li>';
        $('flowLayersClear').hidden = !active.size;
        const field = $('flowLayersNew');
        field.placeholder = hasSel ? 'New layer from selection…' : 'New layer…';
        const r = list.querySelector('.flow-layer-rename');
        if (r) { r.focus(); r.select(); }
    }

    function openPop(on) {
        pop.hidden = !on;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-expanded', on ? 'true' : 'false');
        if (on) render(); else renaming = null;
    }

    layers.init = function () {
        pop = $('flowLayers');
        btn = $('flowLayersBtn');
        list = $('flowLayersList');
        if (!pop || !btn) return;
        core.addRenderer('layers', decorate, 80);
        core.on('selection', render);
        core.on('change', render);
        core.on('load', () => { active.clear(); renaming = null; force = true; render(); });
        btn.addEventListener('click', () => openPop(pop.hidden));
        pop.addEventListener('pointerdown', (e) => e.stopPropagation());
        pop.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]');
            if (!b) return;
            const row = b.closest('.flow-layer-row'), id = row && row.dataset.id;
            switch (b.dataset.act) {
                case 'close': openPop(false); btn.focus(); break;
                case 'clear': layers.clearActive(); break;
                case 'toggle': layers.toggleActive(id); break;
                case 'play': Flow.play.playLayer(id); break;
                case 'assign': layers.assign(id, true); break;
                case 'unassign': layers.assign(id, false); break;
                case 'colour': layers.recolor(id); break;
                case 'rename': renaming = id; render(); break;
                case 'delete': layers.remove(id); break;
            }
        });
        const finishRename = (input, keep) => {
            const id = input.closest('.flow-layer-row').dataset.id;
            renaming = null;
            if (keep) layers.rename(id, input.value);
            render();
        };
        pop.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.target.matches('.flow-layer-rename')) {
                if (e.key === 'Enter') { e.preventDefault(); finishRename(e.target, true); }
                else if (e.key === 'Escape') { e.preventDefault(); finishRename(e.target, false); }
            } else if (e.key === 'Escape') { openPop(false); btn.focus(); }
        });
        pop.addEventListener('focusout', (e) => { if (e.target.matches('.flow-layer-rename') && renaming) finishRename(e.target, true); });
        $('flowLayersForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const field = $('flowLayersNew');
            const hasSel = core.selection.nodes.size + core.selection.edges.size > 0;
            if (layers.add(field.value, hasSel)) field.value = '';
        });
    };
})();
