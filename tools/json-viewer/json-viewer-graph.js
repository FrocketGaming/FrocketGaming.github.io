// Graph size limits: long child lists reveal GRAPH_CHUNK nodes at a time behind a
// "+N more" node, and automatic expansion stops once a node budget is spent.
const GRAPH_CHUNK = 50;
const GRAPH_AUTO_BUDGET = 300;        // on first render and on "+N more"
const GRAPH_TOGGLE_BUDGET = 150;      // when a row is opened by hand
const GRAPH_EXPAND_ALL_BUDGET = 2000; // Expand All

class JsonGraphView {
    constructor(container, opts) {
        this.container = container;
        this.onCopyPath = (opts && opts.onCopyPath) || (() => {});
        this.direction = 'LR';
        this.pan = { x: 0, y: 0 };
        this.scale = 1;
        this.minScale = 0.05;
        this.maxScale = 2.5;
        this.model = null;
        this.nodesById = new Map();
        this.searchMatches = [];
        this.searchIndex = -1;
        this.dragging = false;
        this.rowH = 26;
        this.padY = 8;
        this.padX = 14;
        this.minW = 90;
        this.maxW = 320;
        this.colGapBase = 80;
        this.rowGap = 16;
        this.uid = 0;

        this.buildDom();
        this.bindEvents();
    }

    // ─── DOM scaffold ──────────────────────────────────────────

    buildDom() {
        this.container.innerHTML = '';
        this.container.classList.add('jg-root');

        this.viewport = document.createElement('div');
        this.viewport.className = 'jg-viewport';

        this.canvas = document.createElement('div');
        this.canvas.className = 'jg-canvas';

        this.edgesSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.edgesSvg.setAttribute('class', 'jg-edges');

        this.nodesLayer = document.createElement('div');
        this.nodesLayer.className = 'jg-nodes';

        this.canvas.appendChild(this.edgesSvg);
        this.canvas.appendChild(this.nodesLayer);
        this.viewport.appendChild(this.canvas);
        this.container.appendChild(this.viewport);

        // Controls (bottom-center floating cluster)
        this.controls = document.createElement('div');
        this.controls.className = 'jg-controls';
        this.controls.innerHTML = `
            <button class="jg-ctrl-btn" data-act="fit" title="Fit to view"><i class="fa-solid fa-expand"></i></button>
            <button class="jg-ctrl-btn" data-act="zoomout" title="Zoom out"><i class="fa-solid fa-minus"></i></button>
            <button class="jg-ctrl-btn" data-act="zoomin" title="Zoom in"><i class="fa-solid fa-plus"></i></button>
            <span class="jg-ctrl-sep"></span>
            <button class="jg-ctrl-btn" data-act="direction" title="Toggle layout direction"><i class="fa-solid fa-arrows-turn-to-dots"></i></button>
        `;
        this.container.appendChild(this.controls);
        this.controls.addEventListener('click', e => {
            const btn = e.target.closest('.jg-ctrl-btn');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'zoomin') this.zoomBy(1.25);
            else if (act === 'zoomout') this.zoomBy(0.8);
            else if (act === 'fit') this.fitToView();
            else if (act === 'direction') this.toggleDirection();
        });

        // Minimap
        this.minimap = document.createElement('div');
        this.minimap.className = 'jg-minimap';
        this.minimapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.minimapSvg.setAttribute('class', 'jg-minimap-svg');
        this.minimapViewport = document.createElement('div');
        this.minimapViewport.className = 'jg-minimap-viewport';
        this.minimap.appendChild(this.minimapSvg);
        this.minimap.appendChild(this.minimapViewport);
        this.container.appendChild(this.minimap);

