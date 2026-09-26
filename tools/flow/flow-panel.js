/**
 * Selection properties panel (left side): colour (6 presets + custom), card shape,
 * connector arrows / route / line style / label, arrange, align & distribute, actions.
 * Shared by P2 (card colours/shapes) and P3 (connector styling); owns no state.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);

    const panel = Flow.panel = {};
    let el, colorTxn = false;

    panel.init = function () {
        el = $('flowPanel');
        core.on('selection', render);
        core.on('change', () => { if (!colorTxn) render(); });
        core.on('load', render);
        el.addEventListener('click', onClick);
        el.addEventListener('input', onInput);
        el.addEventListener('change', onChange);
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
    };

    const btn = (action, value, icon, title, active, extra) =>
        `<button type="button" class="flow-pbtn${active ? ' is-active' : ''}" data-action="${S.escapeHtml(action)}" data-value="${S.escapeHtml(value)}" title="${S.escapeHtml(title)}" aria-label="${S.escapeHtml(title)}" aria-pressed="${active ? 'true' : 'false'}"${extra || ''}>${icon}</button>`;

    function common(list, get) {
        if (!list.length) return undefined;
        const v = get(list[0]);
        return list.every(x => get(x) === v) ? v : undefined;
    }

    function render() {
        if (!el) return;
        const nodes = core.selectedNodes();
        const edges = core.selectedEdges();
        if (!nodes.length && !edges.length) { el.hidden = true; el.innerHTML = ''; return; }
        el.hidden = false;
        const items = [...nodes, ...edges];
        const color = common(items, x => x.color || '');
        const title = items.length > 1 ? `${items.length} selected`
            : nodes.length ? ({ text: 'Card', group: 'Group', link: 'Link card', file: 'File card' }[nodes[0].type] || 'Node')
                : 'Connector';

        let html = `<div class="flow-panel-title">${title}</div>`;

        // Colour
        html += '<div class="flow-panel-section"><div class="flow-panel-label">Colour</div><div class="flow-swatches">';
        html += `<button type="button" class="flow-swatch flow-swatch-none${color === '' ? ' is-active' : ''}" data-action="color" data-value="" title="Default" aria-label="Default colour"></button>`;
        for (const k of ['1', '2', '3', '4', '5', '6']) {
            html += `<button type="button" class="flow-swatch${color === k ? ' is-active' : ''}" style="--sw:var(${S.PRESETS[k]})" data-action="color" data-value="${k}" title="${S.PRESET_NAMES[k]}" aria-label="${S.PRESET_NAMES[k]}"></button>`;
        }
        // `color` comes from the file: only its validated, browser-normalised form is ever displayed
        // (S.safeColor -> preset key, #hex or rgba()), and it is escaped anyway.
        const safe = color ? S.safeColor(color) : null;
        const isCustom = !!safe && !S.PRESETS[safe];
        const hex6 = isCustom && /^#[0-9a-f]{6}$/i.test(safe) ? safe : isCustom && /^#[0-9a-f]{3}$/i.test(safe) ? '#' + [...safe.slice(1)].map(c => c + c).join('') : '#888888';
        html += `<label class="flow-swatch flow-swatch-custom${isCustom ? ' is-active' : ''}" title="Custom colour"${isCustom ? ` style="--sw:${S.escapeHtml(safe)}"` : ''}>
            <input type="color" data-action="custom-color" value="${S.escapeHtml(hex6)}" aria-label="Custom colour"></label>`;
        html += '</div></div>';

        // Shape (text cards)
        const textCards = nodes.filter(n => n.type === 'text');
        if (textCards.length && textCards.length === nodes.length) {
            const shape = common(textCards, S.nodeShape);
            html += '<div class="flow-panel-section"><div class="flow-panel-label">Shape</div><div class="flow-pbtns">';
            html += btn('shape', 'rect', '<span class="flow-ico-rect"></span>', 'Rectangle: a step', shape === 'rect');
            html += btn('shape', 'pill', '<span class="flow-ico-pill"></span>', 'Pill: start or end', shape === 'pill');
            html += btn('shape', 'diamond', '<span class="flow-ico-diamond"></span>', 'Diamond: a decision (if / else)', shape === 'diamond');
            html += btn('shape', 'circle', '<span class="flow-ico-circle"></span>', 'Circle: a jump point', shape === 'circle');
            html += '</div></div>';
        }

        // Connector styling
        if (edges.length) {
            const ends = common(edges, e => (e.fromEnd === 'arrow' ? 'a' : 'n') + (e.toEnd === 'none' ? 'n' : 'a'));
            const route = common(edges, S.edgeRoute);
            const dash = common(edges, e => (e.styleAttributes && e.styleAttributes.path) || 'solid');
            html += '<div class="flow-panel-section"><div class="flow-panel-label">Arrowheads</div><div class="flow-pbtns">';
            html += btn('ends', 'nn', '<span class="flow-ico-line"></span>', 'No arrows', ends === 'nn');
            html += btn('ends', 'na', '<i class="fa-solid fa-arrow-right-long"></i>', 'Arrow at end', ends === 'na');
            html += btn('ends', 'an', '<i class="fa-solid fa-arrow-left-long"></i>', 'Arrow at start', ends === 'an');
            html += btn('ends', 'aa', '<i class="fa-solid fa-arrows-left-right"></i>', 'Arrows at both ends', ends === 'aa');
            html += '</div></div>';
            html += '<div class="flow-panel-section"><div class="flow-panel-label">Route</div><div class="flow-pbtns">';
            html += btn('route', 'curve', '<i class="fa-solid fa-bezier-curve"></i>', 'Curved', route === 'curve');
            html += btn('route', 'elbow', '<i class="fa-solid fa-turn-up fa-rotate-90"></i>', 'Elbow', route === 'elbow');
            html += btn('route', 'straight', '<i class="fa-solid fa-minus fa-rotate-by" style="--fa-rotate-angle:-45deg"></i>', 'Straight', route === 'straight');
            html += '</div></div>';
            html += '<div class="flow-panel-section"><div class="flow-panel-label">Line</div><div class="flow-pbtns">';
            html += btn('dash', 'solid', '<span class="flow-ico-line"></span>', 'Solid', dash === 'solid');
            html += btn('dash', 'dashed', '<span class="flow-ico-line is-dashed"></span>', 'Dashed', dash === 'dashed');
            html += btn('dash', 'dotted', '<span class="flow-ico-line is-dotted"></span>', 'Dotted', dash === 'dotted');
            html += '</div></div>';
            if (edges.length === 1) {
                html += `<div class="flow-panel-section"><button type="button" class="flow-pwide" data-action="label"><i class="fa-solid fa-font"></i> ${edges[0].label ? 'Edit label' : 'Add label'} <kbd>Enter</kbd></button></div>`;
            }
        }

        // Arrange
        if (nodes.length) {
            html += '<div class="flow-panel-section"><div class="flow-panel-label">Arrange</div><div class="flow-pbtns">';
            html += btn('order', 'back', '<i class="fa-solid fa-arrow-down-short-wide"></i>', 'Send to back (Ctrl+[)', false);
            html += btn('order', 'front', '<i class="fa-solid fa-arrow-up-wide-short"></i>', 'Bring to front (Ctrl+])', false);
            if (nodes.length >= 2) {
                html += '</div><div class="flow-pbtns">';
                html += btn('align', 'left', '<i class="fa-solid fa-align-left"></i>', 'Align left', false);
                html += btn('align', 'hcenter', '<i class="fa-solid fa-align-center"></i>', 'Align centres horizontally', false);
                html += btn('align', 'right', '<i class="fa-solid fa-align-right"></i>', 'Align right', false);
                html += '</div><div class="flow-pbtns">';
                html += btn('align', 'top', '<i class="fa-solid fa-align-left fa-rotate-90"></i>', 'Align top', false);
                html += btn('align', 'vcenter', '<i class="fa-solid fa-align-center fa-rotate-90"></i>', 'Align middles vertically', false);
                html += btn('align', 'bottom', '<i class="fa-solid fa-align-right fa-rotate-90"></i>', 'Align bottom', false);
            }
            if (nodes.length >= 3) {
                html += '</div><div class="flow-pbtns">';
                html += btn('distribute', 'h', '<i class="fa-solid fa-ellipsis"></i>', 'Distribute horizontally', false);
                html += btn('distribute', 'v', '<i class="fa-solid fa-ellipsis-vertical"></i>', 'Distribute vertically', false);
            }
            html += '</div></div>';
        }

        // Actions
        html += '<div class="flow-panel-section"><div class="flow-panel-label">Actions</div><div class="flow-pbtns">';
        if (nodes.length) html += btn('duplicate', '', '<i class="fa-regular fa-clone"></i>', 'Duplicate (Ctrl+D)', false);
        if (nodes.length) html += btn('group', '', '<i class="fa-regular fa-object-group"></i>', 'Group (Ctrl+G)', false);
        if (nodes.some(n => n.type === 'group')) html += btn('ungroup', '', '<i class="fa-regular fa-object-ungroup"></i>', 'Ungroup (Ctrl+Shift+G)', false);
        html += btn('delete', '', '<i class="fa-regular fa-trash-can"></i>', 'Delete (Del)', false, ' data-danger');
        html += '</div></div>';

        el.innerHTML = html;
    }
    panel.render = render;

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

    function applyColor(value) {
        const items = [...core.selectedNodes(), ...core.selectedEdges()];
        for (const it of items) { if (value) it.color = value; else delete it.color; }
        core.invalidate('all');
    }

    function onClick(e) {
        const b = e.target.closest('[data-action]');
        if (!b || b.dataset.action === 'custom-color') return;
        const v = b.dataset.value;
        const nodes = core.selectedNodes(), edges = core.selectedEdges();
        switch (b.dataset.action) {
            case 'color': core.change('Colour', () => applyColor(v)); break;
            case 'shape':
                core.change('Shape', () => nodes.forEach(n => {
                    const was = S.nodeShape(n);
                    setStyleAttr(n, 'shape', v === 'rect' ? null : v);
                    // Give decisions/circles room for their text.
                    if ((v === 'diamond' || v === 'circle') && was !== v && n.height < n.width * 0.6) {
                        n.height = Math.round(Math.max(n.height, n.width * (v === 'diamond' ? 0.6 : 1)) / 20) * 20;
                    }
                    if (v === 'circle') n.height = n.width = Math.max(n.width, n.height);
                }));
                break;
            case 'ends':
                core.change('Arrowheads', () => edges.forEach(ed => {
                    if (v[0] === 'a') ed.fromEnd = 'arrow'; else if (ed.fromEnd != null) ed.fromEnd = 'none';
                    if (v[1] === 'n') ed.toEnd = 'none'; else if (ed.toEnd != null) ed.toEnd = 'arrow';
                }));
                break;
            case 'route':
                core.change('Route', () => edges.forEach(ed => setStyleAttr(ed, 'pathfindingMethod', v === 'curve' ? null : v === 'elbow' ? 'square' : 'direct')));
                break;
            case 'dash':
                core.change('Line style', () => edges.forEach(ed => setStyleAttr(ed, 'path', v === 'solid' ? null : v)));
                break;
            case 'label': Flow.edges.editLabel(edges[0].id); break;
            case 'order': Flow.interact.reorder(v === 'front'); break;
            case 'align': Flow.interact.align(v); break;
            case 'distribute': Flow.interact.distribute(v); break;
            case 'duplicate': Flow.interact.duplicate(); break;
            case 'group': Flow.interact.groupSelection(); break;
            case 'ungroup': Flow.interact.ungroupSelection(); break;
            case 'delete': Flow.interact.deleteSelection(); break;
        }
    }

    function onInput(e) {
        if (e.target.dataset.action !== 'custom-color') return;
        if (!colorTxn) { core.begin('Colour'); colorTxn = true; }
        applyColor(e.target.value);
        e.target.parentElement.style.setProperty('--sw', e.target.value);
    }
    function onChange(e) {
        if (e.target.dataset.action !== 'custom-color') return;
        if (colorTxn) { colorTxn = false; core.commit(); }
        render();
    }
})();
