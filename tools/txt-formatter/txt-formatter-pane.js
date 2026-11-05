/* Txt Formatter pane behaviour.
 *
 * The transforms in funcs.js read getSourceText(): output when it has content,
 * input otherwise. That chaining is useful but was invisible, so this script
 * labels it, keeps a short undo history, and moves Copy/Reset next to the
 * result they act on.
 *
 * Every result is assigned through `output.value`, so a small setter wrapper
 * is the one place that can notice a transform no matter which function ran
 * (button, select, or a keyboard shortcut added later). */
(function () {
    "use strict";

    var input = document.getElementById("input");
    var output = document.getElementById("output");
    var undoBtn = document.getElementById("undoBtn");
    var copyBtn = document.getElementById("copyBtn");
    var resetBtn = document.getElementById("resetBtn");
    var chainNote = document.getElementById("chainNote");
    if (!input || !output || !undoBtn || !copyBtn || !resetBtn || !chainNote) return;

    var textareaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    var history = [];
    var chained = false;
    var suppressHistory = false;
    var MAX_HISTORY = 20;

    function refresh() {
        var hasResult = output.value.trim() !== "";
        undoBtn.disabled = history.length === 0;
        copyBtn.disabled = !hasResult;
        resetBtn.disabled = !hasResult;
        chainNote.hidden = !(hasResult && chained);
    }

    Object.defineProperty(output, "value", {
        configurable: true,
        get: function () { return textareaValue.get.call(this); },
        set: function (next) {
            var before = textareaValue.get.call(this);
            textareaValue.set.call(this, next);
            if (suppressHistory || before === next) return;
            history.push(before);
            if (history.length > MAX_HISTORY) history.shift();
            chained = before.trim() !== "";
            refresh();
        }
    });

    undoBtn.addEventListener("click", function () {
        if (!history.length) return;
        suppressHistory = true;
        output.value = history.pop();
        suppressHistory = false;
        chained = false;
        refresh();
        output.focus();
    });

    resetBtn.addEventListener("click", function () {
        output.value = "";
        chained = false;
        refresh();
        input.focus();
    });

    // funcs.js clears the output on every input edit; the old results are no
    // longer a meaningful undo target, so drop the history with it.
    input.addEventListener("input", function () {
        history = [];
        chained = false;
        refresh();
    });

    refresh();
})();
