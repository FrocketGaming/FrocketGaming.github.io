// Choosing which phases a project has, once, when it is created.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', checked: false, style: {}, hidden: false, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
let boxes = [];
const doc = { getElementById: stub, querySelectorAll: () => boxes, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, pickPhases, phasePickHTML, TEMPLATES, tplOf, phaseState};')(doc, { scrollTo() {} }, undefined, undefined, { getItem: () => null, setItem() {} });
const wait = () => new Promise(r => setTimeout(r, 20));
const std = K.TEMPLATES.standard;
const box = (id, on) => ({ checked: on, getAttribute: () => id });

(async () => {
  // ---- the pure choice ----
  const three = K.pickPhases(std, ['build', 'test', 'deploy'], false);
  ok(three.phases.map(p => p.id).join() === 'build,test,deploy', 'only the chosen phases are kept, in the order of the flow');
  ok(three.key === 'custom' && /Standard flow - Build, Test, Deploy/.test(three.name), 'a trimmed flow is custom and its name says what it holds');
  ok(three.phases.every(p => p.gates.length === 0), 'without the starter option the phases have no criteria');
  const reversed = K.pickPhases(std, ['deploy', 'build'], false);
  ok(reversed.phases.map(p => p.id).join() === 'build,deploy', 'the order follows the flow, not the order of the ticks');
  const all = K.pickPhases(std, std.phases.map(p => p.id), false);
  ok(all.key === 'standard' && all.name === std.name && all.phases.length === 5, 'keeping every phase leaves the flow as it was');
  const starter = K.pickPhases(std, ['build', 'test'], true);
  ok(starter.phases.every(p => p.gates.length >= 4) && starter.phases[0].gates[0].id === 'g1', 'the starter option pre-fills each kept phase with criteria that have ids');
  const own = K.pickPhases({ key: 'x', name: 'Mine', phases: [{ id: 'build', name: 'Build', short: 'Build', goal: '', gates: [{ id: 'g1', text: 'My own' }] }, { id: 'zz', name: 'Odd', short: 'Odd', goal: '', gates: [] }] }, ['build', 'zz'], true);
  ok(own.phases[0].gates.length === 1 && own.phases[0].gates[0].text === 'My own' && own.phases[1].gates.length === 0, 'the starter option never overwrites a phase that has its own criteria, or invents any for a custom phase');
  starter.phases[0].gates[0].text = 'changed';
  ok(std.phases[0].gates.length === 0 && K.TEMPLATES.starter.phases[2].gates[0].text !== 'changed', 'the built-in flows are not touched');
  ok(K.phasePickHTML(std.phases).split('data-np-phase=').length === 6 && K.phasePickHTML(std.phases).split(' checked').length === 6, 'the form lists all five phases, ticked');
  ok(K.phasePickHTML([{ id: 'x', name: '<i>X</i>' }]).includes('&lt;i&gt;') && !K.phasePickHTML([{ id: 'a"b', name: 'x' }]).includes('a"b'), 'phase names and ids are escaped');

  // ---- the form ----
  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.loaded = true; app.projects = {}; app.flows = {};
  app.projectsRef = () => ({ doc: id => ({ set: async d => { wrote.push({ id, d }); } }) });
  app.openProject = () => {};
  app.bindEvents();
  const form = app.newFormHTML();
  ok(form.includes('Phases to include') && form.includes('id="npStarter"') && (form.match(/data-np-phase=/g) || []).length === 5, 'the New project form has the phase boxes and the starter option');
  ok(!/id="npStarter" checked/.test(form), 'the starter option is off unless chosen');

  els.pbPage.h.change({ target: { matches: s => s === '#npTpl', value: 'lite' } });
  ok((els.npPhases.innerHTML.match(/data-np-phase=/g) || []).length === 4 && !els.npPhases.innerHTML.includes('"research"'), 'choosing the Lite flow swaps the boxes to its four phases');

  const submit = () => els.pbPage.h.submit({ preventDefault() {}, target: { id: 'pbNewForm' } });
  ['npName', 'npTpl', 'npOwner', 'npLead', 'npTag', 'npStarter'].forEach(stub);
  els.npName.value = 'Spike'; els.npTpl.value = 'standard'; els.npOwner.value = ''; els.npLead.value = ''; els.npTag.value = ''; els.npStarter.checked = false;
  boxes = [box('discovery', false), box('research', false), box('build', true), box('test', true), box('deploy', true)];
  submit(); await wait();
  const made = wrote[wrote.length - 1];
  ok(made && made.d.flow.phases.map(p => p.id).join() === 'build,test,deploy' && Object.keys(made.d.phases).join() === 'build,test,deploy' && made.d.template === 'custom', 'creating a project keeps only the ticked phases, and its progress holds only those');
  ok(K.tplOf(made.d).phases.length === 3 && K.phaseState(made.d, K.tplOf(made.d).phases[0]).status, 'the project reads back as a three-phase project');

  els.npStarter.checked = true;
  boxes = [box('discovery', true), box('research', false), box('build', false), box('test', false), box('deploy', true)];
  submit(); await wait();
  const withStarter = wrote[wrote.length - 1].d.flow.phases;
  ok(withStarter.map(p => p.id).join() === 'discovery,deploy' && withStarter.every(p => p.gates.length >= 4), 'with the starter option, the kept phases arrive with criteria');

  const n = wrote.length;
  boxes = [box('discovery', false), box('research', false), box('build', false), box('test', false), box('deploy', false)];
  submit(); await wait();
  ok(wrote.length === n && app.noteErr && /at least one phase/.test(app.note), 'with nothing ticked, no project is created and the reason is shown');

  els.npStarter.checked = false;
  boxes = std.phases.map(p => box(p.id, true));
  submit(); await wait();
  ok(wrote.length === n + 1 && wrote[n].d.template === 'standard' && wrote[n].d.flow.phases.length === 5 && wrote[n].d.flow.phases.every(p => p.gates.length === 0), 'with everything ticked it is the plain Standard flow, as before');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
