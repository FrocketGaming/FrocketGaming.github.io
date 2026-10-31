// Editing a project's start and completed dates by hand, so projects from the past land in the right year.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', title: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, projectCompletedOn, hasPhaseDates, anyPhaseReopened, overviewHTML, cardHTML, reviewData, reviewHTML, reviewYears, DATE_RE, blankProject};')(doc, { scrollTo() {} }, undefined, undefined, { getItem: () => null, setItem() {} });

const flow = { name: 'Mini', phases: [{ id: 'a', name: 'Alpha', short: 'Alpha', goal: '', gates: [{ id: 'g1', text: 'one' }] }, { id: 'b', name: 'Beta', short: 'Beta', goal: '', gates: [{ id: 'g1', text: 'two' }] }] };
const done = (extra, stamp) => Object.assign({ name: 'Old project', template: 'x', flow: flow, owner: 'Dana', started: '2026-11-02', updatedAt: 5,
  phases: { a: { status: 'done', completedAt: stamp || '2026-11-02', gates: { g1: true } }, b: { status: 'done', completedAt: stamp || '2026-11-02', gates: { g1: true } } },
  outcomes: { value: '* Saved time' } }, extra || {});
const wip = extra => Object.assign({ name: 'Live', template: 'x', flow: flow, started: '2026-11-02', phases: { a: { status: 'done', completedAt: '2026-11-02', gates: { g1: true } }, b: { status: 'in_progress', gates: { g1: false } } } }, extra || {});
const wait = () => new Promise(r => setTimeout(r, 20));