        this.emptyState = document.createElement('div');
        this.emptyState.className = 'jg-empty-state';
        this.emptyState.innerHTML = '<i class="fa-solid fa-diagram-project"></i><p>Paste JSON on the left to explore it as a graph</p>';
        this.container.appendChild(this.emptyState);
    }

    bindEvents() {
        this.viewport.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            if (e.target.closest('.jg-node')) return;
            this.dragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY, panX: this.pan.x, panY: this.pan.y };
            this.viewport.classList.add('jg-dragging');
        });
        window.addEventListener('mousemove', e => {
            if (!this.dragging) return;
            this.pan.x = this.dragStart.panX + (e.clientX - this.dragStart.x);
            this.pan.y = this.dragStart.panY + (e.clientY - this.dragStart.y);
            this.scheduleTransform();
        });
        window.addEventListener('mouseup', () => {
            this.dragging = false;
            this.viewport.classList.remove('jg-dragging');
        });

        this.viewport.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = this.viewport.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            this.zoomAt(cx, cy, factor);
        }, { passive: false });

        this.minimapSvg.addEventListener('mousedown', e => this.startMinimapDrag(e));

        // One listener for every node: "+N more", row toggles, path copy
        this.nodesLayer.addEventListener('click', e => {
            const nodeEl = e.target.closest('.jg-node');
            const node = nodeEl && this.nodesById.get(nodeEl.dataset.id);
            if (!node) return;
            if (node.kind === 'more') { this.showMore(node); return; }
            const link = e.target.closest('.jg-row-link');
            if (link) { this.toggleRow(node.id, +link.dataset.rowIdx); return; }
            this.copyPathFor(node);
        });

        this.resizeObserver = new ResizeObserver(entries => {
            const r = entries[entries.length - 1].contentRect;
            this.viewportSize = { w: r.width, h: r.height };
            if (this.model) this.applyTransform();
        });
        this.resizeObserver.observe(this.viewport);
    }

    // ─── Model building ─────────────────────────────────────────
    // Mirrors jsoncrack.com's semantics:
    //  - an object becomes ONE node with one row per key (primitives inline,
    //    nested values become a collapsible preview row wired to child node(s))
    //  - an array does NOT get its own container node; each element becomes
    //    its own node (leaf / object / array-wrapper) attached directly to
    //    the referencing row, all sharing that row's edge label
    //  - a bare nested array (element of an array, or the root) becomes a
    //    single-row "[N items]" wrapper node with no key of its own

    newId() { return 'n' + (this.uid++); }

    buildObjectNode(value) {
        const id = this.newId();
        const node = { id, kind: 'object', rows: [], children: [] };
        this.nodesById.set(id, node);
        const keys = Object.keys(value);
        if (keys.length === 0) {
            node.rows.push({ isEmpty: true, label: '{ }' });
            return node;
        }
        keys.forEach(k => {
            const v = value[k];
            const vType = this.getType(v);
            if (vType === 'object') {
                const size = Object.keys(v).length;
                if (size === 0) {
                    node.rows.push({ key: k, isEmpty: true, label: '{ }' });
                } else {
                    const child = this.buildObjectNode(v);
                    this.linkChildren(node, [child]);
                    node.rows.push({ key: k, type: 'object', preview: `{${size} ${size === 1 ? 'key' : 'keys'}}`, childIds: [child.id], collapsed: false, shown: 1 });
                    node.children.push(child);
                }
            } else if (vType === 'array') {
                if (v.length === 0) {
                    node.rows.push({ key: k, isEmpty: true, label: '[ ]' });
                } else {
                    const kids = this.buildArrayElements(v);
                    this.linkChildren(node, kids);
                    node.rows.push({ key: k, type: 'array', preview: `[${v.length} ${v.length === 1 ? 'item' : 'items'}]`, childIds: kids.map(c => c.id), collapsed: false, shown: Math.min(kids.length, GRAPH_CHUNK) });
                    node.children.push(...kids);
                }
            } else {
                node.rows.push({ key: k, type: vType, value: v });
            }
        });
        return node;
    }

    // Called just before the parent pushes the row the children hang from, so
    // that row's index is node.rows.length. Lets path lookups walk upwards.
    linkChildren(node, kids) {
        const rowIdx = node.rows.length;
        kids.forEach((kid, i) => { kid.parentId = node.id; kid.parentRow = rowIdx; kid.indexInRow = i; });
    }

    buildArrayElements(arr) {
        return arr.map(el => {
            const t = this.getType(el);
            if (t === 'object') return this.buildObjectNode(el);
            if (t === 'array') return this.buildArrayWrapperNode(el);
            const id = this.newId();
            const node = { id, kind: 'leaf', rows: [{ type: t, value: el }], children: [] };
            this.nodesById.set(id, node);
            return node;
        });
    }

    buildArrayWrapperNode(arr) {
        const id = this.newId();
        const node = { id, kind: 'array-wrapper', rows: [], children: [] };
        this.nodesById.set(id, node);
        if (arr.length === 0) {
            node.rows.push({ isEmpty: true, label: '[ ]' });
        } else {
            const kids = this.buildArrayElements(arr);
            this.linkChildren(node, kids);
            node.rows.push({ type: 'array', label: `[${arr.length} ${arr.length === 1 ? 'item' : 'items'}]`, childIds: kids.map(c => c.id), collapsed: false, shown: Math.min(kids.length, GRAPH_CHUNK) });
            node.children.push(...kids);
        }
        return node;
    }

    render(data) {
        this.emptyState.style.display = 'none';
        this.nodesById.clear();
        this.uid = 0;
        const type = this.getType(data);
        if (type === 'object') this.model = this.buildObjectNode(data);
        else if (type === 'array') this.model = this.buildArrayWrapperNode(data);
        else {
            const id = this.newId();
            this.model = { id, kind: 'leaf', rows: [{ type, value: data }], children: [] };
            this.nodesById.set(id, this.model);
        }
        // Start collapsed, then open breadth-first while the node budget lasts
        this.nodesById.forEach(n => n.rows.forEach(r => { if (r.childIds) r.collapsed = true; }));
        this.autoExpand([this.model], GRAPH_AUTO_BUDGET);
        this.hasFitOnce = false;
        this.layoutAndDraw();
    }

    getType(val) {
        if (val === null) return 'null';
        if (Array.isArray(val)) return 'array';
        if (typeof val === 'object') return 'object';
        return typeof val;
    }

    // ─── Layout ─────────────────────────────────────────────────

    visibleChildren(node) {
        const out = [];
        node.rows.forEach((row, idx) => {
            const kids = this.rowChildren(node, idx);
            for (let i = 0; i < kids.length; i++) out.push(kids[i]);
        });
        return out;
    }

    // The children drawn for one row: the revealed chunk, any later children a
    // search pinned (`row.pinned`, sorted), and a "+N more" node for the rest.
    rowChildren(node, rowIdx) {
        const row = node.rows[rowIdx];
        if (!row.childIds || row.collapsed) return [];
        const out = [];
        for (let i = 0; i < row.shown; i++) out.push(this.nodesById.get(row.childIds[i]));
        const pinned = row.pinned || [];
        pinned.forEach(i => out.push(this.nodesById.get(row.childIds[i])));
        const remaining = row.childIds.length - row.shown - pinned.length;
        if (remaining > 0) {
            if (!row.more) {
                row.more = { id: node.id + '-more-' + rowIdx, kind: 'more', rows: [{ isMore: true }], children: [], ownerId: node.id, ownerRow: rowIdx };
                this.nodesById.set(row.more.id, row.more);
            }
            row.more.rows[0].label = `+${remaining.toLocaleString()} more`;
            out.push(row.more);
        }
        return out;
    }

    // Breadth-first: opens collapsed rows below the start nodes until the node
    // budget is spent. The root's own rows always open. Returns true if capped.
    autoExpand(startNodes, budget) {
        const queue = startNodes.slice();
        let used = 0, capped = false;
        for (let i = 0; i < queue.length; i++) {
            const node = queue[i];
            node.rows.forEach((row, idx) => {
                if (!row.childIds) return;
                if (row.collapsed) {
                    const cost = row.shown + (row.shown < row.childIds.length ? 1 : 0);
                    if (node !== this.model && used + cost > budget) { capped = true; return; }
                    row.collapsed = false;
                    used += cost;
                }
                this.rowChildren(node, idx).forEach(c => queue.push(c));
            });
        }
        return capped;
    }

    showMore(moreNode) {
        const owner = this.nodesById.get(moreNode.ownerId);
        const row = owner && owner.rows[moreNode.ownerRow];
        if (!row) return;
        const from = row.shown;
        row.shown = Math.min(row.childIds.length, row.shown + GRAPH_CHUNK);
        if (row.pinned) row.pinned = row.pinned.filter(i => i >= row.shown);
        const revealed = row.childIds.slice(from, row.shown).map(id => this.nodesById.get(id));
        this.autoExpand(revealed, GRAPH_AUTO_BUDGET);
        this.layoutAndDraw();
    }

    measure(node) {
        let maxTextLen = 4;
        node.rows.forEach(r => {
            let len;
            if (r.isMore) len = r.label.length;
            else if (r.isEmpty) len = (r.key ? r.key.length + 2 : 0) + r.label.length;
            else if (r.childIds) len = (r.key ? r.key.length + 2 : 0) + (r.preview || r.label).length;
            else if (r.key !== undefined) len = r.key.length + 2 + this.formatVal(r.value).length;
            else len = this.formatVal(r.value).length;
            maxTextLen = Math.max(maxTextLen, len);
        });
        node.width = Math.min(this.maxW, Math.max(this.minW, maxTextLen * 7.4 + this.padX * 2 + 14));
        node.height = this.padY * 2 + node.rows.length * this.rowH;
    }

    layoutAndDraw() {
        const visit = (node) => {
            this.measure(node);
            this.visibleChildren(node).forEach(visit);
        };
        visit(this.model);

        const isLR = this.direction === 'LR';

        // Depth axis (LR: x/width, TB: y/height) — column size = max box extent along the depth axis
        const colSize = [];
        const assignDepth = (node, depth) => {
            node.depth = depth;
            const size = isLR ? node.width : node.height;
            colSize[depth] = Math.max(colSize[depth] || 0, size);
            this.visibleChildren(node).forEach(c => assignDepth(c, depth + 1));
        };
        assignDepth(this.model, 0);

        const colPos = [0];
        for (let i = 1; i < colSize.length; i++) colPos[i] = colPos[i - 1] + colSize[i - 1] + this.colGapBase;

        // Breadth axis (LR: y/height, TB: x/width) — simple non-overlapping stack
        const breadthSize = (node) => isLR ? node.height : node.width;
        let cursor = 0;
        const assignBreadth = (node) => {
            const kids = this.visibleChildren(node);
            if (kids.length === 0) {
                node.breadth = cursor;
                cursor += breadthSize(node) + this.rowGap;
            } else {
                kids.forEach(assignBreadth);
                const first = kids[0], last = kids[kids.length - 1];
                const center = ((first.breadth + breadthSize(first) / 2) + (last.breadth + breadthSize(last) / 2)) / 2;
                node.breadth = center - breadthSize(node) / 2;
            }
        };
        assignBreadth(this.model);

        const setXY = (node) => {
            if (isLR) { node.x = colPos[node.depth]; node.y = node.breadth; }
            else { node.y = colPos[node.depth]; node.x = node.breadth; }
            this.visibleChildren(node).forEach(setXY);
        };
        setXY(this.model);

        this.draw();
        if (!this.hasFitOnce) this.ensureFit();
    }

    ensureFit() {
        if (this.hasFitOnce) return;
        if (this.fitToView()) this.hasFitOnce = true;
    }

    toggleDirection() {
        this.direction = this.direction === 'LR' ? 'TB' : 'LR';
        this.layoutAndDraw();
        this.fitToView();
    }

    // ─── Drawing ────────────────────────────────────────────────

    draw() {
        this.nodesById.forEach(n => { n.el = null; });
        let maxX = 0, maxY = 0;
        const html = [];
        const drawn = [];

        const drawNode = (node) => {
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
            html.push(`<div class="jg-node jg-node-${node.kind}" data-id="${node.id}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px">`);
            node.rows.forEach((row, idx) => html.push(this.rowHTML(row, idx)));
            html.push('</div>');
            drawn.push(node);
            this.visibleChildren(node).forEach(drawNode);
        };
        drawNode(this.model);

        this.nodesLayer.innerHTML = html.join('');
        const els = this.nodesLayer.children;
        for (let i = 0; i < drawn.length; i++) drawn[i].el = els[i];

        this.contentBounds = { w: maxX + 40, h: maxY + 40 };
        this.edgesSvg.setAttribute('width', this.contentBounds.w);
        this.edgesSvg.setAttribute('height', this.contentBounds.h);
        this.canvas.style.width = this.contentBounds.w + 'px';
        this.canvas.style.height = this.contentBounds.h + 'px';

        this.drawEdges();
        this.drawMinimap();
        this.applyTransform();
        this.applySearchHighlight();
    }

    rowHTML(row, idx) {
        const keyPart = row.key !== undefined ? `<span class="jg-key">${this.esc(row.key)}</span><span class="jg-colon">:</span>` : '';
        if (row.isMore) {
            return `<div class="jg-row jg-row-more" data-row-idx="${idx}"><i class="fa-solid fa-ellipsis jg-row-toggle"></i><span class="jg-more">${row.label}</span></div>`;
        }
        if (row.isEmpty) {
            return `<div class="jg-row" data-row-idx="${idx}">${keyPart}<span class="jg-bracket">${row.label}</span></div>`;
        }
        if (row.childIds) {
            const toggle = `<i class="fa-solid ${row.collapsed ? 'fa-chevron-right' : 'fa-chevron-down'} jg-row-toggle"></i>`;
            return `<div class="jg-row jg-row-link" data-row-idx="${idx}">${toggle}${keyPart}<span class="jg-preview jg-type-${row.type}">${row.preview || row.label}</span></div>`;
        }
        return `<div class="jg-row" data-row-idx="${idx}">${keyPart}<span class="jg-val jg-type-${row.type}">${this.esc(this.formatVal(row.value))}</span></div>`;
    }

    drawEdges() {
        const out = [];
        const draw = (node) => {
            node.rows.forEach((row, rowIdx) => {
                const kids = this.rowChildren(node, rowIdx);
                if (!kids.length) return;
                const sy = node.y + this.padY + rowIdx * this.rowH + this.rowH / 2;
                const sx = node.x + node.width;
                const label = row.key !== undefined ? this.esc(row.key) : null;
                kids.forEach(child => {
                    let sx0 = sx, sy0 = sy, ex, ey, d;
                    if (this.direction === 'LR') {
                        ex = child.x; ey = child.y + child.height / 2;
                        const mx = (sx0 + ex) / 2;
                        d = `M ${sx0} ${sy0} C ${mx} ${sy0}, ${mx} ${ey}, ${ex} ${ey}`;
                    } else {
                        sx0 = node.x + node.width / 2; sy0 = node.y + node.height;
                        ex = child.x + child.width / 2; ey = child.y;
                        const my = (sy0 + ey) / 2;
                        d = `M ${sx0} ${sy0} C ${sx0} ${my}, ${ex} ${my}, ${ex} ${ey}`;
                    }
                    out.push(`<path class="jg-edge" d="${d}"/>`);
                    if (label !== null) {
                        const lx = (sx0 + ex) / 2;
                        const ly = this.direction === 'LR' ? (sy0 + ey) / 2 - 6 : (sy0 + ey) / 2;
                        out.push(`<text class="jg-edge-label" x="${lx}" y="${ly}" text-anchor="middle">${label}</text>`);
                    }
                    draw(child);
                });
            });
        };
        draw(this.model);
        this.edgesSvg.innerHTML = out.join('');
    }

    drawMinimap() {
        const pad = 6, mmW = 160, mmH = 110;
        this.minimapSvg.setAttribute('viewBox', `0 0 ${mmW} ${mmH}`);
        const sx = (mmW - pad * 2) / Math.max(1, this.contentBounds.w);
        const sy = (mmH - pad * 2) / Math.max(1, this.contentBounds.h);
        const s = Math.min(sx, sy);
        this._mmScale = s; this._mmPad = pad;

        const out = [];
        const walk = (node) => {
            out.push(`<rect class="jg-mm-node" x="${pad + node.x * s}" y="${pad + node.y * s}" width="${Math.max(1, node.width * s)}" height="${Math.max(1, node.height * s)}"/>`);
            this.visibleChildren(node).forEach(walk);
        };
        walk(this.model);
        this.minimapSvg.innerHTML = out.join('');
        this.updateMinimapViewport();
    }

    updateMinimapViewport() {
        if (!this._mmScale) return;
        const size = this.viewportSize || { w: this.viewport.clientWidth, h: this.viewport.clientHeight };
        const vw = size.w / this.scale, vh = size.h / this.scale;
        const vx = -this.pan.x / this.scale, vy = -this.pan.y / this.scale;
        const s = this._mmScale, pad = this._mmPad;
        this.minimapViewport.style.left = (pad + vx * s) + 'px';
        this.minimapViewport.style.top = (pad + vy * s) + 'px';
        this.minimapViewport.style.width = Math.max(4, vw * s) + 'px';
        this.minimapViewport.style.height = Math.max(4, vh * s) + 'px';
    }

    startMinimapDrag(e) {
        const move = (ev) => {
            const rect = this.minimapSvg.getBoundingClientRect();
            const mx = (ev.clientX - rect.left) * (160 / rect.width);
            const my = (ev.clientY - rect.top) * (110 / rect.height);
            const s = this._mmScale, pad = this._mmPad;
            const targetX = (mx - pad) / s, targetY = (my - pad) / s;
            const vrect = this.viewport.getBoundingClientRect();
            this.pan.x = -(targetX * this.scale) + vrect.width / 2;
            this.pan.y = -(targetY * this.scale) + vrect.height / 2;
            this.scheduleTransform();
        };
        move(e);
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    }

    // ─── Transform / zoom / pan ─────────────────────────────────

    // Pointer-driven pan/zoom: coalesce to one transform per frame
    scheduleTransform() {
        if (this.transformFrame) return;
        this.transformFrame = requestAnimationFrame(() => {
            this.transformFrame = 0;
            this.applyTransform();
        });
    }

    applyTransform() {
        this.canvas.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.scale})`;
        this.updateMinimapViewport();
    }

    zoomAt(cx, cy, factor) {
        const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
        const ratio = newScale / this.scale;
        this.pan.x = cx - (cx - this.pan.x) * ratio;
        this.pan.y = cy - (cy - this.pan.y) * ratio;
        this.scale = newScale;
        this.scheduleTransform();
    }

    zoomBy(factor) {
        const rect = this.viewport.getBoundingClientRect();
        this.zoomAt(rect.width / 2, rect.height / 2, factor);
    }

    fitToView() {
        if (!this.contentBounds) return false;
        const rect = this.viewport.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return false;
        const scale = Math.min(this.maxScale, Math.max(this.minScale,
            Math.min(rect.width / this.contentBounds.w, rect.height / this.contentBounds.h) * 0.9));
        this.scale = scale;
        this.pan.x = (rect.width - this.contentBounds.w * scale) / 2;
        this.pan.y = (rect.height - this.contentBounds.h * scale) / 2;
        this.applyTransform();
        return true;
    }

    centerOn(node) {
        const rect = this.viewport.getBoundingClientRect();
        const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
        this.pan.x = rect.width / 2 - cx * this.scale;
        this.pan.y = rect.height / 2 - cy * this.scale;
        this.applyTransform();
    }

    // ─── Collapse / expand ──────────────────────────────────────

    toggleRow(nodeId, rowIdx) {
        const node = this.nodesById.get(nodeId);
        if (!node) return;
        const row = node.rows[rowIdx];
        if (!row || !row.childIds) return;
        row.collapsed = !row.collapsed;
        if (!row.collapsed) this.autoExpand(this.rowChildren(node, rowIdx), GRAPH_TOGGLE_BUDGET);
        this.layoutAndDraw();
    }

    // Returns true when the node budget stopped it short of everything
    expandAll() {
        const capped = this.autoExpand([this.model], GRAPH_EXPAND_ALL_BUDGET);
        this.layoutAndDraw();
        return capped;
    }

    collapseAll() {
        this.nodesById.forEach(n => {
            const isRoot = n === this.model;
            n.rows.forEach(r => { if (r.childIds && !isRoot) r.collapsed = true; });
        });
        this.layoutAndDraw();
    }

    // ─── Search ─────────────────────────────────────────────────

    search(query) {
        this.searchMatches = [];
        this.searchIndex = -1;
        const q = query.trim().toLowerCase();
        if (!q) { this.applySearchHighlight(); return { count: 0 }; }

        this.nodesById.forEach(node => {
            node.rows.forEach((row, idx) => {
                const key = row.key !== undefined ? String(row.key).toLowerCase() : '';
                const val = row.value !== undefined ? this.formatVal(row.value).toLowerCase() : '';
                if (key.includes(q) || val.includes(q)) this.searchMatches.push({ nodeId: node.id, rowIdx: idx });
            });
        });
        if (this.searchMatches.length) this.searchIndex = 0;
        if (!this.revealActiveMatch()) this.applySearchHighlight();
        return { count: this.searchMatches.length, index: this.searchIndex };
    }

    // Opens the rows (and chunks) leading down to the active match. Redraws and
    // returns true if anything had to change.
    revealActiveMatch() {
        const match = this.searchMatches[this.searchIndex];
        if (!match) return false;
        let changed = false;
        let cur = this.nodesById.get(match.nodeId);
        while (cur && cur.parentId !== undefined) {
            const parent = this.nodesById.get(cur.parentId);
            const row = parent.rows[cur.parentRow];
            if (row.collapsed) { row.collapsed = false; changed = true; }
            // Pin just this child rather than revealing every chunk before it
            const idx = cur.indexInRow;
            if (idx >= row.shown && !(row.pinned && row.pinned.includes(idx))) {
                row.pinned = (row.pinned || []).concat(idx).sort((a, b) => a - b);
                changed = true;
            }
            cur = parent;
        }
        if (changed) this.layoutAndDraw();
        return changed;
    }

    navigateSearch(dir) {
        if (!this.searchMatches.length) return null;
        this.searchIndex = (this.searchIndex + dir + this.searchMatches.length) % this.searchMatches.length;
        if (!this.revealActiveMatch()) this.applySearchHighlight();
        return { count: this.searchMatches.length, index: this.searchIndex };
    }

    applySearchHighlight() {
        this.nodesLayer.querySelectorAll('.jg-match, .jg-match-active').forEach(r => r.classList.remove('jg-match', 'jg-match-active'));
        this.searchMatches.forEach((m, i) => {
            const node = this.nodesById.get(m.nodeId);
            if (!node || !node.el) return;
            const rowEl = node.el.querySelector(`.jg-row[data-row-idx="${m.rowIdx}"]`);
            if (rowEl) rowEl.classList.add(i === this.searchIndex ? 'jg-match-active' : 'jg-match');
        });
        if (this.searchIndex >= 0) {
            const active = this.searchMatches[this.searchIndex];
            const node = this.nodesById.get(active.nodeId);
            if (node && node.el) this.centerOn(node);
        }
    }

    clearSearch() {
        this.searchMatches = [];
        this.searchIndex = -1;
        this.applySearchHighlight();
    }

    // ─── Export ─────────────────────────────────────────────────
    // Renders the current model (respecting whatever rows are presently
    // expanded/collapsed) as a standalone SVG string, using live theme colors.

    buildExportSVG() {
        if (!this.model || !this.contentBounds) return null;

        const cs = getComputedStyle(document.documentElement);
        const col = (name, fallback) => (cs.getPropertyValue(name) || fallback || '').trim() || fallback;
        const colors = {
            bg: col('--bg-primary', '#1e1e1e'),
            nodeBg: col('--bg-secondary', '#2a2a2a'),
            border: col('--border-color', '#444'),
            muted: col('--text-secondary', '#999'),
            key: col('--accent-primary', '#6cf'),
            string: col('--syntax-string', '#9c6'),
            number: col('--syntax-number', '#c96'),
            boolean: col('--syntax-keyword', '#c6f')
        };
        const typeColor = (type) => {
            if (type === 'string') return colors.string;
            if (type === 'number') return colors.number;
            if (type === 'boolean') return colors.boolean;
            return colors.muted; // null, object, array
        };

        let edgesMarkup = '';
        const drawEdges = (node) => {
            node.rows.forEach((row, rowIdx) => {
                const kids = this.rowChildren(node, rowIdx);
                if (!kids.length) return;
                const sy = node.y + this.padY + rowIdx * this.rowH + this.rowH / 2;
                kids.forEach(child => {
                    let sx0, sy0, ex, ey, d;
                    if (this.direction === 'LR') {
                        sx0 = node.x + node.width; sy0 = sy;
                        ex = child.x; ey = child.y + child.height / 2;
                        const mx = (sx0 + ex) / 2;
                        d = `M ${sx0} ${sy0} C ${mx} ${sy0}, ${mx} ${ey}, ${ex} ${ey}`;
                    } else {
                        sx0 = node.x + node.width / 2; sy0 = node.y + node.height;
                        ex = child.x + child.width / 2; ey = child.y;
                        const my = (sy0 + ey) / 2;
                        d = `M ${sx0} ${sy0} C ${sx0} ${my}, ${ex} ${my}, ${ex} ${ey}`;
                    }
                    edgesMarkup += `<path d="${d}" fill="none" stroke="${colors.border}" stroke-width="1.5"/>`;
                    if (row.key !== undefined) {
                        const lx = (sx0 + ex) / 2;
                        const ly = this.direction === 'LR' ? (sy0 + ey) / 2 - 6 : (sy0 + ey) / 2;
                        edgesMarkup += `<text x="${lx}" y="${ly}" text-anchor="middle" font-family="Consolas, Monaco, monospace" font-size="11" fill="${colors.muted}">${this.esc(row.key)}</text>`;
                    }
                    drawEdges(child);
                });
            });
        };
        drawEdges(this.model);

        let nodesMarkup = '';
        const drawNode = (node) => {
            nodesMarkup += `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" fill="${colors.nodeBg}" stroke="${colors.border}"/>`;
            node.rows.forEach((row, idx) => {
                const ry = node.y + this.padY + idx * this.rowH;
                if (idx > 0) nodesMarkup += `<line x1="${node.x}" y1="${ry}" x2="${node.x + node.width}" y2="${ry}" stroke="${colors.border}" stroke-width="1"/>`;
                const ty = ry + this.rowH * 0.65;
                const tx = node.x + this.padX;
                nodesMarkup += `<text x="${tx}" y="${ty}" font-family="Consolas, Monaco, monospace" font-size="12">`;
                if (row.isMore) {
                    nodesMarkup += `<tspan fill="${colors.muted}">${this.esc(row.label)}</tspan>`;
                } else if (row.isEmpty) {
                    if (row.key !== undefined) nodesMarkup += `<tspan fill="${colors.key}">${this.esc(row.key)}</tspan><tspan fill="${colors.muted}">: </tspan>`;
                    nodesMarkup += `<tspan fill="${colors.muted}">${this.esc(row.label)}</tspan>`;
                } else if (row.childIds) {
                    const arrow = row.collapsed ? '▸' : '▾';
                    nodesMarkup += `<tspan fill="${colors.muted}">${arrow} </tspan>`;
                    if (row.key !== undefined) nodesMarkup += `<tspan fill="${colors.key}">${this.esc(row.key)}</tspan><tspan fill="${colors.muted}">: </tspan>`;
                    nodesMarkup += `<tspan fill="${colors.muted}">${this.esc(row.preview || row.label)}</tspan>`;
                } else if (row.key !== undefined) {
                    nodesMarkup += `<tspan fill="${colors.key}">${this.esc(row.key)}</tspan><tspan fill="${colors.muted}">: </tspan><tspan fill="${typeColor(row.type)}">${this.esc(this.formatVal(row.value))}</tspan>`;
                } else {
                    nodesMarkup += `<tspan fill="${typeColor(row.type)}">${this.esc(this.formatVal(row.value))}</tspan>`;
                }
                nodesMarkup += '</text>';
            });
            this.visibleChildren(node).forEach(drawNode);
        };
        drawNode(this.model);

        const width = this.contentBounds.w;
        const height = this.contentBounds.h;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
            `<rect width="100%" height="100%" fill="${colors.bg}"/>` +
            edgesMarkup + nodesMarkup +
            `</svg>`;
        return { svg, width, height };
    }

    // ─── Helpers ────────────────────────────────────────────────

    copyPathFor(node) {
        const trail = [];
        let cur = node;
        while (cur.parentId !== undefined) {
            const parent = this.nodesById.get(cur.parentId);
            const row = parent.rows[cur.parentRow];
            // Array elements hang from a row, keyed or not, and need their index
            const keyPart = row.key !== undefined ? '.' + row.key : '';
            trail.unshift(row.type === 'array' ? keyPart + '[' + cur.indexInRow + ']' : keyPart);
            cur = parent;
        }
        this.onCopyPath(trail.join('').replace(/^\./, '') || '(root)');
    }

    formatVal(value) {
        const type = this.getType(value);
        if (type === 'string') return '"' + String(value) + '"';
        return String(value);
    }

    esc(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    reset() {
        this.model = null;
        this.nodesById.clear();
        this.searchMatches = [];
        this.searchIndex = -1;
        this.hasFitOnce = false;
        this.pan = { x: 0, y: 0 };
        this.scale = 1;
        this.nodesLayer.innerHTML = '';
        this.edgesSvg.innerHTML = '';
        this.minimapSvg.innerHTML = '';
        this.applyTransform();
        this.emptyState.style.display = 'flex';
    }

    destroy() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
    }
}
