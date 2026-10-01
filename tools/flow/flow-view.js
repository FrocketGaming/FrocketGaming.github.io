/**
 * P12 - View only: a read-only way to show a chart. The editing chrome (tools, panel, undo, save,
 * side dots, selection) is hidden; dragging anywhere pans, the wheel zooms, and find, minimap,
 * fit and export still work. Toggled from the menu, the eye pill or Alt+V; `?view=1` opens a chart
 * in it. Nothing can change the document meanwhile: `core.change` refuses (core.viewOnly), and the
 * gestures that would start an edit (pointer, double-click, keys, paste, drop) are not reached.
 */
(function () {
    'use strict';
    const Flow = window.Flow;
    const core = Flow.core;
    const $ = (id) => document.getElementById(id);

    const view = Flow.view = {};
    let lastNag = 0;

    view.init = function () {
        // Above everything else (editors finish at 2000, pan at 1000): in view mode every press pans.
        core.addPointerHandler(3000, (e, hit) => {
            if (!core.viewOnly) return false;
            if (hit.kind === 'ui') return true;   // its own click still runs (a link card's open button)
            if (e.button === 0 || e.button === 1) Flow.canvas.startPan(e);
            return true;
        });
        core.on('blocked', () => {
            const now = Date.now();
            if (now - lastNag < 2500) return;
            lastNag = now;
            core.toast('View only · Alt+V to edit');
        });
        document.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || Flow.canvas.isTyping(e) || document.querySelector('.flow-dialog-backdrop:not([hidden])')) return;
            if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyV') { e.preventDefault(); view.toggle(); }
        }, true);
        $('flowViewExit').addEventListener('click', () => view.set(false));
        if (new URLSearchParams(location.search).get('view') === '1') view.set(true, { quiet: true });
    };

    view.isOn = () => !!core.viewOnly;
    view.toggle = () => view.set(!core.viewOnly);

    view.set = function (on, opts) {
        on = !!on;
        if (on === !!core.viewOnly) return;
        if (on) {
            Flow.interact.finishEditing();
            if (core.tool !== 'select') core.setTool('select');
            core.clearSelection();
            Flow.edges.hidePorts();
        }
        core.viewOnly = on;
        document.body.classList.toggle('flow-view-only', on);
        $('flowViewBar').hidden = !on;
        syncUrl(on);
        core.emit('viewonly', on);
        core.invalidate('all');
        if (!(opts && opts.quiet)) core.toast(on ? 'View only · drag to pan · Alt+V to edit' : 'Editing');
    };

    /** Keep ?view=1 in the address while viewing, so a reload or a bookmark opens the same way. */
    function syncUrl(on) {
        try {
            const url = new URL(location.href);
            if (on) url.searchParams.set('view', '1'); else url.searchParams.delete('view');
            history.replaceState(null, '', url);
        } catch (e) { /* ignore */ }
    }
})();
