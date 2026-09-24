/**
 * To-Do App — Redesigned UX + Phase 2 Enhancements
 * Uses IndexedDB for storage via shared StorageManager
 */

class TodoApp {
    constructor() {
        this.todos = [];
        this.expandedTaskId = null;
        this.inlineEditId = null;
        this._contentClickTimer = null; // pending click-to-expand, cancelled by a following dblclick
        this._lastTodayCount = null; // drives the Today-count spring animation on change, not on first paint

        // Undo system
        this.pendingDelete = null; // { todos: [...], timer: timeoutId, message: string }
        this.pendingImportReplace = null; // { previousTodos: [...], importedCount, timer: timeoutId }
        this._infoToastTimer = null;

        // Drag-and-drop
        this.draggedId = null;

        // Search
        this.searchTerm = '';

        // Track last added ID for animation
        this.lastAddedId = null;

        // UI state (persisted)
        this.uiState = {
            viewMode: 'date',
            collapsedDateGroups: []
        };
        this._draggedColumnEl = null;
        this._completedOverlayOpen = false;
        this._projectSuggestions = [];
        this._projectSuggestionIndex = -1;
        this._projectSuggestionRange = null;
        this._taskEditId = null;
    }

    async init() {
        try {
            await StorageManager.migrateTodosFromLocalStorage();
            this.todos = await StorageManager.getAll('todos');

            let needsSave = false;
            this.todos.forEach(todo => {
                if (todo.isProject === undefined) { todo.isProject = false; needsSave = true; }
                if (todo.parentId === undefined) { todo.parentId = null; needsSave = true; }
                if (todo.order === undefined) { todo.order = todo.id; needsSave = true; }
                if (todo.recurrence === undefined) { todo.recurrence = null; needsSave = true; }
            });
            if (needsSave && this.todos.length > 0) {
                await StorageManager.putAll('todos', this.todos);
            }

            this.loadUIState();
            this.setupEventListeners();
            this.setupKeyboardShortcuts();
            this.setupDescriptionTooltip();
            this.render();

            // Initialize Firebase sync if available
            if (typeof FirebaseSync !== 'undefined') {
                FirebaseSync.init({
                    onAuthChange: (user) => this.handleAuthChange(user),
                    onSyncStatus: (status) => this.updateSyncStatusUI(status),
                    onRemoteTodos: (todos) => this.handleRemoteTodos(todos),
                });
            }
        } catch (error) {
            console.error('Failed to initialize Todo App:', error);
        }
    }

