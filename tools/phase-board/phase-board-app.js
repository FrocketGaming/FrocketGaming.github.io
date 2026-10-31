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
        this.flows = {};
        this.editor = null;
        this.confirmFlowDelete = null;
        this.unsubFlows = null;
        this.editingGate = null;
        this.confirmCrit = null;
        this.editingNote = null;
        this.reviewYear = null;
        this.picker = null;
        this.svgs = {};
        this.openDiagrams = [];
        this.confirmDiagram = null;
        this.flowStaticPromise = null;
        this.diagramBusy = false;
    }

    init() {
        attachBackToTop(document, window);
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
            this.flows = {};
            this.editor = null;
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
        this.unsubFlows = this.flowsRef().onSnapshot(snap => {
            const next = {};
            snap.docs.forEach(d => { next[d.id] = d.data(); });
            this.flows = next;
            this.render();
        }, err => console.error('Phase Board: Flow sync error:', err));
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
        if (this.unsubFlows) { this.unsubFlows(); this.unsubFlows = null; }
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
            '<label for="npOwner">Owner (optional)<input class="field" id="npOwner" autocomplete="off"></label>' +
            '<label for="npLead">Lead (optional)<input class="field" id="npLead" autocomplete="off"></label>' +
            '<label for="npTpl">Flow<select class="field" id="npTpl">' + this.allFlows().map(f =>
                '<option value="' + esc(f.key) + '">' + esc(f.name) + ' (' + f.phases.length + ' phases)</option>').join('') + '</select></label>' +
            '<button class="btn primary" type="submit">Create project</button><button class="btn" type="button" id="pbNewCancel">Cancel</button></form>';
    }

    portfolioHTML() {
        const list = this.sortedProjects();
        const shown = filterProjects(list, this.filter);
        let body;
        if (!this.loaded) body = '<p class="msg">Loading projects</p>';
        else if (!list.length) body = '<div class="empty"><h2>No projects yet</h2><p>Each project follows a flow template. Create the first one to track its phases, exit criteria and action items.</p><button class="btn primary" type="button" data-act="new">New project</button></div>';
        else if (!shown.length) body = '<div class="empty"><h2>Nothing in this view</h2><p>No projects match this filter.</p></div>';
        else body = '<div class="grid">' + shown.map(i => cardHTML(i.id, i.p, i.p.updatedAt ? ago(i.p.updatedAt) : '')).join('') + '</div>';
        return '<div class="ph-row"><div><p class="eyebrow">Portfolio</p><h1>Projects</h1></div><div class="filters">' + filterChipsHTML(list, this.filter) + '</div></div>' +
            this.statusLine() + (this.showNew ? this.newFormHTML() : '') + body;
    }

    reviewPageHTML() {
        const years = reviewYears(this.projects), now = String(new Date().getFullYear());
        if (!this.reviewYear || years.indexOf(this.reviewYear) < 0) this.reviewYear = years.indexOf(now) >= 0 ? now : years[0];
        return '<button class="back" type="button" data-act="back">Back to projects</button>' +
            '<div class="ph-row"><label for="pbYear" class="sub" style="margin:0">Year<select class="field" id="pbYear" data-review-year="1" style="margin-left:8px">' + years.map(y => '<option' + (y === this.reviewYear ? ' selected' : '') + '>' + esc(y) + '</option>').join('') + '</select></label>' +
            '<button class="btn" type="button" data-act="export-review" style="margin-left:auto">Export this review</button></div>' +
            this.statusLine() + reviewHTML(reviewData(this.projects, this.reviewYear));
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
            return phaseHTML(d, phaseState(p, d), i, { mode: 'edit', extra: extra, people: people, editingGate: this.editingGate, confirmCrit: this.confirmCrit, editingNote: this.editingNote, svgs: this.svgs, openDiagrams: this.openDiagrams, picker: this.picker, confirmDiagram: this.confirmDiagram });
        }).join('');
        const del = this.confirmDelete
            ? '<span class="msg">Delete "' + esc(p.name) + '" and all its data?</span><button class="btn danger" type="button" data-act="del-confirm">Delete project</button><button class="btn" type="button" data-act="del-cancel">Keep it</button>'
            : '<button class="btn" type="button" data-act="del">Delete project</button>';
        const archiveBtn = isArchived(p)
            ? '<button class="btn" type="button" data-act="unarchive">Restore from archive</button>'
            : '<button class="btn" type="button" data-act="archive">Archive project</button>';
        return '<button class="back" type="button" data-act="back">Back to projects</button>' +
            '<div><p class="eyebrow">' + projectMeta(p) + '</p><h1>' + esc(p.name) + '</h1></div>' +
            this.statusLine() + overviewHTML(p, true) + risksHTML(p, true) +
            '<div class="railbox">' + railHTML(tpl, p, { link: true }) + barHTML(tpl, p) + '<div class="ph-row"><p class="msg">' + s.doneP + ' of ' + s.total + ' phases done / ' + s.g + ' of ' + s.gt + ' criteria met</p><button class="btn" type="button" data-act="edit-flow" style="margin-left:auto">Edit phases</button></div></div>' +
            '<div class="detail"><div class="phases">' + cards + '</div><aside class="feed sticky"><p class="eyebrow">Open action items</p>' + this.openActionsHTML(p) + '</aside></div>' +
            outcomesHTML(p, true) + '<div class="danger-zone">' + archiveBtn + del + '</div>';
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
            page.innerHTML = this.view === 'portfolio' ? this.portfolioHTML()
                : this.view === '__flows' ? this.flowsHTML()
                : this.view === '__editor' ? this.editorHTML()
                : this.view === '__review' ? this.reviewPageHTML()
                : this.detailHTML();
            if (this.view !== 'portfolio' && this.view.indexOf('__') !== 0) this.prepareDiagrams();
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

    // ─── Inline exit-criteria editing ─────────────────────────

    // Applies a change to this project's own copy of its flow, then rebuilds the phase state to match.
    // Returns true when the write went through.
    patchFlow(fn) {
        const id = this.view;
        return this.queue(id, async () => {
            const p = this.projects[id];
            if (!p) return false;
            const tpl = tplOf(p), flow = clone({ name: tpl.name, phases: tpl.phases });
            fn(flow);
            const phases = clone(reconcileProject(p, flow));
            await this.projectsRef().doc(id).update({ flow: flow, phases: phases, updatedAt: Date.now() });
            return true;
        }).catch(err => {
            console.error('Phase Board:', err);
            this.saveFailed('exit criteria change');
            return false;
        });
    }

    // ─── Diagrams from the Flow tool ──────────────────────────

    // flow-static.js (the Flow tool's renderer) is large, so load it only when a diagram needs drawing.
    ensureFlowStatic() {
        if (window.FlowStatic) return Promise.resolve(true);
        if (!this.flowStaticPromise) {
            this.flowStaticPromise = new Promise(resolve => {
                const s = document.createElement('script');
                s.src = '../flow/flow-static.js';
                s.onload = () => resolve(!!window.FlowStatic);
                s.onerror = () => resolve(false);
                document.head.appendChild(s);
            });
        }
        return this.flowStaticPromise;
    }

    // Draw any attached diagrams that have no picture yet, then redraw once.
    prepareDiagrams() {
        const p = this.projects[this.view];
        if (!p || this.diagramBusy) return;
        const need = [];
        tplOf(p).phases.forEach(d => (phaseState(p, d).diagrams || []).forEach(g => { if (this.svgs[g.id] === undefined) need.push(g); }));
        if (!need.length) return;
        this.diagramBusy = true;
        this.ensureFlowStatic().then(ready => {
            need.forEach(g => {
                let svg = '';
                if (ready) { try { svg = safeSvg(window.FlowStatic.toSVG(JSON.parse(g.canvas), { padding: 16, background: false }).svg); } catch (e) { svg = ''; } }
                this.svgs[g.id] = svg;
            });
        }).finally(() => { this.diagramBusy = false; this.render(); });
    }

    // Saved charts from the cloud (when signed in) and from this browser, merged.
    async loadCharts() {
        const remote = this.db
            ? this.projectsRef().firestore.collection('users').doc(this.user.uid).collection('snippets').where('extension', '==', 'canvas').get()
                .then(snap => snap.docs.map(d => d.data())).catch(() => [])
            : Promise.resolve([]);
        const local = (typeof StorageManager !== 'undefined')
            ? StorageManager.getAll('snippets').then(all => all.filter(s => s && s.extension === 'canvas')).catch(() => [])
            : Promise.resolve([]);
        return mergeCharts(await Promise.all([remote, local]));
    }

    async openPicker(pid) {
        this.picker = { pid: pid, loading: true, items: [], error: '' };
        this.render();
        try {
            this.picker.items = await this.loadCharts();
        } catch (err) {
            this.picker.error = 'Your charts could not be read. Check your connection and try again.';
        }
        this.picker.loading = false;
        this.render();
    }

    closePicker() {
        this.picker = null;
        this.render();
    }

    attachDiagram(pid, snippetId) {
        const item = this.picker && this.picker.items.find(i => i.snippetId === snippetId);
        const p = this.projects[this.view];
        if (!item || !p) return;
        const def = tplOf(p).phases.find(d => d.id === pid);
        const made = makeDiagram(item, this.newId(), p, phaseState(p, def));
        if (made.error) { this.setNote(made.error, true); return; }
        this.picker = null;
        this.mutatePhase(pid, st => { st.diagrams = (st.diagrams || []).concat([made.diagram]); }, 'diagram');
        this.openDiagrams = this.openDiagrams.concat([made.diagram.id]);
        this.render();
    }

    async refreshDiagram(pid, did) {
        const p = this.projects[this.view];
        const cur = p && (phaseState(p, tplOf(p).phases.find(d => d.id === pid)).diagrams || []).find(x => x.id === did);
        if (!cur) return;
        let items;
        try { items = await this.loadCharts(); } catch (err) { this.setNote('Your charts could not be read. Try again.', true); return; }
        const item = items.find(i => i.snippetId === cur.snippetId);
        if (!item) { this.setNote('That chart was not found in your saved Flow charts. It may have been deleted or renamed in Snippets.', true); return; }
        if (item.content.length > DIAGRAM_MAX_CHARS) { this.setNote('The chart is now too large to attach.', true); return; }
        delete this.svgs[did];
        this.mutatePhase(pid, st => {
            st.diagrams = (st.diagrams || []).map(x => x.id === did ? Object.assign({}, x, { title: item.title, canvas: item.content, cards: item.cards, links: item.links, savedAt: today() }) : x);
        }, 'diagram');
        this.setNote('Diagram updated from Snippets.', false);
    }

    removeDiagram(pid, did) {
        this.confirmDiagram = null;
        delete this.svgs[did];
        this.mutatePhase(pid, st => { st.diagrams = (st.diagrams || []).filter(x => x.id !== did); }, 'diagram');
        this.render();
    }

    startNoteEdit(pid, gid) {
        this.editingNote = pid + ':' + gid;
        this.editingGate = null;
        this.render();
        document.getElementById('note-' + pid + '-' + gid)?.focus();
    }

    cancelNoteEdit() {
        this.editingNote = null;
        this.render();
    }

    // A note records what a criterion produced (the agreed statement, the metrics, a link). Empty clears it.
    saveNote(pid, gid, text) {
        const value = String(text || '').trim().slice(0, 1000);
        this.editingNote = null;
        this.render();
        this.mutatePhase(pid, st => {
            const next = Object.assign({}, st.evidence || {});
            if (value) next[gid] = value; else delete next[gid];
            st.evidence = next;
        }, 'note');
    }

    startCritEdit(pid, gid) {
        this.editingGate = pid + ':' + gid;
        this.confirmCrit = null;
        this.render();
        document.getElementById('crit-' + pid + '-' + gid)?.focus();
    }

    cancelCritEdit() {
        this.editingGate = null;
        this.confirmCrit = null;
        this.render();
    }

    async saveCriterion(pid, gid, text) {
        const next = String(text || '').trim();
        this.editingGate = null;
        this.render();
        if (!next) return;
        await this.patchFlow(flow => {
            const g = flow.phases.find(p => p.id === pid)?.gates.find(x => x.id === gid);
            if (g) g.text = next;
        });
    }

    async addCriterion(pid, text) {
        const p = this.projects[this.view];
        const def = p && tplOf(p).phases.find(d => d.id === pid);
        const wasDone = !!def && phaseState(p, def).status === 'done';
        const ok = await this.patchFlow(flow => {
            flow.phases.find(x => x.id === pid)?.gates.push({ id: 'g' + this.newId(), text: text });
        });
        if (ok && wasDone) this.setNote(def.name + ' was reopened because it gained an exit criterion.', false);
    }

    // The last criterion of a phase cannot be removed; the UI hides the button, and this guards it too.
    async removeCriterion(pid, gid) {
        this.confirmCrit = null;
        this.render();
        await this.patchFlow(flow => {
            const phase = flow.phases.find(x => x.id === pid);
            if (phase && phase.gates.length > 1) phase.gates = phase.gates.filter(g => g.id !== gid);
        });
    }

    removeAction(pid, aid) {
        this.mutatePhase(pid, st => { st.actions = (st.actions || []).filter(a => a.id !== aid); }, 'removal');
    }

    saveOverview(field, raw) {
        const value = (field === 'target' || field === 'summary' || field === 'owner' || field === 'lead' || field === 'completedOn') ? raw.trim() : parseList(raw);
        this.patchProject(() => ({ [field]: value }), 'project detail');
    }

    async createProject(name, flowKey, owner, lead) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
        const id = slug + '-' + this.newId();
        try {
            await this.projectsRef().doc(id).set(blankProject(name, this.findFlow(flowKey) || { key: 'standard', name: TEMPLATES.standard.name, phases: TEMPLATES.standard.phases }, owner || '', lead || ''));
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

    // ─── Flows ────────────────────────────────────────────────

    flowsRef() {
        return this.db.collection('users').doc(this.user.uid).collection('flows');
    }

    // Built-in flows first, then the user's own, alphabetically.
    allFlows() {
        const builtIn = Object.keys(TEMPLATES).map(k => ({ key: k, name: TEMPLATES[k].name, phases: TEMPLATES[k].phases, builtIn: true }));
        const mine = Object.keys(this.flows)
            .map(k => ({ key: k, name: this.flows[k].name || 'Untitled flow', phases: this.flows[k].phases || [], builtIn: false }))
            .sort((a, b) => a.name.localeCompare(b.name));
        return builtIn.concat(mine);
    }

    findFlow(key) {
        return this.allFlows().find(f => f.key === key) || null;
    }

    flowsHTML() {
        const rows = this.allFlows().map(f => {
            const crit = f.phases.reduce((n, p) => n + p.gates.length, 0);
            const k = esc(f.key);
            let btns;
            if (f.builtIn) {
                btns = '<button class="btn" type="button" data-act="flow-dup" data-key="' + k + '">Duplicate to edit</button>';
            } else if (this.confirmFlowDelete === f.key) {
                btns = '<button class="btn danger" type="button" data-act="flow-del-confirm" data-key="' + k + '">Delete flow</button><button class="btn" type="button" data-act="flow-del-cancel">Keep it</button>';
            } else {
                btns = '<button class="btn" type="button" data-act="flow-edit" data-key="' + k + '">Edit</button>' +
                    '<button class="btn" type="button" data-act="flow-dup" data-key="' + k + '">Duplicate</button>' +
                    '<button class="btn" type="button" data-act="flow-del" data-key="' + k + '">Delete</button>';
            }
            return '<li class="flow-row"><div class="flow-main"><p class="flow-name">' + esc(f.name) + (f.builtIn ? ' <span class="cnt">Built in</span>' : '') + '</p>' +
                '<p class="msg">' + f.phases.map(p => esc(p.short || p.name)).join(' / ') + ' &middot; ' + f.phases.length + ' phases, ' + crit + ' exit criteria</p></div><div class="flow-btns">' + btns + '</div></li>';
        }).join('');
        return '<button class="back" type="button" data-act="back">Back to projects</button>' +
            '<div class="ph-row"><div><p class="eyebrow">Library</p><h1>Flows</h1></div><button class="btn primary" type="button" data-act="flow-new" style="margin-left:auto">New flow</button></div>' +
            this.statusLine() +
            '<p class="msg">A flow is the list of phases and exit criteria a project follows. Each project keeps its own copy, so editing a flow here only affects projects you create afterwards. To change a running project, open it and choose Edit phases.</p>' +
            '<ul class="flows">' + rows + '</ul>';
    }

    editorHTML() {
        if (!this.editor) return this.portfolioHTML();
        return '<button class="back" type="button" data-fe-act="cancel">Cancel and go back</button>' + this.statusLine() + flowEditorHTML(this.editor);
    }

    startEditor(opts) {
        this.editor = Object.assign({ errors: [], confirmDel: null }, opts);
        this.view = '__editor';
        this.render();
        window.scrollTo(0, 0);
    }

    editFlow(key) {
        const f = this.flows[key];
        if (!f) return;
        this.startEditor({ mode: 'flow', projectMode: false, flowId: key, returnTo: '__flows', title: 'Edit flow',
            intro: 'Changes apply to projects you create afterwards. Existing projects keep their own copy.',
            draft: clone({ name: f.name, phases: f.phases }) });
    }

    newFlow() {
        this.startEditor({ mode: 'flow', projectMode: false, flowId: null, returnTo: '__flows', title: 'New flow',
            intro: 'Add the phases a project moves through. Exit criteria are optional here; a project cannot finish a phase until it has some.',
            draft: { name: '', phases: [blankDraftPhase(() => this.newId())] } });
    }

    duplicateFlow(key) {
        const f = this.findFlow(key);
        if (!f) return;
        this.startEditor({ mode: 'flow', projectMode: false, flowId: null, returnTo: '__flows', title: 'New flow from ' + f.name,
            intro: 'This is a copy. Save it to add it to your library.',
            draft: clone({ name: f.name + ' (copy)', phases: f.phases }) });
    }

    editProjectFlow() {
        const id = this.view, p = this.projects[id];
        if (!p) return;
        const tpl = tplOf(p);
        this.startEditor({ mode: 'project', projectMode: true, projectId: id, returnTo: id, title: 'Edit phases: ' + p.name,
            intro: 'Changes apply to this project only. A finished phase that gains a criterion is reopened, and removing a phase deletes its progress.',
            draft: clone({ name: tpl.name, phases: tpl.phases }) });
    }

    async deleteFlow(key) {
        try {
            await this.flowsRef().doc(key).delete();
            this.confirmFlowDelete = null;
            this.render();
        } catch (err) {
            console.error('Phase Board:', err);
            this.setNote('The flow was not deleted. Check your connection and try again.', true);
        }
    }

    // Draft edits are kept in memory and only written when the user saves.
    editorInput(t) {
        const d = this.editor.draft, kind = t.getAttribute('data-fe');
        const p = d.phases[+t.getAttribute('data-p')], i = +t.getAttribute('data-i');
        if (kind === 'name') d.name = t.value;
        else if (kind === 'pname') p.name = t.value;
        else if (kind === 'pshort') p.short = t.value;
        else if (kind === 'pgoal') p.goal = t.value;
        else if (kind === 'gate') p.gates[i].text = t.value;
    }

    editorAction(k, pi, i) {
        const ed = this.editor, d = ed.draft, p = d.phases[pi];
        const swap = (arr, a, b) => { if (b < 0 || b >= arr.length) return; const t = arr[a]; arr[a] = arr[b]; arr[b] = t; };
        let focusId = null;
        const keepConfirm = ed.confirmDel;
        ed.confirmDel = null;
        if (k === 'cancel') { this.editor = null; this.view = ed.returnTo; this.render(); window.scrollTo(0, 0); return; }
        if (k === 'save') { this.saveEditor(); return; }
        else if (k === 'p-add') { d.phases.push(blankDraftPhase(() => this.newId())); focusId = 'fe-pname-' + (d.phases.length - 1); }
        else if (k === 'p-up') swap(d.phases, pi, pi - 1);
        else if (k === 'p-down') swap(d.phases, pi, pi + 1);
        else if (k === 'p-del') {
            const proj = ed.mode === 'project' ? this.projects[ed.projectId] : null;
            if (proj && phaseHasProgress(proj, p.id) && keepConfirm !== 'p' + pi) { ed.confirmDel = 'p' + pi; }
            else d.phases.splice(pi, 1);
        }
        else if (k === 'gate-add') { p.gates.push({ id: 'g' + this.newId(), text: '' }); focusId = 'fe-gate-' + pi + '-' + (p.gates.length - 1); }
        else if (k === 'gate-up') swap(p.gates, i, i - 1);
        else if (k === 'gate-down') swap(p.gates, i, i + 1);
        else if (k === 'gate-del') p.gates.splice(i, 1);
        this.render();
        if (focusId) document.getElementById(focusId)?.focus();
    }

    async saveEditor() {
        const ed = this.editor, result = cleanFlow(ed.draft);
        if (result.errors.length) {
            ed.errors = result.errors;
            this.render();
            window.scrollTo(0, 0);
            return;
        }
        const flow = result.flow;
        try {
            if (ed.mode === 'flow') {
                const id = ed.flowId || 'f-' + this.newId();
                await this.flowsRef().doc(id).set({ name: flow.name, phases: flow.phases, updatedAt: Date.now() });
                this.editor = null;
                this.view = '__flows';
            } else {
                const p = this.projects[ed.projectId];
                if (!p) throw new Error('project is gone');
                const phases = clone(reconcileProject(p, flow));
                await this.projectsRef().doc(ed.projectId).update({ flow: flow, phases: phases, updatedAt: Date.now() });
                this.editor = null;
                this.view = ed.projectId;
            }
            this.render();
            window.scrollTo(0, 0);
        } catch (err) {
            console.error('Phase Board:', err);
            ed.errors = [];
            this.setNote('The flow was not saved. Check your connection and try again.', true);
        }
    }

    // Archiving only hides a project from the main list; it stays in the year in review and can be restored.
    setArchived(flag) {
        this.patchProject(() => ({ archived: flag, archivedAt: flag ? today() : '' }), 'archive change');
        this.view = 'portfolio';
        this.filter = 'all';
        this.render();
        this.setNote(flag ? 'Project archived. Find it under the Archived filter.' : 'Project restored.', false);
    }

    openProject(id) {
        this.picker = null;
        this.confirmDiagram = null;
        this.editingNote = null;
        this.editingGate = null;
        this.confirmCrit = null;
        this.view = id;
        this.showNew = false;
        this.confirmDelete = false;
        this.render();
        window.scrollTo(0, 0);
    }

    // ─── Export ───────────────────────────────────────────────

    // Builds one self-contained, read-only HTML file: the data, the theme's current colors, and
    // the same renderers the live board uses.
    async exportSnapshot(opts = {}) {
        const tokens = ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-hover', '--accent-primary', '--accent-secondary',
            '--text-primary', '--text-secondary', '--border-color', '--shadow-color', '--error-color', '--warning-color', '--info-color'];
        const cs = getComputedStyle(document.documentElement);
        const vars = tokens.map(t => t + ':' + cs.getPropertyValue(t).trim()).join(';');
        try {
            const tag = document.querySelector('script[src*="phase-board-core.js"]');
            const ver = tag ? (tag.getAttribute('src').split('?')[1] || '') : '';
            const [css, core, viewer] = await Promise.all(['phase-board-styles.css', 'phase-board-core.js', 'phase-board-export.js'].map(f =>
                fetch(f + (ver ? '?' + ver : ''), { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.text(); })));
            const out = clone(this.projects), svgs = {};
            const attached = [];
            Object.keys(out).forEach(id => Object.keys(out[id].phases || {}).forEach(pid => (out[id].phases[pid].diagrams || []).forEach(g => attached.push(g))));
            if (attached.length && await this.ensureFlowStatic()) {
                const paint = window.FlowStatic.resolvedPaint(null, null);
                attached.forEach(g => { try { svgs[g.id] = safeSvg(window.FlowStatic.toSVG(JSON.parse(g.canvas), { paint: paint, padding: 16, background: false }).svg); } catch (e) { svgs[g.id] = ''; } });
            }
            attached.forEach(g => { delete g.canvas; });
            const data = JSON.stringify({ projects: out, svgs: svgs, takenAt: today(), mode: opts.mode || 'board', year: opts.year || '' }).replace(/</g, '\\u003c');
            const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
                '<title>' + (opts.mode === 'review' ? 'Phase Board year in review ' + opts.year : 'Phase Board snapshot ' + today()) + '</title>' +
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..800&family=Raleway:wght@100..900&display=swap">' +
                '<style>:root{color-scheme:dark;' + vars + '}' +
                'body{margin:0;background:var(--bg-primary);color:var(--text-primary);font-family:"Raleway",sans-serif;display:flex;justify-content:center}' +
                'h1,h2,h3{font-family:"JetBrains Mono",monospace}input[type=checkbox]{accent-color:var(--accent-primary)}\n' + css + '</style></head>' +
                '<body><div class="pb" id="root"></div><script type="application/json" id="board-data">' + data + '<\/script>' +
                '<script>' + core.replace(/<\/script/gi, '<\\/script') + '<\/script><script>' + viewer.replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>';
            const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = opts.mode === 'review' ? 'phase-board-review-' + opts.year + '.html' : 'phase-board-' + today() + '.html';
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
        document.getElementById('pbReviewBtn')?.addEventListener('click', () => { this.view = '__review'; this.editor = null; this.render(); window.scrollTo(0, 0); });
        document.getElementById('pbFlowsBtn')?.addEventListener('click', () => { this.view = '__flows'; this.editor = null; this.confirmFlowDelete = null; this.render(); window.scrollTo(0, 0); });
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
            const dgAttach = e.target.closest('[data-dg-attach]');
            if (dgAttach) return this.openPicker(dgAttach.getAttribute('data-dg-attach'));
            if (e.target.closest('[data-dg-cancel]')) return this.closePicker();
            const dgPick = e.target.closest('[data-dg-pick]');
            if (dgPick) return this.attachDiagram(dgPick.getAttribute('data-phase'), dgPick.getAttribute('data-dg-pick'));
            const dgRefresh = e.target.closest('[data-dg-refresh]');
            if (dgRefresh) return this.refreshDiagram(dgRefresh.getAttribute('data-phase'), dgRefresh.getAttribute('data-dg-refresh'));
            const dgDel = e.target.closest('[data-dg-del]');
            if (dgDel) {
                const pid = dgDel.getAttribute('data-phase'), did = dgDel.getAttribute('data-dg-del');
                if (this.confirmDiagram === pid + ':' + did) return this.removeDiagram(pid, did);
                this.confirmDiagram = pid + ':' + did;
                return this.render();
            }
            const noteEdit = e.target.closest('[data-note-edit]');
            if (noteEdit) return this.startNoteEdit(noteEdit.getAttribute('data-phase'), noteEdit.getAttribute('data-note-edit'));
            if (e.target.closest('[data-note-cancel]')) return this.cancelNoteEdit();
            const critEdit = e.target.closest('[data-crit-edit]');
            if (critEdit) return this.startCritEdit(critEdit.getAttribute('data-phase'), critEdit.getAttribute('data-crit-edit'));
            if (e.target.closest('[data-crit-cancel]')) return this.cancelCritEdit();
            const critDel = e.target.closest('[data-crit-del]');
            if (critDel) {
                const pid = critDel.getAttribute('data-phase'), gid = critDel.getAttribute('data-crit-del');
                if (this.confirmCrit === pid + ':' + gid) return this.removeCriterion(pid, gid);
                this.confirmCrit = pid + ':' + gid;
                return this.render();
            }
            const lift = e.target.closest('[data-lift-risk]');
            if (lift) {
                const k = lift.getAttribute('data-lift-risk');
                return this.patchProject(p => ({ risks: (p.risks || []).map(r => r.id === k ? Object.assign({}, r, { resolved: !r.resolved }) : r) }), 'constraint');
            }
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
            const fe = e.target.closest('[data-fe-act]');
            if (fe) return this.editorAction(fe.getAttribute('data-fe-act'), +fe.getAttribute('data-p'), +fe.getAttribute('data-i'));
            const act = e.target.closest('[data-act]');
            if (act) {
                const k = act.getAttribute('data-act');
                if (k === 'back') { this.view = 'portfolio'; this.confirmDelete = false; this.editingGate = null; this.confirmCrit = null; this.editingNote = null; this.render(); window.scrollTo(0, 0); }
                else if (k === 'new') { this.showNew = true; this.render(); document.getElementById('npName')?.focus(); }
                else if (k === 'del') { this.confirmDelete = true; this.render(); }
                else if (k === 'del-cancel') { this.confirmDelete = false; this.render(); }
                else if (k === 'del-confirm') { this.deleteProject(); }
                else if (k === 'edit-flow') { this.editProjectFlow(); }
                else if (k === 'archive') { this.setArchived(true); }
                else if (k === 'unarchive') { this.setArchived(false); }
                else if (k === 'export-review') { this.exportSnapshot({ mode: 'review', year: this.reviewYear }); }
                else if (k === 'flow-new') { this.newFlow(); }
                else if (k === 'flow-edit') { this.editFlow(act.getAttribute('data-key')); }
                else if (k === 'flow-dup') { this.duplicateFlow(act.getAttribute('data-key')); }
                else if (k === 'flow-del') { this.confirmFlowDelete = act.getAttribute('data-key'); this.render(); }
                else if (k === 'flow-del-cancel') { this.confirmFlowDelete = null; this.render(); }
                else if (k === 'flow-del-confirm') { this.deleteFlow(act.getAttribute('data-key')); }
                return;
            }
            if (e.target.id === 'pbNewCancel') { this.showNew = false; this.render(); }
        });

        page.addEventListener('change', e => {
            const t = e.target;
            if (!t.matches) return;
            if (t.matches('[data-review-year]')) { this.reviewYear = t.value; this.render(); }
            else if (t.matches('input[data-gate]')) this.toggleGate(t.getAttribute('data-phase'), +t.getAttribute('data-gate'), t.checked);
            else if (t.matches('[data-ov]')) this.saveOverview(t.getAttribute('data-ov'), t.value);
            else if (t.matches('[data-risk-status]')) {
                const k = t.getAttribute('data-risk-status'), s = t.value;
                this.patchProject(p => ({ risks: (p.risks || []).map(r => r.id === k ? Object.assign({}, r, { status: s, resolved: s === 'mitigated' }) : r) }), 'risk status');
            } else if (t.matches('[data-outvalue]')) {
                const v = t.value.trim();
                this.patchProject(p => ({ outcomes: Object.assign({}, p.outcomes, { value: v }) }), 'value added text');
            } else if (t.matches('[data-act-assignee]')) this.editAction(t.getAttribute('data-phase'), t.getAttribute('data-act-assignee'), { assignee: t.value });
            else if (t.matches('[data-act-due]')) this.editAction(t.getAttribute('data-phase'), t.getAttribute('data-act-due'), { due: t.value });
            else if (t.matches('input[data-action]')) {
                const aid = t.getAttribute('data-action'), done = t.checked;
                this.editAction(t.getAttribute('data-phase'), aid, { done: done, doneAt: done ? today() : '' });
            }
        });

        page.addEventListener('toggle', e => {
            const el = e.target;
            if (!el.matches || !el.matches('details[data-dg]')) return;
            const id = el.getAttribute('data-dg');
            this.openDiagrams = el.open ? this.openDiagrams.filter(x => x !== id).concat([id]) : this.openDiagrams.filter(x => x !== id);
        }, true);

        page.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || !e.target.matches) return;
            if (e.target.matches('[data-crit-input]')) this.cancelCritEdit();
            else if (e.target.matches('[data-note-input]')) this.cancelNoteEdit();
        });

        page.addEventListener('input', e => {
            if (this.editor && e.target.matches && e.target.matches('[data-fe]')) this.editorInput(e.target);
        });

        page.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target;
            if (f.id === 'pbNewForm') {
                const name = document.getElementById('npName').value.trim();
                if (name) this.createProject(name, document.getElementById('npTpl').value, document.getElementById('npOwner').value.trim(), document.getElementById('npLead').value.trim());
            } else if (f.hasAttribute('data-note-form')) {
                this.saveNote(f.getAttribute('data-phase'), f.getAttribute('data-note-form'), f.querySelector('textarea').value);
            } else if (f.hasAttribute('data-crit-form')) {
                this.saveCriterion(f.getAttribute('data-phase'), f.getAttribute('data-crit-form'), f.querySelector('input').value);
            } else if (f.hasAttribute('data-crit-add')) {
                const input = f.querySelector('input'), text = input.value.trim();
                if (text) { this.addCriterion(f.getAttribute('data-crit-add'), text); input.value = ''; }
            } else if (f.hasAttribute('data-addrisk')) {
                const text = document.getElementById('risk-text').value.trim(), kind = document.getElementById('risk-kind').value;
                if (text) this.patchProject(p => ({ risks: (p.risks || []).concat([Object.assign({ id: this.newId(), kind: kind, text: text, resolved: false }, kind === 'risk' ? { status: 'open' } : {})]) }), 'risk');
            } else if (f.hasAttribute('data-addamount')) {
                const name = document.getElementById('am-name').value.trim();
                const amount = parseAmount(document.getElementById('am-amount').value);
                if (!name) return;
                if (amount === null) { this.setNote('Enter the amount as a number, for example 6 or 12,000.', true); return; }
                const unit = document.getElementById('am-unit').value, period = document.getElementById('am-period').value;
                this.patchProject(p => ({ outcomes: Object.assign({}, p.outcomes, { metrics: ((p.outcomes || {}).metrics || []).concat([{ id: this.newId(), kind: 'amount', name: name, amount: amount, unit: unit, period: period }]) }) }), 'metric');
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
