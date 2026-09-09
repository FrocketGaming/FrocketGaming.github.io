class NotesApp {
    constructor() {
        this.notes = [];
        this.currentNoteId = null;
        this.user = null;
        this.db = null;
        this.auth = null;
        this.unsub = null;
        this.saveTimer = null;
        this.previewMode = false;
        this.splitView = false;
        this.searchQuery = '';
        this.zenMode = false;
        this.sidebarCollapsed = false;
        this.moreMenuOpen = false;
        this.pendingAction = null; // 'trash' | 'purge'
        this.activeFilter = 'all'; // 'all' | 'today' | 'untagged' | 'archive' | 'trash' | 'tag'
        this.activeTag = null;
    }

    init() {
        this.initFirebase();
        this.bindEvents();
        this.updateHeaderOffset();
        window.addEventListener('resize', () => this.updateHeaderOffset());
    }

    // ─── Layout ───────────────────────────────────────────────

    updateHeaderOffset() {
        const header = document.querySelector('.header');
        if (!header) return;
        const headerH = header.offsetHeight;
        document.body.style.paddingTop = headerH + 'px';

        const toolbar = document.querySelector('.notes-toolbar');
        const layout  = document.querySelector('.notes-layout');
        if (toolbar && layout) {
            const toolbarH = toolbar.offsetHeight;
            layout.style.height = `calc(97vh - ${headerH + toolbarH}px)`;
        }
    }

    // ─── Firebase ─────────────────────────────────────────────

    initFirebase() {
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
            console.warn('Notes: Firebase SDK or config not available');
            document.getElementById('signInScreen').style.display = 'flex';
            return;
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();

        try {
            this.db.settings({
                cache: firebase.firestore.persistentLocalCache({
                    tabManager: firebase.firestore.persistentMultipleTabManager(),
                }),
            });
        } catch (err) {
            console.warn('Notes: Persistence error:', err);
        }

        this.auth.getRedirectResult().catch(() => {});
        this.auth.onAuthStateChanged(user => this.onAuthChange(user));
    }

    onAuthChange(user) {
        this.user = user;

        if (user) {
            document.getElementById('signInScreen').style.display = 'none';
            document.getElementById('notesApp').style.display = 'flex';

            const userInfo = document.getElementById('userInfo');
            const avatar = document.getElementById('userAvatar');
            const name = document.getElementById('userName');

            userInfo.style.display = 'flex';
            if (user.photoURL) avatar.src = user.photoURL;
            name.textContent = user.displayName || user.email;

            this.startSync();
        } else {
            document.getElementById('signInScreen').style.display = 'flex';
            document.getElementById('notesApp').style.display = 'none';
            this.stopSync();
            this.notes = [];
            this.currentNoteId = null;
        }
    }

    startSync() {
        if (!this.db || !this.user) return;
        this.stopSync();
        this.setSyncStatus('syncing');

        this.unsub = this.db
            .collection('users').doc(this.user.uid)
            .collection('notes')
            .orderBy('updatedAt', 'desc')
            .onSnapshot(
                snapshot => {
                    this.notes = [];
                    snapshot.forEach(doc => {
                        this.notes.push({ ...doc.data(), _firestoreId: doc.id });
                    });

                    this.refresh();
                    this.setSyncStatus('synced');

                    if (this.currentNoteId) {
                        const exists = this.notes.find(n => n.id === this.currentNoteId);
                        if (!exists) {
                            this.currentNoteId = null;
                            this.showEmptyState();
                        } else {
                            this.updateEditorChrome(exists);
                        }
                    }
                },
                error => {
                    console.error('Notes: Firestore listener error:', error);
                    this.setSyncStatus('error');
                }
            );
    }

    stopSync() {
        if (this.unsub) {
            this.unsub();
            this.unsub = null;
        }
    }

    setSyncStatus(status) {
        const dot = document.getElementById('syncDot');
        const label = document.getElementById('syncLabel');
        const container = document.getElementById('syncStatus');
        if (!dot || !label || !container) return;

        if (!status) { container.style.display = 'none'; return; }

        container.style.display = 'flex';
        dot.className = 'sync-status-dot';

        if (status === 'syncing') { dot.classList.add('syncing'); label.textContent = 'Syncing...'; }
        else if (status === 'synced') { dot.classList.add('synced'); label.textContent = 'Synced'; }
        else if (status === 'error') { dot.classList.add('error'); label.textContent = 'Sync error'; }
    }

    // ─── Filtering / Navigation ─────────────────────────────────

    refresh() {
        this.renderNotesList();
        this.renderNavPanel();
    }

    isToday(iso) {
        if (!iso) return false;
        const d = new Date(iso);
        const now = new Date();
        return d.getFullYear() === now.getFullYear() &&
               d.getMonth() === now.getMonth() &&
               d.getDate() === now.getDate();
    }

    setFilter(filter, tag = null) {
        this.activeFilter = filter;
        this.activeTag = tag;
        this.refresh();
    }

    getViewTitle() {
        switch (this.activeFilter) {
            case 'today': return 'Today';
            case 'untagged': return 'Untagged';
            case 'archive': return 'Archive';
            case 'trash': return 'Trash';
            case 'tag': return `#${this.activeTag}`;
            default: return 'All Notes';
        }
    }

    getSortedFiltered() {
        const query = this.searchQuery.toLowerCase();
        let pool;

        if (this.activeFilter === 'archive') {
            pool = this.notes.filter(n => n.archived && !n.trashed);
        } else if (this.activeFilter === 'trash') {
            pool = this.notes.filter(n => n.trashed);
        } else {
            pool = this.notes.filter(n => !n.archived && !n.trashed);
            if (this.activeFilter === 'today') {
                pool = pool.filter(n => this.isToday(n.updatedAt));
            } else if (this.activeFilter === 'untagged') {
                pool = pool.filter(n => !(n.tags && n.tags.length));
            } else if (this.activeFilter === 'tag' && this.activeTag) {
                pool = pool.filter(n => (n.tags || []).includes(this.activeTag));
            }
        }

        if (query) {
            pool = pool.filter(n =>
                (n.title || '').toLowerCase().includes(query) ||
                (n.content || '').toLowerCase().includes(query) ||
                (n.tags || []).some(t => t.toLowerCase().includes(query))
            );
        }

        pool = [...pool].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

        if (this.activeFilter !== 'archive' && this.activeFilter !== 'trash') {
            const pinned = pool.filter(n => n.pinned);
            const unpinned = pool.filter(n => !n.pinned);
            return [...pinned, ...unpinned];
        }
        return pool;
    }

    getAutoTitle(content) {
        return (content || '')
            .split('\n')[0]
            .replace(/^#{1,6}\s*/, '')
            .trim()
            .slice(0, 50);
    }

    renderNavPanel() {
        const active = this.notes.filter(n => !n.archived && !n.trashed);
        const archived = this.notes.filter(n => n.archived && !n.trashed);
        const trashed = this.notes.filter(n => n.trashed);
        const today = active.filter(n => this.isToday(n.updatedAt));
        const untagged = active.filter(n => !(n.tags && n.tags.length));

        this.setNavCount('navCountAll', active.length);
        this.setNavCount('navCountToday', today.length);
        this.setNavCount('navCountUntagged', untagged.length);
        this.setNavCount('navCountArchive', archived.length);
        this.setNavCount('navCountTrash', trashed.length);

        document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
            btn.classList.toggle('active', this.activeFilter === btn.dataset.filter);
        });

        const tagCounts = new Map();
        active.forEach(n => (n.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
        const sortedTags = [...tagCounts.keys()].sort((a, b) => a.localeCompare(b));

        const list = document.getElementById('navTagsList');
        if (!list) return;

        if (!sortedTags.length) {
            list.innerHTML = '<div class="nav-tags-empty">No tags yet</div>';
            return;
        }

        list.innerHTML = sortedTags.map(tag => `
            <button class="nav-tag-item ${this.activeFilter === 'tag' && this.activeTag === tag ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}">
                <i class="fa-solid fa-hashtag"></i>
                <span class="nav-tag-label">${this.escapeHtml(tag)}</span>
                <span class="nav-item-count">${tagCounts.get(tag)}</span>
            </button>
        `).join('');
    }

    setNavCount(id, n) {
        const el = document.getElementById(id);
        if (el) el.textContent = n > 0 ? n : '';
    }

    // ─── Notes List ───────────────────────────────────────────

    renderNotesList() {
        const list = document.getElementById('notesList');
        const sorted = this.getSortedFiltered();

        const countEl = document.getElementById('notesCount');
        const title = this.getViewTitle();
        if (countEl) countEl.textContent = sorted.length > 0 ? `${title} (${sorted.length})` : title;

        if (sorted.length === 0) {
            let msg;
            if (this.searchQuery) msg = 'No notes match your search.';
            else if (this.activeFilter === 'archive') msg = 'Archive is empty.';
            else if (this.activeFilter === 'trash') msg = 'Trash is empty.';
            else if (this.activeFilter === 'today') msg = 'No notes updated today.';
            else if (this.activeFilter === 'untagged') msg = 'No untagged notes.';
            else if (this.activeFilter === 'tag') msg = `No notes tagged #${this.escapeHtml(this.activeTag || '')}.`;
            else msg = 'No notes yet.<br>Click <strong>New Note</strong> to get started.';
            list.innerHTML = `<div class="notes-list-empty">${msg}</div>`;
            return;
        }

        const hasUnsaved = !!this.saveTimer;

        list.innerHTML = sorted.map(note => {
            const isActive = note.id === this.currentNoteId;
            const preview = (note.content || '')
                .replace(/#{1,6}\s/g, '')
                .replace(/[*_~`>]/g, '')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .trim()
                .slice(0, 100);

            const displayTitle = note.title || this.getAutoTitle(note.content) || 'Untitled';
            const date = this.formatDate(note.updatedAt);
            const fullDate = note.updatedAt ? new Date(note.updatedAt).toLocaleString() : '';
            const tags = (note.tags || []).slice(0, 3)
                .map(t => `<span class="note-tag-chip">${this.escapeHtml(t)}</span>`)
                .join('');

            return `
                <div class="note-list-item ${isActive ? 'active' : ''}" data-id="${note.id}" onclick="notesApp.selectNote('${note.id}')">
                    <div class="note-list-item-header">
                        <span class="note-list-title">${this.escapeHtml(displayTitle)}</span>
                        <div class="note-list-indicators">
                            ${note.pinned && this.activeFilter !== 'archive' && this.activeFilter !== 'trash' ? '<i class="fa-solid fa-thumbtack pin-indicator" title="Pinned"></i>' : ''}
                            ${isActive && hasUnsaved ? '<span class="unsaved-dot" title="Unsaved changes"></span>' : ''}
                        </div>
                    </div>
                    <div class="note-list-preview">${preview ? this.escapeHtml(preview) : '<em>Empty note</em>'}</div>
                    <div class="note-list-footer">
                        <span class="note-list-date" title="${fullDate}">${date}</span>
                        <div class="note-list-tags">${tags}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectNote(id) {
        if (this.currentNoteId && this.currentNoteId !== id) {
            if (this.saveTimer) {
                clearTimeout(this.saveTimer);
                this.saveTimer = null;
                this.saveCurrentNote(true);
            }
        }

        this.currentNoteId = id;
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        this.renderNotesList();
        this.showEditor(note);
    }

    navigateList(direction) {
        const sorted = this.getSortedFiltered();
        if (!sorted.length) return;

        const idx = sorted.findIndex(n => n.id === this.currentNoteId);
        let newIdx;

        if (idx === -1) {
            newIdx = direction === 'down' ? 0 : sorted.length - 1;
        } else {
            newIdx = direction === 'down'
                ? Math.min(idx + 1, sorted.length - 1)
                : Math.max(idx - 1, 0);
        }

        this.selectNote(sorted[newIdx].id);
        document.querySelector(`[data-id="${sorted[newIdx].id}"]`)?.scrollIntoView({ block: 'nearest' });
    }

    showEmptyState() {
        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('noteEditor').style.display = 'none';
    }

    showEditor(note) {
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('noteEditor').style.display = 'flex';

        document.getElementById('noteTitleInput').value = note.title || '';
        document.getElementById('noteContentInput').value = note.content || '';

        if (this.previewMode) {
            this.previewMode = false;
            document.getElementById('noteContentInput').style.display = 'block';
            document.getElementById('notePreview').style.display = 'none';
            const previewBtn = document.getElementById('previewToggleBtn');
            previewBtn.querySelector('i').className = 'fa-solid fa-eye';
            previewBtn.title = 'Preview';
        }

        if (this.splitView) {
            this.setSplitView(false);
        }

        this.renderTagChips(note.tags || []);
        this.updateWordCount(note.content || '');
        this.updateEditorChrome(note);

        document.getElementById('noteMetaCreated').textContent =
            note.createdAt ? `Created ${this.formatDate(note.createdAt)}` : '';
        document.getElementById('noteMetaUpdated').textContent =
            note.updatedAt ? `Updated ${this.formatDate(note.updatedAt)}` : '';
        document.getElementById('autoSaveStatus').textContent = '';

        const charWarning = document.getElementById('charLimitWarning');
        if (charWarning) charWarning.style.display = 'none';
    }

    // ─── Editor chrome (pin state, archive/trash banner, menu labels) ──

    updateEditorChrome(note) {
        const pinBtn = document.getElementById('pinBtn');
        if (pinBtn) {
            if (note.pinned) { pinBtn.classList.add('active'); pinBtn.title = 'Unpin note'; }
            else { pinBtn.classList.remove('active'); pinBtn.title = 'Pin note'; }
        }

        const banner = document.getElementById('noteStatusBanner');
        const text = document.getElementById('noteStatusText');
        const icon = document.getElementById('noteStatusIcon');
        const restoreBtn = document.getElementById('restoreBtn');
        const purgeBtn = document.getElementById('purgeBtn');
        const titleInput = document.getElementById('noteTitleInput');
        const contentInput = document.getElementById('noteContentInput');
        const tagInput = document.getElementById('tagInput');
        const archiveBtn = document.getElementById('archiveNoteBtn');
        const trashBtn = document.getElementById('deleteNoteBtn');

        const readOnly = !!note.trashed;
        if (titleInput) titleInput.disabled = readOnly;
        if (contentInput) contentInput.disabled = readOnly;
        if (tagInput) tagInput.disabled = readOnly;

        if (banner) {
            if (note.trashed) {
                banner.style.display = 'flex';
                icon.className = 'fa-solid fa-trash';
                text.textContent = 'This note is in Trash.';
                purgeBtn.style.display = 'inline-flex';
            } else if (note.archived) {
                banner.style.display = 'flex';
                icon.className = 'fa-solid fa-box-archive';
                text.textContent = 'This note is archived.';
                purgeBtn.style.display = 'none';
            } else {
                banner.style.display = 'none';
            }
        }

        if (archiveBtn && trashBtn) {
            if (note.trashed) {
                archiveBtn.style.display = 'none';
                trashBtn.style.display = 'none';
            } else {
                archiveBtn.style.display = 'flex';
                trashBtn.style.display = 'flex';
                archiveBtn.innerHTML = note.archived
                    ? '<i class="fa-solid fa-box-open"></i> Unarchive'
                    : '<i class="fa-solid fa-box-archive"></i> Archive';
            }
        }

        this.syncFormatBarVisibility();
    }

    syncFormatBarVisibility() {
        const bar = document.getElementById('editorFormatBar');
        if (!bar) return;
        const note = this.notes.find(n => n.id === this.currentNoteId);
        const readOnly = note && note.trashed;
        bar.style.display = (!readOnly && !this.previewMode && !this.splitView) ? 'flex' : 'none';
    }

    // ─── CRUD ─────────────────────────────────────────────────

    async newNote() {
        if (!this.db || !this.user) return;

        if (this.activeFilter !== 'all') {
            this.activeFilter = 'all';
            this.activeTag = null;
        }

        const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const note = { id, title: '', content: '', tags: [], pinned: false, archived: false, trashed: false, createdAt: now, updatedAt: now };

        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        this.currentNoteId = id;
        this.notes.unshift(note);
        this.refresh();
        this.showEditor(note);

        setTimeout(() => document.getElementById('noteTitleInput')?.focus(), 50);

        try {
            await this.db.collection('users').doc(this.user.uid).collection('notes').doc(id).set(note);
        } catch (err) {
            console.error('Notes: Failed to create note:', err);
            this.notes = this.notes.filter(n => n.id !== id);
            this.currentNoteId = null;
            this.refresh();
            this.showEmptyState();
        }
    }

    async duplicateNote() {
        if (!this.currentNoteId || !this.db || !this.user) return;
        const note = this.notes.find(n => n.id === this.currentNoteId);
        if (!note) return;

        const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const { _firestoreId, ...rest } = note;
        const duplicate = { ...rest, id, title: note.title ? `${note.title} (copy)` : '', pinned: false, archived: false, trashed: false, createdAt: now, updatedAt: now };

        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }

        this.currentNoteId = id;
        this.notes.unshift(duplicate);
        this.refresh();
        this.showEditor(duplicate);

        try {
            await this.db.collection('users').doc(this.user.uid).collection('notes').doc(id).set(duplicate);
        } catch (err) {
            console.error('Notes: Failed to duplicate:', err);
            this.notes = this.notes.filter(n => n.id !== id);
            this.currentNoteId = null;
            this.refresh();
            this.showEmptyState();
        }
    }

    scheduleAutoSave() {
        clearTimeout(this.saveTimer);
        const status = document.getElementById('autoSaveStatus');
        if (status) status.textContent = 'Unsaved changes...';
        this.saveTimer = setTimeout(() => this.saveCurrentNote(), 1500);
        this.renderNotesList();
        this.checkCharLimit();
    }

    checkCharLimit() {
        const content = document.getElementById('noteContentInput')?.value || '';
        const warning = document.getElementById('charLimitWarning');
        if (!warning) return;
        const limit = 50000;
        if (content.length > limit * 0.85) {
            warning.textContent = `${content.length.toLocaleString()} / ${limit.toLocaleString()} chars`;
            warning.style.display = 'inline';
            warning.style.color = content.length >= limit ? 'var(--error-color)' : 'var(--warning-color)';
        } else {
            warning.style.display = 'none';
        }
    }

    async saveCurrentNote(silent = false) {
        if (!this.currentNoteId || !this.db || !this.user) return;

        const titleEl = document.getElementById('noteTitleInput');
        const contentEl = document.getElementById('noteContentInput');
        if (!titleEl || !contentEl) return;

        const note = this.notes.find(n => n.id === this.currentNoteId);
        if (!note || note.trashed) return;

        const title = titleEl.value;
        const content = contentEl.value;
        const updatedAt = new Date().toISOString();

        const idx = this.notes.findIndex(n => n.id === this.currentNoteId);
        if (idx !== -1) this.notes[idx] = { ...this.notes[idx], title, content, updatedAt };

        try {
            await this.db.collection('users').doc(this.user.uid)
                .collection('notes').doc(this.currentNoteId)
                .update({ title, content, updatedAt });

            if (!silent) {
                const status = document.getElementById('autoSaveStatus');
                if (status) {
                    status.textContent = 'Saved';
                    setTimeout(() => { if (status) status.textContent = ''; }, 2000);
                }
                const updatedEl = document.getElementById('noteMetaUpdated');
                if (updatedEl) updatedEl.textContent = `Updated ${this.formatDate(updatedAt)}`;
            }
        } catch (err) {
            console.error('Notes: Failed to save:', err);
            if (!silent) {
                const status = document.getElementById('autoSaveStatus');
                if (status) status.textContent = 'Save failed';
            }
        }
    }

    // ─── Archive / Trash lifecycle ──────────────────────────────

    async setNoteFlags(id, flags) {
        if (!this.db || !this.user) return;
        const idx = this.notes.findIndex(n => n.id === id);
        if (idx === -1) return;

        const prev = this.notes[idx];
        const updatedAt = new Date().toISOString();
        this.notes[idx] = { ...prev, ...flags, updatedAt };

        if (this.currentNoteId === id) this.updateEditorChrome(this.notes[idx]);
        this.refresh();

        try {
            await this.db.collection('users').doc(this.user.uid)
                .collection('notes').doc(id)
                .update({ ...flags, updatedAt });
        } catch (err) {
            console.error('Notes: Failed to update note:', err);
            this.notes[idx] = prev;
            if (this.currentNoteId === id) this.updateEditorChrome(prev);
            this.refresh();
        }
    }

    toggleArchive() {
        if (!this.currentNoteId) return;
        const note = this.notes.find(n => n.id === this.currentNoteId);
        if (!note) return;
        this.closeMoreMenu();
        this.setNoteFlags(this.currentNoteId, { archived: !note.archived });
    }

    restoreNote(id = this.currentNoteId) {
        if (!id) return;
        this.setNoteFlags(id, { archived: false, trashed: false });
    }

    openDeleteModal(action = 'trash') {
        this.pendingAction = action;
        const title = document.getElementById('deleteModalTitle');
        const body = document.getElementById('deleteModalBody');
        const btn = document.getElementById('confirmDeleteBtn');

        if (action === 'purge') {
            if (title) title.textContent = 'Delete Forever';
            if (body) body.textContent = 'This note will be permanently deleted and cannot be recovered.';
            if (btn) btn.textContent = 'Delete Forever';
        } else {
            if (title) title.textContent = 'Move to Trash';
            if (body) body.textContent = 'This note will be moved to Trash. You can restore it anytime before it is permanently deleted.';
            if (btn) btn.textContent = 'Move to Trash';
        }

        document.getElementById('deleteModal').style.display = 'flex';
    }

    closeDeleteModal() {
        document.getElementById('deleteModal').style.display = 'none';
        this.pendingAction = null;
    }

    async confirmDelete() {
        if (!this.currentNoteId || !this.db || !this.user) return;
        const action = this.pendingAction;
        const id = this.currentNoteId;
        this.closeDeleteModal();

        this.currentNoteId = null;
        this.showEmptyState();

        if (action === 'purge') {
            const idx = this.notes.findIndex(n => n.id === id);
            const removed = idx !== -1 ? this.notes.splice(idx, 1)[0] : null;
            this.refresh();

            try {
                await this.db.collection('users').doc(this.user.uid)
                    .collection('notes').doc(id)
                    .delete();
            } catch (err) {
                console.error('Notes: Failed to permanently delete:', err);
                if (removed) this.notes.splice(idx, 0, removed);
                this.refresh();
            }
        } else {
            await this.setNoteFlags(id, { trashed: true, pinned: false });
        }
    }

    async copyContent() {
        const content = document.getElementById('noteContentInput')?.value;
        if (!content) return;
        try {
            await navigator.clipboard.writeText(content);
            const btn = document.getElementById('copyContentBtn');
            if (btn) {
                const icon = btn.querySelector('i');
                icon.className = 'fa-solid fa-check';
                setTimeout(() => { icon.className = 'fa-solid fa-clipboard'; }, 1500);
            }
        } catch (err) {
            console.error('Notes: Failed to copy:', err);
        }
    }

    exportNote(format = 'md') {
        if (!this.currentNoteId) return;
        const note = this.notes.find(n => n.id === this.currentNoteId);
        if (!note) return;

        const title = (note.title || this.getAutoTitle(note.content) || 'untitled')
            .replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const blob = new Blob([note.content || ''], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        this.closeMoreMenu();
    }

    // ─── More menu ──────────────────────────────────────────────

    toggleMoreMenu() {
        const dropdown = document.getElementById('moreMenuDropdown');
        const btn = document.getElementById('moreMenuBtn');
        if (!dropdown) return;
        this.moreMenuOpen = !this.moreMenuOpen;
        dropdown.classList.toggle('show', this.moreMenuOpen);
        btn?.classList.toggle('active', this.moreMenuOpen);
    }

    closeMoreMenu() {
        this.moreMenuOpen = false;
        document.getElementById('moreMenuDropdown')?.classList.remove('show');
        document.getElementById('moreMenuBtn')?.classList.remove('active');
    }

    // ─── Word Count ───────────────────────────────────────────

    updateWordCount(content) {
        const el = document.getElementById('wordCount');
        if (!el) return;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        el.textContent = words > 0 ? `${words.toLocaleString()} words` : '';
    }

    // ─── Zen Mode ─────────────────────────────────────────────

    toggleZen() {
        this.zenMode = !this.zenMode;
        const app = document.getElementById('notesApp');
        const btn = document.getElementById('zenBtn');

        if (this.zenMode) {
            app.classList.add('zen-mode');
            btn.querySelector('i').className = 'fa-solid fa-compress';
            btn.title = 'Exit zen mode';
        } else {
            app.classList.remove('zen-mode');
            btn.querySelector('i').className = 'fa-solid fa-expand';
            btn.title = 'Zen mode';
        }
    }

    // ─── Sidebar ──────────────────────────────────────────────

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        const panel = document.querySelector('.notes-sidebar');
        const btn = document.getElementById('collapseSidebarBtn');
        if (!panel) return;

        if (this.sidebarCollapsed) {
            panel.classList.add('collapsed');
            if (btn) { btn.querySelector('i').className = 'fa-solid fa-chevron-right'; btn.title = 'Expand sidebar'; }
        } else {
            panel.classList.remove('collapsed');
            if (btn) { btn.querySelector('i').className = 'fa-solid fa-chevron-left'; btn.title = 'Collapse sidebar'; }
        }
    }

    // ─── Tags ─────────────────────────────────────────────────

    renderTagChips(tags) {
        const chipsEl = document.getElementById('tagChips');
        if (!chipsEl) return;
        chipsEl.innerHTML = tags.map((tag, i) => `
            <span class="tag-chip">
                ${this.escapeHtml(tag)}
                <span class="tag-chip-remove" onclick="notesApp.removeTag(${i})">&times;</span>
            </span>
        `).join('');
    }

    async addTag(tag) {
        if (!tag || !this.currentNoteId) return;
        const note = this.notes.find(n => n.id === this.currentNoteId);
        if (!note || (note.tags || []).includes(tag)) return;
        await this.updateNoteTags([...(note.tags || []), tag]);
    }

    async removeTag(index) {
        const note = this.notes.find(n => n.id === this.currentNoteId);
        if (!note) return;
        const tags = [...(note.tags || [])];
        tags.splice(index, 1);
        await this.updateNoteTags(tags);
    }

    async updateNoteTags(tags) {
        if (!this.currentNoteId || !this.db || !this.user) return;

        const idx = this.notes.findIndex(n => n.id === this.currentNoteId);
        if (idx !== -1) this.notes[idx] = { ...this.notes[idx], tags };
        this.renderTagChips(tags);
        this.renderNavPanel();

        try {
            await this.db.collection('users').doc(this.user.uid)
                .collection('notes').doc(this.currentNoteId)
                .update({ tags, updatedAt: new Date().toISOString() });
        } catch (err) {
            console.error('Notes: Failed to update tags:', err);
        }
    }

    // ─── Pin ──────────────────────────────────────────────────

    async togglePin() {
        const note = this.notes.find(n => n.id === this.currentNoteId);
        if (!note || !this.db || !this.user || note.trashed) return;

        const pinned = !note.pinned;
        const idx = this.notes.findIndex(n => n.id === this.currentNoteId);
        if (idx !== -1) this.notes[idx].pinned = pinned;

        const pinBtn = document.getElementById('pinBtn');
        if (pinned) { pinBtn.classList.add('active'); pinBtn.title = 'Unpin note'; }
        else { pinBtn.classList.remove('active'); pinBtn.title = 'Pin note'; }

        this.renderNotesList();

        try {
            await this.db.collection('users').doc(this.user.uid)
                .collection('notes').doc(this.currentNoteId)
                .update({ pinned, updatedAt: new Date().toISOString() });
        } catch (err) {
            console.error('Notes: Failed to toggle pin:', err);
        }
    }

    // ─── Preview / Split View ─────────────────────────────────

    renderPreview(content) {
        const preview = document.getElementById('notePreview');
        if (!preview) return;
        preview.innerHTML = typeof marked !== 'undefined'
            ? marked.parse(content || '')
            : this.escapeHtml(content);
    }

    togglePreview() {
        // If split is on, turn it off first
        if (this.splitView) this.setSplitView(false);

        this.previewMode = !this.previewMode;
        const textarea = document.getElementById('noteContentInput');
        const preview = document.getElementById('notePreview');
        const btn = document.getElementById('previewToggleBtn');
        const body = document.getElementById('editorBody');

        if (this.previewMode) {
            clearTimeout(this.saveTimer);
            this.saveCurrentNote(true);
            textarea.style.display = 'none';
            preview.style.display = 'block';
            this.renderPreview(textarea.value);
            btn.querySelector('i').className = 'fa-solid fa-pen';
            btn.title = 'Edit';
        } else {
            textarea.style.display = 'block';
            preview.style.display = 'none';
            btn.querySelector('i').className = 'fa-solid fa-eye';
            btn.title = 'Preview';
            textarea.focus();
        }
        body?.classList.remove('split');
        this.syncFormatBarVisibility();
    }

    toggleSplit() {
        if (this.previewMode) this.togglePreview(); // exit preview mode first
        this.setSplitView(!this.splitView);
    }

    setSplitView(on) {
        this.splitView = on;
        const textarea = document.getElementById('noteContentInput');
        const preview = document.getElementById('notePreview');
        const body = document.getElementById('editorBody');
        const btn = document.getElementById('splitViewBtn');

        if (on) {
            textarea.style.display = 'block';
            preview.style.display = 'block';
            body?.classList.add('split');
            this.renderPreview(textarea.value);
            btn?.querySelector('i') && (btn.querySelector('i').className = 'fa-solid fa-table-columns');
            if (btn) btn.classList.add('active');
        } else {
            textarea.style.display = 'block';
            preview.style.display = 'none';
            body?.classList.remove('split');
            if (btn) {
                btn.querySelector('i').className = 'fa-solid fa-table-columns';
                btn.classList.remove('active');
            }
        }
        this.syncFormatBarVisibility();
    }

    // ─── Markdown Editing Helpers ─────────────────────────────

    handleTabKey(e) {
        e.preventDefault();
        const ta = e.target;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const value = ta.value;
        const INDENT = '  ';

        if (start === end) {
            // No selection — insert indent at cursor
            if (e.shiftKey) {
                // Unindent: remove leading spaces on current line
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineText = value.slice(lineStart, start);
                const spaces = lineText.match(/^ {1,2}/)?.[0] || '';
                if (spaces) {
                    ta.value = value.slice(0, lineStart) + value.slice(lineStart + spaces.length);
                    ta.selectionStart = ta.selectionEnd = start - spaces.length;
                }
            } else {
                ta.value = value.slice(0, start) + INDENT + value.slice(end);
                ta.selectionStart = ta.selectionEnd = start + INDENT.length;
            }
        } else {
            // Multi-line selection — block indent/unindent
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const selected = value.slice(lineStart, end);
            let newText;

            if (e.shiftKey) {
                newText = selected.replace(/^ {1,2}/gm, '');
            } else {
                newText = selected.replace(/^/gm, INDENT);
            }

            ta.value = value.slice(0, lineStart) + newText + value.slice(end);
            ta.selectionStart = lineStart;
            ta.selectionEnd = lineStart + newText.length;
        }

        this.scheduleAutoSave();
        if (this.splitView) this.renderPreview(ta.value);
    }

    handleEnterKey(e) {
        const ta = e.target;
        const pos = ta.selectionStart;
        const value = ta.value;
        const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
        const lineText = value.slice(lineStart, pos);

        // Match unordered list: "- ", "* ", "+ "
        const ulMatch = lineText.match(/^(\s*)([-*+])\s/);
        // Match ordered list: "1. ", "12. "
        const olMatch = lineText.match(/^(\s*)(\d+)\.\s/);

        if (ulMatch || olMatch) {
            const indent = ulMatch ? ulMatch[1] : olMatch[1];
            const lineContent = lineText.slice((ulMatch || olMatch)[0].length);

            if (!lineContent.trim()) {
                // Empty list item — break out of list
                e.preventDefault();
                const marker = (ulMatch || olMatch)[0];
                ta.value = value.slice(0, lineStart) + value.slice(lineStart + marker.length);
                ta.selectionStart = ta.selectionEnd = lineStart;
            } else {
                e.preventDefault();
                let nextMarker;
                if (ulMatch) {
                    nextMarker = `${indent}${ulMatch[2]} `;
                } else {
                    nextMarker = `${indent}${parseInt(olMatch[2]) + 1}. `;
                }
                const insert = '\n' + nextMarker;
                ta.value = value.slice(0, pos) + insert + value.slice(pos);
                ta.selectionStart = ta.selectionEnd = pos + insert.length;
            }

            this.scheduleAutoSave();
            if (this.splitView) this.renderPreview(ta.value);
        }
    }

    handleInlineFormat(e, wrapper) {
        e.preventDefault();
        const ta = document.getElementById('noteContentInput');
        if (!ta || ta.disabled) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = ta.value.slice(start, end);
        const insert = selected ? `${wrapper}${selected}${wrapper}` : `${wrapper}${wrapper}`;
        ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
        // Place cursor inside wrappers if no selection
        const cursorPos = selected ? start + insert.length : start + wrapper.length;
        ta.selectionStart = ta.selectionEnd = cursorPos;
        ta.focus();
        this.scheduleAutoSave();
        if (this.splitView) this.renderPreview(ta.value);
    }

    insertHeading() {
        const ta = document.getElementById('noteContentInput');
        if (!ta || ta.disabled) return;
        const value = ta.value;
        const pos = ta.selectionStart;
        const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
        let lineEnd = value.indexOf('\n', pos);
        if (lineEnd === -1) lineEnd = value.length;
        const line = value.slice(lineStart, lineEnd);
        const match = line.match(/^(#{1,3})\s/);
        let newLine;
        if (!match) newLine = '# ' + line;
        else if (match[1].length < 3) newLine = '#'.repeat(match[1].length + 1) + ' ' + line.slice(match[0].length);
        else newLine = line.slice(match[0].length);

        ta.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
        const delta = newLine.length - line.length;
        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, pos + delta);
        ta.focus();
        this.scheduleAutoSave();
        if (this.splitView) this.renderPreview(ta.value);
    }

    togglePrefixOnLines(prefixOf, makePrefix) {
        const ta = document.getElementById('noteContentInput');
        if (!ta || ta.disabled) return;
        const value = ta.value;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = value.indexOf('\n', end > start ? end - 1 : end);
        if (lineEnd === -1) lineEnd = value.length;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split('\n');

        const nonEmpty = lines.filter(l => l.trim() !== '');
        const allPrefixed = nonEmpty.length > 0 && nonEmpty.every(l => prefixOf(l));

        let counter = 1;
        const newLines = lines.map(l => {
            if (l.trim() === '') return l;
            const existing = prefixOf(l);
            if (allPrefixed) {
                return existing ? l.slice(existing.length) : l;
            }
            const p = makePrefix(counter++);
            return existing ? p + l.slice(existing.length) : p + l;
        });

        const newBlock = newLines.join('\n');
        ta.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + newBlock.length;
        ta.focus();
        this.scheduleAutoSave();
        if (this.splitView) this.renderPreview(ta.value);
    }

    toggleChecklist() {
        this.togglePrefixOnLines(
            l => (l.match(/^-\s\[[ x]\]\s/) || [])[0],
            () => '- [ ] '
        );
    }

    toggleBulletList() {
        this.togglePrefixOnLines(
            l => (l.match(/^-\s(?!\[[ x]\]\s)/) || [])[0],
            () => '- '
        );
    }

    toggleNumberedList() {
        this.togglePrefixOnLines(
            l => (l.match(/^\d+\.\s/) || [])[0],
            (i) => `${i}. `
        );
    }

    insertLink() {
        const ta = document.getElementById('noteContentInput');
        if (!ta || ta.disabled) return;
        const start = ta.selectionStart, end = ta.selectionEnd;
        const selected = ta.value.slice(start, end);
        const insert = selected ? `[${selected}](url)` : `[text](url)`;
        ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);

        const urlIdx = start + insert.lastIndexOf('url');
        ta.selectionStart = urlIdx;
        ta.selectionEnd = urlIdx + 3;
        ta.focus();
        this.scheduleAutoSave();
        if (this.splitView) this.renderPreview(ta.value);
    }

    insertCodeFormat() {
        const ta = document.getElementById('noteContentInput');
        if (!ta || ta.disabled) return;
        const start = ta.selectionStart, end = ta.selectionEnd;
        const selected = ta.value.slice(start, end);
        const wrapper = selected.includes('\n') ? '```' : '`';
        const insert = selected ? `${wrapper}${selected}${wrapper}` : `${wrapper}${wrapper}`;
        ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
        const cursorPos = selected ? start + insert.length : start + wrapper.length;
        ta.selectionStart = ta.selectionEnd = cursorPos;
        ta.focus();
        this.scheduleAutoSave();
        if (this.splitView) this.renderPreview(ta.value);
    }

    // ─── Auth ─────────────────────────────────────────────────

    async signIn() {
        if (!this.auth) return;
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await this.auth.signInWithPopup(provider);
        } catch (err) {
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
                try { await this.auth.signInWithRedirect(provider); } catch (e) { console.error('Notes: Sign-in failed:', e); }
            }
        }
    }

    async signOut() {
        if (!this.auth) return;
        this.stopSync();
        await this.auth.signOut();
    }

    // ─── Utilities ────────────────────────────────────────────

    formatDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const diff = Date.now() - d.getTime();
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
        return d.toLocaleDateString();
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ─── Events ───────────────────────────────────────────────

    bindEvents() {
        document.getElementById('signInBtn')?.addEventListener('click', () => this.signIn());
        document.getElementById('signOutBtn')?.addEventListener('click', () => this.signOut());
        document.getElementById('newNoteBtn')?.addEventListener('click', () => this.newNote());
        document.getElementById('emptyStateNewBtn')?.addEventListener('click', () => this.newNote());

        document.getElementById('searchInput')?.addEventListener('input', e => {
            this.searchQuery = e.target.value;
            this.renderNotesList();
        });

        document.getElementById('noteContentInput')?.addEventListener('input', () => {
            this.scheduleAutoSave();
            const content = document.getElementById('noteContentInput').value;
            this.updateWordCount(content);
            if (this.previewMode || this.splitView) this.renderPreview(content);
        });

        document.getElementById('noteContentInput')?.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                this.handleTabKey(e);
            } else if (e.key === 'Enter') {
                this.handleEnterKey(e);
            } else if (e.ctrlKey && e.key === 'b') {
                this.handleInlineFormat(e, '**');
            } else if (e.ctrlKey && e.key === 'i') {
                this.handleInlineFormat(e, '_');
            }
        });

        document.getElementById('noteTitleInput')?.addEventListener('input', () => {
            this.scheduleAutoSave();
        });

        document.getElementById('previewToggleBtn')?.addEventListener('click', () => this.togglePreview());
        document.getElementById('splitViewBtn')?.addEventListener('click', () => this.toggleSplit());
        document.getElementById('pinBtn')?.addEventListener('click', () => this.togglePin());
        document.getElementById('zenBtn')?.addEventListener('click', () => this.toggleZen());
        document.getElementById('collapseSidebarBtn')?.addEventListener('click', () => this.toggleSidebar());

        document.getElementById('moreMenuBtn')?.addEventListener('click', e => {
            e.stopPropagation();
            this.toggleMoreMenu();
        });
        document.getElementById('duplicateBtn')?.addEventListener('click', () => { this.duplicateNote(); this.closeMoreMenu(); });
        document.getElementById('copyContentBtn')?.addEventListener('click', () => { this.copyContent(); this.closeMoreMenu(); });
        document.getElementById('exportMdBtn')?.addEventListener('click', () => this.exportNote('md'));
        document.getElementById('exportTxtBtn')?.addEventListener('click', () => this.exportNote('txt'));
        document.getElementById('archiveNoteBtn')?.addEventListener('click', () => this.toggleArchive());
        document.getElementById('deleteNoteBtn')?.addEventListener('click', () => { this.closeMoreMenu(); this.openDeleteModal('trash'); });

        document.getElementById('restoreBtn')?.addEventListener('click', () => this.restoreNote());
        document.getElementById('purgeBtn')?.addEventListener('click', () => this.openDeleteModal('purge'));
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => this.confirmDelete());

        document.querySelectorAll('.fmt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.cmd;
                if (cmd === 'heading') this.insertHeading();
                else if (cmd === 'checklist') this.toggleChecklist();
                else if (cmd === 'bullet') this.toggleBulletList();
                else if (cmd === 'numbered') this.toggleNumberedList();
                else if (cmd === 'bold') this.handleInlineFormat({ preventDefault() {} }, '**');
                else if (cmd === 'italic') this.handleInlineFormat({ preventDefault() {} }, '_');
                else if (cmd === 'code') this.insertCodeFormat();
                else if (cmd === 'link') this.insertLink();
            });
        });

        document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
        });

        document.getElementById('navTagsList')?.addEventListener('click', e => {
            const btn = e.target.closest('.nav-tag-item');
            if (btn) this.setFilter('tag', btn.dataset.tag);
        });

        document.getElementById('tagInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = e.target.value.trim();
                if (val) { this.addTag(val); e.target.value = ''; }
            }
        });

        document.getElementById('deleteModal')?.addEventListener('click', e => {
            if (e.target === document.getElementById('deleteModal')) this.closeDeleteModal();
        });

        // Shortcuts tooltip toggle — position via fixed coords so it always
        // appears directly below the button regardless of toolbar wrapping.
        document.getElementById('shortcutsBtn')?.addEventListener('click', e => {
            e.stopPropagation();
            const tooltip = document.getElementById('shortcutsTooltip');
            if (!tooltip) return;
            const wasShown = tooltip.classList.contains('show');
            tooltip.classList.remove('show');
            if (!wasShown) {
                const btn  = e.currentTarget.getBoundingClientRect();
                const tipW = 240;
                // Left-align tooltip with button; slide left only if it clips the right edge
                let left = btn.left;
                if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
                left = Math.max(8, left);
                tooltip.style.top  = (btn.bottom + 4) + 'px';
                tooltip.style.left = left + 'px';
                tooltip.classList.add('show');
            }
        });

        // Close more-menu + shortcuts on outside click
        document.addEventListener('click', e => {
            if (this.moreMenuOpen &&
                !document.getElementById('moreMenuBtn')?.contains(e.target) &&
                !document.getElementById('moreMenuDropdown')?.contains(e.target)) {
                this.closeMoreMenu();
            }
            if (!document.getElementById('shortcutsBtn')?.contains(e.target)) {
                document.getElementById('shortcutsTooltip')?.classList.remove('show');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', e => {
            const inInput = document.activeElement?.tagName === 'INPUT' ||
                            document.activeElement?.tagName === 'TEXTAREA';

            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                clearTimeout(this.saveTimer);
                this.saveCurrentNote();
            }

            if (e.ctrlKey && e.key === 'n' && !inInput) {
                e.preventDefault();
                this.newNote();
            }

            if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !inInput)) {
                e.preventDefault();
                document.getElementById('searchInput')?.focus();
            }

            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !inInput) {
                e.preventDefault();
                this.navigateList(e.key === 'ArrowDown' ? 'down' : 'up');
            }

            if (e.key === 'Escape') {
                const tooltip = document.getElementById('shortcutsTooltip');
                if (tooltip?.classList.contains('show')) {
                    tooltip.classList.remove('show');
                } else if (this.moreMenuOpen) {
                    this.closeMoreMenu();
                } else if (this.zenMode) {
                    this.toggleZen();
                } else if (document.getElementById('deleteModal').style.display === 'flex') {
                    this.closeDeleteModal();
                } else if (this.currentNoteId && !inInput) {
                    this.currentNoteId = null;
                    this.renderNotesList();
                    this.showEmptyState();
                }
            }
        });

        // Warn on unsaved changes before leaving
        window.addEventListener('beforeunload', e => {
            if (this.saveTimer) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }
}

const notesApp = new NotesApp();
document.addEventListener('DOMContentLoaded', () => notesApp.init());
