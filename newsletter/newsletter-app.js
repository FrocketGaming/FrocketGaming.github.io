// __dunder__ Review - renders a Markdown issue from newsletter/issues/ into the page.
// Issue rules (the authoring notes live in newsletter/template.md):
//   - File name is the date (2026-10-02.md); front matter has only issue_number and title.
//   - The intro is ONE paragraph before the first "##".
//   - A section whose body is only one bullet list is a links section: - [Title](url): summary
//   - Any other section body is an article (prose, ###, lists, quotes, fenced code).

const HLJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
const ISSUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const ALLOWED_FRONT_MATTER_KEYS = ['issue_number', 'title'];
const BAND_COUNT = 4;
const LINK_ENTRY_HINT = "each entry must be one line like '- [title](url): summary'";

class NewsletterApp {
    constructor() {
        this.manifest = [];
        this.highlighterPromise = null;
        this.main = null;
        this.archive = null;
        this.stamp = null;
        this.issueNav = null;
        this.jump = null;
    }

    init() {
        this.main = document.getElementById('nlMain');
        this.archive = document.getElementById('nlArchive');
        this.stamp = document.getElementById('nlStamp');
        this.issueNav = document.getElementById('nlIssueNav');
        this.configureMarked();
        this.load();
    }

    configureMarked() {
        marked.use({
            renderer: {
                // Authoring comments stay invisible; any other raw HTML is shown as text
                html: (html) => (html.trimStart().startsWith('<!--') ? '' : this.escapeHtml(html)),
                // Drop links with unsafe schemes (javascript:, data:) and keep their text
                link: (href, title, text) => (this.isSafeUrl(href) ? false : text),
                // Marked has already escaped the alt text and title; images load lazily and never block rendering
                image: (href, title, text) => {
                    if (!href || !this.isSafeUrl(href)) return text;
                    const tooltip = title ? ` title="${title}"` : '';
                    return `<img src="${href}" alt="${text}"${tooltip} loading="lazy" decoding="async">`;
                }
            }
        });
    }

    // ---------- Loading ----------

    async load() {
        const requested = new URLSearchParams(window.location.search).get('issue');
        // A direct link only needs its own file; the manifest loads alongside for the archive
        const manifestRequest = this.fetchManifest();

        try {
            if (requested !== null && !ISSUE_DATE_PATTERN.test(requested)) {
                throw new Error(`'${requested}' is not an issue date. Use ?issue=YYYY-MM-DD.`);
            }

            let date = requested;
            if (date === null) {
                await manifestRequest;
                if (!this.manifest.length) {
                    throw new Error('No issues have been published yet.');
                }
                date = this.manifest[0].date;
            }

            const [text] = await Promise.all([this.fetchIssueText(date), manifestRequest]);
            const issue = this.parseIssue(text, date);
            this.renderIssue(issue);
            this.renderArchive(date);
        } catch (error) {
            this.renderFatal(error.message);
            await manifestRequest;
            this.renderArchive(requested);
        } finally {
            this.main.setAttribute('aria-busy', 'false');
        }
    }

