const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

let captured = null;
const calls = [];
const win = { scrollTo() {}, FlowStatic: {
  resolvedPaint: (el, vars) => { calls.push('resolvedPaint'); return { literal: true }; },
  toSVG: (doc, opts) => { calls.push(opts.paint && opts.paint.literal ? 'literal-toSVG' : 'var-toSVG'); return { svg: '<svg viewBox="0 0 10 10"><text>' + doc.nodes[0].text + '</text></svg>' }; } } };
const els = {};
const doc = { getElementById: id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', hidden: false, style: {}, addEventListener() {}, matches() { return false; }, closest() { return null; }, focus() {} }),
  activeElement: null, addEventListener() {}, body: { appendChild() {} }, documentElement: {}, querySelector: () => ({ getAttribute: () => 'phase-board-core.js?v=abc' }), createElement: () => ({ style: {}, click() {}, remove() {} }) };
class FakeBlob { constructor(parts) { this.text = parts.join(''); } }
const fetchLocal = async url => ({ ok: true, text: async () => fs.readFileSync(dir + url.split('?')[0], 'utf8') });
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'fetch', 'Blob', 'URL', 'getComputedStyle', 'setTimeout',
  core + '\n' + appSrc + '\nreturn {PhaseBoardApp, blankProject, phaseState};')(doc, win, undefined, undefined, fetchLocal, FakeBlob,
  { createObjectURL: b => { captured = b.text; return 'blob:x'; }, revokeObjectURL() {} }, () => ({ getPropertyValue: () => '#123456' }), () => 0);

(async () => {
  const flow = { key: 'x', name: 'X', phases: [{ id: 'a', name: 'A', short: 'A', goal: '', gates: [{ id: 'g1', text: 't' }] }] };
  const p = K.blankProject('Has diagram', flow, '', '');
  p.phases.a.diagrams = [{ id: 'd1', snippetId: '1', title: 'Flow one', canvas: JSON.stringify({ nodes: [{ id: 'n', type: 'text', text: 'SECRETNODETEXT', x: 0, y: 0, width: 10, height: 10 }], edges: [] }), cards: 1, links: 0, savedAt: '2026-11-01' }];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.loaded = true; app.projects = { p1: p };
  await app.exportSnapshot();
  ok(!!captured, 'an export file is produced');
  const data = JSON.parse([...captured.matchAll(/<script type="application\/json" id="board-data">([\s\S]*?)<\/script>/g)][0][1]);
  ok(calls.includes('resolvedPaint') && calls.includes('literal-toSVG'), 'diagrams are drawn with literal theme colors for the file');
  ok(data.svgs.d1 && data.svgs.d1.includes('SECRETNODETEXT'), 'the picture is stored in the file');
  ok(!JSON.stringify(data.projects).includes('SECRETNODETEXT') && data.projects.p1.phases.a.diagrams[0].canvas === undefined, 'the chart data itself is not in the file');
  ok(app.projects.p1.phases.a.diagrams[0].canvas, 'the live project still has its chart data (the export worked on a copy)');
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
