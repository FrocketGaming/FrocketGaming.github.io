// Dragging cards in progress to change their work-order number.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..') + '/';
const core = fs.readFileSync(dir + 'phase-board-core.js', 'utf8');
const appSrc = fs.readFileSync(dir + 'phase-board-app.js', 'utf8').replace(/document\.addEventListener\('DOMContentLoaded'[^\n]*\n?/, '');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const els = {};
const classes = new Set();
const stub = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', style: {}, hidden: false, addEventListener(t, f) { (this.h = this.h || {})[t] = f; }, matches() { return false; }, closest() { return null; }, focus() {}, querySelectorAll() { return []; } });
const doc = { getElementById: stub, activeElement: null, addEventListener() {}, body: { appendChild() {} } };
const K = new Function('document', 'window', 'firebase', 'firebaseConfig', 'localStorage', core + '\n' + appSrc +
  '\nreturn {PhaseBoardApp, byPriority, hasOrder, activeOrder, moveInOrder, orderWrites, dropPlace, rankMap, cardHTML, portfolioBodyHTML, blankProject, TEMPLATES, buildBackup, parseBackup};')(doc, { scrollTo() {} }, undefined, undefined, { getItem: () => null, setItem() {} });
const wait = () => new Promise(r => setTimeout(r, 20));
const std = K.TEMPLATES.standard;
const live = (name, extra) => Object.assign(K.blankProject(name, { key: 'standard', name: std.name, phases: std.phases }), { started: '2026-01-01' }, extra || {});
const finished = name => { const p = live(name); p.flow.phases.forEach(d => { p.phases[d.id] = { status: 'done', completedAt: '2026-02-01', gates: {} }; }); return p; };

(async () => {
  // ---- the order itself ----
  const base = { a: live('Alpha'), b: live('Bravo'), c: live('Charlie'), d: live('Delta') };
  ok(K.activeOrder(base).join() === 'a,b,c,d', 'projects never moved keep the rule order (here, by name)');
  const hand = { a: live('Alpha', { order: 3 }), b: live('Bravo', { order: 1 }), c: live('Charlie', { order: 2 }), d: live('Delta') };
  ok(K.activeOrder(hand).join() === 'b,c,a,d', 'a hand-set order wins, and projects without one follow');
  const prio = { a: live('Alpha', { priority: 'high', order: 2 }), b: live('Bravo', { priority: 'low', order: 1 }) };
  ok(K.activeOrder(prio).join() === 'b,a', 'the order you set outranks the priority label');
  ok(K.activeOrder({ x: live('X', { order: 'oops' }), y: live('Y', { order: 1 }), z: live('Z', { order: NaN }) }).join() === 'y,x,z', 'an order that is not a number is ignored');
  ok(K.activeOrder({ a: live('Alpha', { order: 1 }), f: finished('Done'), e: live('Arch', { archived: true, order: 2 }) }).join() === 'a', 'finished and archived projects are not in the order');

  ok(K.moveInOrder(['a', 'b', 'c', 'd'], 'd', 'b', false).join() === 'a,d,b,c', 'dropping before a card puts it ahead of that card');
  ok(K.moveInOrder(['a', 'b', 'c', 'd'], 'a', 'c', true).join() === 'b,c,a,d', 'dropping after a card puts it behind that card');
  ok(K.moveInOrder(['a', 'b', 'c'], 'b', 'b', true).join() === 'a,b,c' && K.moveInOrder(['a', 'b', 'c'], 'x', 'b', true).join() === 'a,b,c' && K.moveInOrder(['a', 'b'], 'a', 'zz', true).join() === 'a,b', 'moving onto itself or an unknown card changes nothing');
  const w = K.orderWrites({ a: { order: 1 }, b: { order: 2 }, c: {} }, ['a', 'b', 'c']);
  ok(JSON.stringify(w) === '[{"id":"c","order":3}]', 'only projects whose number changes are written');
  ok(K.dropPlace({ left: 0, top: 0, width: 100, height: 100 }, 80, 50).after === true && K.dropPlace({ left: 0, top: 0, width: 100, height: 100 }, 80, 50).axis === 'x', 'over the right half of a card means after, along the row');
  ok(K.dropPlace({ left: 0, top: 0, width: 100, height: 100 }, 20, 50).after === false && K.dropPlace({ left: 0, top: 0, width: 300, height: 100 }, 150, 95).axis === 'y' && K.dropPlace({ left: 0, top: 0, width: 300, height: 100 }, 150, 95).after === true, 'the left half means before, and a card stacked in a column is judged top or bottom');

  // ---- cards ----
  const r = K.rankMap(hand);
  const card = K.cardHTML('b', hand.b, '', {}, r.b, true);
  ok(card.includes('draggable="true" data-drag="b"') && card.includes('aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"'), 'an in-progress card on the board can be dragged');
  ok(!K.cardHTML('b', hand.b, '', {}, r.b).includes('draggable') && !K.cardHTML('f', finished('F'), '', {}, undefined, true).includes('draggable'), 'exports and finished cards cannot be');
  const body = K.portfolioBodyHTML(Object.keys(hand).map(id => ({ id, p: hand[id] })), 'all', { when: () => '', hues: {}, ranks: r, drag: true });
  ok(body.includes('Drag a card to change it') && (body.match(/data-drag=/g) || []).length === 4, 'the board explains how and every active card is draggable');
  ok(!K.portfolioBodyHTML([{ id: 'a', p: hand.a }], 'all', { when: () => '', hues: {}, ranks: K.rankMap({ a: hand.a }), drag: true }).includes('Drag a card'), 'with one card there is nothing to explain');

  // ---- the real handlers ----
  const batches = [];
  const app = new K.PhaseBoardApp();
  app.user = { uid: 'u' }; app.loaded = true; app.projects = { a: live('Alpha'), b: live('Bravo'), c: live('Charlie'), d: live('Delta') };
  app.db = { batch: () => { const ops = []; const b = { update: (ref, d) => ops.push({ id: ref.id, d }), commit: async () => { batches.push(ops); } }; return b; } };
  app.projectsRef = () => ({ doc: id => ({ id }) });
  app.bindEvents();
  const H = els.pbPage.h;
  const mkCard = (id, rect) => ({ getAttribute: () => id, classList: { add: c => classes.add(id + ':' + c), remove() {} }, getBoundingClientRect: () => rect || { left: 0, top: 0, width: 100, height: 100 } });
  const ev = (card, x, y) => ({ target: { closest: s => s === '[data-drag]' ? card : null }, clientX: x, clientY: y, dataTransfer: { setData() {} }, preventDefault() { this.prevented = true; } });

  const dragged = ev(mkCard('d'), 0, 0);
  H.dragstart(dragged);
  ok(app.dragId === 'd' && classes.has('d:is-dragging'), 'starting a drag remembers the card and dims it');
  const over = ev(mkCard('a'), 20, 50);
  H.dragover(over);
  ok(over.prevented === true && classes.has('a:drop-l'), 'passing over another card marks the side it would land on');
  const self = ev(mkCard('d'), 20, 50);
  H.dragover(self);
  ok(!self.prevented, 'passing over itself marks nothing');
  const drop = ev(mkCard('b'), 20, 50);
  H.drop(drop);
  await wait();
  ok(app.dragId === null && K.activeOrder(app.projects).join() === 'a,d,b,c', 'dropping on the left of Bravo puts Delta ahead of it');
  ok(batches.length === 1 && batches[0].every(o => typeof o.d.order === 'number') && batches[0].map(o => o.id + o.d.order).sort().join() === 'a1,b3,c4,d2', 'the first move numbers every card in progress, and saves them together');
  ok(K.rankMap(app.projects).d.n === 2, 'the card now shows its new number');

  // dropping with nothing being dragged, or on its own place, writes nothing
  const n = batches.length;
  H.drop(ev(mkCard('b'), 20, 50)); await wait();
  ok(batches.length === n, 'a drop that did not start from a card does nothing');
  H.dragstart(ev(mkCard('a'), 0, 0));
  H.drop(ev(mkCard('d'), 20, 50)); await wait();
  ok(batches.length === n && K.activeOrder(app.projects).join() === 'a,d,b,c', 'dropping a card where it already is writes nothing');
  H.dragend();
  ok(app.dragId === null, 'ending a drag clears it');

  // keyboard
  app.document = doc;
  const key = (id, k) => ({ key: k, altKey: true, target: { closest: s => s === '[data-drag]' ? mkCard(id) : null, matches: () => false }, preventDefault() { this.prevented = true; } });
  const kd = key('c', 'ArrowUp');
  H.keydown(kd); await wait();
  ok(kd.prevented && K.activeOrder(app.projects).join() === 'a,d,c,b' && /Moved to number 3 of 4/.test(app.note), 'Alt and the up arrow moves a focused card one place earlier and says so');
  H.keydown(key('c', 'ArrowDown')); await wait();
  ok(K.activeOrder(app.projects).join() === 'a,d,b,c', 'Alt and the down arrow moves it back');
  const m = batches.length;
  H.keydown(key('a', 'ArrowUp')); await wait();
  ok(batches.length === m && K.activeOrder(app.projects).join() === 'a,d,b,c', 'the first card cannot go earlier');
  H.keydown({ key: 'ArrowUp', altKey: false, target: { closest: () => mkCard('c'), matches: () => false } }); await wait();
  ok(batches.length === m, 'the arrow without Alt does nothing');

  // a later move writes only the cards whose number changed
  const k = batches.length;
  H.dragstart(ev(mkCard('b'), 0, 0));
  H.drop(ev(mkCard('d'), 20, 50)); await wait();
  ok(batches.length === k + 1 && batches[k].map(o => o.id + o.d.order).sort().join() === 'b2,d3' && K.activeOrder(app.projects).join() === 'a,b,d,c', 'swapping two neighbours writes only those two cards');

  // failure
  const bad = new K.PhaseBoardApp();
  bad.user = { uid: 'u' }; bad.loaded = true; bad.projects = { a: live('Alpha'), b: live('Bravo') };
  bad.db = { batch: () => ({ update() {}, commit: async () => { throw new Error('offline'); } }) };
  bad.projectsRef = () => ({ doc: id => ({ id }) });
  const origErr = console.error; console.error = () => {};
  const saved = await bad.moveProject('b', 'a', false);
  console.error = origErr;
  ok(saved === false && bad.noteErr && /not saved/.test(bad.note), 'if saving fails, it says so');

  // backups and exports keep the order
  const b = K.buildBackup({ a: live('Alpha', { order: 2 }), b: live('Bravo', { order: 1 }) }, {});
  const back = K.parseBackup(JSON.stringify(b));
  ok(back && back.projects && back.projects.b && back.projects.b.order === 1, 'a backup keeps each project\'s order');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
