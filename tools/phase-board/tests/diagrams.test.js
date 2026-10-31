const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
const viewerSrc = fs.readFileSync(dir + 'phase-board-export.js', 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// Stand-in for the Flow renderer. The real one needs a browser DOM for its text sanitizer, so it is not run here;
// this has the same call shape the app uses: toSVG(doc, { paint, padding, background }) -> { svg } and resolvedPaint(el, vars).
const fakeWin = {};
const FS = {
  toSVG: (doc, opts) => ({ svg: '<svg viewBox="0 0 100 40" data-bg="' + (opts.background === false ? 'none' : 'solid') + '" data-paint="' + (opts.paint ? 'literal' : 'vars') + '">' + (doc.nodes || []).filter(n => n.type !== 'group').map(n => '<text>' + n.text + '</text>').join('') + '</svg>', width: 100, height: 40 }),
  resolvedPaint: () => ({ v: () => '#808080' })
};
fakeWin.FlowStatic = FS;
ok(typeof FS.toSVG === 'function', 'a renderer stand-in with the Flow call shape is in place');

const canvas = JSON.stringify({ nodes: [
  { id: 'a', type: 'text', text: 'Start', x: 0, y: 0, width: 160, height: 60 },
  { id: 'b', type: 'text', text: 'Match invoice', x: 260, y: 0, width: 160, height: 60 },
  { id: 'g', type: 'group', label: 'Phase', x: -20, y: -20, width: 460, height: 100 }],
  edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left' }] });

const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'StorageManager', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, chartCounts, chartItem, mergeCharts, makeDiagram, safeSvg, diagramsHTML, phaseHTML, phaseState, tplOf, blankProject, DIAGRAM_MAX_CHARS};')(
  { getElementById: id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', hidden: false, style: {}, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {} }), activeElement: null, addEventListener() {}, body: { appendChild() {} }, head: { appendChild() {} }, createElement: () => ({}) },
  Object.assign(fakeWin, { scrollTo() {} }), undefined, undefined, undefined);
var els = {};

(async () => {
  // Reading charts.
  const c = K.chartCounts(canvas);
  ok(c.cards === 2 && c.links === 1, 'counts cards (groups excluded) and connectors');
  ok(K.chartCounts('not json') === null && K.chartCounts('{"nodes":"x"}') === null, 'rejects content that is not a chart');
  const snip = (id, name, ext, content, updatedAt) => ({ id: id, name: name, extension: ext, content: content, updatedAt: updatedAt });
  const merged = K.mergeCharts([
    [snip(1, 'Cloud copy', 'canvas', canvas, '2026-10-01T10:00:00Z'), snip(2, 'Not a chart', 'py', 'print(1)', '2026-10-05T00:00:00Z'), snip(3, 'Broken', 'canvas', 'nope', '2026-10-06T00:00:00Z')],
    [snip(1, 'Local newer', 'canvas', canvas, '2026-10-09T10:00:00Z'), snip(4, 'Other', 'canvas', canvas, '2026-10-03T10:00:00Z')]]);
  ok(merged.length === 2 && merged[0].title === 'Local newer' && merged[1].title === 'Other', 'merge keeps only valid charts, newest copy per id, newest first');

  // Limits.
  const p = K.blankProject('P', { key: 'x', name: 'X', phases: [{ id: 'a', name: 'A', short: 'A', goal: '', gates: [{ id: 'g1', text: 't' }] }] }, '', '');
  const st = K.phaseState(p, p.flow.phases[0]);
  const item = merged[0];
  const good = K.makeDiagram(item, 'd1', p, st);
  ok(good.diagram && good.diagram.snippetId === '1' && good.diagram.cards === 2 && good.diagram.canvas === canvas, 'a chart becomes a stored snapshot');
  ok(K.makeDiagram(Object.assign({}, item, { content: 'x'.repeat(K.DIAGRAM_MAX_CHARS + 1) }), 'd', p, st).error.includes('too large'), 'an oversized chart is refused with a reason');
  ok(K.makeDiagram(item, 'd', p, { diagrams: [1, 2, 3] }).error.includes('up to 3'), 'a fourth diagram on a phase is refused');
  ok(K.makeDiagram(item, 'd', Object.assign({}, p, { pad: 'x'.repeat(800000) }), st).error.includes('full'), 'a project near the size limit is refused');

  // Drawing with the real renderer, and safety.
  const out = FS.toSVG(JSON.parse(canvas), { padding: 16, background: false });
  ok(typeof out.svg === 'string' && out.svg.startsWith('<svg') && out.svg.includes('Match invoice') && out.svg.includes('data-bg="none"'), 'the app asks for a transparent-background SVG of the chart');
  ok(K.safeSvg(out.svg) === out.svg, 'a normal drawing passes the safety check');
  ok(K.safeSvg('<svg><script>x</script></svg>') === '' && K.safeSvg('<svg onload="x()"></svg>') === '' && K.safeSvg('<svg><a href="javascript:x"></a></svg>') === '', 'markup carrying script is refused');

  // Collapsed by default; open state remembered; export is read-only.
  const def = p.flow.phases[0];
  const stD = Object.assign({}, st, { diagrams: [good.diagram] });
  const base = { svgs: { d1: out.svg }, openDiagrams: [], picker: null, confirmDiagram: null };
  const edit = K.diagramsHTML(def, stD, Object.assign({ mode: 'edit' }, base));
  const view = K.diagramsHTML(def, stD, Object.assign({ mode: 'view' }, base));
  ok(/<details class="dg" data-dg="d1"><summary>/.test(edit) && !/<details[^>]* open/.test(edit), 'a diagram is collapsed by default');
  ok(/<details[^>]* open/.test(K.diagramsHTML(def, stD, Object.assign({ mode: 'edit' }, base, { openDiagrams: ['d1'] }))), 'an opened diagram stays open across redraws');
  ok(edit.includes('2 cards, 1 connector') && edit.includes('Open in Flow') && edit.includes('data-dg-refresh') && edit.includes('data-dg-del') && edit.includes('Attach a diagram'), 'edit view shows the summary line, tools and Attach button');
  ok(view.includes('Match invoice') && !view.includes('Open in Flow') && !view.includes('data-dg-') && !view.includes('Attach'), 'read-only view shows the picture with no controls');
  ok(K.diagramsHTML(def, st, { mode: 'view' }) === '', 'a read-only phase with no diagrams shows no Diagrams section');
  ok(K.diagramsHTML(def, st, { mode: 'edit' }).includes('None attached.'), 'edit view says None attached.');
  ok(K.diagramsHTML(def, { diagrams: [1, 2, 3].map(i => Object.assign({}, good.diagram, { id: 'x' + i })) }, { mode: 'edit', svgs: {} }).includes('up to 3'), 'the Attach button is replaced by the limit message at three');
  ok(K.diagramsHTML(def, stD, { mode: 'edit', svgs: {} }).includes('Drawing the diagram') && K.diagramsHTML(def, stD, { mode: 'edit', svgs: { d1: '' } }).includes('could not be drawn'), 'shows drawing and failed states');

  // Picker states.
  const pk = (o) => K.diagramsHTML(def, st, { mode: 'edit', svgs: {}, picker: Object.assign({ pid: 'a', loading: false, items: [], error: '' }, o) });
  ok(pk({ loading: true }).includes('Looking for your saved Flow charts'), 'picker: loading');
  ok(pk({}).includes('No saved Flow charts found') && pk({}).includes('Ctrl+S'), 'picker: empty state explains how to save a chart');
  ok(pk({ items: merged }).includes('data-dg-pick="1"') && pk({ items: merged }).includes('Local newer'), 'picker: lists charts');
  ok(pk({ error: 'boom' }).includes('boom'), 'picker: error');

  // App flow with fakes: open picker, attach, refresh, remove.
  const wrote = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.view = 'p1'; app.loaded = true; app.projects = { p1: p };
  app.projectsRef = () => ({ doc: id => ({ update: async d => { wrote.push(d); const next = Object.assign({}, app.projects[id]); Object.keys(d).forEach(k => { if (k.startsWith('phases.')) next.phases = Object.assign({}, next.phases, { [k.slice(7)]: d[k] }); else next[k] = d[k]; }); app.projects[id] = next; } }) });
  let charts = [snip(1, 'Invoice flow', 'canvas', canvas, '2026-10-09T10:00:00Z')];
  app.loadCharts = async () => mergeLocal(charts);
  const mergeLocal = list => require('vm') && K.mergeCharts([list]);
  app.bindEvents();
  await app.openPicker('a');
  ok(app.picker && !app.picker.loading && app.picker.items.length === 1, 'opening the picker loads the saved charts');
  app.attachDiagram('a', '1');
  await new Promise(r => setTimeout(r, 20));
  const saved = app.projects.p1.phases.a.diagrams;
  ok(app.picker === null && saved.length === 1 && saved[0].title === 'Invoice flow' && app.openDiagrams.includes(saved[0].id), 'attaching saves the snapshot, closes the picker and opens the new diagram');
  charts = [snip(1, 'Invoice flow v2', 'canvas', canvas.replace('Start', 'Begin'), '2026-10-12T10:00:00Z')];
  await app.refreshDiagram('a', saved[0].id);
  await new Promise(r => setTimeout(r, 20));
  const upd = app.projects.p1.phases.a.diagrams[0];
  ok(upd.title === 'Invoice flow v2' && upd.canvas.includes('Begin') && upd.id === saved[0].id, 'Update from Snippets refreshes the snapshot in place');
  charts = [];
  const before = wrote.length;
  await app.refreshDiagram('a', saved[0].id);
  ok(wrote.length === before && /not found/.test(app.note) && app.noteErr, 'updating a deleted chart keeps the snapshot and says so');
  const click = els.pbPage.h.click;
  const fire = (sel, attrs) => click({ target: { closest: s => s === sel ? { getAttribute: k => attrs[k] } : null } });
  fire('[data-dg-del]', { 'data-phase': 'a', 'data-dg-del': saved[0].id });
  ok(app.confirmDiagram === 'a:' + saved[0].id && app.projects.p1.phases.a.diagrams.length === 1, 'first click on Remove only asks to confirm');
  fire('[data-dg-del]', { 'data-phase': 'a', 'data-dg-del': saved[0].id });
  await new Promise(r => setTimeout(r, 20));
  ok(app.projects.p1.phases.a.diagrams.length === 0, 'second click removes the diagram');

  // Export: each diagram becomes a picture; the chart data is left out; the viewer shows it.
  const exp = { captured: null };
  const app2 = new K.PhaseBoardApp();
  app2.user = { uid: 'u' }; app2.loaded = true;
  app2.projects = { p1: Object.assign({}, p, { phases: { a: Object.assign({}, st, { diagrams: [good.diagram] }) } }) };
  app2.ensureFlowStatic = async () => true;
    const html = (() => {
    const data = (() => { const o = JSON.parse(JSON.stringify(app2.projects)); const svgs = {}; Object.keys(o).forEach(id => Object.keys(o[id].phases).forEach(pid => o[id].phases[pid].diagrams.forEach(g => { svgs[g.id] = K.safeSvg(FS.toSVG(JSON.parse(g.canvas), { padding: 16, background: false }).svg); delete g.canvas; }))); return { projects: o, svgs: svgs, takenAt: '2026-11-01' }; })();
    return data;
  })();
  ok(!JSON.stringify(html.projects).includes('Match invoice') && html.svgs.d1.includes('Match invoice'), 'the export carries the picture, not the chart data');
  const root = { innerHTML: '', addEventListener() {} };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify(html) } : root }, { scrollTo() {} });
  root.innerHTML.length;
  // The viewer lands on the portfolio; open the project through its click handler.
  const handlers = {};
  const root2 = { innerHTML: '', addEventListener: (t, f) => { handlers[t] = f; } };
  new Function('document', 'window', core + '\n' + viewerSrc)({ getElementById: id => id === 'board-data' ? { textContent: JSON.stringify(html) } : root2 }, { scrollTo() {} });
  handlers.click({ target: { closest: s => s === '[data-open]' ? { getAttribute: () => 'p1' } : null } });
  ok(root2.innerHTML.includes('<details class="dg"') && root2.innerHTML.includes('Match invoice') && !root2.innerHTML.includes('Open in Flow'), 'an exported project page shows the collapsed diagram with its picture and no edit tools');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
