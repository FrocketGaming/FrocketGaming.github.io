/**
 * P2 - Cards & groups: DOM rendering of text / link / file / group nodes,
 * markdown, inline editing, resize handles and the selection frame.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);

    const nodes = Flow.nodes = {};
    // Elements are keyed by node *occurrence*, not just id: the first node with an id uses the
    // id as key, later duplicates (invalid JSON Canvas, but it happens) get "id\u0000n". So every
    // node is drawn even when ids collide, and nothing rewrites the ids.
    const els = new Map();       // key -> element
    const sigs = new Map();      // key -> content signature
    const keyNode = new Map();   // key -> node object (from the last full render)
    const keyOf = new WeakMap(); // node object -> key
    let dupKeys = new Map();     // id -> [keys], only for ids that occur more than once
    let groupsLayer, nodesLayer, selUI;
    let editor = null;           // { id, kind, el, input, isNew, original }

    nodes.DEFAULT_W = 200;
    nodes.DEFAULT_H = 60;
    const paint = S.varPaint();

    nodes.cssColor = (color, fallbackVar) => paint.color(color, fallbackVar || '--border-color');
    nodes.elementFor = (id) => {
        const n = core.getNode(id), k = n && keyOf.get(n);
        return (k && els.get(k)) || els.get(id);
    };
    const keysFor = (id) => dupKeys.get(id) || [id];
    const dropSig = (id) => { for (const k of keysFor(id)) sigs.delete(k); };

    nodes.init = function () {
        groupsLayer = $('flowGroups');
        nodesLayer = $('flowNodes');
        selUI = $('flowSelUI');
        core.addRenderer('nodes', renderNodes, 0);
        core.addRenderer('selection-frame', renderSelectionFrame, 50);
        core.on('load', () => { stopEditImmediate(); });

        // Resize handles
        core.addPointerHandler(900, (e, hit) => {
            if (hit.kind !== 'handle' || e.button !== 0) return false;
            startResize(e, hit.id, hit.handle);
            return true;
        });

        // Duplicate ids: pressing on one of several cards sharing an id makes that card the one
        // core.getNode(id) returns until the next reindex, so select / drag / edit act on it.
        const promote = (target) => {
            const holder = target && target.closest && target.closest('[data-node-key]');
            const n = holder && keyNode.get(holder.dataset.nodeKey);
            if (n && dupKeys.has(n.id) && core.getNode(n.id) !== n) { core.nodeIndex().set(n.id, n); core.invalidate('all'); }
        };
        core.addPointerHandler(1990, (e, hit) => {
            if (hit && hit.id && dupKeys.has(hit.id) && hit.kind !== 'handle') promote(hit.el);
            return false;
        });
        core.viewportEl.addEventListener('dblclick', (e) => promote(e.target), true);

        // Link cards: explicit open button
        nodesLayer.addEventListener('click', (e) => {
            const b = e.target.closest('.flow-link-open');
            if (!b) return;
            const n = core.getNode(b.closest('[data-node-id]').dataset.nodeId);
            if (n && S.str(n.url) && /^https?:/i.test(S.str(n.url))) window.open(S.str(n.url), '_blank', 'noopener');
        });

        // Re-measure overflow once web fonts arrive (text metrics change).
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sigs.clear(); core.invalidate('all'); });
    };

    // ── Rendering ───────────────────────────────────────────────────────────

    function signature(n) {
        // Any field can hold any JSON value: never let Array.join call an object's toString.
        const v = (x) => (x == null || typeof x !== 'object' ? x : JSON.stringify(x));
        return [v(n.type), v(n.text), v(n.url), v(n.file), v(n.subpath), v(n.label), v(n.color), S.nodeShape(n), v(n.background), n.type === 'file' ? Number(n.height) >= 150 : 0].join('\u0001');
    }

    function renderNodes(d) {
        const full = d.all || d.structure;
        const list = core.nodes();
        if (full) {
            const seen = new Set();
            const count = new Map();
            const dups = new Map();
            let gi = 0, ni = 0;
            for (const n of list) {
                if (!n || typeof n.id !== 'string') continue;
                const k0 = count.get(n.id) || 0;
                count.set(n.id, k0 + 1);
                const key = k0 ? n.id + '\u0000' + k0 : n.id;
                if (k0) { if (!dups.has(n.id)) dups.set(n.id, [n.id]); dups.get(n.id).push(key); }
                seen.add(key);
                keyNode.set(key, n);
                keyOf.set(n, key);
                let el = els.get(key);
                const isGroup = n.type === 'group';
                if (!el || el._isGroup !== isGroup) {
                    if (el) el.remove();
                    el = createEl(n);
                    el.dataset.nodeKey = key;
                    els.set(key, el);
                    sigs.delete(key);
                }
                el._id = n.id;
                safeUpdate(n, el);
                // keep DOM order == array order within each layer (array order is z-order)
                const layer = isGroup ? groupsLayer : nodesLayer;
                const idx = isGroup ? gi++ : ni++;
                if (layer.children[idx] !== el) layer.insertBefore(el, layer.children[idx] || null);
            }
            for (const [key, el] of els) {
                if (!seen.has(key)) { el.remove(); els.delete(key); sigs.delete(key); keyNode.delete(key); }
            }
            dupKeys = dups;
        } else if (d.nodes.size) {
            for (const id of d.nodes) {
                if (dupKeys.has(id)) {
                    for (const k of dupKeys.get(id)) { const n = keyNode.get(k), el = els.get(k); if (n && el) safeUpdate(n, el); }
                    continue;
                }
                const n = core.getNode(id), el = els.get(id);
                if (n && el) safeUpdate(n, el);
            }
        }
        if (full || d.selection) {
            for (const [key, el] of els) {
                const id = el._id;
                el.classList.toggle('is-selected', core.selection.nodes.has(id) && (!dupKeys.has(id) || keyNode.get(key) === core.getNode(id)));
            }
        }
    }

    /** Last line of defence: one malformed node must never stop the others from drawing. */
    function safeUpdate(n, el) {
        try { update(n, el); }
        catch (e) { console.warn('Flow: could not draw node', n && n.id, e); }
    }

    function createEl(n) {
        const el = document.createElement('div');
        el.dataset.nodeId = n.id;
        el._isGroup = n.type === 'group';
        if (el._isGroup) {
            const hid = S.escapeHtml(n.id);   // ids come from the file: always escape
            el.className = 'flow-group';
            el.innerHTML = `
                <div class="flow-group-fill"></div>
                <div class="flow-group-edge flow-group-edge-t" data-node-id="${hid}"></div>
                <div class="flow-group-edge flow-group-edge-r" data-node-id="${hid}"></div>
                <div class="flow-group-edge flow-group-edge-b" data-node-id="${hid}"></div>
                <div class="flow-group-edge flow-group-edge-l" data-node-id="${hid}"></div>
                <div class="flow-group-label" data-node-id="${hid}" data-group-label></div>`;
        } else {
            el.className = 'flow-node';
            el.innerHTML = '<div class="flow-node-content"></div>';
        }
        return el;
    }

    function update(n, el) {
        el.style.left = n.x + 'px';
        el.style.top = n.y + 'px';
        el.style.width = n.width + 'px';
        el.style.height = n.height + 'px';
        const key = el.dataset.nodeKey || n.id;
        const sig = signature(n);
        if (sigs.get(key) === sig) return;
        const colored = S.hasColor(n.color);   // invalid colours are kept in the data, drawn as none
        if (editor && editor.node === n) { el.style.setProperty('--node-color', colored ? nodes.cssColor(n.color) : ''); return; }
        sigs.set(key, sig);
        el.classList.toggle('has-color', colored);
        el.style.setProperty('--node-color', colored ? nodes.cssColor(n.color) : '');
        if (el._isGroup) {
            const label = el.querySelector('.flow-group-label');
            label.textContent = S.str(n.label);
            label.classList.toggle('is-empty', !S.str(n.label));
            if (!S.str(n.label)) label.textContent = 'Group';
            el.classList.toggle('has-bg', !!n.background);
            return;
        }
        const shape = S.nodeShape(n);
        el.className = `flow-node flow-node-${(S.str(n.type) || 'unknown').replace(/[^\w-]/g, '_')} flow-shape-${shape}` + (colored ? ' has-color' : '') + (core.selection.nodes.has(n.id) ? ' is-selected' : '');
        let shapeEl = el.querySelector('.flow-node-shape');
        if (shape === 'diamond' || shape === 'circle') {
            if (!shapeEl) {
                shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                shapeEl.setAttribute('class', 'flow-node-shape');
                shapeEl.setAttribute('viewBox', '0 0 100 100');
                shapeEl.setAttribute('preserveAspectRatio', 'none');
                el.insertBefore(shapeEl, el.firstChild);
            }
            shapeEl.innerHTML = shape === 'diamond'
                ? '<path d="M50 1 L99 50 L50 99 L1 50 Z" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>'
                : '<ellipse cx="50" cy="50" rx="49" ry="49" vector-effect="non-scaling-stroke"/>';
        } else if (shapeEl) shapeEl.remove();

        const c = el.querySelector('.flow-node-content');
        c.className = 'flow-node-content';
        if (n.type === 'text') {
            c.classList.add('flow-md');
            if (S.isSimpleText(n.text) || shape !== 'rect') c.classList.add('is-simple');
            c.innerHTML = n.text ? S.renderMarkdown(n.text) : '<p class="flow-placeholder">Empty card</p>';
        } else if (n.type === 'link') {
            const url = S.str(n.url);
            let host = url, path = '';
            try { const u = new URL(url); host = u.hostname.replace(/^www\./, ''); path = (u.pathname + u.search).replace(/\/$/, ''); } catch (e) { /* raw */ }
            c.classList.add('flow-meta-card');
            c.innerHTML = `<div class="flow-meta-icon"><i class="fa-solid fa-link"></i></div>
                <div class="flow-meta-text"><div class="flow-meta-title">${S.escapeHtml(host || 'No URL')}</div>
                <div class="flow-meta-sub">${S.escapeHtml(path || url || 'Double-click to set a URL')}</div></div>
                ${url ? '<button class="flow-link-open" data-ui title="Open link in new tab" aria-label="Open link"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>' : ''}`;
        } else if (n.type === 'file') {
            const file = S.str(n.file);
            const name = file.split('/').pop();
            const ext = (name.split('.').pop() || '').toLowerCase();
            const icon = /^(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(ext) ? 'fa-regular fa-image'
                : ext === 'md' ? 'fa-regular fa-file-lines'
                    : ext === 'pdf' ? 'fa-regular fa-file-pdf'
                        : /^(mp3|wav|ogg|m4a|flac)$/.test(ext) ? 'fa-regular fa-file-audio'
                            : /^(mp4|webm|mov)$/.test(ext) ? 'fa-regular fa-file-video'
                                : ext === 'canvas' ? 'fa-solid fa-diagram-project' : 'fa-regular fa-file';
            c.classList.add('flow-meta-card');
            const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
            c.innerHTML = `<div class="flow-meta-icon"><i class="${icon}"></i></div>
                <div class="flow-meta-text"><div class="flow-meta-title">${S.escapeHtml(name || 'No file')}${n.subpath ? `<span class="flow-meta-subpath">${S.escapeHtml(n.subpath)}</span>` : ''}</div>
                <div class="flow-meta-sub">${S.escapeHtml(dir ? dir + '/' : 'vault root')}</div></div>
                ${n.height >= 150 ? `<i class="${icon} flow-meta-watermark"></i>` : ''}`;
            c.classList.toggle('is-large', n.height >= 150);
        } else {
            c.classList.add('flow-meta-card');
            c.innerHTML = `<div class="flow-meta-icon"><i class="fa-regular fa-circle-question"></i></div>
                <div class="flow-meta-text"><div class="flow-meta-title">${S.escapeHtml(n.type || 'unknown')} node</div>
                <div class="flow-meta-sub">Kept as-is on export</div></div>`;
        }
        // Mark overflow so a fade shows that the card has more content.
        requestAnimationFrame(() => {
            c.classList.toggle('is-scrollable', c.scrollHeight > c.clientHeight + 2);
        });
    }

    // ── Selection frame + resize handles ────────────────────────────────────

    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    function renderSelectionFrame(d) {
        if (!(d.all || d.selection || d.structure || d.nodes.size)) return;
        const sel = core.selectedNodes();
        let frame = selUI.querySelector('.flow-sel-frame');
        if (!sel.length || (editor && sel.length === 1 && editor.kind !== 'group')) {
            if (frame) frame.remove();
            return;
        }
        if (!frame) {
            frame = document.createElement('div');
            frame.className = 'flow-sel-frame';
            selUI.appendChild(frame);
        }
        const b = S.bbox(sel);
        const single = sel.length === 1;
        frame.classList.toggle('is-multi', !single);
        frame.style.left = b.x + 'px';
        frame.style.top = b.y + 'px';
        frame.style.width = b.width + 'px';
        frame.style.height = b.height + 'px';
        const want = single ? sel[0].id : '';
        if (frame.dataset.for !== want) {
            frame.dataset.for = want;
            frame.innerHTML = single ? HANDLES.map(h => `<div class="flow-handle flow-handle-${h}" data-handle="${h}" data-node-id="${S.escapeHtml(want)}"></div>`).join('') : '';
        }
    }

    function startResize(e, id, handle) {
        const n = core.getNode(id);
        if (!n) return;
        const start = { x: Number(n.x) || 0, y: Number(n.y) || 0, w: Number(n.width) || 0, h: Number(n.height) || 0 };
        const p0 = core.screenToWorld(e.clientX, e.clientY);
        const minW = n.type === 'group' ? 120 : 60, minH = n.type === 'group' ? 80 : 40;
        const shapeLock = S.nodeShape(n) === 'circle';
        core.begin('Resize');
        document.body.classList.add('flow-resizing', 'flow-cursor-' + handle);
        core.trackDrag(e, {
            move: (ev, p) => {
                const dx = p.x - p0.x, dy = p.y - p0.y;
                let x1 = start.x, y1 = start.y, x2 = start.x + start.w, y2 = start.y + start.h;
                const snap = ev.altKey ? Math.round : core.snapToGrid;
                if (handle.includes('w')) x1 = Math.min(snap(start.x + dx), x2 - minW);
                if (handle.includes('e')) x2 = Math.max(snap(start.x + start.w + dx), x1 + minW);
                if (handle.includes('n')) y1 = Math.min(snap(start.y + dy), y2 - minH);
                if (handle.includes('s')) y2 = Math.max(snap(start.y + start.h + dy), y1 + minH);
                if ((ev.shiftKey || shapeLock) && handle.length === 2) {
                    const ratio = start.w / start.h;
                    const w = x2 - x1, h = y2 - y1;
                    if (w / h > ratio) { const nh = w / ratio; if (handle.includes('n')) y1 = y2 - nh; else y2 = y1 + nh; }
                    else { const nw = h * ratio; if (handle.includes('w')) x1 = x2 - nw; else x2 = x1 + nw; }
                }
                // Only write fields that changed (a "x": "100" string stays unless x really moves).
                const set = (k, v) => { if (v !== Number(n[k])) n[k] = v; };
                set('x', Math.round(x1)); set('y', Math.round(y1));
                set('width', Math.round(x2 - x1)); set('height', Math.round(y2 - y1));
                core.invalidate('nodes', [n.id]);
            },
            up: () => { document.body.classList.remove('flow-resizing', 'flow-cursor-' + handle); core.commit(); dropSig(n.id); core.invalidate('nodes', [n.id]); },
            cancel: () => { document.body.classList.remove('flow-resizing', 'flow-cursor-' + handle); core.cancel(); },
        });
    }

    // ── Creation ────────────────────────────────────────────────────────────

    /**
     * Create a text card (call inside core.change / a transaction).
     * opts: { text, width, height, center (point is the centre), color, select }
     */
    nodes.createCard = function (p, opts) {
        opts = opts || {};
        const w = opts.width || nodes.DEFAULT_W, h = opts.height || nodes.DEFAULT_H;
        const x = opts.center === false ? p.x : p.x - w / 2;
        const y = opts.center === false ? p.y : p.y - h / 2;
        const node = { id: core.newId(), type: opts.type || 'text' };
        if (node.type === 'text') node.text = opts.text || '';
        if (node.type === 'link') node.url = opts.url || '';
        node.x = core.snapToGrid(x);
        node.y = core.snapToGrid(y);
        node.width = w;
        node.height = h;
        if (opts.color) node.color = opts.color;
        if (opts.styleAttributes) node.styleAttributes = opts.styleAttributes;
        return core.addNode(node);
    };

    nodes.createGroup = function (rect, label) {
        const node = { id: core.newId(), type: 'group', x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
        if (label) node.label = label;
        return core.addNode(node);
    };

    // ── Inline editing ──────────────────────────────────────────────────────

    nodes.isEditing = () => !!editor;

    /**
     * Open the inline editor on a node.
     * opts: { isNew: remove the node if it ends up empty, select: 'all'|'end', initialText,
     *         ownTxn: a transaction is already open (from core.begin) and the editor should close it }
     */
    nodes.startEdit = function (id, opts) {
        opts = opts || {};
        const n = core.getNode(id);
        if (!n) return;
        if (editor) nodes.stopEdit();
        core.renderNow();
        const el = nodes.elementFor(id);
        if (!el) return;
        core.select([id], []);
        // A caller that just created the node passes ownTxn so creation + typing is ONE undo step.
        if (!opts.ownTxn) core.begin('Edit');
        let input, kind;
        if (n.type === 'group') {
            kind = 'group';
            const label = el.querySelector('.flow-group-label');
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'flow-group-label-input';
            input.value = S.str(n.label);
            input.placeholder = 'Group name';
            label.textContent = '';
            label.classList.remove('is-empty');
            label.appendChild(input);
        } else if (n.type === 'text') {
            kind = 'text';
            input = document.createElement('textarea');
            input.className = 'flow-node-editor' + (S.nodeShape(n) !== 'rect' || S.isSimpleText(n.text) ? ' is-simple' : '');
            input.value = opts.initialText != null ? opts.initialText : S.str(n.text);
            input.spellcheck = true;
            input.placeholder = 'Type… (Markdown)';
            el.classList.add('is-editing');
            el.appendChild(input);
        } else if (n.type === 'link' || n.type === 'file') {
            kind = n.type;
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'flow-node-editor flow-node-editor-line';
            input.value = n.type === 'link' ? S.str(n.url) : S.str(n.file);
            input.placeholder = n.type === 'link' ? 'https://…' : 'path/to/file.md';
            el.classList.add('is-editing');
            el.appendChild(input);
        } else {
            core.commit();
            return;
        }
        // baseH: the height before this edit session. Auto-height never goes below it and never
        // changes anything until the user actually edits (a view-only open + Escape is a no-op).
        editor = { id, node: n, kind, el, input, isNew: !!opts.isNew, baseH: Number(n.height) || 0, original: JSON.stringify(n) };
        core.editing = { kind: n.type === 'group' ? 'group' : 'node', id };
        core.emit('editing', core.editing);

        input.addEventListener('input', () => applyEditorValue());
        input.addEventListener('keydown', onEditorKey);
        input.addEventListener('blur', () => { setTimeout(() => { if (editor && editor.input === input && document.activeElement !== input) nodes.stopEdit(); }, 0); });
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        input.addEventListener('wheel', (e) => { if (!e.ctrlKey) e.stopPropagation(); }, { passive: true });
        input.focus({ preventScroll: true });
        if (opts.select === 'all' || kind === 'link' || kind === 'file') input.select();
        else input.setSelectionRange(input.value.length, input.value.length);
        if (opts.initialText != null) applyEditorValue();
        else fitEditor(false);
        core.invalidate('selection');
    };

    function applyEditorValue() {
        if (!editor) return;
        const n = editor.node;
        if (!n) return;
        const v = editor.input.value;
        if (editor.kind === 'text') n.text = v;
        else if (editor.kind === 'link') n.url = v.trim();
        else if (editor.kind === 'file') n.file = v.trim();
        else if (editor.kind === 'group') {
            if (v) n.label = v; else delete n.label;
        }
        fitEditor(true);
    }

    /**
     * Auto-height for the text editor.
     * - Opening the editor only sizes the textarea; the document is untouched (userEdit=false).
     * - After a real edit the card grows (to the 20px grid) only when the text actually overflows,
     *   and shrinks back as text is removed, but never below the height it had when editing began.
     */
    function fitEditor(userEdit) {
        if (!editor || editor.kind !== 'text') return;
        const n = editor.node;
        const ta = editor.input;
        const shape = S.nodeShape(n);
        const frac = shape === 'diamond' ? 0.5 : shape === 'circle' ? 0.708 : 1;
        const simple = ta.classList.contains('is-simple');
        ta.style.height = '0px';               // measure the content, not the box
        const need = ta.scrollHeight;
        ta.style.height = simple ? need + 'px' : '';
        if (!userEdit) return;
        const avail = editor.el.clientHeight * frac;
        const target = Math.ceil((need / frac + (shape === 'rect' || shape === 'pill' ? 3 : 24)) / 20) * 20;
        let h = Number(n.height) || 0;
        if (need > avail + 1) h = Math.max(h, target);
        else if (h > editor.baseH) h = Math.max(editor.baseH, Math.min(h, target));
        if (h !== (Number(n.height) || 0)) {
            n.height = h;
            core.invalidate('nodes', [n.id]);
        }
    }

    function onEditorKey(e) {
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            nodes.stopEdit();
            if (Flow.snippets) Flow.snippets.quickSave();
            return;
        }
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey)) {
            e.preventDefault();
            nodes.stopEdit();
            core.viewportEl.focus({ preventScroll: true });
            return;
        }
        if (e.key === 'Enter' && editor && editor.kind !== 'text') {
            e.preventDefault();
            nodes.stopEdit();
            core.viewportEl.focus({ preventScroll: true });
            return;
        }
        if (e.key === 'Tab' && editor && editor.kind === 'text') {
            // Tab indents markdown lists instead of leaving the card.
            e.preventDefault();
            const ta = editor.input, s = ta.selectionStart;
            const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
            if (e.shiftKey) {
                if (ta.value.slice(lineStart, lineStart + 2) === '  ') {
                    ta.value = ta.value.slice(0, lineStart) + ta.value.slice(lineStart + 2);
                    ta.setSelectionRange(Math.max(lineStart, s - 2), Math.max(lineStart, s - 2));
                }
            } else {
                ta.value = ta.value.slice(0, lineStart) + '  ' + ta.value.slice(lineStart);
                ta.setSelectionRange(s + 2, s + 2);
            }
            applyEditorValue();
            return;
        }
        // Ctrl/Cmd+Arrow while typing: finish this card and create the next connected one.
        if ((e.ctrlKey || e.metaKey) && e.key.startsWith('Arrow') && Flow.interact && Flow.interact.addConnectedCard) {
            e.preventDefault();
            const id = editor.id;
            nodes.stopEdit();
            if (core.getNode(id)) Flow.interact.addConnectedCard(id, e.key.slice(5).toLowerCase());
        }
    }

    /** Close the editor and record the edit as one undo step. */
    nodes.stopEdit = function () {
        if (!editor) return;
        const ed = editor;
        editor = null;
        const n = ed.node && core.nodes().includes(ed.node) ? ed.node : core.getNode(ed.id);
        ed.input.remove();
        ed.el.classList.remove('is-editing');
        core.editing = null;
        if (n && ed.isNew && n.type === 'text' && !S.str(n.text).trim()) {
            // A brand-new card left empty disappears, like cancelling it.
            core.removeItems([n.id], []);
            const changed = core.commit();
            if (!changed) core.reindex();
        } else {
            if (n && n.type === 'text' && ed.isNew) n.text = n.text.replace(/\s+$/, '');
            core.commit();
        }
        dropSig(ed.id);
        core.invalidate('all');
        core.emit('editing', null);
    };

    function stopEditImmediate() {
        if (!editor) return;
        editor.input.remove();
        editor.el.classList.remove('is-editing');
        editor = null;
        core.editing = null;
        if (core.inTransaction()) core.commit();
    }
})();
