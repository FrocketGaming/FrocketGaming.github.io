/**
 * Phase Board local store.
 *
 * The board is normally backed by Firestore. This file gives it the same little
 * collection API over IndexedDB so the tool is usable before sign-in and while
 * offline:
 *
 *   store.collection('projects').doc(id).set(data)
 *   store.collection('projects').doc(id).update(patch)
 *   store.collection('projects').onSnapshot(cb)
 *   store.batch().set(ref, data).commit()
 *
 * It also records deletions (tombstones) so a project deleted while signed out
 * is not resurrected by the next merge with the cloud board.
 *
 * Data is kept in memory and written behind the scenes; a write error only
 * affects persistence, never the current session.
 */
(function () {
    'use strict';

    var DB_NAME = 'QoLPhaseBoardDB';
    var DB_VERSION = 1;
    var STORE_NAME = 'state';
    var STATE_KEY = 'board';
    var FALLBACK_KEY = 'qol-phase-board-local';

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    // Firestore accepts dotted paths in update(); mirror that for local writes.
    function applyPatch(base, patch) {
        var next = clone(base) || {};
        Object.keys(patch || {}).forEach(function (key) {
            var parts = key.split('.');
            var node = next;
            for (var i = 0; i < parts.length - 1; i++) {
                if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
                node = node[parts[i]];
            }
            node[parts[parts.length - 1]] = clone(patch[key]);
        });
        return next;
    }

    function snapshotOf(map) {
        return {
            docs: Object.keys(map).map(function (id) {
                return { id: id, data: function () { return clone(map[id]); } };
            }),
            metadata: { fromCache: false }
        };
    }

    class LocalBoardStore {
        constructor() {
            this.projects = {};
            this.flows = {};
            this.tombstones = [];
            // Ids last seen in the cloud, and when that mirror ran. A local
            // project that the cloud no longer has was deleted elsewhere unless
            // it was edited after this timestamp (then the edit wins).
            this.known = { projects: {}, flows: {} };
            this.syncedAt = 0;
            this.listeners = { projects: new Set(), flows: new Set() };
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
                console.warn('Phase Board: local storage is unavailable; this session will not persist.', err);
                this.error = 'Local storage is unavailable in this browser, so projects will disappear when this tab closes.';
            }
            if (!state) state = this.readFallback();
            if (state) this.applyState(state);
            this.ready = true;
            // If a subscriber attached while the database was opening, give it
            // the records that are now loaded.
            this.emit('projects');
            this.emit('flows');
        }

        applyState(state) {
            if (!state || typeof state !== 'object') return;
            this.projects = state.projects && typeof state.projects === 'object' ? state.projects : {};
            this.flows = state.flows && typeof state.flows === 'object' ? state.flows : {};
            this.tombstones = Array.isArray(state.tombstones) ? state.tombstones : [];
            this.known = {
                projects: state.known && state.known.projects ? state.known.projects : {},
                flows: state.known && state.known.flows ? state.known.flows : {}
            };
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
                projects: clone(this.projects),
                flows: clone(this.flows),
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
                        self.error = 'Local storage is unavailable in this browser, so projects will disappear when this tab closes.';
                    }
                }
            }).catch(function (err) {
                console.warn('Phase Board: could not save locally.', err);
            });
            return this.writeChain;
        }

        collection(kind) {
            var store = this;
            return {
                onSnapshot: function (callback) {
                    store.listeners[kind].add(callback);
                    callback(store.snapshot(kind));
                    return function () { store.listeners[kind].delete(callback); };
                },
                doc: function (id) {
                    return {
                        __kind: kind,
                        __id: id,
                        set: function (data) { return store.set(kind, id, data); },
                        update: function (patch) { return store.update(kind, id, patch); },
                        delete: function () { return store.remove(kind, id); }
                    };
                },
                get: async function () { return store.snapshot(kind); }
            };
        }

        snapshot(kind) {
            return snapshotOf(this[kind]);
        }

        emit(kind) {
            var snap = snapshotOf(this[kind]);
            this.listeners[kind].forEach(function (callback) {
                try { callback(snap); } catch (err) { console.error('Phase Board: local listener failed', err); }
            });
        }

        setRaw(kind, id, data) {
            this[kind][id] = clone(data);
            this.tombstones = this.tombstones.filter(function (t) {
                return !(t.kind === kind && t.id === id);
            });
        }

        updateRaw(kind, id, patch) {
            this[kind][id] = applyPatch(this[kind][id] || {}, patch);
            this.tombstones = this.tombstones.filter(function (t) {
                return !(t.kind === kind && t.id === id);
            });
        }

        set(kind, id, data) {
            this.setRaw(kind, id, data);
            this.emit(kind);
            return this.persist();
        }

        update(kind, id, patch) {
            this.updateRaw(kind, id, patch);
            this.emit(kind);
            return this.persist();
        }

        remove(kind, id) {
            delete this[kind][id];
            delete this.known[kind][id];
            this.tombstones.push({ kind: kind, id: id, at: Date.now() });
            this.emit(kind);
            return this.persist();
        }

        // Drop a local record without recording a deletion: used when the cloud
        // says this project was already removed on another device.
        drop(kind, id) {
            delete this[kind][id];
            delete this.known[kind][id];
            this.emit(kind);
            return this.persist();
        }

        replace(kind, map) {
            var known = {};
            this[kind] = clone(map || {});
            Object.keys(this[kind]).forEach(id => { known[id] = true; });
            this.known[kind] = known;
            this.syncedAt = Date.now();
            this.emit(kind);
            return this.persist();
        }

        clearTombstones() {
            this.tombstones = [];
            return this.persist();
        }

        batch() {
            var store = this;
            var ops = [];
            var kinds = new Set();
            return {
                set: function (ref, data) {
                    ops.push({ type: 'set', ref: ref, data: data });
                    kinds.add(ref.__kind);
                    return this;
                },
                update: function (ref, patch) {
                    ops.push({ type: 'update', ref: ref, patch: patch });
                    kinds.add(ref.__kind);
                    return this;
                },
                commit: function () {
                    ops.forEach(function (op) {
                        if (op.type === 'set') store.setRaw(op.ref.__kind, op.ref.__id, op.data);
                        else store.updateRaw(op.ref.__kind, op.ref.__id, op.patch);
                    });
                    kinds.forEach(function (kind) { store.emit(kind); });
                    return store.persist();
                }
            };
        }
    }

    window.LocalBoardStore = LocalBoardStore;
})();
