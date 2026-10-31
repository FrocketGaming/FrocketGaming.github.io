// Risks and constraints are listed in two groups, risks first.
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, '..', 'phase-board-core.js'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const K = new Function(core + ';return {risksHTML};')();
const mixed = { risks: [
  { id: 'c1', kind: 'constraint', text: 'Constraint one', resolved: false },
  { id: 'r1', kind: 'risk', text: 'Risk one', status: 'open' },
  { id: 'c2', kind: 'constraint', text: 'Constraint two', resolved: true },
  { id: 'r2', kind: 'risk', text: 'Risk two', status: 'monitoring' }] };
const h = K.risksHTML(mixed, true);
const at = t => h.indexOf(t);
ok(at('Risk one') < at('Risk two') && at('Risk two') < at('Constraint one') && at('Constraint one') < at('Constraint two'), 'risks come first, then constraints, each keeping its own order');
ok(at('>Risks (2)<') > 0 && at('>Constraints (2)<') > at('Risk two') && (h.match(/<ul class="gates">/g) || []).length === 2, 'each group has a heading with its count and its own list');
ok(/2 constraints/.test(h) === false && /1 constraint\b/.test(h), 'the header count still counts only active constraints');
const onlyRisks = K.risksHTML({ risks: [mixed.risks[1]] }, false), onlyCons = K.risksHTML({ risks: [mixed.risks[0]] }, false);
ok(!onlyRisks.includes('class="grp"') && !onlyCons.includes('class="grp"') && onlyRisks.includes('Risk one') && onlyCons.includes('Constraint one'), 'with only one kind there is no heading to repeat');
ok(K.risksHTML({ risks: [] }, false).includes('None recorded'), 'an empty panel still says none recorded');
ok(!K.risksHTML(mixed, false).includes('data-lift-risk') && K.risksHTML(mixed, false).includes('class="grp"'), 'the read-only view groups too, without controls');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
