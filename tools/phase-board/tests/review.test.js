const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, TEMPLATES, tplOf, phaseState, applyGate, summarize, reconcileProject, projectCompletedOn, needsCompletedOn, filterProjects, filterCounts, reviewData, reviewYears, reviewHTML, cardHTML, overviewHTML, phaseHTML, blankProject, isComplete, today};')(doc, { scrollTo() {} }, undefined, undefined);

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// A tiny two-phase flow so a project can be completed in a test.
const flow = { name: 'Mini', phases: [
  { id: 'a', name: 'Alpha', short: 'Alpha', goal: '', gates: [{ id: 'g1', text: 'one' }], artifacts: [] },
  { id: 'b', name: 'Beta', short: 'Beta', goal: '', gates: [{ id: 'g1', text: 'two' }], artifacts: [] } ] };
const proj = (extra) => Object.assign({ name: 'Mini project', template: 'custom', flow: flow, owner: 'Dana', lead: 'Lee', started: '2026-01-10', phases: {} }, extra);

(async () => {
  // 1. Completion dates stamp, clear on reopen.
  const p = proj();
  const stA = K.phaseState(p, flow.phases[0]);
  const m1 = K.applyGate(flow.phases[0], stA, 0, true);
  ok(stA.status === 'done' && stA.completedAt === K.today(), 'ticking the last criterion stamps completedAt');
  K.applyGate(flow.phases[0], stA, 0, false);
  ok(stA.status === 'reopened' && stA.completedAt === '', 'unticking clears completedAt');
  // Reconcile also stamps/clears.
  const q = proj({ phases: { a: { status: 'done', completedAt: '2026-03-01', gates: { g1: true } } } });
  const f2 = JSON.parse(JSON.stringify(flow)); f2.phases[0].gates.push({ id: 'g2', text: 'extra' });
  ok(K.reconcileProject(q, f2).a.completedAt === '', 'a done phase that gains a criterion loses its date when reopened');
  const f3 = JSON.parse(JSON.stringify(flow));
  const r3 = K.reconcileProject(proj({ phases: { a: { status: 'in_progress', gates: { g1: true } } } }), f3);
  ok(r3.a.status === 'done' && r3.a.completedAt === K.today(), 'reconcile stamps a phase that became complete');

  // 2. Project completion date: derived from phases; legacy falls back to a typed date.
  const done = proj({ phases: { a: { status: 'done', completedAt: '2026-03-01', gates: { g1: true } }, b: { status: 'done', completedAt: '2026-06-15', gates: { g1: true } } } });
  ok(K.projectCompletedOn(done) === '2026-06-15' && !K.needsCompletedOn(done), 'project completion = latest phase date');
  const legacy = proj({ phases: { a: { status: 'done', gates: { g1: true } }, b: { status: 'done', completedAt: '2026-07-01', gates: { g1: true } } } });
  ok(K.projectCompletedOn(legacy) === '' && K.needsCompletedOn(legacy), 'a legacy project with undated phases has no date and asks for one');
  legacy.completedOn = '2025-12-20';
  ok(K.projectCompletedOn(legacy) === '2025-12-20', 'a hand-entered date is used for legacy projects');
  ok(K.projectCompletedOn(proj()) === '', 'an unfinished project has no completion date');
  ok(K.overviewHTML(legacy, true).includes('data-ov="completedOn"') && K.overviewHTML(done, true).includes('data-ov="completedOn"') && !K.overviewHTML(proj(), true).includes('completedOn'), 'the Completed on field appears for every finished project, and not for one still in progress');
  ok(K.overviewHTML(Object.assign({}, legacy, { completedOn: '' }), true).includes('Not recorded for this project') && !K.overviewHTML(legacy, true).includes('Not recorded for this project') && !K.overviewHTML(done, true).includes('Not recorded for this project') && K.overviewHTML(done, true).includes('Change it for a project from the past'), 'its hint says whether the date is missing or can be changed');
  ok(K.cardHTML('x', done, 'updated 2d ago').includes('Completed 2026-06-15'), 'the portfolio card shows the completion date');

  // 3. Archive and filters.
  const list = [{ id: 'd', p: done }, { id: 'o', p: proj() }, { id: 'z', p: proj({ archived: true }) }];
  ok(K.filterProjects(list, 'all').length === 2 && K.filterProjects(list, 'archived').length === 1, 'archived projects only appear under Archived');
  ok(K.filterProjects(list, 'done').length === 1 && K.filterCounts(list).archived === 1, 'Complete excludes archived and counts are right');

  // 4. Year in review counts by date.
  const rich = proj({ name: 'Rich', summary: 'Do the thing', outcomes: { value: 'Saved time', metrics: [{ id: 'm', name: 'Speed', before: '1', after: '2' }] },
    phases: { a: { status: 'done', completedAt: '2026-03-01', gates: { g1: true }, decisions: [{ at: '2026-02-01', text: 'Chose X' }, { at: '2025-12-01', text: 'Old' }], actions: [{ id: '1', text: 'Write it', done: true, doneAt: '2026-02-20', assignee: 'Lee' }, { id: '2', text: 'Open one', done: false }] },
      b: { status: 'done', completedAt: '2026-06-15', gates: { g1: true } } } });
  const partial = proj({ name: 'Partial', phases: { a: { status: 'done', completedAt: '2026-04-04', gates: { g1: true } } } });
  const other = proj({ name: 'LastYear', phases: { a: { status: 'done', completedAt: '2025-02-02', gates: { g1: true } }, b: { status: 'done', completedAt: '2025-03-03', gates: { g1: true } } } });
  const all = { rich, partial, other, legacy: proj({ name: 'Undated', phases: { a: { status: 'done', gates: { g1: true } }, b: { status: 'done', gates: { g1: true } } } }) };
  const d26 = K.reviewData(all, 2026), d25 = K.reviewData(all, 2025);
  ok(d26.completed.length === 1 && d26.completed[0].p.name === 'Rich' && d26.completed[0].on === '2026-06-15', '2026 completed projects');
  ok(d25.completed.length === 1 && d25.completed[0].p.name === 'LastYear', '2025 completed projects');
  ok(d26.wins.length === 1 && d26.wins[0].project === 'Partial', 'an unfinished project with a phase done this year appears as other progress');
  ok(d26.actions.length === 1 && d26.decisions.length === 1 && d26.decisions[0].text === 'Chose X', 'actions and decisions are counted by their own dates');
  ok(d26.undated.length === 1 && d26.undated[0].p.name === 'Undated', 'completed projects without a date are listed separately');
  const years = K.reviewYears(all);
  ok(years[0] >= '2026' && years.includes('2025') && years.includes('2026'), 'years list includes every year with activity, newest first');
  const html = K.reviewHTML(d26);
  ok(html.includes('Saved time') && html.includes('Speed') && html.includes('Chose X') && html.includes('1 decision') && html.includes('1 action item completed'), 'review shows value added, metrics, decisions and actions');
  ok(html.includes('Other progress this year') && html.includes('Completed, date not recorded'), 'review shows other progress and undated sections');
  ok(K.reviewHTML(K.reviewData({}, 2030)).includes('No projects completed in 2030 yet'), 'an empty year has a clear empty state');

  // 5. App: archive, review view, year change.
  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'z'; app.loaded = true; app.projects = { z: proj() };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); app.projects[id] = Object.assign({}, app.projects[id], d); } }) });
  app.bindEvents();
  app.setArchived(true);
  await new Promise(r => setTimeout(r, 20));
  ok(wrote[0].archived === true && wrote[0].archivedAt === K.today() && app.view === 'portfolio', 'archiving saves and returns to the list');
  app.render();
  ok(!els.pbPage.innerHTML.includes('Mini project') || els.pbPage.innerHTML.includes('Archived 1'), 'archived project leaves the main list and the Archived chip appears');
  app.filter = 'archived'; app.render();
  ok(els.pbPage.innerHTML.includes('Mini project') && els.pbPage.innerHTML.includes('archived'), 'Archived filter shows it, marked archived');
  app.view = 'z'; app.setArchived(false); await new Promise(r => setTimeout(r, 20));
  ok(wrote[wrote.length - 1].archived === false, 'restoring clears the flag');

  app.projects = { rich };
  app.view = '__review'; app.reviewYear = '2026'; app.render();
  ok(els.pbPage.innerHTML.includes('Year in review') && els.pbPage.innerHTML.includes('Rich') && els.pbPage.innerHTML.includes('data-act="export-review"'), 'review page renders with the export button');
  const changeH = els.pbPage.h.change;
  changeH({ target: { matches: s => s === '[data-review-year]', value: '2025' } });
  ok(app.reviewYear === '2025' && els.pbPage.innerHTML.includes('No projects completed in 2025 yet'), 'changing the year re-renders the review');

  // 6. Action items stamp doneAt through the real change route.
  const app2 = new K.PhaseBoardApp();
  app2.user = { uid: 'u' }; app2.view = 'p'; app2.loaded = true;
  app2.projects = { p: proj({ phases: { a: { status: 'in_progress', gates: { g1: false }, actions: [{ id: 'x1', text: 'T', done: false }] } } }) };
  const w2 = [];
  app2.projectsRef = () => ({ doc: id => ({ update: async d => { w2.push(d); } }) });
  app2.bindEvents();
  els.pbPage.h.change({ target: { matches: s => s === 'input[data-action]', getAttribute: k => ({ 'data-action': 'x1', 'data-phase': 'a' })[k], checked: true } });
  await new Promise(r => setTimeout(r, 20));
  const act = w2[0]['phases.a'].actions[0];
  ok(act.done === true && act.doneAt === K.today(), 'ticking an action item stamps doneAt');

  // 7. Export viewer in review mode.
  const rootEl = { innerHTML: '', addEventListener() {} };
  const data = { projects: all, takenAt: '2026-11-01', mode: 'review', year: '2026' };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify(data) } : rootEl }, { scrollTo() {} });
  ok(rootEl.innerHTML.includes('Year in review') && rootEl.innerHTML.includes('Read-only snapshot') && rootEl.innerHTML.includes('Rich'), 'exported review renders read-only');
  const rootB = { innerHTML: '', addEventListener() {} };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify({ projects: all, takenAt: '2026-11-01' }) } : rootB }, { scrollTo() {} });
  ok(rootB.innerHTML.includes('Projects') && rootB.innerHTML.includes('Archived') === false, 'the normal export still renders the portfolio');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
