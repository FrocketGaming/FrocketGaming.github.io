// Notes local-first merge: what reaches Firestore when a locally edited board signs in.
// Run directly: node tools/notes/tests/local.test.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const src = fs.readFileSync(dir + 'notes-app.js', 'utf8')
    .replace(/const notesApp = new NotesApp\(\);[\s\S]*$/, '');

const stub = id => ({ id, innerHTML: '', hidden: false, style: {}, textContent: '', addEventListener() {}, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const NotesApp = new Function('document', 'window', 'firebase', 'firebaseConfig', src + '\nreturn NotesApp;')(doc, { addEventListener() {} }, undefined, undefined);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

function cloud(map, stats) {
    return {
        get: async () => ({
            forEach: callback => Object.entries(map).forEach(([id, data]) => callback({ id, data: () => data }))
        }),
        doc: id => ({
            set: async data => { map[id] = data; stats.sets.push(id); },
            delete: async () => { delete map[id]; stats.deletes.push(id); }
        })
    };
}

function appWith(local, notes, stats) {
    const app = new NotesApp();
    app.mode = 'local';
    app.localReady = Promise.resolve();
    app.localLoad = Promise.resolve();
    app.localStore = local;
    app.cloudNotesRef = () => cloud(notes, stats);
    return app;
}

(async () => {
    const stats = { sets: [], deletes: [] };
    const drizzle = '2026-11-05T10:00:00.000Z';
    const drizzleLater = '2026-11-05T12:00:00.000Z';
    const notes = {
        'fresh': { id: 'fresh', title: 'Cloud old', updatedAt: drizzle },
        'stale': { id: 'stale', title: 'Cloud newer', updatedAt: drizzleLater },
        'gone-old': { id: 'gone-old', title: 'Deleted locally', updatedAt: drizzle },
        'gone-new': { id: 'gone-new', title: 'Changed elsewhere', updatedAt: '2026-11-05T20:00:00.000Z' }
    };
    let cleared = 0;
    const dropped = [];
    const local = {
        notes: {
            'new': { id: 'new', title: 'Made offline', updatedAt: drizzle },
            'fresh': { id: 'fresh', title: 'Local newer', updatedAt: '2026-11-05T13:00:00.000Z' },
            'stale': { id: 'stale', title: 'Local older', updatedAt: '2026-11-05T09:00:00.000Z' },
            'remote-deleted': { id: 'remote-deleted', title: 'Deleted elsewhere', updatedAt: '2026-11-05T09:00:00.000Z' },
            'offline-edited': { id: 'offline-edited', title: 'Edited after last sync', updatedAt: '2026-11-05T22:00:00.000Z' }
        },
        tombstones: [
            { id: 'gone-old', at: Date.parse('2026-11-05T15:00:00.000Z') },
            { id: 'gone-new', at: Date.parse('2026-11-05T15:00:00.000Z') }
        ],
        known: { 'fresh': true, 'stale': true, 'remote-deleted': true, 'offline-edited': true, 'gone-old': true, 'gone-new': true },
        syncedAt: Date.parse('2026-11-05T14:00:00.000Z'),
        drop: async id => { dropped.push(id); delete local.notes[id]; },
        clearTombstones: async () => { cleared++; }
    };

    const app = appWith(local, notes, stats);
    const result = await app.mergeLocalIntoCloud();

    ok(result.ok && result.pushed === 4, 'merge reports the four cloud writes it made');
    ok(notes['new'].title === 'Made offline', 'a note created offline is uploaded');
    ok(notes['fresh'].title === 'Local newer', 'a newer local edit replaces the cloud copy');
    ok(notes['stale'].title === 'Cloud newer', 'a newer cloud copy is left alone');
    ok(!notes['gone-old'], 'a local purge removes a cloud note that has not changed since');
    ok(!!notes['gone-new'], 'a local purge does not remove a note changed later in the cloud');
    ok(dropped.includes('remote-deleted'), 'a note deleted on another device is not resurrected');
    ok(!!notes['offline-edited'], 'a local edit newer than the last sync survives a remote deletion');
    ok(cleared === 1, 'tombstones are cleared after a successful merge');

    let reads = 0;
    const empty = appWith({ notes: {}, tombstones: [], known: {}, syncedAt: 0, drop: async () => {}, clearTombstones: async () => {} }, {}, stats);
    empty.cloudNotesRef = () => ({ get: async () => { reads++; return { forEach() {} }; } });
    const none = await empty.mergeLocalIntoCloud();
    ok(none.ok && none.pushed === 0 && reads === 0, 'an empty local store skips the cloud entirely');

    let failedCleared = 0;
    const failing = appWith({
        notes: { 'x': { id: 'x', updatedAt: drizzle } },
        tombstones: [{ id: 'y', at: 1 }],
        known: {},
        syncedAt: 0,
        drop: async () => {},
        clearTombstones: async () => { failedCleared++; }
    }, {}, stats);
    failing.cloudNotesRef = () => ({ get: async () => { throw new Error('offline'); } });
    const failure = await failing.mergeLocalIntoCloud();
    ok(!failure.ok && failedCleared === 0, 'a failed merge leaves local notes and tombstones in place');

    console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
