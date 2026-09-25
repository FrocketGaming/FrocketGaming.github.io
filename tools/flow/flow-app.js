/**
 * Flow app bootstrap: wires the modules together, owns the chart's identity
 * (title, linked snippet), local autosave, the ⋮ menu, dialogs and the
 * shortcuts sheet.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const $ = (id) => document.getElementById(id);

    const app = Flow.app = {};
    // Chart identity. The working copy lives in its own localStorage slot (Flow.store, in
    // flow-snippets.js): `snippetId` for a saved chart, else `draftId`.
    let state = { title: 'Untitled chart', snippetId: null, draftId: null, savedContent: null, savedUpdatedAt: null, category: null, detachedFrom: null, conflict: false };
    let autosaveTimer = 0, lastFocus = null;

    app.title = () => state.title;
    app.link = () => ({ snippetId: state.snippetId, savedContent: state.savedContent, category: state.category, savedUpdatedAt: state.savedUpdatedAt });
    app.state = () => state;
    /** Patch identity fields without touching the document or the slot (remote sync, conflict flags). */
    app.setState = function (patch) {
        Object.assign(state, patch);
        $('flowTitle').value = state.title;
        syncUrl();
        app.refreshStatus();
    };

    // ── Document identity ───────────────────────────────────────────────────

    /**
     * Replace the current chart. opts: { title, snippetId, draftId, savedContent, savedUpdatedAt,
     * category, detachedFrom, conflict, restored, keepHistory, view, autoEdges, shape, boot, quiet }
     * The chart being left stays in its own slot (Open > Unsaved work if it has unsaved edits).
     * Returns a note about that (and toasts it unless `quiet`).
     */
    app.openDocument = function (doc, opts) {
        opts = opts || {};
        if (Flow.interact) Flow.interact.finishEditing();
        const note = opts.boot ? null : Flow.store.leave();
        core.load(doc, { keepHistory: !!opts.keepHistory, autoEdges: opts.autoEdges, source: opts.snippetId ? 'snippet' : 'file' });
        // Undo can take back an import/open only until the chart is saved or another tab joins it.
        if (opts.keepHistory) Flow.store.markBoundary();
        if (opts.shape) core.docShape = opts.shape;
        state = {
            title: opts.title || 'Untitled chart',
            snippetId: opts.snippetId || null,
            draftId: opts.snippetId ? null : (opts.draftId || Flow.store.newDraftId()),
            savedContent: null,
            savedUpdatedAt: opts.savedUpdatedAt || null,
            category: opts.category || null,
            detachedFrom: opts.detachedFrom || null,
            conflict: !!opts.conflict,
            broken: !!opts.broken,
        };
        // Compare against our own serialisation so whitespace differences don't read as edits.
        if (state.snippetId) state.savedContent = opts.restored ? opts.savedContent : Flow.io.serialize();
        $('flowTitle').value = state.title;
        syncUrl();
        core.renderNow();
        if (opts.view) core.setView(opts.view);
        else Flow.canvas.fit(null, { instant: true });
        app.refreshStatus();
        autosaveNow();
        if (note && !opts.quiet) core.toast(note);
        return note;
    };

    /** The same working copy gets a new identity (first save, save as new, snippet deleted). */
    app.setLink = function (patch) {
        const oldKey = Flow.store.currentKey();
        const fork = !!patch.fork;   // save as new: other tabs stay on the original chart
        patch = Object.assign({}, patch);
        delete patch.fork;
        Object.assign(state, patch);
        if (state.snippetId) state.draftId = null;
        $('flowTitle').value = state.title;
        syncUrl();
        app.refreshStatus();
        clearTimeout(autosaveTimer); autosaveTimer = 0;
        Flow.store.move(oldKey, { fork });
    };

    app.newChart = function () {
        const r = core.viewportRect();
        const note = app.openDocument({ nodes: [], edges: [] }, { title: 'Untitled chart', quiet: true, view: { x: r.width / 2, y: r.height / 2, zoom: 1 } });
        core.toast(note ? 'New chart · ' + note : 'New chart');
    };

    function syncUrl() {
        try {
            const url = new URL(location.href);
            if (state.snippetId) url.searchParams.set('snippet', state.snippetId); else url.searchParams.delete('snippet');
            history.replaceState(null, '', url);
        } catch (e) { /* ignore */ }
    }

    app.isDirty = () => !state.snippetId || Flow.io.serialize() !== state.savedContent;

    app.refreshStatus = function () {
        const el = $('flowDocStatus');
        const txt = $('flowDocStatusText');
        let label, kind, tip;
        if (!state.snippetId) {
            label = state.detachedFrom ? 'Draft · deleted from Snippets' : 'Draft'; kind = state.detachedFrom ? 'dirty' : 'draft';
            tip = state.detachedFrom
                ? 'The snippet was deleted in Snippets; this copy is kept in this browser. Ctrl+S saves it again.'
                : 'Kept in this browser automatically. Ctrl+S saves it to Snippets.';
        } else if (state.broken) {
            label = 'Snippet content invalid'; kind = 'dirty';
            tip = 'The saved snippet no longer holds valid JSON Canvas (edited in Snippets?). This is your last good copy; Ctrl+S replaces the broken content (it stays in History).';
        } else if (state.conflict) {
            label = 'Changed elsewhere'; kind = 'dirty';
            tip = 'Saved from another tab or device after you opened it, and you have edits too. Ctrl+S lets you keep both.';
        } else if (app.isDirty()) {
            label = 'Unsaved changes'; kind = 'dirty';
            tip = 'Changes are kept locally; Ctrl+S updates the snippet.';
        } else {
            label = 'Saved' + (state.category ? ' · ' + state.category : ''); kind = 'saved';
            tip = 'Matches the saved snippet' + (typeof FirebaseSync !== 'undefined' && FirebaseSync.isSignedIn && FirebaseSync.isSignedIn() ? ' (synced)' : '');
        }
        txt.textContent = label;
        el.dataset.kind = kind;
        el.title = tip;
        $('flowSaveBtnLabel').textContent = state.snippetId ? 'Save' : 'Save to Snippets';
    };

    // ── Autosave (localStorage, one slot per chart: see Flow.store in flow-snippets.js) ─

    function scheduleAutosave() {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(autosaveNow, 250);
    }

    function autosaveNow() {
        clearTimeout(autosaveTimer);
        autosaveTimer = 0;
        Flow.store.write();
    }
    app.autosaveNow = autosaveNow;
    app.autosavePending = () => !!autosaveTimer;

    // ── Dialogs ─────────────────────────────────────────────────────────────

    app.openDialog = function (id, focusEl) {
        lastFocus = document.activeElement;
        const d = $(id);
        d.hidden = false;
        setTimeout(() => (focusEl || d.querySelector('input,select,button')).focus(), 0);
    };
    app.closeDialog = function (id) {
        const d = $(id);
        if (d.hidden) return;
        d.hidden = true;
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
        else core.viewportEl.focus({ preventScroll: true });
    };

    app.showShortcuts = function () {
        const grid = $('flowShortcutsGrid');
        if (!grid.childElementCount) {
            grid.innerHTML = Flow.interact.SHORTCUTS.map(([group, rows]) =>
                `<section><h4>${group}</h4>${rows.map(([k, d]) => `<div class="flow-sc-row"><span class="flow-sc-keys">${k.split(' / ').map(part => part.split(' + ').map(x => `<kbd>${x}</kbd>`).join('+')).join(' / ')}</span><span>${d}</span></div>`).join('')}</section>`).join('');
        }
        app.openDialog('flowShortcuts', grid.closest('.flow-dialog').querySelector('[data-close]'));
    };

    function initDialogs() {
        document.querySelectorAll('.flow-dialog-backdrop').forEach(d => {
            d.addEventListener('pointerdown', (e) => { if (e.target === d) app.closeDialog(d.id); });
            d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) app.closeDialog(d.id); });
            d.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); app.closeDialog(d.id); }
                if (e.key === 'Tab') {
                    // keep focus inside the dialog
                    const f = [...d.querySelectorAll('button:not([hidden]),input,select,[tabindex="0"]')].filter(x => x.offsetParent);
                    if (!f.length) return;
                    const i = f.indexOf(document.activeElement);
                    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
                    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
                }
            });
        });
    }

    // ── Menu ────────────────────────────────────────────────────────────────

    function initMenu() {
        const btn = $('flowMenuBtn'), menu = $('flowMenu');
        const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
        const syncChecks = () => {
            menu.querySelector('[data-action="snap"]').classList.toggle('is-checked', !!core.prefs.snap);
            menu.querySelector('[data-action="grid"]').classList.toggle('is-checked', !!core.prefs.grid);
        };
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = menu.hidden;
            menu.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) { syncChecks(); menu.querySelector('button').focus(); }
        });
        document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.flow-menu-wrap')) close(); });
        menu.addEventListener('keydown', (e) => {
            const items = [...menu.querySelectorAll('button')];
            const i = items.indexOf(document.activeElement);
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        });
        menu.addEventListener('click', (e) => {
            const b = e.target.closest('[data-action]');
            if (!b) return;
            close();
            switch (b.dataset.action) {
                case 'new': app.newChart(); break;
                case 'import': Flow.io.chooseImport(); break;
                case 'export-canvas': Flow.io.exportCanvas(); break;
                case 'export-png': Flow.io.exportPNG(); break;
                case 'export-svg': Flow.io.exportSVG(); break;
                case 'copy-png': Flow.io.copyPNG(); break;
                case 'snap': core.setPref('snap', !core.prefs.snap); break;
                case 'grid': core.setPref('grid', !core.prefs.grid); break;
                case 'shortcuts': app.showShortcuts(); break;
            }
        });
    }

    // ── Boot ────────────────────────────────────────────────────────────────

    async function boot() {
        Flow.canvas.init();
        Flow.nodes.init();
        Flow.edges.init();
        Flow.interact.init();
        Flow.panel.init();
        Flow.io.init();
        Flow.snippets.init();
        initDialogs();
        initMenu();
        $('flowHelpBtn').addEventListener('click', () => app.showShortcuts());

        const title = $('flowTitle');
        title.addEventListener('input', () => { state.title = title.value.trim() || 'Untitled chart'; scheduleAutosave(); });
        title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); title.blur(); core.viewportEl.focus({ preventScroll: true }); } });
        title.addEventListener('blur', () => { if (!title.value.trim()) title.value = state.title; });

        core.on('change', () => { scheduleAutosave(); app.refreshStatus(); });
        core.on('view', scheduleAutosave);
        window.addEventListener('beforeunload', autosaveNow);
        document.addEventListener('visibilitychange', () => { if (document.hidden) autosaveNow(); });

        // ?snippet=<id>, else this tab's chart, else the most recent one (unsaved edits always win)
        await Flow.store.boot();
        syncUrl();
        app.refreshStatus();
        core.renderNow();
        core.emit('change', { label: 'boot' });
        core._undo.length || core.emit('history');
        core.viewportEl.focus({ preventScroll: true });
        document.body.classList.add('flow-ready');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
