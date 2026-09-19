// Rebuilds newsletter/issues.json from the Markdown files in newsletter/issues/.
// Run locally with `node newsletter/build-manifest.mjs`; a GitHub Action runs it on every push to main
// that touches an issue, so adding the .md file is all that is needed to publish.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ISSUES_DIR = join(ROOT, 'issues');
const MANIFEST = join(ROOT, 'issues.json');
const FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;
const FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const ALLOWED_KEYS = ['issue_number', 'title'];

function fail(file, message) {
    console.error(`${file}: ${message}`);
    process.exit(1);
}

// Plain text for the archive: drop link URLs, emphasis markers, and backticks
function plain(text) {
    return text
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[`*]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseFrontMatter(file, source) {
    const values = {};
    for (const line of source.split('\n')) {
        if (!line.trim() || line.trimStart().startsWith('#')) continue;
        const match = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
        if (!match) fail(file, `front matter line is not 'key: value': ${line}`);
        values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    }

    const unknown = Object.keys(values).filter((key) => !ALLOWED_KEYS.includes(key));
    if (unknown.length) fail(file, `front matter has unknown keys: ${unknown.join(', ')}`);
    if (!/^\d+$/.test(values.issue_number || '')) fail(file, "front matter: 'issue_number' must be an integer");
    if (!values.title) fail(file, "front matter: 'title' must be a non-empty string");
    return { number: Number(values.issue_number), title: values.title };
}

function describeIssue(name) {
    const date = FILE_PATTERN.exec(name)[1];
    const text = readFileSync(join(ISSUES_DIR, name), 'utf8').replace(/\r\n?/g, '\n');
    const frontMatter = FRONT_MATTER_PATTERN.exec(text);
    if (!frontMatter) fail(name, "must start with a front matter block delimited by '---' lines");

    const { number, title } = parseFrontMatter(name, frontMatter[1]);
    // Authoring comments never reach the page, so they must not reach the manifest either
    const body = text.slice(frontMatter[0].length).replace(/<!--[\s\S]*?-->/g, '');

    const intro = [];
    const sections = [];
    let inFence = false;
    for (const line of body.split('\n')) {
        if (line.trimStart().startsWith('```')) inFence = !inFence;
        const heading = !inFence && /^##\s+(.+?)\s*#*\s*$/.exec(line);
        if (heading) sections.push(plain(heading[1]));
        else if (!sections.length) intro.push(line);
    }

    if (!sections.length) fail(name, "needs at least one '##' section");
    // The intro is the first paragraph before the first section
    const firstParagraph = intro.join('\n').trim().split(/\n\s*\n/)[0] || '';
    return { date, number, title, intro: plain(firstParagraph), sections };
}

const files = readdirSync(ISSUES_DIR).filter((name) => FILE_PATTERN.test(name));
const entries = files.map(describeIssue).sort((a, b) => b.date.localeCompare(a.date));

const numbers = entries.map((entry) => entry.number);
const repeated = numbers.filter((number, index) => numbers.indexOf(number) !== index);
if (repeated.length) {
    console.warn(`warning: issue_number repeated: ${[...new Set(repeated)].join(', ')}`);
}

writeFileSync(MANIFEST, `${JSON.stringify(entries, null, 4)}\n`);
console.log(`Wrote ${entries.length} issue${entries.length === 1 ? '' : 's'} to newsletter/issues.json`);
