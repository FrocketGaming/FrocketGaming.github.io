const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', hidden: false, style: {}, textContent: '', addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, TEMPLATES, tplOf, phaseState, phaseHTML, reconcileProject, cleanFlow, noteHTML};')(doc, { scrollTo() {} }, undefined, undefined);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const wrote = [];
const mk = () => {
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true;
  app.projects = { p1: { name: 'P', template: 'standard', phases: { discovery: { status: 'in_progress', gates: [true, false, false, false], evidence: { g1: 'Cut invoice matching to PDFs from three vendors.' } } } } };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); const next = Object.assign({}, app.projects[id]); Object.keys(d).forEach(k => { if (k.startsWith('phases.')) { next.phases = Object.assign({}, next.phases, { [k.slice(7)]: d[k] }); } else next[k] = d[k]; }); app.projects[id] = next; } }) });
  app.bindEvents();
  return app;
};
const wait = () => new Promise(r => setTimeout(r, 20));

(async () => {
  const app = mk();
  const def = K.tplOf(app.projects.p1).phases[0];
  const st = K.phaseState(app.projects.p1, def);
  const edit = K.phaseHTML(def, st, 0, { mode: 'edit', people: [] });
  const view = K.phaseHTML(def, st, 0, { mode: 'view' });
  ok(edit.includes('Cut invoice matching to PDFs') && edit.includes('Edit note') && edit.includes('>Add note<'), 'edit view shows the note, Edit note, and Add note on criteria without one');
  ok(view.includes('Cut invoice matching to PDFs') && !view.includes('data-note-edit'), 'read-only view shows the note with no controls');

  // Open the editor, save, clear.
  app.startNoteEdit('discovery', 'g2');
  ok(app.editingNote === 'discovery:g2' && els.pbPage.innerHTML.includes('data-note-form="g2"') && els.pbPage.innerHTML.includes('Save note'), 'Add note opens a textarea');
  app.saveNote('discovery', 'g2', '  Users: AP clerks and the finance lead.  ');
  await wait();
  let w = wrote[wrote.length - 1];
  ok(w['phases.discovery'].evidence.g2 === 'Users: AP clerks and the finance lead.' && w['phases.discovery'].evidence.g1, 'note saved trimmed, existing note kept');
  ok(app.editingNote === null, 'editor closes after saving');
  app.saveNote('discovery', 'g1', '   ');
  await wait();
  w = wrote[wrote.length - 1];
  ok(!('g1' in w['phases.discovery'].evidence) && w['phases.discovery'].evidence.g2, 'saving an empty note clears just that note');
  app.saveNote('discovery', 'g3', 'x'.repeat(1500));
  await wait();
  ok(wrote[wrote.length - 1]['phases.discovery'].evidence.g3.length === 1000, 'notes are capped at 1000 characters');

  // Escape and cancel route.
  app.startNoteEdit('discovery', 'g4'); app.cancelNoteEdit();
  ok(app.editingNote === null && !els.pbPage.innerHTML.includes('data-note-form'), 'Cancel closes the note editor');
  const click = els.pbPage.h.click;
  click({ target: { closest: s => s === '[data-note-edit]' ? { getAttribute: k => ({ 'data-phase': 'discovery', 'data-note-edit': 'g4' })[k] } : null } });
  ok(app.editingNote === 'discovery:g4', 'the Add note click starts editing that criterion');
  app.openProject('p1');
  ok(app.editingNote === null, 'opening a project closes an open note editor');

  // Links and unsafe text.
  ok(K.noteHTML('https://example.com/brief').includes('<a href="https://example.com/brief" target="_blank" rel="noopener noreferrer">'), 'a note that is one https link is clickable');
  ok(!K.noteHTML('javascript:alert(1)').includes('<a ') && !K.noteHTML('<img src=x onerror=1>').includes('<img'), 'other text stays plain and escaped');
  ok(!K.noteHTML('see https://a.com and more').includes('<a '), 'a note with surrounding text is not auto-linked');

  // Flow edits: notes follow criterion ids; removed criteria drop theirs; rewording keeps them.
  const p = app.projects.p1;
  const flow = JSON.parse(JSON.stringify({ name: 'S', phases: K.tplOf(p).phases }));
  flow.phases[0].gates[0].text = 'Problem statement signed off';
  flow.phases[0].gates = flow.phases[0].gates.filter(g => g.id !== 'g2');
  const rec = K.reconcileProject(p, flow);
  ok(rec.discovery.evidence.g2 === undefined && rec.discovery.evidence.g3 !== undefined, 'a removed criterion loses its note; the others keep theirs');
  const p2 = { phases: { discovery: { status: 'in_progress', gates: [true, false, false, false], evidence: { g1: 'kept' } } }, flow: null, template: 'standard' };
  const flow2 = JSON.parse(JSON.stringify({ name: 'S', phases: K.tplOf(p2).phases }));
  flow2.phases[0].gates[0].text = 'Reworded';
  ok(K.reconcileProject(p2, flow2).discovery.evidence.g1 === 'kept', 'rewording a criterion keeps its note');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
