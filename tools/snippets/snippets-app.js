/**
 * Snippets App - Code Snippet Manager
 * Uses IndexedDB for storage via shared StorageManager
 */

class SnippetsApp {
    constructor() {
        this.snippets = [];
        this.types = [];
        this.currentSnippet = null;
        this.editingSnippet = null;
        this.editingCategory = null;
        this.deleteTarget = null;
        this.deleteType = null;
        this.activeCategory = null;
        this.searchQuery = '';

        this.extensionToLanguage = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'md': 'markdown',
            'sql': 'sql',
            'sh': 'bash',
            'ps1': 'powershell',
            'yml': 'yaml',
            'dockerfile': 'dockerfile',
            'go': 'go',
            'rs': 'rust',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'php': 'php',
            'rb': 'ruby',
            'txt': 'plaintext'
        };

        this.defaultTypes = [
            { id: 1, name: 'JavaScript' },
            { id: 2, name: 'Python' },
            { id: 3, name: 'SQL' },
            { id: 4, name: 'HTML/CSS' },
            { id: 5, name: 'Utilities' },
            { id: 6, name: 'Other' }
        ];
    }

    async init() {
        try {
            // Migrate from localStorage if needed
            await StorageManager.migrateSnippetsFromLocalStorage();

            // Load data from IndexedDB
            this.snippets = await StorageManager.getAll('snippets');
            this.types = await StorageManager.getAll('snippetTypes');

            // If no types exist, create defaults
            if (this.types.length === 0) {
                await StorageManager.putAll('snippetTypes', this.defaultTypes);
                this.types = this.defaultTypes;
            }

            this.bindEvents();
            this.renderCategories();
            this.renderSnippetsList();
            this.updateSnippetsCount();
        } catch (error) {
            console.error('Failed to initialize Snippets App:', error);
        }
    }

    bindEvents() {
        // Toolbar
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderSnippetsList();
        });

        document.getElementById('newSnippetBtn').addEventListener('click', () => this.openNewSnippetModal());

        // Category
        document.getElementById('addCategoryBtn').addEventListener('click', () => this.openCategoryModal());
        document.getElementById('saveCategoryBtn').addEventListener('click', () => this.saveCategory());

        // Snippet modal
        document.getElementById('saveSnippetBtn').addEventListener('click', () => this.saveSnippet());

        // Delete modal
        document.getElementById('confirmDeleteBtn').addEventListener('click', () => this.confirmDelete());

        // Snippet view actions
        document.getElementById('copyBtn').addEventListener('click', () => this.copyToClipboard());
        document.getElementById('editBtn').addEventListener('click', () => this.openEditSnippetModal());
        document.getElementById('deleteBtn').addEventListener('click', () => this.openDeleteModal('snippet', this.currentSnippet));

        // Export/Import
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => this.importData(e));

        // Close modals on outside click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
                this.closeCategoryModal();
                this.closeDeleteModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeCategoryModal();
                this.closeDeleteModal();
            }
        });

        // Tab support in code textarea
        document.getElementById('snippetContentInput').addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
            }
        });
    }

    // Categories
    renderCategories() {
        const list = document.getElementById('categoryList');
        list.innerHTML = '';

        // Add "All" category
        const allItem = document.createElement('li');
        allItem.className = `category-item${this.activeCategory === null ? ' active' : ''}`;
        allItem.innerHTML = `
            <span class="category-name"><i class="fa-solid fa-layer-group"></i> All</span>
            <span class="category-count">${this.snippets.length}</span>
        `;
        allItem.addEventListener('click', () => this.selectCategory(null));
        list.appendChild(allItem);

        // Add user categories
        this.types.forEach(type => {
            const count = this.snippets.filter(s => s.type === type.name).length;
            const item = document.createElement('li');
            item.className = `category-item${this.activeCategory === type.name ? ' active' : ''}`;
            item.innerHTML = `
                <span class="category-name"><i class="fa-solid fa-folder"></i> ${type.name}</span>
                <span class="category-count">${count}</span>
                <div class="category-actions">
                    <button class="category-action-btn" onclick="event.stopPropagation(); snippetsApp.openEditCategoryModal(${type.id})">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="category-action-btn delete" onclick="event.stopPropagation(); snippetsApp.openDeleteModal('category', ${type.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            item.addEventListener('click', () => this.selectCategory(type.name));
            list.appendChild(item);
        });

        this.updateTypeSelect();
    }

    selectCategory(categoryName) {
        this.activeCategory = categoryName;
        this.renderCategories();
        this.renderSnippetsList();
    }

    updateTypeSelect() {
        const select = document.getElementById('snippetTypeSelect');
        select.innerHTML = this.types.map(t =>
            `<option value="${t.name}">${t.name}</option>`
        ).join('');
    }

    openCategoryModal(editId = null) {
        this.editingCategory = editId;
        const modal = document.getElementById('categoryModal');
        const title = document.getElementById('categoryModalTitle');
        const input = document.getElementById('categoryNameInput');

        if (editId) {
            const category = this.types.find(t => t.id === editId);
            title.textContent = 'Edit Category';
            input.value = category ? category.name : '';
        } else {
            title.textContent = 'Add Category';
            input.value = '';
        }

        modal.style.display = 'flex';
        input.focus();
    }

    openEditCategoryModal(id) {
        this.openCategoryModal(id);
    }

    closeCategoryModal() {
        document.getElementById('categoryModal').style.display = 'none';
        this.editingCategory = null;
    }

    async saveCategory() {
        const input = document.getElementById('categoryNameInput');
        const name = input.value.trim();

        if (!name) {
            alert('Please enter a category name');
            return;
        }

        try {
            if (this.editingCategory) {
                // Edit existing
                const category = this.types.find(t => t.id === this.editingCategory);
                if (category) {
                    const oldName = category.name;
                    category.name = name;
                    await StorageManager.put('snippetTypes', category);

                    // Update snippets with old category name
                    for (const snippet of this.snippets) {
                        if (snippet.type === oldName) {
                            snippet.type = name;
                            await StorageManager.put('snippets', snippet);
                        }
                    }
                }
            } else {
                // Add new
                const newCategory = { id: Date.now(), name };
                this.types.push(newCategory);
                await StorageManager.put('snippetTypes', newCategory);
            }

            this.closeCategoryModal();
            this.renderCategories();
            this.renderSnippetsList();
        } catch (error) {
            console.error('Failed to save category:', error);
            alert('Failed to save category. Please try again.');
        }
    }

    // Snippets List
    renderSnippetsList() {
        const list = document.getElementById('snippetsList');
        list.innerHTML = '';

        let filtered = this.snippets;

        // Filter by category
        if (this.activeCategory) {
            filtered = filtered.filter(s => s.type === this.activeCategory);
        }

        // Filter by search
        if (this.searchQuery) {
            filtered = filtered.filter(s =>
                s.name.toLowerCase().includes(this.searchQuery) ||
                (s.description && s.description.toLowerCase().includes(this.searchQuery)) ||
                s.content.toLowerCase().includes(this.searchQuery)
            );
        }

        // Sort by updated date (most recent first)
        filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        if (filtered.length === 0) {
            list.innerHTML = '<li class="empty-list">No snippets found</li>';
            return;
        }

        filtered.forEach(snippet => {
            const item = document.createElement('li');
            item.className = `snippet-item${this.currentSnippet && this.currentSnippet.id === snippet.id ? ' active' : ''}`;
            item.innerHTML = `
                <div class="snippet-item-name">${this.escapeHtml(snippet.name)}</div>
                <div class="snippet-item-meta">
                    <span class="snippet-item-type">${this.escapeHtml(snippet.type)}</span>
                    <span class="snippet-item-ext">.${snippet.extension}</span>
                </div>
            `;
            item.addEventListener('click', () => this.viewSnippet(snippet.id));
            list.appendChild(item);
        });

        this.updateSnippetsCount();
    }

    updateSnippetsCount() {
        let count = this.snippets.length;
        if (this.activeCategory) {
            count = this.snippets.filter(s => s.type === this.activeCategory).length;
        }
        document.getElementById('snippetsCount').textContent = `(${count})`;
    }

    // Snippet View
    viewSnippet(id) {
        const snippet = this.snippets.find(s => s.id === id);
        if (!snippet) return;

        this.currentSnippet = snippet;

        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('snippetView').style.display = 'flex';

        document.getElementById('snippetTitle').textContent = snippet.name;
        document.getElementById('snippetTypeBadge').textContent = snippet.type;
        document.getElementById('snippetDescription').textContent = snippet.description || '';

        const codeElement = document.getElementById('snippetCode');
        codeElement.textContent = snippet.content;
        codeElement.className = '';

        // Apply syntax highlighting
        const language = this.extensionToLanguage[snippet.extension] || 'plaintext';
        codeElement.classList.add(`language-${language}`);
        hljs.highlightElement(codeElement);

        document.getElementById('snippetCreated').textContent = `Created: ${this.formatDate(snippet.createdAt)}`;
        document.getElementById('snippetUpdated').textContent = `Updated: ${this.formatDate(snippet.updatedAt)}`;

        this.renderSnippetsList();
    }

    // Snippet Modal (Create/Edit)
    openNewSnippetModal() {
        this.editingSnippet = null;
        document.getElementById('modalTitle').textContent = 'New Snippet';
        document.getElementById('snippetNameInput').value = '';
        document.getElementById('snippetDescInput').value = '';
        document.getElementById('snippetContentInput').value = '';
        document.getElementById('snippetTypeSelect').value = this.activeCategory || this.types[0]?.name || '';
        document.getElementById('snippetExtSelect').value = 'js';
        document.getElementById('snippetModal').style.display = 'flex';
        document.getElementById('snippetNameInput').focus();
    }

    openEditSnippetModal() {
        if (!this.currentSnippet) return;

        this.editingSnippet = this.currentSnippet.id;
        document.getElementById('modalTitle').textContent = 'Edit Snippet';
        document.getElementById('snippetNameInput').value = this.currentSnippet.name;
        document.getElementById('snippetDescInput').value = this.currentSnippet.description || '';
        document.getElementById('snippetContentInput').value = this.currentSnippet.content;
        document.getElementById('snippetTypeSelect').value = this.currentSnippet.type;
        document.getElementById('snippetExtSelect').value = this.currentSnippet.extension;
        document.getElementById('snippetModal').style.display = 'flex';
        document.getElementById('snippetNameInput').focus();
    }

    closeModal() {
        document.getElementById('snippetModal').style.display = 'none';
        this.editingSnippet = null;
    }

    async saveSnippet() {
        const name = document.getElementById('snippetNameInput').value.trim();
        const type = document.getElementById('snippetTypeSelect').value;
        const extension = document.getElementById('snippetExtSelect').value;
        const description = document.getElementById('snippetDescInput').value.trim();
        const content = document.getElementById('snippetContentInput').value;

        if (!name) {
            alert('Please enter a snippet name');
            return;
        }

        if (!content) {
            alert('Please enter snippet content');
            return;
        }

        const now = new Date().toISOString();

        try {
            if (this.editingSnippet) {
                // Update existing
                const snippet = this.snippets.find(s => s.id === this.editingSnippet);
                if (snippet) {
                    snippet.name = name;
                    snippet.type = type;
                    snippet.extension = extension;
                    snippet.description = description;
                    snippet.content = content;
                    snippet.updatedAt = now;
                    await StorageManager.put('snippets', snippet);
                    this.currentSnippet = snippet;
                }
            } else {
                // Create new
                const newSnippet = {
                    id: Date.now(),
                    name,
                    type,
                    extension,
                    description,
                    content,
                    createdAt: now,
                    updatedAt: now
                };
                this.snippets.push(newSnippet);
                await StorageManager.put('snippets', newSnippet);
                this.currentSnippet = newSnippet;
            }

            this.closeModal();
            this.renderCategories();
            this.renderSnippetsList();

            if (this.currentSnippet) {
                this.viewSnippet(this.currentSnippet.id);
            }
        } catch (error) {
            console.error('Failed to save snippet:', error);
            alert('Failed to save snippet. Please try again.');
        }
    }

    // Delete
    openDeleteModal(type, target) {
        this.deleteType = type;
        this.deleteTarget = target;

        const message = document.getElementById('deleteMessage');
        if (type === 'snippet') {
            message.textContent = 'Are you sure you want to delete this snippet? This action cannot be undone.';
        } else if (type === 'category') {
            const category = this.types.find(t => t.id === target);
            const snippetCount = this.snippets.filter(s => s.type === category?.name).length;
            message.textContent = `Are you sure you want to delete the "${category?.name}" category? ${snippetCount} snippet(s) will be moved to "Other".`;
        }

        document.getElementById('deleteModal').style.display = 'flex';
    }

    closeDeleteModal() {
        document.getElementById('deleteModal').style.display = 'none';
        this.deleteType = null;
        this.deleteTarget = null;
    }

    async confirmDelete() {
        try {
            if (this.deleteType === 'snippet' && this.deleteTarget) {
                await StorageManager.delete('snippets', this.deleteTarget.id);
                this.snippets = this.snippets.filter(s => s.id !== this.deleteTarget.id);

                if (this.currentSnippet && this.currentSnippet.id === this.deleteTarget.id) {
                    this.currentSnippet = null;
                    document.getElementById('snippetView').style.display = 'none';
                    document.getElementById('emptyState').style.display = 'flex';
                }
            } else if (this.deleteType === 'category' && this.deleteTarget) {
                const category = this.types.find(t => t.id === this.deleteTarget);
                if (category) {
                    // Move snippets to "Other"
                    for (const snippet of this.snippets) {
                        if (snippet.type === category.name) {
                            snippet.type = 'Other';
                            await StorageManager.put('snippets', snippet);
                        }
                    }

                    // Remove category
                    await StorageManager.delete('snippetTypes', this.deleteTarget);
                    this.types = this.types.filter(t => t.id !== this.deleteTarget);

                    if (this.activeCategory === category.name) {
                        this.activeCategory = null;
                    }
                }
            }

            this.closeDeleteModal();
            this.renderCategories();
            this.renderSnippetsList();
        } catch (error) {
            console.error('Failed to delete:', error);
            alert('Failed to delete. Please try again.');
        }
    }

    // Copy to Clipboard
    copyToClipboard() {
        if (!this.currentSnippet) return;

        navigator.clipboard.writeText(this.currentSnippet.content).then(() => {
            this.showNotification();
        }).catch(err => {
            console.error('Failed to copy:', err);
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = this.currentSnippet.content;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showNotification();
        });
    }

    showNotification() {
        const notification = document.getElementById('copyNotification');
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 2000);
    }

    // Export/Import
    async exportData() {
        const data = {
            snippets: this.snippets,
            types: this.types,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snippets-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (data.snippets && Array.isArray(data.snippets)) {
                    // Merge snippets (avoid duplicates by id)
                    const existingIds = new Set(this.snippets.map(s => s.id));
                    const newSnippets = data.snippets.filter(s => !existingIds.has(s.id));

                    for (const snippet of newSnippets) {
                        await StorageManager.put('snippets', snippet);
                        this.snippets.push(snippet);
                    }
                }

                if (data.types && Array.isArray(data.types)) {
                    // Merge types (avoid duplicates by name)
                    const existingNames = new Set(this.types.map(t => t.name));
                    const newTypes = data.types.filter(t => !existingNames.has(t.name));

                    for (const type of newTypes) {
                        await StorageManager.put('snippetTypes', type);
                        this.types.push(type);
                    }
                }

                this.renderCategories();
                this.renderSnippetsList();
                alert(`Import successful! Added ${data.snippets?.length || 0} snippets.`);
            } catch (err) {
                console.error('Import error:', err);
                alert('Failed to import data. Please check the file format.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // Utilities
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
let snippetsApp;
document.addEventListener('DOMContentLoaded', async () => {
    snippetsApp = new SnippetsApp();
    await snippetsApp.init();
});
