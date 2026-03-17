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
        this.searchQuery = '';
    }

    init() {
        this.initFirebase();
        this.bindEvents();
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

        // Handle redirect sign-in result (mobile fallback)
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

                    // If current note was deleted remotely, clear the editor
                    if (this.currentNoteId) {
                        const exists = this.notes.find(n => n.id === this.currentNoteId);
                        if (!exists) {
                            this.currentNoteId = null;
                            this.showEmptyState();
                        }
                    }

                    // Show editor after note creation (currentNoteId set before snapshot fires)
                    if (this.currentNoteId) {
                        const note = this.notes.find(n => n.id === this.currentNoteId);
                        if (note && document.getElementById('noteEditor').style.display === 'none') {
                            this.showEditor(note);
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

        if (!status) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        dot.className = 'sync-status-dot';

        if (status === 'syncing') {
            dot.classList.add('syncing');
            label.textContent = 'Syncing...';
        } else if (status === 'synced') {
            dot.classList.add('synced');
            label.textContent = 'Synced';
        } else if (status === 'error') {
            dot.classList.add('error');
            label.textContent = 'Sync error';
        }
    }

    // ─── Notes List ───────────────────────────────────────────

    renderNotesList() {
        const list = document.getElementById('notesList');
        const query = this.searchQuery.toLowerCase();

        let filtered = this.notes;
        if (query) {
            filtered = this.notes.filter(n =>
                (n.title || '').toLowerCase().includes(query) ||
                (n.content || '').toLowerCase().includes(query) ||
                (n.tags || []).some(t => t.toLowerCase().includes(query))
            );
        }

        // Pinned notes first, then by updatedAt (Firestore already orders by updatedAt desc)
        const pinned = filtered.filter(n => n.pinned);
        const unpinned = filtered.filter(n => !n.pinned);
        const sorted = [...pinned, ...unpinned];

        if (sorted.length === 0) {
            list.innerHTML = `<div class="notes-list-empty">${
                query
                    ? 'No notes match your search.'
                    : 'No notes yet.<br>Click <strong>New Note</strong> to get started.'
            }</div>`;
            return;
        }

        list.innerHTML = sorted.map(note => {
            const isActive = note.id === this.currentNoteId;
            // Strip common markdown syntax for preview
            const preview = (note.content || '')
                .replace(/#{1,6}\s/g, '')
                .replace(/[*_~`>]/g, '')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .trim()
                .slice(0, 100);

            const date = this.formatDate(note.updatedAt);
            const tags = (note.tags || []).slice(0, 3)
                .map(t => `<span class="note-tag-chip">${this.escapeHtml(t)}</span>`)
                .join('');

            return `
                <div class="note-list-item ${isActive ? 'active' : ''}" onclick="notesApp.selectNote('${note.id}')">
                    <div class="note-list-item-header">
                        <span class="note-list-title">${this.escapeHtml(note.title || 'Untitled')}</span>
                        ${note.pinned ? '<i class="fa-solid fa-thumbtack pin-indicator" title="Pinned"></i>' : ''}
                    </div>
                    <div class="note-list-preview">${
                        preview ? this.escapeHtml(preview) : '<em>Empty note</em>'
                    }</div>
                    <div class="note-list-footer">
                        <span class="note-list-date">${date}</span>
                        <div class="note-list-tags">${tags}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectNote(id) {
        if (this.currentNoteId && this.currentNoteId !== id) {
            clearTimeout(this.saveTimer);
            this.saveCurrentNote(true);
        }

        this.currentNoteId = id;
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        this.renderNotesList();
        this.showEditor(note);
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

        // Pin button state
        const pinBtn = document.getElementById('pinBtn');
        if (note.pinned) {
            pinBtn.classList.add('active');
            pinBtn.querySelector('i').className = 'fa-solid fa-thumbtack';
            pinBtn.title = 'Unpin note';
        } else {
            pinBtn.classList.remove('active');
            pinBtn.querySelector('i').className = 'fa-regular fa-thumbtack';
            pinBtn.title = 'Pin note';
        }

        // Reset preview mode when switching notes
        if (this.previewMode) {
            this.previewMode = false;
            document.getElementById('noteContentInput').style.display = 'block';
            document.getElementById('notePreview').style.display = 'none';
            const previewBtn = document.getElementById('previewToggleBtn');
            previewBtn.querySelector('i').className = 'fa-solid fa-eye';
            previewBtn.title = 'Preview';
        }

        this.renderTagChips(note.tags || []);

        document.getElementById('noteMetaCreated').textContent =
            note.createdAt ? `Created ${this.formatDate(note.createdAt)}` : '';
        document.getElementById('noteMetaUpdated').textContent =
            note.updatedAt ? `Updated ${this.formatDate(note.updatedAt)}` : '';
        document.getElementById('autoSaveStatus').textContent = '';
    }

    // ─── CRUD ─────────────────────────────────────────────────

    async newNote() {
        if (!this.db || !this.user) return;

        const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const note = {
            id,
            title: '',
            content: '',
            tags: [],
            pinned: false,
            createdAt: now,
            updatedAt: now
        };

        try {
            this.currentNoteId = id;
            await this.db
                .collection('users').doc(this.user.uid)
                .collection('notes').doc(id).set(note);

            // onSnapshot will handle rendering; focus title once editor is visible
            setTimeout(() => {
                document.getElementById('noteTitleInput')?.focus();
            }, 150);
        } catch (err) {
            console.error('Notes: Failed to create note:', err);
            this.currentNoteId = null;
        }
    }

    scheduleAutoSave() {
        clearTimeout(this.saveTimer);
        const status = document.getElementById('autoSaveStatus');
        if (status) status.textContent = 'Unsaved changes...';
        this.saveTimer = setTimeout(() => this.saveCurrentNote(), 1500);
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

        // Optimistically update local state
        const idx = this.notes.findIndex(n => n.id === this.currentNoteId);
        if (idx !== -1) {
            this.notes[idx] = { ...this.notes[idx], title, content, updatedAt };
        }

        try {
            await this.db
                .collection('users').doc(this.user.uid)
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

    openDeleteModal() {
        document.getElementById('deleteModal').style.display = 'flex';
    }

    closeDeleteModal() {
        document.getElementById('deleteModal').style.display = 'none';
    }

    async confirmDelete() {
        if (!this.currentNoteId || !this.db || !this.user) return;
        this.closeDeleteModal();

        const id = this.currentNoteId;
        this.currentNoteId = null;
        this.showEmptyState();

        try {
            await this.db
                .collection('users').doc(this.user.uid)
                .collection('notes').doc(id).delete();
        } catch (err) {
            console.error('Notes: Failed to delete:', err);
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
        if (!note) return;
        if ((note.tags || []).includes(tag)) return;
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
            await this.db
                .collection('users').doc(this.user.uid)
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
        if (pinned) {
            pinBtn.classList.add('active');
            pinBtn.querySelector('i').className = 'fa-solid fa-thumbtack';
            pinBtn.title = 'Unpin note';
        } else {
            pinBtn.classList.remove('active');
            pinBtn.querySelector('i').className = 'fa-regular fa-thumbtack';
            pinBtn.title = 'Pin note';
        }

        this.renderNotesList();

        try {
            await this.db
                .collection('users').doc(this.user.uid)
                .collection('notes').doc(this.currentNoteId)
                .update({ pinned, updatedAt: new Date().toISOString() });
        } catch (err) {
            console.error('Notes: Failed to toggle pin:', err);
        }
    }

    // ─── Preview ──────────────────────────────────────────────

    togglePreview() {
        this.previewMode = !this.previewMode;
        const textarea = document.getElementById('noteContentInput');
        const preview = document.getElementById('notePreview');
        const btn = document.getElementById('previewToggleBtn');

        if (this.previewMode) {
            clearTimeout(this.saveTimer);
            this.saveCurrentNote(true);

            const content = textarea.value;
            textarea.style.display = 'none';
            preview.style.display = 'block';
            preview.innerHTML = typeof marked !== 'undefined'
                ? marked.parse(content || '')
                : this.escapeHtml(content);

            btn.querySelector('i').className = 'fa-solid fa-pen';
            btn.title = 'Edit';
        } else {
            textarea.style.display = 'block';
            preview.style.display = 'none';
            btn.querySelector('i').className = 'fa-solid fa-eye';
            btn.title = 'Preview';
            textarea.focus();
        }
    }

    // ─── Auth ─────────────────────────────────────────────────

    async signIn() {
        if (!this.auth) return;
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await this.auth.signInWithPopup(provider);
        } catch (err) {
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
                try {
                    await this.auth.signInWithRedirect(provider);
                } catch (redirectErr) {
                    console.error('Notes: Sign-in failed:', redirectErr);
                }
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
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        });

        document.getElementById('noteTitleInput')?.addEventListener('input', () => {
            this.scheduleAutoSave();
        });

        document.getElementById('previewToggleBtn')?.addEventListener('click', () => this.togglePreview());
        document.getElementById('pinBtn')?.addEventListener('click', () => this.togglePin());
        document.getElementById('deleteNoteBtn')?.addEventListener('click', () => this.openDeleteModal());
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => this.confirmDelete());

        document.getElementById('tagInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = e.target.value.trim();
                if (val) {
                    this.addTag(val);
                    e.target.value = '';
                }
            }
        });

        // Close modal on overlay click
        document.getElementById('deleteModal')?.addEventListener('click', e => {
            if (e.target === document.getElementById('deleteModal')) {
                this.closeDeleteModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                clearTimeout(this.saveTimer);
                this.saveCurrentNote();
            }
            if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
                const active = document.activeElement;
                const inInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
                if (!inInput) {
                    e.preventDefault();
                    this.newNote();
                }
            }
        });
    }
}

const notesApp = new NotesApp();
document.addEventListener('DOMContentLoaded', () => notesApp.init());
