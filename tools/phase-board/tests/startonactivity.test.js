// Adding an action item or a decision starts a phase that has not started.
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, '..', 'phase-board-core.js'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const K = new Function(core + ';return {startOnActivity};')();

const idle = { status: 'not_started', log: [] };
K.startOnActivity(idle);
ok(idle.status === 'in_progress', 'a phase that has not started moves to in progress');
ok(idle.log.length === 1 && idle.log[0].text === 'Started', 'and the start is logged');

['in_progress', 'done', 'blocked', 'reopened'].forEach(s => {
  const st = { status: s, log: [] };
  K.startOnActivity(st);
  ok(st.status === s && st.log.length === 0, 'a phase that is ' + s + ' is left alone');
});

const noLog = { status: 'not_started' };
K.startOnActivity(noLog);
ok(noLog.status === 'in_progress' && noLog.log.length === 1, 'a phase with no log yet still works');

console.log(fails ? fails + " FAILED" : "ALL PASSED");
process.exit(fails ? 1 : 0);
