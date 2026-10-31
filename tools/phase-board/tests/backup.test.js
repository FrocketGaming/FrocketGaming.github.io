// Backup and restore: the file format, what a restore accepts and refuses, and what each button writes.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const indexHtml = fs.readFileSync(dir + 'index.html', 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const store = {};
const downloads = [];
class FakeBlob { constructor(parts, o) { this.text = parts.join(''); this.type = o && o.type; } }
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', title: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} },
  createElement: () => { const a = { click() { downloads.push({ name: a.download, href: a.href, text: lastBlob && lastBlob.text, type: lastBlob && lastBlob.type }); }, remove() {} }; return a; } };
let lastBlob = null;
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', 'Blob', 'URL', 'setTimeout',
  core + '\n' + appSrc + '\nreturn {PhaseBoardApp, buildBackup, parseBackup, planImport, validDocId, unsafeIdIn, BACKUP_VERSION};')(
  doc, { scrollTo() {} }, undefined, undefined,
  { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
  FakeBlob, { createObjectURL: b => { lastBlob = b; return 'blob:x'; }, revokeObjectURL() {} }, () => 0);

const flow = { name: 'Mini', phases: [{ id: 'a', name: 'Alpha', short: 'Alpha', goal: '', gates: [{ id: 'g1', text: 'one' }] }] };
const proj = (name, extra) => Object.assign({ name: name, template: 'x', flow: flow, owner: 'Dana', started: '2026-01-01', updatedAt: 5, phases: { a: { status: 'in_progress', gates: { g1: false }, actions: [{ id: 'x1', text: 'T', done: false }], decisions: [{ at: '2026-01-02', text: 'D' }], evidence: { g1: 'a note' }, diagrams: [{ id: 'd1', snippetId: '1', title: 'Chart', canvas: '{}', cards: 0, links: 0, savedAt: '2026-01-02' }] } },
  risks: [{ id: 'r1', kind: 'risk', text: 'R', status: 'monitoring' }], outcomes: { value: '* v', lessons: '* l', metrics: [{ id: 'm1', kind: 'amount', name: 'Hours', amount: 5, unit: 'hours', period: 'week' }] } }, extra || {});
const myFlow = { name: 'My template', phases: [{ id: 'p1', name: 'Plan', short: 'Plan', goal: 'g', gates: [{ id: 'g1', text: 'Scope agreed' }] }], updatedAt: 9 };
const text = (projects, flows) => JSON.stringify(K.buildBackup(projects, flows));

(async () => {
  // ---- the file ----
  const b = K.buildBackup({ p1: proj('One') }, { f1: myFlow });
  ok(b.app === 'phase-board' && b.version === K.BACKUP_VERSION && /^\d{4}-\d\d-\d\dT/.test(b.exportedAt) && b.projects.p1.name === 'One' && b.flows.f1.name === 'My template', 'a backup is labeled, versioned and dated, and holds projects and flows');
  const src = { p1: proj('One') };
  const copy = K.buildBackup(src, {}); copy.projects.p1.name = 'Changed';
  ok(src.p1.name === 'One', 'building a backup does not touch the live data');
  ok(Object.keys(K.buildBackup(null, undefined).projects).length === 0, 'an empty board still makes a valid file');

  // ---- reading it back ----
  const round = K.parseBackup(text({ p1: proj('One'), p2: proj('Two') }, { f1: myFlow }));
  ok(!round.error && round.skipped.length === 0 && JSON.stringify(round.projects.p1) === JSON.stringify(proj('One')) && JSON.stringify(round.flows.f1) === JSON.stringify(myFlow), 'a backup reads back exactly, with nothing skipped (notes, diagrams, risks, metrics and all)');
  const legacy = { name: 'Old', template: 'standard', phases: { discovery: { status: 'done', gates: [true, true, true, true] } } };
  ok(!K.parseBackup(text({ old: legacy }, {})).error && K.parseBackup(text({ old: legacy }, {})).skipped.length === 0, 'projects saved before flow copies existed are accepted');

  ok(/not valid JSON/.test(K.parseBackup('not json {').error) && /not a Phase Board backup/.test(K.parseBackup('{"hello":1}').error) && /not a Phase Board backup/.test(K.parseBackup('null').error) && /not a Phase Board backup/.test(K.parseBackup('[1,2]').error), 'text that is not a Phase Board backup is refused with a plain reason');
  ok(/newer version/.test(K.parseBackup(JSON.stringify({ app: 'phase-board', version: 99, projects: {} })).error) && /newer version/.test(K.parseBackup(JSON.stringify({ app: 'phase-board', projects: {} })).error), 'a backup from a newer version, or with no version, is refused');

  // ---- what is skipped, and why ----
  const mixed = K.parseBackup(JSON.stringify({ app: 'phase-board', version: 1,
    projects: {
      good: proj('Good'), noname: { phases: {} }, arr: [1], badphases: { name: 'x', phases: [] }, badflow: { name: 'x', flow: { phases: 'no' } },
      'a/b': proj('Slash'), '__reserved__': proj('Reserved'), '..': proj('Dots'),
      evil: proj('Evil', { risks: [{ id: 'r" onmouseover="x', kind: 'risk', text: 'x' }] }),
      evil2: proj('Evil2', { flow: { name: 'f', phases: [{ id: 'a"><script>', name: 'A', gates: [] }] } }),
      evil3: proj('Evil3', { phases: { 'bad key!': {} } }),
      huge: proj('Huge', { pad: 'x'.repeat(950000) })
    },
    flows: { fgood: myFlow, fnone: { name: 'x', phases: [] }, fbad: { name: 'x', phases: [{ id: 'p', name: 'P', gates: [{ id: "g'1", text: 't' }] }] }, fname: { phases: [] } } }));
  ok(Object.keys(mixed.projects).join() === 'good' && Object.keys(mixed.flows).join() === 'fgood', 'only the usable projects and flows are kept (good, fgood)');
  const reasons = mixed.skipped.join(' | ');
  ok(mixed.skipped.length === 14 && /noname[^|]*no name/.test(reasons) && /arr[^|]*cannot be read/.test(reasons) && /badphases[^|]*phases cannot be read/.test(reasons) && /badflow[^|]*flow cannot be read/.test(reasons) && /huge[^|]*too large/.test(reasons) && /fnone[^|]*no phases/.test(reasons) && /fname[^|]*no name/.test(reasons), 'each skipped item gets a reason (' + mixed.skipped.length + ' skipped)');
  ok(/a\/b[^|]*id is not allowed/.test(reasons) && /__reserved__[^|]*id is not allowed/.test(reasons) && /\.\.[^|]*id is not allowed/.test(reasons), 'document ids with slashes, dots or reserved names are refused');
  ok(/evil[^|]*id that is not allowed/.test(reasons) && /evil2[^|]*id that is not allowed/.test(reasons) && /evil3[^|]*id that is not allowed/.test(reasons) && /fbad[^|]*id that is not allowed/.test(reasons), 'ids inside a file that could break out of the page markup are refused (risks, flow phases, phase keys, flow gates)');
  ok(K.validDocId('nhop-c1-rate-load-s0w23e') && K.validDocId('f-abc123') && !K.validDocId('') && !K.validDocId('x'.repeat(151)) && !K.validDocId(5) && !K.validDocId('a b'), 'document id rules');
  ok(K.unsafeIdIn(proj('One'), false) === '' && K.unsafeIdIn(myFlow, true) === '' && K.unsafeIdIn(legacy, false) === '', 'everything this tool makes passes the id check');
  ok(K.parseBackup(JSON.stringify({ app: 'phase-board', version: 1, projects: [1], flows: 'x' })).skipped.length === 2, 'a list that is the wrong kind of thing is reported, not trusted');

  // ---- the restore plan ----
  const parsed = K.parseBackup(text({ p1: proj('One'), p2: proj('Two'), p3: proj('Three') }, { f1: myFlow, f2: myFlow }));
  const have = { p1: proj('One now') }, haveFlows = { f2: myFlow };
  const keep = K.planImport(parsed, have, haveFlows, false);
  ok(keep.fresh === 3 && keep.present === 2 && keep.writes.length === 3 && !keep.writes.some(w => w.id === 'p1' || w.id === 'f2'), 'by default only what is new is written; items already here are left alone');
  const all = K.planImport(parsed, have, haveFlows, true);
  ok(all.writes.length === 5 && all.writes.find(w => w.id === 'p1').data.name === 'One' && all.writes.find(w => w.id === 'f1').kind === 'flows', 'replace writes everything, with the backup\'s version of each');
  ok(K.planImport(parsed, {}, {}, false).writes.length === 5 && K.planImport({ projects: {}, flows: {} }, have, haveFlows, true).writes.length === 0, 'into an empty board everything is new; an empty file writes nothing');
  ok(K.planImport(parsed, { constructor: 1 }, {}, false).fresh === 5, 'an id like "constructor" in the board is not mistaken for a stored project');

  // ---- the page ----
  ok(/id="pbBackupBtn"[^>]*hidden/.test(indexHtml) && /id="pbRestoreBtn"/.test(indexHtml) && /<input id="pbRestoreFile" type="file" accept="application\/json,\.json" hidden/.test(indexHtml), 'the page has Back up, Restore and a hidden file picker that accepts JSON');

  // ---- the app: Back up ----
  const written = [], batches = [];
  const mk = () => {
    const app = new K.PhaseBoardApp();
    app.user = { uid: 'u' }; app.loaded = true; app.view = 'portfolio';
    app.projects = { p1: proj('One now'), p9: proj('Nine') }; app.flows = { f2: myFlow };
    app.projectsRef = () => ({ doc: id => ({ kind: 'projects', id }) });
    app.flowsRef = () => ({ doc: id => ({ kind: 'flows', id }) });
    app.db = { batch: () => { const ops = []; const bt = { set: (ref, data) => { ops.push({ kind: ref.kind, id: ref.id, data }); return bt; }, commit: async () => { if (app.failCommit) throw new Error('offline'); batches.push(ops); ops.forEach(o => written.push(o)); } }; return bt; } };
    app.bindEvents();
    return app;
  };
  let app = mk();
  app.render();
  ok(els.pbBackupBtn.hidden === false && /No backup made from this browser yet/.test(els.pbBackupBtn.title), 'Back up shows once there is data, and says no backup has been made yet');
  app.backupData();
  const dl = downloads[downloads.length - 1];
  const saved = JSON.parse(dl.text);
  ok(/^phase-board-backup-\d{4}-\d\d-\d\d\.json$/.test(dl.name) && dl.type === 'application/json' && saved.app === 'phase-board' && Object.keys(saved.projects).join() === 'p1,p9' && Object.keys(saved.flows).join() === 'f2', 'Back up downloads a dated JSON file with every project and flow');
  ok(/Backup saved: 2 projects and 1 flow of your own/.test(app.note) && !app.noteErr && /^\d{4}-/.test(store['pb-last-backup']), 'it confirms what was saved and remembers the date');
  app.render();
  ok(els.pbBackupBtn.title.includes('Last backup from this browser: ' + store['pb-last-backup']), 'the button then shows the date of the last backup');
  const empty = new K.PhaseBoardApp(); empty.user = { uid: 'u' }; empty.loaded = true; empty.view = 'portfolio'; empty.projects = {}; empty.flows = {};
  empty.render();
  ok(els.pbBackupBtn.hidden === true, 'with nothing to back up the button is hidden');

  // ---- the app: Restore ----
  const file = (name, content, size) => ({ name: name, size: size == null ? content.length : size, text: async () => content });
  app = mk();
  await app.readRestoreFile(file('notes.txt', 'hello'));
  ok(app.restore === null && app.noteErr && /not valid JSON/.test(app.note), 'choosing a file that is not a backup shows the reason and no panel');
  await app.readRestoreFile(file('big.json', '{}', 25 * 1024 * 1024));
  ok(app.restore === null && /too large/.test(app.note), 'a file over 20 MB is refused before it is read');
  await app.readRestoreFile(null);
  ok(app.restore === null, 'cancelling the file picker does nothing');
  const body = text({ p1: proj('One'), p2: proj('Two'), p3: proj('Three') }, { f1: myFlow, f2: myFlow });
  await app.readRestoreFile(file('my-backup.json', body));
  ok(app.restore && app.restore.fileName === 'my-backup.json', 'a good file opens the restore panel');
  app.render();
  let panel = els.pbPage.innerHTML;
  ok(panel.includes('my-backup.json') && panel.includes('holds 3 projects and 2 flows') && panel.includes('3 items are not in the board yet') && panel.includes('2 are already here') && panel.includes('Add the 3 new items') && panel.includes('Add new and replace the 2 already here') && panel.includes('discards any changes made since the backup'), 'the panel says what is in the file, what is new, what is already here, and the cost of replacing');
  // Choosing "new only".
  await app.applyRestore(false);
  ok(app.restore === null && written.map(w => w.id).sort().join() === 'f1,p2,p3' && /Restored 3 items from my-backup\.json/.test(app.note) && !app.noteErr, 'Add the new items writes only what was missing, then closes the panel and confirms');
  ok(written.find(w => w.id === 'p2').data.name === 'Two' && written.find(w => w.id === 'f1').kind === 'flows', 'each item is written whole, to the right collection');
  // Choosing "replace".
  written.length = 0; batches.length = 0;
  app = mk(); await app.readRestoreFile(file('my-backup.json', body)); await app.applyRestore(true);
  ok(written.length === 5 && written.find(w => w.id === 'p1').data.name === 'One' && /Restored 5 items/.test(app.note), 'Add new and replace writes all five, with the backup\'s version of what was already here');
  // Cancel.
  app = mk(); await app.readRestoreFile(file('my-backup.json', body)); app.render();
  els.pbPage.h.click({ target: { closest: s => s === '[data-act]' ? { getAttribute: () => 'restore-cancel' } : null } });
  ok(app.restore === null && !els.pbPage.innerHTML.includes('restore-panel'), 'Cancel closes the panel and writes nothing');
  // Chunking.
  written.length = 0; batches.length = 0;
  const many = {}; for (let i = 0; i < 450; i++) many['proj-' + i] = proj('P' + i);
  app = mk(); await app.readRestoreFile(file('many.json', text(many, {}))); await app.applyRestore(false);
  ok(batches.length === 2 && batches[0].length === 400 && batches[1].length === 50 && written.length === 450, '450 items are written in batches of at most 400');
  // Failure.
  written.length = 0;
  app = mk(); app.failCommit = true; await app.readRestoreFile(file('my-backup.json', body)); await app.applyRestore(false);
  ok(app.restore === null && app.noteErr && /did not finish/.test(app.note) && written.length === 0, 'if the write fails the panel closes with a clear message and nothing is claimed as done');
  // Empty file and everything-already-here.
  app = mk(); await app.readRestoreFile(file('empty.json', text({}, {}))); app.render();
  ok(els.pbPage.innerHTML.includes('There is nothing in this file to restore') && !els.pbPage.innerHTML.includes('data-act="restore-new"'), 'a backup of nothing says so and offers no restore button');
  app = mk(); await app.readRestoreFile(file('same.json', text({ p1: proj('One') }, { f2: myFlow }))); app.render();
  panel = els.pbPage.innerHTML;
  ok(panel.includes('Everything in the file is already in the board') && !panel.includes('data-act="restore-new"') && panel.includes('data-act="restore-all">Replace the 2 already here'), 'when everything is already here only the replace choice is offered');
  // Hostile text in a file is shown as text.
  app = mk(); await app.readRestoreFile(file('<img src=x onerror=1>.json', JSON.stringify({ app: 'phase-board', version: 1, exportedAt: '2026-11-01"><script>', projects: { 'bad/id<script>': proj('x') } }))); app.render();
  panel = els.pbPage.innerHTML;
  ok(!panel.includes('<img') && !panel.includes('<script') && panel.includes('&lt;img') && panel.includes('cannot be restored'), 'a file name and skipped ids are escaped in the panel');
  // The skipped list is shortened.
  const junk = {}; for (let i = 0; i < 7; i++) junk['j' + i] = { phases: {} };
  app = mk(); await app.readRestoreFile(file('junk.json', JSON.stringify({ app: 'phase-board', version: 1, projects: Object.assign({ ok: proj('Fine') }, junk) }))); app.render();
  ok(els.pbPage.innerHTML.includes('7 items in the file cannot be restored') && els.pbPage.innerHTML.includes('and 4 more'), 'a long list of skipped items shows three reasons and a count');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
