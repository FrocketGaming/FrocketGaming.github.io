/**
 * FirebaseSync - Cloud sync for Snippets via Firebase Auth + Firestore
 *
 * Provides optional Google sign-in and real-time snippet syncing.
 * Non-logged-in users keep the current local-only experience.
 *
 * Firestore data model:
 *   users/{userId}/snippets/{snippetId}
 *   users/{userId}/snippetTypes/{typeId}
 */
class FirebaseSync {
    static app = null;
    static auth = null;
    static db = null;
    static user = null;
    static unsubSnippets = null;
    static unsubTypes = null;
    static unsubVersions = null;
    static unsubTodos = null;
    static onAuthChange = null;
    static onSyncStatus = null;
    static onRemoteSnippets = null;
    static onRemoteTypes = null;
    static onRemoteVersions = null;
    static onRemoteTodos = null;
    static initialized = false;
    static mergeInProgress = false;

    /**
     * Initialize Firebase and set up auth listener
     * @param {Object} callbacks
     * @param {Function} callbacks.onAuthChange - (user|null) called on sign-in/sign-out
     * @param {Function} callbacks.onSyncStatus - (status: 'syncing'|'synced'|'error'|'offline'|null) called on sync state changes
     * @param {Function} callbacks.onRemoteSnippets - (snippets[]) called when remote snippets change
     * @param {Function} callbacks.onRemoteTypes - (types[]) called when remote types change
     */
    static init(callbacks = {}) {
        if (this.initialized) return;

        // Check that Firebase SDK and config are available
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
            console.warn('FirebaseSync: Firebase SDK or config not loaded, sync disabled');
            return;
        }

        // Check for placeholder config
        if (firebaseConfig.apiKey === 'YOUR_API_KEY') {
            console.warn('FirebaseSync: Firebase config not set up yet, sync disabled');
            return;
        }

