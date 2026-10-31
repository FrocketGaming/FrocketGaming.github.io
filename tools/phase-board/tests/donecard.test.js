const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
const K = new Function(core + ';return {cardHTML, bulletsHTML, richItems};')();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const count = (s, re) => (s.match(re) || []).length;

const flow = { name: 'Mini', phases: [{ id: 'a', name: 'Alpha', short: 'Alpha', goal: '', gates: [{ id: 'g1', text: 'one' }] }] };
const mk = (outcomes, extra) => Object.assign({ name: 'System Health Coach Chatbot', template: 'custom', flow: flow, owner: 'Chris',
  phases: { a: { status: 'done', completedAt: '2026-10-31', gates: { g1: true } } }, outcomes: outcomes }, extra || {});
const metrics = [{ id: '1', kind: 'amount', name: 'Yearly Cost', amount: 14000, unit: 'cost', period: 'year' }, { id: '2', kind: 'amount', name: 'Hours saved', amount: 5, unit: 'hours', period: 'week' }];

// bulletsHTML with a limit.
const six = '* one\n* two\n* three\n* four\n* five\n* six';
const cut = K.bulletsHTML(six, 4);
ok(count(cut, /<li>/g) === 4 && cut.includes('<p class="rt-more">+2 more</p>') && cut.includes('<li>four</li>') && !cut.includes('<li>five</li>'), 'a limit shows the first items and how many more there are');
ok(K.bulletsHTML('* a\n* b', 4) === K.bulletsHTML('* a\n* b') && !K.bulletsHTML('* a\n* b', 4).includes('more'), 'under the limit nothing is cut and no "more" line appears');
ok(K.bulletsHTML(six) === K.bulletsHTML(six, 0) && count(K.bulletsHTML(six), /<li>/g) === 6, 'no limit shows everything');
ok(K.bulletsHTML('Intro line\n* one\n* two\n\nClosing words', 3).includes('+1 more') && K.richItems('Intro line\n* one\n* two\n\nClosing words').length === 4, 'paragraphs count as items too');
ok(K.richItems('').length === 0 && K.richItems('   \n\n').length === 0 && K.richItems('* \n*  ').length === 0, 'empty or whitespace-only text has no items');

// The Done card.
const done = mk({ metrics: metrics, value: '* Saves analysts 5 hours a week\n* Cuts licence spend by $14,000 a year', lessons: '* Involve security earlier\n* Keep prompts in config' });
const card = K.cardHTML('d', done, 'x');
ok(card.includes('card is-done') && card.includes('$14,000/year') && card.includes('5 hrs/week'), 'the Done card still shows the metric tiles');
ok(card.includes('<p class="sub">Value added</p>') && card.includes('<li>Saves analysts 5 hours a week</li>') && card.includes('<li>Cuts licence spend by $14,000 a year</li>'), 'the Done card shows the value added as bullets');
ok(card.includes('<p class="sub">Lessons learned</p>') && card.includes('<li>Involve security earlier</li>') && card.includes('<li>Keep prompts in config</li>'), 'the Done card shows the lessons learned as bullets');
ok(card.indexOf('class="wins"') < card.indexOf('Value added') && card.indexOf('Value added') < card.indexOf('Lessons learned') && card.indexOf('Lessons learned') < card.indexOf('class="foot"'), 'order: tiles, value added, lessons learned, footer');
ok(!card.includes('class="rail"') && !card.includes('class="bar"') && !card.includes('criteria'), 'the Done card still has no progress rail, bar or criteria');

// Long text is cut on the card, in full elsewhere.
const long = K.cardHTML('d', mk({ metrics: metrics, value: six, lessons: '* l1\n* l2\n* l3\n* l4\n* l5' }), 'x');
ok(count(long, /<li>/g) === 8 && long.includes('+2 more') && long.includes('+1 more'), 'long lists show four items each with "+N more"');

// Missing parts.
const noLessons = K.cardHTML('d', mk({ metrics: metrics, value: '* v' }), 'x');
ok(noLessons.includes('Value added') && !noLessons.includes('Lessons learned'), 'no lessons written: that section is left out');
const lessonsOnly = K.cardHTML('d', mk({ metrics: [], lessons: '* only lessons' }), 'x');
ok(lessonsOnly.includes('Lessons learned') && !lessonsOnly.includes('<p class="sub">Value added</p>') && lessonsOnly.includes('No value added recorded yet.'), 'lessons but no value: the card prompts for value and still shows the lessons');
const valueNoTiles = K.cardHTML('d', mk({ metrics: [], value: '* Faster close' }), 'x');
ok(valueNoTiles.includes('Faster close') && !valueNoTiles.includes('No value added recorded yet.') && !valueNoTiles.includes('class="wins"'), 'value text but no metrics: shows the text and no empty-tile prompt');
const nothing = K.cardHTML('d', mk({}), 'x');
ok(nothing.includes('No value added recorded yet.') && !nothing.includes('card-text'), 'nothing recorded: just the prompt');
ok(!K.cardHTML('d', mk({ value: '* <img src=x onerror=1>', metrics: [] }), 'x').includes('<img'), 'card text is escaped');

// In-progress cards are unchanged, and the export shows the same card.
const wip = mk({ metrics: metrics, value: '* v', lessons: '* l' }, { phases: { a: { status: 'in_progress', gates: { g1: false } } } });
const wcard = K.cardHTML('w', wip, 'now');
ok(!wcard.includes('Value added') && !wcard.includes('Lessons learned') && wcard.includes('class="bar"'), 'an unfinished project card does not show value or lessons');
const root = { innerHTML: '', addEventListener() {} };
new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify({ projects: { d: done }, takenAt: '2026-11-01' }) } : root }, { scrollTo() {} });
ok(root.innerHTML.includes('Involve security earlier') && root.innerHTML.includes('Saves analysts 5 hours a week'), 'the exported portfolio shows value and lessons on the card');

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
