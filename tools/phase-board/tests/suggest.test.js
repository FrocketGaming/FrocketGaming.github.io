// Suggested exit criteria: offered per phase on any flow, added with one click, hidden once used.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', style: {}, hidden: false, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, critSuggestions, suggestHTML, phaseHTML, phaseState, flowEditorHTML, TEMPLATES, blankProject, tplOf};')(doc, { scrollTo() {} }, undefined, undefined, { getItem: () => null, setItem() {} });
const wait = () => new Promise(r => setTimeout(r, 20));

(async () => {
  const std = K.TEMPLATES.standard;
  ok(std.phases.every(p => K.critSuggestions(p).length >= 4), 'every phase of the empty Standard flow has suggestions');
  ok(K.critSuggestions({ id: 'my-own-phase', gates: [] }).length === 0, 'a phase with no matching idea gets none');
  const disc = { id: 'discovery', gates: [{ id: 'g1', text: 'SCOPE STATED, INCLUDING WHAT IS OUT OF SCOPE' }] };
  const left = K.critSuggestions(disc);
  ok(left.length === K.critSuggestions({ id: 'discovery', gates: [] }).length - 1 && !left.some(t => /^scope stated/i.test(t)), 'one already on the list is not suggested again, ignoring case');

  const proj = K.blankProject('P', { key: 'standard', name: std.name, phases: std.phases });
  const def = K.tplOf(proj).phases[0];
  const html = K.phaseHTML(def, K.phaseState(proj, def), 0, { mode: 'edit', people: [] });
  ok(/<details class="sugg" data-sugg="discovery">/.test(html) && html.includes('Suggested exit criteria (5)') && (html.match(/data-crit-suggest="discovery"/g) || []).length === 5, 'the edit view shows a collapsed list of the 5 Discovery ideas');
  ok(!/data-sugg="discovery" open/.test(html) && /data-sugg="discovery" open/.test(K.phaseHTML(def, K.phaseState(proj, def), 0, { mode: 'edit', people: [], suggOpen: ['discovery'] })), 'it stays open when the user left it open');
  ok(!K.phaseHTML(def, K.phaseState(proj, def), 0, { mode: 'view' }).includes('sugg'), 'the read-only view and exports never show suggestions');
  const testDef = K.tplOf(proj).phases.find(p => p.id === 'test');
  ok(K.phaseHTML(testDef, K.phaseState(proj, testDef), 3, { mode: 'edit', people: [] }).includes('data-text="Edge cases and failure paths tried (empty input, bad data)"'), 'a suggestion carries its exact text');

  // clicking one adds it to the project's flow
  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true; app.projects = { p1: proj };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); Object.assign(app.projects[id], d); } }) });
  app.bindEvents();
  const text = K.critSuggestions(def)[0];
  els.pbPage.h.click({ target: { closest: s => s === '[data-crit-suggest]' ? { getAttribute: k => k === 'data-crit-suggest' ? 'discovery' : text } : null } });
  await wait();
  ok(wrote.length === 1 && wrote[0].flow.phases[0].gates.length === 1 && wrote[0].flow.phases[0].gates[0].text === text, 'clicking a suggestion adds it as a real criterion');
  ok(!K.critSuggestions(app.projects.p1.flow.phases[0]).includes(text) && K.critSuggestions(app.projects.p1.flow.phases[0]).length === 4, 'and it leaves the suggestions');

  // opening and closing is remembered across redraws
  els.pbPage.h.toggle({ target: { id: 'x', matches: s => s === 'details[data-sugg]', getAttribute: () => 'discovery', open: true } });
  ok(app.openSuggestions.join() === 'discovery', 'opening the list is remembered');
  els.pbPage.h.toggle({ target: { id: 'x', matches: s => s === 'details[data-sugg]', getAttribute: () => 'discovery', open: false } });
  ok(app.openSuggestions.length === 0, 'closing it is remembered');

  // the flow editor
  const draft = { name: 'Mine', phases: [{ id: 'discovery', name: 'Discovery', short: 'Disc', goal: '', gates: [] }, { id: 'zz', name: 'Custom', short: 'Cust', goal: '', gates: [] }] };
  const ed = K.flowEditorHTML({ title: 'New flow', errors: [], draft: draft, mode: 'flow' });
  ok((ed.match(/data-fe-act="gate-suggest" data-p="0"/g) || []).length === 5 && !ed.includes('data-fe-act="gate-suggest" data-p="1"'), 'the flow editor lists ideas for a known phase and none for a custom one');
  app.editor = { mode: 'flow', draft: draft, errors: [], confirmDel: null, returnTo: '__flows' };
  app.view = '__editor';
  app.editorAction('gate-suggest', 0, 1);
  ok(draft.phases[0].gates.length === 1 && draft.phases[0].gates[0].text === K.critSuggestions({ id: 'discovery', gates: [] })[1] && /^g/.test(draft.phases[0].gates[0].id), 'clicking one in the editor adds that exact idea to the draft');
  app.editorAction('gate-suggest', 0, 99);
  ok(draft.phases[0].gates.length === 1, 'a stale click adds nothing');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
