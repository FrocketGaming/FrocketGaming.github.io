const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
const css = fs.readFileSync(dir + 'phase-board-styles.css', 'utf8');
const K = new Function(core + ';return {cardHTML, liveNotesHTML};')();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const chips = html => [...html.matchAll(/<span class="rstatus ([a-z-]+)" title="([^"]*)">([^<]*)<\/span>/g)].map(m => ({ cls: m[1], tip: m[2], text: m[3] }));

const flow = { name: 'M', phases: [{ id: 'a', name: 'A', short: 'A', goal: '', gates: [{ id: 'g1', text: 't' }] }] };
const mk = (extra, done) => Object.assign({ name: 'Proj', template: 'x', flow: flow, owner: 'Dana', phases: { a: { status: done ? 'done' : 'in_progress', completedAt: done ? '2026-10-31' : '', gates: { g1: !!done } } } }, extra);
const risks = [
  { id: '1', kind: 'risk', text: 'Parser may break', status: 'open' },
  { id: '2', kind: 'risk', text: 'Vendor may change format', status: 'monitoring' },
  { id: '3', kind: 'risk', text: 'Only one person knows it', status: 'monitoring' },
  { id: '4', kind: 'risk', text: 'Wrong order matched', status: 'mitigated', resolved: true },
  { id: '5', kind: 'risk', text: 'Credentials delayed', status: 'occurred' },
  { id: '6', kind: 'constraint', text: 'Data stays local', resolved: false },
  { id: '7', kind: 'constraint', text: 'Ping ID login not automated' },
  { id: '8', kind: 'constraint', text: 'No paid tools', resolved: true }
];

// What counts as live.
const c = chips(K.liveNotesHTML({ risks: risks }));
ok(c.length === 3 && c[0].text === '1 open risk' && c[1].text === '2 risks monitoring' && c[2].text === '2 constraints', 'live items are counted: 1 open risk, 2 monitoring, 2 active constraints (' + c.map(x => x.text).join(' | ') + ')');
ok(c[0].cls === 'rs-open' && c[1].cls === 'rs-monitoring' && c[2].cls === 'rs-constraint', 'each uses its own status color');
ok(c[0].tip === 'Open risks: Parser may break' && c[1].tip === 'Risks being monitored: Vendor may change format; Only one person knows it' && c[2].tip === 'Constraints that still apply: Data stays local; Ping ID login not automated', 'hovering lists the wording');
ok(!c.some(x => /Wrong order|Credentials|No paid tools/.test(x.tip)), 'mitigated risks, occurred risks and lifted constraints are left out');

// Singular, empty, legacy data.
ok(chips(K.liveNotesHTML({ risks: [{ id: 'a', kind: 'risk', text: 'x', status: 'monitoring' }] }))[0].text === '1 risk monitoring', 'a single item uses the singular wording');
ok(K.liveNotesHTML({}) === '' && K.liveNotesHTML({ risks: [] }) === '' && K.liveNotesHTML({ risks: 'bad' }) === '', 'no risks, or malformed data, shows nothing');
ok(K.liveNotesHTML({ risks: [{ id: 'a', kind: 'risk', text: 'x', status: 'mitigated' }, { id: 'b', kind: 'risk', text: 'y', status: 'occurred' }, { id: 'c', kind: 'constraint', text: 'z', resolved: true }] }) === '', 'when everything is history there is no line');
const legacy = chips(K.liveNotesHTML({ risks: [{ id: 'a', kind: 'risk', text: 'saved before statuses', resolved: false }, { id: 'b', kind: 'risk', text: 'ticked before', resolved: true }] }));
ok(legacy.length === 1 && legacy[0].text === '1 open risk', 'older risks read the same way as elsewhere: unticked is open, ticked is mitigated');
const bad = K.liveNotesHTML({ risks: [{ id: 'a', kind: 'risk', text: '<img src=x onerror=1>" onmouseover="x', status: 'open' }] });
ok(!bad.includes('<img') && !/" onmouseover="x/.test(bad), 'the wording is escaped in the hover text');

// Where it appears.
const done = K.cardHTML('d', mk({ risks: risks, outcomes: { value: '* v' } }, true), 'now');
const at = s => done.indexOf(s);
ok(at('class="live-notes"') > at('Value added') && at('class="live-notes"') < at('class="people"') && at('class="people"') < at('class="foot"'), 'on a finished card it sits after the value and lessons, above the people');
const inProg = K.cardHTML('p', mk({ risks: risks }), 'now');
ok(!inProg.includes('live-notes') && inProg.includes('class="bar"'), 'an in-progress card is unchanged');
ok(!K.cardHTML('d', mk({ risks: [] }, true), 'now').includes('live-notes'), 'a finished card with nothing live has no extra line or gap');

// The export shows the same.
const root = { innerHTML: '', addEventListener() {} };
new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify({ projects: { a: mk({ risks: risks }, true) }, takenAt: '2026-11-01' }) } : root }, { scrollTo() {} });
ok(root.innerHTML.includes('1 open risk') && root.innerHTML.includes('2 risks monitoring') && root.innerHTML.includes('2 constraints'), 'the exported portfolio shows it on finished cards');

ok(/\.pb \.live-notes \{[^}]*display: flex[^}]*flex-wrap: wrap/.test(css) && /\.pb \.rs-constraint \{ --s: var\(--idle\)/.test(css) && !/#[0-9a-fA-F]{6}\b/.test(css.slice(css.indexOf('still apply to a finished project'))), 'the chips wrap on narrow cards, the constraint chip is neutral, and no literal colors are added');

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
