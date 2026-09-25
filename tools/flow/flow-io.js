/**
 * P5 - JSON Canvas I/O: parse / serialize (lossless: unknown fields and key order
 * are kept because the document objects are never rebuilt), import from file,
 * drag-drop or paste, export .canvas, SVG and PNG, copy PNG to the clipboard.
 *
 * Image export writes card text as real SVG <text>/<tspan> (wrapped with canvas text
 * metrics, markdown-aware), not HTML in <foreignObject>, so the SVG renders in any SVG
 * tool (Inkscape, Figma, resvg). The editor's fonts are embedded as a Google Fonts
 * subset (only the characters used) when online; the font stack falls back otherwise.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;
    const $ = (id) => document.getElementById(id);

    const io = Flow.io = {};

    /** Parse JSON Canvas text. Throws Error with a human message when it isn't a canvas. */
    io.parse = function (text) {
        let obj;
        try { obj = JSON.parse(String(text).replace(/^﻿/, '')); }
        catch (e) { throw new Error('Not valid JSON: ' + e.message); }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Not a JSON Canvas file (expected an object with nodes/edges)');
        if (obj.nodes != null && !Array.isArray(obj.nodes)) throw new Error('"nodes" must be an array');
        if (obj.edges != null && !Array.isArray(obj.edges)) throw new Error('"edges" must be an array');
        return obj;
    };

    /** Serialize the live document exactly as JSON Canvas (tab-indented like Obsidian). */
    io.serialize = function (doc) {
        return JSON.stringify(doc || core.exportDoc(), null, '\t');
    };

    io.init = function () {
        const input = $('flowImportInput');
        input.addEventListener('change', () => {
            const f = input.files && input.files[0];
            if (f) io.importFile(f);
            input.value = '';
        });

        // Drag & drop a .canvas file anywhere on the canvas.
        const vp = core.viewportEl;
        const hint = $('flowDropHint');
        let depth = 0;
        const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
        vp.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; hint.hidden = false; e.preventDefault(); });
        vp.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
        vp.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) hint.hidden = true; });
        vp.addEventListener('drop', (e) => {
            depth = 0; hint.hidden = true;
            if (!hasFiles(e)) return;
            e.preventDefault();
            const f = [...e.dataTransfer.files][0];
            if (f) io.importFile(f);
        });

        buildExportDialog();
    };

    io.chooseImport = function () { $('flowImportInput').click(); };

    io.importFile = async function (file) {
        try {
            const text = await file.text();
            io.importText(text, file.name.replace(/\.(canvas|json)$/i, ''));
        } catch (e) {
            core.toast(e.message || 'Could not read that file', 'error');
        }
    };

    /** Open canvas text as the current chart (the previous chart stays reachable with Undo). */
    io.importText = function (text, title) {
        let doc;
        try { doc = io.parse(text); } catch (e) { core.toast(e.message, 'error'); return false; }
        Flow.app.openDocument(doc, { title: title || 'Imported chart', snippetId: null, keepHistory: true });
        const n = doc.nodes ? doc.nodes.length : 0, m = doc.edges ? doc.edges.length : 0;
        core.toast(`Imported ${n} card${n === 1 ? '' : 's'} and ${m} connector${m === 1 ? '' : 's'} · Ctrl+Z to go back`);
        return true;
    };

    // ── Export: files ───────────────────────────────────────────────────────

    function fileBase() {
        const t = (Flow.app && Flow.app.title()) || 'chart';
        return t.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'chart';
    }

    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    io.download = download;

    io.exportCanvas = function () {
        download(new Blob([io.serialize()], { type: 'application/json' }), fileBase() + '.canvas');
        core.toast('Exported ' + fileBase() + '.canvas');
    };

    // ── Export: text layout as SVG ──────────────────────────────────────────

    const FONT_BODY = "Raleway, 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
    const FONT_HEAD = "'JetBrains Mono', Consolas, Menlo, 'DejaVu Sans Mono', monospace";
    const FONT_CODE = "Consolas, Monaco, Menlo, 'DejaVu Sans Mono', monospace";
    const FAMILY = { body: FONT_BODY, head: FONT_HEAD, code: FONT_CODE };
    const esc = S.escapeHtml;
    const r2 = (n) => Math.round(n * 100) / 100;

    let mctx = null, mfont = '';
    const usedFaces = new Set();   // "fam|weight|italic" of every style laid out (drives font embedding)
    function measure(st, text) {
        if (!mctx) mctx = document.createElement('canvas').getContext('2d');
        usedFaces.add(`${st.fam || 'body'}|${st.w || 400}|${st.i ? 1 : 0}`);
        const font = `${st.i ? 'italic ' : ''}${st.w || 400} ${st.size}px ${FAMILY[st.fam || 'body']}`;
        if (font !== mfont) { mctx.font = font; mfont = font; }
        return mctx.measureText(text).width;
    }

    const HEAD_SIZE = [0, 1.5, 1.3, 1.15, 1, 1, 1];

    /** Markdown -> [{ runs:[{t,st}|{br}], st, lh, mb, indent, marker, quote, pre, hr }] mirroring .flow-md CSS. */
    function mdBlocks(text) {
        const tpl = document.createElement('template');
        tpl.innerHTML = S.renderMarkdown(text);
        const out = [];
        walkBlocks(tpl.content, { indent: 0, quote: 0, color: 'text' }, out);
        return out;
    }

    function baseStyle(ctx, extra) {
        return Object.assign({ w: 400, i: false, fam: 'body', size: 16, color: ctx.color }, extra || {});
    }

    function walkBlocks(parent, ctx, out) {
        let loose = [];
        const flushLoose = () => {
            const runs = [];
            for (const nd of loose) inline(nd, baseStyle(ctx), runs);
            loose = [];
            if (runs.some(r => r.br || r.t.trim())) out.push({ runs, lh: 22.4, mb: 6, indent: ctx.indent, quote: ctx.quote });
        };
        for (const nd of parent.childNodes) {
            if (nd.nodeType !== 1) { if (nd.nodeType === 3) loose.push(nd); continue; }
            const tag = nd.tagName;
            if (/^H[1-6]$/.test(tag)) {
                flushLoose();
                const size = 16 * HEAD_SIZE[+tag[1]];
                const runs = [];
                inline(nd, baseStyle(ctx, { w: 700, fam: 'head', size }), runs);
                out.push({ runs, lh: size * 1.25, mb: 6, indent: ctx.indent, quote: ctx.quote });
            } else if (tag === 'P') {
                flushLoose();
                const runs = [];
                inline(nd, baseStyle(ctx), runs);
                out.push({ runs, lh: 22.4, mb: 6, indent: ctx.indent, quote: ctx.quote });
            } else if (tag === 'UL' || tag === 'OL') {
                flushLoose();
                let num = parseInt(nd.getAttribute('start'), 10) || 1;
                const items = [...nd.children].filter(c => c.tagName === 'LI');
                items.forEach((li, idx) => {
                    const runs = [];
                    const nested = [];
                    for (const c of li.childNodes) {
                        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c);
                        else if (c.nodeType === 1 && c.tagName === 'P') { if (runs.length) runs.push({ br: true }); inline(c, baseStyle(ctx), runs); }
                        else inline(c, baseStyle(ctx), runs);
                    }
                    const marker = tag === 'OL' ? { t: (num++) + '.', num: true } : { t: '•' };
                    out.push({ runs, lh: 22.4, mb: 2, indent: ctx.indent + 22, quote: ctx.quote, marker });
                    for (const sub of nested) walkBlocks({ childNodes: [sub] }, { ...ctx, indent: ctx.indent + 22 }, out);
                    if (idx === items.length - 1) out[out.length - 1].mb = 6;
                });
            } else if (tag === 'BLOCKQUOTE') {
                flushLoose();
                const start = out.length;
                walkBlocks(nd, { indent: ctx.indent + 13, quote: ctx.quote + 1, color: 'muted' }, out);
                if (out.length > start) { out[start].quoteStart = ctx.indent; out[out.length - 1].quoteEnd = true; }
            } else if (tag === 'PRE') {
                flushLoose();
                const lines = nd.textContent.replace(/\n$/, '').split('\n');
                out.push({ pre: lines, lh: 13.6 * 1.4, mb: 6, indent: ctx.indent, quote: ctx.quote, st: baseStyle(ctx, { fam: 'code', size: 13.6 }) });
            } else if (tag === 'HR') {
                flushLoose();
                out.push({ hr: true, lh: 17, mb: 0, indent: ctx.indent });
            } else if (tag === 'TABLE') {
                flushLoose();
                for (const tr of nd.querySelectorAll('tr')) {
                    const runs = [];
                    [...tr.children].forEach((cell, i) => {
                        if (i) runs.push({ t: '  |  ', st: baseStyle(ctx, { size: 14, color: 'muted' }) });
                        inline(cell, baseStyle(ctx, { size: 14, w: cell.tagName === 'TH' ? 700 : 400 }), runs);
                    });
                    out.push({ runs, lh: 14 * 1.4 + 4, mb: 0, indent: ctx.indent, quote: ctx.quote, table: true });
                }
                if (out.length) out[out.length - 1].mb = 6;
            } else if (tag === 'DIV' || tag === 'SECTION' || tag === 'DETAILS') {
                flushLoose();
                walkBlocks(nd, ctx, out);
            } else {
                loose.push(nd);
            }
        }
        flushLoose();
    }

    function inline(nd, st, runs) {
        if (nd.nodeType === 3) {
            const t = nd.nodeValue.replace(/[\t\n\r ]+/g, ' ');
            if (t) runs.push({ t, st });
            return;
        }
        if (nd.nodeType !== 1) return;
        const tag = nd.tagName;
        if (tag === 'BR') { runs.push({ br: true }); return; }
        if (tag === 'INPUT') { if (nd.type === 'checkbox') runs.push({ t: (nd.checked || nd.hasAttribute('checked') ? '☑' : '☐') + ' ', st }); return; }
        if (tag === 'IMG') { const a = nd.getAttribute('alt'); if (a) runs.push({ t: a, st: { ...st, i: true, color: 'muted' } }); return; }
        let s = st;
        if (tag === 'STRONG' || tag === 'B') s = { ...st, w: 700 };
        else if (tag === 'EM' || tag === 'I') s = { ...st, i: true };
        else if (tag === 'CODE') s = { ...st, fam: 'code', size: st.size * 0.85 };
        else if (tag === 'A') s = { ...st, color: 'accent', u: true };
        else if (nd.classList && nd.classList.contains('md-wikilink')) s = { ...st, color: 'accent' };
        else if (tag === 'DEL' || tag === 'S') s = { ...st, strike: true };
        for (const c of nd.childNodes) inline(c, s, runs);
    }

    const sameStyle = (a, b) => a.w === b.w && a.i === b.i && a.fam === b.fam && a.size === b.size && a.color === b.color && !!a.strike === !!b.strike && !!a.u === !!b.u;

    /** Greedy word wrap of runs into lines of segments [{t, st, w}]. Breaks long words by character. */
    function wrapRuns(runs, width) {
        const lines = [];
        let line = [], lw = 0;
        const push = () => {
            while (line.length && !line[line.length - 1].t.trim()) { lw -= line[line.length - 1].w; line.pop(); }
            lines.push({ segs: line, w: Math.max(0, lw) });
            line = []; lw = 0;
        };
        const add = (t, st) => {
            const w = measure(st, t);
            const last = line[line.length - 1];
            if (last && sameStyle(last.st, st)) { last.t += t; last.w += w; } else line.push({ t, st, w });
            lw += w;
        };
        for (const r of runs) {
            if (r.br) { push(); continue; }
            for (const tok of r.t.split(/( +)/)) {
                if (!tok) continue;
                if (tok[0] === ' ') { if (line.length) add(' ', r.st); continue; }
                const w = measure(r.st, tok);
                if (lw + w <= width + 0.5) { add(tok, r.st); continue; }
                if (line.some(s => s.t.trim())) push();
                if (w <= width + 0.5) { add(tok, r.st); continue; }
                // A single word wider than the line: break it by code point (overflow-wrap: anywhere).
                let chunk = '';
                for (const ch of Array.from(tok)) {
                    if (chunk && lw + measure(r.st, chunk + ch) > width + 0.5) { add(chunk, r.st); push(); chunk = ''; }
                    chunk += ch;
                }
                if (chunk) add(chunk, r.st);
            }
        }
        if (line.length || !lines.length) push();
        return lines;
    }

    function colorOf(key, pal) { return key === 'muted' ? pal.muted : key === 'accent' ? pal.accent : pal.text; }

    function tspan(seg, base, pal) {
        const st = seg.st, a = [];
        if (st.fam !== base.fam) a.push(`font-family="${esc(FAMILY[st.fam])}"`);
        if (st.size !== base.size) a.push(`font-size="${r2(st.size)}"`);
        if (st.w !== base.w) a.push(`font-weight="${st.w}"`);
        if (st.i !== base.i) a.push(`font-style="${st.i ? 'italic' : 'normal'}"`);
        if (st.color !== base.color) a.push(`fill="${colorOf(st.color, pal)}"`);
        if (!!st.strike !== !!base.strike || !!st.u !== !!base.u) a.push(`text-decoration="${st.strike ? 'line-through' : st.u ? 'underline' : 'none'}"`);
        return a.length ? `<tspan ${a.join(' ')}>${esc(seg.t)}</tspan>` : esc(seg.t);
    }

    /** One line of text as a <text> element. anchor: 'start' | 'middle'. */
    function textLine(line, x, top, lh, anchor, pal) {
        if (!line.segs.length) return '';
        const base = line.segs[0].st;
        const size = Math.max(...line.segs.map(s => s.st.size));
        const y = top + lh / 2 + size * 0.36;
        const attrs = [`x="${r2(x)}"`, `y="${r2(y)}"`, `font-family="${esc(FAMILY[base.fam])}"`, `font-size="${r2(base.size)}"`, `fill="${colorOf(base.color, pal)}"`];
        if (base.w !== 400) attrs.push(`font-weight="${base.w}"`);
        if (base.i) attrs.push('font-style="italic"');
        if (base.strike || base.u) attrs.push(`text-decoration="${base.strike ? 'line-through' : 'underline'}"`);
        if (anchor === 'middle') attrs.push('text-anchor="middle"');
        return `<text ${attrs.join(' ')} xml:space="preserve">${line.segs.map((s, i) => i ? tspan(s, base, pal) : esc(s.t)).join('')}</text>`;
    }

    let clipSeq = 0;

    /** Card content for S.toSVG's cardContent hook: markdown text / link / file cards as SVG text. */
    function cardContent(pal, chars) {
        return (n, box, shape) => {
            const note = (s) => { for (const ch of S.str(s)) chars.add(ch); return s; };
            const padded = shape === 'rect' || shape === 'pill';
            const px = padded ? 14 : 0, py = padded ? 10 : 0;
            const x0 = box.x + px, y0 = box.y + py, w = Math.max(10, box.w - px * 2), h = Math.max(10, box.h - py * 2);
            const parts = [];
            let contentH = 0;

            if (n.type === 'text') {
                const text = S.str(n.text);
                if (!text.trim()) return '';
                note(text); '•☐☑.|0123456789 '.split('').forEach(c => chars.add(c));
                const simple = S.isSimpleText(text) || shape !== 'rect';
                const blocks = mdBlocks(text);
                // Lay out every block first so the whole stack can be centred for simple cards.
                const laid = blocks.map(b => {
                    if (b.hr) return { b, lines: [], h: b.lh };
                    if (b.pre) return { b, lines: b.pre.map(t => ({ segs: t ? [{ t, st: b.st, w: measure(b.st, t) }] : [], w: measure(b.st, t) })), h: b.pre.length * b.lh + 16 };
                    const lines = wrapRuns(b.runs, w - b.indent - (b.pre ? 20 : 0));
                    return { b, lines, h: lines.length * b.lh };
                });
                laid.forEach((l, i) => { contentH += l.h + (i < laid.length - 1 ? l.b.mb : 0); });
                let y = simple ? y0 + (h - contentH) / 2 : y0;
                let quoteTop = null;
                for (const { b, lines, h: bh } of laid) {
                    if (b.quoteStart != null) quoteTop = { y, x: x0 + b.quoteStart };
                    if (b.hr) {
                        parts.push(`<line x1="${r2(x0 + b.indent)}" y1="${r2(y + 8.5)}" x2="${r2(x0 + w)}" y2="${r2(y + 8.5)}" stroke="${pal.border}" stroke-width="1"/>`);
                    } else if (b.pre) {
                        parts.push(`<rect x="${r2(x0 + b.indent)}" y="${r2(y)}" width="${r2(w - b.indent)}" height="${r2(bh)}" rx="5" fill="${pal.pre}"/>`);
                        lines.forEach((ln, i) => parts.push(textLine(ln, x0 + b.indent + 10, y + 8 + i * b.lh, b.lh, 'start', pal)));
                    } else {
                        // List items in a centred card are centred as a block (like the flex column on screen).
                        const blockW = Math.max(0, ...lines.map(l => l.w));
                        const listX = simple ? x0 + Math.max(0, (w - blockW - b.indent) / 2) : x0;
                        const lx = b.marker || !simple ? listX + b.indent : x0 + w / 2;
                        if (b.marker) {
                            const m = b.marker;
                            const mst = { w: 400, i: false, fam: 'body', size: 16, color: b.quote ? 'muted' : 'text' };
                            const mx = m.num ? lx - 6 : lx - 15;
                            parts.push(`<text x="${r2(mx)}" y="${r2(y + b.lh / 2 + 16 * 0.36)}" font-size="${m.num ? 16 : 20}" fill="${colorOf(mst.color, pal)}"${m.num ? ' text-anchor="end"' : ''}>${esc(m.t)}</text>`);
                        }
                        lines.forEach((ln, i) => parts.push(textLine(ln, lx, y + i * b.lh, b.lh, b.marker || !simple ? 'start' : 'middle', pal)));
                    }
                    y += bh;
                    if (b.quoteEnd && quoteTop) {
                        parts.push(`<rect x="${r2(quoteTop.x)}" y="${r2(quoteTop.y)}" width="3" height="${r2(y - quoteTop.y)}" fill="${pal.border}"/>`);
                        quoteTop = null;
                    }
                    y += b.mb;
                }
            } else {
                // Link / file / unknown cards: a title line and a muted sub line, like the on-screen meta card.
                let title, sub;
                if (n.type === 'link') {
                    title = S.str(n.url) || 'No URL'; sub = '';
                    try { const u = new URL(S.str(n.url)); title = u.hostname.replace(/^www\./, ''); sub = (u.pathname + u.search).replace(/\/$/, ''); } catch (e) { /* raw */ }
                    if (!sub) sub = S.str(n.url);
                } else if (n.type === 'file') {
                    const file = S.str(n.file);
                    title = (file.split('/').pop() || 'No file') + S.str(n.subpath);
                    sub = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) + '/' : 'vault root';
                } else { title = (S.str(n.type) || 'unknown') + ' node'; sub = ''; }
                note(title); note(sub); chars.add('…');
                const fit = (t, st) => {
                    if (measure(st, t) <= w) return t;
                    let s = Array.from(t);
                    while (s.length > 1 && measure(st, s.join('') + '…') > w) s.pop();
                    return s.join('') + '…';
                };
                const tst = { w: 700, i: false, fam: 'body', size: 14, color: 'text' };
                const sst = { w: 400, i: false, fam: 'body', size: 12, color: 'muted' };
                const tl = { segs: [{ t: fit(title, tst), st: tst }] };
                const sl = sub ? { segs: [{ t: fit(sub, sst), st: sst }] } : null;
                contentH = 20 + (sl ? 21 : 0);
                const simple = shape !== 'rect';
                const x = simple ? x0 + w / 2 : x0;
                // Tall file/link cards keep the title at the top (like the editor); short ones centre it.
                let y = n.height >= 150 && !simple ? y0 + 4 : y0 + (h - contentH) / 2;
                parts.push(textLine(tl, x, y, 20, simple ? 'middle' : 'start', pal));
                if (sl) parts.push(textLine(sl, x, y + 21, 17, simple ? 'middle' : 'start', pal));
            }
            if (!parts.length) return '';
            if (contentH > h + 1) {
                // Overflowing text is clipped to the card, like the card on screen.
                const id = 'fc' + (++clipSeq);
                return `<clipPath id="${id}"><rect x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}"/></clipPath><g clip-path="url(#${id})">${parts.join('')}</g>`;
            }
            return parts.join('');
        };
    }

    // ── Export: fonts ───────────────────────────────────────────────────────

    const fontCache = new Map();
    async function loadDocumentFonts() {
        if (!document.fonts || !document.fonts.load) return;
        try {
            await Promise.race([
                Promise.all(['400 16px Raleway', '700 16px Raleway', 'italic 400 16px Raleway', 'italic 700 16px Raleway', '700 16px "JetBrains Mono"'].map(f => document.fonts.load(f))),
                new Promise(r => setTimeout(r, 1500)),
            ]);
        } catch (e) { /* offline: metrics come from the fallback font */ }
    }

    const toBase64 = (buf) => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    };

    /**
     * Google serves ONE variable font file for several weights of a family. Collapse @font-face
     * rules that share a file into one rule with a weight range, so the file is embedded once.
     */
    function mergeFaces(css) {
        const groups = new Map();
        for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
            const body = m[1];
            const fam = (/font-family:\s*([^;]+);/.exec(body) || [])[1];
            const style = (/font-style:\s*([^;]+);/.exec(body) || [, 'normal'])[1];
            const w = +((/font-weight:\s*(\d+)/.exec(body) || [, 400])[1]);
            const src = (/src:\s*([^;]+);/.exec(body) || [])[1];
            if (!fam || !src) return css;   // unexpected format: keep it as served
            const k = fam + '|' + style + '|' + src;
            const g = groups.get(k) || { fam, style, src, min: w, max: w };
            g.min = Math.min(g.min, w); g.max = Math.max(g.max, w);
            groups.set(k, g);
        }
        if (!groups.size) return css;
        return [...groups.values()].map(g => `@font-face{font-family:${g.fam};font-style:${g.style};font-weight:${g.min === g.max ? g.min : g.min + ' ' + g.max};font-display:block;src:${g.src};}`).join('');
    }

    /** @font-face CSS with Raleway + JetBrains Mono subset to `chars`, as data: URLs. '' when offline. */
    async function embeddedFontCSS(chars, faces) {
        const text = [...chars].filter(c => c.codePointAt(0) >= 32).sort().join('');
        if (!text || text.length > 1200) return '';
        const body = [...new Set([...faces].filter(f => f.startsWith('body|')).map(f => { const [, w, i] = f.split('|'); return `${i},${w}`; }))]
            .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        if (!body.length) body.push('0,400');
        const fams = ['family=Raleway:ital,wght@' + body.join(';')];
        if ([...faces].some(f => f.startsWith('head|'))) fams.push('family=JetBrains+Mono:wght@700');
        const key = fams.join('&') + '\u0000' + text;
        if (fontCache.has(key)) return fontCache.get(key);
        const job = (async () => {
            const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = setTimeout(() => ctl && ctl.abort(), 5000);
            try {
                const url = 'https://fonts.googleapis.com/css2?' + fams.join('&') + '&display=block&text=' + encodeURIComponent(text);
                const res = await fetch(url, { signal: ctl && ctl.signal });
                if (!res.ok) throw new Error('fonts ' + res.status);
                let css = mergeFaces(await res.text());
                const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
                const data = await Promise.all(urls.map(async (u) => {
                    const r = await fetch(u, { signal: ctl && ctl.signal });
                    if (!r.ok) throw new Error('font ' + r.status);
                    const type = r.headers.get('content-type') || 'font/woff2';
                    return `data:${type};base64,${toBase64(await r.arrayBuffer())}`;
                }));
                urls.forEach((u, i) => { css = css.split(u).join(data[i]); });
                return css.replace(/\/\*[^*]*\*\//g, '').replace(/\s*\n\s*/g, '');
            } catch (e) {
                fontCache.delete(key);
                return '';
            } finally { clearTimeout(timer); }
        })();
        fontCache.set(key, job);
        return job;
    }

    // ── Export: SVG / PNG ───────────────────────────────────────────────────

    // Export colour schemes. 'current' reads the page theme; light/dark are fixed, theme-neutral
    // palettes so an exported chart sits well in a white document or a dark slide.
    const EXPORT_THEMES = {
        light: {
            '--bg-primary': '#ffffff', '--bg-secondary': '#f7f8fa', '--border-color': '#c9ced6',
            '--text-primary': '#1d2127', '--text-secondary': '#5a6270', '--accent-primary': '#1f6fd1',
            '--hue-red': '#d93a3a', '--hue-orange': '#e07a1f', '--hue-yellow': '#c99a06',
            '--hue-green': '#2f9e5b', '--hue-cyan': '#1590a8', '--hue-purple': '#8a4fd0',
        },
        dark: {
            '--bg-primary': '#16181c', '--bg-secondary': '#1f2227', '--border-color': '#3b4048',
            '--text-primary': '#e9ebee', '--text-secondary': '#a3a9b3', '--accent-primary': '#6ea8ff',
            '--hue-red': '#f26d6d', '--hue-orange': '#f49a4a', '--hue-yellow': '#e8c547',
            '--hue-green': '#4fc983', '--hue-cyan': '#46c3d9', '--hue-purple': '#b38cf5',
        },
    };

    const FAR = 1e7;   // cards beyond this are left out of images (the data is untouched)
    const sane = (n) => n && [n.x, n.y, n.width, n.height].every(v => typeof v === 'number' && isFinite(v))
        && Math.abs(n.x) < FAR && Math.abs(n.y) < FAR && n.width < FAR && n.height < FAR;

    /** The nodes/edges an image export covers. scope: 'all' (default) | 'selection'. */
    function exportScope(scope) {
        const doc = core.exportDoc();
        let nodes = doc.nodes || [], edges = doc.edges || [];
        if (scope === 'selection' && core.selection.nodes.size) {
            const ids = core.expandWithGroupContents([...core.selection.nodes]);
            nodes = nodes.filter(n => ids.has(n.id));
            edges = edges.filter(e => ids.has(e.fromNode) && ids.has(e.toNode));
        }
        const kept = nodes.filter(sane);
        return { nodes: kept, edges, skipped: nodes.length - kept.length };
    }

    /**
     * Build the export SVG. opts: { scope: 'all'|'selection', background: true, embedFonts: true }.
     * Resolves to { svg, width, height, skipped, fontsEmbedded } or null when there is nothing to draw.
     */
    io.buildSVG = async function (opts) {
        opts = opts || {};
        const part = exportScope(opts.scope || 'all');
        if (!part.nodes.length) return null;
        await loadDocumentFonts();
        const paint = S.resolvedPaint(null, EXPORT_THEMES[opts.theme] || null);
        const pal = {
            text: paint.v('--text-primary'), muted: paint.v('--text-secondary'), accent: paint.v('--accent-primary'),
            border: paint.v('--border-color'), pre: paint.v('--bg-primary'),
        };
        const chars = new Set();
        usedFaces.clear();
        usedFaces.add('body|400|0');
        for (const n of part.nodes) if (n.type === 'group' && n.label) { usedFaces.add('body|700|0'); for (const ch of S.str(n.label)) chars.add(ch); }
        for (const e of part.edges) if (e.label) for (const ch of S.str(e.label)) chars.add(ch);
        const r = S.toSVG({ nodes: part.nodes, edges: part.edges }, {
            paint, padding: 40, background: opts.background !== false,
            fontFamily: FONT_BODY, cardContent: cardContent(pal, chars),
        });
        let css = '';
        if (opts.embedFonts !== false) css = await embeddedFontCSS(chars, usedFaces);
        let svg = r.svg;
        if (css) svg = svg.replace(/^(<svg[^>]*>)/, `$1<defs><style>${css}</style></defs>`);
        return { svg, width: r.width, height: r.height, skipped: part.skipped, fontsEmbedded: !!css };
    };

    function skippedNote(r) {
        return r && r.skipped ? ` · ${r.skipped} card${r.skipped === 1 ? '' : 's'} with extreme coordinates left out` : '';
    }

    /** Direct SVG download. opts as buildSVG. */
    io.exportSVG = async function (opts) {
        if (!opts || !opts.direct) { io.openExport('svg'); return; }
        try {
            const r = await io.buildSVG(opts);
            if (!r) { core.toast('Nothing to export yet'); return; }
            download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + r.svg], { type: 'image/svg+xml' }), fileBase() + '.svg');
            core.toast('Exported ' + fileBase() + '.svg' + skippedNote(r));
        } catch (e) { core.toast(e.message || 'SVG export failed', 'error'); }
    };

    const MAX_SIDE = 16000, MAX_AREA = 100e6;
    function pngScale(r, want) {
        return Math.max(0.05, Math.min(want || 2, MAX_SIDE / r.width, MAX_SIDE / r.height, Math.sqrt(MAX_AREA / (r.width * r.height))));
    }

    /** Rasterise to a PNG blob. opts: buildSVG opts + { scale: 1|2|3 } (capped for browser canvas limits). */
    io.renderPNG = async function (opts) {
        opts = opts || {};
        const r = await io.buildSVG(opts);
        if (!r) return null;
        const scale = pngScale(r, opts.scale || 2);
        const img = new Image();
        const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
        try {
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Could not render the chart image'));
                img.src = url;
            });
            if (img.decode) { try { await img.decode(); } catch (e) { /* already loaded */ } }
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(r.width * scale));
            c.height = Math.max(1, Math.round(r.height * scale));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            const blob = await new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed')), 'image/png'));
            blob.meta = { width: c.width, height: c.height, skipped: r.skipped };
            return blob;
        } finally { URL.revokeObjectURL(url); }
    };

    /** Direct PNG download, or the export dialog when called without { direct: true }. */
    io.exportPNG = async function (opts) {
        if (!opts || !opts.direct) { io.openExport('png'); return; }
        try {
            const b = await io.renderPNG(opts);
            if (!b) { core.toast('Nothing to export yet'); return; }
            download(b, fileBase() + '.png');
            core.toast(`Exported ${fileBase()}.png (${b.meta.width} × ${b.meta.height})` + skippedNote(b.meta));
        } catch (e) { core.toast(e.message, 'error'); }
    };

    /** Copy the whole chart (or opts.scope) as PNG. */
    io.copyPNG = async function (opts) {
        // Shortcut copy (no opts): whole chart, with the colours/background last chosen in the dialog.
        opts = Object.assign({ theme: prefs.theme, background: prefs.background !== false }, opts || {});
        try {
            if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('Clipboard images are not supported in this browser');
            const p = io.renderPNG(opts);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': p.then(b => { if (!b) throw new Error('Nothing to copy yet'); return b; }) })]);
            core.toast('Copied ' + (opts.scope === 'selection' ? 'selection' : 'chart') + ' as PNG');
        } catch (e) { core.toast(e.message || 'Copy failed', 'error'); }
    };

    // ── Export dialog ───────────────────────────────────────────────────────

    const PREF_KEY = 'flow-export';
    let prefs = { format: 'png', scale: 2, background: true, theme: 'current' };
    try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* defaults */ }
    const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

    function buildExportDialog() {
        if ($('flowExportDialog')) return;
        const style = document.createElement('style');
        style.id = 'flowIoStyles';
        style.textContent = `
.flow-export-dialog { width: min(520px, calc(100vw - 32px)); }
.flow-export-preview { height: 220px; display: grid; place-items: center; overflow: hidden; border-radius: 6px; border: 1px solid var(--border-color);
  background: repeating-conic-gradient(color-mix(in srgb, var(--text-primary) 7%, var(--bg-primary)) 0 25%, var(--bg-primary) 0 50%) 0 0 / 16px 16px; }
.flow-export-preview img { width: 100%; height: 100%; object-fit: contain; padding: 8px; box-sizing: border-box; }
.flow-export-preview .flow-export-empty { font-size: 13px; color: var(--text-secondary); }
.flow-export-row { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--text-secondary); }
.flow-export-row > span:first-child { width: 72px; flex: none; }
.flow-seg { display: inline-flex; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; }
.flow-seg label { position: relative; }
.flow-seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.flow-seg label span { display: block; padding: 6px 14px; font-size: 13px; color: var(--text-primary); background: var(--bg-primary); }
.flow-seg label + label span { border-left: 1px solid var(--border-color); }
.flow-seg input:checked + span { background: color-mix(in srgb, var(--accent-primary) 22%, var(--bg-primary)); color: var(--text-primary); font-weight: 600; }
.flow-seg input:focus-visible + span { outline: 2px solid var(--accent-secondary); outline-offset: -2px; }
.flow-export-check { display: inline-flex; align-items: center; gap: 8px; color: var(--text-primary); cursor: pointer; }
.flow-export-check input { accent-color: var(--accent-primary); width: 15px; height: 15px; margin: 0; }
.flow-export-check.is-disabled { opacity: 0.5; cursor: default; }
.flow-export-row[hidden] { display: none; }`;
        document.head.appendChild(style);

        const d = document.createElement('div');
        d.className = 'flow-dialog-backdrop';
        d.id = 'flowExportDialog';
        d.hidden = true;
        d.innerHTML = `
<form class="flow-dialog flow-export-dialog" id="flowExportForm" role="dialog" aria-modal="true" aria-labelledby="flowExportTitle">
  <div class="flow-dialog-head">
    <h3 id="flowExportTitle">Export image</h3>
    <button type="button" class="flow-icon-btn" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="flow-export-preview" id="flowExportPreview" aria-hidden="true"></div>
  <div class="flow-export-row"><span>Format</span>
    <div class="flow-seg" role="radiogroup" aria-label="Format">
      <label><input type="radio" name="flowExportFormat" value="png"><span>PNG</span></label>
      <label><input type="radio" name="flowExportFormat" value="svg"><span>SVG</span></label>
    </div></div>
  <div class="flow-export-row" id="flowExportScaleRow"><span>Scale</span>
    <div class="flow-seg" role="radiogroup" aria-label="Scale">
      <label><input type="radio" name="flowExportScale" value="1"><span>1×</span></label>
      <label><input type="radio" name="flowExportScale" value="2"><span>2×</span></label>
      <label><input type="radio" name="flowExportScale" value="3"><span>3×</span></label>
    </div></div>
  <div class="flow-export-row"><span>Colours</span>
    <div class="flow-seg" role="radiogroup" aria-label="Colours">
      <label><input type="radio" name="flowExportTheme" value="current"><span>Current theme</span></label>
      <label><input type="radio" name="flowExportTheme" value="light"><span>Light</span></label>
      <label><input type="radio" name="flowExportTheme" value="dark"><span>Dark</span></label>
    </div></div>
  <div class="flow-export-row"><span>Include</span>
    <label class="flow-export-check" id="flowExportSelLabel"><input type="checkbox" id="flowExportSel"><span id="flowExportSelText">Only selected</span></label>
    <label class="flow-export-check"><input type="checkbox" id="flowExportBg"><span>Background</span></label>
  </div>
  <p class="flow-dialog-note" id="flowExportInfo">&nbsp;</p>
  <div class="flow-dialog-actions">
    <button type="button" class="flow-btn" id="flowExportCopy"><i class="fa-regular fa-copy"></i> Copy PNG</button>
    <span class="flow-spacer"></span>
    <button type="button" class="flow-btn" data-close>Cancel</button>
    <button type="submit" class="flow-btn flow-btn-primary" id="flowExportGo">Download</button>
  </div>
</form>`;
        document.body.appendChild(d);

        const form = $('flowExportForm');
        const close = () => Flow.app.closeDialog('flowExportDialog');
        d.addEventListener('pointerdown', (e) => { if (e.target === d) close(); });
        d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
        d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
        form.addEventListener('change', (e) => {
            readForm();
            if (e.target.name === 'flowExportScale') updateInfo(); else refreshPreview();
        });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const o = currentOpts();
            close();
            if (prefs.format === 'svg') await io.exportSVG(o); else await io.exportPNG(o);
        });
        $('flowExportCopy').addEventListener('click', () => { const o = currentOpts(); close(); io.copyPNG(o); });
    }

    let lastPreview = null, previewSeq = 0, previewUrl = null;

    function readForm() {
        const f = document.querySelector('input[name="flowExportFormat"]:checked');
        const s = document.querySelector('input[name="flowExportScale"]:checked');
        prefs.format = f ? f.value : 'png';
        prefs.scale = s ? +s.value : 2;
        prefs.background = $('flowExportBg').checked;
        const th = document.querySelector('input[name="flowExportTheme"]:checked');
        prefs.theme = th && EXPORT_THEMES[th.value] ? th.value : 'current';
        savePrefs();
        $('flowExportScaleRow').hidden = prefs.format !== 'png';
        $('flowExportGo').textContent = 'Download ' + prefs.format.toUpperCase();
    }

    function currentOpts() {
        return { direct: true, scope: $('flowExportSel').checked ? 'selection' : 'all', background: prefs.background, scale: prefs.scale, theme: prefs.theme };
    }

    function updateInfo() {
        const info = $('flowExportInfo');
        const r = lastPreview;
        if (!r) { info.textContent = 'Nothing to export yet.'; return; }
        const size = prefs.format === 'png'
            ? (() => { const k = pngScale(r, prefs.scale); return `${Math.round(r.width * k)} × ${Math.round(r.height * k)} px`; })()
            : `${Math.round(r.width)} × ${Math.round(r.height)} (vector)`;
        info.textContent = size + (r.fontsEmbedded ? ' · Raleway embedded' : ' · fonts not embedded (offline): system font stack') + skippedNote(r);
    }

    async function refreshPreview() {
        const seq = ++previewSeq;
        const box = $('flowExportPreview');
        const r = await io.buildSVG(currentOpts());
        if (seq !== previewSeq) return;
        lastPreview = r;
        if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
        if (r) {
            previewUrl = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
            box.innerHTML = `<img alt="" src="${previewUrl}">`;
        } else box.innerHTML = '<span class="flow-export-empty">Nothing to export yet</span>';
        $('flowExportGo').disabled = !r;
        $('flowExportCopy').disabled = !r;
        updateInfo();
    }

    /** Open the export dialog. Whole chart by default; "Only selected" is an explicit choice. */
    io.openExport = function (format) {
        if (Flow.nodes && Flow.nodes.isEditing()) Flow.nodes.stopEdit();
        if (format) prefs.format = format;
        for (const el of document.querySelectorAll('input[name="flowExportFormat"]')) el.checked = el.value === prefs.format;
        for (const el of document.querySelectorAll('input[name="flowExportScale"]')) el.checked = +el.value === prefs.scale;
        $('flowExportBg').checked = prefs.background !== false;
        if (!EXPORT_THEMES[prefs.theme]) prefs.theme = 'current';
        for (const el of document.querySelectorAll('input[name="flowExportTheme"]')) el.checked = el.value === prefs.theme;
        const nSel = core.selection.nodes.size;
        const sel = $('flowExportSel');
        sel.checked = false;
        sel.disabled = !nSel;
        $('flowExportSelLabel').classList.toggle('is-disabled', !nSel);
        $('flowExportSelText').textContent = nSel ? `Only selected (${nSel})` : 'Only selected';
        readForm();
        Flow.app.openDialog('flowExportDialog', $('flowExportGo'));
        refreshPreview();
    };
})();
