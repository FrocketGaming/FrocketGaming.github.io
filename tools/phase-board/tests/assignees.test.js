// Open action items grouped by who has them, each person in their own color.
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, '..', 'phase-board-core.js'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const K = new Function(core + ';return {openActionsHTML, openActionGroups, assigneeHues, personKey, personColor, spreadHues, tagHues, tagHue, hueOf, blankProject, TEMPLATES};')();
const std = K.TEMPLATES.standard;
const act = (id, text, assignee, due, done) => ({ id: id, text: text, assignee: assignee, due: due || '', done: !!done });
const proj = (byPhase) => {
  const p = K.blankProject('P', { key: 'standard', name: std.name, phases: std.phases });
  Object.keys(byPhase).forEach(ph => { p.phases[ph].actions = byPhase[ph]; });
  return p;
};
const names = html => (html.match(/<p class="who">([^<]*)</g) || []).map(s => s.replace(/<p class="who">|</g, ''));

const p = proj({
  test: [act('1', 'Failure alerts', 'Chris', '2026-11-16'), act('2', 'Unowned thing', '', '2026-11-01')],
  deploy: [act('3', 'Service account', 'Zach', '2026-11-16'), act('4', 'Write docs', 'chris ', '2026-12-04'), act('5', 'Early one', 'Chris', '2026-11-02'), act('6', 'Finished', 'Zach', '2026-10-01', true), act('7', 'No date', 'Chris', '')]
});
const html = K.openActionsHTML(p);
ok(JSON.stringify(names(html)) === JSON.stringify(['Chris', 'Zach', 'Unassigned']), 'groups are A to Z by person, with Unassigned last');
const g = K.openActionGroups(p);
ok(g[0].items.length === 4 && g[1].items.length === 1 && g[2].items.length === 1, 'the same person is one group whatever the capitals or spacing, and finished items are left out');
ok(g[0].items.map(r => r.a.id).join() === '5,1,4,7', 'inside a group the soonest due date comes first, undated last');
ok(/<span class="cnt">4<\/span>/.test(html), 'each heading shows how many items the person has');
ok(html.includes('href="#ph-test">Test</a>') && html.includes('href="#ph-deploy">Deploy</a>'), 'each item still names its phase, as a link');
ok(html.includes('due <span class="mono late">2026-11-16') || html.includes('due <span class="mono">2026-11-16'), 'due dates are still shown');

// colors
const hues = K.assigneeHues(p);
const styleOf = name => { const m = html.match(new RegExp('<div class="who-grp" style="--tc:(hsl\\([^)]*\\))"><p class="who">' + name + '<')); return m && m[1]; };
ok(styleOf('Chris') && styleOf('Zach') && styleOf('Chris') !== styleOf('Zach'), 'each person has their own color');
ok(/is-none"><p class="who">Unassigned/.test(html) && !/is-none" style/.test(html), 'Unassigned is neutral, with no color of its own');
ok(styleOf('Chris') === K.personColor('chris', hues) && /hsl\(\d+ 70% 75%\)/.test(styleOf('Chris')), 'the color follows the same paint rule as tags');
ok(K.openActionsHTML(p) === html, 'the same project always gives the same colors');

// finishing an item does not repaint anyone
const after = proj({ test: [act('1', 'Failure alerts', 'Chris', '2026-11-16', true)], deploy: p.phases.deploy.actions });
ok(K.assigneeHues(after).chris === hues.chris && K.assigneeHues(after).zach === hues.zach, 'completing an item does not change anyone\'s color');
const many = proj({ test: ['Ana', 'Ben', 'Cara', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana'].map((n, i) => act('m' + i, 'x', n, '')) });
const hv = Object.values(K.assigneeHues(many)); let min = 360;
hv.forEach((a, i) => hv.forEach((b, j) => { if (i < j) { const d = Math.abs(a - b) % 360; min = Math.min(min, Math.min(d, 360 - d)); } }));
ok(hv.length === 8 && min >= 25, 'eight people stay clearly apart on the color wheel (closest pair ' + min + ')');

// empty and safe
ok(K.openActionsHTML(proj({})).includes('No open action items.'), 'with nothing open it says so');
const nasty = proj({ test: [act('x', '<b>hi</b>', '<img src=x onerror=1>', '2026-01-01')] });
const nh = K.openActionsHTML(nasty);
ok(!nh.includes('<img') && !nh.includes('<b>hi') && nh.includes('&lt;img'), 'names and text are escaped');
ok(K.openActionsHTML(proj({ test: [act('1', 'solo', '', '')] })).includes('Unassigned') && !/style="--tc/.test(K.openActionsHTML(proj({ test: [act('1', 'solo', '', '')] }))), 'a board where nothing is assigned shows one neutral group');

// tags still behave as before
const tp = { a: { tag: 'Platform' }, b: { tag: 'Core Banking' }, c: { tag: 'platform ' } };
const th = K.tagHues(tp);
ok(Object.keys(th).sort().join() === 'core banking,platform' && th.platform === K.spreadHues(['platform', 'core banking']).platform && K.tagHue(' PLATFORM ') === K.hueOf('platform'), 'tag colors are unchanged by the shared helper');

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
