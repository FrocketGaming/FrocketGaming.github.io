// Theme Manager - Handles theme switching with localStorage caching
const ThemeManager = {
    STORAGE_KEY: 'qol-tools-theme',
    DEFAULT_THEME: 'default',

    themes: [
        { id: 'default', name: 'Default (Green)' },
        { id: 'dracula', name: 'Dracula' },
        { id: 'catppuccin', name: 'Catppuccin Mocha' },
        { id: 'atom', name: 'Atom One Dark' },
        { id: 'nord', name: 'Nord' },
        { id: 'solarized', name: 'Solarized Dark' },
        { id: 'synthwave', name: "SynthWave '84" }
    ],

    init() {
        // Apply saved theme immediately (before DOM is fully loaded)
        const savedTheme = this.getSavedTheme();
        this.applyTheme(savedTheme);

        // Set up the theme selector when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupSelector());
        } else {
            this.setupSelector();
        }
    },

    getSavedTheme() {
        try {
            return localStorage.getItem(this.STORAGE_KEY) || this.DEFAULT_THEME;
        } catch (e) {
            console.warn('Could not access localStorage:', e);
            return this.DEFAULT_THEME;
        }
    },

    saveTheme(themeId) {
        try {
            localStorage.setItem(this.STORAGE_KEY, themeId);
        } catch (e) {
            console.warn('Could not save theme to localStorage:', e);
        }
    },

    applyTheme(themeId) {
        if (themeId === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', themeId);
        }
    },

    setupSelector() {
        const selector = document.getElementById('themeSelect');
        if (!selector) return;

        // Populate options
        selector.innerHTML = this.themes.map(theme =>
            `<option value="${theme.id}">${theme.name}</option>`
        ).join('');

        // Set current value
        selector.value = this.getSavedTheme();

        // Add change listener
        selector.addEventListener('change', (e) => {
            const themeId = e.target.value;
            this.applyTheme(themeId);
            this.saveTheme(themeId);
        });
    }
};

// Initialize theme manager immediately
ThemeManager.init();
