/**
 * To-Do App — Redesigned UX + Phase 2 Enhancements
 * Uses IndexedDB for storage via shared StorageManager
 */

class TodoApp {
    constructor() {
        this.todos = [];
        this.expandedTaskId = null;
        this.inlineEditId = null;
        this.inlineSubtaskProjectId = null;

        // Undo system
        this.pendingDelete = null; // { todos: [...], timer: timeoutId, message: string }

        // Drag-and-drop
        this.draggedId = null;

        // Search
        this.searchTerm = '';

        // Track last added ID for animation
        this.lastAddedId = null;

        // UI state (persisted)
        this.uiState = {
            collapsedProjects: [],
            activeFilter: 'all',
            statsOpen: false,
            completedOpen: true,
            collapsedDateGroups: []
        };
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
        const statsToggleBtn = document.getElementById('statsToggleBtn');
        const completedHeader = document.getElementById('completedHeader');
        const clearCompleted = document.getElementById('clearCompleted');
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
            if (e.key === 'Enter') this.addTodo();
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

        // Composer: live shorthand preview
        todoInput.addEventListener('input', () => this.updateShorthandPreview());

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

        // Stats toggle
        statsToggleBtn.addEventListener('click', () => {
            this.uiState.statsOpen = !this.uiState.statsOpen;
            this.applyStatsState();
            this.saveUIState();
        });

        // Completed section toggle
        completedHeader.addEventListener('click', (e) => {
            if (e.target.closest('.clear-completed-btn')) return;
            this.uiState.completedOpen = !this.uiState.completedOpen;
            this.applyCompletedState();
            this.saveUIState();
        });

        // Clear completed
        clearCompleted.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearCompleted();
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

        // Undo toast
        undoToastBtn.addEventListener('click', () => this.undoDelete());
        undoToastDismiss.addEventListener('click', () => this.finalizeDelete());

        // Auth buttons (optional — only present when Firebase scripts are loaded)
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        if (signInBtn) signInBtn.addEventListener('click', () => this.handleSignIn());
        if (signOutBtn) signOutBtn.addEventListener('click', () => this.handleSignOut());

        // Event delegation for task list interactions
        document.getElementById('todoList').addEventListener('click', (e) => this.handleTaskClick(e));
        document.getElementById('completedList').addEventListener('click', (e) => this.handleTaskClick(e));

        // Double-click for inline edit
        document.getElementById('todoList').addEventListener('dblclick', (e) => this.handleDoubleClick(e));

        // Date group header clicks
        document.getElementById('todoList').addEventListener('click', (e) => {
            const header = e.target.closest('.date-group-header');
            if (header) {
                const group = header.dataset.group;
                this.toggleDateGroupCollapse(group);
            }
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

    resetComposer() {
        document.getElementById('todoInput').value = '';
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
            deadline = new Date().toISOString().split('T')[0];
            cleanText = cleanText.replace(/::today\b/gi, '');
        } else if (/::tomorrow\b/i.test(text)) {
            const d = new Date(); d.setDate(d.getDate() + 1);
            deadline = d.toISOString().split('T')[0];
            cleanText = cleanText.replace(/::tomorrow\b/gi, '');
        } else {
            const daysMatch = cleanText.match(/::(\d+)d\b/i);
            if (daysMatch) {
                const d = new Date(); d.setDate(d.getDate() + parseInt(daysMatch[1]));
                deadline = d.toISOString().split('T')[0];
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
            newDeadline = date.toISOString().split('T')[0];
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
            newDeadline = date.toISOString().split('T')[0];
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

        // Finalize any previous pending delete
        if (this.pendingDelete) {
            this.finalizeDelete();
        }

        // Remove from array but don't delete from DB yet
        this.todos = this.todos.filter(t => t.id !== id);
        if (this.expandedTaskId === id) this.expandedTaskId = null;

        // Show undo toast
        this.pendingDelete = {
            todos: tasksToDelete,
            message: `"${todo.text}" deleted`,
            timer: setTimeout(() => this.finalizeDelete(), 5000)
        };

        this.showUndoToast(this.pendingDelete.message);
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

        // Finalize any previous pending delete
        if (this.pendingDelete) {
            this.finalizeDelete();
        }

        this.todos = this.todos.filter(t => !t.completed);

        this.pendingDelete = {
            todos: completedTodos,
            message: `${completedTodos.length} completed task(s) cleared`,
            timer: setTimeout(() => this.finalizeDelete(), 5000)
        };

        this.showUndoToast(this.pendingDelete.message);
        this.render();
    }

    // ===== Undo Toast System =====
    showUndoToast(message) {
        const toast = document.getElementById('undoToast');
        const msg = document.getElementById('undoToastMsg');
        msg.textContent = message;
        toast.classList.remove('visible');
        // Force reflow for re-animation
        void toast.offsetWidth;
        toast.classList.add('visible');
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

    // ===== Drag-and-Drop =====
    setupDragListeners(listEl) {
        listEl.querySelectorAll('.todo-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                this.draggedId = parseInt(item.dataset.id);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.dataset.id);
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this.draggedId = null;
                listEl.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-into-project').forEach(el => {
                    el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into-project');
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const targetId = parseInt(item.dataset.id);
                if (this.draggedId === targetId) return;

                const draggedTodo = this.todos.find(t => t.id === this.draggedId);
                const targetTodo = this.todos.find(t => t.id === targetId);
                if (!draggedTodo || !targetTodo) return;

                // Dropping a non-project onto a project it's not already in → "drop into project" zone
                if (targetTodo.isProject && !draggedTodo.isProject && draggedTodo.parentId !== targetTodo.id) {
                    item.classList.remove('drag-over-top', 'drag-over-bottom');
                    item.classList.add('drag-into-project');
                    return;
                }

                // Same-scope reordering
                if (draggedTodo.parentId === targetTodo.parentId) {
                    item.classList.remove('drag-into-project');
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    item.classList.remove('drag-over-top', 'drag-over-bottom');
                    if (e.clientY < midY) {
                        item.classList.add('drag-over-top');
                    } else {
                        item.classList.add('drag-over-bottom');
                    }
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into-project');
            });

            item.addEventListener('drop', async (e) => {
                e.preventDefault();
                item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into-project');

                const draggedId = this.draggedId;
                const targetId = parseInt(item.dataset.id);
                if (!draggedId || draggedId === targetId) return;

                const draggedTodo = this.todos.find(t => t.id === draggedId);
                const targetTodo = this.todos.find(t => t.id === targetId);
                if (!draggedTodo || !targetTodo) return;

                // Drop into project folder
                if (targetTodo.isProject && !draggedTodo.isProject && draggedTodo.parentId !== targetTodo.id) {
                    const oldParentId = draggedTodo.parentId;
                    draggedTodo.parentId = targetTodo.id;

                    // Update old parent completion status
                    if (oldParentId) {
                        const oldParent = this.todos.find(t => t.id === oldParentId);
                        if (oldParent) {
                            const remaining = this.getSubtasks(oldParentId);
                            oldParent.completed = remaining.length > 0 && remaining.every(t => t.completed);
                            await StorageManager.put('todos', oldParent);
                            this._syncTodo(oldParent);
                        }
                    }

                    // Reopen project if it was completed
                    if (targetTodo.completed && !draggedTodo.completed) {
                        targetTodo.completed = false;
                        await StorageManager.put('todos', targetTodo);
                        this._syncTodo(targetTodo);
                    }

                    // Expand the target project so the moved item is visible
                    const colIdx = this.uiState.collapsedProjects.indexOf(targetTodo.id);
                    if (colIdx >= 0) this.uiState.collapsedProjects.splice(colIdx, 1);
                    this.saveUIState();

                    await StorageManager.put('todos', draggedTodo);
                    this._syncTodo(draggedTodo);
                    this.render();
                    return;
                }

                // Same-scope reordering only
                if (draggedTodo.parentId !== targetTodo.parentId) return;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const insertBefore = e.clientY < midY;

                // Get siblings in same scope sorted by order
                const siblings = this.todos
                    .filter(t => t.parentId === draggedTodo.parentId && !t.completed)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                // Remove dragged from list
                const filtered = siblings.filter(t => t.id !== draggedId);
                // Find target index in filtered list
                let targetIdx = filtered.findIndex(t => t.id === targetId);
                if (!insertBefore) targetIdx++;

                // Insert at position
                filtered.splice(targetIdx, 0, draggedTodo);

                // Reassign order values
                filtered.forEach((t, i) => { t.order = i; });
                await this.saveTodos();
                filtered.forEach(t => this._syncTodo(t));
                this.render();
            });
        });
    }

    // ===== Project Helpers =====
    getSubtasks(projectId) {
        return this.todos.filter(t => t.parentId === projectId);
    }

    getProjectProgress(projectId) {
        const subs = this.getSubtasks(projectId);
        return { completed: subs.filter(t => t.completed).length, total: subs.length };
    }

    isProjectCollapsed(projectId) {
        return this.uiState.collapsedProjects.includes(projectId);
    }

    toggleProjectCollapse(projectId) {
        const idx = this.uiState.collapsedProjects.indexOf(projectId);
        if (idx >= 0) this.uiState.collapsedProjects.splice(idx, 1);
        else this.uiState.collapsedProjects.push(projectId);
        this.saveUIState();
        this.render();
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
        if (!textEl) return;
        const item = textEl.closest('.todo-item');
        if (!item) return;
        const id = parseInt(item.dataset.id);
        const todo = this.todos.find(t => t.id === id);
        if (!todo || todo.completed) return;

        this.inlineEditId = id;
        const content = item.querySelector('.todo-content');
        const currentText = todo.text;

        content.innerHTML = `<input type="text" class="inline-edit-input" value="${this.escapeAttr(currentText)}">`;
        const inp = content.querySelector('.inline-edit-input');
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

    // ===== Inline Subtask =====
    showInlineSubtask(projectId) {
        this.inlineSubtaskProjectId = projectId;
        if (this.isProjectCollapsed(projectId)) {
            const idx = this.uiState.collapsedProjects.indexOf(projectId);
            if (idx >= 0) this.uiState.collapsedProjects.splice(idx, 1);
            this.saveUIState();
        }
        this.render();

        setTimeout(() => {
            const inp = document.querySelector('.inline-subtask-input');
            if (inp) inp.focus();
        }, 50);
    }

    setupInlineSubtaskInput(input, projectId) {
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const text = input.value.trim();
                if (text) {
                    const parsed = this.parseShorthand(text);
                    const maxOrder = this.todos.length > 0 ? Math.max(...this.todos.map(t => t.order || 0)) : 0;
                    const subtask = {
                        id: Date.now(),
                        text: parsed.text,
                        completed: false,
                        priority: parsed.priority || 'medium',
                        description: '',
                        deadline: parsed.deadline || null,
                        isProject: false,
                        parentId: projectId,
                        order: maxOrder + 1,
                        recurrence: parsed.recurrence || null
                    };
                    this.todos.push(subtask);
                    this.lastAddedId = subtask.id;
                    await StorageManager.put('todos', subtask);
                    this._syncTodo(subtask);

                    const project = this.todos.find(t => t.id === projectId);
                    if (project && project.completed) {
                        project.completed = false;
                        await StorageManager.put('todos', project);
                        this._syncTodo(project);
                    }

                    input.value = '';
                    this.render();
                    // Re-show input for adding more
                    this.showInlineSubtask(projectId);
                }
            } else if (e.key === 'Escape') {
                this.inlineSubtaskProjectId = null;
                this.render();
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                this.inlineSubtaskProjectId = null;
                this.render();
            }, 150);
        });
    }

