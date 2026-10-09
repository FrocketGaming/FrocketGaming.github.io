const JSON_VIEWER_TABS_STORAGE_KEY = 'json-viewer-tabs-v1';

// The tree is built lazily: a container's children only exist in the DOM once
// it has been opened, and long arrays/objects reveal TREE_CHUNK entries at a time.
// The budgets cap how many rows an automatic expansion may build in one go.
const TREE_CHUNK = 100;
const TREE_AUTO_BUDGET = 1500;        // on paste and on "show more"
const TREE_TOGGLE_BUDGET = 1000;      // when a single node is opened by hand
const TREE_EXPAND_ALL_BUDGET = 20000; // Expand All

class JsonViewerApp {
    constructor() {
        this.jsonInput     = document.getElementById('jsonInput');
        this.jsonTree      = document.getElementById('jsonTree');
        this.jsonError     = document.getElementById('jsonError');
        this.jsonStats     = document.getElementById('jsonStats');
        this.formatBtn     = document.getElementById('formatBtn');
        this.fromPythonBtn = document.getElementById('fromPythonBtn');
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
        this.matchByPath   = null;
        this.activeMatchEl = null;
        this.searchTimer   = null;
        this.parsed        = null;
        this.parsedFormat  = 'json';
        this.treeMetas     = [];
        this.rootMeta      = null;
        this.graphStale    = false;
        this.debounceTimer = null;
        this.saveTabsTimer = null;
        this.warnedQuota   = false;

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
        this.fromPythonBtn.addEventListener('click', () => this.convertFromPython());
        this.expandAllBtn.addEventListener('click', () => this.expandAll());
        this.collapseAllBtn.addEventListener('click', () => this.collapseAll());
        this.copyFormattedBtn.addEventListener('click', () => this.copyFormatted());
        this.downloadBtn.addEventListener('click', () => this.downloadCurrentView());
        this.clearBtn.addEventListener('click', () => this.clear());
        this.addTabBtn.addEventListener('click', () => this.addTab());
        this.jsonTree.addEventListener('click', e => this.onTreeClick(e));
        window.addEventListener('pagehide', () => this.flushSaveTabs());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flushSaveTabs();
        });
        this.jsonInput.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.formatInput();
            }
        });

        // Search
        this.searchInput.addEventListener('input', () => {
            this.searchClear.style.display = this.searchInput.value.trim() ? '' : 'none';
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => { this.searchTimer = null; this.performSearch(); }, 150);
        });
        this.searchPrev.addEventListener('click', () => this.navigateSearch(-1));
        this.searchNext.addEventListener('click', () => this.navigateSearch(1));
        this.searchClear.addEventListener('click', () => this.clearSearch());
        this.searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                // Enter straight after typing runs the pending search instead of skipping a match
                if (this.flushSearch()) return;
                e.shiftKey ? this.navigateSearch(-1) : this.navigateSearch(1);
            }
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

        const result = this.parseInput(raw);
        if (result.ok) {
            this.parsed = result.value;
            this.parsedFormat = result.format;
            this.jsonError.textContent = '';
            this.jsonError.style.display = 'none';
            this.renderTree(this.parsed);
            // The graph is only built while it is on screen; mark it out of date.
            this.graphStale = true;
            if (this.currentView === 'graph') this.syncGraph();
            this.renderStats(this.parsed);
            this.downloadBtn.disabled = false;
        } else {
            this.parsed = null;
            this.treeMetas = [];
            this.rootMeta = null;
            this.jsonTree.innerHTML = '';
            this.showError(result.message);
            this.jsonStats.textContent = '';
            this.downloadBtn.disabled = true;
        }
    }

    parseInput(raw) {
        try {
            return { ok: true, value: JSON.parse(raw), format: 'json' };
        } catch (e) {
            const lines = this.parseJsonLines(raw);
            if (lines) return lines;
            return {
                ok: false,
                message: this.looksLikePython(raw)
                    ? e.message + ' — this looks like a Python literal; click "From Python" to convert it.'
                    : e.message
            };
        }
    }

    // JSON Lines (one JSON value per line, the way most loggers write) is not
    // valid JSON as a whole; read it as an array of records instead.
    parseJsonLines(raw) {
        if (raw.indexOf('\n') === -1) return null;
        const lines = raw.split('\n');
        const records = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
                records.push(JSON.parse(line));
            } catch (e) {
                if (records.length === 0) return null; // first line isn't JSON, so this isn't JSON Lines
                return { ok: false, message: `JSON Lines, line ${i + 1}: ${e.message}` };
            }
        }
        return records.length > 1 ? { ok: true, value: records, format: 'jsonl' } : null;
    }

    syncGraph() {
        if (!this.graphStale || !this.parsed) return;
        this.graphStale = false;
        this.graphView.render(this.parsed);
        this.graphView.ensureFit();
    }

    showError(msg) {
        this.jsonError.textContent = '⚠ ' + msg;
        this.jsonError.style.display = 'block';
    }

    renderTree(data) {
        this.treeMetas = [];
        this.matchByPath = null;
        this.activeMatchEl = null;
        const root = document.createElement('div');
        root.className = 'json-root';
        const rootNode = this.buildNode(data, null, '');
        root.appendChild(rootNode);
        this.jsonTree.innerHTML = '';
        this.jsonTree.appendChild(root);
        this.rootMeta = rootNode.firstChild._jv || null;
        if (this.rootMeta) this.autoExpand(this.openContainer(this.rootMeta), TREE_AUTO_BUDGET);
        if (this.searchInput.value.trim()) this.performSearch();
    }

    // ─── Node Builder ──────────────────────────────────────────
    // Each non-empty container carries a `_jv` meta record: its value, how many
    // children are built (`shown`), and the built child nodes by index.

    buildNode(value, key, path) {
        const type = this.getType(value);
        const wrapper = document.createElement('div');
        wrapper.className = 'json-node';
        wrapper.appendChild(type === 'object' || type === 'array'
            ? this.buildExpandable(value, key, path, type === 'array')
            : this.buildLeaf(value, key, path, type));
        return wrapper;
    }

    buildExpandable(value, key, path, isArray) {
        const keys = isArray ? null : Object.keys(value);
        const count = isArray ? value.length : keys.length;

        const container = document.createElement('div');
        container.className = 'json-expandable';

        // Row: toggle + key + bracket + count badge
        const row = document.createElement('div');
        row.className = 'json-row json-row-expandable';
        row.dataset.path = path;

        const toggle = document.createElement('span');
        toggle.className = 'json-toggle';
        toggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        row.appendChild(toggle);
        this.appendKey(row, key, path);

        const bracket = document.createElement('span');
        bracket.className = 'json-bracket';
        bracket.textContent = isArray ? '[' : '{';
        row.appendChild(bracket);
        container.appendChild(row);

        if (count === 0) {
            const closingInline = document.createElement('span');
            closingInline.className = 'json-bracket';
            closingInline.textContent = isArray ? ']' : '}';
            row.appendChild(closingInline);
            if (this.matchByPath) this.applyMatchClasses(row);
            return container;
        }

        const badge = document.createElement('span');
        badge.className = 'json-count-badge';
        badge.textContent = this.countLabel(count, isArray);
        row.appendChild(badge);

        const children = document.createElement('div');
        children.className = 'json-children';

        const closingRow = document.createElement('div');
        closingRow.className = 'json-closing';
        closingRow.textContent = isArray ? ']' : '}';

        container.appendChild(children);
        container.appendChild(closingRow);
        container.classList.add('collapsed');
        container._jv = { value, keys, isArray, count, path, container, children, shown: 0, childEls: [], more: null };
        this.treeMetas.push(container._jv);
        if (this.matchByPath) this.applyMatchClasses(row);
        return container;
    }

    buildLeaf(value, key, path, type) {
        const row = document.createElement('div');
        row.className = 'json-row';
        row.dataset.path = path;
        this.appendKey(row, key, path);

        const val = document.createElement('span');
        val.className = 'json-value json-' + type;
        val.textContent = this.leafText(value, type);
        row.appendChild(val);

        if (this.matchByPath) this.applyMatchClasses(row);
        return row;
    }

    appendKey(row, key, path) {
        if (key === null) return;
        const keyEl = document.createElement('span');
        keyEl.className = 'json-key';
        keyEl.textContent = key;
        keyEl.dataset.path = path;
        keyEl.title = 'Copy path: ' + path;
        const colon = document.createElement('span');
        colon.className = 'json-colon';
        colon.textContent = ': ';
        row.appendChild(keyEl);
        row.appendChild(colon);
    }

    // JSON.stringify gives the quoted, escaped form of a string in one native call.
    leafText(value, type) {
        return type === 'string' ? JSON.stringify(value) : String(value);
    }

    countLabel(count, isArray) {
        return count + (isArray ? (count === 1 ? ' item' : ' items') : (count === 1 ? ' key' : ' keys'));
    }

    // ─── Lazy expansion ────────────────────────────────────────

    // Opens a container, building its first chunk of children if needed.
    // Returns the metas of any newly built child containers (all collapsed).
    openContainer(meta) {
        meta.container.classList.remove('collapsed');
        return meta.shown === 0 ? this.showChildren(meta, TREE_CHUNK) : [];
    }

    showChildren(meta, upTo) {
        const end = Math.min(meta.count, upTo);
        const frag = document.createDocumentFragment();
        const childMetas = [];
        for (let i = meta.shown; i < end; i++) {
            const k = meta.isArray ? i : meta.keys[i];
            const childPath = meta.isArray ? meta.path + '[' + i + ']' : (meta.path ? meta.path + '.' + k : k);
            const node = this.buildNode(meta.value[k], k, childPath);
            meta.childEls[i] = node;
            if (node.firstChild._jv) childMetas.push(node.firstChild._jv);
            frag.appendChild(node);
        }
        meta.shown = end;
        meta.children.insertBefore(frag, meta.more);
        this.updateMoreRow(meta);
        return childMetas;
    }

    updateMoreRow(meta) {
        const remaining = meta.count - meta.shown;
        if (remaining <= 0) {
            if (meta.more) { meta.more.remove(); meta.more = null; }
            return;
        }
        if (!meta.more) {
            meta.more = document.createElement('div');
            meta.more.className = 'json-more';
            meta.children.appendChild(meta.more);
        }
        const noun = meta.isArray ? (remaining === 1 ? 'item' : 'items') : (remaining === 1 ? 'key' : 'keys');
        const next = Math.min(TREE_CHUNK, remaining);
        meta.more.innerHTML =
            `<span class="json-more-count">${remaining.toLocaleString()} more ${noun}</span>` +
            `<button type="button" class="json-more-btn" data-more="next">Show ${next}</button>` +
            (remaining > next ? `<button type="button" class="json-more-btn" data-more="all">Show all</button>` : '');
    }

    // Breadth-first: opens containers in the queue (and the ones they reveal)
    // until the row budget runs out. Returns true if it stopped short.
    autoExpand(metas, budget) {
        const queue = metas.slice();
        let used = 0, capped = false;
        for (let i = 0; i < queue.length; i++) {
            const meta = queue[i];
            const cost = meta.shown === 0 ? Math.min(meta.count, TREE_CHUNK) : 0;
            if (used + cost > budget) { capped = true; continue; }
            used += cost;
            const opened = this.openContainer(meta);
            for (let j = 0; j < opened.length; j++) queue.push(opened[j]);
        }
        return capped;
    }

    // One delegated listener for the whole tree: path copy, toggles, "show more".
    onTreeClick(e) {
        const keyEl = e.target.closest('.json-key');
        if (keyEl) {
            this.copyPath(keyEl.dataset.path);
            return;
        }
        const moreBtn = e.target.closest('.json-more-btn');
        if (moreBtn) {
            const meta = moreBtn.closest('.json-expandable')._jv;
            const upTo = moreBtn.dataset.more === 'all' ? meta.count : meta.shown + TREE_CHUNK;
            this.autoExpand(this.showChildren(meta, upTo), TREE_AUTO_BUDGET);
            return;
        }
        const row = e.target.closest('.json-row-expandable');
        const meta = row && row.parentElement._jv;
        if (!meta) return;
        if (meta.container.classList.contains('collapsed')) {
            this.autoExpand(this.openContainer(meta), TREE_TOGGLE_BUDGET);
        } else {
            meta.container.classList.add('collapsed');
        }
    }

    // Builds and opens everything along a path of child indexes; returns the row.
    revealPath(segs) {
        let node = this.jsonTree.querySelector('.json-root > .json-node');
        let meta = this.rootMeta;
        for (const idx of segs) {
            if (!meta || !node) return null;
            meta.container.classList.remove('collapsed');
            if (idx >= meta.shown) this.showChildren(meta, Math.ceil((idx + 1) / TREE_CHUNK) * TREE_CHUNK);
            node = meta.childEls[idx];
            meta = node.firstChild._jv || null;
        }
        if (!node) return null;
        const first = node.firstChild;
        return first.classList.contains('json-expandable') ? first.firstChild : first;
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
        if (view === 'graph') {
            this.syncGraph();
            this.graphView.ensureFit();
        }
        if (this.searchInput.value.trim()) this.performSearch();
    }

    // ─── Search ────────────────────────────────────────────────

    // Runs a search the debounce hasn't fired yet. Returns true if it did.
    flushSearch() {
        if (!this.searchTimer) return false;
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.performSearch();
        return true;
    }

    performSearch() {
        const query = this.searchInput.value.trim();
        this.searchClear.style.display = query ? '' : 'none';

        if (this.currentView === 'graph') {
            this.performGraphSearch(query);
            return;
        }
        this.performTreeSearch(query);
    }

    // Searches the parsed data rather than the DOM, so matches inside nodes that
    // haven't been built yet are found too; they're built when navigated to.
    performTreeSearch(query) {
        this.jsonTree.querySelectorAll('.search-match, .search-match-active').forEach(el => {
            el.classList.remove('search-match', 'search-match-active');
        });
        this.searchMatches = [];
        this.searchIndex = -1;
        this.matchByPath = null;
        this.activeMatchEl = null;

        const q = query.toLowerCase();
        if (!q || !this.parsed) {
            this.searchCount.textContent = '';
            this.searchPrev.disabled = true;
            this.searchNext.disabled = true;
            return;
        }

        this.searchMatches = this.findMatches(this.parsed, q);
        this.matchByPath = new Map(this.searchMatches.map(m => [m.path, m]));
        this.jsonTree.querySelectorAll('.json-row[data-path]').forEach(row => this.applyMatchClasses(row));

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

    // Each match keeps its display path (for highlighting built rows) and the
    // child indexes from the root (for building its way down to it).
    findMatches(data, q) {
        const matches = [];
        const segs = [];
        const walk = (value, key, path) => {
            const type = this.getType(value);
            const onKey = key !== null && String(key).toLowerCase().includes(q);
            if (type === 'array') {
                if (onKey) matches.push({ path, segs: segs.slice(), onKey, onValue: false });
                for (let i = 0; i < value.length; i++) {
                    segs.push(i);
                    walk(value[i], i, path + '[' + i + ']');
                    segs.pop();
                }
            } else if (type === 'object') {
                if (onKey) matches.push({ path, segs: segs.slice(), onKey, onValue: false });
                const keys = Object.keys(value);
                for (let i = 0; i < keys.length; i++) {
                    segs.push(i);
                    walk(value[keys[i]], keys[i], path ? path + '.' + keys[i] : keys[i]);
                    segs.pop();
                }
            } else {
                const onValue = this.leafText(value, type).toLowerCase().includes(q);
                if (onKey || onValue) matches.push({ path, segs: segs.slice(), onKey, onValue });
            }
        };
        walk(data, null, '');
        return matches;
    }

    applyMatchClasses(row) {
        const m = this.matchByPath.get(row.dataset.path);
        if (!m) return;
        const keyEl = m.onKey && row.querySelector(':scope > .json-key');
        const valEl = m.onValue && row.querySelector(':scope > .json-value');
        if (keyEl) keyEl.classList.add('search-match');
        if (valEl) valEl.classList.add('search-match');
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
        if (this.activeMatchEl) this.activeMatchEl.classList.remove('search-match-active');
        this.activeMatchEl = null;
        const m = this.searchMatches[index];
        const row = m && this.revealPath(m.segs);
        if (!row) return;
        const el = row.querySelector(m.onKey ? ':scope > .json-key' : ':scope > .json-value');
        if (!el) return;
        el.classList.add('search-match', 'search-match-active');
        this.activeMatchEl = el;
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
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.searchInput.value = '';
        this.searchClear.style.display = 'none';
        this.performSearch();
    }

    // ─── Actions ───────────────────────────────────────────────

    formatInput() {
        const raw = this.jsonInput.value.trim();
        if (!raw) return;
        const result = this.parseInput(raw);
        if (!result.ok) {
            this.showError(result.message);
            return;
        }
        if (result.format === 'jsonl') {
            // Pretty-printing would merge the records into one document; keep one per line
            this.showCopyNotif('JSON Lines kept one record per line. Copy JSON gives a formatted array.');
            return;
        }
        this.jsonInput.value = JSON.stringify(result.value, null, 2);
        const tab = this.getActiveTab();
        if (tab) tab.input = this.jsonInput.value;
        this.saveTabsToStorage();
        this.render();
    }

    looksLikePython(raw) {
        if (!/^[[{(]/.test(raw)) return false;
        try { pythonToJson(raw); return true; } catch { return false; }
    }

    convertFromPython() {
        const raw = this.jsonInput.value.trim();
        if (!raw) return;
        try {
            this.jsonInput.value = JSON.stringify(pythonToJson(raw), null, 2);
            const tab = this.getActiveTab();
            if (tab) tab.input = this.jsonInput.value;
            this.saveTabsToStorage();
            this.render();
        } catch (e) {
            this.showError('Could not read as Python: ' + e.message);
        }
    }

    // Huge documents are expanded up to a row budget so the page stays responsive;
    // long arrays still open TREE_CHUNK entries at a time.
    expandAll() {
        const treeCapped = this.autoExpand(this.treeMetas, TREE_EXPAND_ALL_BUDGET);
        const graphCapped = this.graphBuilt() ? this.graphView.expandAll() : false;
        if (treeCapped || graphCapped) this.showCopyNotif('Too large to expand everything. Open deeper nodes individually.');
    }

    collapseAll() {
        // Don't collapse the root level
        this.treeMetas.forEach(meta => {
            if (meta !== this.rootMeta) meta.container.classList.add('collapsed');
        });
        if (this.graphBuilt()) this.graphView.collapseAll();
    }

    graphBuilt() {
        return !this.graphStale && !!this.graphView.model;
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
        this.treeMetas = [];
        this.rootMeta = null;
        this.matchByPath = null;
        this.activeMatchEl = null;
        this.graphStale = false;
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
        if (this.parsedFormat === 'jsonl') parts.push('JSON Lines');
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
                    Array.from(childrenEl.children).forEach(childNode => {
                        if (childNode.classList.contains('json-more')) {
                            const count = childNode.querySelector('.json-more-count');
                            addLine(depth + 1, [{ text: '… ' + (count ? count.textContent : 'more'), cls: 'muted' }]);
                        } else {
                            walk(childNode, depth + 1);
                        }
                    });
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
        clearTimeout(this.saveTabsTimer);
        this.saveTabsTimer = null;
        try {
            localStorage.setItem(JSON_VIEWER_TABS_STORAGE_KEY, JSON.stringify({
                tabs: this.tabs,
                activeTabId: this.activeTabId
            }));
            this.warnedQuota = false;
        } catch (e) {
            if (e && e.name === 'QuotaExceededError' && !this.warnedQuota) {
                this.warnedQuota = true;
                this.showCopyNotif("Tabs too large to save in this browser. They won't survive a reload.");
            }
        }
    }

    // Typing in a large document re-serializes every tab, so wait for a pause
    // and an idle moment; pagehide/visibilitychange flush anything pending.
    scheduleSaveTabs() {
        clearTimeout(this.saveTabsTimer);
        this.saveTabsTimer = setTimeout(() => {
            if (window.requestIdleCallback) requestIdleCallback(() => this.flushSaveTabs(), { timeout: 2000 });
            else this.flushSaveTabs();
        }, 1000);
    }

    flushSaveTabs() {
        if (this.saveTabsTimer) this.saveTabsToStorage();
    }
}

document.addEventListener('DOMContentLoaded', () => new JsonViewerApp());
