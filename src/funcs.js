// Text formatter - toolbar-based UI
const output = document.getElementById('output');
const inputEl = document.getElementById('input');
const popup = document.querySelector('.copy-popup');
const separatorSelect = document.getElementById('separatorSelect');
const customSeparatorInput = document.getElementById('customSeparator');

// ========== Dropdown Management ==========

function toggleDropdown(id) {
    const dropdown = document.getElementById(id);
    const isOpen = dropdown.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) {
        dropdown.classList.add('open');
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.toolbar-group.dropdown')) {
        closeAllDropdowns();
    }
});

// Show/hide custom separator input
if (separatorSelect) {
    separatorSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customSeparatorInput.classList.remove('hidden');
            customSeparatorInput.focus();
        } else {
            customSeparatorInput.classList.add('hidden');
        }
    });
}

// ========== Source Text (auto-chaining) ==========

// If output has content, transform that (chaining). Otherwise read from input.
function getSourceText() {
    if (output.value.trim()) return output.value;
    return inputEl.value;
}

// ========== List Formatting ==========

function formatList() {
    const text = getSourceText();
    if (!text.trim()) return;

    const quoteStyle = document.getElementById('quoteStyleSelect').value;
    const parenToggle = document.getElementById('parenToggle').checked;
    let separator = separatorSelect.value;

    if (separator === 'custom') {
        separator = customSeparatorInput.value;
    } else if (separator === '\\n') {
        separator = '\n';
    } else if (separator === '\\t') {
        separator = '\t';
    }

    // Split on commas, whitespace, or newlines
    let items = text.split(/[,\s]+/).filter(item => item.trim() !== '');

    // Apply quote style
    items = items.map(item => {
        switch (quoteStyle) {
            case 'single': return `'${item}'`;
            case 'double': return `"${item}"`;
            case 'backtick': return `\`${item}\``;
            default: return item;
        }
    });

    let result = items.join(separator);

    if (parenToggle) {
        result = `(${result})`;
    }

    output.value = result;
    closeAllDropdowns();
}

// ========== Case Conversion ==========

function splitIntoWords(text) {
    // Split on spaces, underscores, hyphens, and camelCase boundaries
    return text
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[\s_\-]+/)
        .filter(w => w.length > 0);
}

function convertCase(type) {
    const text = getSourceText();
    if (!text.trim()) return;

    let result;
    switch (type) {
        case 'upper':
            result = text.toUpperCase();
            break;
        case 'lower':
            result = text.toLowerCase();
            break;
        case 'title':
            result = text.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
            break;
        case 'camel': {
            const words = splitIntoWords(text);
            result = words.map((w, i) => {
                const lower = w.toLowerCase();
                return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
            }).join('');
            break;
        }
        case 'snake': {
            const words = splitIntoWords(text);
            result = words.map(w => w.toLowerCase()).join('_');
            break;
        }
        case 'kebab': {
            const words = splitIntoWords(text);
            result = words.map(w => w.toLowerCase()).join('-');
            break;
        }
        case 'pascal': {
            const words = splitIntoWords(text);
            result = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
            break;
        }
        case 'constant': {
            const words = splitIntoWords(text);
            result = words.map(w => w.toUpperCase()).join('_');
            break;
        }
        default:
            result = text;
    }

    output.value = result;
    closeAllDropdowns();
}

// ========== Sort & Deduplicate ==========

function sortLines(direction) {
    const text = getSourceText();
    if (!text.trim()) return;

    const lines = text.split('\n').filter(l => l.trim() !== '');
    lines.sort((a, b) => {
        const cmp = a.localeCompare(b, undefined, { sensitivity: 'base' });
        return direction === 'desc' ? -cmp : cmp;
    });

    output.value = lines.join('\n');
    closeAllDropdowns();
}

function sortNumeric() {
    const text = getSourceText();
    if (!text.trim()) return;

    const lines = text.split('\n').filter(l => l.trim() !== '');
    lines.sort((a, b) => {
        const numA = parseFloat(a) || 0;
        const numB = parseFloat(b) || 0;
        return numA - numB;
    });

    output.value = lines.join('\n');
    closeAllDropdowns();
}

