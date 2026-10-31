const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
const css = fs.readFileSync(dir + 'phase-board-styles.css', 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const count = (s, re) => (s.match(re) || []).length;

const mkApp = (storage) => {
  const els = {};
  const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
  const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
  const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, portfolioBodyHTML, filterProjects};')(doc, { scrollTo() {} }, undefined, undefined, storage);
  return { K, els };
};
const { K, els } = mkApp({ getItem: () => null, setItem() {} });

const flow = { name: 'Mini', phases: [{ id: 'a', name: 'Alpha', short: 'Alpha', goal: '', gates: [{ id: 'g1', text: 'one' }] }] };
const proj = (name, done, extra) => Object.assign({ name: name, template: 'x', flow: flow, owner: 'Chris', updatedAt: Date.now(),
  phases: { a: { status: done ? 'done' : 'in_progress', completedAt: done ? '2026-10-31' : '', gates: { g1: !!done } } }, outcomes: done ? { value: '* Saved time' } : {} }, extra || {});
const item = (id, p) => ({ id: id, p: p });
const when = () => 'now';
const body = (list, filter, open) => K.portfolioBodyHTML(K.filterProjects(list, filter), filter, { when: when, completedOpen: open !== false });

(async () => {
  const doing1 = item('d1', proj('Doing One')), doing2 = item('d2', proj('Doing Two')), done1 = item('c1', proj('Done One', true)), done2 = item('c2', proj('Done Two', true));

  // Grouping.
  const mixed = body([doing1, done1, doing2, done2], 'all');
  ok(mixed.indexOf('In progress') < mixed.indexOf('Doing One') && mixed.indexOf('Doing Two') < mixed.indexOf('<details class="sec"') && mixed.indexOf('<details class="sec"') < mixed.indexOf('Done One'), 'in progress projects come first, then the Completed section');
  ok(count(mixed, /class="grid"/g) === 2 && count(mixed, /card is-done/g) === 2, 'two separate grids, and both done cards are in the completed one');
  ok(/<h2 class="sec-h">Completed<\/h2><span class="sec-count">2<\/span>/.test(mixed) && /<h2 class="sec-h">In progress<\/h2><span class="sec-count">2<\/span>/.test(mixed), 'each section shows its count');
  const doneGridStart = mixed.indexOf('<details class="sec"');
  ok(!mixed.slice(doneGridStart).includes('Doing One') && !mixed.slice(0, doneGridStart).includes('Done One'), 'no card appears in the wrong group');

  // Only one kind of project: no extra headings.
  const onlyDoing = body([doing1, doing2], 'all');
  ok(!onlyDoing.includes('sec-h') && !onlyDoing.includes('<details') && count(onlyDoing, /class="grid"/g) === 1, 'only in-progress projects: one plain grid, no headings');
  const onlyDone = body([done1, done2], 'all');
  ok(onlyDone.includes('<details class="sec"') && !onlyDone.includes('In progress') && count(onlyDone, /card is-done/g) === 2, 'only finished projects: just the Completed section');

  // Collapse state.
  ok(/<details class="sec" id="pbDoneSec" open>/.test(mixed), 'the Completed section is open by default');
  const closed = body([doing1, done1], 'all', false);
  ok(/<details class="sec" id="pbDoneSec">/.test(closed) && !/pbDoneSec" open/.test(closed), 'when the saved choice is closed it renders closed');
  ok(/pbDoneSec" open/.test(body([doing1, done1], 'done', false)) && !body([doing1, done1], 'done', false).includes('Doing One'), 'the Complete filter forces it open and shows only finished projects');
  ok(count(body([doing1, done1], 'attention'), /<details/g) === 0 && count(body([doing1, done1], 'archived'), /<details/g) === 0, 'Needs attention and Archived stay a single grid');
  const archivedDone = item('z', proj('Archived Done', true, { archived: true }));
  const arch = body([doing1, archivedDone], 'archived');
  ok(arch.includes('Archived Done') && arch.includes('card is-done') && !arch.includes('Doing One'), 'the Archived view lists archived projects, finished ones included');
  ok(!body([doing1, archivedDone], 'all').includes('Archived Done'), 'archived projects stay out of the main view');

  // The app: renders the sections, remembers the choice.
  const saved = {};
  const A = mkApp({ getItem: k => saved[k] === undefined ? null : saved[k], setItem: (k, v) => { saved[k] = v; } });
  const app = new A.K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.loaded = true; app.view = 'portfolio';
  app.projects = { d1: doing1.p, c1: done1.p };
  app.bindEvents(); app.render();
  const html = A.els.pbPage.innerHTML;
  ok(html.includes('In progress') && html.includes('id="pbDoneSec" open') && html.includes('Done One'), 'the board renders both sections with the Completed one open');
  const toggle = A.els.pbPage.h.toggle;
  toggle({ target: { id: 'pbDoneSec', open: false } });
  ok(app.completedOpen === false && saved['pb-completed-open'] === '0', 'collapsing it is remembered in this browser');
  app.render();
  ok(!/pbDoneSec" open/.test(A.els.pbPage.innerHTML), 'and it stays collapsed after a redraw');
  toggle({ target: { id: 'pbDoneSec', open: true } });
  ok(app.completedOpen === true && saved['pb-completed-open'] === '1', 'opening it again is remembered too');
  app.completedOpen = false; app.filter = 'done';
  toggle({ target: { id: 'pbDoneSec', open: true } });
  ok(app.completedOpen === false && saved['pb-completed-open'] === '1', 'the section being forced open by the Complete filter does not overwrite the saved choice');
  const B = mkApp({ getItem: () => '0', setItem() {} });
  ok(new B.K.PhaseBoardApp().completedOpen === false && new (mkApp({ getItem: () => { throw new Error('blocked'); }, setItem() {} }).K.PhaseBoardApp)().completedOpen === true, 'a saved "closed" is restored on the next visit; blocked storage falls back to open');

  // The export shows the same grouping.
  const root = { innerHTML: '', addEventListener(t, f) { (this.h = this.h || {})[t] = f; } };
  const data = { projects: { d1: doing1.p, c1: done1.p }, takenAt: '2026-11-01' };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify(data) } : root }, { scrollTo() {} });
  ok(root.innerHTML.includes('In progress') && root.innerHTML.includes('<details class="sec" id="pbDoneSec" open>') && root.innerHTML.includes('Done One'), 'an exported snapshot has the same In progress and Completed sections');

  // Styles.
  ok(!/align-items:\s*start;\s*\}\s*\/\* cards keep/.test(css) && /\.pb \.sec\[open\] > summary::before \{ transform: rotate\(90deg\)/.test(css) && /prefers-reduced-motion[\s\S]*\.sec > summary::before/.test(css), 'cards are back to even rows, and the section arrow rotates (reduced motion respected)');
  ok(!/#[0-9a-fA-F]{6}\b/.test(css.slice(css.indexOf('in progress / completed sections'))), 'the section styles add no literal colors');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
