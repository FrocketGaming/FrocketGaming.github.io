const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, riskStatus, risksHTML, RISK_STATUS};')(doc, { scrollTo() {} }, undefined, undefined);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const risks = [
  { id: 'r1', kind: 'risk', text: 'Vendor may change invoice format', status: 'monitoring' },
  { id: 'r2', kind: 'risk', text: 'Parser may break', status: 'open' },
  { id: 'r3', kind: 'risk', text: 'Credentials delayed', status: 'occurred' },
  { id: 'r4', kind: 'risk', text: 'Wrong order matched', status: 'mitigated', resolved: true },
  { id: 'r5', kind: 'risk', text: 'Saved before statuses existed (open)', resolved: false },
  { id: 'r6', kind: 'risk', text: 'Saved before statuses existed (ticked)', resolved: true },
  { id: 'c1', kind: 'constraint', text: 'Data stays local', resolved: false },
  { id: 'c2', kind: 'constraint', text: 'No paid tools', resolved: true }
];
const p = { name: 'P', template: 'standard', risks: risks };

(async () => {
  ok(K.riskStatus(risks[0]) === 'monitoring' && K.riskStatus(risks[2]) === 'occurred', 'a risk keeps its saved status');
  ok(K.riskStatus(risks[4]) === 'open' && K.riskStatus(risks[5]) === 'mitigated', 'older entries read as open, or mitigated when they were ticked');
  ok(K.riskStatus({ status: 'nonsense', resolved: false }) === 'open', 'an unknown status falls back safely');

  const edit = K.risksHTML(p, true), view = K.risksHTML(p, false);
  ok(!/type="checkbox"/.test(edit) && !/type="checkbox"/.test(view), 'there are no checkboxes any more');
  ok((edit.match(/data-risk-status=/g) || []).length === 6 && edit.includes('<option value="monitoring" selected>Monitoring</option>') && edit.includes('<option value="occurred" selected>Occurred</option>'), 'edit view: each risk has a status picker with its current status selected');
  ok(!/data-risk-status/.test(view) && view.includes('rstatus rs-monitoring">Monitoring<') && view.includes('rstatus rs-occurred">Occurred<') && view.includes('rstatus rs-mitigated">Mitigated<') && view.includes('rstatus rs-open">Open<'), 'read-only view: each risk shows a status chip, no picker');
  ok(!/data-risk-status="c/.test(edit) && /data-lift-risk="c1"/.test(edit), 'constraints have no status picker; they still have Lift');
  ok(edit.includes('2 open') && edit.includes('1 monitoring') && edit.includes('1 occurred') && edit.includes('1 constraint'), 'the header counts open, monitoring, occurred and active constraints separately (' + (edit.match(/class="cnt">([^<]*)</) || [])[1] + ')');
  ok(K.risksHTML({ risks: [{ id: 'a', kind: 'risk', text: 'x', status: 'mitigated' }] }, false).includes('0 open'), 'with every risk mitigated the header says 0 open');
  ok(/class="risk is-lifted"><span class="kind k-risk">/.test(edit), 'a mitigated risk is muted');
  ok(edit.includes('Monitoring is for a risk you cannot solve or cannot predict'), 'the help line explains Monitoring');

  // Changing a status and adding a risk, through the real handlers.
  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true; app.projects = { p1: p };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); app.projects[id] = Object.assign({}, app.projects[id], d); } }) });
  app.bindEvents();
  const change = (id, value) => els.pbPage.h.change({ target: { matches: s => s === '[data-risk-status]', getAttribute: () => id, value: value } });
  change('r2', 'monitoring'); await new Promise(r => setTimeout(r, 20));
  let r2 = wrote[wrote.length - 1].risks.find(r => r.id === 'r2');
  ok(r2.status === 'monitoring' && r2.resolved === false, 'choosing Monitoring saves the status');
  change('r2', 'mitigated'); await new Promise(r => setTimeout(r, 20));
  r2 = wrote[wrote.length - 1].risks.find(r => r.id === 'r2');
  ok(r2.status === 'mitigated' && r2.resolved === true, 'Mitigated also sets the older resolved flag');
  change('r6', 'open'); await new Promise(r => setTimeout(r, 20));
  const r6 = wrote[wrote.length - 1].risks.find(r => r.id === 'r6');
  ok(r6.status === 'open' && r6.resolved === false, 'an older ticked risk can be reopened');
  ok(wrote[wrote.length - 1].risks.find(r => r.id === 'c1').status === undefined, 'a constraint is never given a status');

  const submit = () => els.pbPage.h.submit({ preventDefault() {}, target: { hasAttribute: k => k === 'data-addrisk' } });
  stub('risk-text').value = 'Single person knows the legacy system'; stub('risk-kind').value = 'risk';
  submit(); await new Promise(r => setTimeout(r, 20));
  const added = wrote[wrote.length - 1].risks.slice(-1)[0];
  ok(added.kind === 'risk' && added.status === 'open' && added.text.startsWith('Single person'), 'a new risk starts as Open');
  stub('risk-text').value = 'No budget for tools'; stub('risk-kind').value = 'constraint';
  submit(); await new Promise(r => setTimeout(r, 20));
  const addedC = wrote[wrote.length - 1].risks.slice(-1)[0];
  ok(addedC.kind === 'constraint' && !('status' in addedC), 'a new constraint carries no status');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
