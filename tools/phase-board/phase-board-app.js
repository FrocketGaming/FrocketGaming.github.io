/**
 * Phase Board
 * Tracks projects through Discovery, Research, Build, Test and Deploy.
 * Data lives in Firestore at users/{userId}/projects/{projectId}. Rendering is done by the pure
 * functions in phase-board-core.js, which the exported snapshot reuses.
 */
class PhaseBoardApp {
    constructor() {
        this.auth = null;
        this.db = null;
        this.user = null;
        this.unsub = null;
        this.projects = {};
        this.view = 'portfolio';
        this.filter = 'all';
        this.showNew = false;
        this.confirmDelete = false;
        this.loaded = false;
        this.note = '';
        this.noteErr = false;
        this.noteTimer = null;
        this.slowTimer = null;
        this.chains = {};
    }

    init() {
        this.bindEvents();
        this.initFirebase();
    }

    // ─── Firebase ─────────────────────────────────────────────

    initFirebase() {
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
            console.warn('Phase Board: Firebase SDK or config not available');
            document.getElementById('pbSignIn').style.display = 'flex';
            return;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        // The compat SDK (10.12.2) has no persistentMultipleTabManager, so use the compat call.
        // It must run before any read or write; a failure (private window, another tab) only
        // means the board works online-only.
        this.db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            console.warn('Phase Board: Offline cache unavailable:', err.code || err);
        });
        this.auth.getRedirectResult().catch(() => {});
        this.auth.onAuthStateChanged(user => this.onAuthChange(user));
    }

    onAuthChange(user) {
        this.user = user;
        if (user) {
            document.getElementById('pbSignIn').style.display = 'none';
            document.getElementById('pbApp').style.display = 'block';
            const avatar = document.getElementById('pbAvatar');
            if (user.photoURL) avatar.src = user.photoURL;
            avatar.hidden = !user.photoURL;
            document.getElementById('pbUserName').textContent = user.displayName || user.email || '';
            this.startSync();
        } else {
            document.getElementById('pbSignIn').style.display = 'flex';
            document.getElementById('pbApp').style.display = 'none';
            this.stopSync();
            this.projects = {};
            this.view = 'portfolio';
            this.loaded = false;
        }
    }

    projectsRef() {
        return this.db.collection('users').doc(this.user.uid).collection('projects');
    }

    startSync() {
        if (!this.db || !this.user) return;
        this.stopSync();
        this.loaded = false;
        this.render();
        // Offline or blocked networks can leave the listener silent, so say so after 10 s.
        this.slowTimer = setTimeout(() => { this.setNote('Still trying to reach your projects. What you see may be out of date.', false, 0); }, 10000);
        this.unsub = this.projectsRef().onSnapshot(snap => {
            const next = {};
            snap.docs.forEach(d => { next[d.id] = d.data(); });
            this.projects = next;
            this.loaded = true;
            if (!snap.metadata.fromCache) {
                clearTimeout(this.slowTimer);
                if (this.note.startsWith('Still trying')) this.note = '';
            }
            this.render();
        }, err => {
            console.error('Phase Board: Sync error:', err);
            clearTimeout(this.slowTimer);
            this.loaded = true;
            this.setNote('Your projects could not be read. Check your connection and sign-in, then reload.', true, 0);
        });
    }

    stopSync() {
        if (this.unsub) { this.unsub(); this.unsub = null; }
        clearTimeout(this.slowTimer);
    }

    // ─── Auth ─────────────────────────────────────────────────

    showSignInError(message) {
        const el = document.getElementById('pbSignInError');
        if (!el) return;
        el.textContent = message;
        el.hidden = !message;
    }

    async signIn() {
        this.showSignInError('');
        if (!this.auth) {
            this.showSignInError('Sign-in is unavailable because Firebase did not load. Check your connection and reload.');
            return;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await this.auth.signInWithPopup(provider);
        } catch (err) {
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
                try {
                    await this.auth.signInWithRedirect(provider);
                } catch (e) {
                    console.error('Phase Board: Sign-in failed:', e);
                    this.showSignInError('Sign-in failed. Allow pop-ups for this site and try again.');
                }
            } else {
                console.error('Phase Board: Sign-in failed:', err);
                this.showSignInError('Sign-in failed. Try again in a moment.');
            }
        }
    }

    async signOut() {
        if (!this.auth) return;
        this.stopSync();
        await this.auth.signOut();
    }

    // ─── Rendering ────────────────────────────────────────────

    setNote(msg, isError, ms) {
        this.note = msg;
        this.noteErr = !!isError;
        clearTimeout(this.noteTimer);
        if (ms !== 0) {
            this.noteTimer = setTimeout(() => { if (this.note === msg) { this.note = ''; this.render(); } }, ms || 4000);
        }
        this.render();
    }

    statusLine() {
        if (!this.note) return '';
        return '<p class="msg' + (this.noteErr ? ' err' : '') + '" role="status">' + esc(this.note) + '</p>';
    }

    sortedProjects() {
        return Object.keys(this.projects)
            .map(id => ({ id: id, p: this.projects[id] }))
            .sort((a, b) => (b.p.updatedAt || 0) - (a.p.updatedAt || 0));
    }

    newFormHTML() {
        return '<form class="newform" id="pbNewForm"><label for="npName">Project name<input class="field" id="npName" autocomplete="off" required></label>' +
            '<label for="npTpl">Flow<select class="field" id="npTpl">' + Object.keys(TEMPLATES).map(k =>
                '<option value="' + k + '">' + esc(TEMPLATES[k].name) + ' (' + TEMPLATES[k].phases.length + ' phases)</option>').join('') + '</select></label>' +
            '<button class="btn primary" type="submit">Create project</button><button class="btn" type="button" id="pbNewCancel">Cancel</button></form>';
    }

    portfolioHTML() {
        const list = this.sortedProjects();
        const nAtt = list.filter(i => summarize(tplOf(i.p), i.p).attention).length;
        const nDone = list.filter(i => !summarize(tplOf(i.p), i.p).current).length;
        const shown = list.filter(i => {
            const s = summarize(tplOf(i.p), i.p);
            return this.filter === 'all' || (this.filter === 'attention' && s.attention) || (this.filter === 'done' && !s.current);
        });
        let body;
        if (!this.loaded) body = '<p class="msg">Loading projects</p>';
        else if (!list.length) body = '<div class="empty"><h2>No projects yet</h2><p>Each project follows a flow template. Create the first one to track its phases, exit criteria and action items.</p><button class="btn primary" type="button" data-act="new">New project</button></div>';
        else if (!shown.length) body = '<div class="empty"><h2>Nothing in this view</h2><p>No projects match this filter.</p></div>';
        else body = '<div class="grid">' + shown.map(i => cardHTML(i.id, i.p, i.p.updatedAt ? ago(i.p.updatedAt) : '')).join('') + '</div>';
        const chips = [['all', 'All', list.length], ['attention', 'Needs attention', nAtt], ['done', 'Complete', nDone]].map(c =>
            '<button class="chip" type="button" data-filter="' + c[0] + '" aria-pressed="' + (this.filter === c[0]) + '">' + c[1] + ' ' + c[2] + '</button>').join('');
        return '<div class="ph-row"><div><p class="eyebrow">Portfolio</p><h1>Projects</h1></div><div class="filters">' + chips + '</div></div>' +
            this.statusLine() + (this.showNew ? this.newFormHTML() : '') + body;
    }

    openActionsHTML(p) {
        const groups = tplOf(p).phases.map(d => {
            const items = (phaseState(p, d).actions || []).filter(a => !a.done);
            return items.length
                ? '<div><a class="pj" href="#ph-' + d.id + '">' + esc(d.short) + '</a><ul>' + items.map(a =>
                    '<li>' + esc(a.text) + '<small>' + (a.assignee ? esc(a.assignee) : 'Unassigned') +
                    (a.due ? ' / due <span class="mono' + (a.due < today() ? ' late' : '') + '">' + esc(a.due) + '</span>' : '') + '</small></li>').join('') + '</ul></div>'
                : '';
        }).join('');
        return groups || '<p class="msg">No open action items.</p>';
    }

    detailHTML() {
        const p = this.projects[this.view];
        if (!p) return '<button class="back" type="button" data-act="back">Back to projects</button><div class="empty"><h2>Project not found</h2><p>It may have been removed.</p></div>';
        const tpl = tplOf(p), s = summarize(tpl, p), people = peopleOf(p);
        const cards = tpl.phases.map((d, i) => {
            const extra = '<form class="dec-add" data-dec="' + d.id + '"><label class="sub" for="dec-' + d.id + '" style="width:100%;margin:0">Record a decision</label>' +
                '<input class="field" id="dec-' + d.id + '" autocomplete="off" placeholder="What was decided, and why?"><button class="btn" type="submit">Add</button></form>';
            return phaseHTML(d, phaseState(p, d), i, { mode: 'edit', extra: extra, people: people });
        }).join('');
        const del = this.confirmDelete
            ? '<span class="msg">Delete "' + esc(p.name) + '" and all its data?</span><button class="btn danger" type="button" data-act="del-confirm">Delete project</button><button class="btn" type="button" data-act="del-cancel">Keep it</button>'
            : '<button class="btn" type="button" data-act="del">Delete project</button>';
        return '<button class="back" type="button" data-act="back">Back to projects</button>' +
            '<div><p class="eyebrow">' + esc(tpl.name) + (p.owner ? ' / ' + esc(p.owner) : '') + (p.started ? ' / started ' + esc(p.started) : '') + '</p><h1>' + esc(p.name) + '</h1></div>' +
            this.statusLine() + overviewHTML(p, true) + risksHTML(p, true) +
            '<div class="railbox">' + railHTML(tpl, p, { link: true }) + barHTML(tpl, p) + '<p class="msg">' + s.doneP + ' of ' + s.total + ' phases done / ' + s.g + ' of ' + s.gt + ' criteria met</p></div>' +
            '<div class="detail"><div class="phases">' + cards + '</div><aside class="feed sticky"><p class="eyebrow">Open action items</p>' + this.openActionsHTML(p) + '</aside></div>' +
            outcomesHTML(p, true) + '<div class="danger-zone">' + del + '</div>';
    }

    // Re-rendering replaces the DOM, so put focus (and the caret) back where the user was typing.
    keepFocus(fn) {
        const a = document.activeElement;
        const id = a && a.id, val = a && a.value, ss = a && a.selectionStart;
        fn();
        if (!id) return;
        const el = document.getElementById(id);
        if (!el) return;
        const text = /^(INPUT|TEXTAREA)$/.test(el.tagName) && el.type !== 'checkbox' && el.type !== 'date';
        if (text && val != null && el.value !== val) el.value = val;
        el.focus();
        if (text && ss != null) { try { el.setSelectionRange(ss, ss); } catch (e) { /* input type has no selection */ } }
    }

    render() {
        if (!this.user) return;
        this.keepFocus(() => {
            const page = document.getElementById('pbPage');
            page.innerHTML = this.view === 'portfolio' ? this.portfolioHTML() : this.detailHTML();
            document.getElementById('pbExportBtn').hidden = !this.loaded || !Object.keys(this.projects).length;
        });
    }

    // ─── Writes ───────────────────────────────────────────────

    // Writes for one project run one at a time so a quick second edit cannot overwrite the first.
    queue(id, fn) {
        const next = (this.chains[id] || Promise.resolve()).catch(() => {}).then(fn);
        this.chains[id] = next;
        return next;
    }

    saveFailed(what) {
        this.setNote('The ' + what + ' was not saved. Check your connection and try again.', true);
    }

    mutatePhase(pid, fn, what) {
        const id = this.view;
        this.queue(id, async () => {
            const p = this.projects[id];
            if (!p) return;
            const def = tplOf(p).phases.find(d => d.id === pid);
            const st = clone(phaseState(p, def));
            fn(st, def);
            await this.projectsRef().doc(id).update({ ['phases.' + pid]: st, updatedAt: Date.now() });
        }).catch(err => { console.error('Phase Board:', err); this.saveFailed(what || 'change'); });
    }

    patchProject(fn, what) {
        const id = this.view;
        this.queue(id, async () => {
            const p = this.projects[id];
            if (!p) return;
            await this.projectsRef().doc(id).update(Object.assign(fn(clone(p)), { updatedAt: Date.now() }));
        }).catch(err => { console.error('Phase Board:', err); this.saveFailed(what || 'change'); });
    }

    newId() { return Math.random().toString(36).slice(2, 8); }

    toggleGate(pid, i, checked) {
        this.mutatePhase(pid, (st, def) => {
            const msg = applyGate(def, st, i, checked);
            if (msg) st.log = (st.log || []).concat([{ at: today(), text: msg }]).slice(-12);
        });
    }

    addDecision(pid, text) {
        this.mutatePhase(pid, st => { st.decisions = (st.decisions || []).concat([{ at: today(), text: text }]); }, 'decision');
    }

    addAction(pid, text, assignee, due) {
        this.mutatePhase(pid, st => {
            st.actions = (st.actions || []).concat([{ id: this.newId(), text: text, done: false, assignee: assignee || '', due: due || '' }]);
        }, 'action item');
    }

    editAction(pid, aid, patch) {
        this.mutatePhase(pid, st => {
            st.actions = (st.actions || []).map(a => a.id === aid ? Object.assign({}, a, patch) : a);
        }, 'action item');
    }

    removeAction(pid, aid) {
        this.mutatePhase(pid, st => { st.actions = (st.actions || []).filter(a => a.id !== aid); }, 'removal');
    }

    saveOverview(field, raw) {
        const value = (field === 'target' || field === 'summary') ? raw.trim() : parseList(raw);
        this.patchProject(() => ({ [field]: value }), 'project detail');
    }

    async createProject(name, tplKey) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
        const id = slug + '-' + this.newId();
        try {
            await this.projectsRef().doc(id).set(blankProject(name, tplKey, this.user.displayName || ''));
            this.showNew = false;
            this.openProject(id);
        } catch (err) {
            console.error('Phase Board:', err);
            this.setNote('The project was not created. Check your connection and try again.', true);
        }
    }

    async deleteProject() {
        const id = this.view;
        try {
            await this.projectsRef().doc(id).delete();
            this.confirmDelete = false;
            this.view = 'portfolio';
            this.render();
        } catch (err) {
            console.error('Phase Board:', err);
            this.setNote('The project was not deleted. Check your connection and try again.', true);
        }
    }

    openProject(id) {
        this.view = id;
        this.showNew = false;
        this.confirmDelete = false;
        this.render();
        window.scrollTo(0, 0);
    }

    // ─── Export ───────────────────────────────────────────────

    // Builds one self-contained, read-only HTML file: the data, the theme's current colors, and
    // the same renderers the live board uses.
    async exportSnapshot() {
        const tokens = ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-hover', '--accent-primary', '--accent-secondary',
            '--text-primary', '--text-secondary', '--border-color', '--shadow-color', '--error-color', '--warning-color', '--info-color'];
        const cs = getComputedStyle(document.documentElement);
        const vars = tokens.map(t => t + ':' + cs.getPropertyValue(t).trim()).join(';');
        try {
            const [css, core, viewer] = await Promise.all(['phase-board-styles.css', 'phase-board-core.js', 'phase-board-export.js'].map(f =>
                fetch(f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.text(); })));
            const data = JSON.stringify({ projects: this.projects, takenAt: today() }).replace(/</g, '\\u003c');
            const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
                '<title>Phase Board snapshot ' + today() + '</title>' +
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..800&family=Raleway:wght@100..900&display=swap">' +
                '<style>:root{color-scheme:dark;' + vars + '}' +
                'body{margin:0;background:var(--bg-primary);color:var(--text-primary);font-family:"Raleway",sans-serif;display:flex;justify-content:center}' +
                'h1,h2,h3{font-family:"JetBrains Mono",monospace}input[type=checkbox]{accent-color:var(--accent-primary)}\n' + css + '</style></head>' +
                '<body><div class="pb" id="root"></div><script type="application/json" id="board-data">' + data + '<\/script>' +
                '<script>' + core.replace(/<\/script/gi, '<\\/script') + '<\/script><script>' + viewer.replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>';
            const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'phase-board-' + today() + '.html';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            this.setNote('Snapshot saved. Open the file in any browser.', false);
        } catch (err) {
            console.error('Phase Board: Export failed:', err);
            this.setNote('The export could not be built. Reload the page and try again.', true);
        }
    }

    // ─── Events ───────────────────────────────────────────────

    bindEvents() {
        document.getElementById('pbSignInBtn')?.addEventListener('click', () => this.signIn());
        document.getElementById('pbSignOutBtn')?.addEventListener('click', () => this.signOut());
        document.getElementById('pbExportBtn')?.addEventListener('click', () => this.exportSnapshot());
        document.getElementById('pbNewBtn')?.addEventListener('click', () => {
            this.view = 'portfolio';
            this.showNew = true;
            this.render();
            document.getElementById('npName')?.focus();
        });

        const page = document.getElementById('pbPage');
        page.addEventListener('click', e => {
            const open = e.target.closest('[data-open]');
            if (open) return this.openProject(open.getAttribute('data-open'));
            const filter = e.target.closest('[data-filter]');
            if (filter) { this.filter = filter.getAttribute('data-filter'); return this.render(); }
            const delAct = e.target.closest('[data-del-action]');
            if (delAct) return this.removeAction(delAct.getAttribute('data-phase'), delAct.getAttribute('data-del-action'));
            const delRisk = e.target.closest('[data-del-risk]');
            if (delRisk) {
                const k = delRisk.getAttribute('data-del-risk');
                return this.patchProject(p => ({ risks: (p.risks || []).filter(r => r.id !== k) }), 'removal');
            }
            const delMetric = e.target.closest('[data-del-metric]');
            if (delMetric) {
                const k = delMetric.getAttribute('data-del-metric');
                return this.patchProject(p => ({ outcomes: Object.assign({}, p.outcomes, { metrics: ((p.outcomes || {}).metrics || []).filter(m => m.id !== k) }) }), 'removal');
            }
            const act = e.target.closest('[data-act]');
            if (act) {
                const k = act.getAttribute('data-act');
                if (k === 'back') { this.view = 'portfolio'; this.confirmDelete = false; this.render(); window.scrollTo(0, 0); }
                else if (k === 'new') { this.showNew = true; this.render(); document.getElementById('npName')?.focus(); }
                else if (k === 'del') { this.confirmDelete = true; this.render(); }
                else if (k === 'del-cancel') { this.confirmDelete = false; this.render(); }
                else if (k === 'del-confirm') { this.deleteProject(); }
                return;
            }
            if (e.target.id === 'pbNewCancel') { this.showNew = false; this.render(); }
        });

        page.addEventListener('change', e => {
            const t = e.target;
            if (!t.matches) return;
            if (t.matches('input[data-gate]')) this.toggleGate(t.getAttribute('data-phase'), +t.getAttribute('data-gate'), t.checked);
            else if (t.matches('[data-ov]')) this.saveOverview(t.getAttribute('data-ov'), t.value);
            else if (t.matches('input[data-risk]')) {
                const k = t.getAttribute('data-risk'), v = t.checked;
                this.patchProject(p => ({ risks: (p.risks || []).map(r => r.id === k ? Object.assign({}, r, { resolved: v }) : r) }), 'risk');
            } else if (t.matches('[data-outvalue]')) {
                const v = t.value.trim();
                this.patchProject(p => ({ outcomes: Object.assign({}, p.outcomes, { value: v }) }), 'value added text');
            } else if (t.matches('[data-act-assignee]')) this.editAction(t.getAttribute('data-phase'), t.getAttribute('data-act-assignee'), { assignee: t.value });
            else if (t.matches('[data-act-due]')) this.editAction(t.getAttribute('data-phase'), t.getAttribute('data-act-due'), { due: t.value });
            else if (t.matches('input[data-action]')) {
                const aid = t.getAttribute('data-action'), done = t.checked;
                this.editAction(t.getAttribute('data-phase'), aid, { done: done });
            }
        });

        page.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target;
            if (f.id === 'pbNewForm') {
                const name = document.getElementById('npName').value.trim();
                if (name) this.createProject(name, document.getElementById('npTpl').value);
            } else if (f.hasAttribute('data-addrisk')) {
                const text = document.getElementById('risk-text').value.trim(), kind = document.getElementById('risk-kind').value;
                if (text) this.patchProject(p => ({ risks: (p.risks || []).concat([{ id: this.newId(), kind: kind, text: text, resolved: false }]) }), 'risk');
            } else if (f.hasAttribute('data-addmetric')) {
                const name = document.getElementById('m-name').value.trim();
                const before = document.getElementById('m-before').value.trim(), after = document.getElementById('m-after').value.trim();
                if (name) {
                    this.patchProject(p => ({ outcomes: Object.assign({}, p.outcomes, { metrics: ((p.outcomes || {}).metrics || []).concat([{ id: this.newId(), name: name, before: before, after: after }]) }) }), 'metric');
                }
            } else if (f.hasAttribute('data-dec') || f.hasAttribute('data-addaction')) {
                const input = f.querySelector('input');
                const text = input.value.trim();
                if (!text) return;
                if (f.hasAttribute('data-dec')) {
                    this.addDecision(f.getAttribute('data-dec'), text);
                } else {
                    const sel = f.querySelector('select'), date = f.querySelector('input[type=date]');
                    this.addAction(f.getAttribute('data-addaction'), text, sel ? sel.value : '', date ? date.value : '');
                    if (sel) sel.value = '';
                    if (date) date.value = '';
                }
                input.value = '';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => new PhaseBoardApp().init());
