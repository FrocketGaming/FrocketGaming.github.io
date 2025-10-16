// Storage management functions (using localStorage)
const StorageManager = {
    setItem(name, value) {
        try {
            localStorage.setItem(name, value);
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    },

    getItem(name) {
        try {
            return localStorage.getItem(name);
        } catch (e) {
            console.error('Failed to read from localStorage:', e);
            return null;
        }
    }
};

// To-Do App
class TodoApp {
    constructor() {
        this.todos = [];
        this.completedSectionExpanded = true;
        this.statsSectionExpanded = false;
        this.editingTodoId = null;
        this.collapsedProjects = new Set();  // Track collapsed project IDs
        this.activeFilter = 'all';  // Track active filter: 'all', 'ungrouped', or project ID
        this.init();
    }

    init() {
        this.loadTodos();
        this.setupEventListeners();
        this.setupTooltip();
        this.render();
    }

    setupTooltip() {
        // Create tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'description-tooltip';
        document.body.appendChild(this.tooltip);

        // Add event delegation for description icons
        document.addEventListener('mouseover', (e) => {
            const icon = e.target.closest('.description-icon');
            if (icon) {
                const description = icon.getAttribute('data-tooltip');
                if (description) {
                    this.showTooltip(icon, description);
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            const icon = e.target.closest('.description-icon');
            if (icon) {
                this.hideTooltip();
            }
        });
    }

    showTooltip(element, text) {
        this.tooltip.textContent = text;
        this.tooltip.classList.add('visible');

        // Position tooltip above the icon
        const rect = element.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();

        // Center horizontally on the icon
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

        // Position above the icon
        let top = rect.top - tooltipRect.height - 10;

        // Keep tooltip within viewport bounds
        const padding = 10;
        if (left < padding) left = padding;
        if (left + tooltipRect.width > window.innerWidth - padding) {
            left = window.innerWidth - tooltipRect.width - padding;
        }
        if (top < padding) {
            // If no room above, show below instead
            top = rect.bottom + 10;
        }

        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
    }

    hideTooltip() {
        this.tooltip.classList.remove('visible');
    }

    loadTodos() {
        const savedTodos = StorageManager.getItem('todos');
        if (savedTodos) {
            try {
                this.todos = JSON.parse(savedTodos);

                // Backward compatibility: add missing project fields to old todos
                this.todos.forEach(todo => {
                    if (todo.isProject === undefined) {
                        todo.isProject = false;
                    }
                    if (todo.parentId === undefined) {
                        todo.parentId = null;
                    }
                });

                // Save updated todos with new fields
                if (this.todos.length > 0) {
                    this.saveTodos();
                }
            } catch (e) {
                this.todos = [];
            }
        }
    }

    saveTodos() {
        StorageManager.setItem('todos', JSON.stringify(this.todos));
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

        // Project checkbox
        document.getElementById('projectCheckbox').addEventListener('change', (e) => {
            const parentWrapper = document.getElementById('parentProjectWrapper');
            if (e.target.checked) {
                parentWrapper.style.display = 'none';
            } else {
                parentWrapper.style.display = 'flex';
            }
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

    parseShorthand(text) {
        let cleanText = text;
        let priority = null;
        let deadline = null;
        let projectName = null;

        // Parse priority shorthand (::h, ::m, ::l) - case insensitive
        const priorityMatch = text.match(/::[hmlHML]\b/);
        if (priorityMatch) {
            const priorityChar = priorityMatch[0].toLowerCase().charAt(2);
            if (priorityChar === 'h') priority = 'high';
            else if (priorityChar === 'm') priority = 'medium';
            else if (priorityChar === 'l') priority = 'low';
            cleanText = cleanText.replace(/::[hmlHML]\b/g, '');
        }

        // Parse project shorthand ::p[ProjectName]
        const projectMatch = text.match(/::p\[([^\]]+)\]/i);
        if (projectMatch) {
            projectName = projectMatch[1].trim();
            cleanText = cleanText.replace(/::p\[[^\]]+\]/gi, '');
        }

        // Parse deadline shorthand
        // ::today or ::Today
        if (/::today\b/i.test(text)) {
            const today = new Date();
            deadline = today.toISOString().split('T')[0];
            cleanText = cleanText.replace(/::today\b/gi, '');
        }
        // ::tomorrow or ::Tomorrow
        else if (/::tomorrow\b/i.test(text)) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            deadline = tomorrow.toISOString().split('T')[0];
            cleanText = cleanText.replace(/::tomorrow\b/gi, '');
        }
        // ::1d, ::2d, etc. (days from today)
        else {
            const daysMatch = text.match(/::(\d+)d\b/i);
            if (daysMatch) {
                const days = parseInt(daysMatch[1]);
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + days);
                deadline = futureDate.toISOString().split('T')[0];
                cleanText = cleanText.replace(/::(\d+)d\b/gi, '');
            }
        }

        // Clean up extra whitespace
        cleanText = cleanText.trim().replace(/\s+/g, ' ');

        return { text: cleanText, priority, deadline, projectName };
    }

    findOrCreateProject(projectName) {
        // Find existing project by name
        let project = this.todos.find(t => t.isProject && t.text.toLowerCase() === projectName.toLowerCase());

        if (!project) {
            // Create new project
            project = {
                id: Date.now(),
                text: projectName,
                completed: false,
                priority: 'medium',
                description: '',
                deadline: null,
                isProject: true,
                parentId: null
            };
            this.todos.push(project);
        }

        return project.id;
    }

    populateParentProjectDropdown() {
        const dropdown = document.getElementById('parentProjectSelect');
        const projects = this.todos.filter(t => t.isProject && !t.completed);

        // Clear existing options except the first "None" option
        dropdown.innerHTML = '<option value="">None (standalone task)</option>';

        // Add project options
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.text;
            dropdown.appendChild(option);
        });
    }

    addTodo() {
        const input = document.getElementById('todoInput');
        const prioritySelect = document.getElementById('prioritySelect');
        const descriptionInput = document.getElementById('descriptionInput');
        const deadlineInput = document.getElementById('deadlineInput');
        const projectCheckbox = document.getElementById('projectCheckbox');
        const parentProjectSelect = document.getElementById('parentProjectSelect');
        const text = input.value.trim();
        const description = descriptionInput.value.trim();
        const deadline = deadlineInput.value;

        if (text === '') {
            return;
        }

        // Parse shorthand notation from the input text
        const parsed = this.parseShorthand(text);

        // Handle project assignment from shorthand or UI
        let parentId = null;
        if (parsed.projectName) {
            parentId = this.findOrCreateProject(parsed.projectName);
        } else if (!projectCheckbox.checked && parentProjectSelect.value) {
            parentId = parseInt(parentProjectSelect.value);
        }

        const todo = {
            id: Date.now(),
            text: parsed.text,
            completed: false,
            priority: parsed.priority || prioritySelect.value || 'medium',
            description: description || '',
            deadline: parsed.deadline || deadline || null,
            isProject: projectCheckbox.checked,
            parentId: parentId
        };

        this.todos.push(todo);

        // If adding a subtask to a completed project, uncomplete the project
        if (parentId) {
            const parentProject = this.todos.find(t => t.id === parentId);
            if (parentProject && parentProject.completed) {
                parentProject.completed = false;
            }
        }

        this.saveTodos();
        this.render();
        input.value = '';
        descriptionInput.value = '';
        deadlineInput.value = '';
        prioritySelect.value = 'medium';
        projectCheckbox.checked = false;
        parentProjectSelect.value = '';
        document.getElementById('parentProjectWrapper').style.display = 'flex';

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
        if (!todo) return;

        todo.completed = !todo.completed;

        // If this is a project, toggle all its subtasks
        if (todo.isProject) {
            const subtasks = this.getSubtasks(id);
            subtasks.forEach(subtask => {
                subtask.completed = todo.completed;
            });
        }
        // If this is a subtask, check if all siblings are completed
        else if (todo.parentId) {
            const parent = this.todos.find(t => t.id === todo.parentId);
            if (parent) {
                const subtasks = this.getSubtasks(todo.parentId);
                const allCompleted = subtasks.every(t => t.completed);
                parent.completed = allCompleted;
            }
        }

        this.saveTodos();
        this.render();
    }

    deleteTodo(id) {
        const todo = this.todos.find(t => t.id === id);

        // If deleting a project, convert all its subtasks to ungrouped tasks
        if (todo && todo.isProject) {
            const subtasks = this.getSubtasks(id);
            subtasks.forEach(subtask => {
                subtask.parentId = null;
            });
        }

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

    getProjectTodos() {
        // Get all projects (both active and completed, since subtasks are shown under them)
        return this.todos.filter(t => t.isProject);
    }

    getSubtasks(projectId) {
        // Get all subtasks for a project (both active and completed)
        return this.todos.filter(t => t.parentId === projectId);
    }

    getStandaloneTodos() {
        // Get tasks that are not projects and have no parent (ungrouped tasks)
        return this.todos.filter(t => !t.isProject && !t.parentId);
    }

    getProjectProgress(projectId) {
        const subtasks = this.getSubtasks(projectId);
        const completed = subtasks.filter(t => t.completed).length;
        const total = subtasks.length;
        return { completed, total };
    }

    toggleProjectCollapse(projectId) {
        if (this.collapsedProjects.has(projectId)) {
            this.collapsedProjects.delete(projectId);
        } else {
            this.collapsedProjects.add(projectId);
        }
        this.render();
    }

    isProjectCollapsed(projectId) {
        return this.collapsedProjects.has(projectId);
    }

    showQuickAddSubtask(projectId) {
        const taskText = prompt('Enter subtask (supports ::h/::m/::l, ::today, ::tomorrow, ::Xd):');
        if (taskText && taskText.trim()) {
            const project = this.todos.find(t => t.id === projectId);
            if (!project) return;

            // Parse shorthand from the input
            const parsed = this.parseShorthand(taskText);

            // Create the subtask
            const subtask = {
                id: Date.now(),
                text: parsed.text,
                completed: false,
                priority: parsed.priority || 'medium',
                description: '',
                deadline: parsed.deadline || null,
                isProject: false,
                parentId: projectId
            };

            this.todos.push(subtask);

            // If adding to a completed project, uncomplete it
            if (project.completed) {
                project.completed = false;
            }

            // Expand the project if it was collapsed
            if (this.isProjectCollapsed(projectId)) {
                this.collapsedProjects.delete(projectId);
            }

            this.saveTodos();
            this.render();
        }
    }

    setFilter(filter) {
        this.activeFilter = filter;
        this.render();
    }

    renderFilterButtons() {
        const projects = this.todos.filter(t => t.isProject);
        const hasUngrouped = this.todos.some(t => !t.isProject && !t.parentId);

        let html = '<div class="filter-section">';
        html += `<button class="filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" onclick="todoApp.setFilter('all')">All Tasks</button>`;

        if (hasUngrouped) {
            html += `<button class="filter-btn ${this.activeFilter === 'ungrouped' ? 'active' : ''}" onclick="todoApp.setFilter('ungrouped')">Ungrouped Only</button>`;
        }

        projects.forEach(project => {
            const isActive = this.activeFilter === project.id;
            html += `<button class="filter-btn ${isActive ? 'active' : ''}" onclick="todoApp.setFilter(${project.id})">
                <i class="fa-solid fa-folder"></i> ${this.escapeHtml(project.text)}
            </button>`;
        });

        html += '</div>';
        return html;
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
        document.getElementById('editProjectCheckbox').checked = todo.isProject || false;

        // Populate parent project dropdown
        const editParentSelect = document.getElementById('editParentProjectSelect');
        const projects = this.todos.filter(t => t.isProject && t.id !== id && !t.completed); // Exclude current item if it's a project
        editParentSelect.innerHTML = '<option value="">None (standalone task)</option>';
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.text;
            editParentSelect.appendChild(option);
        });
        editParentSelect.value = todo.parentId || '';

        // Handle parent project wrapper visibility
        const editParentWrapper = document.getElementById('editParentProjectWrapper');
        if (todo.isProject) {
            editParentWrapper.style.display = 'none';
        } else {
            editParentWrapper.style.display = 'block';
        }

        // Add event listener for project checkbox
        const editProjectCheckbox = document.getElementById('editProjectCheckbox');
        editProjectCheckbox.onchange = () => {
            if (editProjectCheckbox.checked) {
                editParentWrapper.style.display = 'none';
            } else {
                editParentWrapper.style.display = 'block';
            }
        };

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

        const isProject = document.getElementById('editProjectCheckbox').checked;
        const parentProjectId = document.getElementById('editParentProjectSelect').value;
        const oldParentId = todo.parentId;
        const newParentId = isProject ? null : (parentProjectId ? parseInt(parentProjectId) : null);

        todo.text = newText;
        todo.description = document.getElementById('editDescriptionInput').value.trim();
        todo.priority = document.getElementById('editPrioritySelect').value;
        todo.deadline = document.getElementById('editDeadlineInput').value || null;
        todo.isProject = isProject;
        todo.parentId = newParentId;

        // Handle parent project completion status changes
        if (oldParentId !== newParentId) {
            // If moved to a completed project, uncomplete it
            if (newParentId) {
                const newParent = this.todos.find(t => t.id === newParentId);
                if (newParent && newParent.completed && !todo.completed) {
                    newParent.completed = false;
                }
            }

            // If moved from a project, check if old parent should be completed
            if (oldParentId) {
                const oldParent = this.todos.find(t => t.id === oldParentId);
                if (oldParent) {
                    const remainingSubtasks = this.getSubtasks(oldParentId);
                    const allCompleted = remainingSubtasks.length > 0 && remainingSubtasks.every(t => t.completed);
                    oldParent.completed = allCompleted;
                }
            }
        }

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
        // Only show completed projects and standalone tasks (not subtasks, as they're shown under their project)
        return this.todos.filter(t => t.completed && !t.parentId);
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
                    <span class="description-icon" data-tooltip="${this.escapeHtml(todo.description.slice(0, 1000))}${todo.description.length > 1000 ? '...' : ''}">
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

    renderProjectItem(project) {
        const priority = project.priority || 'medium';
        const hasDescription = project.description && project.description.length > 0;
        const deadlineStatus = this.getDeadlineStatus(project.deadline);
        const formattedDeadline = this.formatDeadline(project.deadline);
        const progress = this.getProjectProgress(project.id);
        const isCollapsed = this.isProjectCollapsed(project.id);
        const collapseIcon = isCollapsed ? '▶' : '▼';

        return `
            <li class="todo-item project-item ${project.completed ? 'completed' : ''}" data-id="${project.id}">
                <span class="collapse-icon" onclick="todoApp.toggleProjectCollapse(${project.id})">${collapseIcon}</span>
                <input type="checkbox" ${project.completed ? 'checked' : ''}
                       onchange="todoApp.toggleTodo(${project.id})">
                <i class="fa-solid fa-folder project-icon"></i>
                <span class="todo-text">${this.escapeHtml(project.text)}</span>
                ${progress.total > 0 ? `<span class="project-progress">[${progress.completed}/${progress.total}]</span>` : `<span class="project-no-subtasks">(No subtasks)</span>`}
                <button class="quick-add-subtask-btn" onclick="todoApp.showQuickAddSubtask(${project.id})" title="Add subtask">
                    <i class="fa-solid fa-plus"></i>
                </button>
                ${hasDescription ? `
                    <span class="description-icon" data-tooltip="${this.escapeHtml(project.description.slice(0, 1000))}${project.description.length > 1000 ? '...' : ''}">
                        <i class="fa-solid fa-circle-info"></i>
                    </span>
                ` : ''}
                ${project.deadline ? `
                    <span class="deadline-badge deadline-${deadlineStatus}">${formattedDeadline}</span>
                ` : ''}
                <div class="priority-wrapper">
                    <span class="priority-badge priority-${priority} priority-clickable" onclick="todoApp.togglePriorityDropdown(${project.id}, event)">
                        ${priority}
                    </span>
                    <select class="priority-change-dropdown" id="priority-dropdown-${project.id}" onchange="todoApp.changePriority(${project.id}, this.value)" onblur="todoApp.hidePriorityDropdown(${project.id})">
                        <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
                        <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
                    </select>
                </div>
                <button class="edit-btn" onclick="todoApp.editTodo(${project.id})">
                    <i class="fa-solid fa-pencil"></i>
                </button>
                <button class="delete-btn" onclick="todoApp.deleteTodo(${project.id})">Delete</button>
            </li>
        `;
    }

    renderSubtask(subtask) {
        const priority = subtask.priority || 'medium';
        const hasDescription = subtask.description && subtask.description.length > 0;
        const deadlineStatus = this.getDeadlineStatus(subtask.deadline);
        const formattedDeadline = this.formatDeadline(subtask.deadline);

        return `
            <li class="todo-item subtask-item ${subtask.completed ? 'completed' : ''}" data-id="${subtask.id}">
                <span class="subtask-connector"></span>
                <input type="checkbox" ${subtask.completed ? 'checked' : ''}
                       onchange="todoApp.toggleTodo(${subtask.id})">
                <span class="todo-text">${this.escapeHtml(subtask.text)}</span>
                ${hasDescription ? `
                    <span class="description-icon" data-tooltip="${this.escapeHtml(subtask.description.slice(0, 1000))}${subtask.description.length > 1000 ? '...' : ''}">
                        <i class="fa-solid fa-circle-info"></i>
                    </span>
                ` : ''}
                ${subtask.deadline ? `
                    <span class="deadline-badge deadline-${deadlineStatus}">${formattedDeadline}</span>
                ` : ''}
                <div class="priority-wrapper">
                    <span class="priority-badge priority-${priority} priority-clickable" onclick="todoApp.togglePriorityDropdown(${subtask.id}, event)">
                        ${priority}
                    </span>
                    <select class="priority-change-dropdown" id="priority-dropdown-${subtask.id}" onchange="todoApp.changePriority(${subtask.id}, this.value)" onblur="todoApp.hidePriorityDropdown(${subtask.id})">
                        <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
                        <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
                    </select>
                </div>
                <button class="edit-btn" onclick="todoApp.editTodo(${subtask.id})">
                    <i class="fa-solid fa-pencil"></i>
                </button>
                <button class="delete-btn" onclick="todoApp.deleteTodo(${subtask.id})">Delete</button>
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

        // Update parent project dropdown
        this.populateParentProjectDropdown();

        // Get active projects, standalone tasks, and completed tasks
        const projects = this.getProjectTodos();
        const standaloneTodos = this.getStandaloneTodos().filter(t => !t.completed);
        const completedTodos = this.getCompletedTodos();

        // Sort projects and standalone tasks
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const sortByPriorityAndDeadline = (a, b) => {
            const aPriority = a.priority || 'medium';
            const bPriority = b.priority || 'medium';
            const priorityDiff = priorityOrder[aPriority] - priorityOrder[bPriority];
            if (priorityDiff !== 0) return priorityDiff;

            const aDeadline = a.deadline ? new Date(a.deadline) : null;
            const bDeadline = b.deadline ? new Date(b.deadline) : null;
            if (!aDeadline && !bDeadline) return 0;
            if (!aDeadline) return 1;
            if (!bDeadline) return -1;
            return aDeadline - bDeadline;
        };

        projects.sort(sortByPriorityAndDeadline);
        standaloneTodos.sort(sortByPriorityAndDeadline);

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

        // Render filter buttons
        const filterButtonsHtml = this.renderFilterButtons();

        // Apply filtering
        let filteredProjects = projects;
        let filteredStandalone = standaloneTodos;

        if (this.activeFilter === 'ungrouped') {
            filteredProjects = [];
        } else if (this.activeFilter !== 'all') {
            // Filter to show only one specific project
            filteredProjects = projects.filter(p => p.id === this.activeFilter);
            filteredStandalone = [];
        }

        // Render active tasks (projects + standalone)
        let activeHtml = filterButtonsHtml;

        // Render projects with their subtasks (including completed ones)
        filteredProjects.forEach(project => {
            activeHtml += this.renderProjectItem(project);

            // Render all subtasks if project is not collapsed
            if (!this.isProjectCollapsed(project.id)) {
                const subtasks = this.getSubtasks(project.id);
                subtasks.sort(sortByPriorityAndDeadline);
                subtasks.forEach(subtask => {
                    activeHtml += this.renderSubtask(subtask);
                });
            }
        });

        // Render ungrouped tasks section if there are any
        if (filteredStandalone.length > 0) {
            if (filteredProjects.length > 0) {
                activeHtml += '<li class="section-divider">Ungrouped Tasks</li>';
            }
            filteredStandalone.forEach(todo => {
                activeHtml += this.renderTodoItem(todo);
            });
        }

        if (filteredProjects.length === 0 && filteredStandalone.length === 0) {
            todoList.innerHTML = filterButtonsHtml + '<div class="empty-state">No tasks match this filter</div>';
        } else {
            todoList.innerHTML = activeHtml;
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
