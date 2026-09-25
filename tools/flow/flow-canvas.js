/**
 * P1 - Canvas & chrome: infinite pan/zoom, grid, toolbar, zoom/history footer,
 * contextual hint line, toasts, empty state, layout under the site header.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const $ = (id) => document.getElementById(id);

    const canvas = Flow.canvas = {};
    let viewport, world, spaceDown = false, panning = null, focusByPointer = true;

    // Hover ports keep a constant screen size. On a card smaller than this many port diameters
    // on screen they would cover its middle (a drag from the centre would start a connector
    // instead of moving the card), so they are hidden for that card.
    const PORTS_MIN_CARD = 3;
    // Smaller than this on screen, even the compact outside dots can't sit around a card.
    const PORTS_HIDE_BELOW = 12;
    // Below this zoom connector labels (which keep a readable screen size) would cover the cards.
    const FAR_ZOOM = 0.3;
    // Gap kept between fitted content and the floating chrome / viewport edge (screen px).
    const FIT_MARGIN = 24, FIT_MARGIN_B = 40, FIT_GAP = 12;

    canvas.init = function () {
        viewport = $('flowViewport');
        world = $('flowWorld');
        core.viewportEl = viewport;
        // Deep zoom for detail work; text is re-rasterised at every scale so it stays sharp.
        core.MAX_ZOOM = 10;

        syncHeaderOffset();
        new ResizeObserver(syncHeaderOffset).observe(document.querySelector('.header'));

        // Touch: a second finger turns any gesture into pinch-zoom + two-finger pan. Registered
        // before the dispatcher so it can claim the second pointer first.
        viewport.addEventListener('pointerdown', onTouchDown, true);
        window.addEventListener('pointermove', onTouchMove, true);
        window.addEventListener('pointerup', onTouchUp, true);
        window.addEventListener('pointercancel', onTouchUp, true);

        // Browser zoom keys never zoom the page: they zoom the canvas (also while typing in a
        // card or the title) and do nothing while a dialog is open.
        window.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const k = e.code;
            const zin = k === 'Equal' || k === 'NumpadAdd', zout = k === 'Minus' || k === 'NumpadSubtract', zreset = k === 'Digit0' || k === 'Numpad0';
            if (!zin && !zout && !zreset) return;
            e.preventDefault();
            if (document.querySelector('.flow-dialog-backdrop:not([hidden])')) return;
            if (zreset) canvas.zoomTo(1); else canvas.zoomBy(zin ? 1.2 : 1 / 1.2);
        }, true);

        // Pointer entry point for every gesture on the canvas.
        viewport.addEventListener('pointerdown', (e) => {
            if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (e.button === 2) return;
            if (!core.editing) viewport.focus({ preventScroll: true });
            if (core.dispatchPointerDown(e)) e.preventDefault();
        });
        viewport.addEventListener('contextmenu', (e) => { if (!e.target.closest('textarea, input')) e.preventDefault(); });
        // Wheel anywhere over the tool (canvas or floating chrome) drives the canvas.
        const app = $('flowApp');
        app.addEventListener('wheel', onWheel, { passive: false });
        // Never let the browser zoom the page itself (ctrl+wheel / trackpad pinch), even over
        // the header or a dialog: that would rescale all the chrome instead of the chart.
        window.addEventListener('wheel', (e) => {
            if ((e.ctrlKey || e.metaKey) && !app.contains(e.target)) e.preventDefault();
        }, { passive: false });
        // Safari gestures.
        document.addEventListener('gesturestart', (e) => e.preventDefault());
        document.addEventListener('gesturechange', (e) => e.preventDefault());

        // Pan gestures have the highest priority: middle button, space-drag, hand tool.
        core.addPointerHandler(1000, (e, hit) => {
            if (e.button === 1 || spaceDown || (core.tool === 'hand' && e.button === 0 && hit.kind !== 'ui')) {
                startPan(e);
                return true;
            }
            // Touch: one finger on empty canvas pans (a tap still clears the selection).
            if (e.pointerType === 'touch' && core.tool === 'select' && hit.kind === 'canvas') {
                startPan(e, true);
                return true;
            }
            return false;
        });

        // How the current focus was reached: pointer (click) or keyboard (Tab and friends).
        window.addEventListener('pointerdown', () => { focusByPointer = true; }, true);
        window.addEventListener('keydown', (e) => { if (e.key === 'Tab') focusByPointer = false; }, true);
        window.addEventListener('keydown', (e) => {
            // Space pans, except on a control reached with the keyboard (Tab), where it must press
            // the control. A button last clicked with the mouse keeps focus but Space still pans.
            const onControl = !focusByPointer && e.target && e.target.closest && e.target.closest('button, a[href], [role="button"], [role="menuitem"], summary');
            if (e.code === 'Space' && !isTyping(e) && !onControl && !e.repeat) {
                spaceDown = true;
                viewport.classList.add('is-space');
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') { spaceDown = false; viewport.classList.remove('is-space'); }
        });
        window.addEventListener('blur', () => { spaceDown = false; viewport.classList.remove('is-space'); });

        // Toolbar
        $('flowToolbar').addEventListener('click', (e) => {
            const b = e.target.closest('[data-tool]');
            if (b) { core.setTool(b.dataset.tool, core.toolLocked); viewport.focus({ preventScroll: true }); }
        });
        $('flowToolLock').addEventListener('click', () => core.setTool(core.tool, !core.toolLocked));
        core.on('tool', syncToolbar);
        syncToolbar();

        // Zoom + history footer
        $('flowZoomIn').addEventListener('click', () => canvas.zoomBy(1.2));
        $('flowZoomOut').addEventListener('click', () => canvas.zoomBy(1 / 1.2));
        $('flowZoomLabel').addEventListener('click', () => canvas.zoomTo(1));
        $('flowZoomFit').addEventListener('click', () => canvas.fit());
        $('flowUndo').addEventListener('click', () => core.undo());
        $('flowRedo').addEventListener('click', () => core.redo());
        core.on('history', syncHistory);
        core.on('view', () => { $('flowZoomLabel').textContent = Math.round(core.view.zoom * 100) + '%'; });

        core.on('toast', showToast);
        core.on('change', syncEmptyAndStats);
        core.on('load', syncEmptyAndStats);
        core.on('prefs', () => viewport.classList.toggle('no-grid', !core.prefs.grid));
        viewport.classList.toggle('no-grid', !core.prefs.grid);

        core.addRenderer('view', (d) => { if (d.view || d.all) applyView(); }, -100);
        // flow-edges.js (re)builds the hover-port element on hover; size-check it whenever it changes.
        new MutationObserver(syncPortsFit).observe($('flowSelUI'), { childList: true, subtree: true });
        core.addRenderer('ports-fit', syncPortsFit, 75);
        // Keep the view centred on the same content when the window changes size.
        lastSize = { w: viewport.clientWidth, h: viewport.clientHeight };
        new ResizeObserver(onResize).observe(viewport);
    };

    let lastSize = null, lastFit = null;
    const sameView = (a, b) => a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.zoom - b.zoom) < 1e-4;
    function onResize() {
        const w = viewport.clientWidth, h = viewport.clientHeight;
        if (!lastSize || !w || !h || (w === lastSize.w && h === lastSize.h)) { lastSize = { w, h }; return; }
        const prev = lastSize;
        lastSize = { w, h };
        // Still showing the last zoom-to-fit (nobody panned or zoomed since)? Fit again at the new size,
        // so shrinking and then growing the window returns to the same full-size fit.
        if (lastFit && reachable(core.nodes()).length && (sameView(core.view, lastFit.view) || sameView(animTo, lastFit.view))) {
            canvas.fit(null, { instant: true, maxZoom: lastFit.maxZoom, includeAll: lastFit.includeAll, quiet: true });
            return;
        }
        const nodes = reachable(core.nodes());
        const v = core.view;
        // Was the whole chart on screen before? Then keep it whole (shrink to fit if needed).
        let wasWhole = false;
        if (nodes.length) {
            const b = FlowStatic.bbox(nodes);
            const x1 = b.x * v.zoom + v.x, y1 = b.y * v.zoom + v.y;
            wasWhole = x1 >= -1 && y1 >= -1 && x1 + b.width * v.zoom <= prev.w + 1 && y1 + b.height * v.zoom <= prev.h + 1;
        }
        cancelAnimationFrame(anim); animTo = null;
        core.setView({ x: v.x + (w - prev.w) / 2, y: v.y + (h - prev.h) / 2 });
        if (wasWhole) {
            const b = FlowStatic.bbox(nodes), z = core.view.zoom;
            const x1 = b.x * z + core.view.x, y1 = b.y * z + core.view.y;
            if (x1 < 0 || y1 < 0 || x1 + b.width * z > w || y1 + b.height * z > h) canvas.fit(null, { instant: true, maxZoom: z, quiet: true });
        }
    }

    /** Hide the hover ports when the hovered card is too small on screen to carry them. */
    function syncPortsFit() {
        const pe = document.querySelector('#flowSelUI .flow-ports');
        if (!pe) return;
        const port = pe.querySelector('.flow-port');
        const n = port && core.getNode(port.dataset.nodeId);
        if (!n) return;
        const z = core.view.zoom;
        // Port diameter on screen, read from the live CSS (layout px are world units here).
        const d = (port.offsetWidth || 12 / z) * z;
        // Too small for the normal edge-straddling dots: switch to compact dots placed just outside
        // the card (their hit area is outside too, so a press on the body still moves the card).
        const side = Math.min(n.width, n.height) * z;
        const tiny = side < PORTS_HIDE_BELOW;
        const compact = !tiny && side < PORTS_MIN_CARD * Math.max(d, 12);
        if (pe.classList.contains('is-tiny') !== tiny) pe.classList.toggle('is-tiny', tiny);
        if (pe.classList.contains('is-compact') !== compact) pe.classList.toggle('is-compact', compact);
    }

    function syncHeaderOffset() {
        const h = document.querySelector('.header');
        if (!h) return;
        document.documentElement.style.setProperty('--flow-top', h.offsetHeight + 'px');
    }

    function isTyping(e) {
        const t = e.target;
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }
    canvas.isTyping = isTyping;

    let lastZoom = null;
    function applyView() {
        const v = core.view;
        world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
        // Dot grid in two levels, 20 world units and 5x that. The fine level fades out as its
        // spacing shrinks and the coarse level takes over, so there is never a sudden jump.
        let fine = core.GRID * v.zoom;
        while (fine < 8) fine *= 5;
        const t = Math.min(1, Math.max(0, (fine - 8) / 10));
        const fineA = t * t * (3 - 2 * t);
        // The whole grid recedes when zoomed out so it doesn't compete with small card text.
        const strength = Math.min(1, Math.max(0.55, 0.55 + 0.45 * (v.zoom - 0.25) / 0.75));
        const s = viewport.style;
        s.setProperty('--grid-size', fine + 'px');
        s.setProperty('--grid-size-2', fine * 5 + 'px');
        s.setProperty('--grid-a1', (strength * fineA * 100).toFixed(1) + '%');
        s.setProperty('--grid-a2', (strength * 100).toFixed(1) + '%');
        s.setProperty('--grid-x', v.x + 'px');
        s.setProperty('--grid-y', v.y + 'px');
        viewport.classList.toggle('is-zoomed-far', v.zoom < FAR_ZOOM);
        syncPortsFit();
        // Scoped to the viewport (not <html>), and only written when the zoom changes, so a pan
        // restyles nothing but the viewport's own background (the --grid-* props don't inherit).
        if (v.zoom !== lastZoom) { lastZoom = v.zoom; s.setProperty('--flow-zoom', v.zoom); }
    }

    function onWheel(e) {
        // Ctrl+wheel / pinch always zooms the canvas, wherever it lands (even over an open editor):
        // the browser must never zoom the page. Only plain wheels may scroll something local.
        const zoomGesture = e.ctrlKey || e.metaKey;
        if (!zoomGesture) {
            if (e.target.closest('textarea')) return;
            const content = e.target.closest('.flow-node-content.is-scrollable');
            if (content && content.scrollHeight > content.clientHeight + 1 && core.selection.nodes.has(content.closest('[data-node-id]')?.dataset.nodeId)) return;
            // A plain wheel over a scrollable piece of chrome (properties panel, menu) scrolls it.
            for (let el = e.target; el && el !== viewport && el.id !== 'flowApp'; el = el.parentElement) {
                if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return;
            }
        }
        e.preventDefault();
        cancelAnimationFrame(anim); animTo = null;
        if (zoomGesture) {
            // Pinch (trackpads send ctrl+wheel) or ctrl+scroll: zoom at the cursor.
            const dy = Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode === 1 ? 20 : 1)));
            const factor = Math.pow(2, -dy * 0.0025);
            canvas.zoomAt(core.view.zoom * factor, e.clientX, e.clientY);
        } else {
            const k = e.deltaMode === 1 ? 20 : 1;
            let dx = e.deltaX * k, dy = e.deltaY * k;
            if (e.shiftKey && !dx) { dx = dy; dy = 0; }
            core.setView({ x: core.view.x - dx, y: core.view.y - dy });
        }
    }

    function startPan(e, tapClears) {
        cancelAnimationFrame(anim); animTo = null;
        const sx = e.clientX, sy = e.clientY, vx = core.view.x, vy = core.view.y;
        let moved = false;
        viewport.classList.add('is-panning');
        core.trackDrag(e, {
            move: (ev) => {
                if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true;
                core.setView({ x: vx + ev.clientX - sx, y: vy + ev.clientY - sy });
            },
            up: () => { viewport.classList.remove('is-panning'); if (tapClears && !moved) core.clearSelection(); },
            cancel: () => { viewport.classList.remove('is-panning'); core.setView({ x: vx, y: vy }); },
        });
    }

    // ── Touch pinch / two-finger pan ───────────────────────────────────────
    const touches = new Map();
    let pinch = null;
    function onTouchDown(e) {
        if (e.pointerType !== 'touch') return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size < 2) return;
        // Second (or later) finger: never a gesture of its own.
        e.stopImmediatePropagation();
        e.preventDefault();
        if (pinch) return;
        // Abandon whatever the first finger started (drag, marquee, pan...), rolling it back.
        if (core.dragging) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        viewport.classList.remove('is-panning');
        const [a, b] = [...touches.values()];
        const r = core.viewportRect();
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        cancelAnimationFrame(anim); animTo = null;
        pinch = {
            d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
            z0: core.view.zoom,
            // world point under the fingers' midpoint; it stays under the midpoint as they move
            wx: (mx - r.left - core.view.x) / core.view.zoom,
            wy: (my - r.top - core.view.y) / core.view.zoom,
        };
    }
    function onTouchMove(e) {
        if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!pinch || touches.size < 2) return;
        e.stopImmediatePropagation();
        const [a, b] = [...touches.values()];
        const r = core.viewportRect();
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        const z = Math.min(core.MAX_ZOOM, Math.max(core.MIN_ZOOM, pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0));
        core.setView({ zoom: z, x: mx - pinch.wx * z, y: my - pinch.wy * z });
    }
    function onTouchUp(e) {
        if (e.pointerType !== 'touch') return;
        touches.delete(e.pointerId);
        if (pinch) {
            // Swallow the lift so a gesture handler never sees an unmatched pointerup.
            e.stopImmediatePropagation();
            if (touches.size < 2) pinch = null;
        }
    }

    /** Zoom so that the given client point stays fixed. */
    canvas.zoomAt = function (zoom, clientX, clientY) {
        const z = Math.min(core.MAX_ZOOM, Math.max(core.MIN_ZOOM, zoom));
        const r = core.viewportRect();
        const px = clientX - r.left, py = clientY - r.top;
        const wx = (px - core.view.x) / core.view.zoom, wy = (py - core.view.y) / core.view.zoom;
        core.setView({ zoom: z, x: px - wx * z, y: py - wy * z });
    };

    canvas.zoomBy = function (factor) {
        const r = core.viewportRect();
        // Chain from where a running animation is heading, so rapid clicks compound fully.
        const base = animTo ? animTo.zoom : core.view.zoom;
        canvas.animateTo(null, base * factor, r.left + r.width / 2, r.top + r.height / 2);
    };
    canvas.zoomTo = function (z) {
        const r = core.viewportRect();
        canvas.animateTo(null, z, r.left + r.width / 2, r.top + r.height / 2);
    };

    let anim = 0, animTo = null;
    /** Smoothly move to a target view. target = {x,y,zoom} or null to zoom around a client point. */
    canvas.animateTo = function (target, zoom, cx, cy) {
        cancelAnimationFrame(anim);
        const from = { ...core.view };
        // Zooming about a point while already animating: anchor on the pending target view.
        const base = animTo || from;
        let to;
        if (target) to = target;
        else {
            const z = Math.min(core.MAX_ZOOM, Math.max(core.MIN_ZOOM, zoom));
            const r = core.viewportRect();
            const px = cx - r.left, py = cy - r.top;
            const wx = (px - base.x) / base.zoom, wy = (py - base.y) / base.zoom;
            to = { zoom: z, x: px - wx * z, y: py - wy * z };
        }
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { animTo = null; core.setView(to); return; }
        animTo = to;
        const t0 = performance.now(), dur = 180;
        const step = (t) => {
            const k = Math.min(1, (t - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3);
            // interpolate zoom geometrically so the motion feels even
            const z = from.zoom * Math.pow(to.zoom / from.zoom, e);
            const zk = (from.zoom === to.zoom) ? e : (z - from.zoom) / (to.zoom - from.zoom);
            core.setView({ zoom: z, x: from.x + (to.x - from.x) * zk, y: from.y + (to.y - from.y) * zk });
            if (k < 1) anim = requestAnimationFrame(step); else animTo = null;
        };
        anim = requestAnimationFrame(step);
    };

    /** Fit the given nodes (default: all) into view. */
    canvas.fit = function (nodes, opts) {
        const whole = !nodes;
        // Cards at absurd coordinates (e.g. x = 1e21 in an imported file) would shrink the fit to
        // nothing; leave them out, as the image export does. If that's everything, show the origin.
        opts = opts || {};
        const all = nodes || core.nodes();
        nodes = reachable(all);
        const unreachable = all.length - nodes.length;
        const r = core.viewportRect();
        // A whole-chart fit frames the main cluster, so one stray card far away doesn't shrink the
        // chart to nothing. Fitting again right away (Shift+1 twice) includes the strays.
        let dropped = 0, includeAll = !!opts.includeAll;
        if (whole && !includeAll && lastFit && lastFit.armed && (sameView(core.view, lastFit.view) || sameView(animTo, lastFit.view))) includeAll = true;
        if (whole && !includeAll) {
            const kept = mainCluster(nodes, r);
            dropped = nodes.length - kept.length;
            nodes = kept;
        }
        if (whole && !opts.quiet && (dropped || unreachable)) {
            const msg = [];
            if (dropped) msg.push(`${dropped} far-away card${dropped === 1 ? '' : 's'} not shown · Shift+1 ${opts.instant ? 'twice' : 'again'} to include`);
            if (unreachable) msg.push(`${unreachable} card${unreachable === 1 ? '' : 's'} with out-of-range coordinates not shown`);
            core.toast(msg.join(' · '));
        }
        if (!nodes.length) { const t = { x: r.width / 2, y: r.height / 2, zoom: 1 }; lastFit = null; if (opts && opts.instant) { cancelAnimationFrame(anim); animTo = null; core.setView(t); } else canvas.animateTo(t); return; }
        const b = FlowStatic.bbox(nodes);
        // Group labels sit above the group's box: include them.
        if (nodes.some(n => n.type === 'group' && n.label && n.y <= b.y + 1)) { b.y -= 34; b.height += 34; }
        const maxZ = (opts && opts.maxZoom) || 1;
        const W = r.width, H = r.height;
        const solve = (p) => {
            const aw = Math.max(100, W - p.l - p.r), ah = Math.max(100, H - p.t - p.b);
            const z = Math.min(maxZ, Math.max(core.MIN_ZOOM, Math.min(aw / Math.max(b.width, 1), ah / Math.max(b.height, 1))));
            const x = p.l + (aw - b.width * z) / 2, y = p.t + (ah - b.height * z) / 2;
            return { z, x, y, w: b.width * z, h: b.height * z };
        };
        // Start from a slim margin and only make room for the floating chrome the fitted
        // content would actually run into (e.g. the toolbar above a tall, centred chart).
        const chrome = chromeRects(r);
        let pads = { t: FIT_MARGIN, b: FIT_MARGIN_B, l: FIT_MARGIN, r: FIT_MARGIN };
        let fitted = solve(pads);
        for (let i = 0; i < 8; i++) {
            const c = chrome.find(c => c.left < fitted.x + fitted.w + FIT_GAP && c.right > fitted.x - FIT_GAP &&
                c.top < fitted.y + fitted.h + FIT_GAP && c.bottom > fitted.y - FIT_GAP);
            if (!c) break;
            const options = [];
            const cy = (c.top + c.bottom) / 2, cx = (c.left + c.right) / 2;
            options.push(cy < H / 2 ? { ...pads, t: Math.max(pads.t, c.bottom + FIT_GAP) } : { ...pads, b: Math.max(pads.b, H - c.top + FIT_GAP) });
            // Corner pieces can also be cleared sideways; the centred toolbar can't.
            // Sideways clearance is applied to both sides so the chart stays centred.
            const side = cx < W / 3 ? c.right + FIT_GAP : cx > W * 2 / 3 ? W - c.left + FIT_GAP : 0;
            if (side) { const m = Math.max(pads.l, pads.r, side); options.push({ ...pads, l: m, r: m }); }
            let best = null, bestFit = null;
            for (const o of options) { const f = solve(o); if (!bestFit || f.z > bestFit.z + 1e-6) { best = o; bestFit = f; } }
            pads = best; fitted = bestFit;
        }
        const z = fitted.z;
        const target = { zoom: z, x: fitted.x - b.x * z, y: fitted.y - b.y * z };
        // Remember a whole-chart fit so a window resize re-fits instead of drifting.
        // Only a fit the user asked for (not the automatic one on open or resize) arms "again includes all".
        lastFit = whole ? { view: target, maxZoom: maxZ, armed: dropped > 0 && !opts.instant, includeAll } : null;
        if (opts && opts.instant) { cancelAnimationFrame(anim); animTo = null; core.setView(target); } else canvas.animateTo(target);
    };

    const FAR = 1e7;
    function reachable(nodes) {
        return nodes.filter(n => [n.x, n.y, n.x + n.width, n.y + n.height].every(v => Number.isFinite(v) && Math.abs(v) <= FAR));
    }

    /**
     * The main cluster of nodes for a whole-chart fit. Nodes are linked when the gap between
     * their boxes is under a generous distance (single linkage); the largest group wins (ties go
     * to the group with the selection, then the most area). Outliers are only left out when
     * framing everything would push the zoom below FIT_OUTLIER_ZOOM, i.e. when they'd really
     * shrink the chart to nothing. Works for any number of nodes, including 2 or 3.
     */
    const FIT_OUTLIER_ZOOM = 0.25;
    function mainCluster(nodes, vr) {
        if (nodes.length < 2) return nodes;
        const b = FlowStatic.bbox(nodes);
        if (Math.min(vr.width / Math.max(b.width, 1), vr.height / Math.max(b.height, 1)) >= FIT_OUTLIER_ZOOM) return nodes;
        const sizes = nodes.map(n => Math.max(Math.abs(n.width), Math.abs(n.height))).sort((p, q) => p - q);
        const link = Math.max(1500, 6 * sizes[sizes.length >> 1]);
        const parent = nodes.map((_, i) => i);
        const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
        const box = nodes.map(n => ({ x1: Math.min(n.x, n.x + n.width), y1: Math.min(n.y, n.y + n.height), x2: Math.max(n.x, n.x + n.width), y2: Math.max(n.y, n.y + n.height) }));
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
            const A = box[i], B = box[j];
            const dx = Math.max(0, A.x1 - B.x2, B.x1 - A.x2), dy = Math.max(0, A.y1 - B.y2, B.y1 - A.y2);
            if (dx < link && dy < link && Math.hypot(dx, dy) < link) parent[find(i)] = find(j);
        }
        const groups = new Map();
        nodes.forEach((n, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
        if (groups.size < 2) return nodes;
        const score = (g) => [g.length, g.some(n => core.selection.nodes.has(n.id)) ? 1 : 0, g.reduce((s, n) => s + Math.abs(n.width * n.height), 0)];
        let best = null, bs = null;
        for (const g of groups.values()) {
            const sc = score(g);
            if (!bs || sc[0] > bs[0] || (sc[0] === bs[0] && (sc[1] > bs[1] || (sc[1] === bs[1] && sc[2] > bs[2])))) { best = g; bs = sc; }
        }
        return best;
    }

    /** Screen rects (relative to the viewport) of the floating chrome that sits over the canvas. */
    function chromeRects(vr) {
        const out = [];
        document.querySelectorAll('#flowApp > [data-ui]').forEach(el => {
            if (el.hidden) return;
            const q = el.getBoundingClientRect();
            if (q.width < 1 || q.height < 1) return;
            out.push({ left: q.left - vr.left, right: q.right - vr.left, top: q.top - vr.top, bottom: q.bottom - vr.top });
        });
        return out;
    }

    /** Scroll just enough to bring a world rect into view (used after keyboard creation). */
    canvas.ensureVisible = function (rect) {
        const r = core.viewportRect();
        const z = core.view.zoom, m = 80;
        const sx1 = rect.x * z + core.view.x, sy1 = rect.y * z + core.view.y;
        const sx2 = sx1 + rect.width * z, sy2 = sy1 + rect.height * z;
        let dx = 0, dy = 0;
        if (sx1 < m) dx = m - sx1; else if (sx2 > r.width - m) dx = r.width - m - sx2;
        if (sy1 < m + 40) dy = m + 40 - sy1; else if (sy2 > r.height - m) dy = r.height - m - sy2;
        if (dx || dy) canvas.animateTo({ x: core.view.x + dx, y: core.view.y + dy, zoom: z });
    };

    function syncToolbar() {
        document.querySelectorAll('#flowToolbar [data-tool]').forEach(b => {
            const on = b.dataset.tool === core.tool;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const lock = $('flowToolLock');
        lock.classList.toggle('is-active', core.toolLocked);
        lock.setAttribute('aria-pressed', core.toolLocked ? 'true' : 'false');
        lock.innerHTML = core.toolLocked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
        viewport.dataset.tool = core.tool;
        canvas.setHint(null);
    }

    /**
     * Transient message under the toolbar (e.g. during a gesture). null clears it.
     * There is no always-on hint: the `?` sheet lists every shortcut.
     */
    canvas.setHint = function (html) {
        const el = $('flowHint');
        el.innerHTML = html || '';
        el.hidden = !html;
    };

    function syncHistory() {
        $('flowUndo').disabled = !core.canUndo();
        $('flowRedo').disabled = !core.canRedo();
    }

    function syncEmptyAndStats() {
        const n = core.nodes().length, e = core.edges().length;
        $('flowEmpty').hidden = n > 0;
        $('flowStats').textContent = n ? `${n} card${n === 1 ? '' : 's'} · ${e} connector${e === 1 ? '' : 's'}` : '';
    }

    let toastTimer = 0;
    function showToast({ msg, kind }) {
        const el = $('flowToast');
        el.textContent = msg;
        el.dataset.kind = kind;
        el.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-visible'), kind === 'error' ? 4500 : 2200);
    }
})();
