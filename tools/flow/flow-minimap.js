/**
 * P9 - Minimap: a small overview of the whole chart with the visible area outlined.
 * Click or drag on it to move the view. Toggled with M or the footer button; the choice is a
 * pref (`minimap`). Drawn on a canvas from theme tokens, so it follows the theme.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;

    const minimap = Flow.minimap = {};
    const W = 200, H = 140, PAD = 8;
    let box, cv, ctx, btn, raf = 0, map = null;   // map = { s, ox, oy } world -> minimap px

    const N = (v) => Number(v) || 0;

    function on() { return core.prefs.minimap === true; }

    /** Cards worth drawing: finite, on-screen scale (an absurd coordinate would shrink everything). */
    function drawn() {
        const sc = core.scene();
        const list = sc ? sc.nodes : core.nodes();
        return list.filter(n => n && [n.x, n.y, n.width, n.height].every(v => isFinite(Number(v))) && Math.abs(N(n.x)) < 1e7 && Math.abs(N(n.y)) < 1e7);
    }

    function paint() {
        raf = 0;
        if (!on()) return;
        const nodes = drawn();
        const r = core.viewportRect(), z = core.view.zoom;
        // World rect currently visible.
        const vis = { x: -core.view.x / z, y: -core.view.y / z, width: r.width / z, height: r.height / z };
        // The map covers the chart and the visible area, so the outline never leaves it.
        const b = nodes.length ? S.bbox(nodes) : vis;
        const x1 = Math.min(b.x, vis.x), y1 = Math.min(b.y, vis.y);
        const x2 = Math.max(b.x + b.width, vis.x + vis.width), y2 = Math.max(b.y + b.height, vis.y + vis.height);
        const s = Math.min((W - PAD * 2) / Math.max(1, x2 - x1), (H - PAD * 2) / Math.max(1, y2 - y1));
        const ox = (W - (x2 - x1) * s) / 2 - x1 * s, oy = (H - (y2 - y1) * s) / 2 - y1 * s;
        map = { s, ox, oy };

        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        // Resolved colours: a canvas cannot use var(). Cards use the muted text tone, groups a fainter one.
        const pal = S.resolvedPaint(box);
        const card = pal.v('--text-secondary');
        const group = pal.v('--border-color');
        const accent = pal.v('--accent-primary');

        for (const n of nodes) {   // groups first, so cards sit on top of them
            if (n.type !== 'group') continue;
            const col = S.hasColor(n.color) ? pal.color(n.color, '--text-secondary') : '';
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = col || group;
            ctx.fillRect(N(n.x) * s + ox, N(n.y) * s + oy, Math.max(2, N(n.width) * s), Math.max(2, N(n.height) * s));
        }
        ctx.globalAlpha = 1;
        for (const n of nodes) {
            if (n.type === 'group') continue;
            const col = S.hasColor(n.color) ? pal.color(n.color, '--text-secondary') : '';
            ctx.fillStyle = col || card;
            ctx.fillRect(N(n.x) * s + ox, N(n.y) * s + oy, Math.max(2, N(n.width) * s), Math.max(2, N(n.height) * s));
        }
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.12;
        const vx = vis.x * s + ox, vy = vis.y * s + oy, vw = vis.width * s, vh = vis.height * s;
        ctx.fillRect(vx, vy, vw, vh);
        ctx.globalAlpha = 1;
        ctx.strokeRect(vx, vy, vw, vh);
    }

    function schedule() { if (on() && !raf) raf = requestAnimationFrame(paint); }

    /** Centre the view on the world point under a pointer event. */
    function panTo(e) {
        if (!map) return;
        const rect = cv.getBoundingClientRect();
        const wx = ((e.clientX - rect.left) * (W / rect.width) - map.ox) / map.s;
        const wy = ((e.clientY - rect.top) * (H / rect.height) - map.oy) / map.s;
        const r = core.viewportRect(), z = core.view.zoom;
        core.setView({ x: r.width / 2 - wx * z, y: r.height / 2 - wy * z });
    }

    function sync() {
        const show = on();
        box.hidden = !show;
        btn.classList.toggle('is-active', show);
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        document.body.classList.toggle('flow-has-minimap', show);
        schedule();
    }

    minimap.toggle = function () { core.setPref('minimap', !on()); };

    minimap.init = function () {
        box = document.getElementById('flowMinimap');
        cv = document.getElementById('flowMinimapCanvas');
        btn = document.getElementById('flowMinimapBtn');
        ctx = cv.getContext('2d');
        btn.addEventListener('click', minimap.toggle);
        cv.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cv.setPointerCapture(e.pointerId);
            panTo(e);
            const move = (ev) => panTo(ev);
            const up = () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); };
            cv.addEventListener('pointermove', move);
            cv.addEventListener('pointerup', up);
            cv.addEventListener('pointercancel', up);
        });
        core.on('view', schedule);
        core.on('change', schedule);
        core.on('load', schedule);
        core.on('selection', schedule);
        core.on('prefs', sync);
        window.addEventListener('resize', schedule);
        // A theme switch changes every colour the map reads.
        new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() !== 'm' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
            if (Flow.canvas.isTyping(e) || document.querySelector('.flow-dialog-backdrop:not([hidden])')) return;
            e.preventDefault();
            minimap.toggle();
        });
        sync();
    };
})();
