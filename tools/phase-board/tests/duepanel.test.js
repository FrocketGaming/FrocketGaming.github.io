// The portfolio lists action items that are overdue, due today or due soon, and they can be checked off from there.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
const css = fs.readFileSync(dir + 'phase-board-styles.css', 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const els = {};
const store = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', style: {}, hidden: false, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, dueLabel, dueBucket, dueActions, dueItems, dueItemsHTML, cardHTML, rankMap, blankProject, TEMPLATES, tplOf};')(doc, { scrollTo() {} }, undefined, undefined, { getItem: k => store[k] === undefined ? null : store[k], setItem: (k, v) => { store[k] = v; } });
const wait = () => new Promise(r => setTimeout(r, 20));

const pad = n => String(n).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const std = K.TEMPLATES.standard;
const first = std.phases[0].id;
const act = (id, due, extra) => Object.assign({ id, text: 'Do ' + id, done: false, assignee: '', due }, extra || {});
const live = (name, actions, extra) => {
  const p = Object.assign(K.blankProject(name, { key: 'standard', name: std.name, phases: std.phases }), { updatedAt: 1 }, extra || {});
  p.phases[first] = Object.assign({}, p.phases[first], { status: 'in_progress', actions: actions || [] });
  return p;
};
const finished = (name, actions) => {
  const p = live(name, actions);
  p.flow.phases.forEach(d => { p.phases[d.id] = Object.assign({}, p.phases[d.id], { status: 'done', completedAt: '2026-02-01', gates: {} }); });
  return p;
};

