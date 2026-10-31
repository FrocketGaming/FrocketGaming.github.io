// Stamps the Phase Board's CSS and JS URLs with a content hash (phase-board-app.js?v=1a2b3c4d) so a
// browser never pairs a fresh index.html with stale cached scripts. GitHub Pages caches CSS/JS for 4
// hours but HTML for 10 minutes. Run by .github/workflows/phase-board-asset-versions.yml on pushes
// that touch the tool, or locally: node tools/phase-board/version-assets.mjs
//
// One version for all the tool's files together: they depend on each other, and the HTML export
// fetches them by the same version, so any change moves every URL and an old and a new file are
// never mixed. `--check` only reports (exit 1 if the stamp is out of date) and writes nothing.
// `--dir <path>` points at another copy of the tool, which the tests use.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const dirFlag = args.indexOf('--dir');
const DIR = dirFlag >= 0 ? resolve(args[dirFlag + 1]) : dirname(fileURLToPath(import.meta.url));
const checkOnly = args.includes('--check');
const assets = readdirSync(DIR).filter(f => /^phase-board-[a-z-]+\.(js|css)$/.test(f)).sort();

// Line endings normalised so Windows checkouts and CI agree on the hash.
const hash = createHash('md5');
for (const f of assets) hash.update(f + '\0' + readFileSync(join(DIR, f), 'utf8').replace(/\r\n?/g, '\n'));
const version = hash.digest('hex').slice(0, 8);

const page = join(DIR, 'index.html');
const before = readFileSync(page, 'utf8');
const after = before.replace(/(href|src)="(phase-board-[a-z-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"/g, (m, attr, url) => `${attr}="${url}?v=${version}"`);
const changed = after !== before;

console.log(`Phase Board asset version ${version} (${assets.length} files); index.html ${changed ? (checkOnly ? 'is OUT OF DATE' : 'updated') : 'already current'}`);
if (checkOnly) process.exit(changed ? 1 : 0);
if (changed) writeFileSync(page, after);
