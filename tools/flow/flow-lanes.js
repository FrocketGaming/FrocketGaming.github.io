/**
 * P13 - Swimlanes. A lane is a group with styleAttributes.lane = "<pool id>" (FlowStatic.laneOf); the
 * lanes of one pool are kept stacked edge to edge with one x and width. The rules run inside the
 * transaction that broke them (core.onBegin / core.onBeforeCommit), so each gesture stays one undo step:
 *   - resizing a lane's bottom pushes the lanes below; its top edge is shared with the lane above;
 *     resizing its width resizes the whole pool (live while dragging: interact/nodes call lanes.live)
 *   - a lane dragged by its header (with its cards) drops into the slot where its top edge lands
 *   - a lane grows to fit a card dropped near its bottom or right edge; a lane never gets shorter
 *     than its cards
 *   - every lane that moves takes the cards and groups inside it along
 * Membership is geometric like any group, worked out from where things were when the gesture began.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;

    const lanes = Flow.lanes = {};
    const MIN_H = 80, MIN_W = 240, PAD = 20, NEW_H = 160;
    const N = (v) => Number(v) || 0;
    const geom = (n) => ({ x: N(n.x), y: N(n.y), w: N(n.width), h: N(n.height) });
    const centre = (n) => ({ x: N(n.x) + N(n.width) / 2, y: N(n.y) + N(n.height) / 2 });
    const inside = (g, p) => p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h;
    const setNum = (n, k, v) => { v = Math.round(v); if (N(n[k]) !== v || typeof n[k] !== 'number') n[k] = v; };

    // What the pools looked like when the current transaction began:
    // { lanes: Map(lane -> geom), pos: Map(node -> {x, y}), member: Map(node -> lane), auto: Set(lane) }.
    // auto = lanes this module has already moved in this transaction (live resize), so their captured
    // geometry is still the truth for them.
    let cap = null;

    lanes.init = function () {
        core.onBegin(capture);
        core.onBeforeCommit(() => {
            // The gesture's own redraw only covers what it touched; the lanes and cards moved here
            // have to be drawn too, or the pool looks torn apart until the next full render.
            if (normalizeAll()) { core.reindex(); core.invalidate('all'); }
            cap = null;
        });
    };

    function allLanes() { return core.nodes().filter(n => S.laneOf(n)); }
    function allTitles() { return core.nodes().filter(n => S.poolOf(n)); }
    /** Lanes and pool titles are the pool's frame, never something placed inside a lane. */
    const isFrame = (n) => !!(S.laneOf(n) || S.poolOf(n));

    function capture() {
        cap = null;
        const ls = allLanes();
        if (!ls.length) return;
        cap = { lanes: new Map(), pos: new Map(), member: new Map(), auto: new Set(), titles: new Map(), detached: new Map() };
        for (const l of ls) cap.lanes.set(l, geom(l));
        cap.lanes0 = new Map(cap.lanes);   // never rewritten (resizePool rewrites cap.lanes)
        for (const t of allTitles()) cap.titles.set(t, geom(t));
        for (const n of core.nodes()) {
            if (isFrame(n)) continue;
            cap.pos.set(n, { x: N(n.x), y: N(n.y) });
            const c = centre(n);
            const home = ls.find(l => inside(cap.lanes.get(l), c));
            if (home) cap.member.set(n, home);
        }
        cap.pos0 = new Map(cap.pos);   // never rewritten (resizePool re-bases cap.pos)
    }

    /** Call after changing a lane mid-gesture (resize drag) to see the pool follow live. */
    lanes.live = function (n) {
        if (!cap || !isFrame(n)) return;
        normalizeAll();
        core.invalidate('all');
    };

    function normalizeAll() {
        if (cap) dragOut();
        const ls = allLanes();
        const pools = new Map();
        for (const l of ls) { const p = S.laneOf(l); if (!pools.has(p)) pools.set(p, []); pools.get(p).push(l); }
        // A title whose lanes are all gone goes with them; a pool keeps only one title.
        const titles = new Map(), drop = [];
        for (const t of allTitles()) {
            const p = S.poolOf(t);
            if (!pools.has(p) || titles.has(p)) drop.push(t.id); else titles.set(p, t);
        }
        if (drop.length) core.removeItems(drop, []);
        if (!ls.length) return drop.length > 0;
        if (!cap) cap = { lanes: new Map(), pos: new Map(), member: new Map(), auto: new Set(), detached: new Map() };
        const moved = new Set();
        for (const [p, list] of pools) {
            if (titles.has(p)) resizePool(titles.get(p), list, moved);
            normalizePool(list, moved);
            const t = titles.get(p);
            if (t) fitTitle(t, list, moved);
        }
        if (moved.size) Flow.edges.refreshAutoSides([...moved]);
        return moved.size > 0 || drop.length > 0;
    }

    /** Where a pool's lanes were when the gesture began (title band included), or null. */
    function capturedBox(pool) {
        let box = null;
        const add = (g) => {
            if (!box) { box = { x1: g.x, y1: g.y, x2: g.x + g.w, y2: g.y + g.h }; return; }
            box.x1 = Math.min(box.x1, g.x); box.y1 = Math.min(box.y1, g.y);
            box.x2 = Math.max(box.x2, g.x + g.w); box.y2 = Math.max(box.y2, g.y + g.h);
        };
        for (const [l, g] of cap.lanes) if (S.laneOf(l) === pool) add(g);
        if (cap.titles) for (const [t, g] of cap.titles) if (S.poolOf(t) === pool) add(g);
        return box;
    }

    /** Take a lane out of its pool (it stays a plain group where it is; call inside a transaction). */
    function detach(l) {
        const pool = S.laneOf(l);
        if (!pool) return;
        if (cap && cap.detached) cap.detached.set(l, pool);   // the pool's top stays where it was
        delete l.styleAttributes.lane;
        if (!Object.keys(l.styleAttributes).length) delete l.styleAttributes;
    }

    /**
     * A lane dragged (by its name) to where it no longer touches its pool leaves the pool, with its
     * cards. A pool's only lane never leaves (that would just dissolve the pool: use unpool).
     */
    function dragOut() {
        const ls = allLanes();
        for (const l of ls) {
            const c = cap.lanes.get(l), g = geom(l);
            if (!c || cap.auto.has(l) || g.w !== c.w || g.h !== c.h || (g.x === c.x && g.y === c.y)) continue;
            const pool = S.laneOf(l);
            const rest = ls.filter(o => o !== l && S.laneOf(o) === pool && S.laneOf(o));
            if (!rest.length) continue;
            // Every other lane still where it was: this one moved alone (not the whole pool).
            if (rest.some(o => { const oc = cap.lanes.get(o); return !oc || N(o.x) !== oc.x || N(o.y) !== oc.y; })) continue;
            const b = capturedBox(pool);
            if (!b || g.x >= b.x2 || g.x + g.w <= b.x1 || g.y >= b.y2 || g.y + g.h <= b.y1) detach(l);
        }
    }

    /**
     * The title was resized: the lanes take its new x and width, and share its new height in
     * proportion to the heights they had when the gesture began. Cards ride with their lane's top.
     * The result is written as if the lanes had started there (cap.lanes + cap.auto), so
     * normalizePool only tidies up (lanes still grow to fit their cards; fitTitle then snaps the
     * title back to the lanes).
     */
    function resizePool(t, list, moved) {
        const c = cap.titles && cap.titles.get(t), g = geom(t);
        if (!c || (g.w === c.w && g.h === c.h)) return;
        const orig = list.filter(l => cap.lanes0 && cap.lanes0.has(l)).sort((a, b) => cap.lanes0.get(a).y - cap.lanes0.get(b).y);
        if (orig.length !== list.length) return;   // lanes added in this same gesture: leave it to the usual rules
        const total0 = orig.reduce((s, l) => s + cap.lanes0.get(l).h, 0) || 1;
        const total = Math.max(g.h - S.POOL_HEAD, orig.length * MIN_H);
        let y = g.y + S.POOL_HEAD, used = 0;
        const shift = new Map();
        orig.forEach((l, i) => {
            const l0 = cap.lanes0.get(l);
            const h = i === orig.length - 1 ? total - used : Math.round(l0.h * total / total0);
            used += h;
            const next = { x: g.x, y, w: g.w, h };
            cap.lanes.set(l, next);
            cap.auto.add(l);
            setNum(l, 'x', next.x); setNum(l, 'y', next.y); setNum(l, 'width', next.w); setNum(l, 'height', next.h);
            shift.set(l, y - l0.y);
            moved.add(l.id);
            y += h;
        });
        for (const [n, lane] of cap.member) {
            if (!shift.has(lane)) continue;
            const p = cap.pos0.get(n), ny = p.y + shift.get(lane);
            if (N(n.y) !== ny) { setNum(n, 'y', ny); moved.add(n.id); }
            // Re-based too, so normalizePool sees these as staying put in their lane.
            cap.pos.set(n, { x: N(n.x), y: ny });
        }
    }

    /** A pool title wraps its lanes, with its band just above the top lane. */
    function fitTitle(t, list, moved) {
        const x = N(list[0].x), w = N(list[0].width);
        const top = Math.min(...list.map(l => N(l.y)));
        const bottom = Math.max(...list.map(l => N(l.y) + N(l.height)));
        const g = geom(t);
        if (g.x === x && g.y === top - S.POOL_HEAD && g.w === w && g.h === bottom - top + S.POOL_HEAD) return;
        setNum(t, 'x', x); setNum(t, 'y', top - S.POOL_HEAD);
        setNum(t, 'width', w); setNum(t, 'height', bottom - top + S.POOL_HEAD);
        moved.add(t.id);
    }

    function normalizePool(list, moved) {
        const capOf = (l) => cap.lanes.get(l);
        const base = new Map();      // lane -> the geometry to start from
        const edited = new Set();    // lanes the user changed (or new ones)
        for (const l of list) {
            const c = capOf(l), g = geom(l);
            if (!c) { edited.add(l); base.set(l, g); continue; }
            if (cap.auto.has(l)) { base.set(l, { ...c }); continue; }
            if (g.x !== c.x || g.y !== c.y || g.w !== c.w || g.h !== c.h) edited.add(l);
            base.set(l, g);
        }
        const captured = list.filter(capOf);
        const delta = (l) => { const c = capOf(l), g = geom(l); return c ? { x: g.x - c.x, y: g.y - c.y } : null; };

        // The whole pool dragged at once: every lane moved by the same amount.
        const d0 = captured.length ? delta(captured[0]) : null;
        const poolMoved = !!d0 && (d0.x || d0.y) && captured.every(l => { const d = delta(l); return d.x === d0.x && d.y === d0.y && geom(l).w === capOf(l).w && geom(l).h === capOf(l).h; });

        // Pool x and width: from a lane whose width the user changed, else as they were.
        let X, W;
        const wide = list.find(l => edited.has(l) && capOf(l) && (geom(l).w !== capOf(l).w || geom(l).x !== capOf(l).x) && geom(l).w !== capOf(l).w);
        if (wide) { X = geom(wide).x; W = geom(wide).w; }
        else if (captured.length) { X = capOf(captured[0]).x + (poolMoved ? d0.x : 0); W = capOf(captured[0]).w; }
        else { X = Math.min(...list.map(l => geom(l).x)); W = Math.max(...list.map(l => geom(l).x + geom(l).w)) - X; }

        // Top edge dragged: that edge is shared, so the lane above gives up (or takes) the height.
        const capOrder = captured.slice().sort((a, b) => capOf(a).y - capOf(b).y);
        const topResized = new Set();
        for (const l of list) {
            const c = capOf(l), g = geom(l);
            if (!c || !edited.has(l) || poolMoved || g.h === c.h || Math.abs(g.y + g.h - (c.y + c.h)) > 0.5) continue;
            topResized.add(l);
            const above = capOrder[capOrder.indexOf(l) - 1];
            if (above) {
                const b = base.get(above);
                b.h = Math.max(MIN_H, capOf(above).h - (c.y - g.y));
                cap.auto.add(above);
            }
        }

        // Members: things that didn't move stay in the lane they were in; things that did move
        // belong to the lane they are now in (preferring a lane that moved with them).
        const members = new Map(list.map(l => [l, []]));
        const placed = new Set();   // members the user just put somewhere
        for (const n of core.nodes()) {
            if (isFrame(n)) continue;
            const p = cap.pos.get(n);
            const still = p && p.x === N(n.x) && p.y === N(n.y);
            if (!still) placed.add(n);
            let home = still ? cap.member.get(n) : null;
            if (!home || !members.has(home)) {
                if (still && cap.member.has(n) && !members.has(cap.member.get(n))) continue;   // its lane is in another pool
                const c = centre(n);
                const hits = list.filter(l => inside(geom(l), c));
                const dn = p ? { x: N(n.x) - p.x, y: N(n.y) - p.y } : null;
                home = hits.find(l => { const d = delta(l); return d && dn && d.x === dn.x && d.y === dn.y && (d.x || d.y); }) || hits[0] || null;
            }
            if (home && members.has(home)) members.get(home).push(n);
        }

        // Order: by top edge (where a dragged lane's top landed); on a tie the lane the user moved,
        // or the new one, goes first, so "add lane above / below" lands where it was put.
        const key = (l) => (topResized.has(l) ? capOf(l).y : base.get(l).y);
        const order = list.slice().sort((a, b) => key(a) - key(b) || (edited.has(b) ? 1 : 0) - (edited.has(a) ? 1 : 0));

        let top;
        if (poolMoved) top = Math.min(...list.map(l => geom(l).y));
        else if (topResized.has(order[0]) || !captured.length) top = Math.min(...order.map(l => (topResized.has(l) || !capOf(l) ? geom(l).y : capOf(l).y)));
        else {
            // Where the pool started, counting lanes deleted in this gesture (deleting the top lane
            // pulls the rest up rather than leaving a gap).
            const pool = S.laneOf(list[0]);
            top = Math.min(...[...cap.lanes].filter(([l]) => S.laneOf(l) === pool || (cap.detached && cap.detached.get(l) === pool)).map(([, c]) => c.y));
        }

        // Cards ride along sideways only when their lane was dragged (it snaps back into the pool's
        // column with them). When the pool is widened or narrowed, the lane edges move and the
        // cards stay where they are.
        const dragged = (l) => { const c = capOf(l), g = geom(l); return edited.has(l) && !!c && g.w === c.w && g.h === c.h; };
        const inset = S.LANE_HEAD + 10;

        // Narrowing from the left stops short of the cards that stay put (never under the strip).
        for (const l of list) {
            if (dragged(l)) continue;
            for (const m of members.get(l)) {
                if (placed.has(m) || N(m.x) - inset >= X) continue;
                W += X - (N(m.x) - inset);
                X = N(m.x) - inset;
            }
        }
        const shift = (l) => (dragged(l) ? X - geom(l).x : 0);

        // Something dropped across the lane's top edge or onto its name strip settles just inside.
        for (const l of list) {
            const g = geom(l), sx = shift(l);
            for (const m of members.get(l)) {
                if (!placed.has(m)) continue;
                if (N(m.y) < g.y + 10) { setNum(m, 'y', g.y + 10); moved.add(m.id); }
                if (N(m.x) + sx < X + inset) { setNum(m, 'x', X + inset - sx); moved.add(m.id); }
            }
        }

        // A lane is never shorter than what is in it, and the pool never narrower.
        for (const l of list) {
            const sx = shift(l);
            for (const m of members.get(l)) W = Math.max(W, N(m.x) + sx + N(m.width) + PAD - X);
        }
        W = Math.max(MIN_W, W);

        let y = top;
        for (const l of order) {
            const g = geom(l), b = base.get(l);
            let h = b.h;
            if (topResized.has(l)) h = capOf(l).y + capOf(l).h - y;
            for (const m of members.get(l)) h = Math.max(h, N(m.y) + N(m.height) - g.y + PAD);
            h = Math.max(MIN_H, h);
            const dx = X - g.x, dy = y - g.y, mdx = shift(l);
            if (mdx || dy) {
                for (const m of members.get(l)) {
                    setNum(m, 'x', N(m.x) + mdx); setNum(m, 'y', N(m.y) + dy);
                    moved.add(m.id);
                }
            }
            const changed = dx || dy || g.w !== W || g.h !== h;
            setNum(l, 'x', X); setNum(l, 'y', y); setNum(l, 'width', W); setNum(l, 'height', h);
            if (changed) { moved.add(l.id); if (!edited.has(l)) cap.auto.add(l); }
            y += h;
        }
    }

    // ── Commands ────────────────────────────────────────────────────────────

    /** A new titled three-lane pool centred on world point `at`. */
    lanes.insertPool = function (at) {
        at = at || core.viewCenter();
        const pool = core.newId(), W = 960, H = 180;
        const x = core.snapToGrid(at.x - W / 2), y0 = core.snapToGrid(at.y - (H * 3 - S.POOL_HEAD) / 2);
        core.change('Add swimlanes', () => {
            const title = Flow.nodes.createGroup({ x, y: y0 - S.POOL_HEAD, width: W, height: H * 3 + S.POOL_HEAD }, 'Process');
            title.styleAttributes = { pool };
            const ids = ['Lane 1', 'Lane 2', 'Lane 3'].map((label, i) => {
                const g = Flow.nodes.createGroup({ x, y: y0 + i * H, width: W, height: H }, label);
                g.styleAttributes = { lane: pool };
                return g.id;
            });
            core.reindex();
            core.select([ids[0]], []);
        });
    };

    /** Give `lane`'s pool a title band across the top, and start typing it. */
    lanes.addTitle = function (lane) {
        const pool = S.laneOf(lane);
        if (!pool || allTitles().some(t => S.poolOf(t) === pool)) return;
        const list = allLanes().filter(l => S.laneOf(l) === pool);
        core.begin('Pool title');
        // Under its lanes in the z-order (array order), so the lanes stay clickable.
        const index = Math.min(...list.map(l => core.doc.nodes.indexOf(l)));
        const t = { id: core.newId(), type: 'group', x: 0, y: 0, width: 0, height: 0, label: 'Pool', styleAttributes: { pool } };
        core.addNode(t, { index });
        fitTitle(t, list, new Set());
        core.reindex();
        core.invalidate('all');
        Flow.nodes.startEdit(t.id, { ownTxn: true, select: 'all' });
    };

    /**
     * Turn the selected groups into one pool, top to bottom. The header strip is added to the
     * left of what is already there, so no card ends up under it.
     */
    lanes.makePool = function () {
        const groups = core.selectedNodes().filter(n => n.type === 'group' && !S.laneOf(n));
        if (!groups.length) return;
        const pool = core.newId();
        core.change('Make swimlanes', () => {
            for (const g of groups) {
                if (!g.styleAttributes || typeof g.styleAttributes !== 'object') g.styleAttributes = {};
                delete g.styleAttributes.collapsed;
                g.styleAttributes.lane = pool;
                setNum(g, 'x', N(g.x) - S.LANE_HEAD);
                setNum(g, 'width', N(g.width) + S.LANE_HEAD);
            }
        });
    };

    /** A new empty lane above or below `lane` ('above' | 'below'). */
    lanes.addLane = function (lane, where) {
        if (!lane || !S.laneOf(lane)) return;
        core.change('Add lane', () => {
            const g = Flow.nodes.createGroup({ x: N(lane.x), y: where === 'above' ? N(lane.y) : N(lane.y) + N(lane.height), width: N(lane.width), height: NEW_H }, 'New lane');
            g.styleAttributes = { lane: S.laneOf(lane) };
            core.reindex();
            core.select([g.id], []);
        });
    };

    /** Take `lane` out of its pool: it moves (with its cards) to just right of the pool, and the rest close up. */
    lanes.detachLane = function (lane) {
        const pool = S.laneOf(lane);
        if (!pool) return;
        const list = allLanes().filter(l => S.laneOf(l) === pool);
        if (list.length < 2) return;
        const right = Math.max(...list.map(l => N(l.x) + N(l.width)));
        core.change('Remove lane from pool', () => {
            const dx = core.snapToGrid(right + 80 - N(lane.x));
            for (const id of core.expandWithGroupContents([lane.id])) { const n = core.getNode(id); if (n) setNum(n, 'x', N(n.x) + dx); }
            detach(lane);
            Flow.edges.refreshAutoSides([...core.expandWithGroupContents([lane.id])]);
        });
    };

    /** Swap a lane with its neighbour above (-1) or below (+1), cards and all. */
    lanes.moveLane = function (lane, dir) {
        const pool = S.laneOf(lane);
        if (!pool) return;
        const list = allLanes().filter(l => S.laneOf(l) === pool).sort((a, b) => N(a.y) - N(b.y));
        const i = list.indexOf(lane), j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        const other = list[j];
        core.change('Move lane', () => {
            // Put this lane's top just past the neighbour's, so the restack swaps them.
            const ids = core.expandWithGroupContents([lane.id]);
            const dy = N(other.y) + (dir < 0 ? -1 : 1) - N(lane.y);
            for (const id of ids) { const n = core.getNode(id); if (n) setNum(n, 'y', N(n.y) + dy); }
        });
    };

    /**
     * Make every lane of the selected pools a plain group again (nothing moves). A pool title
     * becomes a plain group round them, so its name is kept.
     */
    lanes.unpool = function () {
        const pools = new Set(core.selectedNodes().map(n => S.laneOf(n) || S.poolOf(n)).filter(Boolean));
        if (!pools.size) return;
        core.change('Remove swimlanes', () => {
            for (const l of [...allLanes(), ...allTitles()]) {
                const sa = l.styleAttributes;
                if (!pools.has(S.laneOf(l) || S.poolOf(l))) continue;
                delete sa.lane; delete sa.pool;
                if (!Object.keys(sa).length) delete l.styleAttributes;
            }
        });
    };
})();
