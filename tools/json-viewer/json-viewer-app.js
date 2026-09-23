const JSON_VIEWER_TABS_STORAGE_KEY = 'json-viewer-tabs-v1';

class JsonViewerApp {
    constructor() {
        this.jsonInput     = document.getElementById('jsonInput');
        this.jsonTree      = document.getElementById('jsonTree');
        this.jsonError     = document.getElementById('jsonError');
        this.jsonStats     = document.getElementById('jsonStats');
        this.formatBtn     = document.getElementById('formatBtn');
        this.expandAllBtn  = document.getElementById('expandAllBtn');
        this.collapseAllBtn= document.getElementById('collapseAllBtn');
        this.copyFormattedBtn = document.getElementById('copyFormattedBtn');
        this.downloadBtn   = document.getElementById('downloadViewBtn');
        this.downloadLabel = document.getElementById('downloadViewLabel');
        this.clearBtn      = document.getElementById('clearBtn');
        this.copyNotif     = document.getElementById('copyNotification');
        this.searchInput   = document.getElementById('searchInput');
        this.searchPrev    = document.getElementById('searchPrev');
        this.searchNext    = document.getElementById('searchNext');
        this.searchCount   = document.getElementById('searchCount');
        this.searchClear   = document.getElementById('searchClear');
        this.searchMatches = [];
        this.searchIndex   = -1;
        this.parsed        = null;
        this.debounceTimer = null;
        this.saveTabsTimer = null;

        this.currentView   = 'tree';
        this.treeViewBtn   = document.getElementById('treeViewBtn');
        this.graphViewBtn  = document.getElementById('graphViewBtn');
        this.jsonGraphEl   = document.getElementById('jsonGraph');
        this.graphView     = new JsonGraphView(this.jsonGraphEl, {
            onCopyPath: (path) => this.copyPath(path)
        });

        // Tabs
        this.tabsBar       = document.getElementById('jsonTabs');
        this.addTabBtn     = document.getElementById('addTabBtn');
        this.tabs          = [];
        this.activeTabId   = null;
        this.tabIdCounter  = 0;

        this.init();
        this.initTabs();
    }

