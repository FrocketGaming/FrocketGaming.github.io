/* Viewer for an exported Phase Board snapshot. Read-only: it only renders, it never writes.
   Runs after phase-board-core.js has been inlined into the same file. */
(function () {
    const rootEl = document.getElementById('root');
    try {
    const DATA = JSON.parse(document.getElementById('board-data').textContent);
    const root = document.getElementById('root');
    const ids = Object.keys(DATA.projects).sort((a, b) => (DATA.projects[b].updatedAt || 0) - (DATA.projects[a].updatedAt || 0));
    let view = 'portfolio', sel = null, filter = 'all', doneOpen = true;

    function updated(p) {
        return p.updatedAt ? 'updated ' + new Date(p.updatedAt).toISOString().slice(0, 10) : '';
    }

    function portfolio() {
        const list = ids.map(id => ({ id: id, p: DATA.projects[id] }));
        const shown = filterProjects(list, filter);
        return '<div class="ph-row"><div><p class="eyebrow">Portfolio</p><h1>Projects</h1></div><div class="filters">' + filterChipsHTML(list, filter) + '</div></div>' +
            (shown.length
                ? portfolioBodyHTML(shown, filter, { when: updated, completedOpen: doneOpen })
                : '<div class="empty"><h2>Nothing in this view</h2><p>No projects match this filter.</p></div>');
    }

        function detail() {
        const p = DATA.projects[view], tpl = tplOf(p), s = summarize(tpl, p);
        if (!sel || !tpl.phases.some(d => d.id === sel)) sel = (s.current || tpl.phases[tpl.phases.length - 1]).id;
        const idx = tpl.phases.findIndex(d => d.id === sel), def = tpl.phases[idx];
        const prev = tpl.phases[idx - 1], next = tpl.phases[idx + 1];
        return '<button class="back" type="button" data-act="back">Back to projects</button>' +
            '<div><p class="eyebrow">' + projectMeta(p) + '</p><h1>' + esc(p.name) + '</h1></div>' +
            overviewHTML(p, false) + risksHTML(p, false) +
            '<div class="railbox">' + railHTML(tpl, p, { button: true, sel: sel }) + barHTML(tpl, p) +
            '<p class="msg">' + s.doneP + ' of ' + s.total + ' phases done / ' + s.g + ' of ' + s.gt + ' criteria met. Select a phase to read its details.</p></div>' +
            phaseHTML(def, phaseState(p, def), idx, { mode: 'view', idp: 'x-', svgs: DATA.svgs || {} }) +
            '<div class="ph-row"><button class="btn" type="button" data-sel="' + (prev ? prev.id : '') + '"' + (prev ? '' : ' disabled') + '>Previous phase</button>' +
            '<button class="btn" type="button" data-sel="' + (next ? next.id : '') + '"' + (next ? '' : ' disabled') + '>Next phase</button></div>' +
            outcomesHTML(p, false);
    }

    function showError(err) {
        root.innerHTML = '<div class="empty" style="margin-top:40px"><h2>This snapshot could not be displayed</h2><p>' + String(err && err.message || err).replace(/[<>&]/g, '') + '</p><p>Export it again from the Phase Board.</p></div>';
    }
    function render() {
        try { draw(); } catch (err) { showError(err); }
    }
    function draw() {
        if (DATA.mode === 'review') {
            root.innerHTML = '<div class="pb-bar"><span class="eyebrow">Phase Board</span><span class="spacer"></span><span class="role">Read-only snapshot / ' + esc(DATA.takenAt) + '</span></div><div class="page">' + reviewHTML(reviewData(DATA.projects, DATA.year)) + '</div>';
            return;
        }
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
    root.addEventListener('toggle', e => { if (e.target && e.target.id === 'pbDoneSec' && filter === 'all') doneOpen = !!e.target.open; }, true);
    render();
    attachBackToTop(document, window);
    } catch (err) {
        if (rootEl) rootEl.innerHTML = '<p style="padding:24px">This snapshot could not be displayed: ' + String(err && err.message || err).replace(/[<>&]/g, '') + '</p>';
    }
})();
