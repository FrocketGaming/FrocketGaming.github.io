const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');

// Minimal browser stubs: enough for render() and the editor paths.
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', hidden: false, style: {}, textContent: '', addEventListener() {}, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, blankProject, TEMPLATES, tplOf, phaseState, gateCount};')(doc, { scrollTo() {} }, undefined, undefined);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const wrote = [];
const fakeRef = (kind) => ({ doc: id => ({ set: async d => wrote.push({ kind, op: 'set', id, d }), update: async d => wrote.push({ kind, op: 'update', id, d }), delete: async () => wrote.push({ kind, op: 'delete', id }) }) });

(async () => {
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u1', displayName: 'Chris' };
  app.projectsRef = () => fakeRef('projects');
  app.flowsRef = () => fakeRef('flows');
  app.loaded = true;

  // A legacy project: no flow copy, boolean-array ticks.
  app.projects = { p1: { name: 'Legacy', template: 'standard', owner: 'Chris', started: '2026-09-01', updatedAt: 1,
    phases: { discovery: { status: 'done', gates: [true, true, true, true], reopened: 0 }, build: { status: 'in_progress', gates: [true, true, false, false] } } } };

  app.view = 'portfolio'; app.render();
  ok(els.pbPage.innerHTML.includes('Legacy'), 'portfolio renders a legacy project');
  app.view = 'p1'; app.render();
  ok(els.pbPage.innerHTML.includes('Edit phases'), 'project page has Edit phases');

  // Project mode: add a criterion to a done phase, add a phase, save.
  app.editProjectFlow();
  ok(app.view === '__editor' && app.editor.projectMode, 'Edit phases opens the editor in project mode');
  ok(els.pbPage.innerHTML.includes('Save phases'), 'editor renders');
  app.editorAction('gate-add', 0, 0);
  const d = app.editor.draft;
  d.phases[0].gates[d.phases[0].gates.length - 1].text = 'Budget approved';
  app.editorAction('p-add', 0, 0);
  const np = d.phases[d.phases.length - 1]; np.name = 'Pilot'; np.gates[0].text = 'Pilot users signed up';
  await app.saveEditor();
  const upd = wrote.find(w => w.kind === 'projects' && w.op === 'update');
  ok(upd && upd.id === 'p1', 'save writes to the project document');
  ok(upd.d.flow.phases.length === 6 && upd.d.flow.phases[0].gates.length === 5, 'flow copy saved with the new phase and criterion');
  ok(upd.d.phases.discovery.status === 'reopened' && upd.d.phases.discovery.reopened === 1, 'finished phase reopened because it gained a criterion');
  ok(upd.d.phases.build.gates.g1 === true && upd.d.phases.build.gates.g3 === false, 'legacy build ticks converted to criterion ids');
  ok(app.view === 'p1' && app.editor === null, 'returns to the project after saving');

  // Validation blocks a bad save.
  app.projects.p1 = Object.assign({}, app.projects.p1, { flow: upd.d.flow, phases: upd.d.phases });
  app.editProjectFlow();
  app.editor.draft.phases[0].name = '';
  const before = wrote.length;
  await app.saveEditor();
  ok(wrote.length === before && app.editor.errors.length === 1 && els.pbPage.innerHTML.includes('needs a name'), 'invalid draft is not saved and shows an error');
  app.editorAction('cancel', 0, 0);
  ok(app.editor === null && app.view === 'p1', 'cancel returns without saving');

  // Removing a phase that has progress needs a second click.
  app.editProjectFlow();
  const n0 = app.editor.draft.phases.length;
  app.editorAction('p-del', 0, 0);
  ok(app.editor.draft.phases.length === n0 && app.editor.confirmDel === 'p0', 'first click on remove phase only asks to confirm');
  app.editorAction('p-del', 0, 0);
  ok(app.editor.draft.phases.length === n0 - 1, 'second click removes it');
  app.editorAction('cancel', 0, 0);

  // Flow library: new flow, then it appears in the project form.
  app.newFlow();
  ok(app.view === '__editor' && !app.editor.projectMode, 'New flow opens the editor');
  app.editor.draft.name = 'Research spike';
  app.editor.draft.phases[0].name = 'Question'; app.editor.draft.phases[0].gates[0].text = 'Question written';
  await app.saveEditor();
  const fset = wrote.find(w => w.kind === 'flows' && w.op === 'set');
  ok(fset && /^f-/.test(fset.id) && fset.d.name === 'Research spike' && fset.d.phases[0].short === 'Question', 'new flow saved to the flows collection');
  app.flows = { [fset.id]: fset.d };
  ok(app.allFlows().length === 4 && app.allFlows()[3].name === 'Research spike' && app.allFlows()[2].key === 'starter', 'library lists built-ins plus the new flow');
  app.view = '__flows'; app.render();
  ok(els.pbPage.innerHTML.includes('Research spike') && els.pbPage.innerHTML.includes('Duplicate to edit'), 'flows page renders both kinds');

  // A new project copies the chosen flow.
  await app.createProject('Spike one', fset.id);
  const created = wrote.find(w => w.kind === 'projects' && w.op === 'set');
  ok(created && created.d.flow.name === 'Research spike' && created.d.flow.phases.length === 1, 'new project stores its own copy of the chosen flow');
  app.flows[fset.id].phases[0].name = 'Changed later';
  ok(created.d.flow.phases[0].name === 'Question', 'later flow edits do not touch existing projects');

  // Duplicate a built-in, then delete a user flow.
  app.duplicateFlow('lite');
  ok(app.editor.draft.name === 'Lite flow (copy)' && app.editor.flowId === null, 'duplicate of a built-in opens a new draft');
  app.editorAction('cancel', 0, 0);
  await app.deleteFlow(fset.id);
  ok(wrote.some(w => w.kind === 'flows' && w.op === 'delete' && w.id === fset.id), 'delete removes the flow document');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
