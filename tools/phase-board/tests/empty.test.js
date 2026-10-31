const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, TEMPLATES, LEGACY_TEMPLATES, tplOf, phaseState, gateCount, applyGate, summarize, blankProject, cardHTML, railHTML, barHTML, phaseHTML, cleanFlow, flowEditorHTML, reconcileProject, isComplete};')(doc, { scrollTo() {} }, undefined, undefined);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

(async () => {
  // Built-in flows are skeletons.
  const std = K.TEMPLATES.standard, lite = K.TEMPLATES.lite;
  ok(std.phases.length === 5 && lite.phases.length === 4 && std.phases.every(p => p.gates.length === 0 && p.name && p.goal), 'built-in flows keep phases and goals but have no exit criteria');
  ok(K.LEGACY_TEMPLATES.standard.phases.every(p => p.gates.length >= 4), 'the original criteria are still held for older projects');
  const old = { name: 'Old', template: 'standard', phases: { discovery: { status: 'in_progress', gates: [true, true, false, false] } } };
  const od = K.tplOf(old).phases[0];
  ok(od.gates.length === 4 && K.gateCount(od, K.phaseState(old, od)) === 2, 'a project saved before flow copies still shows its criteria and ticks');

  // A new project from the built-in flow starts with no criteria and says so.
  const f = { key: 'standard', name: std.name, phases: std.phases };
  const p = K.blankProject('New', f, 'Dana', '');
  const s = K.summarize(K.tplOf(p), p);
  ok(s.gt === 0 && s.doneP === 0 && s.current.id === 'discovery', 'summary: 0 criteria, nothing done');
  const card = K.cardHTML('x', p, 'now');
  ok(card.includes('No exit criteria yet') && !card.includes('0 of 0'), 'the portfolio card says there are no exit criteria yet');
  ok(K.railHTML(K.tplOf(p), p).includes('No criteria yet') && !K.railHTML(K.tplOf(p), p).includes('0 of 0'), 'the progress rail says No criteria yet');
  ok((K.barHTML(K.tplOf(p), p).match(/<i><\/i>/g) || []).length === 5, 'the progress bar shows an empty placeholder per phase');
  const d0 = K.tplOf(p).phases[0];
  const edit = K.phaseHTML(d0, K.phaseState(p, d0), 0, { mode: 'edit', people: [] });
  const view = K.phaseHTML(d0, K.phaseState(p, d0), 0, { mode: 'view' });
  ok(edit.includes('No exit criteria yet. Add at least one below') && edit.includes('data-crit-add="discovery"') && edit.includes('No criteria'), 'the phase card prompts to add criteria and offers the add box');
  ok(view.includes('No exit criteria set.') && !view.includes('0/0'), 'the read-only view says none are set');

  // A phase with no criteria cannot complete; adding one makes it trackable.
  ok(K.reconcileProject(p, f).discovery.status === 'not_started' && !K.isComplete(p), 'reconcile does not complete a phase with no criteria');
  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true; app.projects = { p1: p };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); app.projects[id] = Object.assign({}, app.projects[id], d); } }) });
  app.bindEvents();
  await app.addCriterion('discovery', 'Problem statement agreed');
  const p2 = app.projects.p1, d1 = K.tplOf(p2).phases[0];
  ok(d1.gates.length === 1 && d1.gates[0].text === 'Problem statement agreed' && K.phaseState(p2, d1).status === 'not_started', 'adding the first criterion works and the phase stays not started');
  const st = K.phaseState(p2, d1);
  K.applyGate(d1, st, 0, true);
  ok(st.status === 'done' && !!st.completedAt, 'ticking that criterion completes the phase');

  // Templates: a flow can be saved with criteria, or with none.
  const withCrit = K.cleanFlow({ name: 'My template', phases: [{ id: 'a', name: 'Plan', short: '', goal: '', gates: [{ id: 'g1', text: 'Scope agreed' }, { id: 'g2', text: '  ' }] }] });
  ok(withCrit.errors.length === 0 && withCrit.flow.phases[0].gates.length === 1, 'a template with criteria saves (blank rows dropped)');
  const blank = K.cleanFlow({ name: 'Blank', phases: [{ id: 'a', name: 'Plan', short: '', goal: '', gates: [{ id: 'g1', text: '' }] }] });
  ok(blank.errors.length === 0 && blank.flow.phases[0].gates.length === 0, 'a flow with no criteria is allowed');
  const proj3 = K.blankProject('From template', { key: 'f-1', name: 'My template', phases: withCrit.flow.phases }, '', '');
  const d3 = K.tplOf(proj3).phases[0];
  ok(d3.gates.length === 1 && K.gateCount(d3, K.phaseState(proj3, d3)) === 0, 'a project created from a template starts with its criteria, unticked');
  ok(K.flowEditorHTML({ title: 't', intro: '', draft: { name: 'x', phases: [{ id: 'a', name: 'A', short: 'A', goal: '', gates: [] }] }, errors: [], confirmDel: null, projectMode: false }).includes('None in this flow'), 'the flow editor explains an empty phase');

  // Flows page and the New flow intro.
  app.view = '__flows'; app.render();
  ok(els.pbPage.innerHTML.includes('Standard flow') && els.pbPage.innerHTML.includes('0 exit criteria'), 'the Flows page lists the built-ins with 0 exit criteria');
  app.newFlow();
  ok(app.editor.intro.includes('optional'), 'the New flow intro says criteria are optional');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
