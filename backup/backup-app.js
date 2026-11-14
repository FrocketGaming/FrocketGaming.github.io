/**
 * Backup: collect every local store into one JSON file, and restore it.
 *
 * Data lives in two IndexedDB databases:
 *   QoLToolsDB       snippets, snippetTypes, snippetVersions, todos
 *   QoLPhaseBoardDB  one "state" record keyed "board"
 * plus a small set of UI settings in localStorage.
 */
(function () {
    "use strict";

    var FORMAT = "qol-tools-backup";
    var FORMAT_VERSION = 1;
    var MAX_BYTES = 25 * 1024 * 1024;

    var TOOL_STORES = {
        snippets: { keyPath: "id", indexes: [["type", "type"], ["updatedAt", "updatedAt"]] },
        snippetTypes: { keyPath: "id", indexes: [] },
        snippetVersions: { keyPath: "id", indexes: [["snippetId", "snippetId"], ["savedAt", "savedAt"]] },
        todos: { keyPath: "id", indexes: [["completed", "completed"], ["parentId", "parentId"], ["isProject", "isProject"]] }
    };

    var SETTING_KEYS = [
        "qol-tools-theme",
        "qol-tools-recent",
        "pb-completed-open",
        "pb-due-open",
        "todo-ui-state"
    ];

    var els = {};
    var pendingBackup = null;

    function el(id) { return document.getElementById(id); }

    function openDb(name, version, upgrade) {
        return new Promise(function (resolve, reject) {
            var request = version ? indexedDB.open(name, version) : indexedDB.open(name);
            request.onupgradeneeded = function () {
                if (upgrade) upgrade(request.result);
            };
            request.onsuccess = function () {
                var db = request.result;
                db.onversionchange = function () { db.close(); };
                resolve(db);
            };
            request.onerror = function () { reject(request.error); };
            request.onblocked = function () { reject(new Error("The database is open in another tab. Close it and try again.")); };
        });
    }

    function toolsUpgrade(db) {
        Object.keys(TOOL_STORES).forEach(function (name) {
            var definition = TOOL_STORES[name];
            var store = db.objectStoreNames.contains(name)
                ? null
                : db.createObjectStore(name, { keyPath: definition.keyPath });
            if (store) {
                definition.indexes.forEach(function (pair) {
                    store.createIndex(pair[0], pair[1], { unique: false });
                });
            }
        });
    }

    function stateUpgrade(db) {
        if (!db.objectStoreNames.contains("state")) {
            db.createObjectStore("state", { keyPath: "key" });
        }
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

    function putAll(db, storeName, rows) {
        return new Promise(function (resolve, reject) {
            if (!db.objectStoreNames.contains(storeName)) { resolve(); return; }
            var tx = db.transaction(storeName, "readwrite");
            var store = tx.objectStore(storeName);
            store.clear();
            rows.forEach(function (row) { store.put(row); });
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    function putRecord(db, storeName, record) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).put(record);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    async function databaseExists(name) {
        try {
            if (!indexedDB.databases) return true;
            var list = await indexedDB.databases();
            return list.some(function (db) { return db.name === name; });
        } catch (e) {
            return true;
        }
    }

    async function readStateDb(name, key) {
        if (!(await databaseExists(name))) return null;
        try {
            var db = await openDb(name, 1, stateUpgrade);
            var record = await getRecord(db, "state", key);
            db.close();
            return record || null;
        } catch (e) {
            console.warn("Backup: could not read " + name, e);
            return null;
        }
    }

    async function collect() {
        var data = {
            snippets: [],
            snippetTypes: [],
            snippetVersions: [],
            todos: [],
            phaseBoard: null
        };

        try {
            var toolsDb = await openDb("QoLToolsDB", 2, toolsUpgrade);
            data.snippets = await getAll(toolsDb, "snippets");
            data.snippetTypes = await getAll(toolsDb, "snippetTypes");
            data.snippetVersions = await getAll(toolsDb, "snippetVersions");
            data.todos = await getAll(toolsDb, "todos");
            toolsDb.close();
        } catch (e) {
            console.warn("Backup: could not read snippets and tasks", e);
        }

        var board = await readStateDb("QoLPhaseBoardDB", "board");
        if (board) data.phaseBoard = board;

        var settings = {};
        SETTING_KEYS.forEach(function (key) {
            try {
                var value = localStorage.getItem(key);
                if (value !== null) settings[key] = value;
            } catch (e) { /* ignore */ }
        });

        return {
            format: FORMAT,
            version: FORMAT_VERSION,
            exportedAt: new Date().toISOString(),
            app: "QoL Tools",
            data: data,
            settings: settings
        };
    }

    function formatBytes(bytes) {
        if (!bytes) return "0 KB";
        var units = ["B", "KB", "MB", "GB"];
        var index = 0;
        var value = bytes;
        while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
        return value.toFixed(value >= 10 || index === 0 ? 0 : 1) + " " + units[index];
    }

    function formatDate(iso) {
        if (!iso) return "—";
        var date = new Date(iso);
        if (isNaN(date)) return "—";
        var diff = Date.now() - date.getTime();
        if (diff < 60000) return "just now";
        if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
        if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
        if (diff < 604800000) return Math.floor(diff / 86400000) + "d ago";
        return date.toLocaleDateString();
    }

    function newest(list, field) {
        return list.reduce(function (latest, item) {
            var value = item && item[field];
            if (!value) return latest;
            return !latest || String(value) > String(latest) ? value : latest;
        }, "");
    }

    function countProjects(board) {
        return board && board.projects ? Object.keys(board.projects).length : 0;
    }

    async function render() {
        var backup = await collect();
        var data = backup.data;
        var size = new Blob([JSON.stringify(backup, null, 2)]).size;
        var projectCount = countProjects(data.phaseBoard);
        var flowCount = data.phaseBoard && data.phaseBoard.flows ? Object.keys(data.phaseBoard.flows).length : 0;

        var quota = "";
        if (navigator.storage && navigator.storage.estimate) {
            try {
                var estimate = await navigator.storage.estimate();
                quota = formatBytes(estimate.usage || 0) + " used of " + formatBytes(estimate.quota || 0);
            } catch (e) { quota = ""; }
        }

        var cards = [
            {
                title: "Snippets",
                count: data.snippets.length,
                meta: data.snippets.length ? "Last edited " + formatDate(newest(data.snippets, "updatedAt")) : "Nothing stored yet"
            },
            {
                title: "To-Do",
                count: data.todos.length,
                meta: data.todos.length ? "Newest " + formatDate(new Date(Number(newest(data.todos, "id")) || 0).toISOString()) : "Nothing stored yet"
            },
            {
                title: "Phase Board",
                count: projectCount,
                meta: projectCount ? projectCount + " project" + (projectCount === 1 ? "" : "s") + " · " + flowCount + " flow" + (flowCount === 1 ? "" : "s") : "Nothing stored yet"
            },
            {
                title: "Browser storage",
                count: null,
                meta: quota || "Estimate unavailable"
            }
        ];

        el("stats").innerHTML = cards.map(function (card) {
            return '<div class="stat-card"><h2>' + card.title + "</h2>" +
                (card.count === null ? "" : '<div class="stat-count">' + card.count + "</div>") +
                '<div class="stat-meta">' + card.meta + "</div></div>";
        }).join("");

        var lastBackup = "";
        try { lastBackup = localStorage.getItem("qol-last-backup") || ""; } catch (e) { lastBackup = ""; }
        var settingsCount = Object.keys(backup.settings || {}).length;

        el("details").innerHTML =
            "<strong>" + formatBytes(size) + "</strong> in this backup. " +
            "Format version " + FORMAT_VERSION + " · " + settingsCount + " setting" + (settingsCount === 1 ? "" : "s") + " included." +
            "<ul>" +
            "<li>Backup taken: " + (lastBackup ? formatDate(lastBackup) + " (" + new Date(lastBackup).toLocaleString() + ")" : "not yet") + "</li>" +
            "<li>Restoring replaces the matching stores in this browser; it does not upload anything.</li>" +
            "</ul>";
    }

    function setStatus(message, isError) {
        el("status").textContent = message;
        el("status").classList.toggle("is-error", !!isError);
    }

    async function download() {
        try {
            var backup = await collect();
            var json = JSON.stringify(backup, null, 2);
            var blob = new Blob([json], { type: "application/json" });
            var url = URL.createObjectURL(blob);
            var link = document.createElement("a");
            link.href = url;
            link.download = "qol-tools-backup-" + new Date().toISOString().slice(0, 10) + ".json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            try { localStorage.setItem("qol-last-backup", new Date().toISOString()); } catch (e) { /* ignore */ }
            setStatus("Backup downloaded (" + formatBytes(blob.size) + ").", false);
            render();
        } catch (e) {
            console.error("Backup: download failed", e);
            setStatus("Could not create the backup: " + e.message, true);
        }
    }

    async function chooseFile(file) {
        if (!file) return;
        if (file.size > MAX_BYTES) {
            setStatus("That file is larger than 25 MB; it is not a QoL Tools backup.", true);
            return;
        }
        try {
            var text = await file.text();
            var parsed = JSON.parse(text);
            if (parsed.format !== FORMAT || parsed.version !== FORMAT_VERSION || !parsed.data) {
                setStatus("That is not a QoL Tools backup file.", true);
                return;
            }
            pendingBackup = parsed;
            var data = parsed.data;
            var parts = [];
            if (Array.isArray(data.snippets)) parts.push(data.snippets.length + " snippets");
            if (Array.isArray(data.todos)) parts.push(data.todos.length + " tasks");
            if (data.phaseBoard) parts.push(countProjects(data.phaseBoard) + " projects");
            el("restoreSummary").textContent = "This file was exported " + new Date(parsed.exportedAt).toLocaleString() + " and contains " + (parts.join(", ") || "no tool data") + ".";
            el("restorePanel").hidden = false;
            setStatus("", false);
            render();
        } catch (e) {
            console.error("Backup: could not read the file", e);
            setStatus("Could not read that JSON file.", true);
        }
    }

    async function applyRestore() {
        if (!pendingBackup) return;
        var data = pendingBackup.data;
        el("confirmRestoreBtn").disabled = true;
        try {
            if (Array.isArray(data.snippets) || Array.isArray(data.snippetTypes) || Array.isArray(data.snippetVersions) || Array.isArray(data.todos)) {
                var toolsDb = await openDb("QoLToolsDB", 2, toolsUpgrade);
                for (var name of Object.keys(TOOL_STORES)) {
                    if (Array.isArray(data[name])) await putAll(toolsDb, name, data[name]);
                }
                toolsDb.close();
            }

            if (data.phaseBoard) {
                var boardDb = await openDb("QoLPhaseBoardDB", 1, stateUpgrade);
                await putRecord(boardDb, "state", Object.assign({ key: "board" }, data.phaseBoard));
                boardDb.close();
            }

            SETTING_KEYS.forEach(function (key) {
                if (!pendingBackup.settings || pendingBackup.settings[key] === undefined) return;
                try { localStorage.setItem(key, pendingBackup.settings[key]); } catch (e) { /* ignore */ }
            });

            if (window.ThemeManager && pendingBackup.settings && pendingBackup.settings["qol-tools-theme"]) {
                ThemeManager.applyTheme(pendingBackup.settings["qol-tools-theme"]);
                var themeSelect = document.getElementById("themeSelect");
                if (themeSelect) themeSelect.value = pendingBackup.settings["qol-tools-theme"];
            }

            pendingBackup = null;
            el("restorePanel").hidden = true;
            el("restoreFile").value = "";
            setStatus("Local data restored. Reload a tool to see the restored records.", false);
            await render();
        } catch (e) {
            console.error("Backup: restore failed", e);
            setStatus("Restore failed: " + e.message, true);
        } finally {
            el("confirmRestoreBtn").disabled = false;
        }
    }

    function bind() {
        el("downloadBtn").addEventListener("click", download);
        el("restoreBtn").addEventListener("click", function () { el("restoreFile").click(); });
        el("restoreFile").addEventListener("change", function (event) {
            chooseFile(event.target.files && event.target.files[0]);
        });
        el("confirmRestoreBtn").addEventListener("click", applyRestore);
        el("cancelRestoreBtn").addEventListener("click", function () {
            pendingBackup = null;
            el("restorePanel").hidden = true;
            el("restoreFile").value = "";
            setStatus("Restore cancelled.", false);
            render();
        });
    }

    bind();
    render().catch(function (e) {
        console.error("Backup: could not inspect local data", e);
        setStatus("Could not read local data: " + e.message, true);
    });
})();