(async () => {
  // ---- which date a finished project has ----
  ok(K.projectCompletedOn(done()) === '2026-11-02', 'with no hand-set date, it comes from when the last phase finished');
  ok(K.projectCompletedOn(done({ completedOn: '2024-03-15' })) === '2024-03-15', 'a hand-set date wins over the date the phases stamped');
  ok(K.projectCompletedOn(done({ completedOn: '' })) === '2026-11-02' && K.projectCompletedOn(done({ completedOn: undefined })) === '2026-11-02', 'clearing it goes back to the stamped date');
  ok(K.projectCompletedOn(done({ completedOn: 'last spring' })) === '2026-11-02' && K.projectCompletedOn(done({ completedOn: '2024-3-5' })) === '2026-11-02' && K.projectCompletedOn(done({ completedOn: '2024-03-15<script>' })) === '2026-11-02', 'text that is not a YYYY-MM-DD date is ignored');
  ok(K.projectCompletedOn(wip({ completedOn: '2024-03-15' })) === '', 'a project still in progress has no completion date, even with one saved');
  const unstamped = done({ completedOn: '' }, ''); unstamped.phases.a.completedAt = ''; unstamped.phases.b.completedAt = '';
  ok(K.projectCompletedOn(unstamped) === '' && K.hasPhaseDates(unstamped) === false && K.hasPhaseDates(done()) === true, 'phases with no stamps and no hand-set date mean no date');
  ok(K.projectCompletedOn(Object.assign({}, unstamped, { completedOn: '2023-06-30' })) === '2023-06-30', 'a hand-set date also covers projects saved before phases were stamped');

  // ---- the edit boxes ----
  const edit = K.overviewHTML(done({ completedOn: '2024-03-15', started: '2024-01-10' }), true);
  ok(/id="ov-started"[^>]*data-ov="started"[^>]*value="2024-01-10"/.test(edit) && /type="date" id="ov-started"/.test(edit), 'the project page has a Started date box');
  ok(/type="date" id="ov-completedOn" data-ov="completedOn" value="2024-03-15"/.test(edit), 'and a Completed on date box showing the date in use');
  ok(/id="ov-completedOn"[^>]*value="2026-11-02"/.test(K.overviewHTML(done(), true)) && K.overviewHTML(done(), true).includes('Change it for a project from the past'), 'with no hand-set date, the box shows the stamped date and says it can be changed');
  ok(!K.overviewHTML(wip(), true).includes('ov-completedOn') && K.overviewHTML(wip(), true).includes('id="ov-started"'), 'an unfinished project has a Started box but no Completed on box');
  ok(!K.overviewHTML(done(), false).includes('ov-started') && !K.overviewHTML(done(), false).includes('ov-completedOn'), 'the read-only view has neither box');
  ok(K.overviewHTML(done({ started: 'garbage' }), true).includes('id="ov-started"') && !/id="ov-started"[^>]*value="garbage"/.test(K.overviewHTML(done({ started: 'garbage' }), true)), 'a start date that is not a date is not put in the box');

  // ---- saving through the real handlers ----
  const wrote = [];
  const mk = project => {
    const app = new K.PhaseBoardApp();
    app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true; app.projects = { p1: project };
    app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); const next = Object.assign({}, app.projects[id]); Object.keys(d).forEach(k => { if (k.startsWith('phases.')) next.phases = Object.assign({}, next.phases, { [k.slice(7)]: d[k] }); else next[k] = d[k]; }); app.projects[id] = next; } }) });
    app.bindEvents();
    return app;
  };
  const change = (field, v) => els.pbPage.h.change({ target: { matches: s => s === '[data-ov]', getAttribute: () => field, value: v } });
  let app = mk(done({ started: '2024-01-10' }));
  change('completedOn', '2024-03-15'); await wait();
  ok(wrote[wrote.length - 1].completedOn === '2024-03-15' && K.projectCompletedOn(app.projects.p1) === '2024-03-15', 'choosing a completed date saves it, and the project now has that date');
  change('started', '2024-02-01'); await wait();
  ok(wrote[wrote.length - 1].started === '2024-02-01', 'choosing a start date saves it');
  change('completedOn', ''); await wait();
  ok(wrote[wrote.length - 1].completedOn === '' && K.projectCompletedOn(app.projects.p1) === '2026-11-02', 'clearing the completed date puts the stamped one back');

  const n = wrote.length;
  change('completedOn', '2024-01-05'); await wait();
  ok(wrote.length === n && app.noteErr && /cannot be before the start date/.test(app.note), 'a completed date before the start date is refused with a reason, and nothing is saved');
  app.projects.p1.completedOn = '2024-03-15';
  change('started', '2025-01-01'); await wait();
  ok(wrote.length === n && /cannot be before the start date/.test(app.note), 'a start date after the completed date is refused too');
  change('completedOn', 'next week'); await wait();
  ok(wrote.length === n, 'text that is not a date is ignored');
  change('started', ''); await wait();
  ok(wrote[wrote.length - 1].started === '' , 'the start date can be cleared');

  // ---- a hand-set date does not outlive the finish it described ----
  app = mk(done({ completedOn: '2024-03-15' }));
  els.pbPage.h.change({ target: { matches: s => s === 'input[data-gate]', getAttribute: k => ({ 'data-phase': 'b', 'data-gate': '0' })[k], checked: false } });
  await wait();
  const reopen = wrote[wrote.length - 1];
  ok(reopen['phases.b'].status === 'reopened' && reopen.completedOn === '', 'unticking a criterion on a finished project drops the hand-set date');
  app = mk(done());
  els.pbPage.h.change({ target: { matches: s => s === 'input[data-gate]', getAttribute: k => ({ 'data-phase': 'b', 'data-gate': '0' })[k], checked: false } });
  await wait();
  ok(!('completedOn' in wrote[wrote.length - 1]), 'with no hand-set date there is nothing to drop');
  app = mk(wip({ completedOn: '2024-03-15' }));
  els.pbPage.h.change({ target: { matches: s => s === 'input[data-gate]', getAttribute: k => ({ 'data-phase': 'b', 'data-gate': '0' })[k], checked: true } });
  await wait();
  ok(!('completedOn' in wrote[wrote.length - 1]) && wrote[wrote.length - 1]['phases.b'].status === 'done', 'ticking a criterion that finishes a phase does not touch the date');
  // Adding a criterion to a finished project reopens a phase, through the criteria editor.
  app = mk(done({ completedOn: '2024-03-15' }));
  await app.addCriterion('a', 'Budget approved'); await wait();
  ok(wrote[wrote.length - 1].completedOn === '' && wrote[wrote.length - 1].phases.a.status === 'reopened', 'adding a criterion that reopens a phase also drops the hand-set date');
  app = mk(done({ completedOn: '2024-03-15' }));
  await app.addCriterion('a', 'Another'); await wait();
  app.projects.p1 = Object.assign({}, app.projects.p1, { completedOn: '2024-03-15' });
  ok(K.anyPhaseReopened(done(), { a: { status: 'reopened' }, b: { status: 'done' } }) === true && K.anyPhaseReopened(done(), { a: { status: 'done' }, b: { status: 'done' } }) === false, 'the reopen check sees a finished phase that is no longer finished');

  // ---- the point: a past project lands in the right year ----
  const past = done({ completedOn: '2024-03-15', started: '2024-01-10' });
  const all = { past: past, now: done({ name: 'Recent' }) };
  const r24 = K.reviewData(all, 2024), r26 = K.reviewData(all, 2026);
  ok(r24.completed.length === 1 && r24.completed[0].p.name === 'Old project' && r24.completed[0].on === '2024-03-15', 'a project given a 2024 completed date appears in the 2024 year in review');
  ok(r26.completed.length === 1 && r26.completed[0].p.name === 'Recent', 'and no longer in 2026');
  ok(K.reviewYears(all).includes('2024') && K.reviewYears(all).includes('2026'), 'the year list now includes 2024');
  ok(K.reviewHTML(r24).includes('2024-01-10 to 2024-03-15'), 'the review shows its start and completed dates');
  const card = K.cardHTML('p', past, 'now');
  ok(card.includes('Completed 2024-03-15') && !card.includes('2026-11-02'), 'the finished card shows the hand-set date');
  const root = { innerHTML: '', addEventListener() {} };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify({ projects: { past: past }, takenAt: '2026-11-05', mode: 'review', year: '2024' }) } : root }, { scrollTo() {} });
  ok(root.innerHTML.includes('Old project') && root.innerHTML.includes('2024-03-15'), 'an exported 2024 review shows the past project');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
