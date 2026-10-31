// The version stamp on the page's CSS and JS tags: the script rewrites it, --check detects a stale one,
// and the copy in this repository is current. Works on a temporary copy, so nothing here edits the tool.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const dir = path.join(__dirname, '..');
const script = path.join(dir, 'version-assets.mjs');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

ok(run('--check').status === 0, 'the stamp in this repository is current (if this fails, run: node tools/phase-board/version-assets.mjs)');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-stamp-'));
const files = fs.readdirSync(dir).filter(f => /^phase-board-[a-z-]+\.(js|css)$/.test(f) || f === 'index.html');
files.forEach(f => fs.copyFileSync(path.join(dir, f), path.join(tmp, f)));
const page = path.join(tmp, 'index.html');
const stampOf = () => [...fs.readFileSync(page, 'utf8').matchAll(/phase-board-[a-z-]+\.(?:js|css)\?v=([0-9a-f]{8})/g)].map(m => m[1]);

// A stale stamp is detected and left alone by --check.
fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace(/\?v=[0-9a-f]+/g, '?v=deadbeef'));
const stale = run('--check', '--dir', tmp);
ok(stale.status === 1 && /OUT OF DATE/.test(stale.stdout) && stampOf().every(v => v === 'deadbeef'), '--check reports a stale stamp, exits 1, and does not write');

// A normal run fixes it on the three tags, and a second run changes nothing.
const fix = run('--dir', tmp);
const v1 = stampOf();
ok(fix.status === 0 && v1.length === 3 && new Set(v1).size === 1 && v1[0] !== 'deadbeef', 'a normal run stamps all three tags with one version');
const before = fs.readFileSync(page, 'utf8');
const again = run('--dir', tmp);
ok(again.status === 0 && /already current/.test(again.stdout) && fs.readFileSync(page, 'utf8') === before, 'running it again changes nothing');
ok(run('--check', '--dir', tmp).status === 0, '--check passes after stamping');
ok(v1[0] === (run('--dir', dir.replace(/\\/g, '/')).stdout.match(/version ([0-9a-f]{8})/) || [])[1], 'the temporary copy gets the same version as the real files');

// The version follows the content, and ignores line endings.
fs.appendFileSync(path.join(tmp, 'phase-board-core.js'), '\n// edited\n');
run('--dir', tmp);
const v2 = stampOf();
ok(v2[0] !== v1[0], 'editing a file changes the version');
const crlf = fs.readFileSync(path.join(tmp, 'phase-board-core.js'), 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');   // CRLF whatever the checkout used
fs.writeFileSync(path.join(tmp, 'phase-board-core.js'), crlf);
run('--dir', tmp);
ok(stampOf()[0] === v2[0], 'Windows and Unix line endings give the same version');

// Only the tool's own tags are touched.
const html = fs.readFileSync(page, 'utf8');
ok(/src="\.\.\/\.\.\/src\/storage-manager\.js"/.test(html) && !/storage-manager\.js\?v=/.test(html), 'scripts from other places are left alone');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
