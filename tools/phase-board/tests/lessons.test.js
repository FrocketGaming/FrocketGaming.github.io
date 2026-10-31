const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', core + '\n' + appSrc + '\nreturn {PhaseBoardApp, bulletsHTML, outcomesHTML, reviewData, reviewHTML};')(doc, { scrollTo() {} }, undefined, undefined);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const count = (s, re) => (s.match(re) || []).length;

(async () => {
  // Bullet parsing.
  const b = K.bulletsHTML('* Saved 6 hours a week\n- Fewer errors\n\u2022 Faster close');
  ok(count(b, /<li>/g) === 3 && b.startsWith('<ul class="rt-list">') && count(b, /<ul/g) === 1, '*, - and a bullet dot each start a list item, in one list');
  ok(K.bulletsHTML('Plain sentence.').includes('<p class="rt-p">Plain sentence.</p>') && !K.bulletsHTML('Plain sentence.').includes('<li>'), 'a line without a marker stays a paragraph');
  const mixed = K.bulletsHTML('Results so far:\n* one\n* two\n\nSecond paragraph\nsame paragraph');
  ok(/<p class="rt-p">Results so far:<\/p><ul class="rt-list"><li>one<\/li><li>two<\/li><\/ul><p class="rt-p">Second paragraph<br>same paragraph<\/p>/.test(mixed), 'paragraph, list, blank line, then a paragraph keeping its line break');
  ok(K.bulletsHTML('<b>x</b> & "q"').includes('&lt;b&gt;x&lt;/b&gt; &amp;') && !K.bulletsHTML('* <img src=x onerror=1>').includes('<img'), 'text is escaped, so markup cannot get in');
  ok(K.bulletsHTML('-5 degrees').includes('<p') && !K.bulletsHTML('-5 degrees').includes('<li>') && !K.bulletsHTML('*bold*').includes('<li>'), 'a dash or star with no space after it is ordinary text');
  ok(K.bulletsHTML('   * indented bullet').includes('<li>indented bullet</li>') && K.bulletsHTML('* \n*  \n').includes('<li>') === false, 'indented bullets work; empty bullets are ignored');
  ok(K.bulletsHTML('') === '' && K.bulletsHTML(null) === '' && K.bulletsHTML('line one\r\n* two').includes('<li>two</li>'), 'empty input and Windows line endings are handled');

  // Lessons learned appears only for completed projects.
  const flow = { name: 'Mini', phases: [{ id: 'a', name: 'Alpha', short: 'Alpha', goal: '', gates: [{ id: 'g1', text: 'one' }] }] };
  const mk = (done, o) => ({ name: 'P', template: 'custom', flow: flow, phases: { a: { status: done ? 'done' : 'in_progress', completedAt: done ? '2026-06-01' : '', gates: { g1: !!done } } }, outcomes: o || {} });
  const wip = mk(false, { value: '* a' }), fin = mk(true, { value: '* Saved time\n* Fewer errors', lessons: '* Involve finance earlier\n* Keep the threshold in config' });
  ok(!K.outcomesHTML(wip, true).includes('id="out-lessons"') && K.outcomesHTML(wip, true).includes('Lessons learned can be added once every phase is done'), 'in progress: no lessons box, with a note saying when it unlocks');
  ok(!K.outcomesHTML(wip, false).includes('Lessons learned'), 'in progress, read-only: no lessons section at all');
  const edit = K.outcomesHTML(fin, true), view = K.outcomesHTML(fin, false);
  ok(edit.includes('id="out-lessons"') && edit.includes('data-outlessons') && edit.includes('Involve finance earlier') && edit.includes('Start a line with * or - to make it a bullet'), 'completed: the lessons box appears, filled, with the bullet hint');
  ok(count(edit, /Start a line with \* or -/g) === 2, 'the bullet hint appears under both Value added and Lessons learned');
  ok(view.includes('<p class="sub">Lessons learned</p>') && count(view, /<li>/g) === 4 && view.includes('<li>Saved time</li>') && view.includes('<li>Involve finance earlier</li>'), 'completed, read-only: Value added and Lessons learned render as bullet lists');
  ok(K.outcomesHTML(mk(true, {}), false).includes('Lessons learned') && K.outcomesHTML(mk(true, {}), false).includes('Not recorded yet.'), 'completed with no lessons says Not recorded yet');

  // Saving through the real change handler.
  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true; app.projects = { p1: fin };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); app.projects[id] = Object.assign({}, app.projects[id], d); } }) });
  app.bindEvents();
  els.pbPage.h.change({ target: { matches: s => s === '[data-outlessons]', value: '  * Start earlier\n* Write it down  ' } });
  await new Promise(r => setTimeout(r, 20));
  const saved = wrote[wrote.length - 1].outcomes;
  ok(saved.lessons === '* Start earlier\n* Write it down' && saved.value === '* Saved time\n* Fewer errors', 'saving lessons trims the text and leaves the value added alone');

  // Year in review shows both as bullets.
  const rv = K.reviewHTML(K.reviewData({ p1: fin }, 2026));
  ok(rv.includes('Lessons learned') && rv.includes('<li>Keep the threshold in config</li>') && rv.includes('<li>Fewer errors</li>'), 'the year in review shows value added and lessons as bullet lists');
  const rv2 = K.reviewHTML(K.reviewData({ p1: mk(true, { value: 'x' }) }, 2026));
  ok(!rv2.includes('Lessons learned'), 'the review skips the lessons heading when none were written');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
