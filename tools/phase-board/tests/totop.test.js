const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const viewer = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

function makeEnv(reduce) {
  const made = {};
  const listeners = {};
  const scrolls = [];
  const doc = {
    body: { appended: [], appendChild(el) { this.appended.push(el); made[el.id] = el; } },
    getElementById: id => made[id] || null,
    createElement: () => { const attrs = {}, ls = {}, cls = new Set(); return { id: '', type: '', className: '', hidden: false, innerHTML: '', attrs, ls, classList: { toggle: (c, on) => on ? cls.add(c) : cls.delete(c), contains: c => cls.has(c) }, setAttribute: (k, v) => { attrs[k] = v; }, addEventListener: (t, f) => { ls[t] = f; }, blur() { this.blurred = true; } }; }
  };
  const win = { scrollY: 0, innerHeight: 800, matchMedia: () => ({ matches: !!reduce }), addEventListener: (t, f) => { listeners[t] = f; }, scrollTo: o => scrolls.push(o) };
  return { doc, win, listeners, scrolls, made };
}

const K = new Function(core + ';return {attachBackToTop};')();

// Behavior.
const e = makeEnv(false);
K.attachBackToTop(e.doc, e.win);
const b = e.made.pbToTop;
ok(b && b.className === 'pb-to-top' && b.attrs['aria-label'] === 'Back to top' && b.type === 'button', 'a labelled button is added to the page');
ok(b.hidden === true && !b.classList.contains('is-visible'), 'it starts hidden at the top of the page');
e.win.scrollY = 400; e.listeners.scroll();
ok(b.hidden === true, 'it stays hidden for the first 3/4 of a screen of scrolling');
e.win.scrollY = 900; e.listeners.scroll();
ok(b.hidden === false && b.classList.contains('is-visible'), 'it appears once the reader is past 3/4 of a screen');
b.ls.click();
ok(e.scrolls.length === 1 && e.scrolls[0].top === 0 && e.scrolls[0].behavior === 'smooth' && b.blurred, 'clicking scrolls to the top smoothly');
e.win.scrollY = 0; e.listeners.scroll();
ok(b.hidden === true, 'it hides again at the top');
K.attachBackToTop(e.doc, e.win);
ok(e.doc.body.appended.length === 1, 'attaching twice adds only one button');
const r = makeEnv(true); K.attachBackToTop(r.doc, r.win); r.made.pbToTop.ls.click();
ok(r.scrolls[0].behavior === 'auto', 'reduced-motion users get an instant jump, not a smooth scroll');
const noMM = makeEnv(false); delete noMM.win.matchMedia; K.attachBackToTop(noMM.doc, noMM.win); noMM.made.pbToTop.ls.click();
ok(noMM.scrolls[0].behavior === 'smooth', 'works when matchMedia is unavailable');

// Wired into the app and the exported viewer.
const app = fs.readFileSync(dir + 'phase-board-app.js', 'utf8');
ok(/init\(\) \{\s*attachBackToTop\(document, window\);/.test(app), 'the app attaches it on startup');
const ex = makeEnv(false);
const root = { innerHTML: '', addEventListener() {} };
const data = { projects: { a: { name: 'P', template: 'standard', phases: {} } }, takenAt: '2026-11-01' };
new Function('document', 'window', core + '\n' + viewer)(Object.assign(ex.doc, { getElementById: id => id === 'board-data' ? { textContent: JSON.stringify(data) } : id === 'root' ? root : (ex.made[id] || null) }), ex.win);
ok(!!ex.made.pbToTop && root.innerHTML.includes('Projects'), 'an exported snapshot renders and also gets the button');
const css = fs.readFileSync(dir + 'phase-board-styles.css', 'utf8');
ok(/\.pb-to-top\[hidden\]\s*\{\s*display:\s*none/.test(css) && /prefers-reduced-motion[\s\S]*pb-to-top/.test(css) && !/#[0-9a-fA-F]{3,6}\b/.test(css.slice(css.indexOf('back to top'))), 'styles hide when hidden, respect reduced motion, and use no literal colors');

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
