const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', hidden: false, style: {}, textContent: '', addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, TEMPLATES, tplOf, phaseState, gateCount, phaseHTML, reconcileProject};')(doc, { scrollTo() {} }, undefined, undefined);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const wrote = [];
const mk = () => {
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true;
  // Legacy project: no flow copy, position-based ticks. discovery done, build 3 of 4.
  app.projects = { p1: { name: 'P', template: 'standard', phases: {
    discovery: { status: 'done', gates: [true, true, true, true], reopened: 0 },
    build: { status: 'in_progress', gates: [true, true, true, false] } } } };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push({ id, d }); app.projects[id] = Object.assign({}, app.projects[id], d); } }) });
  app.bindEvents();
  return app;
};

(async () => {
  let app = mk();
  const def = K.tplOf(app.projects.p1).phases.find(p => p.id === 'build');
  const html = K.phaseHTML(def, K.phaseState(app.projects.p1, def), 2, { mode: 'edit', people: [] });
  ok(html.includes('data-crit-edit="g1"') && html.includes('data-crit-del="g1"') && html.includes('data-crit-add="build"'), 'phase card has Edit, remove and add controls for criteria');
  const view = K.phaseHTML(def, K.phaseState(app.projects.p1, def), 2, { mode: 'view' });
  ok(!view.includes('data-crit-') && !view.includes('Add an exit criterion'), 'read-only view has no criteria controls');

  // Edit mode swaps one row for a form.
  app.startCritEdit('build', 'g2');
  ok(app.editingGate === 'build:g2' && els.pbPage.innerHTML.includes('data-crit-form="g2"') && els.pbPage.innerHTML.includes('Save'), 'Edit turns the row into an input with Save and Cancel');
  app.cancelCritEdit();
  ok(app.editingGate === null && !els.pbPage.innerHTML.includes('data-crit-form'), 'Cancel restores the row');

  // Rewording keeps the tick (ids are stable) and converts a legacy project.
  await app.saveCriterion('build', 'g2', '  Config loads from one file  ');
  let w = wrote[wrote.length - 1];
  const b = w.d.flow.phases.find(p => p.id === 'build');
  ok(b.gates[1].text === 'Config loads from one file' && b.gates[1].id === 'g2', 'rewording trims and keeps the criterion id');
  ok(w.d.phases.build.gates.g2 === true && w.d.phases.build.gates.g4 === false, 'ticks survive the reword');
  ok(w.d.phases.discovery.status === 'done' && Array.isArray(w.d.phases.discovery.gates) === false, 'other phases convert and stay done');
  const nWrites = wrote.length;
  await app.saveCriterion('build', 'g2', '   ');
  ok(wrote.length === nWrites, 'an empty reword is ignored');

  // Adding a criterion to a done phase reopens it and says so.
  await app.addCriterion('discovery', 'Budget approved');
  w = wrote[wrote.length - 1];
  ok(w.d.flow.phases[0].gates.length === 5 && w.d.phases.discovery.status === 'reopened', 'adding to a done phase reopens it');
  ok(/was reopened/.test(app.note), 'the user is told the phase reopened');

  // Removing the only unmet criterion completes the phase.
  await app.removeCriterion('build', 'g4');
  w = wrote[wrote.length - 1];
  ok(w.d.flow.phases.find(p => p.id === 'build').gates.length === 3 && w.d.phases.build.status === 'done', 'removing the last unmet criterion completes the phase');

  // Removal needs a second click; the last criterion cannot be removed.
  app = mk();
  const click = els.pbPage.h.click;
  const fire = (sel, attrs) => click({ target: { closest: s => s === sel ? { getAttribute: k => attrs[k] } : null } });
  const before = wrote.length;
  fire('[data-crit-del]', { 'data-phase': 'build', 'data-crit-del': 'g1' });
  ok(app.confirmCrit === 'build:g1' && wrote.length === before, 'first click on remove only asks to confirm');
  fire('[data-crit-del]', { 'data-phase': 'build', 'data-crit-del': 'g1' });
  await new Promise(r => setTimeout(r, 20));
  ok(wrote.length === before + 1 && wrote[wrote.length - 1].d.flow.phases.find(p => p.id === 'build').gates.length === 3, 'second click removes it');
  const one = { name: 'x', template: 'standard', flow: { name: 'x', phases: [{ id: 'a', name: 'A', short: 'A', goal: '', gates: [{ id: 'g1', text: 'only' }], artifacts: [] }] }, phases: {} };
  const od = one.flow.phases[0];
  ok(!K.phaseHTML(od, K.phaseState(one, od), 0, { mode: 'edit', people: [] }).includes('data-crit-del'), 'no remove button on a phase with one criterion');
  await app.removeCriterion('nope', 'g1');
  // Switching project clears any open edit.
  app.editingGate = 'build:g1'; app.openProject('p1');
  ok(app.editingGate === null, 'opening a project clears an open criterion edit');

  // Rendered through the real click route: Edit button.
  app.projects = { p1: Object.assign({}, app.projects.p1) };
  fire('[data-crit-edit]', { 'data-phase': 'build', 'data-crit-edit': 'g1' });
  ok(app.editingGate === 'build:g1', 'Edit click starts editing that criterion');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
