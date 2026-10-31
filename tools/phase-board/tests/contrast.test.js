// Done is green on every theme, so the two greens in phase-board-styles.css must stay readable on every
// theme's surfaces. Reads the real values from the stylesheets, so changing a theme or a green is checked.
// Text needs 4.5:1 (WCAG AA); fills, borders and icons need 3:1.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const site = path.join(dir, '..', '..');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const css = fs.readFileSync(path.join(dir, 'phase-board-styles.css'), 'utf8');
const FILL = (css.match(/--good:\s*(#[0-9a-fA-F]{6})/) || [])[1];
const INK = (css.match(/--good-ink:\s*(#[0-9a-fA-F]{6})/) || [])[1];
ok(!!FILL && !!INK, 'both greens are defined in the stylesheet (' + FILL + ', ' + INK + ')');

const sheet = fs.readFileSync(path.join(site, 'src', 'stylesheet.css'), 'utf8');
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (fg, bg, p) => '#' + [1, 3, 5].map(i => Math.round(parseInt(fg.slice(i, i + 2), 16) * p + parseInt(bg.slice(i, i + 2), 16) * (1 - p)).toString(16).padStart(2, '0')).join('');
const themes = {};
[...sheet.matchAll(/(:root|\[data-theme="([a-z]+)"\])\s*\{([^}]*)\}/g)].forEach(m => {
  const name = m[2] || 'default', t = themes[name] || (themes[name] = {});
  ['bg-primary', 'bg-secondary', 'bg-tertiary'].forEach(k => { const g = (m[3].match(new RegExp('--' + k + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1]; if (g) t[k] = g; });
});
const names = Object.keys(themes).filter(n => themes[n]['bg-primary'] && themes[n]['bg-secondary']);
ok(names.length >= 8, 'found the site themes (' + names.length + ': ' + names.join(', ') + ')');

let textMin = 99, fillMin = 99, tw = '', fw = '';
names.forEach(n => {
  const t = themes[n], tint = p => mix(FILL, t['bg-secondary'], p);
  [['badge', tint(0.14)], ['card', tint(0.07)], ['tile', t['bg-tertiary'] || t['bg-secondary']], ['page', t['bg-primary']]].forEach(([k, bg]) => { const r = ratio(INK, bg); if (r < textMin) { textMin = r; tw = n + ' ' + k; } });
  [['card', tint(0.07)], ['page', t['bg-primary']], ['surface', t['bg-secondary']]].forEach(([k, bg]) => { const r = ratio(FILL, bg); if (r < fillMin) { fillMin = r; fw = n + ' ' + k; } });
});
ok(textMin >= 4.5, 'badge text green reaches 4.5:1 on every surface of every theme (lowest ' + textMin.toFixed(2) + ' at ' + tw + ')');
ok(fillMin >= 3, 'fill green reaches 3:1 on every surface of every theme (lowest ' + fillMin.toFixed(2) + ' at ' + fw + ')');

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