function removeDuplicates(andSort) {
    const text = getSourceText();
    if (!text.trim()) return;

    const lines = text.split('\n').filter(l => l.trim() !== '');
    let unique = [...new Set(lines)];

    if (andSort) {
        unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    output.value = unique.join('\n');
    closeAllDropdowns();
}

// ========== JSON Formatting ==========

function prettifyJSON() {
    const text = getSourceText();
    if (!text.trim()) return;

    try {
        const parsed = JSON.parse(text);
        output.value = JSON.stringify(parsed, null, 2);
    } catch (e) {
        output.value = 'Error: Invalid JSON — ' + e.message;
    }
    closeAllDropdowns();
}

function minifyJSON() {
    const text = getSourceText();
    if (!text.trim()) return;

    try {
        const parsed = JSON.parse(text);
        output.value = JSON.stringify(parsed);
    } catch (e) {
        output.value = 'Error: Invalid JSON — ' + e.message;
    }
    closeAllDropdowns();
}

// ========== Find & Replace ==========

function findAndReplace() {
    const text = getSourceText();
    if (!text.trim()) return;

    const findValue = document.getElementById('findInput').value;
    const replaceValue = document.getElementById('replaceInput').value;
    const useRegex = document.getElementById('regexToggle').checked;
    const caseSensitive = document.getElementById('caseSensitiveToggle').checked;

    if (!findValue) return;

    try {
        let regex;
        if (useRegex) {
            const flags = caseSensitive ? 'g' : 'gi';
            regex = new RegExp(findValue, flags);
        } else {
            const escaped = findValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const flags = caseSensitive ? 'g' : 'gi';
            regex = new RegExp(escaped, flags);
        }
        output.value = text.replace(regex, replaceValue);
    } catch (e) {
        output.value = 'Error: Invalid regex — ' + e.message;
    }
    closeAllDropdowns();
}

// ========== Trim / Clean ==========

function trimWhitespace() {
    const text = getSourceText();
    if (!text.trim()) return;
    const lines = text.split('\n');
    output.value = lines.map(l => l.trim()).join('\n');
    closeAllDropdowns();
}

function removeEmptyLines() {
    const text = getSourceText();
    if (!text.trim()) return;
    const lines = text.split('\n');
    output.value = lines.filter(l => l.trim() !== '').join('\n');
    closeAllDropdowns();
}

function removeExtraSpaces() {
    const text = getSourceText();
    if (!text.trim()) return;
    output.value = text.replace(/ {2,}/g, ' ');
    closeAllDropdowns();
}

function stripHtmlTags() {
    const text = getSourceText();
    if (!text.trim()) return;
    output.value = text.replace(/<[^>]*>/g, '');
    closeAllDropdowns();
}

function addLineNumbers() {
    const text = getSourceText();
    if (!text.trim()) return;
    const lines = text.split('\n');
    output.value = lines.map((l, i) => (i + 1) + '. ' + l).join('\n');
    closeAllDropdowns();
}

function removeLineNumbers() {
    const text = getSourceText();
    if (!text.trim()) return;
    const lines = text.split('\n');
    output.value = lines.map(l => l.replace(/^\s*\d+[\.\)\:\-]\s*/, '')).join('\n');
    closeAllDropdowns();
}

// ========== Live Stats ==========

function updateStats() {
    const text = inputEl.value;
    const charCount = text.length;
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const lineCount = text === '' ? 0 : text.split('\n').length;

    document.getElementById('charCount').textContent = charCount + ' chars';
    document.getElementById('wordCount').textContent = wordCount + ' words';
    document.getElementById('lineCount').textContent = lineCount + ' lines';
}

if (inputEl) {
    inputEl.addEventListener('input', function() {
        output.value = '';
        updateStats();
    });
    updateStats();
}

// ========== Copy & Clear ==========

function copyToClipboard() {
    if (!output.value.trim()) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(output.value).then(() => {
            showCopyPopup();
        });
    } else {
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = output.value;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        showCopyPopup();
    }
}

function showCopyPopup() {
    if (popup) {
        popup.classList.add('show');
        setTimeout(() => popup.classList.remove('show'), 2000);
    }
}

function clearOutput() {
    output.value = '';
}
