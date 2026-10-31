const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', hidden: false, style: {}, textContent: '', addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, risksHTML, blankProject, TEMPLATES};')(doc, { scrollTo() {} }, undefined, undefined);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const p = { name: 'P', template: 'standard', risks: [
  { id: 'r1', kind: 'risk', text: 'Parser may break', resolved: false },
  { id: 'c1', kind: 'constraint', text: 'Data stays local', resolved: false },
  { id: 'c2', kind: 'constraint', text: 'No paid tools', resolved: true }
] };
const edit = K.risksHTML(p, true), view = K.risksHTML(p, false);
const rowOf = (html, id) => (html.split('<li class="risk').find(x => x.includes('>' + id + '<') || x.includes(id)) || '');
ok((edit.match(/type="checkbox"/g) || []).length === 0 && edit.includes('data-risk-status="r1"'), 'edit view: risks have a status picker, nothing has a checkbox');
ok(edit.includes('data-lift-risk="c1"') && edit.includes('>Lift<'), 'active constraint has a Lift button');
ok(edit.includes('data-lift-risk="c2"') && edit.includes('>Restore<') && edit.includes('Lifted'), 'lifted constraint shows Lifted and Restore');
ok(edit.includes('is-lifted'), 'lifted constraint gets the muted class');
ok(edit.includes('1 open') && edit.includes('1 constraint'), 'header counts 1 open risk and 1 active constraint');
ok(!view.includes('data-lift-risk') && !view.includes('data-del-risk') && view.includes('Lifted'), 'read-only view has no controls but shows Lifted');
ok(view.includes('rstatus rs-open">Open<'), 'read-only risk shows its status chip');
ok(edit.includes('Lift a constraint if it no longer applies'), 'helper text still explains Lift');

// Click handler flips resolved through patchProject.
const wrote = [];
const app = new K.PhaseBoardApp();
app.user = { uid: 'u' }; app.view = 'p1'; app.projects = { p1: p };
app.projectsRef = () => ({ doc: id => ({ update: async d => wrote.push({ id, d }) }) });
app.bindEvents();
const click = els.pbPage.h.click;
const fire = id => click({ target: { closest: sel => sel === '[data-lift-risk]' ? { getAttribute: () => id } : null } });
(async () => {
  fire('c1'); await new Promise(r => setTimeout(r, 10));
  const w1 = wrote[0];
  ok(w1 && w1.id === 'p1' && w1.d.risks.find(r => r.id === 'c1').resolved === true && w1.d.risks.find(r => r.id === 'r1').resolved === false, 'Lift sets resolved on that constraint only');
  fire('c2'); await new Promise(r => setTimeout(r, 10));
  const w2 = wrote[1];
  ok(w2 && w2.d.risks.find(r => r.id === 'c2').resolved === false, 'Restore clears resolved');
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
