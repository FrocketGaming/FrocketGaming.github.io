const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, amountText, parseAmount, isAmount, headlineMetrics, projectCounts, cardHTML, outcomesHTML, reviewData, reviewHTML, valueTotals, valueStatsHTML, blankProject, isComplete};')(doc, { scrollTo() {} }, undefined, undefined);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const flow = { name: 'Mini', phases: [{ id: 'a', name: 'Alpha', short: 'Alpha', goal: '', gates: [{ id: 'g1', text: 'one' }] }] };
const metrics = [
  { id: '1', name: 'Invoices matched per hour', before: '12', after: '140' },
  { id: '2', kind: 'amount', name: 'Hours saved', amount: 6, unit: 'hours', period: 'week' },
  { id: '3', kind: 'amount', name: 'Cost savings', amount: 12000, unit: 'cost', period: 'year' },
  { id: '4', kind: 'amount', name: 'Error reduction', amount: 15, unit: 'percent', period: 'once' },
  { id: '5', kind: 'amount', name: 'Setup effort avoided', amount: 40, unit: 'hours', period: 'once' }
];
const mkDone = (name, on, ms, extra) => Object.assign({ name: name, template: 'custom', flow: flow, owner: 'Dana', started: '2026-01-05',
  phases: { a: { status: 'done', completedAt: on, gates: { g1: true }, decisions: [{ at: on, text: 'd1' }, { at: on, text: 'd2' }], actions: [{ id: 'x', text: 't', done: true, doneAt: on }, { id: 'y', text: 'u', done: false }] } },
  outcomes: { value: 'Less manual work', metrics: ms } }, extra || {});

