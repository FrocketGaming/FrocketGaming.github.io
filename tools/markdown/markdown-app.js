class MarkdownApp {
    constructor() {
        this.input = document.getElementById('markdownInput');
        this.preview = document.getElementById('previewContent');
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.input.addEventListener('input', () => this.renderPreview());

        document.querySelectorAll('.markdown-toolbar .toolbar-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.insertMarkdown(btn.dataset.syntax);
            });
        });
    }

    renderPreview() {
        const text = this.input.value;
        if (!text.trim()) {
            this.preview.innerHTML = '<p class="preview-placeholder">Preview will appear here...</p>';
            return;
        }
        this.preview.innerHTML = this.parseMarkdown(text);
    }

    parseMarkdown(text) {
        // Step 1: Protect code blocks
        const codeBlocks = [];
        text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const placeholder = `%%CODEBLOCK_${codeBlocks.length}%%`;
            const escaped = this.escapeHtml(code.replace(/\n$/, ''));
            codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
            return placeholder;
        });

        // Protect inline code
        const inlineCodes = [];
        text = text.replace(/`([^`\n]+)`/g, (match, code) => {
            const placeholder = `%%INLINECODE_${inlineCodes.length}%%`;
            inlineCodes.push(`<code>${this.escapeHtml(code)}</code>`);
            return placeholder;
        });

        // Step 2: Block-level transforms
        const lines = text.split('\n');
        let html = '';
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Horizontal rule
            if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
                html += '<hr>';
                i++;
                continue;
            }

            // Headings
            const headingMatch = line.match(/^(#{1,6})\s(.*)$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const content = this.parseInline(headingMatch[2]);
                html += `<h${level}>${content}</h${level}>`;
                i++;
                continue;
            }

            // Blockquote
            if (line.startsWith('> ')) {
                let quoteLines = [];
                while (i < lines.length && lines[i].startsWith('> ')) {
                    quoteLines.push(lines[i].substring(2));
                    i++;
                }
                const quoteContent = quoteLines.map(l => `<p>${this.parseInline(l)}</p>`).join('');
                html += `<blockquote>${quoteContent}</blockquote>`;
                continue;
            }

            // Table
            if (line.includes('|') && i + 1 < lines.length && /^\|?[\s\-:|]+\|?$/.test(lines[i + 1])) {
                let tableLines = [];
                let j = i;
                while (j < lines.length && lines[j].includes('|')) {
                    tableLines.push(lines[j]);
                    j++;
                }
                if (tableLines.length >= 2) {
                    html += this.parseTable(tableLines);
                    i = j;
                    continue;
                }
            }

            // Unordered list
            if (/^[\-\*]\s+/.test(line)) {
                let listItems = [];
                while (i < lines.length && /^[\-\*]\s+/.test(lines[i])) {
                    listItems.push(lines[i].replace(/^[\-\*]\s+/, ''));
                    i++;
                }
                html += '<ul>' + listItems.map(item => `<li>${this.parseInline(item)}</li>`).join('') + '</ul>';
                continue;
            }

            // Ordered list
            if (/^\d+\.\s+/.test(line)) {
                let listItems = [];
                while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
                    listItems.push(lines[i].replace(/^\d+\.\s+/, ''));
                    i++;
                }
                html += '<ol>' + listItems.map(item => `<li>${this.parseInline(item)}</li>`).join('') + '</ol>';
                continue;
            }

            // Code block placeholder pass-through
            if (/^%%CODEBLOCK_\d+%%$/.test(line.trim())) {
                html += line.trim();
                i++;
                continue;
            }

            // Empty line
            if (line.trim() === '') {
                i++;
                continue;
            }

            // Paragraph
            let paraLines = [];
            while (i < lines.length && lines[i].trim() !== '' && !/^#{1,6}\s/.test(lines[i]) && !/^[>\-\*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !/^(-{3,}|_{3,}|\*{3,})\s*$/.test(lines[i]) && !/^%%CODEBLOCK_\d+%%$/.test(lines[i].trim())) {
                paraLines.push(lines[i]);
                i++;
            }
            if (paraLines.length > 0) {
                html += `<p>${this.parseInline(paraLines.join('<br>'))}</p>`;
            } else {
                i++;
            }
        }

        // Step 3: Restore code blocks
        codeBlocks.forEach((block, idx) => {
            html = html.replace(`%%CODEBLOCK_${idx}%%`, block);
        });

        // Restore inline code
        inlineCodes.forEach((code, idx) => {
            html = html.replace(`%%INLINECODE_${idx}%%`, code);
        });

        return html;
    }

    parseInline(text) {
        // Images (before links)
        text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

        // Links
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Bold
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

        // Italic
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        text = text.replace(/_(.+?)_/g, '<em>$1</em>');

        // Strikethrough
        text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

        return text;
    }

    parseTable(tableLines) {
        const parseRow = (line) => {
            return line.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
        };

        const headers = parseRow(tableLines[0]);
        // tableLines[1] is the separator row, skip it
        const rows = tableLines.slice(2).map(parseRow);

        let tableHtml = '<table><thead><tr>';
        headers.forEach(h => {
            tableHtml += `<th>${this.parseInline(h)}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
        rows.forEach(row => {
            tableHtml += '<tr>';
            row.forEach(cell => {
                tableHtml += `<td>${this.parseInline(cell)}</td>`;
            });
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>';
        return tableHtml;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    insertMarkdown(syntax) {
        const start = this.input.selectionStart;
        const end = this.input.selectionEnd;
        const selected = this.input.value.substring(start, end);
        let insertion = '';
        let cursorOffset = 0;

        switch (syntax) {
            case 'heading1':
                insertion = `# ${selected || 'Heading 1'}`;
                cursorOffset = selected ? insertion.length : 2;
                break;
            case 'heading2':
                insertion = `## ${selected || 'Heading 2'}`;
                cursorOffset = selected ? insertion.length : 3;
                break;
            case 'bold':
                insertion = `**${selected || 'bold text'}**`;
                cursorOffset = selected ? insertion.length : 2;
                break;
            case 'italic':
                insertion = `*${selected || 'italic text'}*`;
                cursorOffset = selected ? insertion.length : 1;
                break;
            case 'link':
                insertion = `[${selected || 'link text'}](url)`;
                cursorOffset = selected ? insertion.length : 1;
                break;
            case 'image':
                insertion = `![${selected || 'alt text'}](url)`;
                cursorOffset = selected ? insertion.length : 2;
                break;
            case 'code':
                insertion = '`' + (selected || 'code') + '`';
                cursorOffset = selected ? insertion.length : 1;
                break;
            case 'codeblock':
                insertion = '```\n' + (selected || 'code here') + '\n```';
                cursorOffset = selected ? insertion.length : 4;
                break;
            case 'list':
                insertion = `- ${selected || 'list item'}`;
                cursorOffset = selected ? insertion.length : 2;
                break;
            case 'olist':
                insertion = `1. ${selected || 'list item'}`;
                cursorOffset = selected ? insertion.length : 3;
                break;
            case 'blockquote':
                insertion = `> ${selected || 'quote'}`;
                cursorOffset = selected ? insertion.length : 2;
                break;
            case 'hr':
                insertion = '\n---\n';
                cursorOffset = insertion.length;
                break;
        }

        this.input.value = this.input.value.substring(0, start) + insertion + this.input.value.substring(end);
        this.input.focus();
        const newPos = start + cursorOffset;
        this.input.setSelectionRange(newPos, selected ? newPos : newPos + (insertion.length - cursorOffset));
        this.renderPreview();
    }
}

const markdownApp = new MarkdownApp();