    // ===== Description Tooltip =====
    setupDescriptionTooltip() {
        const tooltip = document.createElement('div');
        tooltip.className = 'desc-tooltip';
        document.body.appendChild(tooltip);

        const lists = [document.getElementById('todoList'), document.getElementById('completedList')];
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

        // Priority badge click -> cycle
        if (e.target.closest('.priority-badge')) {
            e.stopPropagation();
            this.cyclePriority(id);
            return;
        }

        // Expand button
        if (e.target.closest('.expand-btn')) {
            e.stopPropagation();
            this.toggleDetailPanel(id);
            return;
        }

        // Delete button
        if (e.target.closest('.delete-btn')) {
            e.stopPropagation();
            this.deleteTodo(id);
            return;
        }

        // Collapse chevron (project)
        if (e.target.closest('.collapse-chevron')) {
            e.stopPropagation();
            this.toggleProjectCollapse(id);
            return;
        }

        // Quick add subtask
        if (e.target.closest('.quick-add-btn')) {
            e.stopPropagation();
            this.showInlineSubtask(id);
            return;
        }
    }

    // ===== Close Everything =====
    closeAllPanels() {
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

        if (this.inlineSubtaskProjectId !== null) {
            this.inlineSubtaskProjectId = null;
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

    // ===== Apply UI State =====
    applyStatsState() {
        const panel = document.getElementById('statsPanel');
        const btn = document.getElementById('statsToggleBtn');
        if (this.uiState.statsOpen) {
            panel.classList.add('open');
            btn.classList.add('active');
        } else {
            panel.classList.remove('open');
            btn.classList.remove('active');
        }
    }

    applyCompletedState() {
        const wrapper = document.getElementById('completedWrapper');
        const chevron = document.getElementById('completedChevron');
        if (this.uiState.completedOpen) {
            wrapper.style.display = 'block';
            chevron.classList.remove('collapsed');
        } else {
            wrapper.style.display = 'none';
            chevron.classList.add('collapsed');
        }
    }

    // ===== Filter =====
    setFilter(filter) {
        this.uiState.activeFilter = filter;
        this.saveUIState();
        this.render();
    }

    renderFilterButtons() {
        const filterSection = document.getElementById('filterSection');
        const projects = this.todos.filter(t => t.isProject);
        const hasUngrouped = this.todos.some(t => !t.isProject && !t.parentId);

        // Count active (non-completed) tasks per filter
        const allCount = this.todos.filter(t => !t.completed).length;
        const ungroupedCount = this.todos.filter(t => !t.isProject && !t.parentId && !t.completed).length;

        let html = `<button class="filter-btn ${this.uiState.activeFilter === 'all' ? 'active' : ''}" data-filter="all">All <span class="filter-count">(${allCount})</span></button>`;

        if (hasUngrouped) {
            html += `<button class="filter-btn ${this.uiState.activeFilter === 'ungrouped' ? 'active' : ''}" data-filter="ungrouped">Ungrouped <span class="filter-count">(${ungroupedCount})</span></button>`;
        }

        projects.forEach(p => {
            const isActive = this.uiState.activeFilter === p.id;
            const projectTaskCount = this.getSubtasks(p.id).filter(t => !t.completed).length;
            html += `<button class="filter-btn ${isActive ? 'active' : ''}" data-filter="${p.id}">
                <i class="fa-solid fa-folder"></i> ${this.escapeHtml(p.text)} <span class="filter-count">(${projectTaskCount})</span>
            </button>`;
        });

        filterSection.innerHTML = html;

        filterSection.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const f = btn.dataset.filter;
                this.setFilter(f === 'all' || f === 'ungrouped' ? f : parseInt(f));
            });
        });
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

    // ===== Unified Render =====
    renderTask(todo, options = {}) {
        const priority = todo.priority || 'medium';
        const isExpanded = this.expandedTaskId === todo.id;
        const isProject = todo.isProject;
        const isSubtask = options.isSubtask || false;
        const isNewlyAdded = this.lastAddedId === todo.id;

        let classes = 'todo-item';
        if (todo.completed) classes += ' completed';
        if (isProject) classes += ' project-item';
        if (isSubtask) classes += ' subtask-item';
        if (isNewlyAdded) classes += ' anim-add';

        // Content zone
        let contentHtml = '';
        contentHtml += `<span class="todo-text">${this.escapeHtml(todo.text)}</span>`;

        // Meta row
        const metaParts = [];
        if (todo.deadline) {
            const status = this.getDeadlineStatus(todo.deadline);
            metaParts.push(`<span class="deadline-badge deadline-${status}">${this.formatDeadline(todo.deadline)}</span>`);
        }
        if (todo.recurrence) {
            metaParts.push(`<span class="recurring-badge"><i class="fa-solid fa-repeat"></i> <span>${this.getRecurrenceLabel(todo.recurrence)}</span></span>`);
        }
        if (todo.description) {
            metaParts.push(`<span class="todo-description-preview" data-tooltip="${this.escapeAttr(todo.description)}">${this.escapeHtml(todo.description)}</span>`);
        }
        if (isProject) {
            const progress = this.getProjectProgress(todo.id);
            if (progress.total > 0) {
                const pct = Math.round((progress.completed / progress.total) * 100);
                metaParts.push(`
                    <div class="project-progress-bar"><div class="project-progress-fill" style="width:${pct}%"></div></div>
                    <span class="project-progress-label">${progress.completed}/${progress.total}</span>
                `);
            }
        }

        let metaHtml = '';
        if (metaParts.length > 0) {
            metaHtml = `<div class="todo-meta">${metaParts.join('')}</div>`;
        }

        // Checkbox class for animation
        const checkboxClass = (this._animCheckId === todo.id && todo.completed) ? 'anim-check-bounce' : '';

        // Priority badge animation
        const priorityAnimClass = this._animPriorityId === todo.id ? ' anim-pulse' : '';

        // Actions zone
        let actionsHtml = `
            <span class="priority-badge priority-${priority}${priorityAnimClass}" title="Click to cycle priority">${priority}</span>
            <button class="expand-btn ${isExpanded ? 'open' : ''}" title="Details">
                <i class="fa-solid fa-chevron-down"></i>
            </button>
            <button class="delete-btn" title="Delete">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        // Project-specific: collapse chevron and quick-add
        let projectPrefix = '';
        if (isProject) {
            const collapsed = this.isProjectCollapsed(todo.id);
            projectPrefix = `
                <i class="fa-solid fa-chevron-down collapse-chevron ${collapsed ? 'collapsed' : ''}"></i>
                <i class="fa-solid fa-folder project-icon"></i>
            `;
            actionsHtml = `
                <button class="quick-add-btn" title="Add subtask"><i class="fa-solid fa-plus"></i></button>
                ${actionsHtml}
            `;
        }

        // Drag handle
        const dragHandle = todo.completed ? '' : `<i class="fa-solid fa-grip-vertical drag-handle"></i>`;

        let html = `
            <li class="${classes}" data-id="${todo.id}" draggable="${!todo.completed}"${todo.description ? ` data-description="${this.escapeAttr(todo.description)}"` : ''}>
                ${dragHandle}
                ${projectPrefix}
                <input type="checkbox" class="${checkboxClass}" ${todo.completed ? 'checked' : ''}>
                <div class="todo-content">
                    ${contentHtml}
                    ${metaHtml}
                </div>
                <div class="todo-actions">
                    ${actionsHtml}
                </div>
            </li>
        `;

        // Detail panel
        if (isExpanded) {
            html += this.renderDetailPanel(todo);
        }

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

    // ===== Stats =====
    updateStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(t => t.completed).length;
        const active = total - completed;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const overdue = this.todos.filter(t => !t.completed && t.deadline && this.getDeadlineStatus(t.deadline) === 'overdue').length;
        const high = this.todos.filter(t => !t.completed && t.priority === 'high').length;

        document.getElementById('statTotal').textContent = total;
        document.getElementById('statActive').textContent = active;
        document.getElementById('statCompleted').textContent = completed;
        document.getElementById('statCompletionRate').textContent = `${rate}%`;
        document.getElementById('statOverdue').textContent = overdue;
        document.getElementById('statHigh').textContent = high;

        // Progress strip
        document.getElementById('progressStripFill').style.width = `${rate}%`;
        document.getElementById('progressStripLabel').textContent = `${completed}/${total} tasks`;
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

    // ===== Due Date Grouping Render =====
    renderDateGrouped(tasks) {
        const groups = {
            overdue: { label: 'Overdue', tasks: [], cssClass: 'overdue' },
            today: { label: 'Today', tasks: [], cssClass: 'today' },
            upcoming: { label: 'Upcoming', tasks: [], cssClass: '' },
            later: { label: 'Later', tasks: [], cssClass: '' },
            nodeadline: { label: 'No Deadline', tasks: [], cssClass: '' }
        };

        const sortFn = this.getSortFn();
        tasks.forEach(t => {
            const group = this.getDeadlineGroup(t.deadline);
            groups[group].tasks.push(t);
        });

        let html = '';
        const groupOrder = ['overdue', 'today', 'upcoming', 'later', 'nodeadline'];

        for (const key of groupOrder) {
            const g = groups[key];
            if (g.tasks.length === 0) continue;

            g.tasks.sort(sortFn);
            const collapsed = this.isDateGroupCollapsed(key);

            html += `<div class="date-group-header" data-group="${key}">
                <i class="fa-solid fa-chevron-down date-group-chevron ${collapsed ? 'collapsed' : ''}"></i>
                <span class="date-group-label ${g.cssClass}">${g.label}</span>
                <span class="date-group-count">(${g.tasks.length})</span>
            </div>`;

            if (!collapsed) {
                g.tasks.forEach(todo => {
                    if (todo.isProject) {
                        html += this.renderTask(todo);
                        if (!this.isProjectCollapsed(todo.id)) {
                            const subs = this.getSubtasks(todo.id).sort(sortFn);
                            if (subs.length > 0 || this.inlineSubtaskProjectId === todo.id) {
                                html += '<div class="subtask-group">';
                                subs.forEach(sub => {
                                    html += this.renderTask(sub, { isSubtask: true });
                                });
                                if (this.inlineSubtaskProjectId === todo.id) {
                                    html += `
                                        <div class="inline-subtask-row">
                                            <input type="text" class="inline-subtask-input" placeholder="Add subtask..." data-project-id="${todo.id}">
                                            <span class="inline-subtask-hint">Enter to add, Esc to cancel</span>
                                        </div>
                                    `;
                                }
                                html += '</div>';
                            }
                        }
                    } else {
                        html += this.renderTask(todo);
                    }
                });
            }
        }

        return html;
    }

    // ===== Main Render =====
    render() {
        const todoList = document.getElementById('todoList');
        const completedList = document.getElementById('completedList');
        const completedCount = document.getElementById('completedCount');
        const completedSection = document.getElementById('completedSection');

        this.populateParentProjectDropdown();

        const sortFn = this.getSortFn();

        // Determine if search is active
        const isSearchActive = this.searchTerm.length > 0;

        // All active (non-completed) tasks
        let activeTasks = this.todos.filter(t => !t.completed);
        let completedTodos = this.todos.filter(t => t.completed && !t.parentId);

        // Apply search filter
        if (isSearchActive) {
            activeTasks = activeTasks.filter(t => this.matchesSearch(t));
            completedTodos = completedTodos.filter(t => this.matchesSearch(t));
        }

        // Render filters
        this.renderFilterButtons();

        let activeHtml = '';

        if (isSearchActive) {
            // Flat list when searching
            const filtered = activeTasks.filter(t => !t.parentId || this.matchesSearch(t)).sort(sortFn);
            filtered.forEach(todo => {
                activeHtml += this.renderTask(todo);
            });
        } else if (this.uiState.activeFilter === 'all' && !isSearchActive) {
            // Due date grouping mode
            // Collect all top-level active tasks (projects + standalone)
            const topLevel = activeTasks.filter(t => !t.parentId);
            activeHtml = this.renderDateGrouped(topLevel);
        } else {
            // Project/ungrouped filter mode - original behavior
            const projects = this.todos.filter(t => t.isProject && !t.completed).sort(sortFn);
            const standalone = this.todos.filter(t => !t.isProject && !t.parentId && !t.completed).sort(sortFn);

            let filteredProjects = projects;
            let filteredStandalone = standalone;
            if (this.uiState.activeFilter === 'ungrouped') {
                filteredProjects = [];
            } else if (this.uiState.activeFilter !== 'all') {
                filteredProjects = projects.filter(p => p.id === this.uiState.activeFilter);
                filteredStandalone = [];
            }

            filteredProjects.forEach(project => {
                activeHtml += this.renderTask(project);

                if (!this.isProjectCollapsed(project.id)) {
                    const subs = this.getSubtasks(project.id).sort(sortFn);
                    if (subs.length > 0 || this.inlineSubtaskProjectId === project.id) {
                        activeHtml += '<div class="subtask-group">';
                        subs.forEach(sub => {
                            activeHtml += this.renderTask(sub, { isSubtask: true });
                        });
                        if (this.inlineSubtaskProjectId === project.id) {
                            activeHtml += `
                                <div class="inline-subtask-row">
                                    <input type="text" class="inline-subtask-input" placeholder="Add subtask..." data-project-id="${project.id}">
                                    <span class="inline-subtask-hint">Enter to add, Esc to cancel</span>
                                </div>
                            `;
                        }
                        activeHtml += '</div>';
                    }
                }
            });

            if (filteredStandalone.length > 0) {
                if (filteredProjects.length > 0) {
                    activeHtml += '<li class="section-divider">Ungrouped Tasks</li>';
                }
                filteredStandalone.forEach(todo => {
                    activeHtml += this.renderTask(todo);
                });
            }
        }

        if (!activeHtml) {
            todoList.innerHTML = this.renderEmptyState();
        } else {
            todoList.innerHTML = activeHtml;
        }

        // Render completed
        completedCount.textContent = `(${completedTodos.length})`;
        completedSection.style.display = completedTodos.length > 0 ? 'block' : 'none';

        if (completedTodos.length === 0) {
            completedList.innerHTML = '';
        } else {
            completedList.innerHTML = completedTodos.map(t => this.renderTask(t)).join('');
        }

        // Update stats
        this.updateStats();

        // Apply persisted UI state
        this.applyStatsState();
        this.applyCompletedState();

        // Wire up detail panels
        document.querySelectorAll('.detail-panel[data-detail-id]').forEach(panel => {
            const detailId = parseInt(panel.dataset.detailId);
            this.setupDetailPanel(panel, detailId);
        });

        // Wire up inline subtask inputs
        document.querySelectorAll('.inline-subtask-input').forEach(input => {
            const projectId = parseInt(input.dataset.projectId);
            this.setupInlineSubtaskInput(input, projectId);
        });

        // Setup drag-and-drop
        this.setupDragListeners(todoList);

        // Clear animation flags after render
        this.lastAddedId = null;
        this._animCheckId = null;
        this._animPriorityId = null;
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

        let changed = false;

        for (const [id, remote] of remoteMap) {
            const localIdx = this.todos.findIndex(t => t.id === id);
            if (localIdx === -1) {
                this.todos.push(remote);
                await StorageManager.put('todos', remote);
                changed = true;
            } else {
                const local = this.todos[localIdx];
                if (JSON.stringify(local) !== JSON.stringify(remote)) {
                    this.todos[localIdx] = remote;
                    await StorageManager.put('todos', remote);
                    changed = true;
                }
            }
        }

        if (changed) this.render();
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
            if (avatar) avatar.src = user.photoURL || '';
            if (name) name.textContent = user.displayName || user.email || '';
        } else {
            signInBtn.style.display = '';
            userInfo.style.display = 'none';
        }
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

    async importTodos(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) {
                    alert('Invalid file format. Expected an array of todos.');
                    return;
                }

                const replace = confirm('Replace existing todos? (Cancel to append instead)');
                if (replace) {
                    await StorageManager.clear('todos');
                    this.todos = imported;
                } else {
                    const maxId = this.todos.length > 0 ? Math.max(...this.todos.map(t => t.id)) : 0;
                    imported.forEach((todo, i) => {
                        todo.id = maxId + i + 1;
                        this.todos.push(todo);
                    });
                }

                // Ensure new fields
                this.todos.forEach(todo => {
                    if (todo.order === undefined) todo.order = todo.id;
                    if (todo.recurrence === undefined) todo.recurrence = null;
                });

                await this.saveTodos();
                this.render();
                alert(`Successfully imported ${imported.length} todos!`);
            } catch (error) {
                alert('Error reading file. Please make sure it\'s a valid JSON file.');
                console.error(error);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // ===== Utility =====
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