    async fetchManifest() {
        try {
            const response = await fetch('issues.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const entries = await response.json();
            this.manifest = entries.slice().sort((a, b) => b.date.localeCompare(a.date));
        } catch (error) {
            console.warn('Could not load the issue manifest:', error);
            this.manifest = [];
        }
    }

    async fetchIssueText(date) {
        let response;
        try {
            response = await fetch(`issues/${date}.md`);
        } catch (error) {
            throw new Error(
                'Could not load the issue. If you opened this file directly, serve the site over http instead.'
            );
        }
        if (response.status === 404) {
            throw new Error(`There is no issue dated ${date}.`);
        }
        if (!response.ok) {
            throw new Error(`Could not load the issue (HTTP ${response.status}).`);
        }
        return response.text();
    }

    // ---------- Parsing ----------

    parseIssue(rawText, date) {
        const text = rawText.replace(/\r\n?/g, '\n');
        const frontMatter = FRONT_MATTER_PATTERN.exec(text);
        if (!frontMatter) {
            throw new Error("The issue must start with a front matter block delimited by '---' lines.");
        }

        const { number, title } = this.parseFrontMatter(frontMatter[1]);
        const bodyOffset = this.countNewlines(frontMatter[0]);
        const body = text.slice(frontMatter[0].length);

        const notices = [];
        const blocks = this.splitBlocks(marked.lexer(body), bodyOffset);
        const introBlocks = [];
        const rawSections = [];
        for (const block of blocks) {
            const token = block.token;
            if (token.type === 'heading' && token.depth === 1) {
                notices.push(`line ${block.line}: use '##' for sections; the issue title comes from the front matter.`);
            } else if (token.type === 'heading' && token.depth === 2) {
                rawSections.push({ heading: token.text, line: block.line, blocks: [] });
            } else if (rawSections.length) {
                rawSections[rawSections.length - 1].blocks.push(block);
            } else {
                introBlocks.push(block);
            }
        }

        if (!rawSections.length) {
            throw new Error("The issue needs at least one '##' section.");
        }

        const intro = this.parseIntro(introBlocks, notices);
        const sections = rawSections.map((raw) => this.parseSection(raw));
        return { date, number, title, intro, sections, notices };
    }

    parseFrontMatter(source) {
        const values = {};
        for (const line of source.split('\n')) {
            if (!line.trim() || line.trimStart().startsWith('#')) continue;
            const match = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
            if (!match) {
                throw new Error(`Front matter line is not 'key: value': ${line}`);
            }
            values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, '$2');
        }

        const unknown = Object.keys(values).filter((key) => !ALLOWED_FRONT_MATTER_KEYS.includes(key));
        if (unknown.length) {
            throw new Error(`Front matter has unknown keys: ${unknown.sort().join(', ')}.`);
        }
        if (!/^\d+$/.test(values.issue_number || '')) {
            throw new Error("Front matter: 'issue_number' must be an integer.");
        }
        if (!values.title) {
            throw new Error("Front matter: 'title' must be a non-empty string.");
        }
        return { number: Number(values.issue_number), title: values.title };
    }

    splitBlocks(tokens, offset) {
        // Track the file line each top-level block starts on so errors can name it
        const blocks = [];
        let line = offset + 1;
        for (const token of tokens) {
            const isComment = token.type === 'html' && token.raw.trimStart().startsWith('<!--');
            if (token.type !== 'space' && !isComment) {
                blocks.push({ token, line });
            }
            line += this.countNewlines(token.raw);
        }
        return blocks;
    }

    parseIntro(introBlocks, notices) {
        if (!introBlocks.length) return null;
        if (introBlocks.length > 1 || introBlocks[0].token.type !== 'paragraph') {
            notices.push(
                `line ${introBlocks[0].line}: the intro (everything before the first '##') must be a single paragraph.`
            );
            return null;
        }
        const html = marked.parseInline(introBlocks[0].token.text);
        return { html, text: this.plainText(html) };
    }

    parseSection(raw) {
        const section = {
            headingHtml: marked.parseInline(raw.heading),
            kind: 'article',
            items: [],
            errors: [],
            bodyHtml: ''
        };
        const where = `line ${raw.line} (section '${raw.heading}')`;

        if (!raw.blocks.length) {
            section.kind = 'links';
            section.errors.push(`${where}: the section has no content.`);
            return section;
        }

        const first = raw.blocks[0].token;
        if (raw.blocks.length === 1 && first.type === 'list' && !first.ordered) {
            section.kind = 'links';
            this.parseLinkList(first, raw.blocks[0].line, raw.heading, section);
            return section;
        }

        section.bodyHtml = marked.parser(raw.blocks.map((block) => block.token));
        return section;
    }

    parseLinkList(list, startLine, heading, section) {
        let line = startLine;
        for (const entry of list.items) {
            try {
                section.items.push(this.parseLinkEntry(entry, `line ${line} (section '${heading}')`));
            } catch (error) {
                section.errors.push(error.message);
            }
            line += this.countNewlines(entry.raw);
        }
    }

