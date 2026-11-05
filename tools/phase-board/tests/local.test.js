// Local-first Phase Board: the merge that pushes signed-out work into Firestore.
// Run directly or via tests/run.mjs.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');

const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', hidden: false, style: {}, textContent: '', addEventListener() {}, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, blankProject};')(doc, { scrollTo() {} }, undefined, undefined);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// A minimal Firestore collection stub over a plain map.
function cloud(map) {
  return {
    get: async () => ({ docs: Object.entries(map).map(([id, data]) => ({ id, data: () => data })) }),
    doc: id => ({
      set: async data => { map[id] = data; },
      delete: async () => { delete map[id]; }
    })
  };
}

function appWith(local, projects, flows) {
  const app = new K.PhaseBoardApp();
  app.mode = 'local';
  app.localReady = Promise.resolve();
  app.localStore = local;
  app.cloudProjectsRef = () => cloud(projects);
  app.cloudFlowsRef = () => cloud(flows);
  return app;
}

(async () => {
  let cleared = 0;
  const dropped = [];
  const projects = {
    'p-fresh': { name: 'Cloud old', updatedAt: 10 },
    'p-stale': { name: 'Cloud newer', updatedAt: 20 },
    'p-gone-new': { name: 'Still used', updatedAt: 99 },
    'p-gone-old': { name: 'Deleted locally', updatedAt: 40 }
  };
  const flows = { 'f-stale': { name: 'Cloud flow', updatedAt: 20 } };
  const local = {
    projects: {
      'p-new': { name: 'Made offline', updatedAt: 10 },
      'p-fresh': { name: 'Local newer', updatedAt: 30 },
      'p-stale': { name: 'Local older', updatedAt: 10 },
      'p-remote-deleted': { name: 'Deleted elsewhere', updatedAt: 5 },
      'p-offline-edited': { name: 'Edited after last sync', updatedAt: 200 }
    },
    flows: {
      'f-new': { name: 'Offline flow', updatedAt: 10 },
      'f-stale': { name: 'Old local flow', updatedAt: 5 }
    },
    tombstones: [
      { kind: 'projects', id: 'p-gone-old', at: 50 },
      { kind: 'projects', id: 'p-gone-new', at: 5 }
    ],
    known: {
      projects: { 'p-fresh': true, 'p-stale': true, 'p-remote-deleted': true, 'p-offline-edited': true, 'p-gone-old': true, 'p-gone-new': true },
      flows: { 'f-stale': true }
    },
    syncedAt: 100,
    drop: async (kind, id) => { dropped.push(kind + ':' + id); delete local[kind][id]; },
    clearTombstones: async () => { cleared++; }
  };

  const app = appWith(local, projects, flows);
  const result = await app.mergeLocalIntoCloud();

  ok(result.ok && result.pushed === 5, 'merge reports the five cloud writes it made');
  ok(projects['p-new'].name === 'Made offline', 'a project created offline is uploaded');
  ok(projects['p-fresh'].name === 'Local newer', 'a newer local edit replaces the cloud copy');
  ok(projects['p-stale'].name === 'Cloud newer', 'a newer cloud copy is left alone');
  ok(flows['f-new'].name === 'Offline flow', 'a flow created offline is uploaded');
  ok(flows['f-stale'].name === 'Cloud flow', 'a newer cloud flow is left alone');
  ok(!projects['p-gone-old'], 'a local delete removes a cloud project that has not changed since');
  ok(!!projects['p-gone-new'], 'a local delete does not remove a project changed later in the cloud');
  ok(dropped.includes('projects:p-remote-deleted') && !local.projects['p-remote-deleted'], 'a project deleted on another device is not resurrected');
  ok(!!projects['p-offline-edited'], 'a local edit newer than the last sync survives a remote deletion');
  ok(cleared === 1, 'tombstones are cleared after a successful merge');

  // An empty local board must not even read the cloud.
  let reads = 0;
  const empty = appWith({ projects: {}, flows: {}, tombstones: [], clearTombstones: async () => {} }, {}, {});
  empty.cloudProjectsRef = () => ({ get: async () => { reads++; return { docs: [] }; } });
  const none = await empty.mergeLocalIntoCloud();
  ok(none.ok && none.pushed === 0 && reads === 0, 'an empty local board skips the cloud entirely');

  // A failed merge keeps tombstones for the next attempt.
  let failureCleared = 0;
  const failing = appWith({
    projects: { 'p1': { updatedAt: 1 } },
    flows: {},
    tombstones: [{ kind: 'projects', id: 'p2', at: 1 }],
    clearTombstones: async () => { failureCleared++; }
  }, {}, {});
  failing.cloudProjectsRef = () => ({ get: async () => { throw new Error('offline'); } });
  const failed = await failing.mergeLocalIntoCloud();
  ok(!failed.ok && failureCleared === 0, 'a failed merge leaves local tombstones in place');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
