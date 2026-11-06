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
        this.mode = 'local';
        this.localStore = (typeof LocalBoardStore !== 'undefined') ? new LocalBoardStore() : null;
        this.localReady = null;
        this.deepLinkApplied = false;
        this.unsub = null;
        this.projects = {};
        this.view = 'portfolio';
        this.filter = 'all';
        this.justDone = {};
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
        this.artForm = null;
        this.artNote = '';
        this.openSuggestions = [];
        this.confirmDiagram = null;
        this.flowStaticPromise = null;
        this.diagramBusy = false;
        this.completedOpen = true;
        // Project-detail view state. `undefined` means "open the current phase".
        this.phaseChoice = undefined;
        this.expandAllPhases = false;
        this.actionsOpen = {};
        this.addActionOpen = null;
        this.decisionOpen = null;
        this.editingAction = null;
        this.addCritOpen = null;
        this.contextOpen = {};
        this.showOverview = false;
        this.showRisks = false;
        this.actionFilter = 'all';
        this.actionGroup = 'assignee';
        this.restore = null;
        try { if (localStorage.getItem('pb-completed-open') === '0') this.completedOpen = false; } catch (e) { /* storage unavailable: the section stays open */ }
        // The due panel is open unless it was last left collapsed in this browser; dueOnly narrows it to one group for this visit.
        this.dueOpen = true;
        this.dueOnly = '';
        try { if (localStorage.getItem('pb-due-open') === '0') this.dueOpen = false; } catch (e) { /* storage unavailable: the panel stays open */ }
    }

    init() {
        attachBackToTop(document, window);
        this.localLoad = this.localStore ? this.localStore.load() : Promise.resolve();
        this.localReady = this.localStore
            ? Promise.race([
                this.localLoad,
                new Promise(resolve => setTimeout(resolve, 5000))
            ])
            : Promise.resolve();
        this.bindEvents();
        if (typeof window.addEventListener === 'function') window.addEventListener('resize', () => this.updateStickyLayout());
        // Show the board immediately from local storage; a signed-in visitor's
        // cloud copy replaces it as soon as auth and the first snapshot arrive.
        this.localReady.then(() => {
            if (this.mode !== 'cloud') this.startLocalMode();
        });
        try {
            if (this.syncRequested()) this.connectFirebase().catch(() => {});
        } catch (err) {
            console.error('Phase Board: Firebase init failed', err);
            this.localReady.then(() => this.startLocalMode('Sign-in is unavailable. You are working locally; projects stay in this browser.'));
        }
        setTimeout(() => {
            const boot = document.getElementById('pbBoot');
            if (boot && boot.style.display !== 'none') {
                this.startLocalMode('Starting local storage is slow. Reload if the board stays empty.');
            }
        }, 10000);
    }

    hideBootScreen() {
        const boot = document.getElementById('pbBoot');
        if (boot) boot.style.display = 'none';
    }

    showApp() {
        this.hideBootScreen();
        const gate = document.getElementById('pbSignIn');
        if (gate) gate.style.display = 'none';
        const app = document.getElementById('pbApp');
        if (app) app.style.display = 'block';
    }

    updateAccountUI() {
        const local = this.mode === 'local';
        const user = this.user;
        const badge = document.getElementById('pbModeBadge');
        const signIn = document.getElementById('pbLocalSignInBtn');
        const userInfo = document.getElementById('pbUserInfo');
        const avatar = document.getElementById('pbAvatar');
        const name = document.getElementById('pbUserName');
        const signOut = document.getElementById('pbSignOutBtn');
        if (badge) badge.hidden = !local;
        if (signIn) signIn.hidden = !!user;
        if (userInfo) userInfo.hidden = !user;
        if (avatar) {
            if (user) avatar.src = user.photoURL || this.fallbackAvatar(user);
            avatar.alt = user ? (user.displayName || user.email || '') : '';
        }
        if (name) name.textContent = user ? (user.displayName || user.email || '') : '';
        if (signOut) signOut.hidden = !user;
    }

    // Accounts without a Google profile photo would otherwise leave an empty
    // circle when the identity is revealed.
    fallbackAvatar(user) {
        const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
        const styles = typeof getComputedStyle === 'function' && document.documentElement
            ? getComputedStyle(document.documentElement)
            : null;
        const accent = (styles && styles.getPropertyValue('--accent-primary').trim()) || '#74a12e';
        const bg = (styles && styles.getPropertyValue('--bg-primary').trim()) || '#1a1a1a';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">'
            + '<rect width="28" height="28" rx="14" fill="' + accent + '"/>'
            + '<text x="14" y="19" font-family="Raleway, sans-serif" font-size="13" font-weight="700" '
            + 'fill="' + bg + '" text-anchor="middle">' + esc(initial) + '</text></svg>';
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    async startLocalMode(message) {
        if (this.localReady) await this.localReady;
        if (this.mode === 'cloud') return;
        this.mode = 'local';
        this.showApp();
        this.updateAccountUI();
        if (!this.unsub) this.startLocalSync();
        if (this.localStore && this.localStore.error) {
            this.setNote(this.localStore.error, true, 0);
        } else if (message) {
            this.setNote(message, false, 0);
        }
    }

    startLocalSync() {
        this.stopSync();
        this.loaded = false;
        this.render();
        this.unsub = this.projectsRef().onSnapshot(snap => {
            this.projects = this.mapSnapshot(snap);
            this.loaded = true;
            this.render();
            this.applyDeepLink();
        });
        this.unsubFlows = this.flowsRef().onSnapshot(snap => {
            this.flows = this.mapSnapshot(snap);
            this.render();
        });
    }

    mapSnapshot(snap) {
        const next = {};
        snap.docs.forEach(d => { next[d.id] = d.data(); });
        return next;
    }

    applyDeepLink() {
        if (this.deepLinkApplied || !this.loaded) return;
        const params = new URLSearchParams(window.location.search);
        const id = params.get('project');
        const isNew = params.get('new') === '1';
        if (!id && !isNew) {
            this.deepLinkApplied = true;
            return;
        }
        if (isNew) {
            this.deepLinkApplied = true;
            history.replaceState({}, '', window.location.pathname);
            this.showNew = true;
            this.view = 'portfolio';
            this.render();
            document.getElementById('npName')?.focus();
            return;
        }
        if (!this.projects[id]) return; // wait for the first snapshot
        this.deepLinkApplied = true;
        history.replaceState({}, '', window.location.pathname);
        this.openProject(id);
    }

    // Push projects and flows edited while signed out into the cloud board.
    // A document only replaces a cloud copy when its updatedAt is newer; local
    // deletions only remove a cloud document that has not changed since.
    async mergeLocalIntoCloud() {
        const local = this.localStore;
        if (!local) return { ok: true, pushed: 0 };
        if (this.localLoad) await this.localLoad;
        const projects = local.projects;
        const flows = local.flows;
        const tombstones = local.tombstones.slice();
        if (!Object.keys(projects).length && !Object.keys(flows).length && !tombstones.length) {
            return { ok: true, pushed: 0 };
        }
        try {
            const remoteProjects = this.mapSnapshot(await this.cloudProjectsRef().get());
            const remoteFlows = this.mapSnapshot(await this.cloudFlowsRef().get());
            let pushed = 0;

            for (const stone of tombstones) {
                const isProject = stone.kind === 'projects';
                const remote = (isProject ? remoteProjects : remoteFlows)[stone.id];
                if (!remote) continue;
                if ((remote.updatedAt || 0) <= stone.at) {
                    await (isProject ? this.cloudProjectsRef() : this.cloudFlowsRef()).doc(stone.id).delete();
                    pushed++;
                }
            }

            const knownProjects = (local.known && local.known.projects) || {};
            const knownFlows = (local.known && local.known.flows) || {};
            const syncedAt = local.syncedAt || 0;

            for (const [id, data] of Object.entries(projects)) {
                const remote = remoteProjects[id];
                if (!remote) {
                    // Known to the cloud but gone now: deleted on another device.
                    // Keep it only if it was edited after the last cloud mirror.
                    if (knownProjects[id] && !((data.updatedAt || 0) > syncedAt)) {
                        await local.drop('projects', id);
                    } else {
                        await this.cloudProjectsRef().doc(id).set(data);
                        pushed++;
                    }
                    continue;
                }
                if ((data.updatedAt || 0) > (remote.updatedAt || 0)) {
                    await this.cloudProjectsRef().doc(id).set(data);
                    pushed++;
                }
            }

            for (const [id, data] of Object.entries(flows)) {
                const remote = remoteFlows[id];
                if (!remote) {
                    if (knownFlows[id] && !((data.updatedAt || 0) > syncedAt)) {
                        await local.drop('flows', id);
                    } else {
                        await this.cloudFlowsRef().doc(id).set(data);
                        pushed++;
                    }
                    continue;
                }
                if ((data.updatedAt || 0) > (remote.updatedAt || 0)) {
                    await this.cloudFlowsRef().doc(id).set(data);
                    pushed++;
                }
            }

            await local.clearTombstones();
            return { ok: true, pushed };
        } catch (err) {
            console.error('Phase Board: could not merge local projects', err);
            return { ok: false, pushed: 0 };
        }
    }

    // ─── Firebase ─────────────────────────────────────────────

    syncRequested() {
        try {
            if (localStorage.getItem('qol-phase-board-sync') === '1') return true;
        } catch (e) { /* storage unavailable */ }
        return new URLSearchParams(window.location.search).get('signin') === '1';
    }

    async connectFirebase() {
        if (this.auth) return true;
        if (typeof window.loadFirebase !== 'function') {
            this.setNote('The sync service is unavailable. You are working locally.', true, 0);
            return false;
        }
        const loaded = await window.loadFirebase();
        if (!loaded) {
            this.setNote('Could not load the sync service. You are working locally.', true, 0);
            return false;
        }
        this.initFirebase();
        return !!this.auth;
    }

    initFirebase() {
        if (this.auth) return;
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
            console.warn('Phase Board: Firebase SDK or config not available');
            this.localReady.then(() => this.startLocalMode('Sign-in is unavailable. You are working locally; projects stay in this browser.'));
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

    async onAuthChange(user) {
        this.hideBootScreen();
        if (this.localReady) await this.localReady;
        this.user = user;
        try {
            if (user) localStorage.setItem('qol-phase-board-sync', '1');
            else localStorage.removeItem('qol-phase-board-sync');
        } catch (e) { /* storage unavailable */ }
        if (user) {
            this.showApp();
            this.updateAccountUI();
            const merged = await this.mergeLocalIntoCloud();
            if (!merged.ok) {
                this.mode = 'local';
                this.updateAccountUI();
                this.startLocalMode();
                this.setNote('Signed in, but local projects could not be merged. They are still in this browser; reload to retry.', true, 0);
                return;
            }
            this.mode = 'cloud';
            this.updateAccountUI();
            this.startSync();
            if (merged.pushed) {
                this.setNote('Merged ' + merged.pushed + ' local change' + (merged.pushed === 1 ? '' : 's') + ' into your cloud board.', false);
            }
        } else {
            this.mode = 'local';
            this.updateAccountUI();
            this.startLocalMode();
        }
    }

    projectsRef() {
        if (this.mode === 'local' && this.localStore) return this.localStore.collection('projects');
        return this.cloudProjectsRef();
    }

    cloudProjectsRef() {
        return this.db.collection('users').doc(this.user.uid).collection('projects');
    }

    batch() {
        if (this.mode === 'local' && this.localStore) return this.localStore.batch();
        return this.db.batch();
    }

    startSync() {
        if (!this.db || !this.user) return;
        this.stopSync();
        this.loaded = false;
        this.render();
        // Offline or blocked networks can leave the listener silent, so say so after 10 s.
        this.slowTimer = setTimeout(() => { this.setNote('Still trying to reach your projects. What you see may be out of date.', false, 0); }, 10000);
        this.unsubFlows = this.flowsRef().onSnapshot(snap => {
            const next = this.mapSnapshot(snap);
            this.flows = next;
            if (this.localStore) this.localStore.replace('flows', next);
            this.render();
        }, err => console.error('Phase Board: Flow sync error:', err));
        this.unsub = this.projectsRef().onSnapshot(snap => {
            const next = this.mapSnapshot(snap);
            this.projects = next;
            this.loaded = true;
            // Keep a local copy of the last cloud state so the board still opens
            // instantly, and offline, on the next visit.
            if (this.localStore) this.localStore.replace('projects', next);
            if (!snap.metadata.fromCache) {
                clearTimeout(this.slowTimer);
                if (this.note.startsWith('Still trying')) this.note = '';
            }
            this.render();
            this.applyDeepLink();
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

    async signIn() {
        if (!this.auth) {
            this.setNote('Connecting to Google…', false);
            const connected = await this.connectFirebase();
            if (!connected || !this.auth) return;
        }
        if (this.auth.currentUser) return; // an existing session restored; onAuthChange will sync it
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await this.auth.signInWithPopup(provider);
        } catch (err) {
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
                try {
                    await this.auth.signInWithRedirect(provider);
                } catch (e) {
                    console.error('Phase Board: Sign-in failed:', e);
                    this.setNote('Sign-in failed. Allow pop-ups for this site and try again.', true, 0);
                }
            } else {
                console.error('Phase Board: Sign-in failed:', err);
                this.setNote('Sign-in failed. Try again in a moment.', true, 0);
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

    // Give the projects in progress the order they now have (1, 2, 3 ...), after one was moved.
    async moveProject(id, targetId, after) {
        const next = moveInOrder(activeOrder(this.projects), id, targetId, after);
        const writes = orderWrites(this.projects, next);
        if (!writes.length) return false;
        const updatedAt = Date.now();
        writes.forEach(w => { this.projects[w.id] = Object.assign({}, this.projects[w.id], { order: w.order, updatedAt: updatedAt }); });
        this.render();
        try {
            for (let i = 0; i < writes.length; i += 400) {
                const batch = this.batch();
                writes.slice(i, i + 400).forEach(w => batch.update(this.projectsRef().doc(w.id), { order: w.order, updatedAt: updatedAt }));
                await batch.commit();
            }
            return true;
        } catch (err) {
            console.error('Phase Board:', err);
            this.setNote('The new order was not saved. Check your connection and try again.', true);
            return false;
        }
    }

    async nudgeProject(id, step) {
        const ids = activeOrder(this.projects), i = ids.indexOf(id), j = i + step;
        if (i < 0 || j < 0 || j >= ids.length) return;
        if (await this.moveProject(id, ids[j], step > 0)) this.setNote('Moved to number ' + (j + 1) + ' of ' + ids.length + '.', false);
        const el = document.querySelector && document.querySelector('[data-drag="' + id + '"]');
        if (el) el.focus();
    }

    markDrop(card, place) {
        this.clearDrop();
        card.classList.add(place.axis === 'x' ? (place.after ? 'drop-r' : 'drop-l') : (place.after ? 'drop-b' : 'drop-t'));
    }

    clearDrop() {
        const page = document.getElementById('pbPage');
        (page && page.querySelectorAll ? Array.from(page.querySelectorAll('.drop-l, .drop-r, .drop-t, .drop-b, .is-dragging')) : []).forEach(el => el.classList.remove('drop-l', 'drop-r', 'drop-t', 'drop-b', 'is-dragging'));
    }

    sortedProjects() {
        return Object.keys(this.projects)
            .map(id => ({ id: id, p: this.projects[id] }))
            .sort(byPriority);
    }

    newFormHTML() {
        return '<form class="newform" id="pbNewForm"><label for="npName">Project name<input class="field" id="npName" autocomplete="off" required></label>' +
            '<label for="npOwner">Owner (optional)<input class="field" id="npOwner" autocomplete="off"></label>' +
            '<label for="npLead">Lead (optional)<input class="field" id="npLead" autocomplete="off"></label>' +
            '<label for="npTag">Tag (optional)<input class="field" id="npTag" maxlength="' + TAG_MAX + '" list="pb-tags-new" autocomplete="off" placeholder="e.g. NHOP"><datalist id="pb-tags-new">' + tagsOf(this.projects).map(t => '<option value="' + esc(t) + '">').join('') + '</datalist></label>' +
            '<label for="npTpl">Flow<select class="field" id="npTpl">' + this.allFlows().map(f =>
                '<option value="' + esc(f.key) + '">' + esc(f.name) + ' (' + f.phases.length + ' phases)</option>').join('') + '</select></label>' +
            '<fieldset class="np-phases"><legend>Phases to include</legend><div id="npPhases">' + phasePickHTML((this.allFlows()[0] || { phases: [] }).phases) + '</div>' +
            '<label class="np-ph"><input type="checkbox" id="npStarter"><span>Start each empty phase with the starter exit criteria (standard phases)</span></label>' +
            '<p class="msg">Untick the phases this project does not need. You can still add or remove phases later from the project page.</p></fieldset>' +
            '<button class="btn primary" type="submit">Create project</button><button class="btn" type="button" id="pbNewCancel">Cancel</button></form>';
    }

    portfolioHTML() {
        const list = this.sortedProjects();
        const shown = filterProjects(list, this.filter);
        let body;
        if (!this.loaded) body = '<p class="msg">Loading projects</p>';
        else if (!list.length) body = '<div class="empty"><h2>No projects yet</h2><p>Each project follows a flow template. Create the first one to track its phases, exit criteria and action items.</p>' + (this.mode === 'local' ? '<p class="pb-local-hint">Projects are saved in this browser. Sign in from the toolbar to sync them across devices.</p>' : '') + '<button class="btn primary" type="button" data-act="new">New project</button></div>';
        else if (!shown.length) body = '<div class="empty"><h2>Nothing in this view</h2><p>No projects match this filter.</p></div>';
        else body = portfolioBodyHTML(shown, this.filter, { when: p => p.updatedAt ? ago(p.updatedAt) : '', completedOpen: this.completedOpen, hues: tagHues(this.projects), ranks: rankMap(this.projects), drag: true });
        return '<div class="ph-row"><div><p class="eyebrow">Portfolio</p><h1>Projects</h1></div><div class="filters">' + filterChipsHTML(list, this.filter) + '</div></div>' +
            this.statusLine() + this.restoreHTML() + (this.showNew ? this.newFormHTML() : '') +
            (this.loaded && (this.filter === 'all' || this.filter === 'attention') ? dueItemsHTML(this.projects, rankMap(this.projects), this.justDone, { open: this.dueOpen, only: this.dueOnly }) : '') + body;
    }

    reviewPageHTML() {
        const years = reviewYears(this.projects), now = String(new Date().getFullYear());
        if (!this.reviewYear || years.indexOf(this.reviewYear) < 0) this.reviewYear = years.indexOf(now) >= 0 ? now : years[0];
        return '<button class="back" type="button" data-act="back">Back to projects</button>' +
            '<div class="ph-row"><label for="pbYear" class="sub" style="margin:0">Year<select class="field" id="pbYear" data-review-year="1" style="margin-left:8px">' + years.map(y => '<option' + (y === this.reviewYear ? ' selected' : '') + '>' + esc(y) + '</option>').join('') + '</select></label>' +
            '<button class="btn" type="button" data-act="export-review" style="margin-left:auto">Export this review</button></div>' +
            this.statusLine() + reviewHTML(reviewData(this.projects, this.reviewYear));
    }

    detailHTML() {
        const p = this.projects[this.view];
        if (!p) return '<button class="back" type="button" data-act="back">Back to projects</button><div class="empty"><h2>Project not found</h2><p>It may have been removed.</p></div>';
        const tpl = tplOf(p), s = summarize(tpl, p), people = peopleOf(p);
        const currentId = s.current ? s.current.id : '';
        const cards = tpl.phases.map((d, i) => {
            const extra = '<form class="dec-add" data-dec="' + d.id + '"><label class="sub" for="dec-' + d.id + '" style="width:100%;margin:0">Record a decision</label>' +
                '<input class="field" id="dec-' + d.id + '" autocomplete="off" placeholder="What was decided, and why?"><button class="btn" type="submit">Add</button></form>';
            const next = tpl.phases[i + 1];
            return phaseHTML(d, phaseState(p, d), i, {
                mode: 'edit', live: true, people,
                current: d.id === currentId,
                collapsed: !this.phaseIsOpen(d.id, currentId),
                actionsOpen: this.actionsOpen[d.id] !== false,
                addActionOpen: this.addActionOpen === d.id,
                decisionOpen: this.decisionOpen === d.id,
                editingAction: this.editingAction,
                addCritOpen: this.addCritOpen === d.id,
                contextOpen: !!this.contextOpen[d.id],
                nextPhase: next ? { id: next.id, name: next.short || next.name } : null,
                extra: extra, editingGate: this.editingGate, confirmCrit: this.confirmCrit,
                suggOpen: this.openSuggestions, editingNote: this.editingNote, svgs: this.svgs,
                openDiagrams: this.openDiagrams, picker: this.picker, confirmDiagram: this.confirmDiagram,
                artForm: this.artForm, artNote: this.artNote
            });
        }).join('');
        const del = this.confirmDelete
            ? '<span class="msg">Delete "' + esc(p.name) + '" and all its data?</span><button class="btn danger" type="button" data-act="del-confirm">Delete project</button><button class="btn" type="button" data-act="del-cancel">Keep it</button>'
            : '<button class="btn" type="button" data-act="del">Delete project</button>';
        const archiveBtn = isArchived(p)
            ? '<button class="btn" type="button" data-act="unarchive">Restore from archive</button>'
            : '<button class="btn" type="button" data-act="archive">Archive project</button>';
        const riskCount = (p.risks || []).filter(r => r.kind === 'constraint' ? !r.resolved : riskStatus(r) !== 'mitigated').length;

        return '<button class="back" type="button" data-act="back">Back to projects</button>' +
            '<div class="project-head">' +
                '<div class="project-title"><p class="eyebrow">' + projectMeta(p) + '</p><h1>' + esc(p.name) + '</h1>' + tagChip(p, tagHues(this.projects)) + '</div>' +
                '<div class="project-tools">' +
                    '<button type="button" class="btn' + (this.showOverview ? ' is-on' : '') + '" data-act="toggle-overview" aria-expanded="' + this.showOverview + '"><i class="fa-solid fa-address-card" aria-hidden="true"></i> Project details</button>' +
                    '<button type="button" class="btn' + (this.showRisks ? ' is-on' : '') + '" data-act="toggle-risks" aria-expanded="' + this.showRisks + '"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Risks' + (riskCount ? ' (' + riskCount + ')' : '') + '</button>' +
                '</div>' +
            '</div>' +
            (p.summary && !this.showOverview ? '<p class="project-goal">' + esc(p.summary) + '</p>' : '') +
            this.projectSummaryHTML(p) +
            (this.showOverview ? overviewHTML(p, true, { tags: tagsOf(this.projects) }) : '') +
            (this.showRisks ? risksHTML(p, true) : '') +
            this.statusLine() +
            '<div class="phase-workspace">' + this.phaseNavHTML(tpl, p, s, currentId) +
            '<div class="detail"><div class="phases">' + cards + '</div><aside class="feed sticky">' + this.openActionsPanelHTML(p) + '</aside></div></div>' +
            outcomesHTML(p, true) + '<div class="danger-zone">' + archiveBtn + del + '</div>';
    }

    phaseIsOpen(id, currentId) {
        if (this.expandAllPhases) return true;
        if (this.phaseChoice === undefined) return id === currentId;
        return this.phaseChoice === id;
    }

    currentPhaseId() {
        const p = this.projects[this.view];
        if (!p) return '';
        const s = summarize(tplOf(p), p);
        return s.current ? s.current.id : '';
    }

    projectSummaryHTML(p) {
        const bits = [];
        const add = (label, value, cls) => {
            if (!value) return;
            bits.push('<span class="ps-bit' + (cls ? ' ' + cls : '') + '"><span class="ps-k">' + label + '</span><span class="ps-v">' + esc(value) + '</span></span>');
        };
        add('Owner', p.owner);
        add('Lead', p.lead);
        add('Target', p.target, p.target && p.target < today() && !isComplete(p) ? 'is-late' : '');
        if (priorityOf(p) && !isComplete(p)) add('Priority', PRIORITY[priorityOf(p)]);
        add('Started', p.started);
        if (!bits.length) return '<p class="project-summary is-empty">No project details set. Use Project details to add an owner, target date and priority.</p>';
        return '<div class="project-summary">' + bits.join('') + '</div>';
    }

    phaseNavHTML(tpl, p, s, currentId) {
        const tabs = tpl.phases.map(d => {
            const st = phaseState(p, d), meta = STATUS[st.status] || STATUS.not_started, n = gateCount(d, st);
            const openActions = (st.actions || []).filter(a => !a.done).length;
            const open = this.phaseIsOpen(d.id, currentId);
            return '<button type="button" class="phase-tab ' + meta.cls + (d.id === currentId ? ' is-current' : '') + (open ? ' is-open' : '') + '" data-goto-phase="' + d.id + '"' +
                (d.id === currentId ? ' aria-current="step"' : '') + ' aria-expanded="' + open + '" title="' + esc(d.name + ': ' + meta.label) + '">' +
                '<span class="ptab-icon">' + icon(st.status, 16) + '</span>' +
                '<span class="ptab-body"><span class="ptab-name">' + esc(d.short || d.name) + '</span>' +
                '<span class="ptab-meta">' + (d.gates.length ? n + '/' + d.gates.length : 'No criteria') + (openActions ? ' · ' + openActions + ' open' : '') + '</span></span></button>';
        }).join('');
        return '<nav class="phase-nav" aria-label="Phases">' +
            '<div class="phase-nav-scroll">' + tabs + '</div>' +
            '<div class="phase-nav-side"><span class="phase-nav-progress">' + s.doneP + '/' + s.total + ' phases · ' + s.g + '/' + s.gt + ' criteria</span>' +
            '<button type="button" class="btn small" data-act="toggle-expand">' + (this.expandAllPhases ? 'Collapse' : 'Expand all') + '</button>' +
            '<button type="button" class="btn small" data-act="edit-flow">Edit phases</button></div></nav>';
    }

    openActionsPanelHTML(p) {
        const tpl = tplOf(p);
        const rows = [];
        tpl.phases.forEach(d => {
            const st = phaseState(p, d);
            (st.actions || []).forEach(a => { if (!a.done) rows.push({ a: a, d: d }); });
        });
        const counts = {
            all: rows.length,
            overdue: rows.filter(r => r.a.due && r.a.due < today()).length,
            mine: p.owner ? rows.filter(r => r.a.assignee === p.owner).length : 0,
            unassigned: rows.filter(r => !r.a.assignee).length
        };
        const filter = this.actionFilter !== 'all' && !counts[this.actionFilter] ? 'all' : this.actionFilter;
        const list = rows.filter(r => {
            if (filter === 'overdue') return r.a.due && r.a.due < today();
            if (filter === 'mine') return p.owner && r.a.assignee === p.owner;
            if (filter === 'unassigned') return !r.a.assignee;
            return true;
        });
        const filters = [['all', 'All'], ['overdue', 'Overdue']];
        if (p.owner && counts.mine) filters.push(['mine', 'Owner']);
        if (counts.unassigned) filters.push(['unassigned', 'Unassigned']);

        const groups = this.actionGroupsFor(list, tpl, p);
        const rowsHTML = groups.map(g => {
            const style = g.color ? ' style="--tc:' + g.color + '"' : '';
            return '<div class="who-grp' + (g.key ? '' : ' is-none') + '"' + style + '>' +
                '<p class="who">' + esc(g.name) + '<span class="cnt">' + g.items.length + '</span></p><ul>' +
                g.items.map(r => {
                    const late = r.a.due && r.a.due < today();
                    const inputId = 'side-' + r.d.id + '-' + r.a.id;
                    return '<li><label class="gate" for="' + esc(inputId) + '"><input type="checkbox" id="' + esc(inputId) + '" data-action="' + esc(r.a.id) + '" data-phase="' + esc(r.d.id) + '"><span>' + esc(r.a.text) + '</span></label>' +
                        '<small><a class="pj" href="#ph-' + esc(r.d.id) + '" data-jump-action="' + esc(r.a.id) + '" data-phase="' + esc(r.d.id) + '">' + esc(r.d.short || r.d.name) + '</a>' +
                        (r.a.due ? ' / due <span class="mono' + (late ? ' late' : '') + '">' + esc(r.a.due) + '</span>' : '') + '</small></li>';
                }).join('') + '</ul></div>';
        }).join('');

        return '<div class="feed-head"><p class="eyebrow">Open action items</p><span class="cnt">' + counts.all + '</span></div>' +
            '<div class="action-tools"><div class="action-filters">' +
            filters.map(f => '<button type="button" class="action-filter' + (filter === f[0] ? ' is-on' : '') + '" data-action-filter="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + (counts[f[0]] ? ' ' + counts[f[0]] : '') + '</button>').join('') +
            '</div><div class="action-group-toggle" role="group" aria-label="Group actions">' +
            '<button type="button" class="' + (this.actionGroup === 'assignee' ? 'is-on' : '') + '" data-action-group="assignee" aria-pressed="' + (this.actionGroup === 'assignee') + '">By person</button>' +
            '<button type="button" class="' + (this.actionGroup === 'phase' ? 'is-on' : '') + '" data-action-group="phase" aria-pressed="' + (this.actionGroup === 'phase') + '">By phase</button>' +
            '</div></div>' +
            (rows.length ? (rowsHTML || '<p class="msg">No actions match this filter.</p>') : '<p class="msg">No open action items.</p>');
    }

    actionGroupsFor(rows, tpl, p) {
        if (this.actionGroup === 'phase') {
            return tpl.phases.map(d => ({
                key: d.id, name: d.short || d.name, color: '',
                items: rows.filter(r => r.d.id === d.id)
            })).filter(g => g.items.length);
        }
        const hues = assigneeHues(p);
        const groups = new Map();
        rows.forEach(r => {
            const key = r.a.assignee || '';
            if (!groups.has(key)) groups.set(key, { key: key, name: key || 'Unassigned', color: key ? personColor(key, hues) : '', items: [] });
            groups.get(key).items.push(r);
        });
        return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    togglePhase(id) {
        const currentId = this.currentPhaseId();
        const open = this.phaseIsOpen(id, currentId);
        this.expandAllPhases = false;
        this.phaseChoice = open ? '' : id;
        this.render();
        if (!open) this.scrollToPhase(id);
    }

    goToPhase(id) {
        if (!this.projects[this.view]) return;
        this.expandAllPhases = false;
        this.phaseChoice = id;
        this.render();
        this.scrollToPhase(id);
    }

    toggleActions(id) {
        this.actionsOpen[id] = this.actionsOpen[id] === false;
        this.render();
    }

    setPhaseStatus(pid, status) {
        this.mutatePhase(pid, st => {
            st.status = status;
            if (status === 'blocked') st.blockedAt = today();
            else delete st.blockedAt;
        }, 'phase status');
    }

    openAddAction(id) {
        this.actionsOpen[id] = true;
        this.addActionOpen = id;
        this.render();
        requestAnimationFrame(() => document.getElementById('newact-' + id)?.focus());
    }

    scrollToPhase(id) {
        requestAnimationFrame(() => {
            const el = document.getElementById('ph-' + id);
            if (!el) return;
            el.scrollIntoView({ block: 'start' });
            try { history.replaceState(null, '', '#ph-' + id); } catch (e) { /* ignore */ }
        });
    }

    goToAdjacentPhase(delta) {
        const p = this.projects[this.view];
        if (!p) return;
        const phases = tplOf(p).phases;
        const currentId = this.currentPhaseId();
        const active = (typeof this.phaseChoice === 'string' && this.phaseChoice) ? this.phaseChoice : currentId;
        let index = phases.findIndex(d => d.id === active);
        if (index < 0) index = delta > 0 ? -1 : phases.length;
        const next = phases[index + delta];
        if (next) this.goToPhase(next.id);
    }

    jumpToAction(phase, action) {
        this.expandAllPhases = false;
        this.phaseChoice = phase;
        this.actionsOpen[phase] = true;
        this.render();
        requestAnimationFrame(() => {
            const row = Array.from(document.querySelectorAll('[data-action-row]')).find(el => el.getAttribute('data-action-row') === action);
            if (!row) return;
            row.scrollIntoView({ block: 'center' });
            row.classList.add('is-flash');
            setTimeout(() => row.classList.remove('is-flash'), 1800);
        });
    }

    updateStickyLayout() {
        if (typeof document.querySelector !== 'function') return;
        if (!document.documentElement || !document.documentElement.style) return;
        const header = document.querySelector('.header');
        const nav = document.querySelector('.phase-nav');
        const root = document.documentElement.style;
        const site = header ? header.offsetHeight : 0;
        const navH = nav ? nav.offsetHeight : 0;
        if (document.body && site) document.body.style.paddingTop = (site + 8) + 'px';
        root.setProperty('--pb-sticky-top', (site + 8) + 'px');
        root.setProperty('--pb-phase-head-top', (site + navH + 16) + 'px');
        root.setProperty('--pb-phase-scroll', (site + navH + 24) + 'px');
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
        if (!this.user && this.mode !== 'local') return;
        this.keepFocus(() => {
            const page = document.getElementById('pbPage');
            page.innerHTML = this.view === 'portfolio' ? this.portfolioHTML()
                : this.view === '__flows' ? this.flowsHTML()
                : this.view === '__editor' ? this.editorHTML()
                : this.view === '__review' ? this.reviewPageHTML()
                : this.detailHTML();
            if (this.view !== 'portfolio' && this.view.indexOf('__') !== 0) this.prepareDiagrams();
            const backupBtn = document.getElementById('pbBackupBtn');
            if (backupBtn) {
                backupBtn.hidden = !this.loaded || (!Object.keys(this.projects).length && !Object.keys(this.flows).length);
                let last = '';
                try { last = localStorage.getItem('pb-last-backup') || ''; } catch (e) { last = ''; }
                backupBtn.title = 'Download every project and your own flows as one JSON file. ' + (last ? 'Last backup from this browser: ' + last + '.' : 'No backup made from this browser yet.');
            }
            document.getElementById('pbExportBtn').hidden = !this.loaded || !Object.keys(this.projects).length;
        });
        this.updateStickyLayout();
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

    // projectId is for edits made away from the project's own page (the portfolio's due list); otherwise it is the open project.
    mutatePhase(pid, fn, what, projectId) {
        const id = projectId || this.view;
        this.queue(id, async () => {
            const p = this.projects[id];
            if (!p) return;
            const def = tplOf(p).phases.find(d => d.id === pid);
            const st = clone(phaseState(p, def));
            const wasDone = st.status === 'done';
            fn(st, def);
            const reopened = wasDone && st.status !== 'done' && p.completedOn;
            await this.projectsRef().doc(id).update(Object.assign({ ['phases.' + pid]: st, updatedAt: Date.now() }, reopened ? { completedOn: '' } : {}));
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
        this.mutatePhase(pid, st => { st.decisions = (st.decisions || []).concat([{ at: today(), text: text }]); startOnActivity(st); }, 'decision');
    }

    addAction(pid, text, assignee, due) {
        this.mutatePhase(pid, st => {
            st.actions = (st.actions || []).concat([{ id: this.newId(), text: text, done: false, assignee: assignee || '', due: due || '' }]);
            startOnActivity(st);
        }, 'action item');
    }

    editAction(pid, aid, patch, projectId) {
        this.mutatePhase(pid, st => {
            st.actions = (st.actions || []).map(a => a.id === aid ? Object.assign({}, a, patch) : a);
        }, 'action item', projectId);
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
            await this.projectsRef().doc(id).update(Object.assign({ flow: flow, phases: phases, updatedAt: Date.now() }, p.completedOn && anyPhaseReopened(p, phases) ? { completedOn: '' } : {}));
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
        const remote = (this.db && this.user)
            ? this.cloudProjectsRef().firestore.collection('users').doc(this.user.uid).collection('snippets').where('extension', '==', 'canvas').get()
                .then(snap => snap.docs.map(d => d.data())).catch(() => [])
            : Promise.resolve([]);
        const local = (typeof StorageManager !== 'undefined')
            ? StorageManager.getAll('snippets').then(all => all.filter(s => s && s.extension === 'canvas')).catch(() => [])
            : Promise.resolve([]);
        return mergeCharts(await Promise.all([remote, local]));
    }

    async openPicker(pid) {
        this.phaseChoice = pid;
        this.expandAllPhases = false;
        this.contextOpen[pid] = true;
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

    toggleArtifactForm(pid) {
        this.phaseChoice = pid;
        this.expandAllPhases = false;
        this.contextOpen[pid] = true;
        this.artForm = this.artForm === pid ? null : pid;
        this.artNote = '';
        this.render();
        if (this.artForm) document.getElementById('artUrl-' + pid)?.focus();
    }

    addArtifact(pid, url, title) {
        const p = this.projects[this.view];
        if (!p) return;
        const def = tplOf(p).phases.find(d => d.id === pid);
        const made = makeArtifactLink(url, title, this.newId(), phaseState(p, def));
        if (made.error) { this.artNote = made.error; this.render(); document.getElementById('artUrl-' + pid)?.focus(); return; }
        this.artNote = '';
        this.mutatePhase(pid, st => { st.artifacts = (st.artifacts || []).concat([made.artifact]); }, 'link');
        this.render();
        document.getElementById('artUrl-' + pid)?.focus();
    }

    removeArtifact(pid, aid) {
        this.mutatePhase(pid, st => { st.artifacts = (st.artifacts || []).filter(x => x.id !== aid); }, 'removal');
    }

    removeDiagram(pid, did) {
        this.confirmDiagram = null;
        delete this.svgs[did];
        this.mutatePhase(pid, st => { st.diagrams = (st.diagrams || []).filter(x => x.id !== did); }, 'diagram');
        this.render();
    }

    // ─── Backup and restore ───────────────────────────────────

    // Saves text as a file the user downloads (the same way Export HTML does).
    downloadText(text, filename, type) {
        const url = URL.createObjectURL(new Blob([text], { type: type }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    backupData() {
        const nP = Object.keys(this.projects).length, nF = Object.keys(this.flows).length;
        this.downloadText(JSON.stringify(buildBackup(this.projects, this.flows), null, 2), 'phase-board-backup-' + today() + '.json', 'application/json');
        try { localStorage.setItem('pb-last-backup', today()); } catch (e) { /* the reminder just will not show a date */ }
        this.setNote('Backup saved: ' + plural(nP, 'project', 'projects') + ' and ' + plural(nF, 'flow of your own', 'flows of your own') + '. Keep the file somewhere safe.', false);
    }

    async readRestoreFile(file) {
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { this.setNote('That file is too large to be a Phase Board backup.', true); return; }
        let text;
        try { text = await file.text(); } catch (err) { this.setNote('That file could not be read.', true); return; }
        const parsed = parseBackup(text);
        if (parsed.error) { this.setNote(parsed.error, true); return; }
        this.restore = Object.assign({ fileName: file.name }, parsed);
        this.view = 'portfolio';
        this.render();
        window.scrollTo(0, 0);
    }

    restoreHTML() {
        const r = this.restore;
        if (!r) return '';
        const plan = planImport(r, this.projects, this.flows, false);
        const total = Object.keys(r.projects).length + Object.keys(r.flows).length;
        const made = r.exportedAt ? ', made ' + r.exportedAt.slice(0, 10) : '';
        const skipped = r.skipped.length
            ? '<p class="msg err">' + r.skipped.length + (r.skipped.length === 1 ? ' item' : ' items') + ' in the file cannot be restored: ' + r.skipped.slice(0, 3).map(esc).join('; ') + (r.skipped.length > 3 ? '; and ' + (r.skipped.length - 3) + ' more' : '') + '.</p>' : '';
        let buttons;
        if (!total) buttons = '<p class="note">There is nothing in this file to restore.</p>';
        else buttons = (plan.fresh ? '<button class="btn primary" type="button" data-act="restore-new">Add the ' + plural(plan.fresh, 'new item', 'new items') + '</button>' : '') +
            (plan.present ? '<button class="btn" type="button" data-act="restore-all">' + (plan.fresh ? 'Add new and replace' : 'Replace') + ' the ' + plan.present + ' already here</button>' : '');
        return '<section class="restore-panel" aria-label="Restore from backup"><p class="eyebrow">Restore from backup</p>' +
            '<p><b>' + esc(r.fileName) + '</b>' + esc(made) + ' holds ' + plural(Object.keys(r.projects).length, 'project', 'projects') + ' and ' + plural(Object.keys(r.flows).length, 'flow', 'flows') + '.</p>' +
            '<p class="msg">' + (plan.fresh ? plural(plan.fresh, 'item is', 'items are') + ' not in the board yet. ' : 'Everything in the file is already in the board. ') +
            (plan.present ? plural(plan.present, 'is', 'are') + ' already here and will be left as ' + (plan.present === 1 ? 'it is' : 'they are') + ' unless you choose to replace ' + (plan.present === 1 ? 'it' : 'them') + ', which discards any changes made since the backup.' : '') + '</p>' +
            skipped + '<div class="ph-row">' + buttons + '<button class="btn" type="button" data-act="restore-cancel">Cancel</button></div></section>';
    }

    async applyRestore(replace) {
        const r = this.restore;
        if (!r) return;
        const plan = planImport(r, this.projects, this.flows, replace);
        this.restore = null;
        this.render();
        try {
            for (let i = 0; i < plan.writes.length; i += 400) {
                const batch = this.batch();
                plan.writes.slice(i, i + 400).forEach(w => batch.set((w.kind === 'projects' ? this.projectsRef() : this.flowsRef()).doc(w.id), w.data));
                await batch.commit();
            }
            this.setNote('Restored ' + plural(plan.writes.length, 'item', 'items') + ' from ' + r.fileName + '.', false);
        } catch (err) {
            console.error('Phase Board:', err);
            this.setNote('The restore did not finish. Some items may have been added; check the board and try again.', true);
        }
    }

    startNoteEdit(pid, gid) {
        this.phaseChoice = pid;
        this.expandAllPhases = false;
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
        this.phaseChoice = pid;
        this.expandAllPhases = false;
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
        const value = field === 'priority' ? (Object.prototype.hasOwnProperty.call(PRIORITY, raw) ? raw : '') : field === 'tag' ? cleanTag(raw) : (field === 'target' || field === 'summary' || field === 'owner' || field === 'lead' || field === 'completedOn' || field === 'started') ? raw.trim() : parseList(raw);
        if (field === 'completedOn' || field === 'started') {
            const p = this.projects[this.view];
            if (value && !DATE_RE.test(value)) { this.render(); return; }
            const start = field === 'started' ? value : (p && p.started) || '';
            const end = field === 'completedOn' ? value : (p ? projectCompletedOn(p) : '');
            if (start && end && end < start) {
                this.setNote('The completed date cannot be before the start date, so it was not changed.', true);
                return;
            }
        }
        this.patchProject(() => ({ [field]: value }), 'project detail');
    }

    async createProject(name, flowKey, owner, lead, tag, pick) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
        const id = slug + '-' + this.newId();
        try {
            const base = this.findFlow(flowKey) || { key: 'standard', name: TEMPLATES.standard.name, phases: TEMPLATES.standard.phases };
            const flow = pick ? pickPhases(base, pick.phases, pick.starter) : base;
            await this.projectsRef().doc(id).set(Object.assign(blankProject(name, flow, owner || '', lead || ''), { updatedAt: Date.now() }, cleanTag(tag) ? { tag: cleanTag(tag) } : {}));
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
        if (this.mode === 'local' && this.localStore) return this.localStore.collection('flows');
        return this.cloudFlowsRef();
    }

    cloudFlowsRef() {
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
        else if (k === 'gate-suggest') { const t = critSuggestions(p)[i]; if (t) p.gates.push({ id: 'g' + this.newId(), text: t }); }
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
                await this.projectsRef().doc(ed.projectId).update(Object.assign({ flow: flow, phases: phases, updatedAt: Date.now() }, p.completedOn && anyPhaseReopened(p, phases) ? { completedOn: '' } : {}));
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
        this.justDone = {};
        this.picker = null;
        this.confirmDiagram = null;
        this.editingNote = null;
        this.editingGate = null;
        this.confirmCrit = null;
        this.view = id;
        this.showNew = false;
        this.confirmDelete = false;
        this.phaseChoice = undefined;
        this.expandAllPhases = false;
        this.actionsOpen = {};
        this.addActionOpen = null;
        this.decisionOpen = null;
        this.editingAction = null;
        this.addCritOpen = null;
        this.contextOpen = {};
        this.showOverview = false;
        this.showRisks = false;
        this.actionFilter = 'all';
        this.actionGroup = 'assignee';
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

    // Collapsing the due panel to its pulse bar is remembered in this browser; collapsing also clears a count filter.
    setDueOpen(open) {
        this.dueOpen = open;
        if (!open) this.dueOnly = '';
        try { localStorage.setItem('pb-due-open', open ? '1' : '0'); } catch (e) { /* the choice lasts for this visit */ }
        this.render();
    }

    // ─── Events ───────────────────────────────────────────────

    bindEvents() {
        document.getElementById('pbLocalSignInBtn')?.addEventListener('click', () => this.signIn());
        document.getElementById('pbSignOutBtn')?.addEventListener('click', () => this.signOut());
        document.getElementById('pbExportBtn')?.addEventListener('click', () => this.exportSnapshot());
        document.getElementById('pbReviewBtn')?.addEventListener('click', () => { this.view = '__review'; this.editor = null; this.render(); window.scrollTo(0, 0); });
        document.getElementById('pbBackupBtn')?.addEventListener('click', () => this.backupData());
        document.getElementById('pbRestoreBtn')?.addEventListener('click', () => document.getElementById('pbRestoreFile')?.click());
        document.getElementById('pbRestoreFile')?.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; this.readRestoreFile(f); });
        document.getElementById('pbFlowsBtn')?.addEventListener('click', () => { this.view = '__flows'; this.editor = null; this.confirmFlowDelete = null; this.render(); window.scrollTo(0, 0); });
        document.getElementById('pbNewBtn')?.addEventListener('click', () => {
            this.view = 'portfolio';
            this.showNew = true;
            this.render();
            document.getElementById('npName')?.focus();
        });

        const page = document.getElementById('pbPage');
        page.addEventListener('click', e => {
            const jump = e.target.closest('[data-jump-action]');
            if (jump) { e.preventDefault(); return this.jumpToAction(jump.getAttribute('data-phase'), jump.getAttribute('data-jump-action')); }
            const actCount = e.target.closest('.ph-actcount');
            if (actCount) {
                const id = actCount.getAttribute('data-toggle-actions');
                this.expandAllPhases = false;
                this.phaseChoice = id;
                this.actionsOpen[id] = true;
                this.render();
                this.scrollToPhase(id);
                return;
            }
            const goto = e.target.closest('[data-goto-phase]');
            if (goto) { e.preventDefault(); return this.goToPhase(goto.getAttribute('data-goto-phase')); }
            const togglePhase = e.target.closest('[data-toggle-phase]');
            if (togglePhase) { e.preventDefault(); return this.togglePhase(togglePhase.getAttribute('data-toggle-phase')); }
            const toggleActs = e.target.closest('[data-toggle-actions]');
            if (toggleActs) return this.toggleActions(toggleActs.getAttribute('data-toggle-actions'));
            const phaseStatus = e.target.closest('[data-phase-status]');
            if (phaseStatus) return this.setPhaseStatus(phaseStatus.getAttribute('data-phase'), phaseStatus.getAttribute('data-phase-status'));
            const decToggle = e.target.closest('[data-decision-toggle]');
            if (decToggle) {
                const id = decToggle.getAttribute('data-decision-toggle');
                this.phaseChoice = id;
                this.expandAllPhases = false;
                this.decisionOpen = this.decisionOpen === id ? null : id;
                this.render();
                if (this.decisionOpen) requestAnimationFrame(() => document.getElementById('dec-' + id)?.focus());
                return;
            }
            const addAct = e.target.closest('[data-add-action-toggle]');
            if (addAct) return this.openAddAction(addAct.getAttribute('data-add-action-toggle'));
            const editAct = e.target.closest('[data-edit-action]');
            if (editAct) {
                const pid = editAct.getAttribute('data-phase'), aid = editAct.getAttribute('data-edit-action');
                this.editingAction = pid + ':' + aid;
                this.render();
                requestAnimationFrame(() => document.querySelector('[data-act-assignee="' + aid + '"]')?.focus());
                return;
            }
            if (e.target.closest('[data-edit-action-done]')) { this.editingAction = null; return this.render(); }
            const addCrit = e.target.closest('[data-add-crit-toggle]');
            if (addCrit) {
                const pid = addCrit.getAttribute('data-add-crit-toggle');
                this.addCritOpen = this.addCritOpen === pid ? null : pid;
                this.render();
                if (this.addCritOpen) requestAnimationFrame(() => document.getElementById('newcrit-' + pid)?.focus());
                return;
            }
            const context = e.target.closest('[data-context-toggle]');
            if (context) {
                const pid = context.getAttribute('data-context-toggle');
                this.contextOpen[pid] = !this.contextOpen[pid];
                return this.render();
            }
            const actionFilter = e.target.closest('[data-action-filter]');
            if (actionFilter) { this.actionFilter = actionFilter.getAttribute('data-action-filter'); return this.render(); }
            const actionGroup = e.target.closest('[data-action-group]');
            if (actionGroup) { this.actionGroup = actionGroup.getAttribute('data-action-group'); return this.render(); }
            const open = e.target.closest('[data-open]');
            if (open) return this.openProject(open.getAttribute('data-open'));
            if (e.target.closest('[data-due-toggle]')) return this.setDueOpen(!this.dueOpen);
            const dueOnly = e.target.closest('[data-due-only]');
            if (dueOnly) { const g = dueOnly.getAttribute('data-due-only'); this.dueOnly = this.dueOpen && this.dueOnly === g ? '' : g; return this.setDueOpen(true); }
            const filter = e.target.closest('[data-filter]');
            if (filter) { this.filter = filter.getAttribute('data-filter'); return this.render(); }
            const delAct = e.target.closest('[data-del-action]');
            if (delAct) return this.removeAction(delAct.getAttribute('data-phase'), delAct.getAttribute('data-del-action'));
            const sg = e.target.closest('[data-crit-suggest]');
            if (sg) return this.addCriterion(sg.getAttribute('data-crit-suggest'), sg.getAttribute('data-text'));
            const artT = e.target.closest('[data-art-toggle]');
            if (artT) return this.toggleArtifactForm(artT.getAttribute('data-art-toggle'));
            const artD = e.target.closest('[data-art-del]');
            if (artD) return this.removeArtifact(artD.getAttribute('data-phase'), artD.getAttribute('data-art-del'));
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
                else if (k === 'toggle-overview') { this.showOverview = !this.showOverview; this.render(); }
                else if (k === 'toggle-risks') { this.showRisks = !this.showRisks; this.render(); }
                else if (k === 'toggle-expand') { this.expandAllPhases = !this.expandAllPhases; this.render(); }
                else if (k === 'archive') { this.setArchived(true); }
                else if (k === 'unarchive') { this.setArchived(false); }
                else if (k === 'restore-new') { this.applyRestore(false); }
                else if (k === 'restore-all') { this.applyRestore(true); }
                else if (k === 'restore-cancel') { this.restore = null; this.render(); }
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
            else if (t.matches('#npTpl')) { const f = this.findFlow(t.value); document.getElementById('npPhases').innerHTML = phasePickHTML(f ? f.phases : []); }
            else if (t.matches('input[data-gate]')) this.toggleGate(t.getAttribute('data-phase'), +t.getAttribute('data-gate'), t.checked);
            else if (t.matches('[data-ov]')) this.saveOverview(t.getAttribute('data-ov'), t.value);
            else if (t.matches('[data-risk-status]')) {
                const k = t.getAttribute('data-risk-status'), s = t.value;
                this.patchProject(p => ({ risks: (p.risks || []).map(r => r.id === k ? Object.assign({}, r, { status: s, resolved: s === 'mitigated' }) : r) }), 'risk status');
            } else if (t.matches('[data-outvalue]')) {
                const v = t.value.trim();
                this.patchProject(p => ({ outcomes: Object.assign({}, p.outcomes, { value: v }) }), 'value added text');
            } else if (t.matches('[data-outlessons]')) {
                const v = t.value.trim();
                this.patchProject(p => ({ outcomes: Object.assign({}, p.outcomes, { lessons: v }) }), 'lessons learned');
            } else if (t.matches('[data-act-assignee]')) this.editAction(t.getAttribute('data-phase'), t.getAttribute('data-act-assignee'), { assignee: t.value });
            else if (t.matches('[data-act-due]')) this.editAction(t.getAttribute('data-phase'), t.getAttribute('data-act-due'), { due: t.value });
            else if (t.matches('input[data-action]')) {
                const aid = t.getAttribute('data-action'), done = t.checked, proj = t.getAttribute('data-project');
                if (proj) { if (done) this.justDone[proj + '/' + aid] = true; else delete this.justDone[proj + '/' + aid]; }
                this.editAction(t.getAttribute('data-phase'), aid, { done: done, doneAt: done ? today() : '' }, proj);
            }
        });

        page.addEventListener('toggle', e => {
            const el = e.target;
            // Remember whether the Completed section was left open (only from the All view, where it is the user's choice).
            if (el && el.id === 'pbDoneSec') {
                if (this.filter !== 'all') return;
                this.completedOpen = !!el.open;
                try { localStorage.setItem('pb-completed-open', el.open ? '1' : '0'); } catch (err) { /* the choice lasts for this visit */ }
                return;
            }
            if (el.matches && el.matches('details[data-sugg]')) {
                const sid = el.getAttribute('data-sugg');
                this.openSuggestions = el.open ? this.openSuggestions.filter(x => x !== sid).concat([sid]) : this.openSuggestions.filter(x => x !== sid);
                return;
            }
            if (!el.matches || !el.matches('details[data-dg]')) return;
            const id = el.getAttribute('data-dg');
            this.openDiagrams = el.open ? this.openDiagrams.filter(x => x !== id).concat([id]) : this.openDiagrams.filter(x => x !== id);
        }, true);

        // Reordering the projects in progress by dragging a card onto another.
        const cardOf = e => (e.target && e.target.closest) ? e.target.closest('[data-drag]') : null;
        page.addEventListener('dragstart', e => {
            const card = cardOf(e);
            if (!card) return;
            this.dragId = card.getAttribute('data-drag');
            if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', this.dragId); }
            card.classList.add('is-dragging');
        });
        page.addEventListener('dragover', e => {
            const card = cardOf(e);
            if (!this.dragId || !card || card.getAttribute('data-drag') === this.dragId) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            this.markDrop(card, dropPlace(card.getBoundingClientRect(), e.clientX, e.clientY));
        });
        page.addEventListener('drop', e => {
            const card = cardOf(e);
            if (!this.dragId || !card) return;
            e.preventDefault();
            const id = this.dragId, targetId = card.getAttribute('data-drag'), place = dropPlace(card.getBoundingClientRect(), e.clientX, e.clientY);
            this.dragId = null;
            this.clearDrop();
            if (targetId !== id) this.moveProject(id, targetId, place.after);
        });
        page.addEventListener('dragend', () => { this.dragId = null; this.clearDrop(); });

        page.addEventListener('keydown', e => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                const card = cardOf(e);
                if (card) { e.preventDefault(); this.nudgeProject(card.getAttribute('data-drag'), e.key === 'ArrowUp' ? -1 : 1); }
                return;
            }
            if (e.key !== 'Escape' || !e.target.matches) return;
            if (e.target.matches('[data-crit-input]')) this.cancelCritEdit();
            else if (e.target.matches('[data-note-input]')) this.cancelNoteEdit();
        });

        if (typeof document.addEventListener === 'function') document.addEventListener('keydown', e => {
            if (!this.projects[this.view] || this.view.indexOf('__') === 0) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.target.matches && e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
            if (e.key === '[' || e.key === ']') {
                e.preventDefault();
                this.goToAdjacentPhase(e.key === ']' ? 1 : -1);
            }
        });

        page.addEventListener('input', e => {
            if (this.editor && e.target.matches && e.target.matches('[data-fe]')) this.editorInput(e.target);
        });

        page.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target;
            if (f.id === 'pbNewForm') {
                const name = document.getElementById('npName').value.trim();
                const chosen = Array.from(document.querySelectorAll('#npPhases input[data-np-phase]')).filter(i => i.checked).map(i => i.getAttribute('data-np-phase'));
                if (name && !chosen.length) this.setNote('Choose at least one phase for the project.', true);
                else if (name) this.createProject(name, document.getElementById('npTpl').value, document.getElementById('npOwner').value.trim(), document.getElementById('npLead').value.trim(), document.getElementById('npTag').value, { phases: chosen, starter: !!document.getElementById('npStarter').checked });
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
            } else if (f.hasAttribute('data-art-form')) {
                const pid = f.getAttribute('data-art-form');
                this.addArtifact(pid, document.getElementById('artUrl-' + pid).value, document.getElementById('artTitle-' + pid).value);
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