    parseLinkEntry(entry, where) {
        const parts = entry.tokens;
        if (parts.length !== 1 || !['text', 'paragraph'].includes(parts[0].type)) {
            throw new Error(`${where}: ${LINK_ENTRY_HINT}.`);
        }

        const inline = parts[0].tokens || [];
        if (!inline.length || inline[0].type !== 'link') {
            throw new Error(`${where}: ${LINK_ENTRY_HINT}.`);
        }

        const link = inline[0];
        const url = (link.href || '').trim();
        // Marked escapes token text, so read the plain text back out of the rendered inline HTML
        const title = this.plainText(marked.parseInline(link.text)).trim();
        if (!url) throw new Error(`${where}: the link needs a URL.`);
        if (!/^https?:\/\//i.test(url)) throw new Error(`${where}: the link must be an http(s) URL.`);
        if (!title) throw new Error(`${where}: the link needs a title.`);

        const afterLink = parts[0].text.startsWith(link.raw) ? parts[0].text.slice(link.raw.length) : '';
        if (!/^\s*:/.test(afterLink)) {
            throw new Error(`${where}: expected ': summary' straight after the link.`);
        }

        const summary = afterLink.replace(/^\s*:\s*/, '').trim();
        if (!summary) throw new Error(`${where}: the summary must not be empty.`);

        return { title, url, summaryHtml: marked.parseInline(summary) };
    }

    // ---------- Rendering ----------

    renderIssue(issue) {
        const linkCount = issue.sections.reduce((sum, section) => sum + section.items.length, 0);
        const articleCount = issue.sections.filter((section) => section.kind === 'article').length;
        const number = this.pad(issue.number);

        document.title = `${issue.title} - No. ${number} - __dunder__ Review`;
        const description = document.querySelector('meta[name="description"]');
        if (description && issue.intro) description.setAttribute('content', issue.intro.text);
        this.stamp.textContent = `No. ${number}`;
        this.renderIssueNav(issue.date);

        const stats = [
            this.formatDate(issue.date),
            linkCount ? this.statHtml(linkCount, 'link') : '',
            articleCount ? this.statHtml(articleCount, 'article') : '',
            this.statHtml(issue.sections.length, 'section')
        ].filter(Boolean).join(' &middot; ');

        const notices = issue.notices
            .map((message) => `<p class="nl-error" role="alert">${this.escapeHtml(message)}</p>`)
            .join('');

        this.main.innerHTML = `
            <section class="nl-hero">
                <div class="nl-repl" aria-hidden="true">
                    <p><span class="nl-repl-prompt">&gt;&gt;&gt;</span> <span class="nl-repl-mod">__review__</span><span class="nl-repl-out">(</span><span class="nl-repl-fn">issue</span><span class="nl-repl-out">=</span><span class="nl-repl-num">${issue.number}</span><span class="nl-repl-out">)</span></p>
                    <p class="nl-repl-out">${stats}</p>
                    <p><span class="nl-repl-prompt">&gt;&gt;&gt;</span> <span class="nl-cursor"></span></p>
                </div>
                <h1 class="nl-masthead"><span class="nl-masthead-name">__dunder__</span><span class="nl-masthead-word">Review</span></h1>
                <p class="nl-issue-title">${this.escapeHtml(issue.title)}</p>
                ${issue.intro ? `<p class="nl-intro">${issue.intro.html}</p>` : ''}
            </section>
            ${notices}
            <nav class="nl-toc-block" aria-label="In this issue">
                <p class="nl-label">In this issue</p>
                <ol class="nl-toc">${issue.sections.map((section, index) => this.tocRowHtml(section, index)).join('')}</ol>
            </nav>
            ${issue.sections.map((section, index) => this.sectionHtml(section, index)).join('')}
        `;

        this.markExternalLinks();
        this.alignMasthead();
        this.addCopyButtons();
        if (this.main.querySelector('pre code')) {
            this.highlightCode();
        }
        this.renderJump(issue);
    }

    // Previous/next arrows beside the issue number; the manifest is sorted newest first
    renderIssueNav(date) {
        const prev = document.getElementById('nlPrev');
        const next = document.getElementById('nlNext');
        const hasArchive = this.manifest.length > 1;
        prev.hidden = !hasArchive;
        next.hidden = !hasArchive;

        const index = this.manifest.findIndex((entry) => entry.date === date);
        const older = index === -1 ? null : this.manifest[index + 1];
        const newer = index === -1 ? null : this.manifest[index - 1];
        this.setStep(prev, older, 'Previous issue');
        this.setStep(next, newer, 'Next issue');
        this.issueNav.hidden = false;
    }

    setStep(link, entry, label) {
        if (entry) {
            link.href = `?issue=${entry.date}`;
            link.title = `${label}: ${entry.title}`;
            link.setAttribute('aria-label', `${label}: ${entry.title}`);
            link.removeAttribute('aria-disabled');
        } else {
            link.removeAttribute('href');
            link.removeAttribute('title');
            link.setAttribute('aria-label', `${label} (none)`);
            link.setAttribute('aria-disabled', 'true');
        }
    }

    tocRowHtml(section, index) {
        return `
            <li>
                <a class="nl-toc-row" data-band="${this.bandOf(index)}" href="#section-${index + 1}">
                    <span class="nl-toc-num">${this.pad(index + 1)}</span>
                    <span class="nl-toc-name">${section.headingHtml}</span>
                    <span class="nl-toc-count">${this.sectionCount(section)}</span>
                </a>
            </li>`;
    }

    sectionHtml(section, index) {
        const errors = section.errors.length
            ? `<div class="nl-error" role="alert"><ul>${section.errors
                .map((message) => `<li>${this.escapeHtml(message)}</li>`)
                .join('')}</ul></div>`
            : '';

        const body = section.kind === 'article'
            ? `<div class="nl-section-body is-article nl-article">${section.bodyHtml}</div>`
            : `<div class="nl-section-body">
                    <ol class="nl-items">${section.items.map((item, i) => this.itemHtml(item, i)).join('')}</ol>
                    ${errors}
               </div>`;

        return `
            <section class="nl-section" id="section-${index + 1}" data-band="${this.bandOf(index)}">
                <div class="nl-band">
                    <div>
                        <p class="nl-kicker">${this.sectionCount(section, true)}</p>
                        <h2 class="nl-band-heading">${section.headingHtml}</h2>
                    </div>
                    <div class="nl-band-number" aria-hidden="true">${this.pad(index + 1)}</div>
                </div>
                ${body}
            </section>`;
    }

    itemHtml(item, index) {
        const url = this.escapeHtml(item.url);
        return `
            <li class="nl-item">
                <span class="nl-item-num" aria-hidden="true">${this.pad(index + 1)}</span>
                <div class="nl-item-body">
                    <h3 class="nl-item-title"><a href="${url}"><span class="nl-item-label">${this.escapeHtml(item.title)}</span>&nbsp;<span class="nl-item-arrow" aria-hidden="true">&#8599;</span></a></h3>
                    <p class="nl-item-summary">${item.summaryHtml}</p>
                    <p class="nl-chip-row"><span class="nl-chip"><span class="nl-chip-dot" aria-hidden="true">&#9679;</span>&nbsp;<a href="${url}">${this.escapeHtml(this.domainOf(item.url))}</a></span></p>
                </div>
            </li>`;
    }

    renderArchive(currentDate) {
        if (!this.manifest.length) {
            this.archive.hidden = true;
            return;
        }

        const rows = this.manifest.map((entry, index) => {
            const current = entry.date === currentDate ? ' aria-current="page"' : '';
            const intro = entry.intro ? `<span class="nl-archive-intro">${this.escapeHtml(entry.intro)}</span>` : '';
            return `
                <li>
                    <a class="nl-toc-row" data-band="${this.bandOf(index)}" href="?issue=${this.escapeHtml(entry.date)}"${current}>
                        <span class="nl-toc-num">${this.pad(entry.number)}</span>
                        <span class="nl-toc-name">
                            <span class="nl-archive-title">${this.escapeHtml(entry.title)}</span>
                            ${intro}
                        </span>
                        <span class="nl-toc-count">${this.escapeHtml(entry.date)}</span>
                    </a>
                </li>`;
        });

        this.archive.innerHTML = `<p class="nl-label">Archive</p><ol class="nl-toc">${rows.join('')}</ol>`;
        this.archive.hidden = false;
    }

    renderFatal(message) {
        this.main.innerHTML = `<p class="nl-error" role="alert">${this.escapeHtml(message)}</p>`;
    }

    // ---------- Section navigation ----------
    // A rail beside the column on wide screens, a floating button + panel on narrow ones.
    // It is visible as soon as the issue renders.

    renderJump(issue) {
        if (!this.jump) this.buildJump();

        const past = this.manifest.length > 1 ? `
            <li>
                <a class="nl-jump-link is-archive" href="#nlArchive">
                    <span class="nl-jump-num"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></span>
                    <span class="nl-jump-name">Past issues</span>
                </a>
            </li>` : '';

        this.jump.querySelector('.nl-jump-list').innerHTML = issue.sections.map((section, index) => `
            <li>
                <a class="nl-jump-link" data-band="${this.bandOf(index)}" href="#section-${index + 1}">
                    <span class="nl-jump-num">${this.pad(index + 1)}</span>
                    <span class="nl-jump-name">${section.headingHtml}</span>
                </a>
            </li>`).join('') + past;

        this.observeSections();
        // Fade in on the next frame so the opacity transition runs
        requestAnimationFrame(() => this.jump.classList.add('is-visible'));
    }

    buildJump() {
        this.jump = document.createElement('nav');
        this.jump.className = 'nl-jump';
        this.jump.setAttribute('aria-label', 'Jump to section');
        this.jump.innerHTML = `
            <button type="button" class="nl-jump-toggle" aria-expanded="false" aria-controls="nlJumpPanel">
                <i class="fa-solid fa-list" aria-hidden="true"></i> Sections
            </button>
            <div class="nl-jump-panel" id="nlJumpPanel">
                <p class="nl-label">On this page</p>
                <ol class="nl-toc nl-jump-list"></ol>
            </div>`;
        document.body.appendChild(this.jump);

        const toggle = this.jump.querySelector('.nl-jump-toggle');
        toggle.addEventListener('click', () => this.setJumpOpen(!this.jump.classList.contains('is-open')));
        this.jump.querySelector('.nl-jump-list').addEventListener('click', () => this.setJumpOpen(false));
        document.addEventListener('click', (event) => {
            if (!this.jump.contains(event.target)) this.setJumpOpen(false);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.jump.classList.contains('is-open')) {
                this.setJumpOpen(false);
                toggle.focus();
            }
        });
    }

