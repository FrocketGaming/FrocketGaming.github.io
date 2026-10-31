const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
const css = fs.readFileSync(dir + 'phase-board-styles.css', 'utf8');
const K = new Function(core + ';return {cardHTML, cardMeta, archivedTag};')();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const count = (s, re) => (s.match(re) || []).length;
const pairs = html => [...html.matchAll(/<span class="pp-k">([^<]*)<\/span><span class="pp-v">([^<]*)<\/span>/g)].map(m => [m[1], m[2]]);

const flow = { name: 'M', phases: [{ id: 'a', name: 'A', short: 'A', goal: '', gates: [{ id: 'g1', text: 't' }] }] };
const mk = (extra, done) => Object.assign({ name: 'Proj', template: 'x', flow: flow, summary: 'The goal', phases: { a: { status: done ? 'done' : 'in_progress', completedAt: done ? '2026-10-31' : '', gates: { g1: !!done } } } }, extra);
const everyone = { owner: 'Dana', lead: 'Lee', stakeholders: ['Finance Ops', 'AP Lead'], smes: ['Vendor Mgmt'] };

// Same style for every role: a small label over each name.
const m = K.cardMeta(everyone);
ok(m.startsWith('<div class="people">') && JSON.stringify(pairs(m)) === JSON.stringify([['Owner', 'Dana'], ['Lead', 'Lee'], ['Stakeholders', 'Finance Ops, AP Lead'], ['SME', 'Vendor Mgmt']]), 'every role is a label over a name, in the order owner, lead, stakeholders, SMEs');
ok(count(m, /class="pp"/g) === 4 && !/<b>/.test(m), 'all four use the same markup (no role is styled differently)');
ok(m.includes('title="Accountable for the outcome"') && m.includes('title="Runs the work day to day"') && m.includes('title="Kept informed, or signs off: Finance Ops, AP Lead"') && m.includes('title="Subject matter expert, consulted: Vendor Mgmt"'), 'each has a hover explanation');

// Where it sits on the card.
const inProg = K.cardHTML('x', mk(everyone), 'now');
const at = s => inProg.indexOf(s);
ok(at('<h2>') < at('class="summary"') && at('class="summary"') < at('class="now"') && at('class="now"') < at('class="bar"') && at('class="bar"') < at('class="people"') && at('class="people"') < at('class="foot"'), 'in progress: title, goal, status, progress, then the people, then the footer');
ok(!/<\/h2>\s*<div class="people"/.test(inProg) && inProg.indexOf('class="people"') > inProg.indexOf('class="summary"'), 'the people no longer sit between the title and the goal');
const done = K.cardHTML('x', mk(Object.assign({ outcomes: { value: '* v', lessons: '* l' } }, everyone), true), 'now');
const d = s => done.indexOf(s);
ok(done.includes('card is-done') && d('class="summary"') < d('class="now"') && d('Lessons learned') < d('class="people"') && d('class="people"') < d('class="foot"'), 'finished: title, goal, status, value and lessons, then the people, then the footer');

// Same person once; duplicates; truncation; empties; escaping.
const same = K.cardMeta({ owner: 'Chris', lead: ' chris ' });
ok(JSON.stringify(pairs(same)) === JSON.stringify([['Owner and lead', 'Chris']]) && same.includes('title="Accountable for the outcome and runs the work day to day"'), 'the same person is one "Owner and lead" item, shown once');
const dup = K.cardMeta({ owner: 'Dana', lead: 'Lee', stakeholders: ['dana ', 'Kim', 'KIM', 'Lee'], smes: ['Dana'] });
ok(JSON.stringify(pairs(dup)) === JSON.stringify([['Owner', 'Dana'], ['Lead', 'Lee'], ['Stakeholder', 'Kim']]), 'owner and lead are left out of the other lists, repeats collapse, and an emptied group disappears');
const long = K.cardMeta({ stakeholders: ['A1', 'A2', 'A3', 'A4', 'A5'] });
ok(JSON.stringify(pairs(long)) === JSON.stringify([['Stakeholders', 'A1, A2 +3']]) && long.includes('A1, A2, A3, A4, A5'), 'more than two names show the first two and +N, with everyone in the hover text');
ok(K.cardMeta({}) === '' && K.cardMeta({ owner: '  ', stakeholders: [], smes: ['', null] }) === '' && K.cardMeta({ stakeholders: 'x', smes: { a: 1 } }) === '', 'nothing to show means no block, so no divider or gap');
ok(!K.cardHTML('x', mk({ summary: '' }), 'now').includes('class="people"'), 'a card with nobody named has no people block');
const bad = K.cardMeta({ owner: '<img src=x onerror=1>', lead: '"><script>x', stakeholders: ['" onmouseover="x'] });
ok(!bad.includes('<img') && !bad.includes('<script') && !/" onmouseover="x/.test(bad) && count(bad, /title=/g) === 3, 'names are escaped, including in the hover text');

// Archived is a badge beside the status, not a person.
const arch = K.cardHTML('x', mk(Object.assign({ archived: true }, everyone)), 'now');
ok(K.archivedTag({}) === '' && K.archivedTag({ archived: true }) === '<span class="phase-badge is-muted">Archived</span>', 'the archived badge appears only for archived projects');
ok(arch.indexOf('Archived') > arch.indexOf('class="now"') && arch.indexOf('Archived') < arch.indexOf('class="bar"') && !K.cardMeta(Object.assign({ archived: true }, everyone)).includes('Archived'), 'it sits beside the status badges, not among the people');
const archDone = K.cardHTML('x', mk({ archived: true }, true), 'now');
ok(archDone.includes('Archived') && archDone.indexOf('Archived') < archDone.indexOf('class="foot"') && !archDone.includes('class="people"'), 'on a finished card too, even with nobody named');

// The export shows the same.
const root = { innerHTML: '', addEventListener() {} };
new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify({ projects: { a: mk(everyone), b: mk(Object.assign({}, everyone, { owner: 'Kim', lead: 'Sam' }), true) }, takenAt: '2026-11-01' }) } : root }, { scrollTo() {} });
ok(count(root.innerHTML, /class="people"/g) === 2 && ['Dana', 'Lee', 'Kim', 'Sam'].every(n => root.innerHTML.includes(n)), 'the exported portfolio shows the people block on both kinds of card');

// Styles.
ok(/\.pb \.people \{[^}]*display: grid[^}]*auto-fit[^}]*border-top: 1px solid var\(--line\)/.test(css), 'the block is a responsive grid under a divider');
ok(/\.pb \.pp-k \{[^}]*font-size: 11px[^}]*uppercase/.test(css) && /\.pb \.pp-v \{[^}]*font-size: 13px/.test(css), 'labels are 11px uppercase and names 13px, both existing type steps');
ok(!/\.meta\.people/.test(css) && !/#[0-9a-fA-F]{6}\b/.test(css.slice(css.indexOf('who is on the project'))), 'the old one-line rules are gone and the new ones add no literal colors');

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
