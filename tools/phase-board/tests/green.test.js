const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const css = fs.readFileSync(dir + 'phase-board-styles.css', 'utf8');
const design = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'DESIGN.md'), 'utf8');
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const K = new Function(core + ';return {richItems, bulletsHTML, cardHTML};')();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// The green is a fixed colour on the tool's root, not a theme token.
const root = css.slice(css.indexOf('.pb {'), css.indexOf('}', css.indexOf('.pb {')));
ok(/--good:\s*#[0-9a-fA-F]{6};/.test(root) && !/--good:\s*var\(/.test(root), 'the good role is one fixed hex colour, not a theme variable');
ok(/--good-ink:\s*#[0-9a-fA-F]{6};/.test(root), 'there is a lighter green for small text');
ok(/\.pb \.st-good \{ --s: var\(--good\); --ink: var\(--good-ink\); \}/.test(css), 'done status uses the fill for icons and the lighter green for text');
ok(/\.pb \.pill \{[^}]*color: var\(--ink, var\(--s\)\)/.test(css) && /\.pb \.rstatus \{[^}]*color: var\(--ink, var\(--s\)\)/.test(css), 'badges and risk chips take their text colour from --ink when there is one');
ok(/\.pb \.card\.is-done \{[^}]*border-color: color-mix\(in srgb, var\(--good\)[^}]*background: color-mix\(in srgb, var\(--good\)/.test(css), 'a finished project card has a green border and a faint green tint');
ok(/\.pb \.card\.is-done:hover \{[^}]*var\(--good\)/.test(css), 'and a green hover glow instead of the theme accent');
const hexes = (css.match(/#[0-9a-fA-F]{6}\b/g) || []);
ok(hexes.length === 2, 'only the two documented hex colours exist in the tool stylesheet (' + hexes.join(', ') + ')');
ok(design.includes('--good') && design.includes(hexes[0]) && design.includes(hexes[1]) && design.includes('Phase Board'), 'DESIGN.md documents both colours as a known exception');
ok(!/--good:\s*var\(--accent-primary\)/.test(css), 'done no longer follows the theme accent');

// The card markup is what the CSS targets.
const flow = { name: 'M', phases: [{ id: 'a', name: 'A', short: 'A', goal: '', gates: [{ id: 'g1', text: 't' }] }] };
const done = { name: 'P', template: 'x', flow: flow, phases: { a: { status: 'done', completedAt: '2026-10-31', gates: { g1: true } } } };
const card = K.cardHTML('d', done, 'x');
ok(card.includes('class="card is-done"') && card.includes('class="pill st-good"'), 'the done card and its badge carry the classes the green CSS uses');

// Stray bullet markers.
ok(K.richItems('* \n*  \n-\n\u2022 ').length === 0, 'a line with only a bullet marker is ignored');
ok(K.richItems('* real\n*\n* also real').length === 2 && K.bulletsHTML('* real\n*\n* also real').includes('<li>also real</li>'), 'a lone marker between bullets does not become a paragraph');
ok(K.richItems('-5 degrees').length === 1 && K.richItems('*bold*').length === 1, 'a dash or star stuck to a word is still text');

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