    setJumpOpen(open) {
        this.jump.classList.toggle('is-open', open);
        this.jump.querySelector('.nl-jump-toggle').setAttribute('aria-expanded', String(open));
    }

    observeSections() {
        const sections = [...this.main.querySelectorAll('.nl-section')];
        const links = [...this.jump.querySelectorAll('.nl-jump-link')];
        const inBand = new Set();

        // Highlight the lowest section touching the band between the header and 45% down the viewport
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const index = sections.indexOf(entry.target);
                if (entry.isIntersecting) inBand.add(index);
                else inBand.delete(index);
            });
            if (!inBand.size) return;
            const active = Math.max(...inBand);
            links.forEach((link, index) => {
                if (index === active) link.setAttribute('aria-current', 'true');
                else link.removeAttribute('aria-current');
            });
        }, { rootMargin: '-150px 0px -55% 0px' });
        sections.forEach((section) => sectionObserver.observe(section));
    }

    // ---------- Masthead alignment ----------
    // The underscore and the "R" have different left side-bearings, and how much they differ depends on the
    // font build and the display scale. So measure the real ink edges in the font actually in use and nudge
    // the second line so its "R" starts exactly under the first line's underscore.

    alignMasthead() {
        const heading = this.main.querySelector('.nl-masthead');
        if (!heading) return;

        const style = getComputedStyle(heading);
        const fontPx = parseFloat(style.fontSize);
        const font = `${style.fontWeight} ${fontPx}px ${style.fontFamily}`;
        const first = heading.querySelector('.nl-masthead-name').textContent.charAt(0);
        const second = heading.querySelector('.nl-masthead-word').textContent.charAt(0);

        const align = () => {
            const shift = this.inkLeft(first, style, fontPx) - this.inkLeft(second, style, fontPx);
            heading.style.setProperty('--nl-masthead-shift', `${(shift / fontPx).toFixed(4)}em`);
        };

        // Measure only once the web font is loaded; if loading fails the default (no shift) stays
        if (document.fonts && document.fonts.load) {
            document.fonts.load(font, first + second).then(align, () => {});
        } else {
            align();
        }
    }

    // Distance from a glyph's origin to its leftmost painted pixel, in CSS px, measured at 8x for precision
    inkLeft(glyph, style, fontPx) {
        const scale = 8;
        const size = fontPx * scale;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(size * 1.6);
        canvas.height = Math.ceil(size * 1.6);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
        const origin = Math.round(size * 0.3);
        context.fillText(glyph, origin, Math.round(size * 1.1));

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width;
        for (let row = 0; row < canvas.height; row++) {
            for (let column = 0; column < left; column++) {
                if (pixels[(row * canvas.width + column) * 4 + 3] > 127) {
                    left = column;
                    break;
                }
            }
        }
        return (left - origin) / scale;
    }

    // ---------- External links ----------
    // Links leaving the site open in a new tab so readers keep their place; internal links stay in the tab.

    markExternalLinks() {
        this.main.querySelectorAll('a[href]').forEach((link) => {
            let url;
            try {
                url = new URL(link.getAttribute('href'), window.location.href);
            } catch (error) {
                return;
            }
            const isWeb = url.protocol === 'http:' || url.protocol === 'https:';
            if (!isWeb || url.origin === window.location.origin) return;

            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const hint = document.createElement('span');
            hint.className = 'nl-sr';
            hint.textContent = ' (opens in a new tab)';
            link.appendChild(hint);
        });
    }

    // ---------- Code copy buttons ----------
    // Each block is wrapped so the button stays put while a long line scrolls sideways inside the <pre>.

    addCopyButtons() {
        this.main.querySelectorAll('.nl-article pre').forEach((pre) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'nl-code';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'nl-copy';
            button.setAttribute('aria-label', 'Copy code to clipboard');
            button.innerHTML = '<i class="fa-solid fa-copy" aria-hidden="true"></i><span class="nl-copy-label" aria-live="polite">Copy</span>';
            button.addEventListener('click', () => this.copyCode(pre, button));
            wrapper.appendChild(button);
        });
    }

    async copyCode(pre, button) {
        const code = (pre.querySelector('code') || pre).textContent.replace(/\n$/, '');
        this.flashCopy(button, await this.writeClipboard(code));
    }

    async writeClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            // No async clipboard (insecure context) or permission denied: fall back to a selection copy
            const field = document.createElement('textarea');
            field.value = text;
            field.setAttribute('readonly', '');
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            let copied = false;
            try {
                copied = document.execCommand('copy');
            } catch (fallbackError) {
                copied = false;
            }
            field.remove();
            return copied;
        }
    }

    flashCopy(button, copied) {
        const label = button.querySelector('.nl-copy-label');
        const icon = button.querySelector('i');
        label.textContent = copied ? 'Copied' : 'Copy failed';
        icon.className = copied ? 'fa-solid fa-check' : 'fa-solid fa-triangle-exclamation';
        button.classList.toggle('is-copied', copied);
        button.classList.toggle('is-failed', !copied);

        clearTimeout(button.resetTimer);
        button.resetTimer = setTimeout(() => {
            label.textContent = 'Copy';
            icon.className = 'fa-solid fa-copy';
            button.classList.remove('is-copied', 'is-failed');
        }, 1800);
    }

    // ---------- Syntax highlighting ----------

    highlightCode() {
        this.loadHighlighter()
            .then(() => {
                this.main.querySelectorAll('pre code').forEach((block) => window.hljs.highlightElement(block));
            })
            .catch((error) => console.warn('Syntax highlighting is unavailable:', error));
    }

    loadHighlighter() {
        if (window.hljs) return Promise.resolve();
        if (!this.highlighterPromise) {
            this.highlighterPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = HLJS_URL;
                script.onload = resolve;
                script.onerror = () => reject(new Error('Highlight.js failed to load'));
                document.head.appendChild(script);
            });
        }
        return this.highlighterPromise;
    }

    // ---------- Helpers ----------

    bandOf(index) {
        return (index % BAND_COUNT) + 1;
    }

    pad(value, width = 2) {
        return String(value).padStart(width, '0');
    }

    plural(count, word) {
        return `${count} ${word}${count === 1 ? '' : 's'}`;
    }

    statHtml(count, word) {
        return `<span class="nl-repl-stat"><span class="nl-repl-val">${count}</span>&nbsp;${word}${count === 1 ? '' : 's'}</span>`;
    }

    sectionCount(section, capitalize = false) {
        if (section.kind === 'article') return capitalize ? 'Article' : 'article';
        return this.plural(section.items.length, 'link');
    }

    formatDate(date) {
        return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    domainOf(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch (error) {
            return url;
        }
    }

    // Relative paths and #anchors are fine; a scheme other than http(s)/mailto (javascript:, data:) is not
    isSafeUrl(url) {
        const scheme = /^([a-z][a-z0-9+.-]*):/i.exec((url || '').trim());
        return !scheme || ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase());
    }

    countNewlines(text) {
        return (text.match(/\n/g) || []).length;
    }

    plainText(html) {
        const holder = document.createElement('div');
        holder.innerHTML = html;
        return holder.textContent;
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

document.addEventListener('DOMContentLoaded', () => new NewsletterApp().init());
