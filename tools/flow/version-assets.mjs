// Stamps Flow's CSS and JS URLs with a content hash (flow-app.js?v=1a2b3c4d) so a browser never
// pairs a fresh index.html with stale cached scripts. GitHub Pages caches CSS/JS for 4 hours but
// HTML for 10 minutes. Run by .github/workflows/flow-asset-versions.yml on pushes that touch
// Flow, or locally: node tools/flow/version-assets.mjs
//
// One version for all files together (like newsletter/build-manifest.mjs): the modules depend on
// each other, so any change moves every URL and an old and a new file are never mixed.
// It also stamps the Snippets page's tag for flow-static.js (its .canvas preview uses it).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLOW = dirname(fileURLToPath(import.meta.url));
const assets = readdirSync(FLOW).filter(f => /^flow-[a-z-]+\.(js|css)$/.test(f)).sort();

// Line endings normalised so Windows checkouts and CI agree on the hash.
const hash = createHash('md5');
for (const f of assets) hash.update(f + '\0' + readFileSync(join(FLOW, f), 'utf8').replace(/\r\n?/g, '\n'));
const version = hash.digest('hex').slice(0, 8);

/** Rewrite every matching src/href in a page to carry ?v=<version>; returns whether it changed. */
function stamp(page, pattern) {
    const before = readFileSync(page, 'utf8');
    const after = before.replace(pattern, (m, attr, url) => `${attr}="${url}?v=${version}"`);
    if (after !== before) writeFileSync(page, after);
    return after !== before;
}

const flowPage = stamp(join(FLOW, 'index.html'), /(href|src)="(flow-[a-z-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"/g);
const snippetsPage = stamp(join(FLOW, '..', 'snippets', 'index.html'), /(src)="(\.\.\/flow\/flow-static\.js)(?:\?v=[0-9a-f]+)?"/g);

console.log(`Flow asset version ${version} (${assets.length} files)` +
    `; tools/flow/index.html ${flowPage ? 'updated' : 'already current'}` +
    `; tools/snippets/index.html ${snippetsPage ? 'updated' : 'already current'}`);
