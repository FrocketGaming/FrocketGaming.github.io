// Runs every *.test.js in this folder, each in its own Node process, and prints one line per suite.
// No dependencies: node tools/phase-board/tests/run.mjs
// Pass a name to run only matching suites: node tools/phase-board/tests/run.mjs risk
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const suites = readdirSync(here).filter(f => f.endsWith('.test.js') && f.includes(filter)).sort();
if (!suites.length) { console.log('No test files match "' + filter + '".'); process.exit(1); }

let failed = 0, checks = 0;
for (const file of suites) {
    const run = spawnSync(process.execPath, [join(here, file)], { encoding: 'utf8' });
    const lines = (run.stdout || '').split('\n');
    const ok = lines.filter(l => l.startsWith('ok')).length;
    const bad = lines.filter(l => l.startsWith('FAIL') || l.startsWith('ERROR'));
    const passed = run.status === 0 && bad.length === 0 && lines.some(l => l.includes('ALL PASSED'));
    checks += ok;
    if (passed) {
        console.log('PASS  ' + file.padEnd(28) + ok + ' checks');
    } else {
        failed++;
        console.log('FAIL  ' + file);
        bad.forEach(l => console.log('        ' + l));
        if (!bad.length) console.log('        ' + ((run.stderr || run.stdout || 'no output').trim().split('\n').slice(0, 4).join('\n        ')));
    }
}
console.log('\n' + (suites.length - failed) + ' of ' + suites.length + ' suites passed (' + checks + ' checks)');
process.exit(failed ? 1 : 0);
