/* Viewer for an exported Phase Board snapshot. Read-only: it only renders, it never writes.
   Runs after phase-board-core.js has been inlined into the same file. */
(function () {
    const DATA = JSON.parse(document.getElementById('board-data').textContent);
    const root = document.getElementById('root');
    const ids = Object.keys(DATA.projects).sort((a, b) => (DATA.projects[b].updatedAt || 0) - (DATA.projects[a].updatedAt || 0));
    let view = 'portfolio', sel = null, filter = 'all';

    function updated(p) {
        return p.updatedAt ? 'updated ' + new Date(p.updatedAt).toISOString().slice(0, 10) : '';
    }

    function portfolio() {
        const list = ids.map(id => ({ id: id, p: DATA.projects[id] }));
        const att = list.filter(i => summarize(tplOf(i.p), i.p).attention).length;
        const done = list.filter(i => !summarize(tplOf(i.p), i.p).current).length;
        const shown = list.filter(i => {
            const s = summarize(tplOf(i.p), i.p);
            return filter === 'all' || (filter === 'attention' && s.attention) || (filter === 'done' && !s.current);
        });
        const chips = [['all', 'All', list.length], ['attention', 'Needs attention', att], ['done', 'Complete', done]].map(c =>
            '<button class="chip" type="button" data-filter="' + c[0] + '" aria-pressed="' + (filter === c[0]) + '">' + c[1] + ' ' + c[2] + '</button>').join('');
        return '<div class="ph-row"><div><p class="eyebrow">Portfolio</p><h1>Projects</h1></div><div class="filters">' + chips + '</div></div>' +
            (shown.length
                ? '<div class="grid">' + shown.map(i => cardHTML(i.id, i.p, updated(i.p))).join('') + '</div>'
                : '<div class="empty"><h2>Nothing in this view</h2><p>No projects match this filter.</p></div>');
    }

    function detail() {
        const p = DATA.projects[view], tpl = tplOf(p), s = summarize(tpl, p);
        if (!sel || !tpl.phases.some(d => d.id === sel)) sel = (s.current || tpl.phases[tpl.phases.length - 1]).id;
        const idx = tpl.phases.findIndex(d => d.id === sel), def = tpl.phases[idx];
        const prev = tpl.phases[idx - 1], next = tpl.phases[idx + 1];
        return '<button class="back" type="button" data-act="back">Back to projects</button>' +
            '<div><p class="eyebrow">' + esc(tpl.name) + (p.owner ? ' / ' + esc(p.owner) : '') + (p.started ? ' / started ' + esc(p.started) : '') + '</p><h1>' + esc(p.name) + '</h1></div>' +
            overviewHTML(p, false) + risksHTML(p, false) +
            '<div class="railbox">' + railHTML(tpl, p, { button: true, sel: sel }) + barHTML(tpl, p) +
            '<p class="msg">' + s.doneP + ' of ' + s.total + ' phases done / ' + s.g + ' of ' + s.gt + ' criteria met. Select a phase to read its details.</p></div>' +
            phaseHTML(def, phaseState(p, def), idx, { mode: 'view', idp: 'x-' }) +
            '<div class="ph-row"><button class="btn" type="button" data-sel="' + (prev ? prev.id : '') + '"' + (prev ? '' : ' disabled') + '>Previous phase</button>' +
            '<button class="btn" type="button" data-sel="' + (next ? next.id : '') + '"' + (next ? '' : ' disabled') + '>Next phase</button></div>' +
            outcomesHTML(p, false);
    }

    function render() {
        root.innerHTML = '<div class="pb-bar"><span class="eyebrow">Phase Board</span><span class="spacer"></span>' +
            '<span class="role">Read-only snapshot / ' + esc(DATA.takenAt) + '</span></div><div class="page">' +
            (view === 'portfolio' ? portfolio() : detail()) + '</div>';
    }

    root.addEventListener('click', e => {
        const open = e.target.closest('[data-open]');
        if (open) { view = open.getAttribute('data-open'); sel = null; render(); window.scrollTo(0, 0); return; }
        const f = e.target.closest('[data-filter]');
        if (f) { filter = f.getAttribute('data-filter'); render(); return; }
        const s = e.target.closest('[data-sel]');
        if (s && s.getAttribute('data-sel')) { sel = s.getAttribute('data-sel'); render(); return; }
        if (e.target.closest('[data-act="back"]')) { view = 'portfolio'; render(); window.scrollTo(0, 0); }
    });
    render();
})();
