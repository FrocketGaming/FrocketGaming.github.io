/**
 * FlowStatic - pure geometry + static SVG rendering for JSON Canvas documents.
 *
 * No DOM state, no dependency on the Flow editor. Used by:
 *   - flow-edges.js (live connector geometry)
 *   - flow-io.js    (SVG / PNG export)
 *   - tools/snippets (read-only preview of a .canvas snippet)
 *
 * Colours: every colour is expressed through a "paint" object so the same
 * renderer can emit live CSS variables (theme follows the page) or literal
 * colours resolved from the current theme (for exported files).
 */
(function () {
    'use strict';

    const SIDES = ['top', 'right', 'bottom', 'left'];
    const NORMAL = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
    const PRESETS = { '1': '--hue-red', '2': '--hue-orange', '3': '--hue-yellow', '4': '--hue-green', '5': '--hue-cyan', '6': '--hue-purple' };
    const PRESET_NAMES = { '1': 'Red', '2': 'Orange', '3': 'Yellow', '4': 'Green', '5': 'Cyan', '6': 'Purple' };

    // ── Geometry ────────────────────────────────────────────────────────────

    // Geometry reads coordinates through Number(): a file may store "x": "100" (kept as-is in the
    // data); without this, "100" + 125 concatenates and strings leak into paths and styles.
    const num = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };

    function center(n) {
        return { x: num(n.x) + num(n.width) / 2, y: num(n.y) + num(n.height) / 2 };
    }

    function anchor(n, side) {
        const x = num(n.x), y = num(n.y), w = num(n.width), h = num(n.height);
        switch (side) {
            case 'top': return { x: x + w / 2, y };
            case 'bottom': return { x: x + w / 2, y: y + h };
            case 'left': return { x, y: y + h / 2 };
            case 'right': return { x: x + w, y: y + h / 2 };
        }
        return center(n);
    }

    const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

    /** Pick the pair of sides a connector between a and b would naturally use. */
    function autoSides(a, b) {
        const ac = center(a), bc = center(b);
        const dx = bc.x - ac.x, dy = bc.y - ac.y;
        const gapX = Math.abs(dx) - (a.width + b.width) / 2;
        const gapY = Math.abs(dy) - (a.height + b.height) / 2;
        if (gapY >= gapX) {
            const s = dy >= 0 ? 'bottom' : 'top';
            return [s, OPPOSITE[s]];
        }
        const s = dx >= 0 ? 'right' : 'left';
        return [s, OPPOSITE[s]];
    }

    /** Side of node n whose anchor is nearest to world point p. */
    function nearestSide(n, p) {
        let best = 'top', bd = Infinity;
        for (const s of SIDES) {
            const a = anchor(n, s);
            const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
            if (d < bd) { bd = d; best = s; }
        }
        return best;
    }

    /** Side of node n that faces point p (for auto-attaching a free end). */
    function facingSide(n, p) {
        const c = center(n);
        const dx = (p.x - c.x) / Math.max(1, n.width), dy = (p.y - c.y) / Math.max(1, n.height);
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
        return dy > 0 ? 'bottom' : 'top';
    }

    function bezierPoint(p0, p1, p2, p3, t) {
        const u = 1 - t;
        return {
            x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
            y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
        };
    }

    function roundedPolyline(pts, r) {
        if (pts.length < 2) return '';
        let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
        for (let i = 1; i < pts.length - 1; i++) {
            const p = pts[i], a = pts[i - 1], b = pts[i + 1];
            const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
            const rr = Math.min(r, la / 2, lb / 2);
            if (rr < 0.5) { d += ` L${f(p.x)} ${f(p.y)}`; continue; }
            const p1 = { x: p.x + (a.x - p.x) * rr / la, y: p.y + (a.y - p.y) * rr / la };
            const p2 = { x: p.x + (b.x - p.x) * rr / lb, y: p.y + (b.y - p.y) * rr / lb };
            d += ` L${f(p1.x)} ${f(p1.y)} Q${f(p.x)} ${f(p.y)} ${f(p2.x)} ${f(p2.y)}`;
        }
        const last = pts[pts.length - 1];
        d += ` L${f(last.x)} ${f(last.y)}`;
        return d;
    }

    function simplify(pts) {
        const out = [];
        for (const p of pts) {
            const q = out[out.length - 1];
            if (q && Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5) continue;
            out.push(p);
        }
        // drop collinear middle points
        for (let i = out.length - 2; i >= 1; i--) {
            const a = out[i - 1], b = out[i], c = out[i + 1];
            const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
            if (Math.abs(cross) < 0.5) out.splice(i, 1);
        }
        return out;
    }

    function polylineAt(pts, t) {
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        let d = total * t;
        for (let i = 1; i < pts.length; i++) {
            const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            if (d <= l || i === pts.length - 1) {
                const k = l ? Math.min(1, d / l) : 0;
                return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
            }
            d -= l;
        }
        return pts[0];
    }

    function polylineMid(pts) {
        let total = 0;
        const seg = [];
        for (let i = 1; i < pts.length; i++) {
            const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            seg.push(l); total += l;
        }
        let half = total / 2;
        for (let i = 0; i < seg.length; i++) {
            if (half <= seg[i] || i === seg.length - 1) {
                const t = seg[i] ? half / seg[i] : 0;
                return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
            }
            half -= seg[i];
        }
        return pts[0];
    }

    function elbowPoints(p0, s0, p3, s3) {
        const m = 24;
        const n0 = NORMAL[s0], n3 = NORMAL[s3];
        const a = { x: p0.x + n0[0] * m, y: p0.y + n0[1] * m };
        const b = { x: p3.x + n3[0] * m, y: p3.y + n3[1] * m };
        const h0 = s0 === 'left' || s0 === 'right';
        const h3 = s3 === 'left' || s3 === 'right';
        let mids;
        if (h0 && h3) {
            const mx = (a.x + b.x) / 2;
            mids = [{ x: mx, y: a.y }, { x: mx, y: b.y }];
        } else if (!h0 && !h3) {
            const my = (a.y + b.y) / 2;
            mids = [{ x: a.x, y: my }, { x: b.x, y: my }];
        } else if (h0) {
            mids = [{ x: b.x, y: a.y }];
        } else {
            mids = [{ x: a.x, y: b.y }];
        }
        const raw = [p0, a, ...mids, b, p3];
        // Count places where the path doubles back on itself (the two stubs overlap):
        // those side pairs draw as cramped S-bends and are penalised when picking sides.
        let reversals = 0;
        for (let i = 2; i < raw.length; i++) {
            const ux = raw[i - 1].x - raw[i - 2].x, uy = raw[i - 1].y - raw[i - 2].y;
            const vx = raw[i].x - raw[i - 1].x, vy = raw[i].y - raw[i - 1].y;
            if (ux * vx + uy * vy < -0.25) reversals++;
        }
        const out = simplify(raw);
        out.reversals = reversals;
        return out;
    }

    // ── Obstacle-aware routing ──────────────────────────────────────────────
    //
    // JSON Canvas stores only fromSide/toSide, so the route is derived at render
    // time from the node layout: the plain path (bezier or elbow) is used when it
    // is clear; otherwise an orthogonal A* route over a sparse grid built from the
    // obstacle edges goes around cards (and groups the edge doesn't belong to).

    const ROUTE_M = 20;      // clearance kept around cards
    const BEND = 60;         // cost of one bend, in world px
    const GROUP_LABEL = 28;  // space above a group reserved for its label
    const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];               // right, down, left, up
    const SIDE_DIR = { right: 0, bottom: 1, left: 2, top: 3 };

    function rectOf(n, m, top) {
        const x = num(n.x), y = num(n.y);
        return { x1: x - m, y1: y - m - (top || 0), x2: x + num(n.width) + m, y2: y + num(n.height) + m };
    }
    function inRect(r, p) { return p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2; }
    function containsNode(g, n) {
        return n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height;
    }

    // ── Scene index: cards and groups on a coarse grid, for fast area queries ──
    const CELL = 192;
    function strHash(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function boundsOf(pts, m) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const q of pts) { if (q.x < x1) x1 = q.x; if (q.x > x2) x2 = q.x; if (q.y < y1) y1 = q.y; if (q.y > y2) y2 = q.y; }
        return { x1: x1 - m, y1: y1 - m, x2: x2 + m, y2: y2 + m };
    }
    function unionRect(r, q) { return { x1: Math.min(r.x1, q.x1), y1: Math.min(r.y1, q.y1), x2: Math.max(r.x2, q.x2), y2: Math.max(r.y2, q.y2) }; }

    /**
     * Cards and groups of a chart bucketed on a grid. query(rect) returns the items overlapping it;
     * sig(rect) is an order-free hash of those items' ids + geometry, so a cached route that
     * depends only on what is inside `rect` can be reused exactly while sig(rect) is unchanged.
     */
    function sceneIndex(nodes) {
        const items = [], grid = new Map();
        let stamp = 0;
        const cellKey = (cx, cy) => cx * 131071 + cy;
        for (const n of nodes || []) {
            if (!n || !(num(n.width) > 0 && num(n.height) > 0)) continue;
            const r = rectOf(n, 0);
            const h = (strHash(String(n.id) + '|' + nodeShape(n) + '|' + n.type) ^ Math.imul(Math.round(r.x1 * 4) | 0, 73856093)
                ^ Math.imul(Math.round(r.y1 * 4) | 0, 19349663) ^ Math.imul(Math.round((r.x2 - r.x1) * 4) | 0, 83492791)
                ^ Math.imul(Math.round((r.y2 - r.y1) * 4) | 0, 50331653)) >>> 0;
            const it = { n, r, g: n.type === 'group', h, s: 0 };
            items.push(it);
            for (let cx = Math.floor(r.x1 / CELL); cx <= Math.floor(r.x2 / CELL); cx++) {
                for (let cy = Math.floor(r.y1 / CELL); cy <= Math.floor(r.y2 / CELL); cy++) {
                    const k = cellKey(cx, cy);
                    let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(it);
                }
            }
        }
        const idx = {
            items,
            query(r) {
                const res = [], st = ++stamp;
                const cx1 = Math.floor(r.x1 / CELL), cx2 = Math.floor(r.x2 / CELL), cy1 = Math.floor(r.y1 / CELL), cy2 = Math.floor(r.y2 / CELL);
                if ((cx2 - cx1 + 1) * (cy2 - cy1 + 1) > grid.size * 2) {
                    for (const it of items) if (it.r.x1 < r.x2 && it.r.x2 > r.x1 && it.r.y1 < r.y2 && it.r.y2 > r.y1) res.push(it);
                    return res;
                }
                for (let cx = cx1; cx <= cx2; cx++) for (let cy = cy1; cy <= cy2; cy++) {
                    const l = grid.get(cellKey(cx, cy));
                    if (!l) continue;
                    for (const it of l) {
                        if (it.s === st) continue;
                        it.s = st;
                        if (it.r.x1 < r.x2 && it.r.x2 > r.x1 && it.r.y1 < r.y2 && it.r.y2 > r.y1) res.push(it);
                    }
                }
                return res;
            },
            sig(r) {
                let h = 0, c = 0;
                for (const it of idx.query(r)) { h = (h + it.h) >>> 0; c++; }
                return h + ':' + c;
            },
        };
        return idx;
    }

    /** What a connector between nodes a and b has to avoid (queried by area from a scene index). */
    function routeContext(a, b, nodes, idx) {
        idx = idx || sceneIndex(nodes);
        const ginfo = new Map();
        const group = (n) => {
            let g = ginfo.get(n);
            if (!g) {
                const ina = containsNode(n, a), inb = containsNode(n, b);
                g = { n, both: ina && inb, one: ina === inb ? null : (ina ? 'a' : 'b'), allowed: ina === inb ? 0 : 1 };
                ginfo.set(n, g);
            }
            return g;
        };
        const key = (n) => [num(n.x), num(n.y), num(n.width), num(n.height), nodeShape(n)].join(',');
        return {
            a, b, idx, key: key(a) + '/' + key(b),
            cardsIn(r) { return idx.query(r).filter(it => !it.g && it.n !== a && it.n !== b).map(it => it.n); },
            groupsIn(r) { return idx.query(r).filter(it => it.g && it.n !== a && it.n !== b).map(it => group(it.n)); },
        };
    }

    function samplePoly(pts, step) {
        const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const l = Math.hypot(b.x - a.x, b.y - a.y);
            const k = Math.max(1, Math.ceil(l / step));
            for (let j = 1; j <= k; j++) out.push({ x: a.x + (b.x - a.x) * j / k, y: a.y + (b.y - a.y) * j / k });
        }
        return out;
    }

    /** Strictly inside node n's drawn shape, shrunk by m (rect, pill, diamond, circle). */
    function inShape(n, p, m) {
        const x = num(n.x), y = num(n.y), w = num(n.width), h = num(n.height);
        const shape = nodeShape(n);
        if (shape === 'diamond' || shape === 'circle') {
            const rx = w / 2 - m, ry = h / 2 - m;
            if (rx <= 0 || ry <= 0) return false;
            const dx = Math.abs(p.x - (x + w / 2)) / rx, dy = Math.abs(p.y - (y + h / 2)) / ry;
            return shape === 'diamond' ? dx + dy < 1 : dx * dx + dy * dy < 1;
        }
        return p.x > x + m && p.x < x + w - m && p.y > y + m && p.y < y + h - m;
    }

    /** True when a sampled path runs through a card, or crosses a group's border more than it must. */
    function samplesBlocked(samples, ctx) {
        const A = ctx.a, B = ctx.b;
        const area = boundsOf(samples, 8);
        const cr = ctx.cardsIn(area).map(c => rectOf(c, 6));
        const gs = ctx.groupsIn(area).map(g => ({ g, r: rectOf(g.n, 0), inside: null, cross: 0 }));
        for (const p of samples) {
            if (inShape(A, p, 3) || inShape(B, p, 3)) return true;
            for (const r of cr) if (inRect(r, p)) return true;
            for (const sg of gs) {
                const inside = inRect(sg.r, p);
                if (sg.inside !== null && inside !== sg.inside && ++sg.cross > sg.g.allowed) return true;
                sg.inside = inside;
            }
        }
        return false;
    }

    function bezierControls(from, fromSide, to, toSide) {
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const c = Math.min(Math.max(dist * 0.45, 36), 220);
        const n0 = fromSide ? NORMAL[fromSide] : null;
        const n3 = toSide ? NORMAL[toSide] : null;
        let p1, p2;
        if (n0) p1 = { x: from.x + n0[0] * c, y: from.y + n0[1] * c };
        if (n3) p2 = { x: to.x + n3[0] * c, y: to.y + n3[1] * c };
        if (!p1) p1 = { x: from.x + (p2.x - from.x) * 0.5, y: from.y + (p2.y - from.y) * 0.5 };
        if (!p2) p2 = { x: to.x + (p1.x - to.x) * 0.5, y: to.y + (p1.y - to.y) * 0.5 };
        return [from, p1, p2, to];
    }

    function bezierSamples(c, n) {
        const out = [];
        for (let i = 0; i <= n; i++) out.push(bezierPoint(c[0], c[1], c[2], c[3], i / n));
        return out;
    }

    // Tiny binary heap keyed on f.
    function Heap() { this.a = []; }
    Heap.prototype.push = function (f, v) {
        const a = this.a; a.push([f, v]);
        let i = a.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
    };
    Heap.prototype.pop = function () {
        const a = this.a, top = a[0], last = a.pop();
        if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < a.length && a[l][0] < a[m][0]) m = l;
                if (r < a.length && a[r][0] < a[m][0]) m = r;
                if (m === i) break;
                [a[m], a[i]] = [a[i], a[m]]; i = m;
            }
        }
        return top;
    };

    function uniqSorted(vals) {
        vals.sort((p, q) => p - q);
        const out = [];
        for (const v of vals) if (!out.length || v - out[out.length - 1] > 0.5) out.push(v);
        return out;
    }

    /**
     * Orthogonal route from anchor p0 (leaving along s0) to p3 (entering from s3),
     * around the obstacles in ctx. Returns the polyline or null.
     */
    const TOO_BIG = { tooBig: true };
    function orthoRoute(p0, s0, p3, s3, ctx, useGroups) {
        // Only obstacles near the connector shape the grid (keeps big charts fast); widen the
        // search if that leaves no way through, and when cards sit closer together than the
        // normal clearance, route with less clearance rather than through a card.
        // Returns { pts, reach }: reach is how far around the ends the obstacles mattered.
        // A grid over the size cap stays over it with a wider window, so skip those retries.
        let wideTooBig = false;
        for (const M of [ROUTE_M, 10, 4]) {
            let r = orthoRouteIn(p0, s0, p3, s3, ctx, useGroups, 240, M);
            if (r === TOO_BIG) return null;
            if (r) return { pts: r, reach: 240 };
            if (wideTooBig) continue;
            r = orthoRouteIn(p0, s0, p3, s3, ctx, useGroups, 900, M);
            if (r === TOO_BIG) { wideTooBig = true; continue; }
            if (r) return { pts: r, reach: 900 };
        }
        return null;
    }

    function orthoRouteIn(p0, s0, p3, s3, ctx0, useGroups, reach, M) {
        const bx1 = Math.min(p0.x, p3.x) - reach, bx2 = Math.max(p0.x, p3.x) + reach;
        const by1 = Math.min(p0.y, p3.y) - reach, by2 = Math.max(p0.y, p3.y) + reach;
        const win = { x1: bx1, y1: by1, x2: bx2, y2: by2 };
        const ctx = { a: ctx0.a, b: ctx0.b, cards: ctx0.cardsIn(win), groups: ctx0.groupsIn(win) };
        const obs = ctx.cards.map(c => rectOf(c, M));
        obs.push(rectOf(ctx.a, M), rectOf(ctx.b, M));
        const groupObs = [];
        if (useGroups) for (const g of ctx.groups) if (!g.both) groupObs.push({ g, r: rectOf(g.n, M, GROUP_LABEL) });

        // Stubs: leave each card along its side normal. When the card sits in a group the
        // other end is outside of, the stub carries on through the group border so the
        // line crosses it once, square to the card.
        const stub = (p, s, who) => {
            const nv = NORMAL[s];
            const own = who === 'a' ? ctx.a : ctx.b;
            const inset = Math.max(0, nv[0] > 0 ? num(own.x) + num(own.width) - p.x : nv[0] < 0 ? p.x - num(own.x) : nv[1] > 0 ? num(own.y) + num(own.height) - p.y : p.y - num(own.y));
            let d = M + inset;
            for (const go of groupObs) {
                if (go.g.one !== who) continue;
                const r = go.r;
                const need = nv[0] > 0 ? r.x2 - p.x : nv[0] < 0 ? p.x - r.x1 : nv[1] > 0 ? r.y2 - p.y : p.y - r.y1;
                const q = { x: p.x + nv[0] * need, y: p.y + nv[1] * need };
                const hitsCard = ctx.cards.some(c => {
                    const cr = rectOf(c, 2);
                    return samplePoly([p, q], 8).some(t => inRect(cr, t));
                });
                if (hitsCard) go.skip = true; else d = Math.max(d, need);
            }
            return { x: p.x + nv[0] * d, y: p.y + nv[1] * d };
        };
        const a = stub(p0, s0, 'a'), b = stub(p3, s3, 'b');
        for (const go of groupObs) if (!go.skip) obs.push(go.r);
        // A stub end inside another obstacle: try again with less clearance; at the smallest
        // clearance, drop that obstacle (it overlaps the card itself).
        if (M > 4 && obs.some(r => inRect(r, a) || inRect(r, b))) return null;
        const rects = obs.filter(r => !inRect(r, a) && !inRect(r, b));

        let xs = [a.x, b.x], ys = [a.y, b.y];
        for (const r of rects) { xs.push(r.x1, r.x2); ys.push(r.y1, r.y2); }
        xs = uniqSorted(xs); ys = uniqSorted(ys);
        const addMid = (v) => { const out = [v[0] - M]; for (let i = 0; i < v.length; i++) { out.push(v[i]); if (i + 1 < v.length) out.push((v[i] + v[i + 1]) / 2); } out.push(v[v.length - 1] + M); return uniqSorted(out); };
        xs = addMid(xs); ys = addMid(ys);
        const nx = xs.length, ny = ys.length;
        if (nx * ny > 40000) return TOO_BIG;
        // Rasterize each obstacle onto the grid by index range (binary search on the sorted
        // coordinate lists) instead of testing every cell against every obstacle; the result
        // is identical, but a drag on a big chart stays cheap.
        const mxs = [], mys = [];
        for (let i = 0; i + 1 < nx; i++) mxs.push((xs[i] + xs[i + 1]) / 2);
        for (let j = 0; j + 1 < ny; j++) mys.push((ys[j] + ys[j + 1]) / 2);
        const firstAbove = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] > v) hi = m; else lo = m + 1; } return lo; };
        const firstAtLeast = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] >= v) hi = m; else lo = m + 1; } return lo; };
        // Calls fn(i) for every index with lo < arr[i] < hi.
        const span = (arr, lo, hi, fn) => { for (let i = firstAbove(arr, lo), e = firstAtLeast(arr, hi); i < e; i++) fn(i); };
        const cellBlk = new Uint8Array(nx * ny), hBlk = new Uint8Array(nx * ny), vBlk = new Uint8Array(nx * ny);
        // Segments running right along an obstacle's clearance line cost a little extra, so
        // routes take the middle of a channel instead of hugging one side of it.
        const hHugRaw = new Uint8Array(nx * ny), vHugRaw = new Uint8Array(nx * ny);
        for (const r of rects) {
            span(ys, r.y1, r.y2, j => { span(xs, r.x1, r.x2, i => { cellBlk[j * nx + i] = 1; }); span(mxs, r.x1, r.x2, i => { hBlk[j * nx + i] = 1; }); });
            span(mys, r.y1, r.y2, j => span(xs, r.x1, r.x2, i => { vBlk[j * nx + i] = 1; }));
            for (const yv of [r.y1, r.y2]) span(ys, yv - 0.5, yv + 0.5, j => span(mxs, r.x1, r.x2, i => { hHugRaw[j * nx + i] = 1; }));
            for (const xv of [r.x1, r.x2]) span(mys, r.y1, r.y2, j => span(xs, xv - 0.5, xv + 0.5, i => { vHugRaw[j * nx + i] = 1; }));
        }
        const free = new Uint8Array(nx * ny);
        for (let k = 0; k < nx * ny; k++) free[k] = cellBlk[k] ? 0 : 1;
        const hOk = new Uint8Array(nx * ny), vOk = new Uint8Array(nx * ny); // edge to i+1 / j+1
        const hHug = new Uint8Array(nx * ny), vHug = new Uint8Array(nx * ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i;
            if (!free[k]) continue;
            if (i + 1 < nx && free[k + 1] && !hBlk[k]) { hOk[k] = 1; hHug[k] = hHugRaw[k]; }
            if (j + 1 < ny && free[k + nx] && !vBlk[k]) { vOk[k] = 1; vHug[k] = vHugRaw[k]; }
        }
        const ix = (v) => xs.findIndex(x => Math.abs(x - v) <= 0.5), iy = (v) => ys.findIndex(y => Math.abs(y - v) <= 0.5);
        const ai = ix(a.x), aj = iy(a.y), bi = ix(b.x), bj = iy(b.y);
        if (ai < 0 || aj < 0 || bi < 0 || bj < 0) return null;
        const startK = aj * nx + ai, goalK = bj * nx + bi;
        if (!free[startK] || !free[goalK]) return null;
        const d0 = SIDE_DIR[s0], dEnd = SIDE_DIR[OPPOSITE[s3]];
        const N = nx * ny * 4;
        const g = new Float64Array(N).fill(Infinity);
        const prev = new Int32Array(N).fill(-1);
        const heap = new Heap();
        const h = (k) => Math.abs(xs[k % nx] - b.x) + Math.abs(ys[(k / nx) | 0] - b.y);
        const s0k = startK * 4 + d0;
        g[s0k] = 0; heap.push(h(startK), s0k);
        let goal = -1;
        while (heap.a.length) {
            const [fv, st] = heap.pop();
            const k = st >> 2, d = st & 3;
            const gv = g[st];
            if (fv - h(k) > gv + 1e-6) continue;
            if (k === goalK) {
                if (d === dEnd) { goal = st; break; }
                if (d !== (dEnd + 2) % 4) {
                    const ns = k * 4 + dEnd;
                    if (gv + BEND < g[ns]) { g[ns] = gv + BEND; prev[ns] = st; heap.push(gv + BEND, ns); }
                }
                continue;
            }
            const i = k % nx, j = (k / nx) | 0;
            for (let nd = 0; nd < 4; nd++) {
                if (nd === (d + 2) % 4) continue;
                let nk;
                if (nd === 0) { if (!hOk[k]) continue; nk = k + 1; }
                else if (nd === 2) { if (i === 0 || !hOk[k - 1]) continue; nk = k - 1; }
                else if (nd === 1) { if (!vOk[k]) continue; nk = k + nx; }
                else { if (j === 0 || !vOk[k - nx]) continue; nk = k - nx; }
                const len = Math.abs(xs[nk % nx] - xs[i]) + Math.abs(ys[(nk / nx) | 0] - ys[j]);
                const hug = nd === 0 ? hHug[k] : nd === 2 ? hHug[k - 1] : nd === 1 ? vHug[k] : vHug[k - nx];
                const ng = gv + len * (hug ? 1.3 : 1) + (nd !== d ? BEND : 0);
                const ns = nk * 4 + nd;
                if (ng < g[ns] - 1e-6) { g[ns] = ng; prev[ns] = st; heap.push(ng + h(nk), ns); }
            }
        }
        if (goal < 0) return null;
        const path = [];
        for (let st = goal; st >= 0; st = prev[st]) {
            const k = st >> 2;
            const p = { x: xs[k % nx], y: ys[(k / nx) | 0] };
            const q = path[path.length - 1];
            if (!q || q.x !== p.x || q.y !== p.y) path.push(p);
        }
        path.reverse();
        return simplify([p0, ...path, p3]);
    }

    function polyCost(pts) {
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        return len + Math.max(0, pts.length - 2) * BEND + (pts.reversals || 0) * BEND * 2;
    }

    /**
     * Decide the drawn path for a side pair.
     * Returns { pts } (polyline, `routed` when it had to go around something) or { bez } (4 control
     * points), plus `region`: the area whose cards/groups the result depends on.
     * With a cache, a plan is reused only while the obstacles in its region are exactly the same
     * (scene index signature), so routing is a function of the document alone, not of history.
     */
    // While a drag is live, connectors whose ends didn't move keep their last route even if the
    // dragged card now crosses their region; everything is re-routed once the drag ends.
    let interactive = false;
    function setInteractive(v) { interactive = !!v; }

    function planPath(from, fs, to, ts, route, ctx, cache) {
        if (!ctx || !cache) return planPathRaw(from, fs, to, ts, route, ctx);
        const key = route + '|' + fs + '|' + ts + '|' + from.x + ',' + from.y + '|' + to.x + ',' + to.y + '|' + ctx.key;
        const hit = cache.get(key);
        if (hit && (interactive || ctx.idx.sig(hit.region) === hit.sig)) return hit.plan;
        const plan = planPathRaw(from, fs, to, ts, route, ctx);
        if (cache.size > 6000) cache.clear();
        cache.set(key, { plan, region: plan.region, sig: ctx.idx.sig(plan.region) });
        return plan;
    }

    function planPathRaw(from, fs, to, ts, route, ctx) {
        const win = (reach) => ({ x1: Math.min(from.x, to.x) - reach, y1: Math.min(from.y, to.y) - reach, x2: Math.max(from.x, to.x) + reach, y2: Math.max(from.y, to.y) + reach });
        const detour = (plainSamples, base) => {
            const r = orthoRoute(from, fs, to, ts, ctx, true) || orthoRoute(from, fs, to, ts, ctx, false);
            const region = unionRect(boundsOf(plainSamples, 8), win(r ? r.reach : 900));
            return r ? { pts: r.pts, routed: true, cost: polyCost(r.pts), region } : Object.assign(base, { blocked: true, region });
        };
        if (route === 'elbow') {
            const pts = elbowPoints(from, fs, to, ts);
            const smp = samplePoly(pts, 6);
            if (!ctx || !samplesBlocked(smp, ctx)) return { pts, cost: polyCost(pts), region: boundsOf(smp, 8) };
            return detour(smp, { pts, cost: polyCost(pts) + 5000 });
        }
        const bez = bezierControls(from, fs, to, ts);
        const proxy = polyCost(elbowPoints(from, fs, to, ts));
        const smp = bezierSamples(bez, 48);
        if (!ctx || !samplesBlocked(smp, ctx)) return { bez, cost: proxy, region: boundsOf(smp, 8) };
        return detour(smp, { bez, cost: proxy + 5000 });
    }

    /**
     * The side pair a connector between a and b should use: the cheapest drawn path
     * (length + bends, going around obstacles). `current` ([fs, ts]) wins ties so
     * sides don't flicker while dragging. `used` ({ a: {side: {in, out}}, b: {...} }) counts the
     * other connectors already on each side: sharing a side with connectors going the same
     * way is mildly penalised (they get spread along it), sharing one with connectors going
     * the other way strongly (in and out on one side reads badly).
     */
    /** Straight-sided (rect, or the flat top/bottom of a pill): spreading there is free. */
    function spreadable(n, side) {
        const shape = nodeShape(n);
        return !(shape === 'diamond' || shape === 'circle' || (shape === 'pill' && (side === 'left' || side === 'right')));
    }

    /**
     * A point on node n's outline near the middle of `side`, `off` px along that side:
     * on the side for rects, on the two faces next to the vertex for diamonds, on the
     * outline for circles and pill ends.
     */
    function sidePoint(n, side, off) {
        const x = num(n.x), y = num(n.y), w = num(n.width), h = num(n.height);
        const horiz = side === 'top' || side === 'bottom';
        const base = anchor(n, side);
        if (!off) return base;
        const shape = nodeShape(n);
        const along = horiz ? w / 2 : h / 2, across = horiz ? h / 2 : w / 2;
        const o = Math.max(-along * 0.7, Math.min(along * 0.7, off));
        let inset = 0;
        if (shape === 'diamond') inset = Math.abs(o) * across / along;
        else if (shape === 'circle') inset = across - across * Math.sqrt(Math.max(0, 1 - (o / along) ** 2));
        else if (shape === 'pill' && !horiz) { const r = Math.min(w, h) / 2; inset = r - Math.sqrt(Math.max(0, r * r - o * o)); }
        const nv = NORMAL[side];
        return horiz ? { x: base.x + o, y: base.y - nv[1] * inset } : { x: base.x - nv[0] * inset, y: base.y + o };
    }

    const sideCache = new Map();
    function bestSides(a, b, nodes, route, current, used, idx, maxEvals, fixed) {
        maxEvals = maxEvals || 6;
        if (!a || !b) return autoSides(a, b);
        const r = route || 'curve';
        if (r === 'straight') return autoSides(a, b);
        idx = idx || (nodes ? sceneIndex(nodes) : null);
        const ctx = idx ? routeContext(a, b, nodes, idx) : null;
        // An end buried under another card can't be routed cleanly: strongly avoid it.
        const buried = (pt) => ctx && ctx.cardsIn({ x1: pt.x - 3, y1: pt.y - 3, x2: pt.x + 3, y2: pt.y + 3 })
            .some(c => pt.x > num(c.x) - 2 && pt.x < num(c.x) + num(c.width) + 2 && pt.y > num(c.y) - 2 && pt.y < num(c.y) + num(c.height) + 2);
        const cand = [];
        for (const fs of SIDES) for (const ts of SIDES) {
            // fixed = { from?, to? }: a side the user chose; only the other one is picked.
            if (fixed && ((fixed.from && fs !== fixed.from) || (fixed.to && ts !== fixed.to))) continue;
            const pa = anchor(a, fs), pb = anchor(b, ts);
            const ua = (used && used.a && used.a[fs]) || { in: 0, out: 0 };
            const ub = (used && used.b && used.b[ts]) || { in: 0, out: 0 };
            // Diamonds/circles spread ends over a short face, so sharing costs a bit more there.
            const wa = spreadable(a, fs) ? 30 : 90, wb = spreadable(b, ts) ? 30 : 90;
            // In and out on one side reads as one line running on (they are spread apart when it happens).
            const crowd = ua.out * wa + ub.in * wb + ua.in * 260 + ub.out * 260 + (buried(pa) ? 1500 : 0) + (buried(pb) ? 1500 : 0);
            const simple = polyCost(elbowPoints(pa, fs, pb, ts)) + crowd;
            cand.push({ fs, ts, pa, pb, simple, crowd });
        }
        cand.sort((p, q) => p.simple - q.simple);
        const cost = (c) => planPath(c.pa, c.fs, c.pb, c.ts, r, ctx, sideCache).cost + c.crowd;
        const cur = current ? cand.find(c => c.fs === current[0] && c.ts === current[1]) : null;
        let best = null, bestCost = Infinity;
        if (cur) { best = cur; bestCost = cost(cur); }
        // Hysteresis: another pair must beat the current one clearly. Candidates are sorted by a
        // lower bound (plain elbow cost), so the search stops as soon as none can win.
        const need = (bc) => (best === cur && cur ? Math.max(40, bc * 0.12) : 0);
        let evals = 0;
        for (const c of cand) {
            if (c === cur) continue;
            if (c.simple >= bestCost - need(bestCost)) break;
            if (++evals > maxEvals) break;
            const cc = cost(c);
            if (cc < bestCost - need(cc)) { bestCost = cc; best = c; }
        }
        if (!best) return autoSides(a, b);
        return [best.fs, best.ts];
    }

    /**
     * Compute the drawable geometry of a connector.
     * @param {object} from  {x,y} start point
     * @param {string|null} fromSide  side the line leaves from (null = free point)
     * @param {object} to    {x,y} end point
     * @param {string|null} toSide
     * @param {object} opts  { route: 'curve'|'straight'|'elbow', arrowStart, arrowEnd, arrowSize }
     * @returns {{d, mid, startTip, endTip, startDir, endDir}}
     *   d is the SVG path (already shortened under arrowheads); *Dir are unit vectors
     *   pointing INTO the tip (the direction the arrow points).
     */
    function connectorGeometry(from, fromSide, to, toSide, opts) {
        opts = opts || {};
        const route = opts.route || 'curve';
        const as = opts.arrowSize || 10;
        const trimS = opts.arrowStart ? (opts.arrowSizeStart || as) * 0.85 : 0;
        const trimE = opts.arrowEnd ? (opts.arrowSizeEnd || as) * 0.85 : 0;
        const dist = Math.hypot(to.x - from.x, to.y - from.y);

        if (route === 'straight' || (!fromSide && !toSide)) {
            const ux = dist ? (to.x - from.x) / dist : 1, uy = dist ? (to.y - from.y) / dist : 0;
            const s = { x: from.x + ux * trimS, y: from.y + uy * trimS };
            const e = { x: to.x - ux * trimE, y: to.y - uy * trimE };
            return withPath({
                d: `M${f(s.x)} ${f(s.y)} L${f(e.x)} ${f(e.y)}`,
                startTip: from, endTip: to,
                startDir: { x: -ux, y: -uy }, endDir: { x: ux, y: uy },
            }, [from, to]);
        }

        const plan = opts.plan || (fromSide && toSide
            ? planPath(from, fromSide, to, toSide, route, opts.ctx || null, opts.cache || null)
            : { bez: bezierControls(from, fromSide, to, toSide) });

        if (plan.pts) {
            const pts = plan.pts;
            const dirOf = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
            const endDir = dirOf(pts[pts.length - 2], pts[pts.length - 1]);
            const startDir = dirOf(pts[1], pts[0]);
            const trimmed = pts.map(p => ({ ...p }));
            trimmed[0] = { x: pts[0].x - startDir.x * trimS, y: pts[0].y - startDir.y * trimS };
            const L = trimmed.length - 1;
            trimmed[L] = { x: pts[L].x - endDir.x * trimE, y: pts[L].y - endDir.y * trimE };
            // A curve-style connector that had to detour keeps soft, generous corners.
            const radius = route === 'elbow' ? 12 : 36;
            const g = withPath({ d: roundedPolyline(trimmed, radius), startTip: from, endTip: to, startDir, endDir, routed: !!plan.routed }, pts);
            // Labels on orthogonal routes read best in the middle of the longest straight run.
            if (pts.length > 2) {
                let acc = 0, bestL = -1, bestT = 0.5;
                for (let i = 1; i < pts.length; i++) {
                    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
                    if (l > bestL + 1) { bestL = l; bestT = g.len ? (acc + l / 2) / g.len : 0.5; }
                    acc += l;
                }
                g.labelT = bestT;
                g.mid = g.at(bestT);
            }
            return g;
        }

        // Cubic bezier leaving/entering along the side normals.
        const [, p1, p2] = plan.bez;
        const n0 = fromSide ? NORMAL[fromSide] : null;
        const n3 = toSide ? NORMAL[toSide] : null;
        const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
        const endDir = n3 ? { x: -n3[0], y: -n3[1] } : unit(p2, to);
        const startDir = n0 ? { x: -n0[0], y: -n0[1] } : unit(p1, from);
        const s = { x: from.x - startDir.x * trimS, y: from.y - startDir.y * trimS };
        const e = { x: to.x - endDir.x * trimE, y: to.y - endDir.y * trimE };
        const q1 = { x: p1.x - startDir.x * trimS, y: p1.y - startDir.y * trimS };
        const q2 = { x: p2.x - endDir.x * trimE, y: p2.y - endDir.y * trimE };
        return withPath({
            d: `M${f(s.x)} ${f(s.y)} C${f(q1.x)} ${f(q1.y)} ${f(q2.x)} ${f(q2.y)} ${f(e.x)} ${f(e.y)}`,
            startTip: from, endTip: to, startDir, endDir,
        }, bezierSamples(plan.bez, 48));
    }

    /** Attach arc-length helpers (poly, len, mid, at, dirAt) computed from a polyline. */
    function withPath(g, poly) {
        let len = 0;
        for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
        g.poly = poly;
        g.len = len;
        g.at = (t) => polylineAt(poly, t);
        g.dirAt = (t) => {
            const a = polylineAt(poly, Math.max(0, t - 0.01)), b = polylineAt(poly, Math.min(1, t + 0.01));
            const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
        };
        g.mid = polylineMid(poly);
        return g;
    }

    /**
     * Where to put a connector's label: the midpoint, unless that lands on a card,
     * in which case slide along the line to the nearest spot that is clear.
     */
    function segHitsRect(p, q, r) {
        // Liang-Barsky clip of segment pq against rect r.
        let t0 = 0, t1 = 1;
        const dx = q.x - p.x, dy = q.y - p.y;
        const clip = (pp, qq) => {
            if (pp === 0) return qq >= 0;
            const t = qq / pp;
            if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
            else { if (t < t0) return false; if (t < t1) t1 = t; }
            return true;
        };
        return clip(-dx, p.x - r.x1) && clip(dx, r.x2 - p.x) && clip(-dy, p.y - r.y1) && clip(dy, r.y2 - p.y) && t0 <= t1;
    }

    /** Segments of many polylines on a grid: query(rect) -> [{ a, b, poly }]. */
    function lineIndex(polys) {
        const C = 128, grid = new Map();
        let stamp = 0;
        const key = (cx, cy) => cx * 131071 + cy;
        for (const poly of polys) {
            if (!poly) continue;
            for (let i = 1; i < poly.length; i++) {
                const sg = { a: poly[i - 1], b: poly[i], poly, s: 0 };
                const x1 = Math.floor(Math.min(sg.a.x, sg.b.x) / C), x2 = Math.floor(Math.max(sg.a.x, sg.b.x) / C);
                const y1 = Math.floor(Math.min(sg.a.y, sg.b.y) / C), y2 = Math.floor(Math.max(sg.a.y, sg.b.y) / C);
                if ((x2 - x1 + 1) * (y2 - y1 + 1) > 400) continue;
                for (let cx = x1; cx <= x2; cx++) for (let cy = y1; cy <= y2; cy++) { const k = key(cx, cy); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(sg); }
            }
        }
        return {
            query(r) {
                const res = [], st = ++stamp;
                for (let cx = Math.floor(r.x1 / C); cx <= Math.floor(r.x2 / C); cx++) for (let cy = Math.floor(r.y1 / C); cy <= Math.floor(r.y2 / C); cy++) {
                    const l = grid.get(key(cx, cy));
                    if (l) for (const sg of l) if (sg.s !== st) { sg.s = st; res.push(sg); }
                }
                return res;
            },
        };
    }

    /**
     * Where to put a connector's label (size {w, h} in world px). Candidates, best first: on the
     * line near its middle (only where there is clear line on both sides of the label), then
     * touching the line beside it, then a little further out. Each is scored against cards (1000),
     * labels already placed (800, `placed`, which this appends to) and other connectors
     * (60 each, `lines`); the cleanest wins. `nodes` / `lines` may be arrays or indexes
     * (sceneIndex / lineIndex). With neither, the first valid spot is taken (cheap, for drags).
     */
    function labelPoint(geo, nodes, size, placed, lines) {
        const w = (size && size.w) || 40, h = (size && size.h) || 24;
        const taken = placed || [];
        const box = (p) => ({ x1: p.x - w / 2, y1: p.y - h / 2, x2: p.x + w / 2, y2: p.y + h / 2 });
        let cardHit;
        if (!nodes) cardHit = () => false;
        else if (nodes.query) cardHit = (r) => nodes.query({ x1: r.x1 - 4, y1: r.y1 - 4, x2: r.x2 + 4, y2: r.y2 + 4 }).some(it => !it.g);
        else {
            const cards = nodes.filter(n => n && n.type !== 'group');
            cardHit = (r) => cards.some(n => r.x2 > num(n.x) - 4 && r.x1 < num(n.x) + num(n.width) + 4 && r.y2 > num(n.y) - 4 && r.y1 < num(n.y) + num(n.height) + 4);
        }
        let lineHits;
        if (!lines) lineHits = () => 0;
        else {
            const li = lines.query ? lines : lineIndex(lines);
            lineHits = (rr) => {
                const hitPolys = new Set();
                for (const sg of li.query(rr)) {
                    if (sg.poly === geo.poly || hitPolys.has(sg.poly)) continue;
                    const a = sg.a, b = sg.b;
                    if (Math.max(a.x, b.x) < rr.x1 || Math.min(a.x, b.x) > rr.x2 || Math.max(a.y, b.y) < rr.y1 || Math.min(a.y, b.y) > rr.y2) continue;
                    if (segHitsRect(a, b, rr)) hitPolys.add(sg.poly);
                }
                return hitPolys.size;
            };
        }
        const score = (p) => {
            const r = box(p);
            let sc = cardHit(r) ? 1000 : 0;
            for (const t of taken) if (r.x2 > t.x1 - 4 && r.x1 < t.x2 + 4 && r.y2 > t.y1 - 3 && r.y1 < t.y2 + 3) sc += 800;
            return sc + 60 * lineHits({ x1: r.x1 + 1, y1: r.y1 + 1, x2: r.x2 - 1, y2: r.y2 - 1 });
        };
        const done = (p) => { if (placed) placed.push(box(p)); return p; };
        if (!geo.at || !geo.len) return done(geo.mid);
        const arrow = geo.arrowSize || 11;
        const t0 = geo.labelT || 0.5;
        const ts = [t0];
        for (let k = 1; k <= 12; k++) ts.push(t0 - k * 0.04, t0 + k * 0.04);
        const valid = ts.filter(t => t > 0.03 && t < 0.97);
        let best = null, bestScore = Infinity;
        const consider = (p, base) => {
            if (bestScore <= base) return;
            const sc = base + score(p);
            if (sc < bestScore) { bestScore = sc; best = p; }
        };
        valid.forEach((t, k) => {
            const p = geo.at(t), d = geo.dirAt(t);
            const extent = Math.abs(d.x) * w + Math.abs(d.y) * h;
            const s = t * geo.len;
            const room = Math.min(s - (geo.arrowStart ? arrow : 0), geo.len - s - (geo.arrowEnd ? arrow : 0));
            if (room >= extent / 2 + 14) consider(p, k * 2);
        });
        // Beside the line, touching it (so it clearly belongs to this connector).
        const beside = (t, sgn, far) => {
            const p = geo.at(t), d = geo.dirAt(t);
            let nx = -d.y, ny = d.x;
            if (Math.abs(ny) >= Math.abs(nx) ? ny > 0 : nx < 0) { nx = -nx; ny = -ny; }
            const off = (Math.abs(nx) * w + Math.abs(ny) * h) / 2 + 1 + far;
            return { x: p.x + nx * off * sgn, y: p.y + ny * off * sgn };
        };
        valid.forEach((t, k) => {
            consider(beside(t, 1, 0), 30 + k * 2);
            consider(beside(t, -1, 0), 34 + k * 2);
        });
        if (bestScore >= 60) valid.forEach((t, k) => {
            consider(beside(t, 1, 10), 70 + k * 2);
            consider(beside(t, -1, 10), 74 + k * 2);
        });
        return done(best || beside(t0, 1, 0));
    }

    /** Label text is laid out at this size (editor and export alike). */
    const LABEL_FONT = "13px Raleway, 'Segoe UI', system-ui, sans-serif";
    /** Labels reserve this much more room than their 1:1 box (the editor enlarges them when zoomed out). */
    const LABEL_RESERVE = 1.25;
    /** A label's drawn lines and its 1:1 box size in world px. */
    function labelBox(text) {
        const lines = labelLines(text, LABEL_FONT);
        let wmax = 0;
        for (const l of lines) wmax = Math.max(wmax, labelWidth(l, LABEL_FONT));
        return { lines, w: Math.min(LABEL_MAX_EM * 13, 20 + wmax), h: lines.length * 19.5 + 6, cut: lines.some(l => l.endsWith('\u2026')) };
    }

    /**
     * The one label layout, shared by the editor and export: every labelled edge in document
     * order, scored against cards, earlier labels and all connectors. Returns Map edge -> {x, y}.
     */
    function layoutLabels(edges, geos, idx) {
        const out = new Map();
        const li = lineIndex(geos.lines || [...geos.values()].map(g => g.poly));
        const placed = [];
        for (const e of edges) {
            if (!e || !str(e.label)) continue;
            const g = geos.get(e);
            if (!g) continue;
            const bx = labelBox(str(e.label));
            out.set(e, labelPoint(g, idx, { w: bx.w * LABEL_RESERVE, h: bx.h * LABEL_RESERVE }, placed, li));
        }
        return out;
    }

    function arrowPath(tip, dir, size) {
        const s = size || 10;
        const bx = tip.x - dir.x * s, by = tip.y - dir.y * s;
        const px = -dir.y * s * 0.5, py = dir.x * s * 0.5;
        return `M${f(tip.x)} ${f(tip.y)} L${f(bx + px)} ${f(by + py)} L${f(bx - px)} ${f(by - py)} Z`;
    }

    /** Route style for an edge: Advanced-Canvas-compatible styleAttributes.pathfindingMethod. */
    function edgeRoute(edge) {
        const m = edge.styleAttributes && edge.styleAttributes.pathfindingMethod;
        if (m === 'direct') return 'straight';
        if (m === 'square') return 'elbow';
        return 'curve';
    }

    function edgeDash(edge) {
        const p = edge.styleAttributes && edge.styleAttributes.path;
        if (p === 'dotted') return '2 6';
        if (p === 'short-dashed' || p === 'dashed') return '8 6';
        if (p === 'long-dashed') return '14 8';
        return '';
    }

    function nodeShape(node) {
        const s = node.styleAttributes && node.styleAttributes.shape;
        return s === 'pill' || s === 'diamond' || s === 'circle' ? s : 'rect';
    }

    /**
     * Full geometry for a JSON Canvas edge given a node lookup.
     * Missing sides are chosen automatically (spec: fromSide/toSide are optional).
     */
    function edgeGeometry(edge, nodeById, opts) {
        const a = nodeById.get ? nodeById.get(edge.fromNode) : nodeById[edge.fromNode];
        const b = nodeById.get ? nodeById.get(edge.toNode) : nodeById[edge.toNode];
        if (!a || !b) return null;
        let [fs, ts] = opts && opts.sidesOverride ? opts.sidesOverride : resolveSides(edge, a, b);
        const arrowStart = edge.fromEnd === 'arrow';
        const arrowEnd = edge.toEnd !== 'none';
        const nodes = opts && opts.nodes;
        const g = connectorGeometry(anchor(a, fs), fs, anchor(b, ts), ts, {
            route: edgeRoute(edge), arrowStart, arrowEnd, arrowSize: (opts && opts.arrowSize) || 11,
            ctx: nodes ? routeContext(a, b, nodes) : null,
            cache: opts && opts.cache,
        });
        g.fromSide = fs; g.toSide = ts; g.arrowStart = arrowStart; g.arrowEnd = arrowEnd;
        return g;
    }

    const NEXT_SIDE = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
    function resolveSides(edge, a, b) {
        let fs = edge.fromSide, ts = edge.toSide;
        if (a === b) {
            // Self-loop: leave and come back on two neighbouring sides, drawn as a loop at the corner.
            if (!SIDES.includes(fs)) fs = SIDES.includes(ts) ? Object.keys(NEXT_SIDE).find(k => NEXT_SIDE[k] === ts) : 'right';
            if (!SIDES.includes(ts) || ts === fs) ts = NEXT_SIDE[fs];
            return [fs, ts];
        }
        if (!SIDES.includes(fs) || !SIDES.includes(ts)) {
            const [as, bs] = autoSides(a, b);
            if (!SIDES.includes(fs)) fs = as;
            if (!SIDES.includes(ts)) ts = bs;
        }
        return [fs, ts];
    }

    /**
     * Connectors sharing one side of a card are spread along it (ordered by where their
     * other end is, so they don't cross), so every line and arrowhead stays visible.
     * Diamonds and circles keep their single vertex. Sets it.from / it.to on the items.
     */
    function portPoints(items) {
        const bySide = new Map();
        const add = (key, x) => { let l = bySide.get(key); if (!l) bySide.set(key, l = []); l.push(x); };
        for (const it of items) {
            add(it.a.id + '|' + it.fs, { it, end: 'from', node: it.a, side: it.fs, other: center(it.b) });
            add(it.b.id + '|' + it.ts, { it, end: 'to', node: it.b, side: it.ts, other: center(it.a) });
        }
        for (const list of bySide.values()) {
            if (list.length < 2) continue;
            const { node, side } = list[0];
            const horiz = side === 'top' || side === 'bottom';
            const key = (x) => horiz ? x.other.x : x.other.y;
            list.sort((p, q) => key(p) - key(q) || (p.end < q.end ? -1 : 1));
            const L = horiz ? num(node.width) : num(node.height);
            // Mixed in/out on one side get extra room so each arrowhead reads as its own connector.
            const mixed = list.some(x => x.end === 'from') && list.some(x => x.end === 'to');
            const step = spreadable(node, side) ? Math.min(mixed ? 32 : 26, L / (list.length + 1)) : Math.min(mixed ? 28 : 20, L * 0.65 / list.length);
            list.forEach((x, i) => {
                const pt = sidePoint(node, side, (i - (list.length - 1) / 2) * step);
                if (x.end === 'from') { x.it.from = pt; x.it.fromGap = step; } else { x.it.to = pt; x.it.toGap = step; }
            });
        }
    }

    /**
     * Parallel orthogonal runs of different connectors that share a channel are moved apart
     * onto their own tracks (only middle segments move, so the ends stay on their cards).
     */
    function separateTracks(items, idx) {
        const cards = idx || null;
        const STUB = 16;
        const unit = (p, q) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
        // Own copies (plans may be cached). A long first/last run is split into a short stub at
        // the card plus the rest, with a zero-length joint between, so the rest can move onto
        // its own track (leaving a small jog) while the end stays on the card.
        for (const it of items) {
            if (!it.plan || !it.plan.pts || it.plan.pts.length < 2) continue;
            let pts = it.plan.pts.map(p => ({ x: p.x, y: p.y }));
            const orth = (p, q) => Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5;
            if (pts.length >= 2 && orth(pts[0], pts[1]) && Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) > STUB * 2 + 4) {
                const u = unit(pts[0], pts[1]);
                const q = { x: pts[0].x + u.x * STUB, y: pts[0].y + u.y * STUB };
                pts.splice(1, 0, q, { x: q.x, y: q.y });
            }
            const L = pts.length - 1;
            if (L >= 1 && orth(pts[L - 1], pts[L]) && Math.hypot(pts[L].x - pts[L - 1].x, pts[L].y - pts[L - 1].y) > STUB * 2 + 4) {
                const u = unit(pts[L], pts[L - 1]);
                const q = { x: pts[L].x + u.x * STUB, y: pts[L].y + u.y * STUB };
                pts.splice(L, 0, { x: q.x, y: q.y }, q);
            }
            it.plan = Object.assign({}, it.plan, { pts });
            it.split = true;
        }
        // Alternate passes (vertical runs, horizontal, vertical again): moving one set of runs
        // changes where the other set overlaps, so segments are collected fresh each pass.
        for (const vert of [true, false, true]) separatePass(items, vert, cards);
        for (const it of items) if (it.split) it.plan.pts = simplify(it.plan.pts);
    }

    function separatePass(items, vert, cards) {
        // Repeat until clean: moving one cluster can land it on a neighbouring track.
        for (let iter = 0; iter < 4; iter++) if (!separateOnce(items, vert, cards)) break;
    }

    /** Would moving run i of pts by off (and stretching its neighbours) run into a card? */
    function shiftHitsCard(it, pts, i, v, off, idx) {
        const q = pts.map(p => ({ x: p.x, y: p.y }));
        if (v) { q[i].x += off; q[i + 1].x += off; } else { q[i].y += off; q[i + 1].y += off; }
        for (let k = Math.max(1, i - 1); k <= Math.min(q.length - 1, i + 2); k++) {
            const a = q[k - 1], b = q[k];
            const near = idx.query(boundsOf([a, b], 2)).filter(x => !x.g).map(x => x.n);
            for (const c of near) {
                if (c === it.a || c === it.b) continue;
                const r = { x1: num(c.x) + 1, y1: num(c.y) + 1, x2: num(c.x) + num(c.width) - 1, y2: num(c.y) + num(c.height) - 1 };
                if (Math.max(a.x, b.x) < r.x1 || Math.min(a.x, b.x) > r.x2 || Math.max(a.y, b.y) < r.y1 || Math.min(a.y, b.y) > r.y2) continue;
                if (segHitsRect(a, b, r)) return true;
            }
        }
        return false;
    }

    function separateOnce(items, vert, cards) {
        const TOL = 11;
        const segs = [];
        for (const it of items) {
            if (!it.split) continue;
            const pts = it.plan.pts;
            // End runs (i = 0 / last) can't move, but they take part so the others move off them.
            for (let i = 0; i + 1 < pts.length; i++) {
                const p = pts[i], q = pts[i + 1];
                const len = Math.hypot(q.x - p.x, q.y - p.y);
                if (len < 4) continue;
                const fixed = i === 0 || i + 2 >= pts.length;
                if (vert && Math.abs(p.x - q.x) < 0.5) segs.push({ it, i, fixed, v: true, c: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
                else if (!vert && Math.abs(p.y - q.y) < 0.5) segs.push({ it, i, fixed, v: false, c: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
            }
        }
        let changed = false;
        // Clusters: overlapping runs of different connectors closer together than a track
        // (bucketed by line coordinate, so only nearby runs are compared).
        const buckets = new Map();
        segs.forEach((sg, j) => { const k = Math.floor(sg.c / TOL); let l = buckets.get(k); if (!l) buckets.set(k, l = []); l.push(j); });
        const nearby = (c) => { const k = Math.floor(c / TOL); return [].concat(buckets.get(k - 1) || [], buckets.get(k) || [], buckets.get(k + 1) || []); };
        const seen = new Set();
        for (let i = 0; i < segs.length; i++) {
            if (seen.has(i)) continue;
            const cluster = [i];
            seen.add(i);
            for (let k = 0; k < cluster.length; k++) {
                const sa = segs[cluster[k]];
                for (const j of nearby(sa.c)) {
                    if (seen.has(j)) continue;
                    const o = segs[j];
                    if (o.it === sa.it || Math.abs(o.c - sa.c) > TOL) continue;
                    if (Math.min(sa.hi, o.hi) - Math.max(sa.lo, o.lo) < 2) continue;
                    seen.add(j); cluster.push(j);
                }
            }
            const members = cluster.map(j => segs[j]).filter((sg, k, arr) => arr.findIndex(o => o.it === sg.it) === k);
            if (members.length < 2 || members.every(m => m.fixed)) continue;
            const step = Math.max(5, Math.min(12, 36 / (members.length - 1)));
            // Already on distinct tracks? Leave them.
            const byC = members.map(m => m.c).sort((p, q) => p - q);
            if (byC.every((c, k) => k === 0 || c - byC[k - 1] >= step - 0.5)) continue;
            // Order so tracks don't cross at their corners: by where each run comes from and
            // heads next (runs turning towards the low side go on the low side).
            const side = (sg) => {
                const P = sg.it.plan.pts, prev = P[sg.i - 1] || P[sg.i], next = P[sg.i + 2] || P[sg.i + 1];
                const d = (q) => sg.v ? q.x - sg.c : q.y - sg.c;
                return Math.sign(d(next)) * 2 + Math.sign(d(prev)) + sg.c * 1e-4;
            };
            members.sort((p, q) => side(p) - side(q));
            // With an immovable run in the cluster, it keeps its line and the rest line up around it.
            const fi = members.findIndex(m => m.fixed);
            const base = fi >= 0 ? members[fi].c : members.reduce((acc, sg) => acc + sg.c, 0) / members.length;
            const mid = fi >= 0 ? fi : (members.length - 1) / 2;
            members.forEach((sg, k) => {
                if (sg.fixed) return;
                const off = base + (k - mid) * step - sg.c;
                if (Math.abs(off) < 0.25) return;
                const pts = sg.it.plan.pts;
                if (cards && shiftHitsCard(sg.it, pts, sg.i, sg.v, off, cards)) return;
                if (sg.v) { pts[sg.i].x += off; pts[sg.i + 1].x += off; } else { pts[sg.i].y += off; pts[sg.i + 1].y += off; }
                changed = true;
            });
        }
        return changed;
    }

    /**
     * Geometry for every edge of a chart at once (what both the editor and toSVG draw):
     * obstacle-aware routes, shared sides spread along the card, shared channels split into
     * tracks. opts: { nodes, cache, arrowSize }. Returns Map edge -> geometry, with .lines
     * (every connector's polyline) and .idx (the scene index).
     * Arrowheads on a shared side are capped by the spacing there, so they never fuse.
     */
    function layoutEdges(edges, nodeById, opts) {
        opts = opts || {};
        const get = (id) => nodeById.get ? nodeById.get(id) : nodeById[id];
        const nodes = opts.nodes || null;
        const idx = opts.idx || (nodes ? sceneIndex(nodes) : null);
        const as = opts.arrowSize || 11;
        const items = [];
        for (const e of edges || []) {
            if (!e) continue;
            const a = get(e.fromNode), b = get(e.toNode);
            if (!a || !b) continue;
            const [fs, ts] = resolveSides(e, a, b);
            items.push({ e, a, b, fs, ts, from: anchor(a, fs), to: anchor(b, ts), route: edgeRoute(e) });
        }
        portPoints(items);
        for (const it of items) {
            it.ctx = idx ? routeContext(it.a, it.b, nodes, idx) : null;
            if (it.route !== 'straight') it.plan = planPath(it.from, it.fs, it.to, it.ts, it.route, it.ctx, opts.cache || null);
        }
        if (idx) separateTracks(items, idx);
        const out = new Map();
        for (const it of items) {
            const arrowStart = it.e.fromEnd === 'arrow';
            const arrowEnd = it.e.toEnd !== 'none';
            const cap = (gap) => gap ? Math.min(as, Math.max(7, gap - 4)) : as;
            const sS = cap(it.fromGap), sE = cap(it.toGap);
            const g = connectorGeometry(it.from, it.fs, it.to, it.ts, { route: it.route, arrowStart, arrowEnd, arrowSize: as, arrowSizeStart: sS, arrowSizeEnd: sE, plan: it.plan });
            g.fromSide = it.fs; g.toSide = it.ts; g.arrowStart = arrowStart; g.arrowEnd = arrowEnd; g.arrowSize = as;
            g.startSize = sS; g.endSize = sE;
            out.set(it.e, g);
        }
        out.lines = [...out.values()].map(g => g.poly).filter(Boolean);
        out.idx = idx;
        return out;
    }

    function bbox(nodes) {
        if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const n of nodes) {
            const x = num(n.x), y = num(n.y);
            x1 = Math.min(x1, x); y1 = Math.min(y1, y);
            x2 = Math.max(x2, x + num(n.width)); y2 = Math.max(y2, y + num(n.height));
        }
        return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }

    // ── Paint (colour strategy) ─────────────────────────────────────────────

    /** Live paint: emits CSS custom properties so the drawing follows the page theme. */
    // ── Colour validation ───────────────────────────────────────────────────
    // A node/edge `color` comes straight from the file. It is only ever DISPLAYED through
    // safeColor(): "1".."6" presets, #hex (3/4/6/8 digits), or a plain CSS colour (named, rgb(),
    // hsl()...) that CSS.supports() accepts, re-serialised by the browser to #rrggbb / rgba().
    // Anything else is kept in the data but drawn as "no colour". Never interpolate raw colours.
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
    const CSS_COLOR_FN = /^(?:[a-z]{3,30}|(?:rgba?|hsla?|hwb)\([0-9.,%\s/+-]{1,60}\))$/i;
    const colorCache = new Map();
    let colorProbe = null;
    function safeColor(c) {
        if (typeof c === 'number' && PRESETS[String(c)]) return String(c);
        if (typeof c !== 'string' || !c) return null;
        if (PRESETS[c]) return c;
        if (HEX_COLOR.test(c)) return c;
        if (colorCache.has(c)) return colorCache.get(c);
        let out = null;
        try {
            if (CSS_COLOR_FN.test(c) && !/^(?:inherit|initial|unset|revert|currentcolor|transparent)$/i.test(c)
                && typeof CSS !== 'undefined' && CSS.supports('color', c)) {
                if (!colorProbe) colorProbe = document.createElement('canvas').getContext('2d');
                colorProbe.fillStyle = '#010203';
                colorProbe.fillStyle = c;
                const s = String(colorProbe.fillStyle);
                if (/^#[0-9a-f]{6}$/i.test(s) || /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [\d.]+\)$/.test(s)) out = s;
            }
        } catch (e) { out = null; }
        if (colorCache.size > 200) colorCache.clear();
        colorCache.set(c, out);
        return out;
    }
    const hasColor = (c) => safeColor(c) != null;

    function varPaint() {
        return {
            v: (name) => `var(${name})`,
            color: (c, fallbackVar) => {
                const s = safeColor(c);
                if (s && PRESETS[s]) return `var(${PRESETS[s]})`;
                if (s) return s;
                return `var(${fallbackVar})`;
            },
            mix: (color, pct, baseVar) => `color-mix(in srgb, ${color} ${pct}%, var(${baseVar}))`,
        };
    }

    /** Resolved paint: reads the current theme once and emits literal rgb() colours. */
    function resolvedPaint(el, vars) {
        // vars: optional { '--text-primary': '#222', ... } overriding the page theme (export Light/Dark).
        const live = getComputedStyle(el || document.documentElement);
        const cs = vars ? { getPropertyValue: (n) => (vars[n] != null ? vars[n] : live.getPropertyValue(n)) } : live;
        const probe = document.createElement('canvas').getContext('2d');
        const toRgb = (str) => {
            probe.fillStyle = '#000';
            probe.fillStyle = str.trim() || '#000';
            const s = probe.fillStyle;
            if (s[0] === '#') {
                const h = s.slice(1);
                return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
            }
            const m = s.match(/[\d.]+/g) || [0, 0, 0];
            return [+m[0], +m[1], +m[2]];
        };
        const cache = {};
        const varRgb = (name) => (cache[name] = cache[name] || toRgb(cs.getPropertyValue(name)));
        const fmt = (rgb) => `rgb(${rgb.map(v => Math.round(v)).join(',')})`;
        const parse = (c) => {
            const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(c);
            return m ? [+m[1], +m[2], +m[3]] : toRgb(c);
        };
        return {
            v: (name) => fmt(varRgb(name)),
            color: (c, fallbackVar) => {
                const s = safeColor(c);
                if (s && PRESETS[s]) return fmt(varRgb(PRESETS[s]));
                if (s) return fmt(toRgb(s));
                return fmt(varRgb(fallbackVar));
            },
            mix: (color, pct, baseVar) => {
                const a = parse(color), b = varRgb(baseVar), t = pct / 100;
                return fmt([a[0] * t + b[0] * (1 - t), a[1] * t + b[1] * (1 - t), a[2] * t + b[2] * (1 - t)]);
            },
        };
    }

    // ── Markdown fallback (used when marked.js is unavailable, e.g. offline) ──

    /**
     * A document field as display text. File values can be anything (objects, arrays, null...):
     * only strings and finite numbers are shown, never an implicit String() of an object (which
     * can throw: {"toString": "x"}).
     */
    function str(v) {
        if (typeof v === 'string') return v;
        if (typeof v === 'number' && isFinite(v)) return String(v);
        return '';
    }

    function escapeHtml(s) {
        return str(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function inlineMd(s) {
        return escapeHtml(s)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
            .replace(/~~([^~]+)~~/g, '<del>$1</del>')
            .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="md-wikilink">$2</span>')
            .replace(/\[\[([^\]]+)\]\]/g, '<span class="md-wikilink">$1</span>')
            .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^(javascript|data|vbscript):/i.test(u) ? t : `<a href="${u}">${t}</a>`);
    }

    function miniMarkdown(text) {
        const lines = str(text).split('\n');
        let html = '', list = null, para = [];
        const flushPara = () => { if (para.length) { html += `<p>${para.map(inlineMd).join('<br>')}</p>`; para = []; } };
        const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
        let inCode = false, code = [];
        for (const line of lines) {
            if (/^```/.test(line)) {
                if (inCode) { html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`; code = []; inCode = false; }
                else { flushPara(); flushList(); inCode = true; }
                continue;
            }
            if (inCode) { code.push(line); continue; }
            let m;
            if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flushPara(); flushList(); html += `<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`; continue; }
            if ((m = /^\s*[-*+]\s+(\[[ xX]\]\s+)?(.*)$/.exec(line))) {
                flushPara(); if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; }
                const box = m[1] ? `<input type="checkbox" disabled${/x/i.test(m[1]) ? ' checked' : ''}> ` : '';
                html += `<li>${box}${inlineMd(m[2])}</li>`; continue;
            }
            if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
                flushPara(); if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; }
                html += `<li>${inlineMd(m[1])}</li>`; continue;
            }
            if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); html += `<blockquote>${inlineMd(m[1])}</blockquote>`; continue; }
            if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); html += '<hr>'; continue; }
            if (!line.trim()) { flushPara(); flushList(); continue; }
            flushList(); para.push(line);
        }
        if (inCode) html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;
        flushPara(); flushList();
        return html;
    }

    // ── Sanitizer (DOMPurify, strict allowlist) ─────────────────────────────
    //
    // Card markdown is untrusted (imported / pasted / synced files). It is rendered by marked and
    // then cleaned by DOMPurify (vendored at src/vendor/purify.min.js, loaded before this file by
    // Flow and Snippets). Markdown-relevant tags only; no SVG/MathML/forms/embeds/styles; no
    // style/id/name/form attributes (stops overlays, url() beacons and DOM clobbering); links only
    // http(s)/mailto/relative after URL parsing; images only inline data: rasters (no network
    // request from card content). If DOMPurify is missing, the text is shown escaped, never raw.
    const MD_TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
        'mark', 'sub', 'sup', 'small', 'code', 'pre', 'kbd', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'span',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'];
    const MD_ATTRS = ['href', 'src', 'alt', 'title', 'class', 'colspan', 'rowspan', 'align', 'start'];
    const PURIFY_CFG = {
        ALLOWED_TAGS: MD_TAGS, ALLOWED_ATTR: MD_ATTRS, ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
        FORBID_TAGS: ['svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'frame',
            'object', 'embed', 'style', 'template', 'script', 'link', 'meta', 'base', 'noscript', 'details'],
        FORBID_ATTR: ['style', 'id', 'name', 'form', 'formaction', 'xlink:href', 'srcset', 'action', 'background'],
        ALLOW_UNKNOWN_PROTOCOLS: false, SANITIZE_DOM: true, SANITIZE_NAMED_PROPS: true,
        KEEP_CONTENT: true, WHOLE_DOCUMENT: false, RETURN_TRUSTED_TYPE: false,
    };
    const LINK_BASE = 'https://relative.invalid/';
    /** href allowed? http:, https:, mailto: or a relative URL, decided by the URL parser. */
    function safeHref(v) {
        if (typeof v !== 'string') return false;
        let u;
        try { u = new URL(v, LINK_BASE); } catch (e) { return false; }
        // Relative links only when unambiguous: no ':' before the first '/', '?' or '#'
        // (so "java%09script:..." is refused rather than treated as a relative path).
        if (u.origin === 'https://relative.invalid') return !/^[^/?#]*:/.test(v.trim());
        return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
    }
    const DATA_IMG = /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;
    let purifyReady = false;
    function purifier() {
        const P = typeof window !== 'undefined' && window.DOMPurify;
        if (!P || !P.isSupported || typeof P.sanitize !== 'function') return null;
        if (!purifyReady) {
            P.addHook('uponSanitizeAttribute', (node, data) => {
                if (/^on/i.test(data.attrName)) { data.keepAttr = false; return; }
                if (data.attrName === 'href' && !safeHref(data.attrValue)) data.keepAttr = false;
                if (data.attrName === 'src' && !DATA_IMG.test(String(data.attrValue || '').trim())) data.keepAttr = false;
                if (data.attrName === 'class') data.attrValue = String(data.attrValue).replace(/[^\w\- ]/g, '');
            });
            P.addHook('afterSanitizeAttributes', (node) => {
                const tag = node.nodeName && node.nodeName.toLowerCase();
                if (tag === 'a') {
                    if (node.hasAttribute('href')) { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
                } else if (tag === 'img' && !node.hasAttribute('src')) {
                    node.setAttribute('class', 'md-img-blocked');
                }
            });
            purifyReady = true;
        }
        return P;
    }

    /** Clean rendered markdown HTML. Returns safe HTML (escaped text when DOMPurify is unavailable). */
    function sanitize(html) {
        const P = purifier();
        if (!P) {
            // No sanitizer available: never insert markup. Keep the text, escaped.
            const d = document.implementation.createHTMLDocument('');
            d.body.innerHTML = String(html);           // inert document: nothing loads or runs
            return '<p>' + escapeHtml(d.body.textContent || '') + '</p>';
        }
        return String(P.sanitize(String(html), PURIFY_CFG));
    }

    /** Task-list checkboxes become glyphs (inputs are not allowed through the sanitizer). */
    function taskBoxes(html) {
        return html.replace(/<input\b([^>]*)>/gi, (m, a) => /\btype\s*=\s*["']?checkbox/i.test(a)
            ? `<span class="md-task${/\bchecked\b/i.test(a) ? ' is-checked' : ''}">${/\bchecked\b/i.test(a) ? '\u2611' : '\u2610'}</span> ` : m);
    }

    const mdCache = new Map();
    /** Markdown -> safe HTML. Uses marked.js when loaded, the built-in renderer otherwise. */
    function renderMarkdown(text) {
        const key = str(text);
        if (mdCache.has(key)) return mdCache.get(key);
        let html;
        try {
            if (typeof marked !== 'undefined' && marked.parse) {
                const src = key
                    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (m, a, b) => `<span class="md-wikilink">${escapeHtml(b)}</span>`)
                    .replace(/\[\[([^\]]+)\]\]/g, (m, a) => `<span class="md-wikilink">${escapeHtml(a)}</span>`);
                html = marked.parse(src, { gfm: true, breaks: true });
            } else {
                html = miniMarkdown(key);
            }
        } catch (e) {
            html = miniMarkdown(key);
        }
        html = sanitize(taskBoxes(String(html)));
        if (mdCache.size > 500) mdCache.clear();
        mdCache.set(key, html);
        return html;
    }

    /** True when a text card is a short "label" (no block markdown) and reads best centred. */
    function isSimpleText(text) {
        const t = str(text).trim();
        if (!t) return true;
        if (t.length > 140) return false;
        if (/\n\s*\n/.test(t)) return false;
        return !/^\s*([-*+]\s|\d+[.)]\s|#{1,6}\s|>|```|\|)/m.test(t);
    }

    // ── Static SVG ──────────────────────────────────────────────────────────

    // Number formatter for SVG attributes. Clamped for display only (the document keeps its
    // values): browsers reject path numbers beyond float range (a 1e300 coordinate -> "bad path d").
    function f(n) {
        if (!isFinite(n)) return 0;
        if (n > 1e9) n = 1e9; else if (n < -1e9) n = -1e9;
        return Math.round(n * 100) / 100;
    }

    function shapeSvg(node, shape, fill, stroke, sw, style) {
        const { x, y, width: w, height: h } = node;
        const st = `style="fill:${fill};stroke:${stroke};stroke-width:${sw}${style || ''}"`;
        if (shape === 'diamond') return `<path d="M${f(x + w / 2)} ${f(y)} L${f(x + w)} ${f(y + h / 2)} L${f(x + w / 2)} ${f(y + h)} L${f(x)} ${f(y + h / 2)} Z" stroke-linejoin="round" ${st}/>`;
        if (shape === 'circle') return `<ellipse cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" rx="${f(w / 2)}" ry="${f(h / 2)}" ${st}/>`;
        const r = shape === 'pill' ? Math.min(w, h) / 2 : 8;
        return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" ${st}/>`;
    }

    function fileLabel(node) {
        const name = str(node.file).split('/').pop();
        return name + str(node.subpath);
    }

    /**
     * Render a JSON Canvas document to an SVG string.
     * opts: { paint, padding=40, background=true, markdown=true, fontFamily, maxNodes }
     */
    function toSVG(doc, opts) {
        opts = opts || {};
        const paint = opts.paint || varPaint();
        const pad = opts.padding == null ? 40 : opts.padding;
        // Draw from numeric copies: a file may store "x": "100" (kept as-is in the data).
        const nodes = (doc && Array.isArray(doc.nodes) ? doc.nodes : [])
            .filter(n => n && typeof n === 'object')
            .map(n => (typeof n.x === 'number' && typeof n.y === 'number' && typeof n.width === 'number' && typeof n.height === 'number') ? n
                : { ...n, x: Number(n.x), y: Number(n.y), width: Number(n.width), height: Number(n.height) })
            .filter(n => isFinite(n.x) && isFinite(n.y) && n.width > 0 && n.height > 0);
        const edges = doc && Array.isArray(doc.edges) ? doc.edges : [];
        const byId = new Map(nodes.map(n => [n.id, n]));
        // Edge geometry first: routed connectors can run outside the cards' bounds.
        const geos = layoutEdges(edges, byId, { nodes });
        const labelAt = layoutLabels(edges, geos, geos.idx);
        let box = bbox(nodes);
        for (const g of geos.values()) {
            for (const q of g.poly || []) {
                const x2 = Math.max(box.x + box.width, q.x), y2 = Math.max(box.y + box.height, q.y);
                box.x = Math.min(box.x, q.x); box.y = Math.min(box.y, q.y);
                box.width = x2 - box.x; box.height = y2 - box.y;
            }
        }
        const vx = box.x - pad, vy = box.y - pad;
        const vw = Math.max(box.width + pad * 2, 1), vh = Math.max(box.height + pad * 2, 1);
        const font = opts.fontFamily || "Raleway, 'Segoe UI', system-ui, sans-serif";
        const headFont = "'JetBrains Mono', Consolas, monospace";

        const textCol = paint.v('--text-primary');
        const mutedCol = paint.v('--text-secondary');
        const cardBg = paint.v('--bg-secondary');
        const border = paint.v('--border-color');
        const accent = paint.v('--accent-primary');

        const out = [];
        out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}" width="${f(vw)}" height="${f(vh)}" font-family="${escapeHtml(font)}">`);
        if (opts.defs) out.push(opts.defs);
        if (!opts.cardContent) out.push(`<style>
.fc{box-sizing:border-box;width:100%;height:100%;overflow:hidden;padding:10px 14px;color:${textCol};font-family:${font};font-size:16px;line-height:1.4;word-wrap:break-word;display:flex;flex-direction:column;text-align:left}
.fc.simple{align-items:center;justify-content:center;text-align:center}
.fc > :first-child{margin-top:0}.fc > :last-child{margin-bottom:0}
.fc p{margin:0 0 6px;text-align:inherit;font-size:inherit;color:inherit}.fc ul,.fc ol{margin:0 0 6px;padding-left:20px}.fc li{margin:1px 0}
.fc h1,.fc h2,.fc h3,.fc h4,.fc h5,.fc h6{font-family:${headFont};margin:0 0 6px;line-height:1.25}
.fc h1{font-size:1.5em}.fc h2{font-size:1.3em}.fc h3{font-size:1.15em}.fc h4,.fc h5,.fc h6{font-size:1em}
.fc code{font-family:Consolas,Monaco,monospace;font-size:0.85em;background:${paint.mix(textCol, 10, '--bg-secondary')};padding:1px 4px;border-radius:3px}
.fc pre{background:${paint.v('--bg-primary')};padding:8px;border-radius:5px;overflow:hidden;margin:0 0 6px}
.fc pre code{background:none;padding:0}
.fc a{color:${accent}}.fc blockquote{margin:0 0 6px;padding-left:10px;border-left:3px solid ${border};color:${mutedCol}}
.fc img{max-width:100%}.fc hr{border:0;border-top:1px solid ${border}}
.fc .md-wikilink{color:${accent}}
.fm{box-sizing:border-box;width:100%;height:100%;padding:10px 14px;display:flex;flex-direction:column;justify-content:center;gap:4px;font-family:${font};overflow:hidden}
.fm .t{color:${textCol};font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fm .s{color:${mutedCol};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>`);
        if (opts.background !== false) {
            out.push(`<rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" style="fill:${paint.v('--bg-primary')}"/>`);
        }

        // Groups first (they sit under everything)
        for (const n of nodes) {
            if (n.type !== 'group') continue;
            const col = paint.color(n.color, '--text-secondary');
            const colored = hasColor(n.color);
            out.push(`<rect x="${f(n.x)}" y="${f(n.y)}" width="${f(n.width)}" height="${f(n.height)}" rx="10" style="fill:${paint.mix(col, colored ? 10 : 5, '--bg-primary')};stroke:${colored ? col : border};stroke-width:1.5"/>`);
            if (n.label) {
                // Same as the editor: one line, ellipsised to the group's width.
                const label = fitLabel(n.label, `600 16px ${font}`, n.width - 8);
                out.push(`<text x="${f(n.x + 4)}" y="${f(n.y - 10)}" xml:space="preserve" style="fill:${colored ? col : mutedCol};font-size:16px;font-weight:600">${escapeHtml(label)}</text>`);
            }
        }

        // Edges
        const placedLabels = [];
        for (const e of edges) {
            const g = geos.get(e);
            if (!g) continue;
            const col = paint.color(e.color, '--text-secondary');
            const dash = edgeDash(e);
            out.push(`<path d="${g.d}" style="fill:none;stroke:${col};stroke-width:2;stroke-linecap:round${dash ? ';stroke-dasharray:' + dash : ''}"/>`);
            if (g.arrowEnd) out.push(`<path d="${arrowPath(g.endTip, g.endDir, g.endSize || 11)}" style="fill:${col};stroke:${col};stroke-width:1.5;stroke-linejoin:round"/>`);
            if (g.arrowStart) out.push(`<path d="${arrowPath(g.startTip, g.startDir, g.startSize || 11)}" style="fill:${col};stroke:${col};stroke-width:1.5;stroke-linejoin:round"/>`);
            if (str(e.label)) {
                // Same rule as the editor's pill (LABEL_MAX_EM): 13px, each line max 18em, ellipsised.
                // Same box and the same position as the editor (layoutLabels).
                const bx = labelBox(str(e.label));
                const lines = bx.lines, w = bx.w, h = bx.h, lh = 19.5;
                g.mid = labelAt.get(e) || g.mid;
                out.push(`<rect x="${f(g.mid.x - w / 2)}" y="${f(g.mid.y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="5" style="fill:${paint.v('--bg-primary')};stroke:${paint.mix(col, 45, '--bg-primary')};stroke-width:1"/>`);
                const y0 = g.mid.y - h / 2 + 2.5 + lh / 2 + 4.5;
                lines.forEach((l, i) => out.push(`<text x="${f(g.mid.x)}" y="${f(y0 + i * lh)}" text-anchor="middle" xml:space="preserve" style="fill:${hasColor(e.color) ? col : textCol};font-size:13px">${escapeHtml(l)}</text>`));
            }
        }

        // Cards
        for (const n of nodes) {
            if (n.type === 'group') continue;
            const col = hasColor(n.color) ? paint.color(n.color, '--border-color') : null;
            const shape = nodeShape(n);
            const fill = col ? paint.mix(col, 16, '--bg-secondary') : cardBg;
            out.push(shapeSvg(n, shape, fill, col || border, 1.5));
            let inner;
            if (n.type === 'text') {
                const html = opts.markdown === false ? escapeHtml(n.text || '') : renderMarkdown(n.text || '');
                inner = `<div xmlns="http://www.w3.org/1999/xhtml" class="fc${isSimpleText(n.text) || shape !== 'rect' ? ' simple' : ''}">${toXhtml(html)}</div>`;
            } else if (n.type === 'link') {
                let host = n.url || '';
                try { host = new URL(n.url).hostname; } catch (e) { /* keep raw */ }
                inner = `<div xmlns="http://www.w3.org/1999/xhtml" class="fm"><div class="t">${escapeHtml(host)}</div><div class="s">${escapeHtml(n.url || '')}</div></div>`;
            } else if (n.type === 'file') {
                inner = `<div xmlns="http://www.w3.org/1999/xhtml" class="fm"><div class="t">${escapeHtml(fileLabel(n))}</div><div class="s">${escapeHtml(n.file || '')}</div></div>`;
            } else {
                inner = `<div xmlns="http://www.w3.org/1999/xhtml" class="fm"><div class="s">${escapeHtml(n.type || 'node')}</div></div>`;
            }
            let ix = n.x, iy = n.y, iw = n.width, ih = n.height;
            if (shape === 'diamond') { ix += n.width / 4; iy += n.height / 4; iw /= 2; ih /= 2; }
            else if (shape === 'circle') { ix += n.width * 0.146; iy += n.height * 0.146; iw *= 0.708; ih *= 0.708; }
            // opts.cardContent(node, innerBox, shape) -> SVG markup: portable <text> instead of
            // HTML-in-foreignObject (used by file exports; see Flow.io).
            if (opts.cardContent) {
                try { out.push(opts.cardContent(n, { x: ix, y: iy, w: iw, h: ih }, shape) || ''); }
                catch (e) { console.warn('Flow: could not draw card text', n.id, e); }   // one bad node never aborts the export
            }
            else out.push(`<foreignObject x="${f(ix)}" y="${f(iy)}" width="${f(iw)}" height="${f(ih)}">${inner}</foreignObject>`);
        }
        out.push('</svg>');
        return { svg: out.join(''), width: vw, height: vh, box: { x: vx, y: vy, width: vw, height: vh } };
    }

    // ── Label fitting (export matches the editor's single-line ellipsis) ─────
    let labelCtx = null;
    const labelWidthCache = new Map();
    function labelWidth(text, font) {
        const k = font + '\u0000' + text;
        let v = labelWidthCache.get(k);
        if (v == null) { v = measureLabel(text, font); if (labelWidthCache.size > 4000) labelWidthCache.clear(); labelWidthCache.set(k, v); }
        return v;
    }
    function measureLabel(text, font) {
        if (!labelCtx) { try { labelCtx = document.createElement('canvas').getContext('2d'); } catch (e) { labelCtx = null; } }
        if (!labelCtx) return str(text).length * 7.4;
        labelCtx.font = font;
        return labelCtx.measureText(str(text)).width;
    }
    /** Connector labels: at most this many em wide per line (the editor's CSS uses the same). */
    const LABEL_MAX_EM = 18;
    /** A connector label as drawn: newlines kept, each line ellipsised to LABEL_MAX_EM. */
    function labelLines(text, font) {
        const size = parseFloat(font) || 13;
        return str(text).split('\n').slice(0, 20).map(l => fitLabel(l, font, LABEL_MAX_EM * size - 18));
    }
    function fitLabel(text, font, maxW) {
        let t = str(text).replace(/\s*\n\s*/g, ' ');
        if (t.length > 400) t = t.slice(0, 400);
        if (labelWidth(t, font) <= maxW) return t;
        let chars = Array.from(t);
        // Binary search the longest prefix that fits with the ellipsis.
        let lo = 0, hi = chars.length;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (labelWidth(chars.slice(0, mid).join('') + '…', font) <= maxW) lo = mid; else hi = mid - 1;
        }
        return chars.slice(0, lo).join('').replace(/\s+$/, '') + '…';
    }

    /** Make HTML well-formed XML for embedding inside SVG foreignObject. */
    function toXhtml(html) {
        const doc = document.implementation.createHTMLDocument('');
        const div = doc.createElement('div');
        div.innerHTML = html;
        const s = new XMLSerializer();
        let out = '';
        for (const child of div.childNodes) out += s.serializeToString(child);
        return out.replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
    }

    window.FlowStatic = {
        SIDES, NORMAL, OPPOSITE, PRESETS, PRESET_NAMES,
        center, anchor, autoSides, bestSides, routeContext, nearestSide, facingSide, bbox, setInteractive,
        connectorGeometry, edgeGeometry, layoutEdges, layoutLabels, labelBox, labelPoint, labelLines, LABEL_MAX_EM, LABEL_RESERVE, sceneIndex, inShape, arrowPath, edgeRoute, edgeDash, nodeShape,
        varPaint, resolvedPaint, safeColor, hasColor, fitLabel,
        renderMarkdown, isSimpleText, escapeHtml, sanitize, safeHref, str,
        toSVG,
    };
})();