(async () => {
  // ---- what counts as due ----
  ok(K.dueBucket(day(-1)) === 'late' && K.dueBucket(day(0)) === 'today' && K.dueBucket(day(1)) === 'soon' && K.dueBucket(day(3)) === 'soon', 'overdue, today and the next three days each get a group');
  ok(K.dueBucket(day(4)) === '' && K.dueBucket('') === '' && K.dueBucket(undefined) === '', 'later or undated is not due');
  const one = live('One', [act('t', day(0)), act('s', day(2)), act('l', day(-2))]);
  const counted = K.dueActions(K.tplOf(one), one);
  ok(counted.today === 1 && counted.soon === 1, 'the card flag counts the same today and soon as before');

  // ---- what the list holds ----
  const projects = {
    a: live('Alpha', [act('a-today', day(0)), act('a-far', day(30)), act('a-none', ''), act('a-done', day(0), { done: true })]),
    b: live('Bravo', [act('b-today', day(0)), act('b-soon2', day(2)), act('b-soon1', day(1)), act('b-late', day(-1))]),
    gone: live('Archived', [act('x-arch', day(0))], { archived: true }),
    fin: finished('Finished', [act('x-fin', day(0))])
  };
  const items = K.dueItems(projects, { a: { n: 2 }, b: { n: 1 } });
  ok(items.late.map(r => r.a.id).join() === 'b-late', 'an overdue item is listed');
  ok(items.today.map(r => r.a.id).join() === 'b-today,a-today', 'items due the same day follow the work order');
  ok(items.soon.map(r => r.a.id).join() === 'b-soon1,b-soon2', 'the soonest date comes first');
  const all = [].concat(items.late, items.today, items.soon).map(r => r.a.id).join();
  ok(!/a-far|a-none|a-done/.test(all), 'later, undated and finished items stay out');
  ok(!/x-arch|x-fin/.test(all), 'archived and finished projects stay out');
  ok(K.dueItemsHTML({ a: live('Alpha', [act('far', day(30))]) }) === '', 'with nothing due there is no panel at all');

  const html = K.dueItemsHTML({ p1: live('<b>Name</b>', [act('z', day(0), { text: '<img src=x>', assignee: 'Sam' })]) }, null, null, { open: true });
  ok(!html.includes('<img') && !html.includes('<b>Name') && html.includes('&lt;img') && html.includes('Sam'), 'action text and project names are escaped');
  ok(html.includes('data-action="z"') && html.includes('data-phase="' + first + '"') && html.includes('data-project="p1"') && html.includes('data-open="p1"'), 'each row says which project and phase its checkbox belongs to, and links to the project');
  ok(html.indexOf('data-open') < html.indexOf('<label') && !/<label[^>]*>[^<]*<button/.test(html), 'the project link sits outside the checkbox label');

  // ---- the pulse bar and the project cards ----
  ok(K.dueLabel(day(-3)) === '3d late' && K.dueLabel(day(0)) === 'Today' && /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}$/.test(K.dueLabel(day(2))), 'due dates read as days late, Today, or a weekday and day');
  const shut = K.dueItemsHTML(projects, null, null, { open: false });
  ok(shut.includes('data-due-toggle') && shut.includes('aria-expanded="false"') && !shut.includes('data-action='), 'collapsed, the panel is just the pulse bar');
  ok(shut.includes('5 actions due') && shut.includes('<b>1</b>overdue') && shut.includes('<b>2</b>today') && shut.includes('<b>2</b>next 3 days'), 'the bar counts each group');
  ok(!K.dueItemsHTML({ a: live('Only today', [act('t', day(0))]) }, null, null, {}).includes('data-due-only="late"'), 'a group with nothing in it has no count');
  const opened = K.dueItemsHTML(projects, { a: { n: 2 }, b: { n: 1 } }, null, { open: true });
  ok(opened.includes('aria-expanded="true"') && (opened.match(/class="due-proj-card/g) || []).length === 2, 'open, there is one card per project');
  ok(opened.indexOf('data-open="b"') < opened.indexOf('data-open="a"') && opened.includes('due-proj-card due-worst-late'), 'the project with an overdue item comes first and is marked');
  ok(opened.includes('<span class="rank">#1</span>'), 'each card shows the work-order number');
  const bravo = opened.split('data-open="b"')[1].split('data-open="a"')[0];
  const pos = ['b-late', 'b-today', 'b-soon1', 'b-soon2'].map(x => bravo.indexOf('data-action="' + x + '"'));
  ok(pos.every((v, i) => v > 0 && (!i || v > pos[i - 1])), 'inside a card, the soonest date comes first');
  const onlyLate = K.dueItemsHTML(projects, null, null, { open: true, only: 'late' });
  ok(onlyLate.includes('data-action="b-late"') && !onlyLate.includes('data-open="a"') && /data-due-only="late" aria-pressed="true"/.test(onlyLate), 'a count narrows the cards to that group');
  ok(!/aria-pressed="true"/.test(K.dueItemsHTML(projects, null, null, { open: false, only: 'late' })), 'a collapsed panel shows no count as selected');

  // ---- the card row ----
  const card = K.cardHTML('p', live('Card', [], { priority: 'high', tag: 'NHOP' }), 'x', {}, { n: 2, of: 4 });
  const flags = card.split('class="card-flags"')[1].split('<h2>')[0];
  ok(flags.includes('class="ptag"') && flags.includes('class="prio') && flags.includes('class="rank"'), 'tag, priority and number share one row');
  ok(flags.indexOf('class="ptag"') < flags.indexOf('class="prio') && flags.indexOf('class="prio') < flags.indexOf('class="rank"'), 'in that order');
  ok(!/\.pb \.rank \{[^}]*position: absolute/.test(css) && /\.pb \.rank \{[^}]*margin-left: auto/.test(css), 'the number is in the row at its far end, not floated over the card');
  ok(!/\.pb \.card-flags \{[^}]*flex-wrap/.test(css) && /\.pb \.card-flags \.ptag \{[^}]*text-overflow: ellipsis/.test(css), 'the row never wraps: a long tag shortens instead');
  ok(card.includes('title="Tag: NHOP"'), 'and the full tag is still there on hover');
  ok(K.cardHTML('p', live('Only rank'), 'x', {}, { n: 1, of: 2 }).includes('class="card-flags"'), 'a card with only a number still gets the row');
  ok(!K.cardHTML('p', live('Bare'), 'x', {}).includes('class="card-flags"'), 'a card with nothing to show has no empty row');

  // ---- checking one off from the portfolio ----
  const wrote = [];
  const a = new K.PhaseBoardApp();
  a.user = { uid: 'u' }; a.view = 'portfolio'; a.loaded = true;
  a.projects = { p1: live('One', [act('keep', day(0))]), p2: live('Two', [act('tick', day(0)), act('other', day(1))]) };
  a.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push({ id, d }); Object.keys(d).forEach(k => { if (k.indexOf('phases.') === 0) a.projects[id].phases[k.slice(7)] = d[k]; else a.projects[id][k] = d[k]; }); } }) });
  a.bindEvents();
  const tick = (aid, proj, checked) => els.pbPage.h.change({ target: { checked, matches: s => s === 'input[data-action]', getAttribute: n => ({ 'data-action': aid, 'data-phase': first, 'data-project': proj })[n] === undefined ? null : ({ 'data-action': aid, 'data-phase': first, 'data-project': proj })[n] } });
  ok(a.portfolioHTML().includes('due-panel') && a.portfolioHTML().includes('data-action="tick"'), 'the portfolio shows the panel, open by default');
  const click = (attr, val) => els.pbPage.h.click({ target: { closest: s => s === '[' + attr + ']' ? { getAttribute: () => val } : null } });
  click('data-due-toggle');
  ok(a.dueOpen === false && store['pb-due-open'] === '0' && !a.portfolioHTML().includes('data-action="tick"'), 'Hide collapses it to the bar, and that is remembered');
  ok(new K.PhaseBoardApp().dueOpen === false, 'so the next visit starts collapsed');
  click('data-due-only', 'today');
  ok(a.dueOpen === true && a.dueOnly === 'today' && store['pb-due-open'] === '1', 'clicking a count opens the panel on that group');
  click('data-due-only', 'today');
  ok(a.dueOnly === '' && a.dueOpen === true, 'clicking it again shows every group');
  click('data-due-only', 'today'); click('data-due-toggle');
  ok(a.dueOpen === false && a.dueOnly === '', 'collapsing clears the group');
  click('data-due-toggle');

  tick('tick', 'p2', true); await wait();
  ok(wrote.length === 1 && wrote[0].id === 'p2', 'the write goes to the project the row belongs to, not to the open view');
  const saved = a.projects.p2.phases[first].actions.find(x => x.id === 'tick');
  ok(saved.done === true && saved.doneAt === day(0), 'the action is finished and stamped, the same as on the project page');
  ok(a.projects.p2.phases[first].actions.find(x => x.id === 'other').done === false && a.projects.p1.phases[first].actions[0].done === false, 'nothing else changes');
  ok(a.view === 'portfolio', 'checking one off stays on the portfolio');

  let page = a.portfolioHTML();
  ok(/data-action="tick"[^>]*checked/.test(page) && /class="due-row [^"]*is-done/.test(page), 'a row just checked stays listed and ticked, so a misclick can be undone');
  ok(page.includes('2 actions due'), 'and no longer counts as open');

  tick('tick', 'p2', false); await wait();
  ok(a.projects.p2.phases[first].actions.find(x => x.id === 'tick').done === false, 'unticking reopens it');
  ok(!/data-action="tick"[^>]*checked/.test(a.portfolioHTML()) && Object.keys(a.justDone).length === 0, 'and the row is open again');

  tick('tick', 'p2', true); await wait();
  a.openProject('p1');
  a.view = 'portfolio';
  ok(!a.portfolioHTML().includes('data-action="tick"'), 'once you move on, a finished item leaves the list');

  a.filter = 'done';
  ok(!a.portfolioHTML().includes('due-panel'), 'the Complete view does not show the panel');
  a.filter = 'all'; a.loaded = false;
  ok(!a.portfolioHTML().includes('due-panel'), 'nor does the page while projects load');
  a.loaded = true;

  // ---- the project page still writes to the open project ----
  wrote.length = 0;
  a.view = 'p1';
  tick('keep', undefined, true); await wait();
  ok(wrote.length === 1 && wrote[0].id === 'p1' && a.projects.p1.phases[first].actions[0].done === true, 'a checkbox on the project page still saves to that project');
  ok(Object.keys(a.justDone).length === 0, 'and is not treated as a row in the due list');

  // ---- exports are read-only ----
  const root = { innerHTML: '', addEventListener() {} };
  const data = { projects: { a: live('Plain', [act('e', day(0))]) }, takenAt: day(0), mode: 'board' };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify(data) } : root }, { scrollTo() {} });
  ok(root.innerHTML.includes('Plain') && !root.innerHTML.includes('due-panel'), 'an exported board has no checkable list');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
