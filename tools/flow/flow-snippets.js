/**
 * P6 - Snippets integration and the local working copies.
 *
 * Flow.store: every chart has its own localStorage slot, so tabs never overwrite each
 * other's work: `flow-chart:s:<snippetId>` for a chart linked to a snippet and
 * `flow-chart:d:<draftId>` for an unsaved draft. Opening another chart never deletes
 * anything: the old slot stays and shows up under Open > Unsaved work.
 *
 * Tabs showing the same slot are merged element by element, like Excalidraw: the slot keeps
 * the pure JSON Canvas text in `canvas` and, beside it, `meta` = per-element versions
 * ({ 'n:<id>' | 'e:<id>' | 'on' | 'oe' | 'root' | 'title': [version, nonce, deleted, time] }).
 * Each tab diffs its document against the last state it synced ("shadow") to bump versions,
 * then reconciles with the slot / the other tab's write: per key the higher [version, nonce]
 * wins, deletions are explicit tombstones (deleted = 1), never inferred from absence. The merge
 * is commutative, so every tab converges on the same document and no add is lost. Remote
 * changes are applied in place and the undo stack (and an open transaction) is rebased, so
 * Ctrl+Z / Esc only ever undo this tab's own edits.
 *
 * Flow.snippets: a chart saved to Snippets is an ordinary record in the IndexedDB
 * "snippets" store with extension "canvas" and the JSON Canvas text as content. Re-saving
 * records a version snapshot exactly as Snippets does. The linked record is re-checked on
 * focus and on a BroadcastChannel ping (reload when clean, "Changed elsewhere" when dirty,
 * draft when deleted, "Snippet content invalid" when its JSON is broken).
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => S.escapeHtml(String(s == null ? '' : s));
    /** updatedAt is an ISO string from Flow/Snippets saves but a number (Date.now()) after tag/favourite edits. */
    const ts = (v) => typeof v === 'number' ? v : (Date.parse(v) || 0);

    // ═════════════════════════════════════════════════════════════════════════
    //  Working copies (localStorage, one slot per chart)
    // ═════════════════════════════════════════════════════════════════════════

    const store = Flow.store = {};
    const PREFIX = 'flow-chart:';
    const LEGACY_KEY = 'flow-autosave-v1';
    const TAB_KEY = 'flow-tab-slot';          // sessionStorage: this tab's slot, survives reload
    const KEEP_CLEAN = 20;                    // clean (already saved) slots kept for their view
    const DAY = 86400000;
    const TOMBSTONE_TTL = 30 * DAY;

    store.PREFIX = PREFIX;
    store.newDraftId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    store.keyFor = (st) => st.snippetId ? PREFIX + 's:' + st.snippetId : (st.draftId ? PREFIX + 'd:' + st.draftId : null);
    store.snippetKey = (id) => PREFIX + 's:' + id;
    store.currentKey = () => store.keyFor(Flow.app.state());

    function lsJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
    function isEmptyCanvas(text) {
        try { const d = JSON.parse(text); return !(d.nodes && d.nodes.length) && !(d.edges && d.edges.length); } catch (e) { return false; }
    }
    /** A slot's record (never a moved-away tombstone), or null. */
    store.read = function (key) {
        const r = key && lsJSON(key);
        return r && !r.movedTo && typeof r.canvas === 'string' ? r : null;
    };
    /** Follow "moved to" pointers (a draft that got saved, a deleted snippet kept as a draft). */
    store.resolve = function (key) {
        for (let i = 0; key && i < 5; i++) {
            const r = lsJSON(key);
            if (!r) return null;
            if (r.movedTo) { key = r.movedTo; continue; }
            return typeof r.canvas === 'string' ? { key, rec: r } : null;
        }
        return null;
    };
    store.remove = (key) => { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } };
    store.keys = function () {
        const out = [];
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k); } } catch (e) { /* ignore */ }
        return out;
    };
    /** Every real slot, newest first. */
    store.list = function () {
        return store.keys().map(k => { const r = store.read(k); return r ? Object.assign({ key: k }, r) : null; })
            .filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    };
    /** Work that exists only in this browser: a non-empty draft, or edits not yet saved to the snippet. */
    store.isUnsaved = (r) => r.snippetId ? r.canvas !== r.savedContent : !isEmptyCanvas(r.canvas);
    /** Unsaved slots other than the one this tab shows. */
    store.unsavedElsewhere = function () {
        const cur = store.currentKey();
        return store.list().filter(r => r.key !== cur && store.isUnsaved(r));
    };

    function setItem(key, text) {
        try { localStorage.setItem(key, text); return true; }
        catch (e) {
            prune(true);
            try { localStorage.setItem(key, text); return true; }
            catch (e2) { console.warn('Flow: autosave failed', e2); core.toast('Browser storage is full: this chart is not being kept locally. Save it to Snippets.', 'error'); return false; }
        }
    }

    // ── Element-level versions and merge ────────────────────────────────────

    // This tab's sync state for the slot it shows: the versions it knows, and the element
    // JSON as of its last sync (to tell what changed locally since).
    let sync = { key: null, meta: {}, shadow: new Map() };
    // Lamport clock: a local change is stamped max(everything seen) + 1, so versions only grow
    // and a change made after seeing another tab's always beats it (clock skew doesn't matter).
    let clock = 0;
    const TAB_ID = Math.random().toString(36).slice(2, 8);
    let seq = 0;
    const nonce = () => TAB_ID + '.' + (++seq).toString(36);
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const appReady = () => !!(Flow.app && typeof Flow.app.state === 'function' && Flow.app.state());
    /** Define (not assign) a property, so a literal "__proto__" key stays an ordinary own key. */
    const put = (o, k, v) => { Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true }); };
    /**
     * Merge identity of each element: its id, plus the occurrence number when the same id
     * appears more than once (duplicate ids are legal input and every copy must survive).
     */
    const OCC = '\u0001';
    function keysOf(arr) {
        const seen = new Map();
        return arr.map(o => {
            const id = String(o && o.id);
            const n = seen.get(id) || 0;
            seen.set(id, n + 1);
            return n ? id + OCC + n : id;
        });
    }
    // The document only needs re-diffing after it changed (or during a drag, which mutates
    // without events until it commits).
    let docDirty = true;
    core.on('change', () => { docDirty = true; });
    core.on('load', () => { docDirty = true; });
    let stats = { writes: 0, skipped: 0, merges: 0, republish: 0, bc: 0 };
    store.stats = () => Object.assign({}, stats);

    function parseDoc(text) {
        let d;
        try { d = JSON.parse(text); } catch (e) { d = null; }
        if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
        if (!Array.isArray(d.nodes)) d.nodes = [];
        if (!Array.isArray(d.edges)) d.edges = [];
        return d;
    }
    function rootJSON(doc) {
        const o = {};
        for (const k of Object.keys(doc)) if (k !== 'nodes' && k !== 'edges') put(o, k, doc[k]);
        return JSON.stringify(o);
    }
    /** key -> comparable string for everything that is versioned. */
    function snapshotOf(doc, title) {
        const m = new Map();
        const nk = keysOf(doc.nodes), ek = keysOf(doc.edges);
        doc.nodes.forEach((n, i) => m.set('n:' + nk[i], JSON.stringify(n)));
        doc.edges.forEach((e, i) => m.set('e:' + ek[i], JSON.stringify(e)));
        m.set('on', JSON.stringify(nk));
        m.set('oe', JSON.stringify(ek));
        m.set('root', rootJSON(doc));
        m.set('title', title || '');
        return m;
    }
    /** Highest version in a meta, fed into the Lamport clock. */
    function see(meta) {
        for (const k of Object.keys(meta || {})) { const v = meta[k] && meta[k][0]; if (v > clock) clock = v; }
    }
    /** New version for key k. The order registers ('on'/'oe') carry their key list, so the merged
     *  order is a function of the versions alone and every tab computes the same one. */
    function bump(meta, k, del, now, value) {
        const p = meta[k];
        const v = Math.max(p ? p[0] : 0, clock) + 1;
        clock = v;
        meta[k] = [v, nonce(), del ? 1 : 0, now];
        if ((k === 'on' || k === 'oe') && typeof value === 'string') { let list; try { list = JSON.parse(value); } catch (e) { list = []; } meta[k].push(Array.isArray(list) ? list : []); }
    }
    /** Record this tab's edits since the last sync as new versions (deletions become tombstones). */
    function stamp() {
        const title = Flow.app.state().title || '';
        if (!docDirty && !core.inTransaction() && sync.shadow.get('title') === title) return false;
        docDirty = false;
        const cur = snapshotOf(core.doc, title);
        const now = Date.now();
        let changed = false;
        for (const [k, j] of cur) if (sync.shadow.get(k) !== j) { bump(sync.meta, k, 0, now, j); changed = true; }
        for (const k of sync.shadow.keys()) if (!cur.has(k)) { bump(sync.meta, k, 1, now); changed = true; }
        sync.shadow = cur;
        return changed;
    }
    function cmp(a, b) {
        if (!a) return b ? -1 : 0;
        if (!b) return 1;
        return (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
    }
    /** Does `a` hold any version strictly newer than `b`? */
    function hasNewer(a, b) {
        a = a || {}; b = b || {};
        for (const k of Object.keys(a)) if (cmp(a[k], b[k]) > 0) return true;
        return false;
    }
    function elemMap(doc) {
        const m = new Map();
        const nk = keysOf(doc.nodes), ek = keysOf(doc.edges);
        doc.nodes.forEach((n, i) => m.set('n:' + nk[i], n));
        doc.edges.forEach((e, i) => m.set('e:' + ek[i], e));
        return m;
    }
    /** Deterministic, commutative, idempotent merge of two { doc, meta, title } states. */
    function reconcile(A, B) {
        const Am = elemMap(A.doc), Bm = elemMap(B.doc);
        const meta = {}, fromA = {};
        for (const k of new Set([...Object.keys(A.meta), ...Object.keys(B.meta)])) {
            const a = cmp(A.meta[k], B.meta[k]) >= 0;
            meta[k] = a ? A.meta[k] : B.meta[k];
            fromA[k] = a;
        }
        const liveContent = (k) => {
            if (!meta[k] || meta[k][2]) return null;
            return (fromA[k] ? Am.get(k) : Bm.get(k)) || Am.get(k) || Bm.get(k) || null;
        };
        const ordered = (prefix, orderKey) => {
            const live = new Map();
            for (const k of Object.keys(meta)) if (k.startsWith(prefix)) { const c = liveContent(k); if (c) live.set(k.slice(prefix.length), c); }
            const base = (meta[orderKey] && meta[orderKey][4]) || [];
            const out = [], seen = new Set();
            for (const id of base) if (live.has(id) && !seen.has(id)) { out.push(live.get(id)); seen.add(id); }
            // Elements the order list doesn't know yet (concurrent adds) go on top in the order
            // they were made: by (Lamport version, tab).
            [...live.keys()].filter(id => !seen.has(id))
                .sort((x, y) => cmp(meta[prefix + x], meta[prefix + y]))
                .forEach(id => out.push(live.get(id)));
            return out;
        };
        // Edges are never dropped for a missing card: an edge whose card is deleted (or was
        // never there) keeps its content, dangling, until the card returns or it is deleted.
        const nodes = ordered('n:', 'on');
        const edges = ordered('e:', 'oe');
        const rootSrc = fromA.root !== false ? A.doc : B.doc;
        const doc = {};
        for (const k of Object.keys(rootSrc)) put(doc, k, k === 'nodes' ? nodes : k === 'edges' ? edges : clone(rootSrc[k]));
        if (!doc.nodes) doc.nodes = nodes;
        if (!doc.edges) doc.edges = edges;
        return { doc, meta, title: fromA.title !== false ? A.title : B.title };
    }

    /** The newest undo step replaced the whole document (open / import / reload): mark it. */
    function markBoundary() { const u = core._undo || []; if (u.length) u[u.length - 1].flowBoundary = true; }
    store.markBoundary = markBoundary;
    /** Remove whole-document history (open/import) once the chart is shared or saved. */
    function dropBoundary() {
        const u = core._undo || [];
        for (let j = u.length - 1; j >= 0; j--) {
            if (u[j] && u[j].flowBoundary) { u.splice(0, j + 1); core.emit('history'); return; }
        }
    }

    /** Make core.doc equal to `M.doc` in place (object identity kept), and rebase history. */
    function applyMerged(M) {
        const before = snapshotOf(core.doc, Flow.app.state().title);
        const after = snapshotOf(M.doc, M.title);
        const changes = [];
        const target = elemMap(M.doc);
        for (const k of new Set([...before.keys(), ...after.keys()])) {
            if (!((k[0] === 'n' || k[0] === 'e') && k[1] === ':') || before.get(k) === after.get(k)) continue;
            // What the other tab changed, field by field, so undo here keeps it.
            const was = before.has(k) ? JSON.parse(before.get(k)) : null, now = target.get(k) || null;
            let fields = null;
            if (was && now) {
                fields = [];
                for (const f of new Set([...Object.keys(was), ...Object.keys(now)])) {
                    if (JSON.stringify(was[f]) !== JSON.stringify(now[f])) fields.push([f, Object.prototype.hasOwnProperty.call(now, f), now[f]]);
                }
            }
            changes.push({ k, now, fields });
        }
        const orderChanged = before.get('on') !== after.get('on') || before.get('oe') !== after.get('oe');
        const rootChanged = before.get('root') !== after.get('root');
        const titleChanged = before.get('title') !== after.get('title');
        if (!changes.length && !orderChanged && !rootChanged && !titleChanged) return false;

        const syncArray = (arr, want) => {
            const have = keysOf(arr), byKey = new Map(arr.map((o, i) => [have[i], o]));
            const wantKeys = keysOf(want);
            const out = want.map((t, i) => {
                const o = byKey.get(wantKeys[i]);
                if (!o) return clone(t);
                if (JSON.stringify(o) !== JSON.stringify(t)) { const c = clone(t); for (const k of Object.keys(o)) delete o[k]; for (const k of Object.keys(c)) put(o, k, c[k]); }
                return o;
            });
            arr.length = 0;
            arr.push(...out);
        };
        syncArray(core.doc.nodes, M.doc.nodes);
        syncArray(core.doc.edges, M.doc.edges);
        if (rootChanged) {
            for (const k of Object.keys(core.doc)) if (k !== 'nodes' && k !== 'edges' && !(k in M.doc)) delete core.doc[k];
            for (const k of Object.keys(M.doc)) if (k !== 'nodes' && k !== 'edges') put(core.doc, k, clone(M.doc[k]));
        }

        // Undo/redo snapshots and an open transaction get the same remote delta, per field, so
        // undo and Esc only take back this tab's own edits (a remote recolour of a card this tab
        // moved survives the undo of the move).
        dropBoundary();
        const rank = (arr) => new Map(keysOf(arr).map((k, i) => [k, i]));
        const nRank = rank(M.doc.nodes), eRank = rank(M.doc.edges);
        const rebase = (snap) => {
            if (!snap || typeof snap.doc !== 'string') return;
            let d;
            try { d = JSON.parse(snap.doc); } catch (e) { return; }
            if (!Array.isArray(d.nodes)) d.nodes = [];
            if (!Array.isArray(d.edges)) d.edges = [];
            for (const c of changes) {
                const arr = c.k[0] === 'n' ? d.nodes : d.edges;
                const i = keysOf(arr).indexOf(c.k.slice(2));
                if (!c.now) { if (i >= 0) arr.splice(i, 1); continue; }
                if (i < 0) { arr.push(clone(c.now)); continue; }
                if (!c.fields) { arr[i] = clone(c.now); continue; }
                const el = arr[i];
                if (!el || typeof el !== 'object') { arr[i] = clone(c.now); continue; }
                for (const [f, present, v] of c.fields) { if (present) put(el, f, clone(v)); else delete el[f]; }
            }
            if (orderChanged) {
                const sortBy = (arr, r) => { const ks = keysOf(arr); return arr.map((o, i) => [o, r.has(ks[i]) ? r.get(ks[i]) : 1e9 + i]).sort((a, b) => a[1] - b[1]).map(x => x[0]); };
                d.nodes = sortBy(d.nodes, nRank);
                d.edges = sortBy(d.edges, eRank);
            }
            snap.doc = JSON.stringify(d);
        };
        (core._undo || []).forEach(rebase);
        (core._redo || []).forEach(rebase);
        if (core._txn) rebase(core._txn.before);

        core.reindex();
        core.invalidate('all');
        if (titleChanged) {
            const t = $('flowTitle');
            Flow.app.state().title = M.title || 'Untitled chart';
            if (document.activeElement !== t) t.value = Flow.app.state().title;
        }
        core.emit('change', { label: 'Other tab' });
        return true;
    }

    /** Merge a slot record into this tab. A record with nothing newer is a no-op (idempotent). */
    function mergeIn(rec) {
        const meta = rec.meta || {};
        see(meta);
        if (!hasNewer(meta, sync.meta)) return false;
        stats.merges++;
        const st = Flow.app.state();
        const M = reconcile(
            { doc: core.doc, meta: sync.meta, title: st.title },
            { doc: parseDoc(rec.canvas), meta, title: rec.title }
        );
        applyMerged(M);
        sync.meta = M.meta;
        sync.shadow = snapshotOf(core.doc, Flow.app.state().title);
        docDirty = false;
        return true;
    }

    /** Take the newer "last saved to Snippets" facts from another tab's record. */
    function takeIdentity(rec) {
        const st = Flow.app.state();
        if (rec.snippetId && rec.savedUpdatedAt && ts(rec.savedUpdatedAt) > ts(st.savedUpdatedAt)) {
            Flow.app.setState({ savedContent: rec.savedContent, savedUpdatedAt: rec.savedUpdatedAt, category: rec.category || st.category, conflict: false, broken: false });
        } else {
            Flow.app.refreshStatus();
        }
    }
    /** Does this tab hold identity facts (a newer save, a new id) the record lacks? */
    function identityNewer(R) {
        const st = Flow.app.state();
        if ((R.snippetId || null) !== (st.snippetId || null) || (R.draftId || null) !== (st.draftId || null)) return true;
        const a = ts(st.savedUpdatedAt), b = ts(R.savedUpdatedAt);
        if (a !== b) return a > b;
        return (st.category || null) !== (R.category || null) || (st.detachedFrom || null) !== (R.detachedFrom || null) || (st.savedContent || null) !== (R.savedContent || null);
    }

    /** Tombstones: keep 30 days, but past 300 drop the ones older than a day, and never over 1000. */
    function pruneTombstones(meta) {
        const now = Date.now();
        const tombs = Object.keys(meta).filter(k => meta[k][2]);
        for (const k of tombs) if (meta[k][3] < now - TOMBSTONE_TTL) delete meta[k];
        let left = tombs.filter(k => meta[k]);
        if (left.length > 300) { for (const k of left) if (meta[k][3] < now - DAY) delete meta[k]; left = left.filter(k => meta[k]); }
        if (left.length > 1000) left.sort((x, y) => meta[x][3] - meta[y][3]).slice(0, left.length - 1000).forEach(k => delete meta[k]);
    }

    function record() {
        const st = Flow.app.state();
        return {
            canvas: Flow.io.serialize(),
            meta: sync.meta,
            shape: core.docShape,
            title: st.title,
            snippetId: st.snippetId,
            draftId: st.draftId,
            savedContent: st.savedContent,
            savedUpdatedAt: st.savedUpdatedAt,
            category: st.category,
            detachedFrom: st.detachedFrom || null,
            view: core.view,
            autoEdges: [...core.autoEdges],
            savedAt: Date.now(),
        };
    }

    // When localStorage is full, changes still reach the other open tabs in memory.
    let syncChannel = null;
    try { syncChannel = new BroadcastChannel('flow-sync'); } catch (e) { syncChannel = null; }

    /**
     * Write this tab's chart to its slot: merge what is there first, then write only if this tab
     * holds something strictly newer (never republishes what the slot already has).
     */
    store.write = function (opts) {
        if (!appReady()) return;
        const key = store.currentKey();
        if (!key) return;
        const R = store.read(key);
        if (sync.key !== key) {
            // Newly attached to this slot: its current content is our base, so what we loaded
            // on top of it counts as edits (and wins), and anything equal keeps its version.
            sync = { key, meta: R && R.meta ? clone(R.meta) : {}, shadow: R && R.meta ? snapshotOf(parseDoc(R.canvas), R.title) : new Map() };
            if (R && R.meta) see(R.meta);
            docDirty = true;
        }
        stamp();
        if (R && R.meta) mergeIn(R);
        const need = !R || !R.meta || hasNewer(sync.meta, R.meta) || identityNewer(R) || (opts && opts.force);
        if (need) {
            pruneTombstones(sync.meta);
            const text = JSON.stringify(record());
            stats.writes++;
            if (!setItem(key, text) && syncChannel) { stats.bc++; try { syncChannel.postMessage({ key, text }); } catch (e) { /* ignore */ } }
        } else {
            stats.skipped++;
        }
        try { sessionStorage.setItem(TAB_KEY, key); } catch (e) { /* ignore */ }
        syncBadge();
    };

    /** At most one republish per 60 ms per tab, and only if still strictly newer than the slot. */
    let republishTimer = 0;
    function scheduleRepublish() {
        if (republishTimer) return;
        republishTimer = setTimeout(() => { republishTimer = 0; stats.republish++; store.write(); }, 60);
    }

    /** Keep a copy of the current chart as its own draft ("load theirs" keeps yours here). */
    store.stashCurrent = function (suffix) {
        const st = Flow.app.state();
        const draftId = store.newDraftId();
        const key = PREFIX + 'd:' + draftId;
        const rec = record();
        const meta = {};
        for (const [k, j] of snapshotOf(core.doc, st.title)) bump(meta, k, 0, Date.now(), j);
        setItem(key, JSON.stringify(Object.assign(rec, {
            meta, title: (st.title || 'Untitled chart') + (suffix || ''),
            snippetId: null, draftId, savedContent: null, savedUpdatedAt: null,
        })));
        syncBadge();
        return key;
    };

    /**
     * Replace a slot's chart (not the one this tab shows) with `text`, as an edit on top of what
     * is there, so tabs showing it merge to exactly `text`.
     */
    store.replaceSlot = function (key, text, fields) {
        const R = store.read(key);
        const tmp = { meta: R && R.meta ? clone(R.meta) : {}, shadow: R ? snapshotOf(parseDoc(R.canvas), R.title) : new Map() };
        if (R && R.meta) see(R.meta);
        const doc = parseDoc(text);
        const title = (fields && fields.title) || (R && R.title) || 'Untitled chart';
        const cur = snapshotOf(doc, title), now = Date.now();
        for (const [k, j] of cur) if (tmp.shadow.get(k) !== j) bump(tmp.meta, k, 0, now, j);
        for (const k of tmp.shadow.keys()) if (!cur.has(k)) bump(tmp.meta, k, 1, now);
        const canvas = Flow.io.serialize(doc);
        setItem(key, JSON.stringify(Object.assign({}, R || {}, fields || {}, { canvas, meta: tmp.meta, title, savedContent: canvas, savedAt: now })));
    };

    /**
     * The working copy changed identity. First save / snippet deleted: the old slot points to the
     * new one so other tabs on it follow. Save as new (`fork`): only this tab moves; other tabs
     * stay on the original chart and its slot is left alone.
     */
    store.move = function (oldKey, opts) {
        const newKey = store.currentKey();
        sync.key = newKey;   // carry our versions into the new slot
        dropBoundary();      // a saved chart's history starts at the save, not before the import
        store.write({ force: true });
        if (oldKey && oldKey !== newKey && !(opts && opts.fork)) setItem(oldKey, JSON.stringify({ movedTo: newKey, savedAt: Date.now() }));
        syncBadge();
    };

    /**
     * About to show a different chart in this tab. Flushes the current one; an empty draft is
     * dropped. Returns a note when unsaved work stays behind (it's under Open > Unsaved work).
     */
    store.leave = function () {
        const key = store.currentKey();
        if (!key) return null;
        Flow.app.autosaveNow();
        const r = store.read(key);
        if (!r) return null;
        if (!r.snippetId && isEmptyCanvas(r.canvas)) { store.remove(key); return null; }
        return store.isUnsaved(r) ? `“${r.title || 'Untitled chart'}” is kept under Open › Unsaved work` : null;
    };

    /** Drop old pointers, empty drafts and the oldest clean snippet slots. `hard` when storage is full. */
    function prune(hard) {
        const now = Date.now(), cur = appReady() ? store.currentKey() : null;
        const clean = [];
        for (const k of store.keys()) {
            if (k === cur) continue;
            const r = lsJSON(k);
            if (!r) { store.remove(k); continue; }
            if (r.movedTo) { if (now - (r.savedAt || 0) > DAY || hard) store.remove(k); continue; }
            if (typeof r.canvas !== 'string') { store.remove(k); continue; }
            if (!r.snippetId && isEmptyCanvas(r.canvas)) { if (now - (r.savedAt || 0) > DAY || hard) store.remove(k); continue; }
            if (r.snippetId && !store.isUnsaved(r)) clean.push(Object.assign({ key: k }, r));
        }
        clean.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        clean.slice(hard ? 0 : KEEP_CLEAN).forEach(r => store.remove(r.key));
    }

    function migrateLegacy() {
        const old = lsJSON(LEGACY_KEY);
        if (!old) return;
        if (typeof old.canvas === 'string') {
            const key = old.snippetId ? PREFIX + 's:' + old.snippetId : PREFIX + 'd:' + store.newDraftId();
            const cur = store.read(key);
            if (!cur || (cur.savedAt || 0) < (old.savedAt || 0)) {
                setItem(key, JSON.stringify(Object.assign({}, old, { draftId: old.snippetId ? null : key.slice(PREFIX.length + 2), savedUpdatedAt: null })));
            }
            // First run after the upgrade: this tab carries on with the chart it had.
            try { sessionStorage.setItem(TAB_KEY, key); } catch (e) { /* ignore */ }
        }
        store.remove(LEGACY_KEY);
    }

    // ── Other tabs ──────────────────────────────────────────────────────────

    /**
     * Another tab wrote the slot we show: merge it in right away (even mid-edit or mid-drag).
     * Republish only when this tab holds something strictly newer, coalesced; an old or equal
     * record is a no-op, so the tabs can't feed each other a storm.
     */
    function onRemote(key, rec) {
        if (!appReady() || !rec) return;
        if (rec.movedTo) { follow(rec.movedTo); return; }
        if (sync.key !== key || !rec.meta) return;
        stamp();
        takeIdentity(rec);
        mergeIn(rec);
        if (hasNewer(sync.meta, rec.meta)) scheduleRepublish();
    }

    /** Our slot became a pointer (the chart was saved / detached in another tab): go along. */
    function follow(targetKey) {
        const target = store.resolve(targetKey);
        if (!target) return;
        const r = target.rec;
        stamp();
        Flow.app.setState({
            snippetId: r.snippetId || null, draftId: r.snippetId ? null : r.draftId, savedContent: r.savedContent || null,
            savedUpdatedAt: r.savedUpdatedAt || null, category: r.category || null, detachedFrom: r.detachedFrom || null,
            conflict: false, broken: false,
        });
        sync.key = target.key;
        mergeIn(r);
        store.write();
    }

    /** Registered from snippets.init, once Flow.app exists. */
    function listenToOtherTabs() {
        window.addEventListener('storage', (e) => {
            if (!appReady() || !e.key || !e.key.startsWith(PREFIX)) return;
            syncBadge();
            if (!$('flowOpenDialog').hidden) renderOpenList($('flowOpenSearch').value, true);
            if (e.key !== store.currentKey() || e.newValue == null) return;
            let rec;
            try { rec = JSON.parse(e.newValue); } catch (err) { return; }
            onRemote(e.key, rec);
        });
        if (syncChannel) {
            syncChannel.onmessage = (e) => {
                const m = e.data || {};
                if (!appReady() || typeof m.text !== 'string' || m.key !== store.currentKey()) return;
                let rec;
                try { rec = JSON.parse(m.text); } catch (err) { return; }
                onRemote(m.key, rec);
            };
        }
    }

    /** Restore on page load: ?snippet=, else this tab's slot, else the most recent chart. */
    store.boot = async function () {
        migrateLegacy();
        const param = new URLSearchParams(location.search).get('snippet');
        if (param != null && param !== '') {
            const id = Number(param);
            if (Number.isFinite(id) && id > 0 && await snippets.openSnippet(id, { boot: true })) { prune(false); return; }
            if (!(Number.isFinite(id) && id > 0)) core.toast('That chart is no longer in Snippets', 'error');
        }
        let found = null;
        try { found = store.resolve(sessionStorage.getItem(TAB_KEY)); } catch (e) { /* ignore */ }
        if (!found) { const all = store.list(); if (all.length) found = { key: all[0].key, rec: all[0] }; }
        let doc = null;
        if (found) { try { doc = Flow.io.parse(found.rec.canvas); } catch (e) { console.warn('Flow: working copy unreadable, starting fresh', e); } }
        if (doc) {
            const r = found.rec;
            Flow.app.openDocument(doc, {
                boot: true, restored: true, title: r.title, snippetId: r.snippetId, draftId: r.draftId || (!r.snippetId && found.key.slice(PREFIX.length + 2)),
                savedContent: r.savedContent, savedUpdatedAt: r.savedUpdatedAt, category: r.category, detachedFrom: r.detachedFrom,
                view: r.view, autoEdges: r.autoEdges, shape: r.shape,
            });
        } else {
            const vr = core.viewportRect();
            Flow.app.openDocument({ nodes: [], edges: [] }, { boot: true, view: { x: Math.round(vr.width / 2), y: Math.round(vr.height / 2), zoom: 1 } });
        }
        prune(false);
        snippets.checkLinked();
    };

    // ═════════════════════════════════════════════════════════════════════════
    //  Snippets
    // ═════════════════════════════════════════════════════════════════════════

    const snippets = Flow.snippets = {};
    // Same ids and names Snippets seeds (SnippetsApp.defaultTypes), so either tool can go first.
    const DEFAULT_TYPES = [
        { id: 1, name: 'JavaScript' }, { id: 2, name: 'Python' }, { id: 3, name: 'SQL' }, { id: 4, name: 'HTML/CSS' },
        { id: 5, name: 'Utilities' }, { id: 6, name: 'Shell' }, { id: 7, name: 'Nushell' }, { id: 8, name: 'Other' },
    ];
    const MAX_VERSIONS = 30;
    const CHANNEL = 'qol-snippets';
    let channel = null;
    let items = [], activeIndex = 0, saveAsNew = false;

    const hasFirebase = () => typeof FirebaseSync !== 'undefined';
    const signedIn = () => hasFirebase() && FirebaseSync.isSignedIn && FirebaseSync.isSignedIn();
    /** Our serialisation of canvas text, or null when it isn't valid JSON Canvas. */
    const normOrNull = (text) => { try { return Flow.io.serialize(Flow.io.parse(text)); } catch (e) { return null; } };
    const norm = (text) => { const n = normOrNull(text); return n == null ? text : n; };
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const isChart = (s) => !!s && s.extension === 'canvas';

    function ago(t) {
        const s = Math.round((Date.now() - ts(t)) / 1000);
        if (!isFinite(s) || !ts(t)) return '';
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.round(s / 60)} min ago`;
        if (s < 86400) return `${Math.round(s / 3600)} h ago`;
        return new Date(ts(t)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Which other Flow tabs show a slot? (asked before resetting a working copy nobody else is on)
    const tabId = Math.random().toString(36).slice(2);
    let tabsChannel = null;
    try {
        tabsChannel = new BroadcastChannel('flow-tabs');
        tabsChannel.onmessage = (e) => {
            const m = e.data || {};
            if (m.type === 'who' && m.from !== tabId && appReady() && m.key === store.currentKey()) tabsChannel.postMessage({ type: 'here', key: m.key, to: m.from });
        };
    } catch (e) { tabsChannel = null; }
    function othersOn(key) {
        if (!tabsChannel) return Promise.resolve(1);   // can't ask: assume someone is, change nothing
        return new Promise((resolve) => {
            let n = 0;
            const ch = new BroadcastChannel('flow-tabs');
            ch.onmessage = (e) => { if (e.data && e.data.type === 'here' && e.data.to === tabId && e.data.key === key) n++; };
            tabsChannel.postMessage({ type: 'who', key, from: tabId });
            setTimeout(() => { ch.close(); resolve(n); }, 250);
        });
    }

    function broadcast(msg) {
        try { if (channel) channel.postMessage(msg); } catch (e) { /* ignore */ }
    }

    snippets.init = function () {
        // Firebase is optional: without config or offline, everything stays local.
        if (hasFirebase()) {
            try {
                FirebaseSync.init({
                    onAuthChange: () => Flow.app && Flow.app.refreshStatus(),
                    onSyncStatus: () => { },
                });
            } catch (e) { console.warn('Flow: cloud sync unavailable', e); }
        }
        try {
            channel = new BroadcastChannel(CHANNEL);
            channel.onmessage = () => { if (!appReady()) return; snippets.checkLinked(); if (!$('flowOpenDialog').hidden) snippets.refreshOpenDialog(); };
        } catch (e) { channel = null; }
        window.addEventListener('focus', () => snippets.checkLinked());
        document.addEventListener('visibilitychange', () => { if (!document.hidden) snippets.checkLinked(); });

        buildUi();
        listenToOtherTabs();

        $('flowSaveBtn').addEventListener('click', () => snippets.quickSave());
        $('flowOpenBtn').addEventListener('click', () => snippets.openDialog());
        $('flowSaveForm').addEventListener('submit', (e) => { e.preventDefault(); snippets.saveFromDialog(saveAsNew); });
        $('flowSaveAsNew').addEventListener('click', () => snippets.saveFromDialog(true));
        $('flowSaveCategory').addEventListener('change', (e) => { if (e.target.value === '__new__') showNewCategory(); });

        const search = $('flowOpenSearch');
        search.addEventListener('input', () => renderOpenList(search.value));
        search.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveOpen(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveOpen(-1); }
            else if (e.key === 'Enter') { e.preventDefault(); const it = items[activeIndex]; if (it) pick(it); }
        });
        $('flowOpenList').addEventListener('click', (e) => {
            const discard = e.target.closest('[data-discard]');
            if (discard) { e.stopPropagation(); armDiscard(discard); return; }
            const li = e.target.closest('[data-index]');
            if (li) pick(items[Number(li.dataset.index)]);
        });

        // Ctrl+Alt+S: save as a new chart (Ctrl+Shift+S is Export .canvas). Capture phase so the
        // inline editors' Ctrl+S handlers don't see it first.
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyS') {
                e.preventDefault(); e.stopImmediatePropagation();
                snippets.saveAsDialog();
            }
        }, true);
        const file = Flow.interact.SHORTCUTS.find(g => g[0] === 'File');
        if (file && !file[1].some(r => r[0] === 'Ctrl + Alt + S')) {
            const i = file[1].findIndex(r => r[0] === 'Ctrl + S');
            file[1].splice(i + 1, 0, ['Ctrl + Alt + S', 'Save as a new chart']);
        }

        // The Save-as button and the unsaved-work badge follow the app's status line.
        const refresh = Flow.app.refreshStatus;
        Flow.app.refreshStatus = function () { refresh.apply(this, arguments); syncSaveAs(); };
    };

    /** Controls this module adds to the page (kept out of index.html, which P1 owns). */
    function buildUi() {
        const saveBtn = $('flowSaveBtn');
        if (!$('flowSaveAsBtn')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'flow-btn flow-btn-primary flow-save-as';
            b.id = 'flowSaveAsBtn';
            b.title = 'Save as a new chart — Ctrl+Alt+S';
            b.setAttribute('aria-label', 'Save as a new chart');
            b.innerHTML = '<i class="fa-regular fa-clone"></i>';
            b.hidden = true;
            saveBtn.after(b);
            b.addEventListener('click', () => snippets.saveAsDialog());
        }
        const openBtn = $('flowOpenBtn');
        if (!$('flowOpenBadge')) {
            const s = document.createElement('span');
            s.className = 'flow-open-badge';
            s.id = 'flowOpenBadge';
            s.hidden = true;
            openBtn.appendChild(s);
        }
        const menu = $('flowMenu');
        if (menu && !menu.querySelector('[data-action="save-as"]')) {
            const b = document.createElement('button');
            b.setAttribute('role', 'menuitem');
            b.dataset.action = 'save-as';
            b.innerHTML = '<i class="fa-regular fa-clone"></i><span>Save as new chart…</span><kbd>Ctrl+Alt+S</kbd>';
            const first = menu.querySelector('[data-action="new"]');
            if (first) first.after(b); else menu.prepend(b);
            b.addEventListener('click', () => snippets.saveAsDialog());
        }
        // Inline "new category" field (instead of a prompt()).
        const sel = $('flowSaveCategory');
        if (!$('flowSaveNewCat')) {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.id = 'flowSaveNewCat';
            inp.className = 'flow-newcat';
            inp.placeholder = 'New category name · Enter to add, Esc to cancel';
            inp.autocomplete = 'off';
            inp.hidden = true;
            sel.after(inp);
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitNewCategory(); }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelNewCategory(); }
            });
            inp.addEventListener('blur', () => { if (!inp.hidden) { if (inp.value.trim()) commitNewCategory(true); else cancelNewCategory(true); } });
        }
        // Conflict chooser (a chart saved elsewhere since this tab opened it).
        if (!$('flowConflictDialog')) {
            const d = document.createElement('div');
            d.className = 'flow-dialog-backdrop';
            d.id = 'flowConflictDialog';
            d.hidden = true;
            d.innerHTML = `<div class="flow-dialog" role="dialog" aria-modal="true" aria-labelledby="flowConflictTitle">
                <h3 id="flowConflictTitle">Changed elsewhere</h3>
                <p class="flow-dialog-note flow-conflict-text" id="flowConflictText"></p>
                <div class="flow-conflict-choices">
                    <button type="button" class="flow-btn flow-btn-primary" data-choice="copy"><i class="fa-regular fa-clone"></i><span><b>Save mine as a new chart</b><small>Both versions stay in Snippets</small></span></button>
                    <button type="button" class="flow-btn" data-choice="overwrite"><i class="fa-regular fa-floppy-disk"></i><span><b>Overwrite with mine</b><small>Theirs stays in the snippet's History</small></span></button>
                    <button type="button" class="flow-btn" data-choice="theirs"><i class="fa-solid fa-rotate"></i><span><b>Load theirs</b><small>Mine is kept under Open › Unsaved work</small></span></button>
                </div>
                <div class="flow-dialog-actions"><span class="flow-spacer"></span><button type="button" class="flow-btn" data-close>Cancel</button></div>
            </div>`;
            document.body.appendChild(d);
            d.addEventListener('pointerdown', (e) => { if (e.target === d) Flow.app.closeDialog(d.id); });
            d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); Flow.app.closeDialog(d.id); } });
            d.addEventListener('click', (e) => {
                if (e.target.closest('[data-close]')) { Flow.app.closeDialog(d.id); return; }
                const c = e.target.closest('[data-choice]');
                if (c) { Flow.app.closeDialog(d.id); resolveConflict(c.dataset.choice); }
            });
        }
    }

    function syncSaveAs() {
        const b = $('flowSaveAsBtn');
        if (b) b.hidden = !Flow.app.state().snippetId;
        syncBadge();
    }

    function syncBadge() {
        const el = $('flowOpenBadge');
        if (!el || !Flow.app || !Flow.app.state) return;
        const n = store.unsavedElsewhere().length;
        el.hidden = !n;
        el.textContent = n;
        $('flowOpenBtn').title = n ? `Open from Snippets — Ctrl+O · ${plural(n, 'unsaved chart')} kept in this browser` : 'Open from Snippets — Ctrl+O';
    }

    // ── Storage helpers ─────────────────────────────────────────────────────

    async function getTypes() {
        try {
            const types = await StorageManager.getAll('snippetTypes');
            if (types.length) return types.map(t => t.name).filter(Boolean);
        } catch (e) { console.warn('Flow: could not read categories', e); }
        return DEFAULT_TYPES.map(t => t.name);
    }

    /** Seed the defaults first (as Snippets does on its first run), then add the new one. */
    async function addCategory(name) {
        const types = await StorageManager.getAll('snippetTypes');
        if (!types.length) await StorageManager.putAll('snippetTypes', DEFAULT_TYPES.map(t => Object.assign({}, t)));
        const all = types.length ? types : DEFAULT_TYPES;
        const hit = all.find(t => String(t.name).toLowerCase() === name.toLowerCase());
        if (hit) return hit.name;
        const t = { id: Date.now(), name };
        await StorageManager.put('snippetTypes', t);
        if (signedIn()) FirebaseSync.pushSnippetType(t);
        broadcast({ type: 'types' });
        return name;
    }

    async function fillCategories(selected) {
        const sel = $('flowSaveCategory');
        const types = await getTypes();
        if (selected && !types.includes(selected)) types.push(selected);
        sel.innerHTML = types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('') + '<option value="__new__">New category…</option>';
        sel.value = selected && types.includes(selected) ? selected : (types.includes('Other') ? 'Other' : types[0]);
        sel.dataset.last = sel.value;
    }

    function showNewCategory() {
        const sel = $('flowSaveCategory'), inp = $('flowSaveNewCat');
        sel.hidden = true;
        inp.hidden = false;
        inp.value = '';
        inp.focus();
    }
    function cancelNewCategory(fromBlur) {
        const sel = $('flowSaveCategory'), inp = $('flowSaveNewCat');
        inp.hidden = true;
        sel.hidden = false;
        sel.value = sel.dataset.last || 'Other';
        if (!fromBlur) sel.focus();
    }
    async function commitNewCategory(fromBlur) {
        const sel = $('flowSaveCategory'), inp = $('flowSaveNewCat');
        const name = inp.value.trim();
        if (!name) { cancelNewCategory(fromBlur); return null; }
        inp.hidden = true;
        sel.hidden = false;
        let finalName = name;
        try { finalName = await addCategory(name); } catch (e) { core.toast('Could not add the category: ' + (e.message || e), 'error'); }
        await fillCategories(finalName);
        if (!fromBlur) sel.focus();
        return finalName;
    }

    snippets.listCanvas = async function () {
        const all = await StorageManager.getAll('snippets');
        return all.filter(isChart).sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt));
    };

    /** Same snapshot shape and pruning as SnippetsApp.saveVersionSnapshot / pruneVersions. */
    async function saveVersionSnapshot(snippet) {
        const version = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            snippetId: snippet.id,
            name: snippet.name,
            content: snippet.content,
            description: snippet.description || '',
            tags: [...(snippet.tags || [])],
            notes: snippet.notes || '',
            savedAt: new Date().toISOString(),
        };
        await StorageManager.put('snippetVersions', version);
        if (signedIn()) FirebaseSync.pushSnippetVersion(version);
        const versions = await StorageManager.getAllByIndex('snippetVersions', 'snippetId', snippet.id);
        if (versions.length > MAX_VERSIONS) {
            versions.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
            for (const v of versions.slice(0, versions.length - MAX_VERSIONS)) {
                await StorageManager.delete('snippetVersions', v.id);
                if (signedIn()) FirebaseSync.deleteSnippetVersion(v.id);
            }
        }
    }

    // ── Keeping the linked snippet honest ───────────────────────────────────

    let checking = null;
    /**
     * Compare the open chart with its snippet record. Deleted (or no longer a .canvas) -> becomes
     * a draft. Saved elsewhere -> reload when we have no edits, otherwise "Changed elsewhere".
     * Invalid JSON -> "Snippet content invalid", this copy stays.
     */
    snippets.checkLinked = function () {
        if (!checking) checking = doCheck().finally(() => { checking = null; });
        return checking;
    };
    async function doCheck() {
        if (!appReady()) return;
        const st = Flow.app.state();
        const id = st.snippetId;
        if (!id) return;
        let s;
        try { s = await StorageManager.get('snippets', id); } catch (e) { return; }
        if (Flow.app.state().snippetId !== id) return;
        if (!s) { detach(`“${st.title}” was deleted from Snippets`); return; }
        if (!isChart(s)) { detach(`“${s.name}” is now a .${s.extension} snippet in Snippets`); return; }
        if (s.type !== st.category) Flow.app.setState({ category: s.type });   // category renamed in Snippets
        if (st.savedUpdatedAt && ts(s.updatedAt) === ts(st.savedUpdatedAt) && !st.broken) return;
        const theirs = normOrNull(s.content);
        if (theirs == null) {
            if (!st.broken) {
                Flow.app.setState({ broken: true });
                core.toast(`“${s.name}” has invalid content in Snippets · showing your last good copy`, 'error');
            }
            return;
        }
        const wasBroken = st.broken;
        if (wasBroken) Flow.app.setState({ broken: false });
        if (theirs === st.savedContent) {
            if (wasBroken) core.toast(`“${s.name}” is valid again in Snippets`);
            // Same chart content (metadata edit, or first check after an upgrade): just re-base.
            Flow.app.setState({ savedUpdatedAt: s.updatedAt, category: s.type, conflict: false });
            Flow.app.autosaveNow();
            return;
        }
        if (!Flow.app.isDirty() && !core.inTransaction() && !core.editing) {
            loadTheirs(s, theirs);
            core.toast(`Updated from Snippets · “${s.name}”`);
        } else if (!Flow.app.state().conflict) {
            Flow.app.setState({ conflict: true });
            core.toast(`“${s.name}” was saved elsewhere · Ctrl+S lets you keep both`, 'error');
        }
    }

    function loadTheirs(s, theirs) {
        let doc;
        try { doc = Flow.io.parse(theirs); } catch (e) { return false; }
        core.load(doc, { keepHistory: true });
        markBoundary();
        core.renderNow();
        Flow.app.setState({ title: s.name, savedContent: Flow.io.serialize(), savedUpdatedAt: s.updatedAt, category: s.type, conflict: false, broken: false });
        Flow.app.autosaveNow();
        return true;
    }

    function detach(msg) {
        const st = Flow.app.state();
        const name = st.title;
        Flow.app.setLink({ snippetId: null, draftId: 'deleted-' + st.snippetId, savedContent: null, savedUpdatedAt: null, detachedFrom: name, conflict: false, broken: false });
        core.toast(`${msg} · kept here as a draft, Ctrl+S saves it again`, 'error');
    }

    function showConflict(s) {
        $('flowConflictText').innerHTML = `“${esc(s ? s.name : Flow.app.title())}” was saved from another tab or device${s ? ' ' + esc(ago(s.updatedAt)) : ''}, after you opened it here. You have unsaved edits too.`;
        Flow.app.openDialog('flowConflictDialog', document.querySelector('#flowConflictDialog [data-choice="copy"]'));
    }

    async function resolveConflict(choice) {
        const st = Flow.app.state();
        let s = null;
        try { s = await StorageManager.get('snippets', st.snippetId); } catch (e) { /* ignore */ }
        if (!s || !isChart(s)) { detach(`“${st.title}” is no longer a chart in Snippets`); return; }
        if (choice === 'copy') {
            const oldKey = store.currentKey();
            const res = await snippets.save({ id: null, name: `${st.title} (my copy)`, type: s.type, description: s.description || '' });
            // The original's working copy becomes the saved version, for any tab still on it.
            const theirs = normOrNull(s.content);
            if (res && theirs != null) store.replaceSlot(oldKey, theirs, { title: s.name, savedUpdatedAt: s.updatedAt, category: s.type });
        } else if (choice === 'overwrite') {
            await snippets.save({ id: s.id, name: st.title, type: s.type, description: s.description || '' });
        } else if (choice === 'theirs') {
            const theirs = normOrNull(s.content);
            if (theirs == null) { core.toast('Their version is not valid JSON Canvas', 'error'); return; }
            store.stashCurrent(' (my edits)');
            loadTheirs(s, theirs);
            core.toast('Loaded the saved version · your edits are under Open › Unsaved work');
        }
    }

    // ── Save ────────────────────────────────────────────────────────────────

    /** Ctrl+S: update the linked snippet in place, or ask for a name the first time. */
    snippets.quickSave = async function () {
        Flow.interact.finishEditing();
        await snippets.checkLinked();
        const st = Flow.app.state();
        if (st.snippetId) {
            let existing = null;
            try { existing = await StorageManager.get('snippets', st.snippetId); } catch (e) { /* fall through */ }
            if (isChart(existing)) {
                if (st.conflict) { showConflict(existing); return; }
                const res = await snippets.save({ id: existing.id, name: Flow.app.title() || existing.name, type: existing.type, description: existing.description || '' });
                if (res && st.broken) core.toast('Replaced the invalid snippet content with this chart · the broken text is in History');
                return;
            }
        }
        snippets.saveDialog();
    };

    /** Ctrl+Alt+S / the clone button: always a new snippet. */
    snippets.saveAsDialog = function () {
        return snippets.saveDialog({ asNew: !!Flow.app.state().snippetId });
    };

    snippets.saveDialog = async function (opts) {
        opts = opts || {};
        Flow.interact.finishEditing();
        const st = Flow.app.state();
        let existing = null;
        if (st.snippetId) { try { existing = await StorageManager.get('snippets', st.snippetId); } catch (e) { /* ignore */ } }
        if (existing && !isChart(existing)) existing = null;
        saveAsNew = !!(opts.asNew && existing);
        const base = Flow.app.title() || (existing && existing.name) || 'Untitled chart';
        $('flowSaveName').value = saveAsNew ? `${base} (copy)` : base;
        $('flowSaveDesc').value = existing ? existing.description || '' : '';
        $('flowSaveNewCat').hidden = true;
        $('flowSaveCategory').hidden = false;
        await fillCategories(existing ? existing.type : (localStorage.getItem('flow-last-category') || 'Other'));
        $('flowSaveTitle').textContent = saveAsNew ? 'Save as a new chart' : 'Save to Snippets';
        $('flowSaveAsNew').hidden = !existing || saveAsNew;
        $('flowSaveSubmit').textContent = saveAsNew ? 'Save as new' : existing ? 'Update' : 'Save';
        $('flowSaveNote').textContent = saveAsNew
            ? `Creates a separate snippet; “${existing.name}” stays as it is.`
            : existing
                ? 'Updates the saved snippet; the previous version stays in its history.'
                : 'Saved as a .canvas snippet. Open it later from here or from Snippets.';
        Flow.app.openDialog('flowSaveDialog', $('flowSaveName'));
        if (saveAsNew) setTimeout(() => $('flowSaveName').select(), 0);
    };

    snippets.saveFromDialog = async function (asNew) {
        const name = $('flowSaveName').value.trim();
        if (!name) { $('flowSaveName').focus(); return; }
        let type = $('flowSaveCategory').value;
        if (!$('flowSaveNewCat').hidden) type = (await commitNewCategory(true)) || $('flowSaveCategory').value;
        if (type === '__new__') type = 'Other';
        const st = Flow.app.state();
        if (!asNew && st.snippetId) {
            await snippets.checkLinked();
            const now = Flow.app.state();
            if (now.conflict) {
                Flow.app.closeDialog('flowSaveDialog');
                let s = null; try { s = await StorageManager.get('snippets', now.snippetId); } catch (e) { /* ignore */ }
                showConflict(s);
                return;
            }
        }
        const res = await snippets.save({ id: asNew ? null : Flow.app.state().snippetId, name, type, description: $('flowSaveDesc').value.trim() });
        if (res) Flow.app.closeDialog('flowSaveDialog');
    };

    function withLock(name, fn) {
        try { if (navigator.locks && navigator.locks.request) return navigator.locks.request(name, fn); } catch (e) { /* no Web Locks */ }
        return fn();
    }
    /** A numeric id (Date.now()-like, as Snippets uses) that no record has and no other tab took. */
    async function uniqueId() {
        let last = 0;
        try { last = Number(localStorage.getItem('qol-snippets-last-id')) || 0; } catch (e) { /* ignore */ }
        let id = Math.max(Date.now(), last + 1);
        while (await StorageManager.get('snippets', id)) id++;
        try { localStorage.setItem('qol-snippets-last-id', String(id)); } catch (e) { /* ignore */ }
        return id;
    }

    /** Write the chart to the snippets store (create or update) and sync it if signed in. */
    snippets.save = async function ({ id, name, type, description }) {
        const content = Flow.io.serialize();
        const now = new Date().toISOString();
        const before = Object.assign({}, Flow.app.state()), oldKey = store.currentKey();
        const wasLinked = !!before.snippetId;
        try {
            let snippet = id ? await StorageManager.get('snippets', id) : null;
            // Only ever write back into a .canvas snippet; anything else gets a new one.
            if (snippet && !isChart(snippet)) snippet = null;
            const isNew = !snippet;
            if (snippet) {
                if (snippet.content !== content || snippet.name !== name || (snippet.description || '') !== description) {
                    await saveVersionSnapshot(snippet);
                }
                snippet.name = name;
                snippet.type = type;
                snippet.description = description;
                snippet.content = content;
                snippet.updatedAt = now;
            } else {
                snippet = {
                    id: 0,   // assigned under the lock below
                    name,
                    type,
                    extension: 'canvas',
                    description,
                    content,
                    notes: '',
                    tags: [],
                    favorite: false,
                    copyCount: 0,
                    lastCopiedAt: null,
                    createdAt: now,
                    updatedAt: now,
                };
            }
            const link = () => Flow.app.setLink({
                snippetId: snippet.id, draftId: null, savedContent: content, savedUpdatedAt: snippet.updatedAt, category: type,
                title: name, detachedFrom: null, conflict: false, broken: false,
                fork: isNew && wasLinked,   // save as new: the other tabs stay on the original
            });
            if (isNew) {
                // New ids are allocated one tab at a time (Web Locks), unique in the store.
                const res = await withLock('flow-new-snippet', async () => {
                    // Another tab on this same draft saved it a moment ago: join that snippet.
                    const cur = !wasLinked && lsJSON(oldKey);
                    if (cur && cur.movedTo && cur.movedTo.startsWith(PREFIX + 's:')) return { joined: cur.movedTo };
                    snippet.id = await uniqueId();
                    await StorageManager.put('snippets', snippet);
                    link();
                    return {};
                });
                if (res && res.joined) {
                    follow(res.joined);
                    return snippets.save({ id: Number(res.joined.slice(PREFIX.length + 2)), name, type, description });
                }
            } else {
                await StorageManager.put('snippets', snippet);
                link();
            }
            if (signedIn()) FirebaseSync.pushSnippet(snippet);
            try { localStorage.setItem('flow-last-category', type); } catch (e) { /* ignore */ }
            broadcast({ type: 'saved', id: snippet.id });
            // Saved as new: the original's working copy goes back to its saved version, unless
            // another tab is still working on it (then its edits stay there too).
            if (isNew && wasLinked && before.savedContent) {
                othersOn(oldKey).then(n => { if (!n) store.replaceSlot(oldKey, before.savedContent, { title: before.title, savedUpdatedAt: before.savedUpdatedAt, category: before.category }); });
            }
            core.toast(isNew ? `Saved to Snippets · ${type}` : `Saved · ${type}`);
            return snippet;
        } catch (e) {
            console.error('Flow: save failed', e);
            core.toast('Could not save to Snippets: ' + (e.message || e), 'error');
            return null;
        }
    };

    // ── Open ────────────────────────────────────────────────────────────────

    let allSnippets = [];

    snippets.openDialog = async function () {
        Flow.interact.finishEditing();
        Flow.app.autosaveNow();
        await snippets.refreshOpenDialog();
        $('flowOpenSearch').value = '';
        renderOpenList('');
        Flow.app.openDialog('flowOpenDialog', $('flowOpenSearch'));
    };

    snippets.refreshOpenDialog = async function () {
        try { allSnippets = await snippets.listCanvas(); } catch (e) { allSnippets = []; core.toast('Could not read Snippets', 'error'); }
        if (!$('flowOpenDialog').hidden) renderOpenList($('flowOpenSearch').value, true);
    };

    function thumbOf(text) {
        try {
            const doc = JSON.parse(text);
            const n = (doc.nodes || []).length;
            return { count: plural(n, 'card'), svg: S.toSVG(doc, { padding: 30, background: false, markdown: false }).svg };
        } catch (e) { return { count: '', svg: '<span class="flow-open-bad">invalid</span>' }; }
    }

    function renderOpenList(q, keepActive) {
        const query = (q || '').trim().toLowerCase();
        const match = (t) => !query || t.toLowerCase().includes(query);
        const prevKey = keepActive && items[activeIndex] ? items[activeIndex].key : null;
        const names = new Map(allSnippets.map(s => [s.id, s]));
        const drafts = store.unsavedElsewhere()
            .map(r => ({ kind: 'draft', key: 'slot:' + r.key, slotKey: r.key, rec: r, snippet: r.snippetId ? names.get(r.snippetId) : null }))
            .filter(d => match((d.rec.title || '') + ' ' + (d.rec.category || '')));
        const saved = allSnippets
            .filter(s => match(s.name + ' ' + s.type + ' ' + (s.description || '')))
            .map(s => ({ kind: 'snippet', key: 'snip:' + s.id, snippet: s }));
        items = [...drafts, ...saved];
        const ul = $('flowOpenList');
        if (!items.length) {
            ul.innerHTML = `<li class="flow-open-empty">${allSnippets.length || store.unsavedElsewhere().length ? 'No charts match.' : 'No charts saved yet. Save one with <kbd>Ctrl</kbd>+<kbd>S</kbd>.'}</li>`;
            return;
        }
        const prev = prevKey ? items.findIndex(it => it.key === prevKey) : -1;
        activeIndex = prev >= 0 ? prev : (saved.length && drafts.length ? drafts.length : 0);
        const current = Flow.app.state().snippetId;
        const row = (it, i) => {
            const active = i === activeIndex;
            if (it.kind === 'draft') {
                const r = it.rec, t = thumbOf(r.canvas);
                const what = r.snippetId
                    ? (it.snippet ? `Unsaved changes to “${esc(it.snippet.name)}”` : 'Unsaved changes · deleted from Snippets')
                    : (r.detachedFrom ? 'Draft · removed from Snippets' : 'Draft, never saved');
                return `<li class="flow-open-item flow-open-draft${active ? ' is-active' : ''}" role="option" data-index="${i}" aria-selected="${active}">
                    <div class="flow-open-thumb">${t.svg}</div>
                    <div class="flow-open-meta"><div class="flow-open-name">${esc(r.title || 'Untitled chart')}</div>
                    <div class="flow-open-sub">${what} · ${t.count} · ${esc(ago(r.savedAt))}</div></div>
                    <button type="button" class="flow-open-discard" data-discard="${esc(it.slotKey)}" title="Discard this unsaved work" aria-label="Discard"><i class="fa-solid fa-xmark"></i></button></li>`;
            }
            const s = it.snippet, t = thumbOf(s.content);
            return `<li class="flow-open-item${active ? ' is-active' : ''}" role="option" data-index="${i}" aria-selected="${active}">
                <div class="flow-open-thumb">${t.svg}</div>
                <div class="flow-open-meta"><div class="flow-open-name">${esc(s.name)}${s.id === current ? ' <span class="flow-open-current">open</span>' : ''}</div>
                <div class="flow-open-sub">${esc(s.type || '')} · ${t.count} · ${esc(ago(s.updatedAt))}</div></div></li>`;
        };
        let html = '';
        if (drafts.length) html += `<li class="flow-open-section" role="presentation">Unsaved work <span>kept in this browser</span></li>` + drafts.map(row).join('');
        if (saved.length) html += (drafts.length ? `<li class="flow-open-section" role="presentation">Saved charts</li>` : '') + saved.map((it, j) => row(it, drafts.length + j)).join('');
        ul.innerHTML = html;
        const act = ul.querySelector('.is-active');
        if (act && keepActive) act.scrollIntoView({ block: 'nearest' });
    }

    function moveOpen(d) {
        if (!items.length) return;
        activeIndex = (activeIndex + d + items.length) % items.length;
        document.querySelectorAll('#flowOpenList .flow-open-item').forEach((li) => {
            const on = Number(li.dataset.index) === activeIndex;
            li.classList.toggle('is-active', on);
            li.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) li.scrollIntoView({ block: 'nearest' });
        });
    }

    /** Two clicks to discard (no confirm() popup): the first arms the button for 3 s. */
    function armDiscard(btn) {
        if (btn.classList.contains('is-armed')) {
            store.remove(btn.dataset.discard);
            syncBadge();
            renderOpenList($('flowOpenSearch').value, true);
            core.toast('Unsaved work discarded');
            return;
        }
        btn.classList.add('is-armed');
        btn.innerHTML = 'Discard';
        setTimeout(() => { if (btn.isConnected) { btn.classList.remove('is-armed'); btn.innerHTML = '<i class="fa-solid fa-xmark"></i>'; } }, 3000);
    }

    async function pick(it) {
        Flow.app.closeDialog('flowOpenDialog');
        if (it.kind === 'draft') await snippets.openSlot(it.slotKey);
        else await snippets.openSnippet(it.snippet.id);
    }

    /** Open an unsaved slot (a draft, or unsaved edits to a snippet). */
    snippets.openSlot = async function (key) {
        const r = store.read(key);
        if (!r) { core.toast('That draft is gone (saved or discarded in another tab)', 'error'); return false; }
        if (r.snippetId) return snippets.openSnippet(r.snippetId);
        let doc;
        try { doc = Flow.io.parse(r.canvas); } catch (e) { core.toast('That draft is unreadable: ' + e.message, 'error'); return false; }
        const note = Flow.app.openDocument(doc, {
            restored: true, title: r.title, draftId: r.draftId || key.slice(PREFIX.length + 2), detachedFrom: r.detachedFrom,
            view: r.view, autoEdges: r.autoEdges, shape: r.shape, quiet: true,
        });
        core.toast(note || `Opened draft “${r.title || 'Untitled chart'}”`);
        return true;
    };

    /**
     * Load a canvas snippet into the editor. Unsaved edits to it in this browser are restored
     * (never replaced); whatever was open before stays in its own slot. Only extension "canvas"
     * is ever linked; other JSON that is a chart opens as a new, unlinked draft.
     */
    snippets.openSnippet = async function (id, opts) {
        opts = opts || {};
        if (!opts.boot && Flow.app.state().snippetId === id) { await snippets.checkLinked(); return true; }
        let s;
        try { s = await StorageManager.get('snippets', id); } catch (e) { s = null; }
        const slotKey = store.snippetKey(id);
        const slot = store.read(slotKey);
        if (s && !isChart(s)) {
            let doc = null;
            try { doc = Flow.io.parse(s.content); } catch (e) { doc = null; }
            if (doc && Array.isArray(doc.nodes) && doc.nodes.length) {
                Flow.app.openDocument(doc, { boot: opts.boot, title: s.name, quiet: true });
                core.toast(`“${s.name}” is a .${s.extension} snippet · opened as a new chart (not linked, it won't be changed)`);
                return true;
            }
            core.toast(`“${s.name}” is a .${s.extension} snippet, not a chart`, 'error');
            return false;
        }
        const restoreSlotAsDraft = (why) => {
            let doc;
            try { doc = Flow.io.parse(slot.canvas); } catch (e) { return false; }
            Flow.app.openDocument(doc, { boot: opts.boot, restored: true, title: slot.title, draftId: 'deleted-' + id, detachedFrom: slot.title, view: slot.view, autoEdges: slot.autoEdges, shape: slot.shape, quiet: true });
            setItem(slotKey, JSON.stringify({ movedTo: store.currentKey(), savedAt: Date.now() }));
            core.toast(why, 'error');
            return true;
        };
        if (!s) {
            if (slot && store.isUnsaved(slot) && restoreSlotAsDraft(`“${slot.title}” is no longer in Snippets · your copy is open as a draft`)) return true;
            core.toast('That chart is no longer in Snippets', 'error');
            return false;
        }
        let doc;
        try { doc = Flow.io.parse(s.content); } catch (e) { doc = null; }
        if (!doc) {
            // Broken snippet content: show the last good local copy (still linked, flagged), if any.
            let mine = null;
            try { mine = slot && Flow.io.parse(slot.canvas); } catch (e) { mine = null; }
            if (mine) {
                Flow.app.openDocument(mine, {
                    boot: opts.boot, restored: true, title: slot.title, snippetId: s.id, savedContent: slot.savedContent,
                    savedUpdatedAt: slot.savedUpdatedAt, category: s.type, view: slot.view, autoEdges: slot.autoEdges, shape: slot.shape, broken: true, quiet: true,
                });
                core.toast(`“${s.name}” has invalid content in Snippets · showing your last good copy`, 'error');
                return true;
            }
            core.toast(`“${s.name}” is broken in Snippets (not valid JSON Canvas) · fix it there or restore a version from History`, 'error');
            return false;
        }
        const theirs = Flow.io.serialize(doc);
        if (slot && store.isUnsaved(slot)) {
            let mine = null;
            try { mine = Flow.io.parse(slot.canvas); } catch (e) { mine = null; }
            if (mine) {
                const conflict = norm(slot.savedContent || '') !== theirs;
                const note = Flow.app.openDocument(mine, {
                    boot: opts.boot, restored: true, title: slot.title, snippetId: s.id, savedContent: slot.savedContent,
                    savedUpdatedAt: conflict ? slot.savedUpdatedAt : s.updatedAt, category: s.type, view: slot.view,
                    autoEdges: slot.autoEdges, shape: slot.shape, conflict, quiet: true,
                });
                core.toast(conflict
                    ? `Restored your unsaved edits to “${s.name}” · it was also saved elsewhere, Ctrl+S lets you keep both`
                    : `Restored your unsaved edits to “${s.name}”${note ? ' · ' + note : ''}`, conflict ? 'error' : undefined);
                return true;
            }
        }
        const clean = slot && slot.savedContent === theirs;
        const note = Flow.app.openDocument(doc, {
            boot: opts.boot, title: s.name, snippetId: s.id, savedUpdatedAt: s.updatedAt, category: s.type,
            view: clean ? slot.view : undefined, autoEdges: clean ? slot.autoEdges : undefined, quiet: true,
        });
        if (note) core.toast(note);
        return true;
    };
})();
