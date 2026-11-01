// A priority label on projects still in progress; the portfolio lists the most urgent first.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', style: {}, hidden: false, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, priorityOf, priorityBadge, byPriority, cardHTML, overviewHTML, blankProject, TEMPLATES, phaseState, tplOf, PRIORITY};')(doc, { scrollTo() {} }, undefined, undefined, { getItem: () => null, setItem() {} });
const wait = () => new Promise(r => setTimeout(r, 20));

const std = K.TEMPLATES.standard;
const live = (name, extra) => Object.assign(K.blankProject(name, { key: 'standard', name: std.name, phases: std.phases }), { updatedAt: 1 }, extra || {});
const finished = extra => {
  const p = live('Finished', extra);
  p.flow.phases.forEach(d => { p.phases[d.id] = { status: 'done', completedAt: '2026-02-01', gates: {} }; });
  return p;
};

(async () => {
  ok(K.priorityOf({ priority: 'high' }) === 'high' && K.priorityOf({}) === '' && K.priorityOf({ priority: 'urgent' }) === '' && K.priorityOf({ priority: '__proto__' }) === '' && K.priorityOf({ priority: 'toString' }) === '', 'only high, medium and low count as a priority');
  ok(K.priorityBadge(live('a', { priority: 'high' })) === '<span class="prio prio-high">High priority</span>' && K.priorityBadge(live('a')) === '', 'a set priority shows as a badge, an unset one shows nothing');
  ok(K.priorityBadge(live('a', { priority: '"><script>' })) === '', 'a hand-edited value is never put into the page');
  ok(K.priorityBadge(finished({ priority: 'high' })) === '', 'a finished project shows no priority');

  // ---- cards ----
  ok(K.cardHTML('p', live('Urgent one', { priority: 'high' }), 'now').includes('High priority') && !K.cardHTML('p', live('Plain'), 'now').includes('priority'), 'the in-progress card carries the badge only when set');
  const hc = K.cardHTML('p', live('Urgent one', { priority: 'high' }), 'now');
  ok(hc.indexOf('class="prio') > hc.indexOf('class="foot"') && hc.indexOf('class="prio') > hc.indexOf('now'), 'the badge sits in the footer, at the bottom corner, not beside the phase status');
  ok(!K.cardHTML('p', finished({ priority: 'high' }), 'now').includes('priority'), 'the finished card does not');

  // ---- sorting ----
  const at = (name, extra) => ({ id: name, p: live(name, Object.assign({ started: '2026-01-01' }, extra)) });
  const items = [at('none-early', { target: '2026-02-01' }), at('low', { priority: 'low' }), at('high-late', { priority: 'high', target: '2026-09-01' }), at('med', { priority: 'medium' }), at('high-soon', { priority: 'high', target: '2026-03-01' }), at('none-nodate')];
  ok(items.slice().sort(K.byPriority).map(i => i.id).join() === 'high-soon,high-late,med,low,none-early,none-nodate', 'high first, then medium, low, unset; inside a level the soonest target date first, no date last');
  const same = [at('b-proj', { priority: 'high', started: '2026-02-01' }), at('a-proj', { priority: 'high', started: '2026-02-01' }), at('early', { priority: 'high', started: '2026-01-05' })];
  ok(same.slice().sort(K.byPriority).map(i => i.id).join() === 'early,a-proj,b-proj', 'then the earlier start, then the name');
  const touched = items.map(i => ({ id: i.id, p: Object.assign({}, i.p, { updatedAt: i.id === 'none-nodate' ? 9999 : 1 }) }));
  ok(touched.sort(K.byPriority).map(i => i.id).join() === items.slice().sort(K.byPriority).map(i => i.id).join(), 'editing a project does not move it');
  const mixed = [{ id: 'fin-old', p: finished({ priority: 'high', updatedAt: 5 }) }, { id: 'fin-new', p: finished({ updatedAt: 99 }) }];
  ok(mixed.slice().sort(K.byPriority).map(i => i.id).join() === 'fin-new,fin-old', 'finished projects ignore priority and go by latest change');
  const app = new K.PhaseBoardApp();
  app.projects = { a: items[5].p, b: items[2].p, c: items[3].p };
  ok(app.sortedProjects().map(i => i.id).join() === 'b,c,a', 'the portfolio list uses that order');

  // ---- editing ----
  const edit = K.overviewHTML(live('x', { priority: 'medium' }), true);
  ok(/<select class="field" id="ov-priority" data-ov="priority">/.test(edit) && /<option value="medium" selected>Medium<\/option>/.test(edit) && edit.includes('<option value="">Not set</option>'), 'the project page has a Priority dropdown showing the current value');
  ok(!K.overviewHTML(finished(), true).includes('ov-priority'), 'a finished project has no Priority dropdown');
  ok(K.overviewHTML(live('x', { priority: 'low' }), false).includes('<p class="sub">Priority</p><p>Low</p>') && !K.overviewHTML(live('x'), false).includes('Priority'), 'the read-only view shows it only when set');

  const wrote = [];
  const a2 = new K.PhaseBoardApp();
  a2.user = { uid: 'u' }; a2.view = 'p1'; a2.loaded = true; a2.projects = { p1: live('One') };
  a2.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); Object.assign(a2.projects[id], d); } }) });
  a2.bindEvents();
  const change = v => els.pbPage.h.change({ target: { matches: s => s === '[data-ov]', getAttribute: () => 'priority', value: v } });
  change('high'); await wait();
  ok(wrote[wrote.length - 1].priority === 'high' && a2.projects.p1.priority === 'high', 'choosing High saves it');
  change('low'); await wait();
  ok(wrote[wrote.length - 1].priority === 'low', 'changing it saves the new value');
  change(''); await wait();
  ok(wrote[wrote.length - 1].priority === '' && K.priorityOf(a2.projects.p1) === '', 'choosing Not set clears it');
  change('urgent'); await wait();
  ok(wrote[wrote.length - 1].priority === '', 'a value that is not one of the three is saved as not set');

  // ---- the shared snapshot ----
  const root = { innerHTML: '', addEventListener() {} };
  const data = { projects: { a: live('Plain', { updatedAt: 100 }), b: live('Urgent', { priority: 'high', updatedAt: 1 }) }, takenAt: '2026-11-05', mode: 'board' };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify(data) } : root }, { scrollTo() {} });
  ok(root.innerHTML.includes('High priority') && root.innerHTML.indexOf('Urgent') < root.innerHTML.indexOf('Plain'), 'an exported board shows the badge and lists the urgent project first');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