    // ===== UI State Persistence =====
    loadUIState() {
        try {
            const saved = localStorage.getItem('todo-ui-state');
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.assign(this.uiState, parsed);
            }
        } catch (e) { /* ignore */ }
    }

    saveUIState() {
        try {
            localStorage.setItem('todo-ui-state', JSON.stringify(this.uiState));
        } catch (e) { /* ignore */ }
    }

    // ===== Data Persistence =====
    async saveTodos() {
        try {
            await StorageManager.putAll('todos', this.todos);
        } catch (error) {
            console.error('Failed to save todos:', error);
        }
    }

    // ===== Event Listeners =====
    setupEventListeners() {
        const addBtn = document.getElementById('addBtn');
        const todoInput = document.getElementById('todoInput');
        const composer = document.getElementById('composer');
        const priorityChips = document.getElementById('priorityChips');
        const projectCheckbox = document.getElementById('projectCheckbox');
        const shortcutsBtn = document.getElementById('shortcutsBtn');
        const composerMoreToggle = document.getElementById('composerMoreToggle');
        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        const importFileInput = document.getElementById('importFileInput');
        const shortcutsClose = document.getElementById('shortcutsClose');
        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClear');
        const recurrenceSelect = document.getElementById('recurrenceSelect');
        const undoToastBtn = document.getElementById('undoToastBtn');
        const undoToastDismiss = document.getElementById('undoToastDismiss');

        // Composer: add task
        addBtn.addEventListener('click', () => this.addTodo());
        todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this._projectSuggestionIndex < 0) this.addTodo();
        });

        // Composer: expand on focus
        todoInput.addEventListener('focus', () => composer.classList.add('expanded'));

        // Composer: collapse when focus leaves and fields are default
        composer.addEventListener('focusout', (e) => {
            setTimeout(() => {
                if (!composer.contains(document.activeElement) && this.isComposerDefault()) {
                    composer.classList.remove('expanded');
                }
            }, 100);
        });

        // Composer: live shorthand preview + live syntax-colored mirror
        todoInput.addEventListener('input', () => {
            this.updateShorthandPreview();
            this.updateComposerHighlight();
            this.updateProjectSuggestions();
        });
        todoInput.addEventListener('scroll', () => {
            const highlight = document.getElementById('composerInputHighlight');
            if (highlight) highlight.scrollLeft = todoInput.scrollLeft;
        });
        todoInput.addEventListener('keydown', (e) => this.handleComposerSuggestionKeydown(e));
        todoInput.addEventListener('blur', () => {
            setTimeout(() => this.closeProjectSuggestions(), 150);
        });

        // Priority chips
        priorityChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.priority-chip');
            if (!chip) return;
            priorityChips.querySelectorAll('.priority-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });

        // Project checkbox hides project dropdown
        projectCheckbox.addEventListener('change', () => {
            const parentWrapper = document.getElementById('parentProjectSelect');
            parentWrapper.disabled = projectCheckbox.checked;
        });

        // Recurrence custom interval toggle
        recurrenceSelect.addEventListener('change', () => {
            const customField = document.getElementById('customIntervalField');
            customField.style.display = recurrenceSelect.value === 'custom' ? 'flex' : 'none';
        });

        // Keyboard-shortcuts overlay trigger (also reachable via the "?" key)
        shortcutsBtn.addEventListener('click', () => this.toggleShortcuts());

        // Board header: Date/Project view toggle
        document.getElementById('viewToggle').querySelectorAll('.view-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-toggle-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                this.setViewMode(btn.dataset.mode);
            });
        });

        // Completed tasks overlay (archive icon replaces the old rail item)
        document.getElementById('archiveBtn').addEventListener('click', () => this.openCompletedOverlay());
        document.getElementById('completedOverlayClose').addEventListener('click', () => this.closeCompletedOverlay());
        document.getElementById('completedOverlayBackdrop').addEventListener('click', () => this.closeCompletedOverlay());
        document.getElementById('clearCompletedBtn').addEventListener('click', () => this.clearCompleted());

        // Task edit modal: shorthand quick-edit bar, same mechanism as the composer
        const taskEditInput = document.getElementById('taskEditInput');
        taskEditInput.addEventListener('input', () => {
            this.updateComposerHighlight('taskEditInput', 'taskEditInputHighlight');
            this.updateProjectSuggestions('taskEditInput', 'taskEditSuggestions');
        });
        taskEditInput.addEventListener('scroll', () => {
            const highlight = document.getElementById('taskEditInputHighlight');
            if (highlight) highlight.scrollLeft = taskEditInput.scrollLeft;
        });
        taskEditInput.addEventListener('keydown', (e) => {
            if (this._projectSuggestions.length > 0) {
                this.handleComposerSuggestionKeydown(e, 'taskEditInput', 'taskEditSuggestions');
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                this.applyTaskEditShorthand();
                this.closeTaskEditModal();
            } else if (e.key === 'Escape') {
                this.closeTaskEditModal();
            }
        });
        document.getElementById('taskEditModalClose').addEventListener('click', () => this.closeTaskEditModal());
        document.getElementById('taskEditModalBackdrop').addEventListener('click', () => this.closeTaskEditModal());

        // Composer "More options" toggle (recurrence/project/description)
        composerMoreToggle.addEventListener('click', () => {
            const more = document.getElementById('composerMore');
            const label = document.getElementById('composerMoreToggleLabel');
            const isOpen = more.classList.toggle('open');
            composerMoreToggle.classList.toggle('open', isOpen);
            composerMoreToggle.setAttribute('aria-expanded', String(isOpen));
            label.textContent = isOpen ? 'Less' : 'More';
        });

        // Export/Import
        exportBtn.addEventListener('click', () => this.exportTodos());
        importBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', (e) => this.importTodos(e));

        // Shortcuts overlay close
        shortcutsClose.addEventListener('click', () => this.hideShortcuts());

        // Click outside shortcuts overlay
        document.getElementById('shortcutsOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.hideShortcuts();
        });

        // Search
        searchInput.addEventListener('input', () => {
            this.searchTerm = searchInput.value.trim();
            searchClear.classList.toggle('visible', this.searchTerm.length > 0);
            this.render();
        });

        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            this.searchTerm = '';
            searchClear.classList.remove('visible');
            this.render();
        });

        // Undo toast (shared between delete-undo and import-replace-undo)
        undoToastBtn.addEventListener('click', () => {
            if (this.pendingImportReplace) this.undoImportReplace();
            else this.undoDelete();
        });
        undoToastDismiss.addEventListener('click', () => {
            if (this.pendingImportReplace) this.finalizeImportReplace();
            else this.finalizeDelete();
        });

        // Auth buttons (optional — only present when Firebase scripts are loaded)
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        if (signInBtn) signInBtn.addEventListener('click', () => this.handleSignIn());
        if (signOutBtn) signOutBtn.addEventListener('click', () => this.handleSignOut());

        // Event delegation for task list interactions — the board and the
        // completed overlay both use the same row markup, so one delegated
        // listener per container covers all of it.
        ['boardColumns', 'completedOverlayBody'].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('click', (e) => this.handleTaskClick(e));
            el.addEventListener('keydown', (e) => this.handleTaskKeydown(e));
            el.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        });

        // Detail drawer close affordances
        const detailDrawer = document.getElementById('detailDrawer');
        const detailDrawerBackdrop = document.getElementById('detailDrawerBackdrop');
        const detailDrawerClose = document.getElementById('detailDrawerClose');
        if (detailDrawer && detailDrawerBackdrop && detailDrawerClose) {
            const closeDrawer = () => {
                this.expandedTaskId = null;
                this.render();
            };
            detailDrawerBackdrop.addEventListener('click', closeDrawer);
            detailDrawerClose.addEventListener('click', closeDrawer);
        }

        // Overflow menus close on any click outside them
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.todo-menu-wrap')) this.closeAllTodoMenus();
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const active = document.activeElement;
            const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

            // Escape: close everything
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeAllPanels();
                return;
            }

            // Shortcuts that only work when not in an input
            if (!isInput) {
                if (e.key === 'n' || e.key === '/') {
                    e.preventDefault();
                    document.getElementById('todoInput').focus();
                    return;
                }
                if (e.key === 'f') {
                    e.preventDefault();
                    document.getElementById('searchInput').focus();
                    return;
                }
                if (e.key === '?') {
                    e.preventDefault();
                    this.toggleShortcuts();
                    return;
                }
            }
        });
    }

    // ===== Composer Logic =====
    isComposerDefault() {
        const deadline = document.getElementById('deadlineInput').value;
        const description = document.getElementById('descriptionInput').value.trim();
        const projectCb = document.getElementById('projectCheckbox').checked;
        const parentProject = document.getElementById('parentProjectSelect').value;
        const recurrence = document.getElementById('recurrenceSelect').value;
        const activeChip = document.querySelector('.priority-chip.active');
        const priority = activeChip ? activeChip.dataset.priority : 'medium';
        return !deadline && !description && !projectCb && !parentProject && priority === 'medium' && !recurrence;
    }

    updateShorthandPreview() {
        const text = document.getElementById('todoInput').value;
        const preview = document.getElementById('composerPreview');
        const parsed = this.parseShorthand(text);
        const tags = [];

        if (parsed.priority) {
            tags.push(`<span class="preview-tag preview-tag-priority">${parsed.priority}</span>`);
        }
        if (parsed.deadline) {
            tags.push(`<span class="preview-tag preview-tag-deadline">${parsed.deadline}</span>`);
        }
        if (parsed.projectName) {
            tags.push(`<span class="preview-tag preview-tag-project">${this.escapeHtml(parsed.projectName)}</span>`);
        }
        if (parsed.recurrence) {
            const label = parsed.recurrence.type === 'custom'
                ? `every ${parsed.recurrence.interval}d`
                : parsed.recurrence.type;
            tags.push(`<span class="preview-tag preview-tag-recurrence">${label}</span>`);
        }

        if (tags.length > 0) {
            preview.innerHTML = tags.join('');
            preview.classList.add('has-tags');
        } else {
            preview.innerHTML = '';
            preview.classList.remove('has-tags');
        }
    }

    // Mirrors the input's text behind a transparent-text input so shorthand
    // tokens (::h, ::p[Name], ::daily...) render live in the theme's own
    // --syntax-* colors, the same roles used for code highlighting elsewhere
    // on the site — the composer reads as a real command line, not a text
    // box with a caption underneath.
    // inputId/highlightId default to the composer's own elements; the task
    // edit modal's quick-edit bar passes its own ids to reuse this exact
    // mechanism instead of duplicating it.
    updateComposerHighlight(inputId = 'todoInput', highlightId = 'composerInputHighlight') {
        const highlight = document.getElementById(highlightId);
        const inputEl = document.getElementById(inputId);
        if (!highlight || !inputEl) return;
        const text = inputEl.value;
        const pattern = /(::[hmlHML]\b)|(::p\[[^\]]+\])|(::daily\b|::weekly\b|::monthly\b|::every:\d+d\b)|(::today\b|::tomorrow\b|::\d+d\b)/gi;
        let result = '';
        let lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            result += this.escapeHtml(text.slice(lastIndex, match.index));
            const token = match[0];
            let cls = 'hl-priority';
            if (match[2]) cls = 'hl-project';
            else if (match[3]) cls = 'hl-recurrence';
            else if (match[4]) cls = 'hl-deadline';
            result += `<span class="${cls}">${this.escapeHtml(token)}</span>`;
            lastIndex = match.index + token.length;
        }
        result += this.escapeHtml(text.slice(lastIndex));
        highlight.innerHTML = result;
        highlight.scrollLeft = inputEl.scrollLeft;
    }

    // ===== Project Autocomplete (::p[...) =====
    // Typing ::p[ opens a picker of existing projects instead of requiring
    // you to remember and retype an exact name — the same "smart shorthand"
    // idea as the live syntax coloring, just for the one token whose value
    // isn't fixed vocabulary. Shared between the composer and the task edit
    // modal's quick-edit bar via the id pair.
    updateProjectSuggestions(inputId = 'todoInput', dropdownId = 'composerSuggestions') {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;

        const value = input.value;
        const cursor = input.selectionStart;
        const before = value.slice(0, cursor);
        const match = before.match(/::p\[([^\]]*)$/i);
        if (!match) {
            this.closeProjectSuggestions(dropdownId);
            return;
        }

        const partial = match[1].toLowerCase();
        const start = match.index + match[0].indexOf('[') + 1;
        const projects = this.todos.filter(t => t.isProject && !t.completed);
        const matches = (partial
            ? projects.filter(p => p.text.toLowerCase().includes(partial))
            : projects
        ).slice(0, 6);

        this._projectSuggestionRange = { start, end: cursor };

        if (matches.length === 0) {
            this.closeProjectSuggestions(dropdownId);
            return;
        }

        this._projectSuggestions = matches;
        this._projectSuggestionIndex = 0;

        dropdown.innerHTML = matches.map((p, i) => `
            <div class="composer-suggestion-item${i === 0 ? ' active' : ''}" data-index="${i}" role="option">
                <i class="fa-solid fa-folder"></i> ${this.escapeHtml(p.text)}
            </div>
        `).join('');
        dropdown.classList.add('open');
        dropdown.querySelectorAll('.composer-suggestion-item').forEach(el => {
            // mousedown (not click) fires before the input blurs, so focus
            // and the pending selection range are still intact when we act.
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.pickProjectSuggestion(parseInt(el.dataset.index), inputId, dropdownId);
            });
        });
    }

    closeProjectSuggestions(dropdownId = 'composerSuggestions') {
        this._projectSuggestions = [];
        this._projectSuggestionIndex = -1;
        this._projectSuggestionRange = null;
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.classList.remove('open');
            dropdown.innerHTML = '';
        }
    }

    highlightProjectSuggestion(dropdownId = 'composerSuggestions') {
        document.querySelectorAll(`#${dropdownId} .composer-suggestion-item`).forEach((el, i) => {
            el.classList.toggle('active', i === this._projectSuggestionIndex);
        });
    }

    pickProjectSuggestion(index, inputId = 'todoInput', dropdownId = 'composerSuggestions') {
        const input = document.getElementById(inputId);
        const suggestion = this._projectSuggestions[index];
        if (!input || !suggestion || !this._projectSuggestionRange) return;

        const { start, end } = this._projectSuggestionRange;
        const value = input.value;
        input.value = value.slice(0, start) + suggestion.text + ']' + value.slice(end);
        const newCursor = start + suggestion.text.length + 1;
        input.setSelectionRange(newCursor, newCursor);

        this.closeProjectSuggestions(dropdownId);
        const highlightId = inputId === 'todoInput' ? 'composerInputHighlight' : 'taskEditInputHighlight';
        if (inputId === 'todoInput') this.updateShorthandPreview();
        this.updateComposerHighlight(inputId, highlightId);
        input.focus();
    }

    handleComposerSuggestionKeydown(e, inputId = 'todoInput', dropdownId = 'composerSuggestions') {
        if (this._projectSuggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._projectSuggestionIndex = (this._projectSuggestionIndex + 1) % this._projectSuggestions.length;
            this.highlightProjectSuggestion(dropdownId);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._projectSuggestionIndex = (this._projectSuggestionIndex - 1 + this._projectSuggestions.length) % this._projectSuggestions.length;
            this.highlightProjectSuggestion(dropdownId);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (this._projectSuggestionIndex >= 0) {
                e.preventDefault();
                this.pickProjectSuggestion(this._projectSuggestionIndex, inputId, dropdownId);
            }
        } else if (e.key === 'Escape') {
            this.closeProjectSuggestions(dropdownId);
        }
    }

    resetComposer() {
        document.getElementById('todoInput').value = '';
        document.getElementById('composerInputHighlight').innerHTML = '';
        this.closeProjectSuggestions();
        document.getElementById('descriptionInput').value = '';
        document.getElementById('deadlineInput').value = '';
        document.getElementById('projectCheckbox').checked = false;
        document.getElementById('parentProjectSelect').value = '';
        document.getElementById('parentProjectSelect').disabled = false;
        document.getElementById('recurrenceSelect').value = '';
        document.getElementById('customIntervalInput').value = '3';
        document.getElementById('customIntervalField').style.display = 'none';
        document.getElementById('composerPreview').innerHTML = '';
        document.getElementById('composerPreview').classList.remove('has-tags');

        const moreToggle = document.getElementById('composerMoreToggle');
        const more = document.getElementById('composerMore');
        if (moreToggle && more) {
            more.classList.remove('open');
            moreToggle.classList.remove('open');
            moreToggle.setAttribute('aria-expanded', 'false');
            document.getElementById('composerMoreToggleLabel').textContent = 'More';
        }

        const chips = document.querySelectorAll('.priority-chip');
        chips.forEach(c => c.classList.remove('active'));
        document.querySelector('.priority-chip-med').classList.add('active');
    }

    // ===== Shorthand Parsing =====
    parseShorthand(text) {
        let cleanText = text;
        let priority = null;
        let deadline = null;
        let projectName = null;
        let recurrence = null;

        const priorityMatch = text.match(/::[hmlHML]\b/);
        if (priorityMatch) {
            const c = priorityMatch[0].toLowerCase().charAt(2);
            if (c === 'h') priority = 'high';
            else if (c === 'm') priority = 'medium';
            else if (c === 'l') priority = 'low';
            cleanText = cleanText.replace(/::[hmlHML]\b/g, '');
        }

        const projectMatch = text.match(/::p\[([^\]]+)\]/i);
        if (projectMatch) {
            projectName = projectMatch[1].trim();
            cleanText = cleanText.replace(/::p\[[^\]]+\]/gi, '');
        }

        // Recurrence shorthands (must parse before deadline ::Xd)
        if (/::daily\b/i.test(text)) {
            recurrence = { type: 'daily', interval: 1 };
            cleanText = cleanText.replace(/::daily\b/gi, '');
        } else if (/::weekly\b/i.test(text)) {
            recurrence = { type: 'weekly', interval: 1 };
            cleanText = cleanText.replace(/::weekly\b/gi, '');
        } else if (/::monthly\b/i.test(text)) {
            recurrence = { type: 'monthly', interval: 1 };
            cleanText = cleanText.replace(/::monthly\b/gi, '');
        } else {
            const everyMatch = text.match(/::every:(\d+)d\b/i);
            if (everyMatch) {
                recurrence = { type: 'custom', interval: parseInt(everyMatch[1]) };
                cleanText = cleanText.replace(/::every:\d+d\b/gi, '');
            }
        }

        if (/::today\b/i.test(text)) {
            deadline = this.toLocalDateString(new Date());
            cleanText = cleanText.replace(/::today\b/gi, '');
        } else if (/::tomorrow\b/i.test(text)) {
            const d = new Date(); d.setDate(d.getDate() + 1);
            deadline = this.toLocalDateString(d);
            cleanText = cleanText.replace(/::tomorrow\b/gi, '');
        } else {
            const daysMatch = cleanText.match(/::(\d+)d\b/i);
            if (daysMatch) {
                const d = new Date(); d.setDate(d.getDate() + parseInt(daysMatch[1]));
                deadline = this.toLocalDateString(d);
                cleanText = cleanText.replace(/::(\d+)d\b/gi, '');
            }
        }

        cleanText = cleanText.trim().replace(/\s+/g, ' ');
        return { text: cleanText, priority, deadline, projectName, recurrence };
    }

    // ===== Add Todo =====
    async findOrCreateProject(projectName) {
        let project = this.todos.find(t => t.isProject && t.text.toLowerCase() === projectName.toLowerCase());
        if (!project) {
            const maxOrder = this.todos.length > 0 ? Math.max(...this.todos.map(t => t.order || 0)) : 0;
            project = {
                id: Date.now(),
                text: projectName,
                completed: false,
                priority: 'medium',
                description: '',
                deadline: null,
                isProject: true,
                parentId: null,
                order: maxOrder + 1,
                recurrence: null
            };
            this.todos.push(project);
            await StorageManager.put('todos', project);
            this._syncTodo(project);
        }
        return project.id;
    }

    async addTodo() {
        const input = document.getElementById('todoInput');
        const descriptionInput = document.getElementById('descriptionInput');
        const deadlineInput = document.getElementById('deadlineInput');
        const projectCheckbox = document.getElementById('projectCheckbox');
        const parentProjectSelect = document.getElementById('parentProjectSelect');
        const recurrenceSelect = document.getElementById('recurrenceSelect');
        const customIntervalInput = document.getElementById('customIntervalInput');
        const text = input.value.trim();
        if (!text) return;

        const parsed = this.parseShorthand(text);
        const activeChip = document.querySelector('.priority-chip.active');
        const chipPriority = activeChip ? activeChip.dataset.priority : 'medium';

        let parentId = null;
        if (parsed.projectName) {
            parentId = await this.findOrCreateProject(parsed.projectName);
        } else if (!projectCheckbox.checked && parentProjectSelect.value) {
            parentId = parseInt(parentProjectSelect.value);
        }

        // Determine recurrence from shorthand or composer
        let recurrence = parsed.recurrence || null;
        if (!recurrence && recurrenceSelect.value) {
            const type = recurrenceSelect.value;
            if (type === 'custom') {
                recurrence = { type: 'custom', interval: parseInt(customIntervalInput.value) || 3 };
            } else {
                recurrence = { type, interval: 1 };
            }
        }

        const maxOrder = this.todos.length > 0 ? Math.max(...this.todos.map(t => t.order || 0)) : 0;

        const todo = {
            id: Date.now(),
            text: parsed.text,
            completed: false,
            priority: parsed.priority || chipPriority,
            description: descriptionInput.value.trim(),
            deadline: parsed.deadline || deadlineInput.value || null,
            isProject: projectCheckbox.checked,
            parentId: parentId,
            order: maxOrder + 1,
            recurrence: recurrence
        };

        this.todos.push(todo);
        this.lastAddedId = todo.id;

        if (parentId) {
            const parent = this.todos.find(t => t.id === parentId);
            if (parent && parent.completed) {
                parent.completed = false;
                await StorageManager.put('todos', parent);
                this._syncTodo(parent);
            }
        }

        await StorageManager.put('todos', todo);
        this._syncTodo(todo);
        this.resetComposer();
        this.render();
    }

    // ===== Task Actions =====
    async toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        const wasIncomplete = !todo.completed;
        todo.completed = !todo.completed;
        await StorageManager.put('todos', todo);
        this._syncTodo(todo);

        // Recurring task: on completion, create next instance
        if (todo.completed && todo.recurrence && !todo.isProject) {
            await this.createNextRecurrence(todo);
        }

        if (todo.isProject) {
            for (const sub of this.getSubtasks(id)) {
                sub.completed = todo.completed;
                await StorageManager.put('todos', sub);
                this._syncTodo(sub);
            }
        } else if (todo.parentId) {
            const parent = this.todos.find(t => t.id === todo.parentId);
            if (parent) {
                const subs = this.getSubtasks(todo.parentId);
                parent.completed = subs.every(t => t.completed);
                await StorageManager.put('todos', parent);
                this._syncTodo(parent);
            }
        }

        // Trigger checkbox bounce animation
        this._animCheckId = id;

        // Let a freshly-completed row settle out in place before the list
        // reflows around it, instead of vanishing instantly mid-streak.
        if (wasIncomplete && todo.completed) {
            const row = document.querySelector(`.todo-item[data-id="${id}"]`);
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (row && !reduceMotion) {
                row.classList.add('completing');
                setTimeout(() => this.render(), 320);
                return;
            }
        }

        this.render();
    }

    async createNextRecurrence(todo) {
        let newDeadline = null;
        if (todo.deadline) {
            const [y, m, d] = todo.deadline.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            switch (todo.recurrence.type) {
                case 'daily':
                    date.setDate(date.getDate() + (todo.recurrence.interval || 1));
                    break;
                case 'weekly':
                    date.setDate(date.getDate() + 7 * (todo.recurrence.interval || 1));
                    break;
                case 'monthly':
                    date.setMonth(date.getMonth() + (todo.recurrence.interval || 1));
                    break;
                case 'custom':
                    date.setDate(date.getDate() + (todo.recurrence.interval || 1));
                    break;
            }
            newDeadline = this.toLocalDateString(date);
        } else {
            // No deadline — set relative to today
            const date = new Date();
            switch (todo.recurrence.type) {
                case 'daily':
                    date.setDate(date.getDate() + (todo.recurrence.interval || 1));
                    break;
                case 'weekly':
                    date.setDate(date.getDate() + 7 * (todo.recurrence.interval || 1));
                    break;
                case 'monthly':
                    date.setMonth(date.getMonth() + (todo.recurrence.interval || 1));
                    break;
                case 'custom':
                    date.setDate(date.getDate() + (todo.recurrence.interval || 1));
                    break;
            }
            newDeadline = this.toLocalDateString(date);
        }

        const maxOrder = this.todos.length > 0 ? Math.max(...this.todos.map(t => t.order || 0)) : 0;
        const nextTodo = {
            id: Date.now() + 1,
            text: todo.text,
            completed: false,
            priority: todo.priority,
            description: todo.description,
            deadline: newDeadline,
            isProject: false,
            parentId: todo.parentId,
            order: maxOrder + 1,
            recurrence: { ...todo.recurrence }
        };

        this.todos.push(nextTodo);
        this.lastAddedId = nextTodo.id;
        await StorageManager.put('todos', nextTodo);
        this._syncTodo(nextTodo);
    }

    async deleteTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        // Collect tasks to delete
        const tasksToDelete = [todo];
        if (todo.isProject) {
            const subs = this.getSubtasks(id);
            // Unparent subtasks instead of deleting them
            for (const sub of subs) {
                sub.parentId = null;
                await StorageManager.put('todos', sub);
            }
        }

        // Remove from array but don't delete from DB yet
        this.todos = this.todos.filter(t => t.id !== id);
        if (this.expandedTaskId === id) this.expandedTaskId = null;

        this.queuePendingDelete(tasksToDelete, `"${todo.text}" deleted`);
        this.render();
    }

    async cyclePriority(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;
        const cycle = { low: 'medium', medium: 'high', high: 'low' };
        todo.priority = cycle[todo.priority || 'medium'];
        await StorageManager.put('todos', todo);
        this._syncTodo(todo);
        this._animPriorityId = id;
        this.render();
    }

    async clearCompleted() {
        const completedTodos = this.todos.filter(t => t.completed);
        if (completedTodos.length === 0) return;

        this.todos = this.todos.filter(t => !t.completed);

        this.queuePendingDelete(completedTodos, `${completedTodos.length} completed task(s) cleared`);
        this.render();
    }

    // ===== Undo Toast System =====
    queuePendingDelete(todos, message) {
        if (this.pendingDelete) {
            // Accumulate into the same batch instead of finalizing the previous
            // one, so a quick streak of deletes stays fully undoable together.
            clearTimeout(this.pendingDelete.timer);
            this.pendingDelete.todos.push(...todos);
        } else {
            this.pendingDelete = { todos: [...todos] };
        }

        const count = this.pendingDelete.todos.length;
        this.pendingDelete.message = count > 1 ? `${count} tasks deleted` : message;
        this.pendingDelete.timer = setTimeout(() => this.finalizeDelete(), 5000);

        this.showUndoToast(this.pendingDelete.message);
    }

    // undoable=false renders a plain info/error toast (no Undo button,
    // auto-dismisses) — used for import feedback instead of alert().
    showUndoToast(message, undoable = true) {
        const toast = document.getElementById('undoToast');
        const msg = document.getElementById('undoToastMsg');
        const undoBtn = document.getElementById('undoToastBtn');
        msg.textContent = message;
        undoBtn.style.display = undoable ? '' : 'none';
        toast.classList.remove('visible');
        // Force reflow for re-animation
        void toast.offsetWidth;
        toast.classList.add('visible');

        clearTimeout(this._infoToastTimer);
        if (!undoable) {
            this._infoToastTimer = setTimeout(() => this.hideUndoToast(), 3500);
        }
    }

    hideUndoToast() {
        document.getElementById('undoToast').classList.remove('visible');
    }

    async undoDelete() {
        if (!this.pendingDelete) return;
        clearTimeout(this.pendingDelete.timer);

        // Restore tasks
        for (const todo of this.pendingDelete.todos) {
            this.todos.push(todo);
        }

        this.pendingDelete = null;
        this.hideUndoToast();
        this.render();
    }

    async finalizeDelete() {
        if (!this.pendingDelete) return;
        clearTimeout(this.pendingDelete.timer);

        for (const todo of this.pendingDelete.todos) {
            await StorageManager.delete('todos', todo.id);
            this._deleteTodoFromCloud(todo.id);
        }

        this.pendingDelete = null;
        this.hideUndoToast();
    }

    // ===== Import Replace (shares the undo-toast pattern above) =====
    queuePendingImportReplace(imported) {
        // A replace supersedes any in-flight delete undo entirely.
        if (this.pendingDelete) {
            clearTimeout(this.pendingDelete.timer);
            this.pendingDelete = null;
        }
        if (this.pendingImportReplace) {
            clearTimeout(this.pendingImportReplace.timer);
        }

        imported.forEach((todo, i) => {
            if (todo.order === undefined) todo.order = todo.id ?? i;
            if (todo.recurrence === undefined) todo.recurrence = null;
        });

        this.pendingImportReplace = {
            previousTodos: this.todos,
            importedCount: imported.length,
            timer: setTimeout(() => this.finalizeImportReplace(), 5000)
        };
        this.todos = imported;

        this.showUndoToast(`Replaced all tasks with ${imported.length} imported`);
        this.render();
    }

    async undoImportReplace() {
        if (!this.pendingImportReplace) return;
        clearTimeout(this.pendingImportReplace.timer);

        this.todos = this.pendingImportReplace.previousTodos;

        this.pendingImportReplace = null;
        this.hideUndoToast();
        this.render();
    }

    async finalizeImportReplace() {
        if (!this.pendingImportReplace) return;
        clearTimeout(this.pendingImportReplace.timer);

        await StorageManager.clear('todos');
        await this.saveTodos();

        this.pendingImportReplace = null;
        this.hideUndoToast();
    }

    // ===== Drag-and-Drop =====
    // Listeners live at the column level (not per-item) so dropping in a
    // column's empty space — not just onto an existing card — still counts.
    // Three outcomes, decided in this order: drop onto a project card files
    // the dragged task under it; drop onto a card in the SAME column
    // reorders; drop anywhere in a DIFFERENT column reschedules (Date mode)
    // or reassigns project (Project mode) to match that column.
    setupDragListeners(listEl) {
        const column = listEl.closest('.board-column');
        const columnKey = column ? column.dataset.columnKey : null;

        listEl.querySelectorAll('.todo-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                this.draggedId = parseInt(item.dataset.id);
                this._draggedColumnEl = column;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.dataset.id);
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this.draggedId = null;
                this._draggedColumnEl = null;
                document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-into-project, .board-column-drop-target').forEach(el => {
                    el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into-project', 'board-column-drop-target');
                });
            });
        });

        if (!column) return;

        // Attached to the whole column, not just the <ul> — the list only
        // has content-sized height, so empty space below the last card
        // (very short columns, or any column next to a taller one) would
        // otherwise sit outside any drop listener entirely.
        column.addEventListener('dragover', (e) => {
            if (!this.draggedId) return;
            e.preventDefault();
            const draggedTodo = this.todos.find(t => t.id === this.draggedId);
            if (!draggedTodo) return;

            document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-into-project').forEach(el => {
                el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into-project');
            });
            column.classList.remove('board-column-drop-target');

            const itemEl = e.target.closest('.todo-item');
            if (itemEl && parseInt(itemEl.dataset.id) !== this.draggedId) {
                const targetTodo = this.todos.find(t => t.id === parseInt(itemEl.dataset.id));
                if (targetTodo) {
                    if (targetTodo.isProject && !draggedTodo.isProject && draggedTodo.parentId !== targetTodo.id) {
                        itemEl.classList.add('drag-into-project');
                        return;
                    }
                    if (column === this._draggedColumnEl && draggedTodo.parentId === targetTodo.parentId) {
                        const rect = itemEl.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        itemEl.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
                        return;
                    }
                }
            }
            if (column !== this._draggedColumnEl && this.isValidDropColumn(columnKey)) {
                column.classList.add('board-column-drop-target');
            }
        });

        column.addEventListener('dragleave', (e) => {
            if (!column.contains(e.relatedTarget)) {
                column.classList.remove('board-column-drop-target');
            }
        });

        column.addEventListener('drop', async (e) => {
            e.preventDefault();
            column.classList.remove('board-column-drop-target');
            document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-into-project').forEach(el => {
                el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into-project');
            });

            const draggedId = this.draggedId;
            if (!draggedId) return;
            const draggedTodo = this.todos.find(t => t.id === draggedId);
            if (!draggedTodo) return;

            const itemEl = e.target.closest('.todo-item');
            if (itemEl) {
                const targetId = parseInt(itemEl.dataset.id);
                if (targetId !== draggedId) {
                    const targetTodo = this.todos.find(t => t.id === targetId);
                    if (targetTodo) {
                        if (targetTodo.isProject && !draggedTodo.isProject && draggedTodo.parentId !== targetTodo.id) {
                            await this.reassignProject(draggedTodo, targetTodo);
                            return;
                        }
                        if (column === this._draggedColumnEl && draggedTodo.parentId === targetTodo.parentId) {
                            await this.reorderWithinScope(draggedTodo, targetTodo, e.clientY, itemEl);
                            return;
                        }
                    }
                }
            }

            if (column !== this._draggedColumnEl) {
                await this.moveTodoToColumn(draggedTodo, columnKey);
            }
        });
    }

    // 'overdue' isn't a valid drop target — manufacturing an overdue date by
    // dragging doesn't mean anything — and the search pseudo-column isn't a
    // real bucket or project to reassign into.
    isValidDropColumn(columnKey) {
        return columnKey && columnKey !== 'overdue' && columnKey !== 'search';
    }

    async reorderWithinScope(draggedTodo, targetTodo, clientY, itemEl) {
        const rect = itemEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = clientY < midY;

        const siblings = this.todos
            .filter(t => t.parentId === draggedTodo.parentId && !t.completed)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const filtered = siblings.filter(t => t.id !== draggedTodo.id);
        let targetIdx = filtered.findIndex(t => t.id === targetTodo.id);
        if (!insertBefore) targetIdx++;
        filtered.splice(targetIdx, 0, draggedTodo);
        filtered.forEach((t, i) => { t.order = i; });

        await this.saveTodos();
        filtered.forEach(t => this._syncTodo(t));
        this.render();
    }

    // Dropping a task onto a project card (in any column) files it under
    // that project — same action whether you're in Date or Project mode.
    async reassignProject(draggedTodo, targetProject) {
        const oldParentId = draggedTodo.parentId;
        draggedTodo.parentId = targetProject ? targetProject.id : null;

        if (oldParentId) {
            const oldParent = this.todos.find(t => t.id === oldParentId);
            if (oldParent) {
                const remaining = this.getSubtasks(oldParentId);
                oldParent.completed = remaining.length > 0 && remaining.every(t => t.completed);
                await StorageManager.put('todos', oldParent);
                this._syncTodo(oldParent);
            }
        }

        if (targetProject && targetProject.completed && !draggedTodo.completed) {
            targetProject.completed = false;
            await StorageManager.put('todos', targetProject);
            this._syncTodo(targetProject);
        }

        await StorageManager.put('todos', draggedTodo);
        this._syncTodo(draggedTodo);
        this.render();
    }

    // Dropping a task into a DIFFERENT column changes what actually puts it
    // there: in Date mode that's its deadline, in Project mode that's its
    // parent project. Picks a representative date for each deadline bucket
    // rather than an exact day — the detail panel is still there for
    // precision; the board drag is for quick, approximate moves. A subtask
    // is a flat card like any other now, so it's just as draggable between
    // date buckets (updates its own deadline) or between project columns
    // (reassigns it), same as dropping it onto a project card directly.
    async moveTodoToColumn(draggedTodo, columnKey) {
        if (!this.isValidDropColumn(columnKey)) return;

        if (columnKey.startsWith('project-')) {
            if (draggedTodo.isProject) return; // a project can't nest under another project
            const projectId = parseInt(columnKey.slice('project-'.length));
            const targetProject = this.todos.find(t => t.id === projectId && t.isProject);
            if (!targetProject || draggedTodo.parentId === targetProject.id) return;
            await this.reassignProject(draggedTodo, targetProject);
            return;
        }
        if (columnKey === 'noproject') {
            if (draggedTodo.isProject || draggedTodo.parentId === null) return;
            await this.reassignProject(draggedTodo, null);
            return;
        }

        const today = new Date();
        let newDeadline;
        if (columnKey === 'today') {
            newDeadline = this.toLocalDateString(today);
        } else if (columnKey === 'upcoming') {
            const d = new Date(today); d.setDate(d.getDate() + 1);
            newDeadline = this.toLocalDateString(d);
        } else if (columnKey === 'later') {
            const d = new Date(today); d.setDate(d.getDate() + 8);
            newDeadline = this.toLocalDateString(d);
        } else if (columnKey === 'nodeadline') {
            newDeadline = null;
        } else {
            return;
        }

        if (draggedTodo.deadline === newDeadline) return;
        draggedTodo.deadline = newDeadline;
        await StorageManager.put('todos', draggedTodo);
        this._syncTodo(draggedTodo);
        this.render();
    }

    // Keyboard-reachable alternative to drag-and-drop reordering.
    async moveTodo(id, direction) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo || todo.completed) return;

        const siblings = this.todos
            .filter(t => t.parentId === todo.parentId && !t.completed)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const idx = siblings.findIndex(t => t.id === id);
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= siblings.length) return;

        [siblings[idx], siblings[swapIdx]] = [siblings[swapIdx], siblings[idx]];
        siblings.forEach((t, i) => { t.order = i; });

        await this.saveTodos();
        siblings.forEach(t => this._syncTodo(t));
        this.render();
    }

    // ===== Project Helpers =====
    getSubtasks(projectId) {
        return this.todos.filter(t => t.parentId === projectId);
    }

    getProjectProgress(projectId) {
        const subs = this.getSubtasks(projectId);
        return { completed: subs.filter(t => t.completed).length, total: subs.length };
    }

    // A project's tab color: stable per project (hashed off its id), never
    // stored, so no data migration or color picker is needed for it.
    getProjectColor(projectId) {
        const palette = ['#a78bfa', '#5eead4', '#f0abfc', '#bef264', '#fde047'];
        return palette[Math.abs(projectId) % palette.length];
    }

    // ===== Date Group Collapse =====
    isDateGroupCollapsed(group) {
        return (this.uiState.collapsedDateGroups || []).includes(group);
    }

    toggleDateGroupCollapse(group) {
        if (!this.uiState.collapsedDateGroups) this.uiState.collapsedDateGroups = [];
        const idx = this.uiState.collapsedDateGroups.indexOf(group);
        if (idx >= 0) this.uiState.collapsedDateGroups.splice(idx, 1);
        else this.uiState.collapsedDateGroups.push(group);
        this.saveUIState();
        this.render();
    }

    // ===== Inline Editing =====
    handleDoubleClick(e) {
        const textEl = e.target.closest('.todo-text');
        if (!textEl) {
            // Double-click anywhere else on a card (not its own controls,
            // which already have dedicated single-click behavior) opens the
            // full quick-edit modal instead.
            const item = e.target.closest('.todo-item');
            if (!item || e.target.closest('input, button, .priority-dot')) return;
            const id = parseInt(item.dataset.id);
            const todo = this.todos.find(t => t.id === id);
            if (!todo || todo.completed) return;
            clearTimeout(this._contentClickTimer);
            this.openTaskEditModal(id);
            return;
        }
        const item = textEl.closest('.todo-item');
        if (!item) return;
        const id = parseInt(item.dataset.id);
        const todo = this.todos.find(t => t.id === id);
        if (!todo || todo.completed) return;

        // Cancel the pending click-to-expand from the two clicks that make up
        // this dblclick, so renaming doesn't flicker the detail panel first.
        clearTimeout(this._contentClickTimer);

        this.inlineEditId = id;
        const currentText = todo.text;

        textEl.outerHTML = `<input type="text" class="inline-edit-input" value="${this.escapeAttr(currentText)}">`;
        const inp = item.querySelector('.inline-edit-input');
        inp.focus();
        inp.select();

        inp.addEventListener('keydown', async (ev) => {
            if (ev.key === 'Enter') {
                const newText = inp.value.trim();
                if (newText && newText !== currentText) {
                    todo.text = newText;
                    await StorageManager.put('todos', todo);
                }
                this.inlineEditId = null;
                this.render();
            } else if (ev.key === 'Escape') {
                this.inlineEditId = null;
                this.render();
            }
        });

        inp.addEventListener('blur', () => {
            if (this.inlineEditId === id) {
                this.inlineEditId = null;
                this.render();
            }
        });
    }

    // ===== Overflow Menu =====
    toggleTodoMenu(btn) {
        const wrap = btn.closest('.todo-menu-wrap');
        const menu = wrap.querySelector('.todo-menu');
        const isOpen = !menu.hidden;
        this.closeAllTodoMenus();
        if (!isOpen) {
            menu.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
        }
    }

    closeAllTodoMenus() {
        document.querySelectorAll('.todo-menu:not([hidden])').forEach(menu => {
            menu.hidden = true;
            const btn = menu.closest('.todo-menu-wrap').querySelector('.todo-menu-btn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    }

    // "Add subtask" (project card's menu) hands off to the main composer
    // with ::p[Name] prefilled, instead of a bespoke inline input — a
    // project's subtasks aren't a nested list under it any more, so there's
    // no nested slot left to insert an inline row into.
    startSubtaskComposer(projectId) {
        const project = this.todos.find(t => t.id === projectId);
        if (!project) return;
        const input = document.getElementById('todoInput');
        document.getElementById('composer').classList.add('expanded');
        input.value = `::p[${project.text}] `;
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
        this.updateComposerHighlight('todoInput', 'composerInputHighlight');
    }

    // ===== Description Tooltip =====
    setupDescriptionTooltip() {
        const tooltip = document.createElement('div');
        tooltip.className = 'desc-tooltip';
        document.body.appendChild(tooltip);

        const lists = [document.getElementById('boardColumns'), document.getElementById('completedOverlayBody')];
        lists.forEach(list => {
            list.addEventListener('mousemove', (e) => {
                const item = e.target.closest('.todo-item');
                if (!item || !item.dataset.description) {
                    tooltip.classList.remove('visible');
                    return;
                }
                if (tooltip.dataset.forId !== item.dataset.id) {
                    tooltip.textContent = item.dataset.description;
                    tooltip.dataset.forId = item.dataset.id;
                }
                tooltip.classList.add('visible');
                tooltip.style.left = (e.clientX + 14) + 'px';
                tooltip.style.top = (e.clientY + 14) + 'px';
            });
            list.addEventListener('mouseleave', () => {
                tooltip.classList.remove('visible');
                tooltip.dataset.forId = '';
            });
        });
    }

    // ===== Detail Panel =====
    toggleDetailPanel(id) {
        if (this.expandedTaskId === id) {
            this.expandedTaskId = null;
        } else {
            this.expandedTaskId = id;
        }
        this.render();
    }

    setupDetailPanel(panel, todoId) {
        const todo = this.todos.find(t => t.id === todoId);
        if (!todo) return;

        // Priority chips
        panel.querySelectorAll('.detail-priority-chip').forEach(chip => {
            chip.addEventListener('click', async () => {
                panel.querySelectorAll('.detail-priority-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                todo.priority = chip.dataset.priority;
                await StorageManager.put('todos', todo);
                this._syncTodo(todo);
                this.render();
            });
        });

        // Description
        const descField = panel.querySelector('.detail-description');
        if (descField) {
            descField.addEventListener('change', async () => {
                todo.description = descField.value.trim();
                await StorageManager.put('todos', todo);
                this._syncTodo(todo);
            });
        }

        // Deadline
        const deadlineField = panel.querySelector('.detail-deadline');
        if (deadlineField) {
            deadlineField.addEventListener('change', async () => {
                todo.deadline = deadlineField.value || null;
                await StorageManager.put('todos', todo);
                this._syncTodo(todo);
                this.render();
            });
        }

        // Project assignment
        const projectSelect = panel.querySelector('.detail-project-select');
        if (projectSelect) {
            projectSelect.addEventListener('change', async () => {
                const oldParentId = todo.parentId;
                const newParentId = projectSelect.value ? parseInt(projectSelect.value) : null;
                todo.parentId = newParentId;
                await StorageManager.put('todos', todo);
                this._syncTodo(todo);

                if (newParentId) {
                    const newParent = this.todos.find(t => t.id === newParentId);
                    if (newParent && newParent.completed && !todo.completed) {
                        newParent.completed = false;
                        await StorageManager.put('todos', newParent);
                        this._syncTodo(newParent);
                    }
                }
                if (oldParentId) {
                    const oldParent = this.todos.find(t => t.id === oldParentId);
                    if (oldParent) {
                        const remaining = this.getSubtasks(oldParentId);
                        oldParent.completed = remaining.length > 0 && remaining.every(t => t.completed);
                        await StorageManager.put('todos', oldParent);
                        this._syncTodo(oldParent);
                    }
                }
                this.render();
            });
        }

        // Recurrence select in detail panel
        const recurrenceField = panel.querySelector('.detail-recurrence-select');
        if (recurrenceField) {
            recurrenceField.addEventListener('change', async () => {
                const val = recurrenceField.value;
                if (!val) {
                    todo.recurrence = null;
                } else if (val === 'custom') {
                    const interval = parseInt(panel.querySelector('.detail-custom-interval')?.value) || 3;
                    todo.recurrence = { type: 'custom', interval };
                } else {
                    todo.recurrence = { type: val, interval: 1 };
                }
                await StorageManager.put('todos', todo);
                this._syncTodo(todo);
                this.render();
            });

            const customField = panel.querySelector('.detail-custom-interval');
            if (customField) {
                customField.addEventListener('change', async () => {
                    if (todo.recurrence && todo.recurrence.type === 'custom') {
                        todo.recurrence.interval = parseInt(customField.value) || 3;
                        await StorageManager.put('todos', todo);
                        this._syncTodo(todo);
                    }
                });
            }
        }
    }

    // ===== Task Click Handler (event delegation) =====
    handleTaskClick(e) {
        const item = e.target.closest('.todo-item');
        if (!item) return;
        const id = parseInt(item.dataset.id);

        // Checkbox
        if (e.target.type === 'checkbox') {
            this.toggleTodo(id);
            return;
        }

        // Priority dot click -> cycle
        if (e.target.closest('.priority-dot')) {
            e.stopPropagation();
            this.cyclePriority(id);
            return;
        }

        // Overflow menu toggle
        const menuBtn = e.target.closest('.todo-menu-btn');
        if (menuBtn) {
            e.stopPropagation();
            this.toggleTodoMenu(menuBtn);
            return;
        }

        // Overflow menu item
        const menuItem = e.target.closest('.todo-menu-item');
        if (menuItem) {
            e.stopPropagation();
            this.closeAllTodoMenus();
            switch (menuItem.dataset.action) {
                case 'move-up': this.moveTodo(id, 'up'); break;
                case 'move-down': this.moveTodo(id, 'down'); break;
                case 'add-subtask': this.startSubtaskComposer(id); break;
                case 'delete': this.deleteTodo(id); break;
            }
            return;
        }

        // Click on the row → toggle detail panel, delayed just long enough
        // that a following dblclick (rename) can cancel it instead
        if (e.target.closest('.todo-row-main')) {
            clearTimeout(this._contentClickTimer);
            this._contentClickTimer = setTimeout(() => {
                this.toggleDetailPanel(id);
            }, 250);
            return;
        }
    }

    // Enter/Space activation for elements that aren't native buttons
    // (the priority dot is a <span role="button"> so it needs this manually).
    handleTaskKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const dot = e.target.closest('.priority-dot');
        if (!dot) return;

        e.preventDefault();
        const item = dot.closest('.todo-item');
        if (!item) return;
        this.cyclePriority(parseInt(item.dataset.id));
    }

    // ===== Close Everything =====
    closeAllPanels() {
        if (document.querySelector('.todo-menu:not([hidden])')) {
            this.closeAllTodoMenus();
            return;
        }

        const overlay = document.getElementById('shortcutsOverlay');
        if (overlay.classList.contains('visible')) {
            this.hideShortcuts();
            return;
        }

        // Clear search
        if (this.searchTerm) {
            this.searchTerm = '';
            document.getElementById('searchInput').value = '';
            document.getElementById('searchClear').classList.remove('visible');
            this.render();
            return;
        }

        const composer = document.getElementById('composer');
        if (composer.classList.contains('expanded')) {
            document.getElementById('todoInput').blur();
            composer.classList.remove('expanded');
            // Escape means abandon the entry, not just hide it — otherwise a
            // stray deadline/priority/project silently carries into the next task.
            this.resetComposer();
            return;
        }

        if (this.expandedTaskId !== null) {
            this.expandedTaskId = null;
            this.render();
            return;
        }

        if (this.inlineEditId !== null) {
            this.inlineEditId = null;
            this.render();
            return;
        }
    }

    // ===== Shortcuts Overlay =====
    toggleShortcuts() {
        const overlay = document.getElementById('shortcutsOverlay');
        overlay.classList.toggle('visible');
    }

    hideShortcuts() {
        document.getElementById('shortcutsOverlay').classList.remove('visible');
    }

    // ===== View Mode (Date / Project toggle) =====
    // The board always shows every active column at once — this only
    // decides what the columns MEAN, not which one is visible. Date mode's
    // columns are the deadline buckets; Project mode's are each project
    // plus "No Project". Same board mechanic, different grouping axis.
    setViewMode(mode) {
        this.uiState.viewMode = mode;
        this.saveUIState();
        this.render();
    }

    // ===== Search Helpers =====
    matchesSearch(todo) {
        if (!this.searchTerm) return true;
        const term = this.searchTerm.toLowerCase();
        if (todo.text.toLowerCase().includes(term)) return true;
        if (todo.description && todo.description.toLowerCase().includes(term)) return true;
        // Check project name
        if (todo.parentId) {
            const parent = this.todos.find(t => t.id === todo.parentId);
            if (parent && parent.text.toLowerCase().includes(term)) return true;
        }
        if (todo.isProject && todo.text.toLowerCase().includes(term)) return true;
        return false;
    }

    // ===== Deadline Helpers =====
    getDeadlineStatus(deadline) {
        if (!deadline) return 'none';
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const [y, m, d] = deadline.split('-').map(Number);
        const dd = new Date(y, m - 1, d); dd.setHours(0, 0, 0, 0);
        const diff = Math.ceil((dd - today) / 86400000);
        if (diff < 0) return 'overdue';
        if (diff === 0) return 'today';
        if (diff <= 2) return 'soon';
        return 'future';
    }

    getDeadlineGroup(deadline) {
        if (!deadline) return 'nodeadline';
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const [y, m, d] = deadline.split('-').map(Number);
        const dd = new Date(y, m - 1, d); dd.setHours(0, 0, 0, 0);
        const diff = Math.ceil((dd - today) / 86400000);
        if (diff < 0) return 'overdue';
        if (diff === 0) return 'today';
        if (diff >= 1 && diff <= 7) return 'upcoming';
        return 'later';
    }

    formatDeadline(deadline) {
        if (!deadline) return '';
        const [y, m, d] = deadline.split('-').map(Number);
        const dd = new Date(y, m - 1, d); dd.setHours(0, 0, 0, 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.ceil((dd - today) / 86400000);
        const formatted = dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (diff < 0) return `${formatted} (${Math.abs(diff)}d overdue)`;
        if (diff === 0) return `${formatted} (Today)`;
        if (diff === 1) return `${formatted} (Tomorrow)`;
        if (diff <= 7) return `${formatted} (${diff}d)`;
        return formatted;
    }

    // ===== Recurrence Label =====
    getRecurrenceLabel(recurrence) {
        if (!recurrence) return '';
        switch (recurrence.type) {
            case 'daily': return recurrence.interval > 1 ? `every ${recurrence.interval}d` : 'daily';
            case 'weekly': return recurrence.interval > 1 ? `every ${recurrence.interval}w` : 'weekly';
            case 'monthly': return recurrence.interval > 1 ? `every ${recurrence.interval}mo` : 'monthly';
            case 'custom': return `every ${recurrence.interval}d`;
            default: return '';
        }
    }

    // Compact "when" text (replaces the old circular date-rail node) —
    // weekday + day, colored by urgency, no fixed-size badge to make room for.
    renderDateText(todo) {
        if (!todo.deadline) {
            return `<span class="todo-date-text todo-date-none">&ndash;</span>`;
        }
        const status = this.getDeadlineStatus(todo.deadline);
        const [y, m, d] = todo.deadline.split('-').map(Number);
        const dd = new Date(y, m - 1, d);
        const weekday = dd.toLocaleDateString('en-US', { weekday: 'short' });
        return `<span class="todo-date-text todo-date-${status}" title="${this.formatDeadline(todo.deadline)}">${weekday} ${dd.getDate()}</span>`;
    }

    // Character-limited description preview — the full text is still
    // available via the existing cursor-follow tooltip (setupDescriptionTooltip),
    // driven by data-description on the <li>, not by this truncated text.
    truncateDescription(text, limit = 60) {
        if (text.length <= limit) return text;
        return text.slice(0, limit).trimEnd() + '…';
    }

    // ===== Unified Render =====
    // Every task is a flat card — no nesting. A task that belongs to a
    // project shows a small colored tab on its own corner instead (see
    // getProjectColor); suppressTab skips it inside that project's own
    // column in Project view, where the grouping is already the column.
    renderTask(todo, options = {}) {
        const priority = todo.priority || 'medium';
        const isExpanded = this.expandedTaskId === todo.id;
        const isProject = todo.isProject;
        const isNewlyAdded = this.lastAddedId === todo.id;
        const hasTab = !isProject && !!todo.parentId && !options.suppressTab;

        let classes = 'todo-item todo-priority-' + priority;
        if (todo.completed) classes += ' completed';
        if (isProject) classes += ' project-item';
        if (isNewlyAdded) classes += ' anim-add';
        if (isExpanded) classes += ' expanded-row';
        if (hasTab) classes += ' has-tab';

        let tabHtml = '';
        if (hasTab) {
            const project = this.todos.find(t => t.id === todo.parentId);
            if (project) {
                tabHtml = `<div class="project-tab" style="background:${this.getProjectColor(project.id)};">${this.escapeHtml(project.text)}</div>`;
            }
        }

        // Leading icon: priority dot for a normal task, folder for a project's own row
        const priorityAnimClass = this._animPriorityId === todo.id ? ' anim-pulse' : '';
        const leadIcon = isProject
            ? `<i class="fa-solid fa-folder project-icon"></i>`
            : `<span class="priority-dot priority-${priority}${priorityAnimClass}" tabindex="0" role="button" aria-label="Priority: ${priority}. Click to cycle." title="Click to cycle priority"></span>`;

        // Trailing text: a project's own row shows its progress instead of a date
        let trailingHtml;
        if (isProject) {
            const progress = this.getProjectProgress(todo.id);
            trailingHtml = progress.total > 0
                ? `<span class="todo-date-text">${progress.completed}/${progress.total}</span>`
                : this.renderDateText(todo);
        } else {
            trailingHtml = this.renderDateText(todo);
        }

        const recurringHtml = todo.recurrence
            ? `<span class="recurring-badge"><i class="fa-solid fa-repeat"></i> <span>${this.getRecurrenceLabel(todo.recurrence)}</span></span>`
            : '';

        // Checkbox class for animation
        const checkboxClass = (this._animCheckId === todo.id && todo.completed) ? 'anim-check-bounce' : '';

        // Overflow menu — one button replaces the old row of separate buttons
        const menuItems = [];
        if (isProject) {
            menuItems.push(`<button class="todo-menu-item" data-action="add-subtask" role="menuitem">Add subtask</button>`);
        }
        if (!todo.completed) {
            menuItems.push(`<button class="todo-menu-item" data-action="move-up" role="menuitem">Move up</button>`);
            menuItems.push(`<button class="todo-menu-item" data-action="move-down" role="menuitem">Move down</button>`);
        }
        menuItems.push(`<button class="todo-menu-item todo-menu-item-danger" data-action="delete" role="menuitem">Delete</button>`);
        const menuHtml = `
            <div class="todo-menu-wrap">
                <button class="todo-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="More actions">&#8943;</button>
                <div class="todo-menu" role="menu" hidden>${menuItems.join('')}</div>
            </div>
        `;

        const descHtml = todo.description
            ? `<div class="todo-desc-preview">${this.escapeHtml(this.truncateDescription(todo.description))}</div>`
            : '';

        const dragHandle = todo.completed ? '' : `<i class="fa-solid fa-grip-vertical drag-handle"></i>`;

        let html = `
            <li class="${classes}" data-id="${todo.id}" draggable="${!todo.completed}"${todo.description ? ` data-description="${this.escapeAttr(todo.description)}"` : ''}>
                ${tabHtml}
                <div class="todo-row-main">
                    ${dragHandle}
                    <input type="checkbox" class="${checkboxClass}" ${todo.completed ? 'checked' : ''}>
                    ${leadIcon}
                    <span class="todo-text">${this.escapeHtml(todo.text)}</span>
                    ${recurringHtml}
                    ${trailingHtml}
                    ${menuHtml}
                </div>
                ${descHtml}
            </li>
        `;

        // The detail panel now renders into the side drawer (see
        // renderDetailDrawer) instead of expanding inline below the row.
        return html;
    }

    renderDetailPanel(todo) {
        const priority = todo.priority || 'medium';
        const projects = this.todos.filter(t => t.isProject && t.id !== todo.id && !t.completed);

        let projectOptions = '<option value="">None</option>';
        projects.forEach(p => {
            const sel = todo.parentId === p.id ? 'selected' : '';
            projectOptions += `<option value="${p.id}" ${sel}>${this.escapeHtml(p.text)}</option>`;
        });

        // Recurrence select
        const recType = todo.recurrence ? todo.recurrence.type : '';
        const recInterval = todo.recurrence ? todo.recurrence.interval : 3;
        const showCustom = recType === 'custom' ? 'flex' : 'none';

        let recurrenceHtml = '';
        if (!todo.isProject) {
            recurrenceHtml = `
                <div class="detail-field">
                    <label>Recurrence</label>
                    <select class="detail-recurrence-select">
                        <option value="">None</option>
                        <option value="daily" ${recType === 'daily' ? 'selected' : ''}>Daily</option>
                        <option value="weekly" ${recType === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="monthly" ${recType === 'monthly' ? 'selected' : ''}>Monthly</option>
                        <option value="custom" ${recType === 'custom' ? 'selected' : ''}>Custom</option>
                    </select>
                </div>
                <div class="detail-field" style="display:${showCustom};">
                    <label>Days</label>
                    <input type="number" class="detail-custom-interval" min="1" value="${recInterval}" style="width:60px;">
                </div>
            `;
        }

        return `
            <div class="detail-panel open" data-detail-id="${todo.id}">
                <div class="detail-row">
                    <div class="detail-field">
                        <label>Priority</label>
                        <div class="detail-priority-chips">
                            <button class="detail-priority-chip chip-low ${priority === 'low' ? 'active' : ''}" data-priority="low">Low</button>
                            <button class="detail-priority-chip chip-med ${priority === 'medium' ? 'active' : ''}" data-priority="medium">Med</button>
                            <button class="detail-priority-chip chip-high ${priority === 'high' ? 'active' : ''}" data-priority="high">High</button>
                        </div>
                    </div>
                    <div class="detail-field">
                        <label>Deadline</label>
                        <input type="date" class="detail-deadline" value="${todo.deadline || ''}">
                    </div>
                    ${!todo.isProject ? `
                        <div class="detail-field detail-field-grow">
                            <label>Project</label>
                            <select class="detail-project-select">${projectOptions}</select>
                        </div>
                    ` : ''}
                </div>
                <div class="detail-row">
                    ${recurrenceHtml}
                </div>
                <div class="detail-row">
                    <div class="detail-field detail-field-grow">
                        <label>Description</label>
                        <textarea class="detail-description" rows="2">${this.escapeHtml(todo.description || '')}</textarea>
                    </div>
                </div>
            </div>
        `;
    }

    // ===== Empty State =====
    renderEmptyState() {
        const hasAnyTasks = this.todos.length > 0;
        const allCompleted = hasAnyTasks && this.todos.every(t => t.completed);

        if (this.searchTerm) {
            return `<div class="empty-state">
                <div class="empty-state-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                <div class="empty-state-msg">No tasks match your search</div>
            </div>`;
        }
        if (allCompleted) {
            return `<div class="empty-state">
                <div class="empty-state-icon"><i class="fa-solid fa-circle-check"></i></div>
                <div class="empty-state-msg">All caught up!</div>
            </div>`;
        }
        return `<div class="empty-state">
            <div class="empty-state-icon"><i class="fa-solid fa-clipboard-list"></i></div>
            <div class="empty-state-msg">No tasks yet. Add one above!</div>
        </div>`;
    }

    // ===== Populate Project Dropdown =====
    populateParentProjectDropdown() {
        const dropdown = document.getElementById('parentProjectSelect');
        const projects = this.todos.filter(t => t.isProject && !t.completed);
        dropdown.innerHTML = '<option value="">None</option>';
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.text;
            dropdown.appendChild(opt);
        });
    }

    // ===== Sort Function =====
    getSortFn() {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return (a, b) => {
            // Sort by order first if set
            if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
                return a.order - b.order;
            }
            const pd = priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium'];
            if (pd !== 0) return pd;
            const ad = a.deadline ? new Date(a.deadline) : null;
            const bd = b.deadline ? new Date(b.deadline) : null;
            if (!ad && !bd) return 0;
            if (!ad) return 1;
            if (!bd) return -1;
            return ad - bd;
        };
    }

    // Every task renders as a flat, independent card — no nesting. A
    // project's own card and its subtasks are just peers in the same list;
    // what belongs together shows via the project tab on each card (see
    // renderTask), not via a container.
    renderTaskRows(list, suppressTab) {
        return list.map(todo => this.renderTask(todo, { suppressTab })).join('');
    }

    // One column's markup: header (icon, label, count, optional project
    // progress bar) plus its row list. `colorRole` picks the header's
    // accent (overdue/today/upcoming/later/project/neutral) via CSS class,
    // not an inline color, so it still adapts across all 8 themes.
    renderColumn(opts) {
        const { key, icon, label, count, tasks, suppressTab, colorRole, animSettle, progressPct } = opts;
        const rowsHtml = tasks.length
            ? this.renderTaskRows(tasks, suppressTab)
            : `<li class="board-column-empty">Nothing here</li>`;
        const progressHtml = progressPct !== undefined
            ? `<div class="board-column-progress"><div class="board-column-progress-fill" style="transform:scaleX(${progressPct / 100})"></div></div>`
            : '';
        return `
            <div class="board-column" data-column-key="${key}">
                <div class="board-column-header board-column-header-${colorRole}">
                    <i class="fa-solid ${icon}"></i>
                    <span class="board-column-label">${this.escapeHtml(label)}</span>
                    <span class="board-column-count${animSettle ? ' anim-settle' : ''}">${count}</span>
                </div>
                ${progressHtml}
                <ul class="agenda-lane-list board-column-list">${rowsHtml}</ul>
            </div>
        `;
    }

    // ===== Board: a real kanban instead of one scrolling column =====
    // Every active column renders at once — the Date/Project toggle only
    // decides what the columns MEAN (deadline bucket vs. project), never
    // which one is visible. Overdue and No Deadline only appear when they
    // have something in them; Today/Upcoming/Later are the board's fixed
    // anchors and always show, empty or not, so the structure stays stable.
    renderBoard() {
        const board = document.getElementById('boardColumns');
        if (!board) return;

        this.populateParentProjectDropdown();
        const sortFn = this.getSortFn();
        const isSearchActive = this.searchTerm.length > 0;
        const activeTasks = this.todos.filter(t => !t.completed);

        const archiveCountEl = document.getElementById('archiveCount');
        if (archiveCountEl) archiveCountEl.textContent = this.todos.filter(t => t.completed && !t.parentId).length;

        if (isSearchActive) {
            const results = activeTasks.filter(t => this.matchesSearch(t)).sort(sortFn);
            board.innerHTML = this.renderColumn({
                key: 'search', icon: 'fa-magnifying-glass', label: 'Search results',
                count: results.length, tasks: results, colorRole: 'neutral'
            });
            this.finishBoardRender(board);
            return;
        }

        const mode = this.uiState.viewMode || 'date';
        const columns = [];

        if (mode === 'project') {
            const projects = activeTasks.filter(t => t.isProject).sort(sortFn);
            const standalone = activeTasks.filter(t => !t.isProject && !t.parentId).sort(sortFn);

            projects.forEach(p => {
                const progress = this.getProjectProgress(p.id);
                const activeSubtasks = this.getSubtasks(p.id).filter(t => !t.completed).sort(sortFn);
                columns.push({
                    key: 'project-' + p.id, icon: 'fa-folder', label: p.text,
                    count: activeSubtasks.length, tasks: [p, ...activeSubtasks], suppressTab: true, colorRole: 'project',
                    progressPct: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
                });
            });
            if (standalone.length > 0 || projects.length === 0) {
                columns.push({
                    key: 'noproject', icon: 'fa-inbox', label: 'No Project',
                    count: standalone.length, tasks: standalone, colorRole: 'neutral'
                });
            }
        } else {
            // Every active task — project, standalone, or subtask — is now a
            // flat card bucketed by its own deadline; a subtask no longer
            // has to sit nested under its parent to be visible here.
            const groups = { overdue: [], today: [], upcoming: [], later: [], nodeadline: [] };
            activeTasks.forEach(t => groups[this.getDeadlineGroup(t.deadline)].push(t));
            Object.keys(groups).forEach(k => groups[k].sort(sortFn));

            const todayCount = groups.today.length;
            const didChange = this._lastTodayCount !== null && this._lastTodayCount !== todayCount;
            this._lastTodayCount = todayCount;

            if (groups.overdue.length > 0) {
                columns.push({ key: 'overdue', icon: 'fa-triangle-exclamation', label: 'Overdue', count: groups.overdue.length, tasks: groups.overdue, colorRole: 'overdue' });
            }
            columns.push({ key: 'today', icon: 'fa-star', label: 'Today', count: todayCount, tasks: groups.today, colorRole: 'today', animSettle: didChange });
            columns.push({ key: 'upcoming', icon: 'fa-calendar-week', label: 'Upcoming', count: groups.upcoming.length, tasks: groups.upcoming, colorRole: 'upcoming' });
            columns.push({ key: 'later', icon: 'fa-calendar', label: 'Later', count: groups.later.length, tasks: groups.later, colorRole: 'later' });
            if (groups.nodeadline.length > 0) {
                columns.push({ key: 'nodeadline', icon: 'fa-inbox', label: 'No Deadline', count: groups.nodeadline.length, tasks: groups.nodeadline, colorRole: 'neutral' });
            }
        }

        board.innerHTML = columns.length
            ? columns.map(c => this.renderColumn(c)).join('')
            : this.renderEmptyState();
        this.finishBoardRender(board);
    }

    // Steps every render needs after the board's HTML lands: wire
    // drag-and-drop, one column list at a time so dragging never
    // accidentally crosses into a column's own semantics.
    finishBoardRender(board) {
        board.querySelectorAll('.board-column-list').forEach(list => {
            this.setupDragListeners(list);
        });
    }

    // ===== Completed Overlay =====
    openCompletedOverlay() {
        this._completedOverlayOpen = true;
        this.renderCompletedOverlay();
        document.getElementById('completedOverlay').classList.add('open');
    }

    closeCompletedOverlay() {
        this._completedOverlayOpen = false;
        document.getElementById('completedOverlay').classList.remove('open');
    }

    renderCompletedOverlay() {
        const body = document.getElementById('completedOverlayBody');
        if (!body) return;
        const sortFn = this.getSortFn();
        const completedTodos = this.todos.filter(t => t.completed && !t.parentId).sort(sortFn);
        body.innerHTML = completedTodos.length
            ? `<ul class="agenda-lane-list">${completedTodos.map(t => this.renderTask(t)).join('')}</ul>`
            : `<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-box"></i></div><div class="empty-state-msg">Nothing completed yet</div></div>`;
    }

    // ===== Main Render =====
    render() {
        this.renderBoard();

        if (this._completedOverlayOpen) this.renderCompletedOverlay();

        // Detail drawer (side panel, replaces the old inline expansion)
        this.renderDetailDrawer();

        // Clear animation flags after render
        this.lastAddedId = null;
        this._animCheckId = null;
        this._animPriorityId = null;
    }

    // ===== Detail Drawer =====
    renderDetailDrawer() {
        const drawer = document.getElementById('detailDrawer');
        const body = document.getElementById('detailDrawerBody');
        const title = document.getElementById('detailDrawerTitle');
        if (!drawer || !body || !title) return;

        const todo = this.expandedTaskId !== null ? this.todos.find(t => t.id === this.expandedTaskId) : null;

        if (!todo) {
            drawer.classList.remove('open');
            title.textContent = '';
            body.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-list-check"></i></div>
                    <div class="empty-state-msg">Select a task to see its details</div>
                </div>
            `;
            return;
        }

        title.textContent = todo.text;
        body.innerHTML = this.renderDetailPanel(todo);
        drawer.classList.add('open');

        const panel = body.querySelector('.detail-panel[data-detail-id]');
        if (panel) this.setupDetailPanel(panel, todo.id);
    }

    // ===== Task Edit Modal =====
    // Double-clicking a card anywhere but its title opens this: a shorthand
    // quick-edit bar (the same live-colored ::h/::p[Name]/::daily input and
    // project autocomplete the composer uses) above the same structured
    // fields the side drawer already renders — one line to type or one
    // click, and every field still saves instantly either way.
    openTaskEditModal(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;
        this._taskEditId = id;

        const modal = document.getElementById('taskEditModal');
        const input = document.getElementById('taskEditInput');
        input.value = todo.text;
        this.closeProjectSuggestions('taskEditSuggestions');
        this.renderTaskEditDetailBody(todo);

        modal.classList.add('open');
        input.focus();
        // Cursor at the end, not select-all — the text sits right where
        // you'd start typing more shorthand. The input's own text is
        // transparent (the highlight layer underneath is what's visible),
        // so this has to run after focusing, not before: rendering it here
        // is what actually makes the title readable at all.
        const end = input.value.length;
        input.setSelectionRange(end, end);
        this.updateComposerHighlight('taskEditInput', 'taskEditInputHighlight');
    }

    closeTaskEditModal() {
        document.getElementById('taskEditModal').classList.remove('open');
        this.closeProjectSuggestions('taskEditSuggestions');
        this._taskEditId = null;
    }

    renderTaskEditDetailBody(todo) {
        const body = document.getElementById('taskEditDetailBody');
        body.innerHTML = this.renderDetailPanel(todo);
        const panel = body.querySelector('.detail-panel[data-detail-id]');
        if (panel) this.setupDetailPanel(panel, todo.id);
    }

    // Parses the quick-edit bar the same way the composer parses a new
    // task — any shorthand tokens found override the matching field,
    // whatever isn't mentioned keeps its current value (never cleared by
    // omission), then the structured fields below re-render to match.
    async applyTaskEditShorthand() {
        const id = this._taskEditId;
        if (id === null || id === undefined) return;
        const todo = this.todos.find(t => t.id === id);
        const input = document.getElementById('taskEditInput');
        if (!todo || !input) return;

        const text = input.value.trim();
        if (!text) return;
        const parsed = this.parseShorthand(text);

        todo.text = parsed.text || todo.text;
        if (parsed.priority) todo.priority = parsed.priority;
        if (parsed.deadline) todo.deadline = parsed.deadline;
        if (parsed.recurrence) todo.recurrence = parsed.recurrence;
        if (parsed.projectName) {
            const newParentId = await this.findOrCreateProject(parsed.projectName);
            if (newParentId !== todo.parentId) {
                await this.reassignProject(todo, this.todos.find(t => t.id === newParentId));
            }
        }

        await StorageManager.put('todos', todo);
        this._syncTodo(todo);

        input.value = todo.text;
        this.closeProjectSuggestions('taskEditSuggestions');
        this.updateComposerHighlight('taskEditInput', 'taskEditInputHighlight');
        this.renderTaskEditDetailBody(todo);
        this.render();
    }

    // ===== Firebase Sync Helpers =====

    _syncTodo(todo) {
        if (typeof FirebaseSync !== 'undefined' && FirebaseSync.isSignedIn()) {
            FirebaseSync.pushTodo(todo);
        }
    }

    _deleteTodoFromCloud(id) {
        if (typeof FirebaseSync !== 'undefined' && FirebaseSync.isSignedIn()) {
            FirebaseSync.deleteTodo(id);
        }
    }

    async handleRemoteTodos(remoteTodos) {
        const remoteMap = new Map();
        for (const t of remoteTodos) {
            const { _syncedAt, _firestoreId, ...clean } = t;
            remoteMap.set(clean.id, clean);
        }

        // Diff in memory, then write as a single batched transaction —
        // onSnapshot delivers the whole collection on every sign-in, so a
        // per-item await here serialized one IndexedDB transaction per todo.
        const toPut = [];
        for (const [id, remote] of remoteMap) {
            const localIdx = this.todos.findIndex(t => t.id === id);
            if (localIdx === -1) {
                this.todos.push(remote);
                toPut.push(remote);
            } else {
                const local = this.todos[localIdx];
                if (JSON.stringify(local) !== JSON.stringify(remote)) {
                    this.todos[localIdx] = remote;
                    toPut.push(remote);
                }
            }
        }

        if (toPut.length > 0) {
            await StorageManager.putAll('todos', toPut);
        }

        if (toPut.length > 0) this.render();
    }

    async handleAuthChange(user) {
        this.updateAuthUI(user);
        if (user && typeof FirebaseSync !== 'undefined' && FirebaseSync.needsTodosMerge()) {
            const merged = await FirebaseSync.mergeOnFirstLoginTodos(this.todos);
            this.todos = merged;
            await StorageManager.putAll('todos', this.todos);
            this.render();
        }
    }

    updateAuthUI(user) {
        const signInBtn = document.getElementById('signInBtn');
        const userInfo = document.getElementById('userInfo');
        if (!signInBtn || !userInfo) return;

        if (user) {
            signInBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            const avatar = document.getElementById('userAvatar');
            const name = document.getElementById('userName');
            if (avatar) avatar.src = user.photoURL || this.generateFallbackAvatar(user);
            if (name) name.textContent = user.displayName || user.email || '';
        } else {
            signInBtn.style.display = '';
            userInfo.style.display = 'none';
        }
    }

    // Accounts without a Google profile photo would otherwise render a
    // broken-image box (an empty <img src>) once #userInfo becomes visible.
    generateFallbackAvatar(user) {
        const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
        const styles = getComputedStyle(document.documentElement);
        const accent = styles.getPropertyValue('--accent-primary').trim() || '#74a12e';
        const bg = styles.getPropertyValue('--bg-primary').trim() || '#1a1a1a';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">`
            + `<rect width="28" height="28" rx="14" fill="${accent}"/>`
            + `<text x="14" y="19" font-family="Raleway, sans-serif" font-size="13" font-weight="700" `
            + `fill="${bg}" text-anchor="middle">${initial}</text></svg>`;
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    updateSyncStatusUI(status) {
        const syncStatus = document.getElementById('syncStatus');
        const syncDot = document.getElementById('syncDot');
        const syncLabel = document.getElementById('syncLabel');
        if (!syncStatus || !syncDot || !syncLabel) return;

        if (!status) {
            syncStatus.style.display = 'none';
            return;
        }
        syncStatus.style.display = 'flex';
        syncDot.className = 'sync-status-dot ' + status;
        const labels = { syncing: 'Syncing...', synced: 'Synced', error: 'Sync error', offline: 'Offline' };
        syncLabel.textContent = labels[status] || status;
    }

    async handleSignIn() {
        if (typeof FirebaseSync === 'undefined') return;
        try {
            await FirebaseSync.signInWithGoogle();
        } catch (error) {
            console.error('Sign-in failed:', error);
        }
    }

    async handleSignOut() {
        if (typeof FirebaseSync === 'undefined') return;
        try {
            await FirebaseSync.signOut();
        } catch (error) {
            console.error('Sign-out failed:', error);
        }
    }

    // ===== Export/Import =====
    exportTodos() {
        const dataStr = JSON.stringify(this.todos, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `todos-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Returns a Promise resolving to 'append' | 'replace' | 'cancel'.
    showImportChoice(count) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('importChoiceOverlay');
            document.getElementById('importChoiceCount').textContent = count;

            const appendBtn = document.getElementById('importChoiceAppend');
            const replaceBtn = document.getElementById('importChoiceReplace');
            const cancelBtn = document.getElementById('importChoiceCancel');

            const cleanup = (result) => {
                overlay.classList.remove('visible');
                appendBtn.removeEventListener('click', onAppend);
                replaceBtn.removeEventListener('click', onReplace);
                cancelBtn.removeEventListener('click', onCancel);
                document.removeEventListener('keydown', onKeydown);
                resolve(result);
            };

            const onAppend = () => cleanup('append');
            const onReplace = () => cleanup('replace');
            const onCancel = () => cleanup('cancel');
            const onKeydown = (e) => {
                if (e.key === 'Escape') cleanup('cancel');
            };

            appendBtn.addEventListener('click', onAppend);
            replaceBtn.addEventListener('click', onReplace);
            cancelBtn.addEventListener('click', onCancel);
            document.addEventListener('keydown', onKeydown);

            overlay.classList.add('visible');
        });
    }

    async importTodos(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) {
                    this.showUndoToast('Invalid file — expected a JSON array of tasks.', false);
                    return;
                }

                const choice = await this.showImportChoice(imported.length);
                if (choice === 'cancel') return;

                if (choice === 'replace') {
                    // Deferred: queues an undo-toast window before anything
                    // is actually cleared from storage, same as task deletes.
                    this.queuePendingImportReplace(imported);
                    return;
                }

                const maxId = this.todos.length > 0 ? Math.max(...this.todos.map(t => t.id)) : 0;
                imported.forEach((todo, i) => {
                    todo.id = maxId + i + 1;
                    if (todo.order === undefined) todo.order = todo.id;
                    if (todo.recurrence === undefined) todo.recurrence = null;
                    this.todos.push(todo);
                });

                await this.saveTodos();
                this.render();
                this.showUndoToast(`${imported.length} task(s) imported`, false);
            } catch (error) {
                this.showUndoToast("Couldn't read that file — make sure it's valid JSON.", false);
                console.error(error);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // ===== Utility =====
    // Local calendar date as YYYY-MM-DD. toISOString() converts to UTC first, which
    // silently shifts to the next/previous day for part of every day outside UTC —
    // that mismatch was making ::today/::tomorrow deadlines land in "Upcoming"
    // instead of "Today" since the grouping logic below is local-time based.
    toLocalDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeAttr(text) {
        return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

// Initialize
let todoApp;
document.addEventListener('DOMContentLoaded', async () => {
    todoApp = new TodoApp();
    await todoApp.init();
});
