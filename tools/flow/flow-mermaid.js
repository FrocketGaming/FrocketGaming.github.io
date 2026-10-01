/**
 * P10 - Mermaid export: the chart as a `flowchart` for READMEs, issues and docs.
 * Export only (Mermaid has no positions, so nothing round-trips). Builds from the live document
 * and never changes it. Mapping:
 *   text card shapes   rect -> [..]   pill -> ([..])   diamond -> {..}   circle -> ((..))
 *                      parallelogram -> [/../]   hexagon -> {{..}}   cylinder -> [(..)]   document -> [..]
 *   link / file cards  a rectangle labelled with the host or file name
 *   step label         prefixed to the card text as "[sql] "
 *   groups             subgraph (nested by containment, like the editor)
 *   connectors         --> / --- / <--> ; dashed and dotted both become the dashed form
 *   colours            a stroke colour through classDef / linkStyle
 * Layout direction (TD or LR) follows how the connectors mostly run on the canvas.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const S = window.FlowStatic;

    const mermaid = Flow.mermaid = {};
    const N = (v) => Number(v) || 0;   // coordinates may be strings in a hand-written file

    /** Card markdown as plain label lines: markers stripped, blank lines dropped. */
    function plainLines(md) {
        return S.str(md).split(/\r?\n/)
            .map(l => l
                .replace(/^\s{0,3}#{1,6}\s+/, '')
                .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
                .replace(/^\s*[-*+]\s+/, '• ')
                .replace(/^\s*>\s?/, '')
                .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
                .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
                .replace(/(\*\*|__)(.+?)\1/g, '$2')
                .replace(/`([^`]*)`/g, '$1')
                .trim())
            .filter(Boolean);
    }

    /** Escape one label line for a quoted Mermaid label. */
    function esc(line) {
        return line.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
    }

    const label = (lines, fallback) => (lines.length ? lines : [fallback]).map(esc).join('<br/>');

    /** The text shown for a node. */
    function nodeLabel(n) {
        const step = S.stepType(n);
        if (n.type === 'group') return label(plainLines(n.label), 'Group');
        let lines;
        const img = S.imageCard(n);
        if (img) lines = [img.alt || 'Image'];
        else if (n.type === 'text') lines = plainLines(n.text);
        else if (n.type === 'link') {
            const url = S.str(n.url);
            try { const u = new URL(url); lines = [(u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '')]; } catch (e) { lines = url ? [url] : []; }
        } else if (n.type === 'file') lines = [S.str(n.file).split('/').pop() + S.str(n.subpath)].filter(Boolean);
        else lines = [];
        if (step && lines.length) lines[0] = `[${step}] ${lines[0]}`;
        else if (step) lines = [`[${step}]`];
        return label(lines, '(empty)');
    }

    function shaped(id, n, text) {
        const shape = n.type === 'text' ? S.nodeShape(n) : 'rect';
        if (shape === 'pill') return `${id}(["${text}"])`;
        if (shape === 'diamond') return `${id}{"${text}"}`;
        if (shape === 'circle') return `${id}(("${text}"))`;
        if (shape === 'parallelogram') return `${id}[/"${text}"/]`;
        if (shape === 'hexagon') return `${id}{{"${text}"}}`;
        if (shape === 'cylinder') return `${id}[("${text}")]`;
        // document: Mermaid only has it in the v11 `@{ shape: doc }` syntax, which older
        // renderers (and some docs sites) reject outright, so it stays a rectangle.
        return `${id}["${text}"]`;
    }

    /** '#rrggbb' for a node or connector colour as the page currently shows it, or null. */
    function hexOf(color, pal) {
        if (!S.hasColor(color)) return null;
        const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(pal.color(color, '--text-secondary'));
        return m ? '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : null;
    }

    /** Build the Mermaid source for a document (default: the open chart). */
    mermaid.build = function (doc) {
        doc = doc || core.doc;
        const nodes = (Array.isArray(doc.nodes) ? doc.nodes : []).filter(n => n && typeof n === 'object' && typeof n.id === 'string');
        const edges = Array.isArray(doc.edges) ? doc.edges : [];
        const pal = S.resolvedPaint(document.documentElement);
        const area = (n) => N(n.width) * N(n.height);
        const inside = (a, g) => N(a.x) >= N(g.x) && N(a.y) >= N(g.y) && N(a.x) + N(a.width) <= N(g.x) + N(g.width) && N(a.y) + N(a.height) <= N(g.y) + N(g.height);

        // Parent = the smallest other group that fully contains the node.
        const groups = nodes.filter(n => n.type === 'group').sort((a, b) => area(a) - area(b));
        const parent = new Map();
        for (const n of nodes) {
            const g = groups.find(g => g !== n && area(g) > area(n) && inside(n, g));
            if (g) parent.set(n, g);
        }
        // Ids Mermaid accepts, numbered in reading order.
        const reading = [...nodes].sort((a, b) => N(a.y) - N(b.y) || N(a.x) - N(b.x));
        const ids = new Map();
        let ni = 0, gi = 0;
        for (const n of reading) if (!ids.has(n.id)) ids.set(n.id, n.type === 'group' ? `g${++gi}` : `n${++ni}`);

        const out = [];
        const classes = new Map();   // hex -> [mermaid ids]
        const tint = (n, id) => {
            const hex = hexOf(n.color, pal);
            if (hex) { if (!classes.has(hex)) classes.set(hex, []); classes.get(hex).push(id); }
        };
        const emit = (group, depth) => {
            const pad = '    '.repeat(depth);
            for (const n of reading.filter(x => parent.get(x) === group && ids.get(x.id))) {
                const id = ids.get(n.id);
                if (n.type === 'group') {
                    out.push(`${pad}subgraph ${id}["${nodeLabel(n)}"]`);
                    emit(n, depth + 1);
                    out.push(`${pad}end`);
                } else out.push(pad + shaped(id, n, nodeLabel(n)));
                tint(n, id);
            }
        };
        emit(undefined, 1);

        // Connectors.
        const byId = new Map(nodes.map(n => [n.id, n]));
        let across = 0, down = 0;
        const links = [];
        for (const e of edges) {
            const a = byId.get(e.fromNode), b = byId.get(e.toNode);
            if (!a || !b || !ids.has(a.id) || !ids.has(b.id)) continue;
            across += Math.abs(N(a.x) + N(a.width) / 2 - N(b.x) - N(b.width) / 2);
            down += Math.abs(N(a.y) + N(a.height) / 2 - N(b.y) - N(b.height) / 2);
            const dashed = !!S.edgeDash(e);
            const toArrow = e.toEnd !== 'none', fromArrow = e.fromEnd === 'arrow';
            let from = ids.get(a.id), to = ids.get(b.id), arrow;
            if (fromArrow && toArrow) arrow = dashed ? '<-.->' : '<-->';
            else if (fromArrow) { [from, to] = [to, from]; arrow = dashed ? '-.->' : '-->'; }   // only the start has a head: draw it the other way round
            else if (toArrow) arrow = dashed ? '-.->' : '-->';
            else arrow = dashed ? '-.-' : '---';
            const text = plainLines(e.label);
            links.push({ line: `    ${from} ${arrow}${text.length ? `|"${text.map(esc).join('<br/>')}"|` : ''} ${to}`, hex: hexOf(e.color, pal) });
        }
        out.push(...links.map(l => l.line));
        links.forEach((l, i) => { if (l.hex) out.push(`    linkStyle ${i} stroke:${l.hex},stroke-width:2px;`); });
        for (const [hex, list] of classes) {
            const name = 'c' + hex.slice(1);
            out.push(`    classDef ${name} stroke:${hex},stroke-width:2px;`);
            out.push(`    class ${list.join(',')} ${name};`);
        }
        return `flowchart ${links.length && across > down ? 'LR' : 'TD'}\n${out.join('\n')}\n`;
    };

    /** Copy the Mermaid source (plain, without code fences) to the clipboard. */
    mermaid.copy = async function () {
        if (!core.nodes().length) { core.toast('Nothing to export yet'); return; }
        try {
            await navigator.clipboard.writeText(mermaid.build());
            core.toast('Copied as Mermaid');
        } catch (e) { core.toast('Copy failed: ' + (e.message || 'clipboard unavailable'), 'error'); }
    };

    /** Download the Mermaid source as a .mmd file. */
    mermaid.download = function () {
        if (!core.nodes().length) { core.toast('Nothing to export yet'); return; }
        const base = ((Flow.app && Flow.app.title()) || 'chart').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'chart';
        Flow.io.download(new Blob([mermaid.build()], { type: 'text/plain' }), base + '.mmd');
        core.toast('Exported ' + base + '.mmd');
    };
})();
