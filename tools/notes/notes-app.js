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
        this.exportDropdownOpen = false;
        this.pendingAction = null; // 'archive' | 'delete'
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

        this.db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
                console.warn('Notes: Persistence error:', err);
            }
        });

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

                    this.renderNotesList();
                    this.setSyncStatus('synced');

                    if (this.currentNoteId) {
                        const exists = this.notes.find(n => n.id === this.currentNoteId && !n.archived);
                        if (!exists) {
                            this.currentNoteId = null;
                            this.showEmptyState();
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

    // ─── Notes List ───────────────────────────────────────────

    getSortedFiltered() {
        const query = this.searchQuery.toLowerCase();

        let filtered = this.notes.filter(n => !n.archived);

        if (query) {
            filtered = filtered.filter(n =>
                (n.title || '').toLowerCase().includes(query) ||
                (n.content || '').toLowerCase().includes(query) ||
                (n.tags || []).some(t => t.toLowerCase().includes(query))
            );
        }

        filtered.sort((a, b) => {
            const aTitle = a.title || this.getAutoTitle(a.content) || 'Untitled';
            const bTitle = b.title || this.getAutoTitle(b.content) || 'Untitled';
            return aTitle.localeCompare(bTitle);
        });

        const pinned = filtered.filter(n => n.pinned);
        const unpinned = filtered.filter(n => !n.pinned);
        return [...pinned, ...unpinned];
    }

    getAutoTitle(content) {
        return (content || '')
            .split('\n')[0]
            .replace(/^#{1,6}\s*/, '')
            .trim()
            .slice(0, 50);
    }

    renderNotesList() {
        const list = document.getElementById('notesList');
        const sorted = this.getSortedFiltered();

        const totalActive = this.notes.filter(n => !n.archived).length;
        const countEl = document.getElementById('notesCount');
        if (countEl) countEl.textContent = `Notes${totalActive > 0 ? ` (${totalActive})` : ''}`;

        if (sorted.length === 0) {
            list.innerHTML = `<div class="notes-list-empty">${
                this.searchQuery
                    ? 'No notes match your search.'
                    : 'No notes yet.<br>Click <strong>New Note</strong> to get started.'
            }</div>`;
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
                            ${note.pinned ? '<i class="fa-solid fa-thumbtack pin-indicator" title="Pinned"></i>' : ''}
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

        const pinBtn = document.getElementById('pinBtn');
        if (note.pinned) {
            pinBtn.classList.add('active');
            pinBtn.title = 'Unpin note';
        } else {
            pinBtn.classList.remove('active');
            pinBtn.title = 'Pin note';
        }

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

        document.getElementById('noteMetaCreated').textContent =
            note.createdAt ? `Created ${this.formatDate(note.createdAt)}` : '';
        document.getElementById('noteMetaUpdated').textContent =
            note.updatedAt ? `Updated ${this.formatDate(note.updatedAt)}` : '';
        document.getElementById('autoSaveStatus').textContent = '';

        const charWarning = document.getElementById('charLimitWarning');
        if (charWarning) charWarning.style.display = 'none';
    }

    // ─── CRUD ─────────────────────────────────────────────────

    async newNote() {
        if (!this.db || !this.user) return;

        const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const note = { id, title: '', content: '', tags: [], pinned: false, archived: false, createdAt: now, updatedAt: now };

        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        this.currentNoteId = id;
        this.notes.unshift(note);
        this.renderNotesList();
        this.showEditor(note);

        setTimeout(() => document.getElementById('noteTitleInput')?.focus(), 50);

        try {
            await this.db.collection('users').doc(this.user.uid).collection('notes').doc(id).set(note);
        } catch (err) {
            console.error('Notes: Failed to create note:', err);
            this.notes = this.notes.filter(n => n.id !== id);
            this.currentNoteId = null;
            this.renderNotesList();
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
        const duplicate = { ...rest, id, title: note.title ? `${note.title} (copy)` : '', pinned: false, archived: false, createdAt: now, updatedAt: now };

        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }

        this.currentNoteId = id;
        this.notes.unshift(duplicate);
        this.renderNotesList();
        this.showEditor(duplicate);

        try {
            await this.db.collection('users').doc(this.user.uid).collection('notes').doc(id).set(duplicate);
        } catch (err) {
            console.error('Notes: Failed to duplicate:', err);
            this.notes = this.notes.filter(n => n.id !== id);
            this.currentNoteId = null;
            this.renderNotesList();
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
        if (!note) return;

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

    openDeleteModal(action = 'archive') {
        this.pendingAction = action;
        const title = document.getElementById('deleteModalTitle');
        const body = document.getElementById('deleteModalBody');
        const btn = document.getElementById('confirmDeleteBtn');

        if (action === 'delete') {
            if (title) title.textContent = 'Delete Note';
            if (body) body.textContent = 'This note will be permanently deleted and cannot be recovered.';
            if (btn) btn.textContent = 'Delete';
        } else {
            if (title) title.textContent = 'Archive Note';
            if (body) body.textContent = 'This note will be archived and hidden from your list.';
            if (btn) btn.textContent = 'Archive';
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
        this.closeDeleteModal();

        const id = this.currentNoteId;
        this.currentNoteId = null;
        this.showEmptyState();

        if (action === 'delete') {
            // Hard delete
            const idx = this.notes.findIndex(n => n.id === id);
            const removed = idx !== -1 ? this.notes.splice(idx, 1)[0] : null;
            this.renderNotesList();

            try {
                await this.db.collection('users').doc(this.user.uid)
                    .collection('notes').doc(id)
                    .delete();
            } catch (err) {
                console.error('Notes: Failed to delete:', err);
                if (removed) { this.notes.splice(idx, 0, removed); }
                this.renderNotesList();
            }
        } else {
            // Soft archive
            const idx = this.notes.findIndex(n => n.id === id);
            if (idx !== -1) this.notes[idx].archived = true;
            this.renderNotesList();

            try {
                await this.db.collection('users').doc(this.user.uid)
                    .collection('notes').doc(id)
                    .update({ archived: true, updatedAt: new Date().toISOString() });
            } catch (err) {
                console.error('Notes: Failed to archive:', err);
                const i = this.notes.findIndex(n => n.id === id);
                if (i !== -1) this.notes[i].archived = false;
                this.renderNotesList();
            }
        }
    }

    async copyContent() {
        const content = document.getElementById('noteContentInput')?.value;
        if (!content) return;
        try {
            await navigator.clipboard.writeText(content);
            const btn = document.getElementById('copyContentBtn');
            if (btn) {
                btn.querySelector('i').className = 'fa-solid fa-check';
                setTimeout(() => { btn.querySelector('i').className = 'fa-solid fa-clipboard'; }, 1500);
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
        this.closeExportDropdown();
    }

    toggleExportDropdown() {
        const dropdown = document.getElementById('exportDropdown');
        const btn = document.getElementById('exportBtn');
        if (!dropdown || !btn) return;

        this.exportDropdownOpen = !this.exportDropdownOpen;

        if (this.exportDropdownOpen) {
            const rect = btn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    }

    closeExportDropdown() {
        this.exportDropdownOpen = false;
        const dropdown = document.getElementById('exportDropdown');
        if (dropdown) dropdown.style.display = 'none';
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
        const panel = document.querySelector('.notes-list-panel');
        const btn = document.getElementById('collapseSidebarBtn');

        if (this.sidebarCollapsed) {
            panel.classList.add('collapsed');
            btn.querySelector('i').className = 'fa-solid fa-chevron-right';
            btn.title = 'Expand sidebar';
        } else {
            panel.classList.remove('collapsed');
            btn.querySelector('i').className = 'fa-solid fa-chevron-left';
            btn.title = 'Collapse sidebar';
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
        if (!note || !this.db || !this.user) return;

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
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = ta.value.slice(start, end);
        const insert = selected ? `${wrapper}${selected}${wrapper}` : `${wrapper}${wrapper}`;
        ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
        // Place cursor inside wrappers if no selection
        const cursorPos = selected ? start + insert.length : start + wrapper.length;
        ta.selectionStart = ta.selectionEnd = cursorPos;
        this.scheduleAutoSave();
        if (this.splitView) this.renderPreview(ta.value);
    }

    // ─── Auth ─────────────────────────────────────────────────

    signIn() {
        if (!this.auth) return;
        const client = google.accounts.oauth2.initTokenClient({
            client_id: '899987293812-hl8rr4l02pl0ssgpiet60onst7iemr7p.apps.googleusercontent.com',
            scope: 'openid email profile',
            prompt: 'select_account',
            callback: async (tokenResponse) => {
                if (tokenResponse.error) {
                    console.error('Notes: Sign-in failed:', tokenResponse.error);
                    return;
                }
                try {
                    const credential = firebase.auth.GoogleAuthProvider.credential(null, tokenResponse.access_token);
                    await this.auth.signInWithCredential(credential);
                } catch (err) {
                    console.error('Notes: Sign-in failed:', err);
                }
            }
        });
        client.requestAccessToken();
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
        document.getElementById('duplicateBtn')?.addEventListener('click', () => this.duplicateNote());
        document.getElementById('copyContentBtn')?.addEventListener('click', () => this.copyContent());
        document.getElementById('zenBtn')?.addEventListener('click', () => this.toggleZen());
        document.getElementById('collapseSidebarBtn')?.addEventListener('click', () => this.toggleSidebar());
        document.getElementById('archiveNoteBtn')?.addEventListener('click', () => this.openDeleteModal('archive'));
        document.getElementById('deleteNoteBtn')?.addEventListener('click', () => this.openDeleteModal('delete'));
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => this.confirmDelete());

        document.getElementById('exportBtn')?.addEventListener('click', () => this.toggleExportDropdown());
        document.getElementById('exportMdBtn')?.addEventListener('click', () => this.exportNote('md'));
        document.getElementById('exportTxtBtn')?.addEventListener('click', () => this.exportNote('txt'));

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

        // Close export dropdown + shortcuts on outside click
        document.addEventListener('click', e => {
            if (this.exportDropdownOpen &&
                !document.getElementById('exportBtn')?.contains(e.target) &&
                !document.getElementById('exportDropdown')?.contains(e.target)) {
                this.closeExportDropdown();
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
                } else if (this.exportDropdownOpen) {
                    this.closeExportDropdown();
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
