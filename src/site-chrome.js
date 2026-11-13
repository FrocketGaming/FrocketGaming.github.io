/* Shared site chrome.
 *
 * 1. Command palette: Ctrl/Cmd+K (Ctrl/Cmd+Shift+P on Notes, which owns Ctrl+K).
 *    It switches tools, runs a few actions, and searches local notes, tasks,
 *    snippets and projects, deep-linking straight to the record.
 * 2. Nav polish: native tooltips and aria-current on the rail.
 * 3. A skip link and a visually hidden page heading.
 *
 * Loaded once per page with a single <script> tag; the stylesheet and palette
 * markup are injected here so pages do not need to repeat them. */
(function () {
    "use strict";

    var script = document.currentScript;
    if (!script) return;
    var siteRoot = new URL("../", script.src).href;

    var TOOLS = [
        { slug: "txt-formatter", name: "Txt Formatter", icon: "fa-font", desc: "Transform text: lists, case, JSON, find & replace", keys: "text case json format list sort" },
        { slug: "snippets", name: "Snippets", icon: "fa-code", desc: "Store and search code snippets", keys: "code snippet library" },
        { slug: "todo", name: "To-Do List", icon: "fa-list-check", desc: "Tasks with categories, priorities and deadlines", keys: "task todo list" },
        { slug: "notes", name: "Notes", icon: "fa-note-sticky", desc: "Markdown notes with tags and sync", keys: "markdown note writing" },
        { slug: "flow", name: "Flow", icon: "fa-diagram-project", desc: "Flowcharts on an infinite canvas", keys: "diagram flowchart canvas" },
        { slug: "regex-tester", name: "Regex Tester", icon: "fa-asterisk", desc: "Test regular expressions with match details", keys: "regex pattern" },
        { slug: "image-editor", name: "Image Editor", icon: "fa-image", desc: "Annotate, crop, resize and redact images", keys: "image annotation screenshot" },
        { slug: "cron-builder", name: "Cron Builder", icon: "fa-calendar-days", desc: "Build cron expressions with next-run preview", keys: "cron schedule" },
        { slug: "timezone", name: "Timezone", icon: "fa-globe", desc: "Compare times across timezones", keys: "timezone time meeting" },
        { slug: "text-diff", name: "Text Diff", icon: "fa-code-compare", desc: "Compare two texts line by line", keys: "diff compare text" },
        { slug: "json-viewer", name: "JSON Viewer", icon: "fa-file-code", desc: "Validate and explore JSON as a tree", keys: "json tree format" },
        { slug: "palette-extractor", name: "Palette Extractor", icon: "fa-palette", desc: "Extract a colour palette from an image", keys: "colour color palette image" },
        { slug: "phase-board", name: "Phase Board", icon: "fa-bars-progress", desc: "Track projects through phases and actions", keys: "project phase planning" },
        { slug: "newsletter", name: "Snake Charmer", icon: "fa-newspaper", desc: "The bi-weekly Python newsletter", keys: "newsletter python articles", href: "newsletter/" }
    ].map(function (tool) {
        tool.href = siteRoot + (tool.href || "tools/" + tool.slug + "/");
        tool.group = "Tools";
        return tool;
    });

    var ACTIONS = [
        { key: "new-note", name: "New note", icon: "fa-note-sticky", desc: "Create a note in Notes", keys: "create add note", href: siteRoot + "tools/notes/?new=1" },
        { key: "new-task", name: "New task", icon: "fa-list-check", desc: "Add a task in the To-Do List", keys: "create add task todo", href: siteRoot + "tools/todo/?new=1" },
        { key: "new-snippet", name: "New snippet", icon: "fa-code", desc: "Create a snippet in Snippets", keys: "create add snippet code", href: siteRoot + "tools/snippets/?new=1" },
        { key: "new-project", name: "New project", icon: "fa-bars-progress", desc: "Start a project in Phase Board", keys: "create add project phase", href: siteRoot + "tools/phase-board/?new=1" },
        { key: "backup", name: "Back up local data", icon: "fa-database", desc: "Download notes, tasks, snippets, projects and settings", keys: "export backup restore save", href: siteRoot + "backup/" }
    ].map(function (action) {
        action.group = "Actions";
        return action;
    });

    function injectStylesheet() {
        if (document.querySelector("link[data-site-chrome]")) return;
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL("site-chrome.css", script.src).href;
        link.setAttribute("data-site-chrome", "");
        document.head.appendChild(link);
    }

    function normalizePath(path) {
        return path.replace(/\/index\.html$/, "/").replace(/\/+$/, "/");
    }

    function enhanceNavigation() {
        var here = normalizePath(window.location.pathname);
        document.querySelectorAll(".nav-pill-item, .newsletter-link").forEach(function (link) {
            var label = link.querySelector(".nav-pill-label-text");
            if (label && !link.title) link.title = label.textContent.trim();
            try {
                if (normalizePath(new URL(link.href, window.location.href).pathname) === here) {
                    link.setAttribute("aria-current", "page");
                }
            } catch (e) { /* ignore malformed hrefs */ }
        });
    }

    function storageGet(key, fallback) {
        try {
            var value = window.localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (e) { return fallback; }
    }

    function storageSet(key, value) {
        try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    }

    function rememberTool(tool) {
        if (!tool || !tool.slug || tool.slug === "newsletter") return;
        var recent = storageGet("qol-tools-recent", []);
        recent = recent.filter(function (slug) { return slug !== tool.slug; });
        recent.unshift(tool.slug);
        storageSet("qol-tools-recent", recent.slice(0, 5));
    }

    function toolForHref(href) {
        var normalized = normalizePath(new URL(href, window.location.href).pathname);
        return TOOLS.find(function (tool) {
            return normalizePath(new URL(tool.href).pathname) === normalized;
        });
    }

    // Record navigation from the rail and the landing ledger for the palette's
    // Recent group. Click handlers run before navigation, so there is no delay.
    document.addEventListener("click", function (event) {
        var link = event.target.closest && event.target.closest(".nav-pill-item, .ledger-row");
        if (!link) return;
        rememberTool(toolForHref(link.href));
    });

    // Also make a directly visited or bookmarked tool part of Recent.
    try {
        var currentTool = TOOLS.find(function (tool) {
            return normalizePath(new URL(tool.href).pathname) === normalizePath(window.location.pathname);
        });
        if (currentTool) rememberTool(currentTool);
    } catch (e) { /* ignore malformed location */ }

    // ─── Local content index ─────────────────────────────────────

    var contentEntries = null;
    var contentPromise = null;

    function openDatabase(name) {
        return new Promise(function (resolve, reject) {
            var request = indexedDB.open(name);
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
            request.onblocked = function () { reject(new Error("blocked")); };
        });
    }

    function getAll(db, storeName) {
        return new Promise(function (resolve, reject) {
            if (!db.objectStoreNames.contains(storeName)) { resolve([]); return; }
            var tx = db.transaction(storeName, "readonly");
            var request = tx.objectStore(storeName).getAll();
            request.onsuccess = function () { resolve(request.result || []); };
            request.onerror = function () { reject(request.error); };
        });
    }

    function getRecord(db, storeName, key) {
        return new Promise(function (resolve, reject) {
            if (!db.objectStoreNames.contains(storeName)) { resolve(null); return; }
            var tx = db.transaction(storeName, "readonly");
            var request = tx.objectStore(storeName).get(key);
            request.onsuccess = function () { resolve(request.result || null); };
            request.onerror = function () { reject(request.error); };
        });
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise(function (resolve) { setTimeout(function () { resolve(null); }, ms); })
        ]);
    }

    function firstLine(text) {
        var line = String(text || "").split(/\r?\n/).find(function (part) { return part.trim(); });
        return (line || "").replace(/^#{1,6}\s*/, "").trim();
    }

    function snippet(text, limit) {
        var clean = String(text || "").replace(/\s+/g, " ").trim();
        return clean.length > limit ? clean.slice(0, limit - 1) + "…" : clean;
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    async function readContent() {
        var items = [];
        var names = null;
        try {
            if (indexedDB.databases) {
                names = (await indexedDB.databases()).map(function (db) { return db.name; });
            }
        } catch (e) { names = null; }

        function exists(name) {
            return names === null || names.indexOf(name) !== -1;
        }

        // QoLToolsDB can safely be opened even on a first visit: when the tools
        // later open it at version 2 their upgrade still creates the stores.
        try {
            var toolsDb = await withTimeout(openDatabase("QoLToolsDB"), 1500);
            if (toolsDb) {
                var todos = await withTimeout(getAll(toolsDb, "todos"), 1500) || [];
                todos.filter(function (todo) { return !todo.completed && !todo.isProject; })
                    .sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); })
                    .forEach(function (todo) {
                        items.push({
                            key: "task:" + todo.id,
                            group: "Tasks",
                            name: todo.text || "Untitled task",
                            desc: todo.completed ? "Completed" : (todo.deadline ? "Due " + todo.deadline : "Task"),
                            icon: "fa-list-check",
                            href: siteRoot + "tools/todo/?task=" + encodeURIComponent(todo.id),
                            search: todo.text || ""
                        });
                    });

                var snippets = await withTimeout(getAll(toolsDb, "snippets"), 1500) || [];
                snippets.sort(function (a, b) {
                    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
                }).forEach(function (s) {
                    items.push({
                        key: "snippet:" + s.id,
                        group: "Snippets",
                        name: s.title || "Untitled snippet",
                        desc: s.description || s.language || "Snippet",
                        icon: "fa-code",
                        href: siteRoot + "tools/snippets/?snippet=" + encodeURIComponent(s.id),
                        search: [s.title, s.description, s.language, s.code].join(" ").slice(0, 3000)
                    });
                });
                toolsDb.close();
            }
        } catch (e) { /* no local snippets or tasks yet */ }

        if (exists("QoLNotesDB")) {
            try {
                var notesDb = await withTimeout(openDatabase("QoLNotesDB"), 1500);
                if (notesDb) {
                    var noteState = await withTimeout(getRecord(notesDb, "state", "notes"), 1500);
                    var notes = (noteState && noteState.notes) || {};
                    Object.keys(notes).map(function (id) { return notes[id]; })
                        .filter(function (note) { return note && !note.trashed; })
                        .sort(function (a, b) { return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")); })
                        .forEach(function (note) {
                            var title = note.title || firstLine(note.content) || "Untitled note";
                            items.push({
                                key: "note:" + note.id,
                                group: "Notes",
                                name: title,
                                desc: note.archived ? "Archived note" : "Note",
                                icon: "fa-note-sticky",
                                href: siteRoot + "tools/notes/?note=" + encodeURIComponent(note.id),
                                search: title + " " + String(note.content || "").slice(0, 3000)
                            });
                        });
                    notesDb.close();
                }
            } catch (e) { /* Notes has not been opened here yet */ }
        }

        if (exists("QoLPhaseBoardDB")) {
            try {
                var boardDb = await withTimeout(openDatabase("QoLPhaseBoardDB"), 1500);
                if (boardDb) {
                    var boardState = await withTimeout(getRecord(boardDb, "state", "board"), 1500);
                    var projects = (boardState && boardState.projects) || {};
                    Object.keys(projects).map(function (id) { return projects[id]; })
                        .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
                        .forEach(function (project) {
                            items.push({
                                key: "project:" + project.id,
                                group: "Projects",
                                name: project.name || "Untitled project",
                                desc: [project.tag, project.status].filter(Boolean).join(" · ") || "Project",
                                icon: "fa-bars-progress",
                                href: siteRoot + "tools/phase-board/?project=" + encodeURIComponent(project.id),
                                search: [project.name, project.tag, project.owner, project.lead].join(" ")
                            });
                        });
                    boardDb.close();
                }
            } catch (e) { /* Phase Board has not been opened here yet */ }
        }

        return items;
    }

    function ensureContent() {
        if (contentPromise) return contentPromise;
        contentPromise = withTimeout(readContent(), 3500).then(function (items) {
            contentEntries = items || [];
            return contentEntries;
        }).catch(function () {
            contentEntries = [];
            return contentEntries;
        });
        return contentPromise;
    }

    // ─── Page heading / skip link ───────────────────────────────

    function ensurePageHeading() {
        // Only tool pages rely on the rail for their name. The landing page and
        // the newsletter render their own h1.
        if (!/\/tools\//.test(window.location.pathname)) return;
        if (document.querySelector("h1")) return;
        var active = document.querySelector('.nav-pill-item[aria-current="page"] .nav-pill-label-text');
        var name = active ? active.textContent.trim() : (document.title.split(" - ")[0] || "").trim();
        if (!name) return;
        var heading = document.createElement("h1");
        heading.className = "visually-hidden";
        heading.textContent = name;
        document.body.insertBefore(heading, document.body.firstChild);
    }

    function addSkipLink() {
        if (document.querySelector(".skip-link")) return;
        var target = document.querySelector([
            "#notesApp", "#pbApp", ".nl-main", ".ledger-toolbar", ".tool-ledger", ".todo-layout",
            ".columns-row", ".cron-container",
            ".image-editor-container", ".json-container", ".regex-container",
            ".diff-container", ".snippets-container", ".tz-container", ".pe-container",
            ".flow-viewport", "main"
        ].join(","));
        if (!target) target = document.querySelector("h1");
        if (!target) return;
        if (!target.id) target.id = "site-main";
        target.setAttribute("tabindex", "-1");
        target.setAttribute("data-skip-target", "");
        target.style.scrollMarginTop = "150px";

        var link = document.createElement("a");
        link.className = "skip-link";
        link.href = "#" + target.id;
        link.textContent = "Skip to content";
        // Keep it out of the first paint until the stylesheet that hides it is ready.
        link.hidden = true;
        link.addEventListener("focus", function () { link.classList.add("is-visible"); });
        link.addEventListener("blur", function () { link.classList.remove("is-visible"); });
        link.addEventListener("click", function (event) {
            event.preventDefault();
            target.focus();
            target.scrollIntoView({ block: "start" });
        });
        document.body.insertBefore(link, document.body.firstChild);

        var stylesheet = document.querySelector("link[data-site-chrome]");
        if (!stylesheet || stylesheet.sheet) {
            link.hidden = false;
        } else {
            stylesheet.addEventListener("load", function () { link.hidden = false; }, { once: true });
        }
    }

    // ─── Palette ────────────────────────────────────────────────

    function scoreText(query, entry) {
        if (!query) return 0;
        var name = String(entry.name || "").toLowerCase();
        var search = String(entry.search || (entry.name + " " + (entry.keys || "") + " " + (entry.desc || ""))).toLowerCase();
        if (name.indexOf(query) === 0) return 100;
        var wordIndex = name.split(/\s+/).findIndex(function (word) { return word.indexOf(query) === 0; });
        if (wordIndex > 0) return 85;
        if (name.indexOf(query) !== -1) return 75;
        if (search.indexOf(query) !== -1) return 55;
        var index = 0;
        for (var i = 0; i < name.length && index < query.length; i++) {
            if (name[i] === query[index]) index++;
        }
        return index === query.length ? 25 : -1;
    }

    function recentTools() {
        return storageGet("qol-tools-recent", []).map(function (slug) {
            return TOOLS.find(function (tool) { return tool.slug === slug; });
        }).filter(Boolean);
    }

    function buildPalette() {
        var overlay = document.createElement("div");
        overlay.className = "site-palette-overlay";
        overlay.id = "sitePaletteOverlay";
        overlay.hidden = true;
        overlay.innerHTML =
            '<div class="site-palette" role="dialog" aria-modal="true" aria-label="Command palette">' +
                '<div class="site-palette-input-row">' +
                    '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
                    '<input class="site-palette-input" id="sitePaletteInput" type="text" role="combobox" aria-expanded="true" aria-controls="sitePaletteList" aria-autocomplete="list" placeholder="Jump to a tool, note, task, snippet or project…" autocomplete="off" spellcheck="false" aria-label="Jump to a tool or record">' +
                    '<span class="site-palette-esc">esc</span>' +
                '</div>' +
                '<div class="site-palette-list" id="sitePaletteList" role="listbox" aria-label="Results"></div>' +
                '<div class="site-palette-footer">' +
                    '<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>' +
                    '<span><kbd>↵</kbd> open</span>' +
                    '<span><kbd>esc</kbd> close</span>' +
                    '<span class="site-palette-shortcut"></span>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var input = overlay.querySelector("#sitePaletteInput");
        var list = overlay.querySelector("#sitePaletteList");
        var shortcutLabel = overlay.querySelector(".site-palette-shortcut");
        var notesOwnsCtrlK = !!document.getElementById("commandPaletteOverlay");
        var shortcut = notesOwnsCtrlK ? "Ctrl Shift P" : "Ctrl K";
        if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut = shortcut.replace("Ctrl", "⌘");
        shortcutLabel.textContent = shortcut;

        var activeIndex = 0;
        var results = [];
        var restoreFocus = null;

        function entryHTML(entry, index) {
            return '<a class="site-palette-item" role="option" id="site-palette-opt-' + index + '" href="' + escapeHtml(entry.href) + '" data-index="' + index + '">' +
                '<span class="site-palette-icon"><i class="fa-solid ' + entry.icon + '" aria-hidden="true"></i></span>' +
                '<span class="site-palette-item-main"><span class="site-palette-name">' + escapeHtml(entry.name) + '</span>' +
                '<span class="site-palette-desc">' + escapeHtml(entry.desc || "") + "</span></span></a>";
        }

        function render(query) {
            var q = query.trim().toLowerCase();
            var sections = [];

            if (!q) {
                sections.push({ label: "Actions", entries: ACTIONS });
                var recent = recentTools();
                if (recent.length) {
                    sections.push({ label: "Recent", entries: recent });
                    var recentSlugs = recent.map(function (tool) { return tool.slug; });
                    sections.push({
                        label: "All tools",
                        entries: TOOLS.filter(function (tool) { return recentSlugs.indexOf(tool.slug) === -1; })
                    });
                } else {
                    sections.push({ label: "All tools", entries: TOOLS });
                }
            } else {
                var scored = [];
                ACTIONS.concat(TOOLS).forEach(function (entry) {
                    var score = scoreText(q, entry);
                    if (score >= 0) scored.push({ entry: entry, group: entry.group, score: score });
                });
                (contentEntries || []).forEach(function (entry) {
                    var score = scoreText(q, entry);
                    if (score >= 0) scored.push({ entry: entry, group: entry.group, score: score });
                });
                scored.sort(function (a, b) { return b.score - a.score; });

                var primary = scored.filter(function (item) {
                    return item.group === "Tools" || item.group === "Actions";
                }).slice(0, 6);
                if (primary.length) sections.push({ label: "Tools & actions", entries: primary.map(function (item) { return item.entry; }) });

                ["Notes", "Tasks", "Snippets", "Projects"].forEach(function (group) {
                    var matches = scored.filter(function (item) { return item.group === group; }).slice(0, 4);
                    if (matches.length) sections.push({ label: group, entries: matches.map(function (item) { return item.entry; }) });
                });
            }

            var html = "";
            var seen = {};
            results = [];
            sections.forEach(function (section) {
                var entries = section.entries.filter(function (entry) {
                    var key = entry.key || entry.slug || entry.name;
                    if (seen[key]) return false;
                    seen[key] = true;
                    return true;
                });
                if (!entries.length) return;
                html += '<div class="site-palette-group">' + section.label + "</div>";
                entries.forEach(function (entry) {
                    html += entryHTML(entry, results.length);
                    results.push(entry);
                });
            });

            list.innerHTML = html || '<div class="site-palette-empty">Nothing matches “' + escapeHtml(query) + "”.</div>";
            activeIndex = 0;
            highlight();
        }

        function highlight() {
            var items = list.querySelectorAll(".site-palette-item");
            items.forEach(function (item, index) {
                item.classList.toggle("is-selected", index === activeIndex);
                item.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
            });
            var selected = items[activeIndex];
            if (selected) {
                input.setAttribute("aria-activedescendant", selected.id);
                selected.scrollIntoView({ block: "nearest" });
            } else {
                input.removeAttribute("aria-activedescendant");
            }
        }

        function move(delta) {
            var count = list.querySelectorAll(".site-palette-item").length;
            if (!count) return;
            activeIndex = (activeIndex + delta + count) % count;
            highlight();
        }

        function open() {
            restoreFocus = document.activeElement;
            overlay.hidden = false;
            input.value = "";
            render("");
            input.focus();
        }

        function loadContentFor(query) {
            if (contentEntries || contentPromise || query.trim().length < 2) return;
            ensureContent().then(function () {
                if (!overlay.hidden) render(input.value);
            });
        }

        function close() {
            overlay.hidden = true;
            if (restoreFocus && typeof restoreFocus.focus === "function") restoreFocus.focus();
        }

        function activate(entry) {
            if (!entry) return;
            if (entry.slug) rememberTool(entry);
            window.location.href = entry.href;
        }

        input.addEventListener("input", function () {
            render(input.value);
            loadContentFor(input.value);
        });
        overlay.addEventListener("mousedown", function (event) {
            if (event.target === overlay) close();
        });
        list.addEventListener("click", function (event) {
            var item = event.target.closest(".site-palette-item");
            if (!item) return;
            event.preventDefault();
            activate(results[Number(item.dataset.index)]);
        });

        document.addEventListener("keydown", function (event) {
            var key = event.key.toLowerCase();
            var isOpen = !overlay.hidden;
            var mod = event.metaKey || event.ctrlKey;

            if (!isOpen && mod && ((!notesOwnsCtrlK && key === "k") || (notesOwnsCtrlK && key === "p" && event.shiftKey))) {
                event.preventDefault();
                open();
                return;
            }
            if (!isOpen) return;

            if (key === "escape") {
                event.preventDefault();
                close();
            } else if (key === "arrowdown") {
                event.preventDefault();
                move(1);
            } else if (key === "arrowup") {
                event.preventDefault();
                move(-1);
            } else if (key === "enter") {
                event.preventDefault();
                activate(results[activeIndex]);
            } else if (key === "tab") {
                // Keep focus in the combobox; the list is navigated with arrows.
                event.preventDefault();
            }
        });

        window.qolPalette = { open: open, close: close };
    }

    injectStylesheet();
    enhanceNavigation();
    ensurePageHeading();
    addSkipLink();
    buildPalette();
})();
