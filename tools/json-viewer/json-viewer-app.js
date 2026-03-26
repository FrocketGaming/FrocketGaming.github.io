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
        this.clearBtn      = document.getElementById('clearBtn');
        this.copyNotif     = document.getElementById('copyNotification');
        this.parsed        = null;
        this.debounceTimer = null;
        this.init();
    }

    init() {
        this.jsonInput.addEventListener('input', () => this.scheduleRender());
        this.formatBtn.addEventListener('click', () => this.formatInput());
        this.expandAllBtn.addEventListener('click', () => this.expandAll());
        this.collapseAllBtn.addEventListener('click', () => this.collapseAll());
        this.copyFormattedBtn.addEventListener('click', () => this.copyFormatted());
        this.clearBtn.addEventListener('click', () => this.clear());
        this.jsonInput.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.formatInput();
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
            this.renderStats(this.parsed);
        } catch (e) {
            this.parsed = null;
            this.jsonTree.innerHTML = '';
            this.showError(e.message);
            this.jsonStats.textContent = '';
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

    // ─── Actions ───────────────────────────────────────────────

    formatInput() {
        const raw = this.jsonInput.value.trim();
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            this.jsonInput.value = JSON.stringify(parsed, null, 2);
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
    }

    collapseAll() {
        this.jsonTree.querySelectorAll('.json-expandable:not(.collapsed)').forEach(el => {
            // Don't collapse the root level
            if (el.closest('.json-root') === el.parentElement) return;
            el.classList.add('collapsed');
            const toggle = el.querySelector('.json-toggle');
            if (toggle) toggle.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        });
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
        if (resetInput) this.jsonInput.value = '';
        this.parsed = null;
        this.jsonTree.innerHTML = '<div class="json-empty-state"><i class="fa-solid fa-code"></i><p>Paste JSON on the left to explore it here</p></div>';
        this.jsonError.textContent = '';
        this.jsonError.style.display = 'none';
        this.jsonStats.textContent = '';
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
}

document.addEventListener('DOMContentLoaded', () => new JsonViewerApp());
