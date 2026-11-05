/**
 * Notes local store.
 *
 * Notes are normally stored in Firestore under users/{uid}/notes. This gives
 * the app the same small collection API over IndexedDB so notes are readable
 * and writable before sign-in and while offline:
 *
 *   store.collection('notes').doc(id).set(note)
 *   store.collection('notes').doc(id).update(patch)
 *   store.collection('notes').onSnapshot(cb)
 *
 * Deletions are recorded as tombstones so a note purged while signed out is
 * not brought back by the next merge with the cloud.
 */
(function () {
    'use strict';

    var DB_NAME = 'QoLNotesDB';
    var DB_VERSION = 1;
    var STORE_NAME = 'state';
    var STATE_KEY = 'notes';
    var FALLBACK_KEY = 'qol-notes-local';

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function byUpdatedAtDesc(a, b) {
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    }

    function snapshotOf(map) {
        var entries = Object.keys(map).map(function (id) {
            return { id: id, note: map[id] };
        }).sort(function (a, b) { return byUpdatedAtDesc(a.note, b.note); });
        var docs = entries.map(function (entry) {
            return { id: entry.id, data: function () { return clone(entry.note); } };
        });
        return {
            empty: docs.length === 0,
            docs: docs,
            forEach: function (callback) { docs.forEach(callback); },
            metadata: { fromCache: false }
        };
    }

    class LocalNotesStore {
        constructor() {
            this.notes = {};
            this.tombstones = [];
            this.known = {};
            this.syncedAt = 0;
            this.listeners = new Set();
            this.ready = false;
            this.error = '';
            this.dbPromise = null;
            this.writeChain = Promise.resolve();
        }

        async load() {
            if (this.ready) return;
            var state = null;
            try {
                var db = await this.open();
                state = await this.read(db);
            } catch (err) {
                console.warn('Notes: local storage is unavailable; this session will not persist.', err);
                this.error = 'Local storage is unavailable in this browser, so notes will disappear when this tab closes.';
            }
            if (!state) state = this.readFallback();
            if (state) this.applyState(state);
            this.ready = true;
            this.emit();
        }

        applyState(state) {
            if (!state || typeof state !== 'object') return;
            this.notes = state.notes && typeof state.notes === 'object' ? state.notes : {};
            this.tombstones = Array.isArray(state.tombstones) ? state.tombstones : [];
            this.known = state.known && typeof state.known === 'object' ? state.known : {};
            this.syncedAt = Number(state.syncedAt) || 0;
        }

        open() {
            if (this.dbPromise) return this.dbPromise;
            this.dbPromise = new Promise(function (resolve, reject) {
                if (!('indexedDB' in window)) {
                    reject(new Error('IndexedDB unavailable'));
                    return;
                }
                var request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = function () {
                    var db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    }
                };
                request.onsuccess = function () { resolve(request.result); };
                request.onerror = function () { reject(request.error); };
            });
            return this.dbPromise;
        }

        read(db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var request = tx.objectStore(STORE_NAME).get(STATE_KEY);
                request.onsuccess = function () { resolve(request.result || null); };
                request.onerror = function () { reject(request.error); };
            });
        }

        writeState(db, state) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(state);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function () { reject(tx.error); };
            });
        }

        readFallback() {
            try {
                var raw = localStorage.getItem(FALLBACK_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (e) { return null; }
        }

        persist() {
            var state = {
                key: STATE_KEY,
                notes: clone(this.notes),
                tombstones: clone(this.tombstones),
                known: clone(this.known),
                syncedAt: this.syncedAt,
                savedAt: Date.now()
            };
            var self = this;
            this.writeChain = this.writeChain.then(async function () {
                try {
                    var db = await self.open();
                    await self.writeState(db, state);
                    self.error = '';
                } catch (err) {
                    try {
                        localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
                    } catch (fallbackError) {
                        self.error = 'Local storage is unavailable in this browser, so notes will disappear when this tab closes.';
                    }
                }
            }).catch(function (err) {
                console.warn('Notes: could not save locally.', err);
            });
            return this.writeChain;
        }

        collection() {
            var store = this;
            return {
                onSnapshot: function (callback) {
                    store.listeners.add(callback);
                    callback(store.snapshot());
                    return function () { store.listeners.delete(callback); };
                },
                doc: function (id) {
                    return {
                        set: function (data) { return store.set(id, data); },
                        update: function (patch) { return store.update(id, patch); },
                        delete: function () { return store.remove(id); }
                    };
                },
                get: async function () { return store.snapshot(); }
            };
        }

        snapshot() {
            return snapshotOf(this.notes);
        }

        emit() {
            var snap = this.snapshot();
            this.listeners.forEach(function (callback) {
                try { callback(snap); } catch (err) { console.error('Notes: local listener failed', err); }
            });
        }

        setRaw(id, data) {
            this.notes[id] = clone(data);
            this.tombstones = this.tombstones.filter(function (stone) { return stone.id !== id; });
        }

        updateRaw(id, patch) {
            this.notes[id] = Object.assign({}, this.notes[id] || {}, clone(patch));
            this.tombstones = this.tombstones.filter(function (stone) { return stone.id !== id; });
        }

        set(id, data) {
            this.setRaw(id, data);
            this.emit();
            return this.persist();
        }

        update(id, patch) {
            this.updateRaw(id, patch);
            this.emit();
            return this.persist();
        }

        remove(id) {
            delete this.notes[id];
            delete this.known[id];
            this.tombstones.push({ id: id, at: Date.now() });
            this.emit();
            return this.persist();
        }

        // Drop a local note without recording a deletion (the cloud removed it
        // on another device and this copy was not edited since the last sync).
        drop(id) {
            delete this.notes[id];
            delete this.known[id];
            this.emit();
            return this.persist();
        }

        replace(map) {
            var known = {};
            this.notes = clone(map || {});
            Object.keys(this.notes).forEach(function (id) { known[id] = true; });
            this.known = known;
            this.syncedAt = Date.now();
            this.emit();
            return this.persist();
        }

        clearTombstones() {
            this.tombstones = [];
            return this.persist();
        }
    }

    window.LocalNotesStore = LocalNotesStore;
})();
