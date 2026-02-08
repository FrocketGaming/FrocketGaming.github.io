/**
 * StorageManager - IndexedDB wrapper for QoL Tools
 * Provides async storage with automatic migration from localStorage
 */
class StorageManager {
    static DB_NAME = 'QoLToolsDB';
    static DB_VERSION = 1;
    static db = null;
    static initPromise = null;

    /**
     * Initialize the database connection
     * @returns {Promise<IDBDatabase>}
     */
    static async init() {
        // Return existing promise if already initializing
        if (this.initPromise) {
            return this.initPromise;
        }

        // Return existing connection if already initialized
        if (this.db) {
            return this.db;
        }

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB connected successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create snippets store
                if (!db.objectStoreNames.contains('snippets')) {
                    const snippetsStore = db.createObjectStore('snippets', { keyPath: 'id' });
                    snippetsStore.createIndex('type', 'type', { unique: false });
                    snippetsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // Create snippetTypes store
                if (!db.objectStoreNames.contains('snippetTypes')) {
                    db.createObjectStore('snippetTypes', { keyPath: 'id' });
                }

                // Create todos store
                if (!db.objectStoreNames.contains('todos')) {
                    const todosStore = db.createObjectStore('todos', { keyPath: 'id' });
                    todosStore.createIndex('completed', 'completed', { unique: false });
                    todosStore.createIndex('parentId', 'parentId', { unique: false });
                    todosStore.createIndex('isProject', 'isProject', { unique: false });
                }

                console.log('IndexedDB schema created/upgraded');
            };
        });

        await this.initPromise;
        return this.db;
    }

    /**
     * Get all records from a store
     * @param {string} storeName - Name of the object store
     * @returns {Promise<Array>}
     */
    static async getAll(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single record by ID
     * @param {string} storeName - Name of the object store
     * @param {*} id - Record ID
     * @returns {Promise<Object|undefined>}
     */
    static async get(storeName, id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Add or update a record
     * @param {string} storeName - Name of the object store
     * @param {Object} data - Data to store (must include id)
     * @returns {Promise<*>} - Returns the key of the stored record
     */
    static async put(storeName, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Add or update multiple records
     * @param {string} storeName - Name of the object store
     * @param {Array} dataArray - Array of data objects to store
     * @returns {Promise<void>}
     */
    static async putAll(storeName, dataArray) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);

            dataArray.forEach(data => {
                store.put(data);
            });
        });
    }

    /**
     * Delete a record by ID
     * @param {string} storeName - Name of the object store
     * @param {*} id - Record ID
     * @returns {Promise<void>}
     */
    static async delete(storeName, id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all records from a store
     * @param {string} storeName - Name of the object store
     * @returns {Promise<void>}
     */
    static async clear(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Migrate snippets data from localStorage to IndexedDB
     * @returns {Promise<boolean>} - Returns true if migration occurred
     */
    static async migrateSnippetsFromLocalStorage() {
        const SNIPPETS_KEY = 'snippets';
        const TYPES_KEY = 'snippetTypes';
        const MIGRATED_KEY = 'snippets_migrated_to_indexeddb';

        // Check if already migrated
        if (localStorage.getItem(MIGRATED_KEY)) {
            return false;
        }

        await this.init();

        let migrated = false;

        // Migrate snippets
        const snippetsData = localStorage.getItem(SNIPPETS_KEY);
        if (snippetsData) {
            try {
                const snippets = JSON.parse(snippetsData);
                if (Array.isArray(snippets) && snippets.length > 0) {
                    await this.putAll('snippets', snippets);
                    console.log(`Migrated ${snippets.length} snippets to IndexedDB`);
                    migrated = true;
                }
            } catch (e) {
                console.error('Failed to migrate snippets:', e);
            }
        }

        // Migrate snippet types
        const typesData = localStorage.getItem(TYPES_KEY);
        if (typesData) {
            try {
                const types = JSON.parse(typesData);
                if (Array.isArray(types) && types.length > 0) {
                    await this.putAll('snippetTypes', types);
                    console.log(`Migrated ${types.length} snippet types to IndexedDB`);
                    migrated = true;
                }
            } catch (e) {
                console.error('Failed to migrate snippet types:', e);
            }
        }

        if (migrated) {
            // Mark as migrated and clear localStorage
            localStorage.setItem(MIGRATED_KEY, 'true');
            localStorage.removeItem(SNIPPETS_KEY);
            localStorage.removeItem(TYPES_KEY);
            console.log('Snippets migration complete. localStorage data cleared.');
        }

        return migrated;
    }

    /**
     * Migrate todos data from localStorage to IndexedDB
     * @returns {Promise<boolean>} - Returns true if migration occurred
     */
    static async migrateTodosFromLocalStorage() {
        const TODOS_KEY = 'todos';
        const MIGRATED_KEY = 'todos_migrated_to_indexeddb';

        // Check if already migrated
        if (localStorage.getItem(MIGRATED_KEY)) {
            return false;
        }

        await this.init();

        let migrated = false;

        // Migrate todos
        const todosData = localStorage.getItem(TODOS_KEY);
        if (todosData) {
            try {
                const todos = JSON.parse(todosData);
                if (Array.isArray(todos) && todos.length > 0) {
                    await this.putAll('todos', todos);
                    console.log(`Migrated ${todos.length} todos to IndexedDB`);
                    migrated = true;
                }
            } catch (e) {
                console.error('Failed to migrate todos:', e);
            }
        }

        if (migrated) {
            // Mark as migrated and clear localStorage
            localStorage.setItem(MIGRATED_KEY, 'true');
            localStorage.removeItem(TODOS_KEY);
            console.log('Todos migration complete. localStorage data cleared.');
        }

        return migrated;
    }
}