(async () => {
  // Formatting and parsing.
  ok(K.amountText(metrics[1], true) === '6 hrs/week' && K.amountText(metrics[1], false) === '6 hrs', 'hours format with and without the period');
  ok(K.amountText(metrics[2], true) === '$12,000/year', 'cost formats as dollars with thousands separators');
  ok(K.amountText(metrics[3], true) === '15%' && K.amountText({ amount: 1, unit: 'hours', period: 'once' }, true) === '1 hr', 'percent, one-time and singular hour');
  ok(K.parseAmount('12,000') === 12000 && K.parseAmount('$1,250.50') === 1250.5 && K.parseAmount('abc') === null && K.parseAmount('') === null && K.parseAmount(' 6 ') === 6, 'amounts parse typed text and reject non-numbers');
  ok(K.headlineMetrics({ outcomes: { metrics: metrics } }, 3).map(m => m.id).join() === '2,3,4', 'card headline: amounts first, capped at three');
  ok(K.headlineMetrics({ outcomes: { metrics: [metrics[0]] } }, 3).length === 1 && K.headlineMetrics({}, 3).length === 0, 'before/after metrics still qualify; no metrics gives none');

  // Done card versus in-progress card.
  const done = mkDone('Shipped', '2026-06-15', metrics);
  const dcard = K.cardHTML('d', done, 'x');
  ok(dcard.includes('card is-done') && dcard.includes('pill st-good') && dcard.includes('Completed 2026-06-15'), 'a finished project gets the Done card with badge and date');
  ok(dcard.includes('6 hrs/week') && dcard.includes('Hours saved') && dcard.includes('$12,000/year') && dcard.includes('15%'), 'the Done card shows the value tiles on the front');
  ok(!dcard.includes('class="rail"') && !dcard.includes('class="bar"') && !dcard.includes('criteria'), 'the Done card has no progress rail, bar or criteria count');
  ok(dcard.includes('2 decisions / 1 action completed'), 'the Done card counts decisions and completed actions');
  ok(!dcard.includes('Setup effort avoided'), 'only three tiles appear on the card');
  const none = K.cardHTML('d', mkDone('Bare', '2026-06-15', [], { outcomes: { metrics: [] } }), 'x');
  ok(none.includes('No value added recorded yet.'), 'a finished project with no metrics prompts for value');
  const wip = Object.assign({}, done, { phases: { a: { status: 'in_progress', gates: { g1: false } } } });
  const wcard = K.cardHTML('w', wip, 'now');
  ok(!wcard.includes('is-done') && wcard.includes('class="rail"') === false && wcard.includes('class="bar"') && !wcard.includes('6 hrs/week'), 'an in-progress card is unchanged: progress bar, no value tiles');

  // Outcomes section (edit and read-only).
  const edit = K.outcomesHTML(done, true), view = K.outcomesHTML(done, false);
  ok(edit.includes('data-addamount') && edit.includes('data-addmetric') && edit.includes('id="am-unit"') && edit.includes('id="am-period"'), 'edit view has both add forms with unit and period');
  ok(edit.includes('<option value="percent">') && edit.includes('<option value="month">') && edit.includes('Per year'), 'unit and period choices are offered');
  ok(view.includes('One-time') && view.includes('Per week') && view.includes('12') && !view.includes('data-addamount'), 'read-only rows show period labels and no forms');
  ok((view.match(/class="mtile"/g) || []).length === 5 && view.includes('metric-tiles'), 'every metric renders as a tile (5 of 5), not a table row');
  ok(view.includes('<b class="mt-val">6 hrs</b><span class="mt-name">Hours saved</span><span class="mt-note">Per week</span>'), 'an amount tile: number first, then name, then how often');
  ok(view.includes('<b class="mt-val">140</b><span class="mt-name">Invoices matched per hour</span><span class="mt-note">Before: 12</span>'), 'a before/after tile shows the new value large with the starting value as a note');
  ok(edit.includes('mt-del') && !view.includes('mt-del') && edit.includes('Add an amount saved or gained') && edit.includes('Add a before and after metric'), 'remove buttons and form headings appear only in edit mode');
  ok(!view.includes('class="metrics"') && !view.includes('m-val') && !view.includes('<small>Before</small>'), 'the old table-style rows are gone');

  // Year in review totals.
  const a = mkDone('A', '2026-03-01', [metrics[1], metrics[2], metrics[4]]);
  const b = mkDone('B', '2026-05-01', [{ id: 'm', kind: 'amount', name: 'Hours', amount: 10, unit: 'hours', period: 'month' }, { id: 'n', kind: 'amount', name: 'Savings', amount: 500, unit: 'cost', period: 'once' }]);
  const old = mkDone('C', '2025-05-01', [metrics[2]]);
  const d = K.reviewData({ a, b, old }, 2026);
  const t = K.valueTotals(d.completed);
  ok(t.hours.annual === 6 * 52 + 10 * 12 && t.hours.once === 40, 'recurring hours become an annual estimate; one-time stays separate (' + t.hours.annual + ' / ' + t.hours.once + ')');
  ok(t.cost.annual === 12000 && t.cost.once === 500, 'cost totals only count the chosen year (' + t.cost.annual + ' / ' + t.cost.once + ')');
  const html = K.reviewHTML(d);
  ok(html.includes('432 hrs') && html.includes('estimated annual hours saved') && html.includes('40 hrs') && html.includes('$12,000') && html.includes('$500') && html.includes('estimated annual cost savings'), 'the review shows estimated annual and one-time totals');
  ok(html.includes('6 hrs') && html.includes('One-time'), 'the review shows amount rows per project');
  const empty = K.reviewHTML(K.reviewData({ old }, 2026));
  ok(!empty.includes('estimated annual'), 'no value totals when nothing was completed that year');

  // Adding an amount through the real submit route.
  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p'; app.loaded = true; app.projects = { p: mkDone('P', '2026-02-02', []) };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); app.projects[id] = Object.assign({}, app.projects[id], d); } }) });
  app.bindEvents();
  const submit = form => els.pbPage.h.submit({ preventDefault() {}, target: form });
  const form = () => ({ hasAttribute: k => k === 'data-addamount' });
  stub('am-name').value = 'Hours saved'; stub('am-amount').value = '6'; stub('am-unit').value = 'hours'; stub('am-period').value = 'week';
  submit(form()); await new Promise(r => setTimeout(r, 20));
  const m = wrote[0].outcomes.metrics[0];
  ok(m.kind === 'amount' && m.name === 'Hours saved' && m.amount === 6 && m.unit === 'hours' && m.period === 'week' && m.id, 'submitting the amount form saves a typed amount metric');
  stub('am-amount').value = 'lots'; const n = wrote.length;
  submit(form()); await new Promise(r => setTimeout(r, 20));
  ok(wrote.length === n && /number/.test(app.note) && app.noteErr, 'a non-numeric amount is rejected with a message');
  stub('am-name').value = '   '; stub('am-amount').value = '5'; const n2 = wrote.length;
  submit(form()); await new Promise(r => setTimeout(r, 20));
  ok(wrote.length === n2, 'a blank name is ignored');

  // Export viewer shows the Done card.
  const root = { innerHTML: '', addEventListener() {} };
  const data = { projects: { d: done }, takenAt: '2026-11-01' };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify(data) } : root }, { scrollTo() {} });
  ok(root.innerHTML.includes('card is-done') && root.innerHTML.includes('6 hrs/week'), 'the exported portfolio shows the Done card with its value');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
