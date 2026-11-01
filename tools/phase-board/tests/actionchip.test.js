// Open action items get their own chip on the in-progress card, red once any is overdue.
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, '..', 'phase-board-core.js'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const K = new Function(core + ';return {cardHTML, openActionsChip, tplOf, blankProject, TEMPLATES};')();
const std = K.TEMPLATES.standard;
const proj = acts => {
  const p = K.blankProject('P', { key: 'standard', name: std.name, phases: std.phases });
  p.phases.discovery.actions = acts;
  return p;
};
const act = (id, due, done) => ({ id: id, text: 'x' + id, assignee: '', due: due || '', done: !!done });

const none = proj([act('1', '', true)]);
ok(K.openActionsChip(K.tplOf(none), none) === '' && !K.cardHTML('a', none, '', {}).includes('class="acts'), 'no open actions, no chip');
const one = proj([act('1', '2999-01-01'), act('2', '', true)]);
ok(K.openActionsChip(K.tplOf(one), one) === '<span class="acts">1 open action</span>', 'one open action reads in the singular');
const many = proj([act('1', ''), act('2', '2999-01-01'), act('3', '')]);
ok(K.openActionsChip(K.tplOf(many), many) === '<span class="acts">3 open actions</span>', 'several read in the plural');
const late = proj([act('1', '2000-01-01'), act('2', '2000-02-01'), act('3', '2999-01-01'), act('4', '2000-01-01', true)]);
ok(K.openActionsChip(K.tplOf(late), late) === '<span class="acts is-late">3 open actions / 2 overdue</span>', 'overdue ones turn the chip red and are counted');
const card = K.cardHTML('a', many, '', {});
ok(card.includes('class="foot-l"') && card.indexOf('criteria') < card.indexOf('class="acts"') && card.indexOf('class="acts"') < card.indexOf('</div></button>'), 'the chip sits in the footer after the criteria count');
ok(!/ open actions?<\/span><span>/.test(card) && !card.includes('/ 3 open'), 'the old plain-text count is gone');

// the footer stays at the bottom of the card whatever else the card has, so neighbours line up
const css = fs.readFileSync(path.join(__dirname, '..', 'phase-board-styles.css'), 'utf8');
const cardRule = (css.match(/^.pb .card {[^}]*}/m) || [''])[0];
ok(/display: flex; flex-direction: column/.test(cardRule) && !/align-content: start/.test(cardRule), 'a card is a column that fills its height, not a grid packed to the top');
ok(/^.pb .card > .foot { margin-top: auto; }/m.test(css), 'the footer takes the spare space above it, so it sits at the bottom');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
