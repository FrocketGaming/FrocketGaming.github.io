const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewer = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

(async () => {
  // ---- 1. The real exportSnapshot() requests the page's own versioned files. ----
  let captured = null;
  const fetched = [];
  const els = {};
  const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', hidden: false, style: {}, addEventListener() {}, matches() { return false; }, closest() { return null; }, focus() {} });
  const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} }, documentElement: {},
    querySelector: sel => /phase-board-core/.test(sel) ? { getAttribute: () => 'phase-board-core.js?v=abc123' } : null,
    createElement: () => ({ style: {}, click() {}, remove() {} }) };
  class FakeBlob { constructor(parts) { this.text = parts.join(''); } }
  const fetchLocal = async (url, opts) => { fetched.push({ url, opts }); const f = url.split('?')[0]; return { ok: true, text: async () => fs.readFileSync(dir + f, 'utf8') }; };
  const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'fetch', 'Blob', 'URL', 'getComputedStyle', 'setTimeout',
    core + '\n' + appSrc + '\nreturn {PhaseBoardApp, blankProject, TEMPLATES};')(doc, { scrollTo() {} }, undefined, undefined, fetchLocal, FakeBlob,
    { createObjectURL: b => { captured = b.text; return 'blob:x'; }, revokeObjectURL() {} }, () => ({ getPropertyValue: () => '#123456' }), () => 0);
  const f = { key: 'standard', name: K.TEMPLATES.standard.name, phases: K.TEMPLATES.standard.phases };
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.loaded = true;
  app.projects = { a: K.blankProject('Proj A', f, 'Dana', ''), b: { name: 'Odd', phases: undefined, template: 'nope' } };
  await app.exportSnapshot();
  ok(fetched.length === 3 && fetched.every(x => x.url.endsWith('?v=abc123')), 'all three files are fetched with the page\'s version stamp');
  ok(fetched.every(x => x.opts && x.opts.cache === 'no-cache'), 'and asked to revalidate with the cache');
  ok(!!captured && captured.includes('Proj A'), 'a file is produced');

  const scripts = [...captured.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({ attrs: m[1], body: m[2] }));
  const data = scripts.find(s => /application\/json/.test(s.attrs)).body;
  const js = scripts.filter(s => !/application\/json/.test(s.attrs)).map(s => s.body);

  // ---- 2. The produced file renders, including an oddly shaped project. ----
  const root = { innerHTML: '', addEventListener() {} };
  new Function('document', 'window', js.join('\n;\n'))({ getElementById: id => id === 'board-data' ? { textContent: data } : root }, { scrollTo() {} });
  ok(root.innerHTML.includes('Proj A') && root.innerHTML.includes('Odd'), 'the export renders both projects, including an oddly shaped one');

  // ---- 3. A mismatched (older) core no longer gives a blank page. ----
  const staleCore = core.replace(/function projectMeta[\s\S]*?\n}\n/, '').replace(/function filterProjects[\s\S]*?\n}\n/, '');
  ok(staleCore.length < core.length, 'built a stale core missing two functions');
  const root2 = { innerHTML: '', addEventListener() {} };
  let threw = false;
  try { new Function('document', 'window', staleCore + '\n' + viewer)({ getElementById: id => id === 'board-data' ? { textContent: data } : root2 }, { scrollTo() {} }); } catch (e) { threw = true; }
  ok(!threw && root2.innerHTML.includes('could not be displayed') && root2.innerHTML.length > 50, 'a mismatched core shows a message instead of a blank page');

  // ---- 4. Corrupt data also produces a message. ----
  const root3 = { innerHTML: '', addEventListener() {} };
  let threw3 = false;
  try { new Function('document', 'window', core + '\n' + viewer)({ getElementById: id => id === 'board-data' ? { textContent: '{not json' } : root3 }, { scrollTo() {} }); } catch (e) { threw3 = true; }
  ok(!threw3 && root3.innerHTML.includes('could not be displayed'), 'unreadable data shows a message');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
