const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'phase-board-core.js'), 'utf8');
const K = new Function(src + ';return {TEMPLATES,tplOf,phaseState,gateCount,applyGate,summarize,blankProject,reconcileProject,cleanFlow,phaseHasProgress,blankDraftPhase,flowEditorHTML,phaseHTML,cardHTML,clone};')();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// 1. Legacy project (no flow, boolean-array ticks) still reads correctly.
const legacy = { name: 'L', template: 'standard', phases: { build: { status: 'in_progress', gates: [true, true, true, false], actions: [] }, discovery: { status: 'done', gates: [true, true, true, true] } } };
const tpl = K.tplOf(legacy), build = tpl.phases.find(p => p.id === 'build');
ok(K.gateCount(build, K.phaseState(legacy, build)) === 3, 'legacy array ticks counted (3 of 4)');
ok(K.summarize(tpl, legacy).doneP === 1, 'legacy done phase counted');

// 2. applyGate on a legacy phase converts to an id map and completes the phase.
const st = K.clone(K.phaseState(legacy, build));
const msg = K.applyGate(build, st, 3, true);
ok(st.status === 'done' && msg === 'All exit criteria met' && !Array.isArray(st.gates), 'applyGate finishes phase and stores an id map');
const st2 = K.clone(st);
const msg2 = K.applyGate(build, st2, 0, false);
ok(st2.status === 'reopened' && st2.reopened === 1, 'unticking a done phase reopens it');

// 3. New project stores its own copy of the flow.
const flow = { key: 'lite', name: K.TEMPLATES.lite.name, phases: K.TEMPLATES.lite.phases };
const np = K.blankProject('N', flow, 'me');
ok(np.flow && np.flow.phases.length === 4 && Object.keys(np.phases).length === 4, 'blankProject copies the flow (4 phases)');
np.flow.phases[0].name = 'Changed';
ok(K.TEMPLATES.lite.phases[0].name === 'Discovery', 'editing a project flow does not touch the built-in template');

// 4. reconcileProject: add a criterion to a done phase, remove one, add a phase.
const p = { name: 'P', template: 'standard', phases: legacy.phases };
const draft = K.clone({ name: 'Standard flow', phases: K.tplOf(p).phases });
const disc = draft.phases.find(x => x.id === 'discovery');
disc.gates.push({ id: 'gNEW', text: 'Budget approved' });
const bld = draft.phases.find(x => x.id === 'build');
bld.gates.splice(0, 1); // remove criterion g1 (ticked)
draft.phases.splice(2, 0, K.blankDraftPhase(() => 'zz')); // new phase after research
draft.phases[2].name = 'Design'; draft.phases[2].gates[0].text = 'Mockups approved';
const cleaned = K.cleanFlow(draft);
ok(cleaned.errors.length === 0, 'cleanFlow accepts a valid draft');
const next = K.reconcileProject(p, cleaned.flow);
ok(next.discovery.status === 'reopened' && next.discovery.reopened === 1, 'done phase that gained a criterion reopens');
ok(next.discovery.gates.g1 === true && next.discovery.gates.gNEW === false, 'ticks follow ids; new criterion starts unticked');
ok(Object.keys(next.build.gates).length === 3 && next.build.gates.g2 === true, 'removing a criterion keeps the other ticks aligned');
ok(next.pzz && next.pzz.status === 'not_started', 'new phase gets blank state');
const pAfter = Object.assign({}, p, { flow: cleaned.flow, phases: next });
ok(K.gateCount(bld, K.phaseState(pAfter, cleaned.flow.phases.find(x => x.id === 'build'))) === 2, 'rendering with the edited flow counts 2 ticks in build');

// 5. cleanFlow validation.
const bad = K.cleanFlow({ name: ' ', phases: [{ id: 'a', name: '', short: '', goal: '', gates: [{ id: 'x', text: '  ' }], artifacts: [] }] });
ok(bad.errors.length === 2, 'cleanFlow reports a missing flow name and phase name; a phase with no criteria is allowed (' + bad.errors.length + ')');
const none = K.cleanFlow({ name: 'x', phases: [] });
ok(none.errors.length === 1, 'cleanFlow requires a phase');
const dup = K.cleanFlow({ name: 'x', phases: [{ id: 'a', name: 'A very long phase name here', short: '', goal: '', gates: [{ id: 'x', text: 'ok' }], artifacts: ['T', 'T', ' '] }] });
ok(dup.flow.phases[0].short.length <= 16 && !('artifacts' in dup.flow.phases[0]), 'short label trimmed to 16; saved flows carry no artifacts');

// 6. progress detection and HTML renders without throwing.
ok(K.phaseHasProgress(legacy, 'build') === true && K.phaseHasProgress(np, 'build') === false, 'phaseHasProgress');
const html = K.flowEditorHTML({ title: 'Edit', intro: 'x', draft: draft, errors: ['e'], confirmDel: 'p0', projectMode: true });
ok(html.includes('data-fe="gate"') && html.includes('Remove phase and its progress'), 'editor HTML renders with confirm state');
ok(K.cardHTML('id', pAfter, 'now').includes('Invoice') === false && K.cardHTML('id', pAfter, 'now').length > 100, 'card renders for an edited project');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
