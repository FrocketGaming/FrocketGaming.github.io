// A number in the corner of each in-progress card: its place in the order projects are worked in.
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, '..', 'phase-board-core.js'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const K = new Function(core + ';return {rankMap, rankBadge, cardHTML, portfolioBodyHTML, blankProject, TEMPLATES};')();
const std = K.TEMPLATES.standard;
const live = (name, extra) => Object.assign(K.blankProject(name, { key: 'standard', name: std.name, phases: std.phases }), { started: '2026-01-01' }, extra || {});
const finished = name => { const p = live(name); p.flow.phases.forEach(d => { p.phases[d.id] = { status: 'done', completedAt: '2026-02-01', gates: {} }; }); return p; };

const projects = { a: live('Alpha', { priority: 'low' }), b: live('Bravo', { priority: 'high', target: '2026-05-01' }), c: live('Charlie', { priority: 'high', target: '2026-04-01' }), d: finished('Done one'), e: live('Echo', { archived: true }), f: live('Foxtrot') };
const r = K.rankMap(projects);
ok(r.c.n === 1 && r.b.n === 2 && r.a.n === 3 && r.f.n === 4 && r.a.of === 4, 'ranks follow the work order, counted out of the active projects');
ok(!('d' in r) && !('e' in r), 'finished and archived projects get no rank');
ok(JSON.stringify(K.rankMap(projects)) === JSON.stringify(r), 'the same projects always give the same ranks');
const edited = Object.assign({}, projects, { b: Object.assign({}, projects.b, { updatedAt: Date.now() }) });
ok(K.rankMap(edited).b.n === 2, 'editing a project does not change its rank');
ok(K.rankMap({}).x === undefined && Object.keys(K.rankMap(null)).length === 0, 'no projects, no ranks');

ok(K.rankBadge({ n: 2, of: 4 }) === '<span class="rank" title="Work order: 2 of 4 active projects" aria-label="Work order 2 of 4">#2</span>' && K.rankBadge(undefined) === '', 'the badge says its place and the total, and is absent without a rank');
const card = K.cardHTML('b', projects.b, 'now', {}, r.b);
ok(card.includes('class="card has-rank"') && card.includes('>#2<') && card.indexOf('class="rank"') < card.indexOf('<h2>'), 'the in-progress card carries the number');
ok(!K.cardHTML('b', projects.b, 'now', {}).includes('class="rank"'), 'without a rank there is no badge');
ok(!K.cardHTML('d', projects.d, 'now', {}, r.b).includes('class="rank"'), 'a finished card never shows one');

// the portfolio uses the rank of all active projects, even when a filter hides some
const shown = [{ id: 'f', p: projects.f }, { id: 'c', p: projects.c }];
const html = K.portfolioBodyHTML(shown, 'all', { when: () => '', hues: {}, ranks: r });
ok(html.includes('>#4<') && html.includes('>#1<') && !html.includes('>#2<'), 'a filtered view keeps each card\'s rank among all active projects');

// the card no longer shows when it was last updated
ok(!K.cardHTML('b', projects.b, '6 min ago', {}, r.b).includes('6 min ago') && !K.cardHTML('d', projects.d, '6 min ago', {}).includes('6 min ago'), 'neither card shows when the project was last updated');
const foot = K.cardHTML('b', projects.c, 'x', {}, r.c).split('class="foot"')[1];
ok(foot.includes('</span><span class="prio prio-high">High priority</span></div></button>'), 'the priority badge is the last thing in the footer, on the same line as the criteria count');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
