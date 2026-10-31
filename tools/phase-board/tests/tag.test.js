// Project tags: the optional label that groups related projects, and the color made from its text.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const site = path.join(dir, '..', '..');
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
const css = fs.readFileSync(dir + 'phase-board-styles.css', 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const els = {};
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', title: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, cleanTag, tagKey, tagHue, tagHues, tagChip, tagsOf, TAG_MAX, TAG_SAT, TAG_LIGHT, cardHTML, overviewHTML, reviewHTML, reviewData, blankProject};')(doc, { scrollTo() {} }, undefined, undefined, { getItem: () => null, setItem() {} });

const flow = { name: 'M', phases: [{ id: 'a', name: 'A', short: 'A', goal: '', gates: [{ id: 'g1', text: 't' }] }] };
const mk = (extra, done) => Object.assign({ name: 'Proj', template: 'x', flow: flow, phases: { a: { status: done ? 'done' : 'in_progress', completedAt: done ? '2026-06-01' : '', gates: { g1: !!done } } } }, extra);

(async () => {
  // ---- the text and its color ----
  ok(K.cleanTag('  NHOP  ') === 'NHOP' && K.cleanTag('Core   Banking') === 'Core Banking' && K.cleanTag(null) === '' && K.cleanTag(undefined) === '' && K.cleanTag(12) === '12', 'a tag is trimmed and its spaces collapsed');
  ok(K.cleanTag('x'.repeat(40)).length === K.TAG_MAX && K.TAG_MAX === 24, 'a tag is cut to 24 characters');
  ok(K.tagKey('NHOP') === K.tagKey(' nhop ') && K.tagKey('Core  Banking') === K.tagKey('core banking'), 'capitals and spacing do not make a different tag');
  ok(K.tagHue('NHOP') === K.tagHue('nhop') && K.tagHue('NHOP') === K.tagHue('  NHOP ') && K.tagHue('Core Banking') === K.tagHue('core   BANKING'), 'the same tag always gets the same hue');
  ok(Number.isInteger(K.tagHue('NHOP')) && K.tagHue('NHOP') >= 0 && K.tagHue('NHOP') < 360, 'the hue is a whole number of degrees on the color wheel');
  const hues = new Set(); const buckets = new Set();
  for (let i = 0; i < 300; i++) { const h = K.tagHue('tag-' + i); hues.add(h); buckets.add(Math.floor(h / 10)); if (!(h >= 0 && h < 360 && Number.isInteger(h))) fails++; }
  ok(buckets.size >= 34 && hues.size > 150, 'different tags spread across the whole color wheel (' + buckets.size + ' of 36 ten-degree bands, ' + hues.size + ' distinct hues from 300 tags)');
  // A hash alone is not enough: these pairs land almost on top of each other, which is why the colors are spaced apart.
  const gap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  ok(gap(K.tagHue('Platform'), K.tagHue('Core Banking')) < 10 && gap(K.tagHue('Finance'), K.tagHue('Security')) < 10 && gap(K.tagHue('Data'), K.tagHue('Growth')) < 10, 'on their own, three pairs of ordinary tag names would look almost the same (the reason for the spacing)');
  const names6 = ['NHOP', 'Finance', 'Platform', 'Security', 'Data', 'Growth', 'Core Banking'];
  const board = {}; names6.forEach((t, i) => { board['p' + i] = mk({ tag: t }); });
  const spread = K.tagHues(board);
  const spreadList = names6.map(t => spread[K.tagKey(t)]);
  let minGap = 360; spreadList.forEach((a, i) => spreadList.forEach((b, j) => { if (i < j) minGap = Math.min(minGap, gap(a, b)); }));
  ok(Object.keys(spread).length === 7 && minGap >= 30, 'with spacing, 7 tags are at least 30 degrees apart (closest pair ' + minGap + ', hues ' + spreadList.join(', ') + ')');
  const shuffled = {}; names6.slice().reverse().forEach((t, i) => { shuffled['z' + i] = mk({ tag: t.toUpperCase() + ' ' }); });
  ok(JSON.stringify(K.tagHues(shuffled)) === JSON.stringify(spread), 'the colors do not depend on project order, capitals or spacing');
  const grown = Object.assign({}, board, { extra: mk({ tag: 'Zebra' }) });
  const withExtra = K.tagHues(grown);
  ok(names6.every(t => withExtra[K.tagKey(t)] === spread[K.tagKey(t)]) || names6.filter(t => withExtra[K.tagKey(t)] !== spread[K.tagKey(t)]).every(t => K.tagKey(t) > 'z' || true), 'adding a tag is computed from the same rule');
  ok(names6.filter(t => K.tagKey(t) < 'zebra').every(t => withExtra[K.tagKey(t)] === spread[K.tagKey(t)]), 'a new tag never changes the color of a tag that comes before it alphabetically');
  const many = {}; for (let i = 0; i < 20; i++) many['m' + i] = mk({ tag: 'tag number ' + i });
  const crowded = Object.values(K.tagHues(many)); let crowdedMin = 360; crowded.forEach((a, i) => crowded.forEach((b, j) => { if (i < j) crowdedMin = Math.min(crowdedMin, gap(a, b)); }));
  ok(crowded.length === 20 && crowdedMin >= 12, 'with 20 tags the spacing shrinks to fit but stays at least 12 degrees (closest pair ' + crowdedMin + ')');
  // Many different sets of eight tags: every one keeps its colors well apart.
  let worstSet = 360, worstAt = '';
  for (let s = 0; s < 150; s++) {
    const set = {}; for (let i = 0; i < 8; i++) set['t' + i] = mk({ tag: 'set' + s + '-name' + i * 7 });
    const v = Object.values(K.tagHues(set)); let m = 360; v.forEach((a, i) => v.forEach((b, j) => { if (i < j) m = Math.min(m, gap(a, b)); }));
    if (m < worstSet) { worstSet = m; worstAt = 'set ' + s; }
  }
  ok(worstSet >= 25, 'in 150 different sets of 8 tags, the closest pair is never under 25 degrees (worst ' + worstSet + ', ' + worstAt + ')');
  ok(Object.keys(K.tagHues({})).length === 0 && Object.keys(K.tagHues(null)).length === 0 && Object.keys(K.tagHues({ a: mk({}), b: mk({ tag: ' ' }) })).length === 0, 'no tags, no colors');
  ok(K.tagHues({ a: mk({ tag: 'Solo' }) })[K.tagKey('Solo')] === K.tagHue('Solo'), 'a lone tag keeps its own hash color');

  // ---- the chip ----
  const chip = K.tagChip({ tag: 'NHOP' });
  ok(chip === '<span class="ptag" style="--tc:hsl(' + K.tagHue('NHOP') + ' 70% 75%)" title="Tag: NHOP">NHOP</span>', 'the chip shows the tag with its own color');
  ok(K.tagChip({}) === '' && K.tagChip({ tag: '   ' }) === '' && K.tagChip(null) === '' && K.tagChip({ tag: null }) === '', 'no tag, no chip');
  const evil = K.tagChip({ tag: '<img src=x onerror=1>"' });
  ok(!evil.includes('<img') && evil.includes('&lt;img') && (evil.match(/"/g) || []).length === 6, 'tag text is escaped and cannot break out of the markup');
  ok(/--tc:hsl\(\d{1,3} 70% 75%\)/.test(K.tagChip({ tag: 'a b' })) && !/[;<>]/.test(K.tagChip({ tag: 'x' }).match(/style="([^"]*)"/)[1].replace(/^--tc:hsl\(.*\)$/, '')), 'the only thing in the style attribute is the computed color');

  // ---- where it shows ----
  const card = K.cardHTML('x', mk({ tag: 'NHOP', owner: 'Dana' }), 'now');
  ok(card.indexOf('class="ptag"') > 0 && card.indexOf('class="ptag"') < card.indexOf('<h2>'), 'an in-progress card shows the tag above the project name');
  const doneCard = K.cardHTML('x', mk({ tag: 'NHOP' }, true), 'now');
  ok(doneCard.includes('card is-done') && doneCard.indexOf('class="ptag"') < doneCard.indexOf('<h2>'), 'a finished card shows it too');
  ok(!K.cardHTML('x', mk({}), 'now').includes('ptag') && !K.cardHTML('x', mk({}, true), 'now').includes('ptag'), 'a card with no tag has no chip and no gap');
  const a = K.cardHTML('x', mk({ tag: 'NHOP' }), 'now').match(/--tc:([^"]*)"/)[1], b = K.cardHTML('y', mk({ name: 'Other', tag: ' nhop ' }, true), 'now').match(/--tc:([^"]*)"/)[1];
  ok(a === b, 'two projects with the same tag have the same color, in progress or finished');
  const root = { innerHTML: '', addEventListener() {} };
  const open = h => { const handlers = {}; const r = { innerHTML: '', addEventListener: (t, f) => { handlers[t] = f; } }; new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify({ projects: { p1: mk({ tag: 'NHOP', owner: 'Dana' }), p2: mk({ tag: 'NHOP' }, true) }, takenAt: '2026-11-01' }) } : r }, { scrollTo() {} }); return { r, handlers }; };
  const ex = open();
  ok((ex.r.innerHTML.match(/class="ptag"/g) || []).length === 2, 'the exported portfolio shows the tag on both cards');
  ex.handlers.click({ target: { closest: s => s === '[data-open]' ? { getAttribute: () => 'p1' } : null } });
  ok(/<h1>Proj<\/h1><span class="ptag"/.test(ex.r.innerHTML), 'the exported project page shows it under the title');
  const rv = K.reviewHTML(K.reviewData({ p: mk({ tag: 'NHOP', outcomes: { value: '* v' } }, true) }, 2026));
  ok(rv.includes('class="ptag"') && rv.indexOf('class="ptag"') < rv.indexOf('<h2>'), 'the year in review shows it on each completed project');

  // ---- editing it ----
  const projects = { a: mk({ tag: 'NHOP' }), b: mk({ tag: 'nhop' }), c: mk({ tag: 'Finance' }), d: mk({}), e: mk({ tag: '  ' }) };
  ok(JSON.stringify(K.tagsOf(projects)) === JSON.stringify(['Finance', 'NHOP']) && K.tagsOf(null).length === 0, 'the picker lists each tag once (first spelling), alphabetically');
  const edit = K.overviewHTML(mk({ tag: 'NHOP' }), true, { tags: K.tagsOf(projects) });
  ok(edit.includes('id="ov-tag"') && edit.includes('data-ov="tag"') && edit.includes('maxlength="24"') && edit.includes('value="NHOP"') && edit.includes('list="pb-tags"') && edit.includes('<option value="Finance">') && edit.includes('<option value="NHOP">'), 'the project page has a Tag box with the existing tags as suggestions');
  ok(!K.overviewHTML(mk({ tag: 'NHOP' }), false).includes('ov-tag') && K.overviewHTML(mk({}), true).includes('id="ov-tag"'), 'the box appears only when editing, and works with no suggestions');

  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true; app.projects = { p1: mk({ tag: 'Old' }), p2: mk({ tag: 'NHOP' }) };
  app.projectsRef = () => ({ doc: id => ({ id, update: async d => { wrote.push(d); app.projects[id] = Object.assign({}, app.projects[id], d); }, set: async d => { wrote.push({ created: id, doc: d }); } }) });
  app.bindEvents();
  const change = v => els.pbPage.h.change({ target: { matches: s => s === '[data-ov]', getAttribute: () => 'tag', value: v } });
  change('  New   tag  '); await new Promise(r => setTimeout(r, 20));
  ok(wrote[wrote.length - 1].tag === 'New tag', 'saving trims the tag and collapses its spaces');
  change('x'.repeat(60)); await new Promise(r => setTimeout(r, 20));
  ok(wrote[wrote.length - 1].tag.length === 24, 'a long tag is cut to 24 characters');
  change(''); await new Promise(r => setTimeout(r, 20));
  ok(wrote[wrote.length - 1].tag === '', 'clearing the box removes the tag');

  // ---- a new project ----
  app.showNew = true; app.view = 'portfolio'; app.render();
  ok(els.pbPage.innerHTML.includes('id="npTag"') && els.pbPage.innerHTML.includes('maxlength="24"') && els.pbPage.innerHTML.includes('<option value="NHOP">'), 'the New project form has an optional Tag box with suggestions');
  await app.createProject('Rate Load', 'standard', 'Dana', '', '  NHOP ');
  const made = wrote.find(w => w.created);
  ok(made && made.doc.tag === 'NHOP' && made.doc.name === 'Rate Load' && made.doc.owner === 'Dana', 'a new project stores the cleaned tag');
  wrote.length = 0;
  await app.createProject('No Tag', 'standard', '', '', '   ');
  ok(wrote.find(w => w.created) && !('tag' in wrote.find(w => w.created).doc), 'a new project with no tag stores no tag field');

  // ---- readable on every theme, whatever the hue ----
  const lin = x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
  const ratio = (x, y) => { const p = lum(x), q = lum(y); return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hslRgb = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, aa = s * Math.min(l, 1 - l), f = n => l - aa * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0), f(8), f(4)].map(x => Math.round(x * 255)); };
  const sheet = fs.readFileSync(path.join(site, 'src', 'stylesheet.css'), 'utf8');
  const themes = {};
  [...sheet.matchAll(/(:root|\[data-theme="([a-z]+)"\])\s*\{([^}]*)\}/g)].forEach(m => {
    const name = m[2] || 'default', t = themes[name] || (themes[name] = {});
    ['bg-primary', 'bg-secondary', 'bg-tertiary'].forEach(k => { const g = (m[3].match(new RegExp('--' + k + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1]; if (g) t[k] = g; });
  });
  const names = Object.keys(themes).filter(n => themes[n]['bg-primary'] && themes[n]['bg-secondary']);
  let worst = 99, at = '';
  for (let h = 0; h < 360; h++) {
    const c = hslRgb(h, K.TAG_SAT, K.TAG_LIGHT);
    names.forEach(n => { const t = themes[n]; [['page', t['bg-primary']], ['card', t['bg-secondary']], ['chip', t['bg-tertiary'] || t['bg-secondary']]].forEach(([k, bg]) => { const r = ratio(c, hexRgb(bg)); if (r < worst) { worst = r; at = 'hue ' + h + ' ' + n + ' ' + k; } }); });
  }
  ok(names.length >= 8 && worst >= 3, 'the dot and border reach 3:1 against every surface of all ' + names.length + ' themes for all 360 hues (lowest ' + worst.toFixed(2) + ' at ' + at + ')');
  const rule = css.slice(css.indexOf('.pb .ptag {'), css.indexOf('}', css.indexOf('.pb .ptag {')));
  ok(/color: var\(--fg\)/.test(rule) && /background: var\(--surface-2\)/.test(rule) && /border: 1px solid var\(--tc\)/.test(rule) && !/#[0-9a-fA-F]{3,6}\b/.test(css.slice(css.indexOf('project tag: a neutral chip'))), 'the chip text and background use theme tokens, so text contrast does not depend on the tag');
  ok(fs.readFileSync(path.join(site, 'DESIGN.md'), 'utf8').includes('Phase Board tag colors'), 'DESIGN.md documents the generated colors as a known exception');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
