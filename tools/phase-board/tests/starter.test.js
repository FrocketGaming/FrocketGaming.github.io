// The built-in "Standard flow with starter criteria": a worked example of what good exit criteria look like.
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, '..', 'phase-board-core.js'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const K = new Function(core + ';return {TEMPLATES, LEGACY_TEMPLATES, cleanFlow};')();
const s = K.TEMPLATES.starter, std = K.TEMPLATES.standard;

ok(!!s && s.key === 'starter' && /starter criteria/i.test(s.name), 'the starter flow is a built-in template');
ok(s.phases.map(p => p.id).join() === std.phases.map(p => p.id).join(), 'it has the same five phases as the Standard flow');
ok(s.phases.every(p => p.gates.length >= 4 && p.gates.length <= 6), 'each phase has 4 to 6 criteria, few enough to be real checks');
ok(s.phases.every(p => new Set(p.gates.map(g => g.id)).size === p.gates.length && p.gates.every(g => /^g\d+$/.test(g.id) && g.text.trim())), 'criteria have unique stable ids and text');
ok(std.phases.every(p => p.gates.length === 0) && K.TEMPLATES.lite.phases.every(p => p.gates.length === 0), 'Standard and Lite still start with no criteria');
ok(s.phases.every(p => p.goal === std.phases.find(q => q.id === p.id).goal), 'phase goals match the Standard flow');
s.phases[0].gates[0].text = 'changed';
ok(std.phases[0].gates.length === 0 && K.LEGACY_TEMPLATES.standard.phases[0].gates[0].text !== 'changed', 'editing a copy does not change the Standard flow or the legacy criteria');
const all = K.TEMPLATES.starter.phases.reduce((a, p) => a.concat(p.gates.map(g => g.text)), []);
ok(all.every(t => !/^(do|make|create|write|send|talk|meet)\b/i.test(t)), 'no criterion starts like a to-do verb');
const clean = K.cleanFlow({ name: s.name, phases: s.phases });
ok(!clean.errors.length, 'the flow passes the same validation as a flow you build yourself');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
