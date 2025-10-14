// Cookie management functions
const CookieManager = {
    setCookie(name, value, days = 365) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = "expires=" + date.toUTCString();
        document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
    },

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    }
};

// To-Do App
class TodoApp {
    constructor() {
        this.todos = [];
        this.completedSectionExpanded = true;
        this.statsSectionExpanded = false;
        this.editingTodoId = null;
        this.init();
    }

    init() {
        this.loadTodos();
        this.setupEventListeners();
        this.render();
    }

    loadTodos() {
        const savedTodos = CookieManager.getCookie('todos');
        if (savedTodos) {
            try {
                this.todos = JSON.parse(savedTodos);
            } catch (e) {
                this.todos = [];
            }
        }
    }

    saveTodos() {
        CookieManager.setCookie('todos', JSON.stringify(this.todos));
    }

    setupEventListeners() {
        // Add button
        document.getElementById('addBtn').addEventListener('click', () => this.addTodo());

        // Enter key on input
        document.getElementById('todoInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addTodo();
            }
        });

        // Calendar button
        document.getElementById('calendarBtn').addEventListener('click', () => {
            document.getElementById('deadlineInput').showPicker();
        });

        // Deadline input change
        document.getElementById('deadlineInput').addEventListener('change', (e) => {
            const calendarBtn = document.getElementById('calendarBtn');
            if (e.target.value) {
                calendarBtn.classList.add('has-date');
            } else {
                calendarBtn.classList.remove('has-date');
            }
        });

        // Description toggle button
        document.getElementById('descriptionToggleBtn').addEventListener('click', () => {
            this.toggleDescriptionInput();
        });

        // Clear completed button
        document.getElementById('clearCompleted').addEventListener('click', () => {
            this.clearCompleted();
        });

        // Export button
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportTodos();
        });

        // Import button
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });

        document.getElementById('importFileInput').addEventListener('change', (e) => {
            this.importTodos(e);
        });
    }

    exportTodos() {
        const dataStr = JSON.stringify(this.todos, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `todos-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    importTodos(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedTodos = JSON.parse(e.target.result);

                if (!Array.isArray(importedTodos)) {
                    alert('Invalid file format. Expected an array of todos.');
                    return;
                }

                // Ask user if they want to replace or append
                const replace = confirm('Replace existing todos? (Cancel to append instead)');

                if (replace) {
                    this.todos = importedTodos;
                } else {
                    // Append and update IDs to avoid conflicts
                    const maxId = this.todos.length > 0 ? Math.max(...this.todos.map(t => t.id)) : 0;
                    importedTodos.forEach((todo, index) => {
                        todo.id = maxId + index + 1;
                        this.todos.push(todo);
                    });
                }

                this.saveTodos();
                this.render();
                alert(`Successfully imported ${importedTodos.length} todos!`);
            } catch (error) {
                alert('Error reading file. Please make sure it\'s a valid JSON file.');
                console.error(error);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    }

    toggleDescriptionInput() {
        const section = document.getElementById('descriptionSection');
        const btn = document.getElementById('descriptionToggleBtn');

        if (section.style.display === 'none') {
            section.style.display = 'block';
            btn.innerHTML = '<i class="fa-solid fa-minus"></i> Hide Description';
        } else {
            section.style.display = 'none';
            btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Description (Optional)';
        }
    }

    addTodo() {
        const input = document.getElementById('todoInput');
        const prioritySelect = document.getElementById('prioritySelect');
        const descriptionInput = document.getElementById('descriptionInput');
        const deadlineInput = document.getElementById('deadlineInput');
        const text = input.value.trim();
        const description = descriptionInput.value.trim();
        const deadline = deadlineInput.value;

        if (text === '') {
            return;
        }

        const todo = {
            id: Date.now(),
            text: text,
            completed: false,
            priority: prioritySelect.value || 'medium',
            description: description || '',
            deadline: deadline || null
        };

        this.todos.push(todo);
        this.saveTodos();
        this.render();
        input.value = '';
        descriptionInput.value = '';
        deadlineInput.value = '';
        prioritySelect.value = 'medium';

        // Reset calendar button state
        document.getElementById('calendarBtn').classList.remove('has-date');

        // Hide description section after adding
        const section = document.getElementById('descriptionSection');
        const btn = document.getElementById('descriptionToggleBtn');
        section.style.display = 'none';
        btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Description (Optional)';
    }

    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.saveTodos();
            this.render();
        }
    }

    deleteTodo(id) {
        this.todos = this.todos.filter(t => t.id !== id);
        this.saveTodos();
        this.render();
    }

    changePriority(id, newPriority) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.priority = newPriority;
            this.saveTodos();
            this.render();
        }
    }

    togglePriorityDropdown(id, event) {
        event.stopPropagation();
        const dropdown = document.getElementById(`priority-dropdown-${id}`);
        if (dropdown) {
            dropdown.style.display = 'block';
            dropdown.focus();
        }
    }

    hidePriorityDropdown(id) {
        setTimeout(() => {
            const dropdown = document.getElementById(`priority-dropdown-${id}`);
            if (dropdown) {
                dropdown.style.display = 'none';
            }
        }, 200);
    }

    clearCompleted() {
        this.todos = this.todos.filter(t => !t.completed);
        this.saveTodos();
        this.render();
    }

    editTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        this.editingTodoId = id;

        // Populate modal fields
        document.getElementById('editTaskInput').value = todo.text;
        document.getElementById('editDescriptionInput').value = todo.description || '';
        document.getElementById('editPrioritySelect').value = todo.priority || 'medium';
        document.getElementById('editDeadlineInput').value = todo.deadline || '';

        // Show modal
        document.getElementById('editModal').style.display = 'flex';
    }

    saveEdit() {
        if (!this.editingTodoId) return;

        const todo = this.todos.find(t => t.id === this.editingTodoId);
        if (!todo) return;

        const newText = document.getElementById('editTaskInput').value.trim();
        if (newText === '') {
            alert('Task cannot be empty');
            return;
        }

        todo.text = newText;
        todo.description = document.getElementById('editDescriptionInput').value.trim();
        todo.priority = document.getElementById('editPrioritySelect').value;
        todo.deadline = document.getElementById('editDeadlineInput').value || null;

        this.saveTodos();
        this.render();
        this.closeEditModal();
    }

    closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
        this.editingTodoId = null;
    }

    getActiveTodos() {
        const activeTodos = this.todos.filter(t => !t.completed);
        // Sort by priority: High > Medium > Low, then by deadline
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return activeTodos.sort((a, b) => {
            const aPriority = a.priority || 'medium';
            const bPriority = b.priority || 'medium';

            // First sort by priority
            const priorityDiff = priorityOrder[aPriority] - priorityOrder[bPriority];
            if (priorityDiff !== 0) return priorityDiff;

            // Then sort by deadline (overdue first, then by date)
            const aDeadline = a.deadline ? new Date(a.deadline) : null;
            const bDeadline = b.deadline ? new Date(b.deadline) : null;

            if (!aDeadline && !bDeadline) return 0;
            if (!aDeadline) return 1;  // No deadline goes to end
            if (!bDeadline) return -1; // No deadline goes to end

            return aDeadline - bDeadline; // Earlier dates first
        });
    }

    getDeadlineStatus(deadline) {
        if (!deadline) return 'none';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Parse deadline as local date to avoid timezone issues
        const [year, month, day] = deadline.split('-').map(Number);
        const deadlineDate = new Date(year, month - 1, day);
        deadlineDate.setHours(0, 0, 0, 0);

        const diffTime = deadlineDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return 'overdue';
        if (diffDays === 0) return 'today';
        if (diffDays <= 2) return 'soon';
        return 'future';
    }

    formatDeadline(deadline) {
        if (!deadline) return '';

        // Parse deadline as local date to avoid timezone issues
        const [year, month, day] = deadline.split('-').map(Number);
        const deadlineDate = new Date(year, month - 1, day);
        deadlineDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffTime = deadlineDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const formatted = deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (diffDays < 0) return `${formatted} (${Math.abs(diffDays)}d overdue)`;
        if (diffDays === 0) return `${formatted} (Today)`;
        if (diffDays === 1) return `${formatted} (Tomorrow)`;
        if (diffDays <= 7) return `${formatted} (${diffDays}d)`;
        return formatted;
    }

    getCompletedTodos() {
        return this.todos.filter(t => t.completed);
    }

    toggleCompletedSection() {
        this.completedSectionExpanded = !this.completedSectionExpanded;
        const wrapper = document.getElementById('completedWrapper');
        const icon = document.getElementById('toggleIcon');

        if (this.completedSectionExpanded) {
            wrapper.style.display = 'block';
            icon.textContent = '▼';
        } else {
            wrapper.style.display = 'none';
            icon.textContent = '▶';
        }
    }

    toggleStatsSection() {
        this.statsSectionExpanded = !this.statsSectionExpanded;
        const wrapper = document.getElementById('statsWrapper');
        const icon = document.getElementById('statsToggleIcon');

        if (this.statsSectionExpanded) {
            wrapper.style.display = 'block';
            icon.textContent = '▼';
        } else {
            wrapper.style.display = 'none';
            icon.textContent = '▶';
        }
    }

    updateStats() {
        const totalTasks = this.todos.length;
        const activeTasks = this.todos.filter(t => !t.completed).length;
        const completedTasks = this.todos.filter(t => t.completed).length;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const overdueTasks = this.todos.filter(t => {
            return !t.completed && t.deadline && this.getDeadlineStatus(t.deadline) === 'overdue';
        }).length;

        const highPriorityTasks = this.todos.filter(t => {
            return !t.completed && (t.priority === 'high' || (!t.priority && false));
        }).length;

        document.getElementById('statTotal').textContent = totalTasks;
        document.getElementById('statActive').textContent = activeTasks;
        document.getElementById('statCompleted').textContent = completedTasks;
        document.getElementById('statCompletionRate').textContent = `${completionRate}%`;
        document.getElementById('statOverdue').textContent = overdueTasks;
        document.getElementById('statHigh').textContent = highPriorityTasks;
        document.getElementById('progressBarFill').style.width = `${completionRate}%`;
    }

    renderTodoItem(todo) {
        const priority = todo.priority || 'medium'; // backwards compatibility
        const hasDescription = todo.description && todo.description.length > 0;
        const deadlineStatus = this.getDeadlineStatus(todo.deadline);
        const formattedDeadline = this.formatDeadline(todo.deadline);

        return `
            <li class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
                <input type="checkbox" ${todo.completed ? 'checked' : ''}
                       onchange="todoApp.toggleTodo(${todo.id})">
                <span class="todo-text">${this.escapeHtml(todo.text)}</span>
                ${hasDescription ? `
                    <span class="description-icon" data-tooltip="${this.escapeHtml(todo.description)}">
                        <i class="fa-solid fa-circle-info"></i>
                    </span>
                ` : ''}
                ${todo.deadline ? `
                    <span class="deadline-badge deadline-${deadlineStatus}">${formattedDeadline}</span>
                ` : ''}
                <div class="priority-wrapper">
                    <span class="priority-badge priority-${priority} priority-clickable" onclick="todoApp.togglePriorityDropdown(${todo.id}, event)">
                        ${priority}
                    </span>
                    <select class="priority-change-dropdown" id="priority-dropdown-${todo.id}" onchange="todoApp.changePriority(${todo.id}, this.value)" onblur="todoApp.hidePriorityDropdown(${todo.id})">
                        <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
                        <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
                    </select>
                </div>
                <button class="edit-btn" onclick="todoApp.editTodo(${todo.id})">
                    <i class="fa-solid fa-pencil"></i>
                </button>
                <button class="delete-btn" onclick="todoApp.deleteTodo(${todo.id})">Delete</button>
            </li>
        `;
    }

    render() {
        const todoList = document.getElementById('todoList');
        const completedList = document.getElementById('completedList');
        const completedCount = document.getElementById('completedCount');
        const activeSection = document.getElementById('activeSection');
        const completedSection = document.getElementById('completedSection');
        const clearSection = document.querySelector('.clear-section');

        const activeTodos = this.getActiveTodos();
        const completedTodos = this.getCompletedTodos();

        // Update completed count
        completedCount.textContent = `(${completedTodos.length})`;

        // Update stats
        this.updateStats();

        // Show/hide Clear Completed button
        if (clearSection) {
            clearSection.style.display = completedTodos.length > 0 ? 'block' : 'none';
        }

        // Show/hide completed section
        completedSection.style.display = completedTodos.length > 0 ? 'block' : 'none';

        // Render active tasks
        if (activeTodos.length === 0) {
            todoList.innerHTML = '<div class="empty-state">No active tasks</div>';
        } else {
            todoList.innerHTML = activeTodos.map(todo => this.renderTodoItem(todo)).join('');
        }

        // Render completed tasks
        if (completedTodos.length === 0) {
            completedList.innerHTML = '<div class="empty-state">No completed tasks yet</div>';
        } else {
            completedList.innerHTML = completedTodos.map(todo => this.renderTodoItem(todo)).join('');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app
const todoApp = new TodoApp();
