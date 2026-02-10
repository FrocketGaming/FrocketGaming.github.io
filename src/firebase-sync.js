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
    static onAuthChange = null;
    static onSyncStatus = null;
    static onRemoteSnippets = null;
    static onRemoteTypes = null;
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
     * Sign in with Google popup (falls back to redirect on mobile)
     */
    static async signInWithGoogle() {
        if (!this.auth) return;

        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await this.auth.signInWithPopup(provider);
        } catch (error) {
            if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
                // Fallback to redirect for mobile / popup blockers
                try {
                    await this.auth.signInWithRedirect(provider);
                } catch (redirectError) {
                    console.error('FirebaseSync: Sign-in redirect failed:', redirectError);
                }
            } else {
                console.error('FirebaseSync: Sign-in failed:', error);
                throw error;
            }
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
    static async mergeOnFirstLogin(localSnippets, localTypes) {
        if (!this.db || !this.user) {
            return { snippets: localSnippets, types: localTypes };
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

            const mergedSnippets = Array.from(mergedSnippetsMap.values());
            const mergedTypes = Array.from(mergedTypesMap.values());

            // Push all merged data to Firestore
            const batch = this.db.batch();
            const snippetsCol = this.db.collection('users').doc(userId).collection('snippets');
            const typesCol = this.db.collection('users').doc(userId).collection('snippetTypes');

            for (const s of mergedSnippets) {
                const docRef = snippetsCol.doc(String(s.id));
                batch.set(docRef, { ...s, _syncedAt: new Date().toISOString() });
            }

            for (const t of mergedTypes) {
                const docRef = typesCol.doc(String(t.id));
                batch.set(docRef, { ...t, _syncedAt: new Date().toISOString() });
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

            return { snippets: cleanSnippets, types: cleanTypes };
        } catch (error) {
            console.error('FirebaseSync: Merge failed:', error);
            this.setSyncStatus('error');
            this.mergeInProgress = false;
            return { snippets: localSnippets, types: localTypes };
        }
    }
}
