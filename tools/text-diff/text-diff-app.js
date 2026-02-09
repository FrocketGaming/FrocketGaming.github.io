(function () {
    'use strict';

    // DOM elements
    const originalText = document.getElementById('originalText');
    const modifiedText = document.getElementById('modifiedText');
    const compareBtn = document.getElementById('compareBtn');
    const swapBtn = document.getElementById('swapBtn');
    const clearBtn = document.getElementById('clearBtn');
    const unifiedBtn = document.getElementById('unifiedBtn');
    const sideBySideBtn = document.getElementById('sideBySideBtn');
    const ignoreWhitespace = document.getElementById('ignoreWhitespace');
    const ignoreCase = document.getElementById('ignoreCase');
    const diffStats = document.getElementById('diffStats');
    const diffOutput = document.getElementById('diffOutput');

    let currentOps = null;
    let viewMode = 'unified';

    // --- Diff Algorithm (LCS-based) ---

    function preprocessLine(line) {
        let processed = line;
        if (ignoreWhitespace.checked) {
            processed = processed.replace(/\s+/g, ' ').trim();
        }
        if (ignoreCase.checked) {
            processed = processed.toLowerCase();
        }
        return processed;
    }

    function lcs(a, b) {
        const n = a.length;
        const m = b.length;
        // Build DP table
        const table = [];
        for (let i = 0; i <= n; i++) {
            table[i] = new Array(m + 1).fill(0);
        }
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (preprocessLine(a[i - 1]) === preprocessLine(b[j - 1])) {
                    table[i][j] = table[i - 1][j - 1] + 1;
                } else {
                    table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
                }
            }
        }
        return table;
    }

    function backtrackLCS(table, a, b) {
        const ops = [];
        let i = a.length;
        let j = b.length;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && preprocessLine(a[i - 1]) === preprocessLine(b[j - 1])) {
                ops.push({ type: 'equal', oldLine: i, newLine: j, text: a[i - 1] });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
                ops.push({ type: 'add', newLine: j, text: b[j - 1] });
                j--;
            } else {
                ops.push({ type: 'remove', oldLine: i, text: a[i - 1] });
                i--;
            }
        }

        return ops.reverse();
    }

    function computeDiff() {
        const a = originalText.value.split('\n');
        const b = modifiedText.value.split('\n');
        const table = lcs(a, b);
        return backtrackLCS(table, a, b);
    }

    // --- HTML Escaping ---

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    // --- Word-Level Diff ---

    function diffWords(oldLine, newLine) {
        const oldWords = oldLine.split(/(\s+)/);
        const newWords = newLine.split(/(\s+)/);

        // LCS on word arrays
        const n = oldWords.length;
        const m = newWords.length;
        const table = [];
        for (let i = 0; i <= n; i++) {
            table[i] = new Array(m + 1).fill(0);
        }
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (oldWords[i - 1] === newWords[j - 1]) {
                    table[i][j] = table[i - 1][j - 1] + 1;
                } else {
                    table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
                }
            }
        }

        // Backtrack to get word-level ops
        let i = n, j = m;
        const oldOps = [];
        const newOps = [];

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
                oldOps.push({ text: oldWords[i - 1], changed: false });
                newOps.push({ text: newWords[j - 1], changed: false });
                i--; j--;
            } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
                newOps.push({ text: newWords[j - 1], changed: true });
                j--;
            } else {
                oldOps.push({ text: oldWords[i - 1], changed: true });
                i--;
            }
        }

        oldOps.reverse();
        newOps.reverse();

        return { oldWords: oldOps, newWords: newOps };
    }

    function renderWordHighlightedContent(wordOps) {
        let html = '';
        for (const w of wordOps) {
            if (w.changed) {
                html += '<span class="word-changed">' + escapeHtml(w.text) + '</span>';
            } else {
                html += escapeHtml(w.text);
            }
        }
        return html;
    }

    // Group consecutive remove+add ops into pairs for word-level highlighting
    function groupOpsWithPairs(ops) {
        const grouped = [];
        let i = 0;
        while (i < ops.length) {
            if (ops[i].type === 'remove') {
                // Collect consecutive removes
                const removes = [];
                while (i < ops.length && ops[i].type === 'remove') {
                    removes.push(ops[i]);
                    i++;
                }
                // Collect consecutive adds
                const adds = [];
                while (i < ops.length && ops[i].type === 'add') {
                    adds.push(ops[i]);
                    i++;
                }
                // Pair them up
                const pairCount = Math.min(removes.length, adds.length);
                for (let p = 0; p < pairCount; p++) {
                    grouped.push({ type: 'modify', remove: removes[p], add: adds[p] });
                }
                // Leftover removes
                for (let p = pairCount; p < removes.length; p++) {
                    grouped.push(removes[p]);
                }
                // Leftover adds
                for (let p = pairCount; p < adds.length; p++) {
                    grouped.push(adds[p]);
                }
            } else {
                grouped.push(ops[i]);
                i++;
            }
        }
        return grouped;
    }

    // --- Rendering ---

    function renderUnifiedDiff(ops) {
        const grouped = groupOpsWithPairs(ops);
        let html = '<div class="diff-unified">';
        for (const op of grouped) {
            if (op.type === 'equal') {
                html += '<div class="diff-line">';
                html += '<span class="diff-line-number">' + op.oldLine + '</span>';
                html += '<span class="diff-line-number">' + op.newLine + '</span>';
                html += '<span class="diff-line-prefix">&nbsp;</span>';
                html += '<span class="diff-line-content">' + escapeHtml(op.text) + '</span>';
                html += '</div>';
            } else if (op.type === 'modify') {
                const wordDiff = diffWords(op.remove.text, op.add.text);
                html += '<div class="diff-line removed">';
                html += '<span class="diff-line-number">' + op.remove.oldLine + '</span>';
                html += '<span class="diff-line-number"></span>';
                html += '<span class="diff-line-prefix">-</span>';
                html += '<span class="diff-line-content">' + renderWordHighlightedContent(wordDiff.oldWords) + '</span>';
                html += '</div>';
                html += '<div class="diff-line added">';
                html += '<span class="diff-line-number"></span>';
                html += '<span class="diff-line-number">' + op.add.newLine + '</span>';
                html += '<span class="diff-line-prefix">+</span>';
                html += '<span class="diff-line-content">' + renderWordHighlightedContent(wordDiff.newWords) + '</span>';
                html += '</div>';
            } else if (op.type === 'remove') {
                html += '<div class="diff-line removed">';
                html += '<span class="diff-line-number">' + op.oldLine + '</span>';
                html += '<span class="diff-line-number"></span>';
                html += '<span class="diff-line-prefix">-</span>';
                html += '<span class="diff-line-content">' + escapeHtml(op.text) + '</span>';
                html += '</div>';
            } else if (op.type === 'add') {
                html += '<div class="diff-line added">';
                html += '<span class="diff-line-number"></span>';
                html += '<span class="diff-line-number">' + op.newLine + '</span>';
                html += '<span class="diff-line-prefix">+</span>';
                html += '<span class="diff-line-content">' + escapeHtml(op.text) + '</span>';
                html += '</div>';
            }
        }
        html += '</div>';
        return html;
    }

    function renderSideBySideDiff(ops) {
        const grouped = groupOpsWithPairs(ops);
        // Build paired rows for alignment
        const rows = [];
        for (const op of grouped) {
            if (op.type === 'equal') {
                rows.push({
                    left: { num: op.oldLine, text: op.text, type: 'equal' },
                    right: { num: op.newLine, text: op.text, type: 'equal' }
                });
            } else if (op.type === 'modify') {
                const wordDiff = diffWords(op.remove.text, op.add.text);
                rows.push({
                    left: { num: op.remove.oldLine, html: renderWordHighlightedContent(wordDiff.oldWords), type: 'removed' },
                    right: { num: op.add.newLine, html: renderWordHighlightedContent(wordDiff.newWords), type: 'added' }
                });
            } else if (op.type === 'remove') {
                rows.push({
                    left: { num: op.oldLine, text: op.text, type: 'removed' },
                    right: null
                });
            } else if (op.type === 'add') {
                rows.push({
                    left: null,
                    right: { num: op.newLine, text: op.text, type: 'added' }
                });
            }
        }

        let leftHtml = '';
        let rightHtml = '';
        for (const row of rows) {
            if (row.left) {
                const cls = row.left.type === 'removed' ? ' removed' : '';
                leftHtml += '<div class="diff-line' + cls + '">';
                leftHtml += '<span class="diff-line-number">' + row.left.num + '</span>';
                leftHtml += '<span class="diff-line-content">' + (row.left.html !== undefined ? row.left.html : escapeHtml(row.left.text)) + '</span>';
                leftHtml += '</div>';
            } else {
                leftHtml += '<div class="diff-line filler"><span class="diff-line-number"></span><span class="diff-line-content">&nbsp;</span></div>';
            }
            if (row.right) {
                const cls = row.right.type === 'added' ? ' added' : '';
                rightHtml += '<div class="diff-line' + cls + '">';
                rightHtml += '<span class="diff-line-number">' + row.right.num + '</span>';
                rightHtml += '<span class="diff-line-content">' + (row.right.html !== undefined ? row.right.html : escapeHtml(row.right.text)) + '</span>';
                rightHtml += '</div>';
            } else {
                rightHtml += '<div class="diff-line filler"><span class="diff-line-number"></span><span class="diff-line-content">&nbsp;</span></div>';
            }
        }

        let html = '<div class="diff-side-by-side">';
        html += '<div class="diff-side-panel" id="diffLeftPanel">' + leftHtml + '</div>';
        html += '<div class="diff-side-panel" id="diffRightPanel">' + rightHtml + '</div>';
        html += '</div>';
        return html;
    }

    function renderStats(ops) {
        let added = 0, removed = 0, unchanged = 0;
        for (const op of ops) {
            if (op.type === 'add') added++;
            else if (op.type === 'remove') removed++;
            else unchanged++;
        }
        diffStats.innerHTML =
            '<span class="diff-stat diff-stat-added"><i class="fa-solid fa-plus"></i> ' + added + ' addition' + (added !== 1 ? 's' : '') + '</span>' +
            '<span class="diff-stat diff-stat-removed"><i class="fa-solid fa-minus"></i> ' + removed + ' deletion' + (removed !== 1 ? 's' : '') + '</span>' +
            '<span class="diff-stat diff-stat-unchanged"><i class="fa-solid fa-equals"></i> ' + unchanged + ' unchanged</span>';
    }

    function renderDiff() {
        if (!currentOps) return;
        if (viewMode === 'unified') {
            diffOutput.innerHTML = renderUnifiedDiff(currentOps);
        } else {
            diffOutput.innerHTML = renderSideBySideDiff(currentOps);
            syncScroll();
        }
    }

    // --- Synchronized Scrolling (side-by-side) ---

    function syncScroll() {
        const left = document.getElementById('diffLeftPanel');
        const right = document.getElementById('diffRightPanel');
        if (!left || !right) return;

        let syncing = false;
        left.addEventListener('scroll', function () {
            if (syncing) return;
            syncing = true;
            right.scrollTop = left.scrollTop;
            syncing = false;
        });
        right.addEventListener('scroll', function () {
            if (syncing) return;
            syncing = true;
            left.scrollTop = right.scrollTop;
            syncing = false;
        });
    }

    // --- Event Handlers ---

    compareBtn.addEventListener('click', function () {
        currentOps = computeDiff();
        renderStats(currentOps);
        renderDiff();
    });

    swapBtn.addEventListener('click', function () {
        const tmp = originalText.value;
        originalText.value = modifiedText.value;
        modifiedText.value = tmp;
    });

    clearBtn.addEventListener('click', function () {
        originalText.value = '';
        modifiedText.value = '';
        diffStats.innerHTML = '';
        diffOutput.innerHTML = '';
        currentOps = null;
    });

    unifiedBtn.addEventListener('click', function () {
        viewMode = 'unified';
        unifiedBtn.classList.add('active');
        sideBySideBtn.classList.remove('active');
        renderDiff();
    });

    sideBySideBtn.addEventListener('click', function () {
        viewMode = 'side-by-side';
        sideBySideBtn.classList.add('active');
        unifiedBtn.classList.remove('active');
        renderDiff();
    });
})();