    init() {
        this.treeViewBtn.addEventListener('click', () => this.switchView('tree'));
        this.graphViewBtn.addEventListener('click', () => this.switchView('graph'));
        this.jsonInput.addEventListener('input', () => {
            const tab = this.getActiveTab();
            if (tab) tab.input = this.jsonInput.value;
            this.scheduleRender();
            this.scheduleSaveTabs();
        });
        this.formatBtn.addEventListener('click', () => this.formatInput());
        this.expandAllBtn.addEventListener('click', () => this.expandAll());
        this.collapseAllBtn.addEventListener('click', () => this.collapseAll());
        this.copyFormattedBtn.addEventListener('click', () => this.copyFormatted());
        this.downloadBtn.addEventListener('click', () => this.downloadCurrentView());
        this.clearBtn.addEventListener('click', () => this.clear());
        this.addTabBtn.addEventListener('click', () => this.addTab());
        this.jsonInput.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.formatInput();
            }
        });

        // Search
        this.searchInput.addEventListener('input', () => this.performSearch());
        this.searchPrev.addEventListener('click', () => this.navigateSearch(-1));
        this.searchNext.addEventListener('click', () => this.navigateSearch(1));
        this.searchClear.addEventListener('click', () => this.clearSearch());
        this.searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.shiftKey ? this.navigateSearch(-1) : this.navigateSearch(1); }
            if (e.key === 'Escape') { this.clearSearch(); this.searchInput.blur(); }
        });
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f' && this.parsed) {
                e.preventDefault();
                this.searchInput.focus();
                this.searchInput.select();
            }
        });
    }

    scheduleRender() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.render(), 400);
    }

    render() {
        const raw = this.jsonInput.value.trim();
        if (!raw) {
            this.clear(false);
            return;
        }

        try {
            this.parsed = JSON.parse(raw);
            this.jsonError.textContent = '';
            this.jsonError.style.display = 'none';
            this.renderTree(this.parsed);
            this.graphView.render(this.parsed);
            this.renderStats(this.parsed);
            if (this.currentView === 'graph') this.graphView.ensureFit();
            this.downloadBtn.disabled = false;
        } catch (e) {
            this.parsed = null;
            this.jsonTree.innerHTML = '';
            this.showError(e.message);
            this.jsonStats.textContent = '';
            this.downloadBtn.disabled = true;
        }
    }

    showError(msg) {
        this.jsonError.textContent = '⚠ ' + msg;
        this.jsonError.style.display = 'block';
    }

    renderTree(data) {
        const root = document.createElement('div');
        root.className = 'json-root';
        root.appendChild(this.buildNode(data, null, '', true));
        this.jsonTree.innerHTML = '';
        this.jsonTree.appendChild(root);
        if (this.searchInput.value.trim()) this.performSearch();
    }

    // ─── Node Builder ──────────────────────────────────────────

    buildNode(value, key, path, isRoot) {
        const type = this.getType(value);
        const isExpandable = type === 'object' || type === 'array';

        const wrapper = document.createElement('div');
        wrapper.className = 'json-node';

        if (isExpandable) {
            wrapper.appendChild(this.buildExpandable(value, key, path, type, isRoot));
        } else {
            wrapper.appendChild(this.buildLeaf(value, key, path, type));
        }

        return wrapper;
    }

    buildExpandable(value, key, path, type, isRoot) {
        const isArray = type === 'array';
        const count = isArray ? value.length : Object.keys(value).length;
        const openBracket  = isArray ? '[' : '{';
        const closeBracket = isArray ? ']' : '}';
        const empty = count === 0;

        const container = document.createElement('div');
        container.className = 'json-expandable';

        // Row: toggle + key + bracket + count badge
        const row = document.createElement('div');
        row.className = 'json-row json-row-expandable';

        const toggle = document.createElement('span');
        toggle.className = 'json-toggle';
        toggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';

        const keyEl = key !== null ? this.buildKeyEl(key, path) : null;

        const bracket = document.createElement('span');
        bracket.className = 'json-bracket';
        bracket.textContent = openBracket;

        const badge = document.createElement('span');
        badge.className = 'json-count-badge';
        badge.textContent = empty ? '' : (count + (isArray ? (count === 1 ? ' item' : ' items') : (count === 1 ? ' key' : ' keys')));

        row.appendChild(toggle);
        if (keyEl) row.appendChild(keyEl);
        if (key !== null) {
            const colon = document.createElement('span');
            colon.className = 'json-colon';
            colon.textContent = ': ';
            row.appendChild(colon);
        }
        row.appendChild(bracket);
        if (!empty) row.appendChild(badge);

        container.appendChild(row);

        if (empty) {
            const closingInline = document.createElement('span');
            closingInline.className = 'json-bracket';
            closingInline.textContent = closeBracket;
            row.appendChild(closingInline);
            return container;
        }

        // Children container
        const children = document.createElement('div');
        children.className = 'json-children';

        if (isArray) {
            value.forEach((item, i) => {
                const childPath = path ? path + '[' + i + ']' : '[' + i + ']';
                children.appendChild(this.buildNode(item, i, childPath, false));
            });
        } else {
            Object.keys(value).forEach(k => {
                const childPath = path ? path + '.' + k : k;
                children.appendChild(this.buildNode(value[k], k, childPath, false));
            });
        }

        // Closing bracket row
        const closingRow = document.createElement('div');
        closingRow.className = 'json-closing';
        closingRow.textContent = closeBracket;

        container.appendChild(children);
        container.appendChild(closingRow);

        // Toggle expand/collapse
        row.addEventListener('click', (e) => {
            if (e.target.closest('.json-key')) return; // let key handle path copy
            const collapsed = container.classList.toggle('collapsed');
            toggle.innerHTML = collapsed
                ? '<i class="fa-solid fa-chevron-right"></i>'
                : '<i class="fa-solid fa-chevron-down"></i>';
            badge.textContent = collapsed
                ? (count + (isArray ? (count === 1 ? ' item' : ' items') : (count === 1 ? ' key' : ' keys')))
                : (count + (isArray ? (count === 1 ? ' item' : ' items') : (count === 1 ? ' key' : ' keys')));
        });

        return container;
    }

    buildLeaf(value, key, path, type) {
        const row = document.createElement('div');
        row.className = 'json-row';

        if (key !== null) {
            const keyEl = this.buildKeyEl(key, path);
            const colon = document.createElement('span');
            colon.className = 'json-colon';
            colon.textContent = ': ';
            row.appendChild(keyEl);
            row.appendChild(colon);
        }

        const val = document.createElement('span');
        val.className = 'json-value json-' + type;
        val.textContent = type === 'string' ? '"' + this.escapeString(value) + '"' : String(value);
        row.appendChild(val);

        return row;
    }

    buildKeyEl(key, path) {
        const keyEl = document.createElement('span');
        keyEl.className = 'json-key';
        keyEl.textContent = typeof key === 'number' ? key : key;
        keyEl.dataset.path = path;
        keyEl.title = 'Copy path: ' + path;
        keyEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyPath(path);
        });
        return keyEl;
    }

    // ─── View switching ────────────────────────────────────────

    switchView(view) {
        if (view === this.currentView) return;
        this.currentView = view;
        this.treeViewBtn.classList.toggle('active', view === 'tree');
        this.graphViewBtn.classList.toggle('active', view === 'graph');
        this.jsonTree.classList.toggle('jg-hidden-view', view !== 'tree');
        this.jsonGraphEl.classList.toggle('jg-active', view === 'graph');
        this.downloadLabel.textContent = view === 'graph' ? 'Graph' : 'Tree';
        if (view === 'graph') this.graphView.ensureFit();
        if (this.searchInput.value.trim()) this.performSearch();
    }

    // ─── Search ────────────────────────────────────────────────

    performSearch() {
        const query = this.searchInput.value.trim();
        this.searchClear.style.display = query ? '' : 'none';

        if (this.currentView === 'graph') {
            this.performGraphSearch(query);
            return;
        }
        this.performTreeSearch(query);
    }

    performTreeSearch(query) {
        this.jsonTree.querySelectorAll('.search-match, .search-match-active').forEach(el => {
            el.classList.remove('search-match', 'search-match-active');
        });
        this.searchMatches = [];
        this.searchIndex = -1;

        const q = query.toLowerCase();
        if (!q || !this.parsed) {
            this.searchCount.textContent = '';
            this.searchPrev.disabled = true;
            this.searchNext.disabled = true;
            return;
        }

        this.jsonTree.querySelectorAll('.json-key, .json-value').forEach(el => {
            if (el.textContent.toLowerCase().includes(q)) {
                el.classList.add('search-match');
                this.searchMatches.push(el);
            }
        });

        if (this.searchMatches.length > 0) {
            this.searchIndex = 0;
            this.activateMatch(0);
            this.searchCount.textContent = `1 / ${this.searchMatches.length}`;
        } else {
            this.searchCount.textContent = 'no matches';
        }
        this.searchPrev.disabled = this.searchMatches.length === 0;
        this.searchNext.disabled = this.searchMatches.length === 0;
    }

    performGraphSearch(query) {
        if (!query || !this.parsed) {
            this.graphView.search('');
            this.searchCount.textContent = '';
            this.searchPrev.disabled = true;
            this.searchNext.disabled = true;
            return;
        }
        const result = this.graphView.search(query);
        if (result.count > 0) {
            this.searchCount.textContent = `1 / ${result.count}`;
        } else {
            this.searchCount.textContent = 'no matches';
        }
        this.searchPrev.disabled = result.count === 0;
        this.searchNext.disabled = result.count === 0;
    }

    activateMatch(index) {
        this.searchMatches.forEach(el => el.classList.remove('search-match-active'));
        const el = this.searchMatches[index];
        if (!el) return;
        el.classList.add('search-match-active');
        // Expand any collapsed ancestors
        let node = el.parentElement;
        while (node && !node.classList.contains('json-root')) {
            if (node.classList.contains('json-expandable') && node.classList.contains('collapsed')) {
                node.classList.remove('collapsed');
                const toggle = node.querySelector(':scope > .json-row > .json-toggle');
                if (toggle) toggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
            }
            node = node.parentElement;
        }
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    navigateSearch(dir) {
        if (this.currentView === 'graph') {
            const result = this.graphView.navigateSearch(dir);
            if (result) this.searchCount.textContent = `${result.index + 1} / ${result.count}`;
            return;
        }
        if (this.searchMatches.length === 0) return;
        this.searchIndex = (this.searchIndex + dir + this.searchMatches.length) % this.searchMatches.length;
        this.activateMatch(this.searchIndex);
        this.searchCount.textContent = `${this.searchIndex + 1} / ${this.searchMatches.length}`;
    }

    clearSearch() {
        this.searchInput.value = '';
        this.searchClear.style.display = 'none';
        this.performSearch();
    }

    // ─── Actions ───────────────────────────────────────────────

    formatInput() {
        const raw = this.jsonInput.value.trim();
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            this.jsonInput.value = JSON.stringify(parsed, null, 2);
            const tab = this.getActiveTab();
            if (tab) tab.input = this.jsonInput.value;
            this.saveTabsToStorage();
            this.render();
        } catch (e) {
            this.showError(e.message);
        }
    }

    expandAll() {
        this.jsonTree.querySelectorAll('.json-expandable.collapsed').forEach(el => {
            el.classList.remove('collapsed');
            const toggle = el.querySelector('.json-toggle');
            if (toggle) toggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        });
        this.graphView.expandAll();
    }

    collapseAll() {
        this.jsonTree.querySelectorAll('.json-expandable:not(.collapsed)').forEach(el => {
            // Don't collapse the root level
            if (el.closest('.json-root') === el.parentElement) return;
            el.classList.add('collapsed');
            const toggle = el.querySelector('.json-toggle');
            if (toggle) toggle.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        });
        this.graphView.collapseAll();
    }

    copyFormatted() {
        if (!this.parsed) return;
        navigator.clipboard.writeText(JSON.stringify(this.parsed, null, 2))
            .then(() => this.showCopyNotif('JSON copied!'));
    }

    copyPath(path) {
        navigator.clipboard.writeText(path)
            .then(() => {
                this.showCopyNotif('Path copied!');
                const hint = document.getElementById('pathHint');
                if (hint) {
                    hint.textContent = path;
                    hint.classList.add('flashed');
                    setTimeout(() => {
                        hint.classList.remove('flashed');
                        hint.textContent = 'click any key to copy its path';
                    }, 2000);
                }
            });
    }

    clear(resetInput = true) {
        if (resetInput) {
            this.jsonInput.value = '';
            const tab = this.getActiveTab();
            if (tab) tab.input = '';
            this.saveTabsToStorage();
        }
        this.parsed = null;
        this.jsonTree.innerHTML = '<div class="json-empty-state"><i class="fa-solid fa-code"></i><p>Paste JSON on the left to explore it here</p></div>';
        this.jsonError.textContent = '';
        this.jsonError.style.display = 'none';
        this.jsonStats.textContent = '';
        this.searchMatches = [];
        this.searchIndex = -1;
        this.searchCount.textContent = '';
        this.searchPrev.disabled = true;
        this.searchNext.disabled = true;
        this.downloadBtn.disabled = true;
        this.graphView.reset();
    }

    showCopyNotif(msg) {
        this.copyNotif.textContent = msg;
        this.copyNotif.classList.add('show');
        setTimeout(() => this.copyNotif.classList.remove('show'), 1800);
    }

    // ─── Stats ─────────────────────────────────────────────────

    renderStats(data) {
        const stats = { keys: 0, arrays: 0, objects: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0 };
        this.countStats(data, stats);
        const parts = [];
        if (stats.objects)  parts.push(stats.objects + (stats.objects === 1 ? ' object' : ' objects'));
        if (stats.arrays)   parts.push(stats.arrays + (stats.arrays === 1 ? ' array' : ' arrays'));
        if (stats.keys)     parts.push(stats.keys + (stats.keys === 1 ? ' key' : ' keys'));
        this.jsonStats.textContent = parts.join(' · ');
    }

    countStats(val, stats) {
        const type = this.getType(val);
        if (type === 'object') {
            stats.objects++;
            Object.keys(val).forEach(k => { stats.keys++; this.countStats(val[k], stats); });
        } else if (type === 'array') {
            stats.arrays++;
            val.forEach(v => this.countStats(v, stats));
        } else if (type === 'string')  stats.strings++;
        else if (type === 'number')    stats.numbers++;
        else if (type === 'boolean')   stats.booleans++;
        else if (type === 'null')      stats.nulls++;
    }

    // ─── Helpers ───────────────────────────────────────────────

    getType(val) {
        if (val === null)           return 'null';
        if (Array.isArray(val))     return 'array';
        if (typeof val === 'object') return 'object';
        return typeof val; // string, number, boolean
    }

    escapeString(str) {
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    // ─── Download (Tree / Graph → PNG) ────────────────────────

    downloadCurrentView() {
        if (!this.parsed) return;
        const result = this.currentView === 'graph'
            ? this.graphView.buildExportSVG()
            : this.buildTreeExportSVG();
        if (!result) return;
        this.rasterizeSVGAndDownload(result.svg, result.width, result.height, `json-${this.currentView}-view.png`);
    }

    // Walks the live tree DOM (respecting whatever nodes are currently
    // expanded/collapsed on screen) and renders it as a standalone SVG.
    buildTreeExportSVG() {
        const rootEl = this.jsonTree.querySelector('.json-root');
        if (!rootEl) return null;

        const rowH = 20, indentW = 20, charW = 7.4, padX = 14, padY = 14;
        const lines = [];
        let maxChars = 0;

        const rowToSegments = (rowEl, prefix) => {
            const segs = [];
            if (prefix) segs.push({ text: prefix, cls: 'muted' });
            Array.from(rowEl.children).forEach(el => {
                if (el.classList.contains('json-toggle')) return;
                let cls = 'text';
                if (el.classList.contains('json-key')) cls = 'key';
                else if (el.classList.contains('json-colon')) cls = 'muted';
                else if (el.classList.contains('json-bracket')) cls = 'bracket';
                else if (el.classList.contains('json-count-badge')) cls = 'muted';
                else if (el.classList.contains('json-string')) cls = 'string';
                else if (el.classList.contains('json-number')) cls = 'number';
                else if (el.classList.contains('json-boolean')) cls = 'boolean';
                else if (el.classList.contains('json-null')) cls = 'null';
                segs.push({ text: el.textContent, cls });
            });
            return segs;
        };

        const addLine = (depth, segs) => {
            lines.push({ depth, segs });
            const len = depth * (indentW / charW) + segs.reduce((n, s) => n + s.text.length, 0);
            maxChars = Math.max(maxChars, len);
        };

        const walk = (nodeEl, depth) => {
            const expandable = nodeEl.querySelector(':scope > .json-expandable');
            if (expandable) {
                const collapsed = expandable.classList.contains('collapsed');
                const row = expandable.querySelector(':scope > .json-row');
                addLine(depth, rowToSegments(row, collapsed ? '▸ ' : '▾ '));
                const childrenEl = expandable.querySelector(':scope > .json-children');
                if (childrenEl && !collapsed) {
                    Array.from(childrenEl.children).forEach(childNode => walk(childNode, depth + 1));
                }
                const closingEl = expandable.querySelector(':scope > .json-closing');
                if (closingEl && !collapsed) {
                    addLine(depth, [{ text: closingEl.textContent, cls: 'bracket' }]);
                }
            } else {
                const row = nodeEl.querySelector(':scope > .json-row');
                if (row) addLine(depth, rowToSegments(row, null));
            }
        };
        Array.from(rootEl.children).forEach(child => walk(child, 0));

        if (lines.length === 0) return null;

        const cs = getComputedStyle(document.documentElement);
        const col = (name, fallback) => (cs.getPropertyValue(name) || fallback || '').trim() || fallback;
        const colors = {
            bg: col('--bg-secondary', '#2a2a2a'),
            text: col('--text-primary', '#eee'),
            muted: col('--text-secondary', '#999'),
            key: col('--accent-primary', '#6cf'),
            string: col('--syntax-string', '#9c6'),
            number: col('--syntax-number', '#c96'),
            boolean: col('--syntax-keyword', '#c6f'),
            null: col('--text-secondary', '#999'),
            bracket: col('--text-secondary', '#999')
        };

        const width = Math.round(padX * 2 + maxChars * charW);
        const height = Math.round(padY * 2 + lines.length * rowH);

        let body = '';
        lines.forEach((line, i) => {
            const y = padY + i * rowH + rowH * 0.75;
            const x = padX + line.depth * indentW;
            body += `<text x="${x}" y="${y}" font-family="Consolas, Monaco, monospace" font-size="13">`;
            line.segs.forEach(seg => {
                body += `<tspan fill="${colors[seg.cls] || colors.text}">${this.escXML(seg.text)}</tspan>`;
            });
            body += '</text>';
        });

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
            `<rect width="100%" height="100%" fill="${colors.bg}"/>${body}</svg>`;
        return { svg, width, height };
    }

    escXML(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    rasterizeSVGAndDownload(svgString, width, height, filename) {
        const scale = 2;
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
                if (!blob) return;
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                link.click();
                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            this.showCopyNotif('Failed to export image');
        };
        img.src = url;
    }

    // ─── Tabs ──────────────────────────────────────────────────

    createTab(input) {
        this.tabIdCounter += 1;
        return { id: 'tab-' + this.tabIdCounter, title: 'Tab ' + this.tabIdCounter, input: input || '' };
    }

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }

    initTabs() {
        if (!this.loadTabsFromStorage() || this.tabs.length === 0) {
            const first = this.createTab('');
            this.tabs = [first];
            this.activeTabId = first.id;
        }
        this.renderTabs();
        this.loadActiveTabIntoInput();
    }

    loadActiveTabIntoInput() {
        const tab = this.getActiveTab();
        this.jsonInput.value = tab ? tab.input : '';
        this.render();
    }

    addTab() {
        const cur = this.getActiveTab();
        if (cur) cur.input = this.jsonInput.value;
        const tab = this.createTab('');
        this.tabs.push(tab);
        this.activeTabId = tab.id;
        this.renderTabs();
        this.loadActiveTabIntoInput();
        this.saveTabsToStorage();
        this.jsonInput.focus();
    }

    switchTab(id) {
        if (id === this.activeTabId) return;
        const cur = this.getActiveTab();
        if (cur) cur.input = this.jsonInput.value;
        this.activeTabId = id;
        this.renderTabs();
        this.loadActiveTabIntoInput();
        this.saveTabsToStorage();
    }

    closeTab(id) {
        const idx = this.tabs.findIndex(t => t.id === id);
        if (idx === -1) return;
        const tab = this.tabs[idx];
        if (id === this.activeTabId) tab.input = this.jsonInput.value;
        if (tab.input && tab.input.trim() && !confirm(`Close "${tab.title}"? Its contents will be lost.`)) return;

        this.tabs.splice(idx, 1);
        if (this.tabs.length === 0) this.tabs.push(this.createTab(''));

        if (this.activeTabId === id) {
            const newIdx = Math.min(idx, this.tabs.length - 1);
            this.activeTabId = this.tabs[newIdx].id;
            this.loadActiveTabIntoInput();
        }
        this.renderTabs();
        this.saveTabsToStorage();
    }

    renderTabs() {
        this.tabsBar.querySelectorAll('.json-tab').forEach(el => el.remove());
        this.tabs.forEach(tab => {
            const el = document.createElement('div');
            el.className = 'json-tab' + (tab.id === this.activeTabId ? ' active' : '');
            el.dataset.id = tab.id;

            const title = document.createElement('span');
            title.className = 'json-tab-title';
            title.textContent = tab.title;
            title.title = tab.title;
            title.addEventListener('dblclick', e => {
                e.stopPropagation();
                this.beginRenameTab(tab.id, title);
            });

            const closeBtn = document.createElement('button');
            closeBtn.className = 'json-tab-close';
            closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            closeBtn.title = 'Close tab';
            closeBtn.addEventListener('click', e => {
                e.stopPropagation();
                this.closeTab(tab.id);
            });

            el.appendChild(title);
            el.appendChild(closeBtn);
            el.addEventListener('click', () => this.switchTab(tab.id));

            this.tabsBar.insertBefore(el, this.addTabBtn);
        });
    }

    beginRenameTab(id, titleEl) {
        const tab = this.tabs.find(t => t.id === id);
        if (!tab) return;
        titleEl.contentEditable = 'true';
        titleEl.focus();
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finish = () => {
            titleEl.contentEditable = 'false';
            const newTitle = titleEl.textContent.trim() || tab.title;
            tab.title = newTitle;
            titleEl.textContent = newTitle;
            titleEl.title = newTitle;
            this.saveTabsToStorage();
            titleEl.removeEventListener('blur', finish);
            titleEl.removeEventListener('keydown', onKey);
        };
        const onKey = e => {
            if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
            if (e.key === 'Escape') { titleEl.textContent = tab.title; titleEl.blur(); }
        };
        titleEl.addEventListener('blur', finish);
        titleEl.addEventListener('keydown', onKey);
    }

    loadTabsFromStorage() {
        try {
            const raw = localStorage.getItem(JSON_VIEWER_TABS_STORAGE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) return false;
            this.tabs = data.tabs.map(t => ({
                id: String(t.id),
                title: t.title || 'Tab',
                input: typeof t.input === 'string' ? t.input : ''
            }));
            this.tabIdCounter = this.tabs.reduce((max, t) => {
                const n = parseInt(String(t.id).replace('tab-', ''), 10);
                return isNaN(n) ? max : Math.max(max, n);
            }, 0);
            this.activeTabId = (data.activeTabId && this.tabs.some(t => t.id === data.activeTabId))
                ? data.activeTabId : this.tabs[0].id;
            return true;
        } catch (e) {
            return false;
        }
    }

    saveTabsToStorage() {
        try {
            localStorage.setItem(JSON_VIEWER_TABS_STORAGE_KEY, JSON.stringify({
                tabs: this.tabs,
                activeTabId: this.activeTabId
            }));
        } catch (e) {}
    }

    scheduleSaveTabs() {
        clearTimeout(this.saveTabsTimer);
        this.saveTabsTimer = setTimeout(() => this.saveTabsToStorage(), 500);
    }
}

document.addEventListener('DOMContentLoaded', () => new JsonViewerApp());