        try {
            this.app = firebase.initializeApp(firebaseConfig);
            this.auth = firebase.auth();
            this.db = firebase.firestore();

            // Enable offline persistence
            this.db.enablePersistence({ synchronizeTabs: true }).catch(err => {
                if (err.code === 'failed-precondition') {
                    console.warn('FirebaseSync: Multiple tabs open, persistence only works in one');
                } else if (err.code === 'unimplemented') {
                    console.warn('FirebaseSync: Browser does not support persistence');
                }
            });

            this.onAuthChange = callbacks.onAuthChange || null;
            this.onSyncStatus = callbacks.onSyncStatus || null;
            this.onRemoteSnippets = callbacks.onRemoteSnippets || null;
            this.onRemoteTypes = callbacks.onRemoteTypes || null;
            this.onRemoteVersions = callbacks.onRemoteVersions || null;
            this.onRemoteTodos = callbacks.onRemoteTodos || null;

            // Process pending redirect sign-in result
            this.auth.getRedirectResult().catch(() => {});

            // Listen for auth state changes
            this.auth.onAuthStateChanged(user => {
                this.user = user;
                if (this.onAuthChange) {
                    this.onAuthChange(user);
                }
                if (user) {
                    this.startRealtimeSync();
                } else {
                    this.stopRealtimeSync();
                    this.setSyncStatus(null);
                }
            });

            this.initialized = true;
            console.log('FirebaseSync initialized');
        } catch (error) {
            console.error('FirebaseSync: Failed to initialize:', error);
        }
    }

    /**
     * Sign in with Google redirect (compatible with privacy-focused browsers)
     */
    static async signInWithGoogle() {
        if (!this.auth) return;

        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await this.auth.signInWithRedirect(provider);
        } catch (error) {
            console.error('FirebaseSync: Sign-in failed:', error);
            throw error;
        }
    }

    /**
     * Sign out
     */
    static async signOut() {
        if (!this.auth) return;
        try {
            this.stopRealtimeSync();
            await this.auth.signOut();
        } catch (error) {
            console.error('FirebaseSync: Sign-out failed:', error);
        }
    }

    /**
     * Check if user is currently signed in
     */
    static isSignedIn() {
        return !!this.user;
    }

    /**
     * Get current user info
     */
    static getUserInfo() {
        if (!this.user) return null;
        return {
            uid: this.user.uid,
            displayName: this.user.displayName,
            email: this.user.email,
            photoURL: this.user.photoURL
        };
    }

    // ─── Sync Status ───────────────────────────────────────────

    /**
     * Update sync status and notify callback
     * @param {'syncing'|'synced'|'error'|'offline'|null} status
     */
    static setSyncStatus(status) {
        if (this.onSyncStatus) {
            this.onSyncStatus(status);
        }
    }

    // ─── Real-time Listeners ───────────────────────────────────

    /**
     * Start listening to Firestore for real-time changes
     */
    static startRealtimeSync() {
        if (!this.db || !this.user) return;
        this.stopRealtimeSync();

        const userId = this.user.uid;

        // Listen to snippets collection
        this.unsubSnippets = this.db
            .collection('users').doc(userId)
            .collection('snippets')
            .onSnapshot(
                snapshot => {
                    if (this.mergeInProgress) return;
                    const snippets = [];
                    snapshot.forEach(doc => {
                        snippets.push({ ...doc.data(), _firestoreId: doc.id });
                    });
                    if (this.onRemoteSnippets) {
                        this.onRemoteSnippets(snippets);
                    }
                    this.setSyncStatus('synced');
                },
                error => {
                    console.error('FirebaseSync: Snippets listener error:', error);
                    this.setSyncStatus('error');
                }
            );

        // Listen to snippetVersions collection
        this.unsubVersions = this.db
            .collection('users').doc(userId)
            .collection('snippetVersions')
            .onSnapshot(
                snapshot => {
                    if (this.mergeInProgress) return;
                    const versions = [];
                    snapshot.forEach(doc => {
                        versions.push({ ...doc.data(), _firestoreId: doc.id });
                    });
                    if (this.onRemoteVersions) {
                        this.onRemoteVersions(versions);
                    }
                },
                error => {
                    console.error('FirebaseSync: SnippetVersions listener error:', error);
                }
            );

        // Listen to snippetTypes collection
        this.unsubTypes = this.db
            .collection('users').doc(userId)
            .collection('snippetTypes')
            .onSnapshot(
                snapshot => {
                    if (this.mergeInProgress) return;
                    const types = [];
                    snapshot.forEach(doc => {
                        types.push({ ...doc.data(), _firestoreId: doc.id });
                    });
                    if (this.onRemoteTypes) {
                        this.onRemoteTypes(types);
                    }
                    this.setSyncStatus('synced');
                },
                error => {
                    console.error('FirebaseSync: SnippetTypes listener error:', error);
                    this.setSyncStatus('error');
                }
            );

        // Listen to todos collection
        if (this.onRemoteTodos) {
            this.unsubTodos = this.db
                .collection('users').doc(userId)
                .collection('todos')
                .onSnapshot(
                    snapshot => {
                        if (this.mergeInProgress) return;
                        const todos = [];
                        snapshot.forEach(doc => {
                            todos.push({ ...doc.data(), _firestoreId: doc.id });
                        });
                        this.onRemoteTodos(todos);
                        this.setSyncStatus('synced');
                    },
                    error => {
                        console.error('FirebaseSync: Todos listener error:', error);
                        this.setSyncStatus('error');
                    }
                );
        }
    }

    /**
     * Stop listening to Firestore
     */
    static stopRealtimeSync() {
        if (this.unsubSnippets) {
            this.unsubSnippets();
            this.unsubSnippets = null;
        }
        if (this.unsubTypes) {
            this.unsubTypes();
            this.unsubTypes = null;
        }
        if (this.unsubVersions) {
            this.unsubVersions();
            this.unsubVersions = null;
        }
        if (this.unsubTodos) {
            this.unsubTodos();
            this.unsubTodos = null;
        }
    }

    // ─── CRUD Operations ───────────────────────────────────────

    /**
     * Helper to get the user's Firestore collection reference
     */
    static _userCollection(collectionName) {
        if (!this.db || !this.user) return null;
        return this.db.collection('users').doc(this.user.uid).collection(collectionName);
    }

    /**
     * Push a snippet to Firestore (create or update)
     * @param {Object} snippet - The snippet object (must have id)
     */
    static async pushSnippet(snippet) {
        const col = this._userCollection('snippets');
        if (!col) return;

        this.setSyncStatus('syncing');
        try {
            const docId = String(snippet.id);
            const data = { ...snippet, _syncedAt: new Date().toISOString() };
            await col.doc(docId).set(data);
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('FirebaseSync: Failed to push snippet:', error);
            this.setSyncStatus('error');
        }
    }

    /**
     * Push a snippet type to Firestore (create or update)
     * @param {Object} snippetType - The type object (must have id)
     */
    static async pushSnippetType(snippetType) {
        const col = this._userCollection('snippetTypes');
        if (!col) return;

        this.setSyncStatus('syncing');
        try {
            const docId = String(snippetType.id);
            const data = { ...snippetType, _syncedAt: new Date().toISOString() };
            await col.doc(docId).set(data);
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('FirebaseSync: Failed to push snippet type:', error);
            this.setSyncStatus('error');
        }
    }

    /**
     * Delete a snippet from Firestore
     * @param {number|string} snippetId
     */
    static async deleteSnippet(snippetId) {
        const col = this._userCollection('snippets');
        if (!col) return;

        this.setSyncStatus('syncing');
        try {
            await col.doc(String(snippetId)).delete();
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('FirebaseSync: Failed to delete snippet:', error);
            this.setSyncStatus('error');
        }
    }

    /**
     * Delete a snippet type from Firestore
     * @param {number|string} typeId
     */
    static async deleteSnippetType(typeId) {
        const col = this._userCollection('snippetTypes');
        if (!col) return;

        this.setSyncStatus('syncing');
        try {
            await col.doc(String(typeId)).delete();
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('FirebaseSync: Failed to delete snippet type:', error);
            this.setSyncStatus('error');
        }
    }

    /**
     * Push a snippet version to Firestore
     * @param {Object} version - The version object (must have id)
     */
    static async pushSnippetVersion(version) {
        const col = this._userCollection('snippetVersions');
        if (!col) return;

        try {
            const docId = String(version.id);
            const data = { ...version, _syncedAt: new Date().toISOString() };
            await col.doc(docId).set(data);
        } catch (error) {
            console.error('FirebaseSync: Failed to push snippet version:', error);
        }
    }

    /**
     * Delete a snippet version from Firestore
     * @param {number|string} versionId
     */
    static async deleteSnippetVersion(versionId) {
        const col = this._userCollection('snippetVersions');
        if (!col) return;

        try {
            await col.doc(String(versionId)).delete();
        } catch (error) {
            console.error('FirebaseSync: Failed to delete snippet version:', error);
        }
    }

    /**
     * Delete all versions for a snippet from Firestore
     * @param {number|string} snippetId
     */
    static async deleteSnippetVersionsBySnippetId(snippetId) {
        const col = this._userCollection('snippetVersions');
        if (!col) return;

        try {
            const snap = await col.where('snippetId', '==', snippetId).get();
            const batch = this.db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } catch (error) {
            console.error('FirebaseSync: Failed to delete snippet versions:', error);
        }
    }

    // ─── Todo CRUD ────────────────────────────────────────────

    /**
     * Push a todo to Firestore (create or update)
     * @param {Object} todo - The todo object (must have id)
     */
    static async pushTodo(todo) {
        const col = this._userCollection('todos');
        if (!col) return;

        this.setSyncStatus('syncing');
        try {
            const docId = String(todo.id);
            const data = { ...todo, _syncedAt: new Date().toISOString() };
            await col.doc(docId).set(data);
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('FirebaseSync: Failed to push todo:', error);
            this.setSyncStatus('error');
        }
    }

    /**
     * Delete a todo from Firestore
     * @param {number|string} todoId
     */
    static async deleteTodo(todoId) {
        const col = this._userCollection('todos');
        if (!col) return;

        this.setSyncStatus('syncing');
        try {
            await col.doc(String(todoId)).delete();
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('FirebaseSync: Failed to delete todo:', error);
            this.setSyncStatus('error');
        }
    }

    /**
     * Check if this is the first time todos have been merged for this user
     */
    static needsTodosMerge() {
        if (!this.user) return false;
        return !localStorage.getItem(`firebase_merged_todos_${this.user.uid}`);
    }

    static markTodosMergeComplete() {
        if (!this.user) return;
        localStorage.setItem(`firebase_merged_todos_${this.user.uid}`, 'true');
    }

    /**
     * Merge local todos with cloud todos (union, local wins on ID conflict).
     * Returns the merged array and pushes it to Firestore.
     * @param {Array} localTodos
     * @returns {Promise<Array>} Merged todos (internal fields stripped)
     */
    static async mergeOnFirstLoginTodos(localTodos) {
        if (!this.db || !this.user) return localTodos;

        this.mergeInProgress = true;
        this.setSyncStatus('syncing');

        try {
            const userId = this.user.uid;
            const cloudSnap = await this.db
                .collection('users').doc(userId)
                .collection('todos').get();

            const cloudTodos = [];
            cloudSnap.forEach(doc => cloudTodos.push(doc.data()));

            // Union merge: cloud first, local wins on ID conflict
            const mergedMap = new Map();
            for (const t of cloudTodos) {
                mergedMap.set(t.id, t);
            }
            for (const t of localTodos) {
                mergedMap.set(t.id, t);
            }

            const merged = Array.from(mergedMap.values());

            // Push merged set to Firestore
            const batch = this.db.batch();
            const todosCol = this.db.collection('users').doc(userId).collection('todos');
            for (const t of merged) {
                batch.set(todosCol.doc(String(t.id)), { ...t, _syncedAt: new Date().toISOString() });
            }
            await batch.commit();

            this.markTodosMergeComplete();
            this.setSyncStatus('synced');
            this.mergeInProgress = false;

            return merged.map(t => {
                const { _syncedAt, _firestoreId, ...rest } = t;
                return rest;
            });
        } catch (error) {
            console.error('FirebaseSync: Todo merge failed:', error);
            this.setSyncStatus('error');
            this.mergeInProgress = false;
            return localTodos;
        }
    }

    // ─── Sharing ──────────────────────────────────────────────

    /**
     * Share a snippet by writing it to the public /shared collection
     * @param {Object} snippet - The snippet to share
     * @param {number} expiryHours - Hours until the link expires
     * @returns {Promise<string>} The generated share ID
     */
    static async shareSnippet(snippet, expiryHours) {
        if (!this.db || !this.user) {
            throw new Error('Must be signed in to share');
        }

        const shareId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const doc = {
            snippet: {
                name: snippet.name,
                type: snippet.type,
                extension: snippet.extension,
                description: snippet.description || '',
                content: snippet.content
            },
            sharedBy: this.user.uid,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + expiryHours * 3600000).toISOString()
        };

        await this.db.collection('shared').doc(shareId).set(doc);
        return shareId;
    }

    /**
     * Fetch a shared snippet (no auth required — public read)
     * @param {string} shareId
     * @returns {Promise<{snippet, createdAt, expiresAt}|{expired: true}|null>}
     */
    static async fetchSharedSnippet(shareId) {
        if (!this.db) {
            throw new Error('Firebase not initialized');
        }

        const docSnap = await this.db.collection('shared').doc(shareId).get();
        if (!docSnap.exists) return null;

        const data = docSnap.data();
        if (new Date(data.expiresAt) < new Date()) {
            return { expired: true };
        }

        return {
            snippet: data.snippet,
            createdAt: data.createdAt,
            expiresAt: data.expiresAt
        };
    }

    // ─── First-Login Merge ─────────────────────────────────────

    /**
     * Check if this is the user's first login (no merge done yet)
     */
    static needsMerge() {
        if (!this.user) return false;
        return !localStorage.getItem(`firebase_merged_${this.user.uid}`);
    }

    /**
     * Mark merge as completed for this user
     */
    static markMergeComplete() {
        if (!this.user) return;
        localStorage.setItem(`firebase_merged_${this.user.uid}`, 'true');
    }

    /**
     * Merge local data with cloud data using last-write-wins by updatedAt.
     * Returns the merged result without writing to IndexedDB (caller handles that).
     *
     * @param {Array} localSnippets - Current local snippets
     * @param {Array} localTypes - Current local snippet types
     * @returns {Promise<{snippets: Array, types: Array}>} Merged data
     */
    static async mergeOnFirstLogin(localSnippets, localTypes, localVersions = []) {
        if (!this.db || !this.user) {
            return { snippets: localSnippets, types: localTypes, versions: localVersions };
        }

        this.mergeInProgress = true;
        this.setSyncStatus('syncing');

        try {
            const userId = this.user.uid;

            // Fetch cloud data
            const cloudSnippetsSnap = await this.db
                .collection('users').doc(userId)
                .collection('snippets').get();
            const cloudTypesSnap = await this.db
                .collection('users').doc(userId)
                .collection('snippetTypes').get();

            const cloudSnippets = [];
            cloudSnippetsSnap.forEach(doc => cloudSnippets.push(doc.data()));

            const cloudTypes = [];
            cloudTypesSnap.forEach(doc => cloudTypes.push(doc.data()));

            // Merge snippets: index by id, last-write-wins by updatedAt
            const mergedSnippetsMap = new Map();

            for (const s of cloudSnippets) {
                mergedSnippetsMap.set(s.id, s);
            }

            for (const s of localSnippets) {
                const existing = mergedSnippetsMap.get(s.id);
                if (!existing) {
                    mergedSnippetsMap.set(s.id, s);
                } else {
                    // Last-write-wins
                    const localTime = new Date(s.updatedAt || 0).getTime();
                    const cloudTime = new Date(existing.updatedAt || 0).getTime();
                    if (localTime >= cloudTime) {
                        mergedSnippetsMap.set(s.id, s);
                    }
                }
            }

            // Merge types: index by id, prefer local name if conflict
            const mergedTypesMap = new Map();

            for (const t of cloudTypes) {
                mergedTypesMap.set(t.id, t);
            }

            for (const t of localTypes) {
                mergedTypesMap.set(t.id, t);
            }

            // Merge versions: union by id
            const cloudVersionsSnap = await this.db
                .collection('users').doc(userId)
                .collection('snippetVersions').get();
            const cloudVersions = [];
            cloudVersionsSnap.forEach(doc => cloudVersions.push(doc.data()));

            const mergedVersionsMap = new Map();
            for (const v of cloudVersions) {
                mergedVersionsMap.set(v.id, v);
            }
            for (const v of localVersions) {
                if (!mergedVersionsMap.has(v.id)) {
                    mergedVersionsMap.set(v.id, v);
                }
            }

            const mergedSnippets = Array.from(mergedSnippetsMap.values());
            const mergedTypes = Array.from(mergedTypesMap.values());
            const mergedVersions = Array.from(mergedVersionsMap.values());

            // Push all merged data to Firestore
            const batch = this.db.batch();
            const snippetsCol = this.db.collection('users').doc(userId).collection('snippets');
            const typesCol = this.db.collection('users').doc(userId).collection('snippetTypes');
            const versionsCol = this.db.collection('users').doc(userId).collection('snippetVersions');

            for (const s of mergedSnippets) {
                const docRef = snippetsCol.doc(String(s.id));
                batch.set(docRef, { ...s, _syncedAt: new Date().toISOString() });
            }

            for (const t of mergedTypes) {
                const docRef = typesCol.doc(String(t.id));
                batch.set(docRef, { ...t, _syncedAt: new Date().toISOString() });
            }

            for (const v of mergedVersions) {
                const docRef = versionsCol.doc(String(v.id));
                batch.set(docRef, { ...v, _syncedAt: new Date().toISOString() });
            }

            await batch.commit();

            this.markMergeComplete();
            this.setSyncStatus('synced');
            this.mergeInProgress = false;

            // Clean internal fields before returning
            const cleanSnippets = mergedSnippets.map(s => {
                const { _syncedAt, _firestoreId, ...rest } = s;
                return rest;
            });
            const cleanTypes = mergedTypes.map(t => {
                const { _syncedAt, _firestoreId, ...rest } = t;
                return rest;
            });

            const cleanVersions = mergedVersions.map(v => {
                const { _syncedAt, _firestoreId, ...rest } = v;
                return rest;
            });

            return { snippets: cleanSnippets, types: cleanTypes, versions: cleanVersions };
        } catch (error) {
            console.error('FirebaseSync: Merge failed:', error);
            this.setSyncStatus('error');
            this.mergeInProgress = false;
            return { snippets: localSnippets, types: localTypes, versions: localVersions };
        }
    }
}
