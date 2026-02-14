/**
 * Snippets App - Code Snippet Manager
 * Uses IndexedDB for storage via shared StorageManager
 * Optional cloud sync via FirebaseSync
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
    this.searchQuery = "";
    this.sortPreference =
      localStorage.getItem("snippets-sort-preference") || "name-asc";
    this.selectedVersion = null;

    this.extensionToLanguage = {
      js: "javascript",
      ts: "typescript",
      py: "python",
      html: "html",
      css: "css",
      json: "json",
      md: "markdown",
      sql: "sql",
      sh: "bash",
      ps1: "powershell",
      yml: "yaml",
      dockerfile: "dockerfile",
      go: "go",
      rs: "rust",
      java: "java",
      cpp: "cpp",
      c: "c",
      php: "php",
      rb: "ruby",
      txt: "plaintext",
    };

    this.categoryIconMap = {
      javascript: "fa-brands fa-js",
      python: "fa-brands fa-python",
      html: "fa-brands fa-html5",
      "html/css": "fa-brands fa-html5",
      css: "fa-brands fa-css3-alt",
      java: "fa-brands fa-java",
      php: "fa-brands fa-php",
      rust: "fa-brands fa-rust",
      go: "fa-brands fa-golang",
      git: "fa-brands fa-git",
      golang: "fa-brands fa-golang",
      markdown: "fa-brands fa-markdown",
      docker: "fa-brands fa-docker",
      node: "fa-brands fa-node-js",
      "node.js": "fa-brands fa-node-js",
      react: "fa-brands fa-react",
      angular: "fa-brands fa-angular",
      vue: "fa-brands fa-vuejs",
      sql: "fa-solid fa-database",
      bigquery: "fa-solid fa-database",
      shell: "fa-solid fa-terminal",
      linux: "fa-brands fa-linux",
      nushell: "fa-solid fa-terminal",
      bash: "fa-solid fa-terminal",
      powershell: "fa-solid fa-terminal",
      ruby: "fa-solid fa-gem",
      c: "fa-solid fa-code",
      "c++": "fa-solid fa-code",
      typescript: "fa-solid fa-code",
      yaml: "fa-solid fa-file-code",
      yml: "fa-solid fa-file-code",
    };

    this.defaultTypes = [
      { id: 1, name: "JavaScript" },
      { id: 2, name: "Python" },
      { id: 3, name: "SQL" },
      { id: 4, name: "HTML/CSS" },
      { id: 5, name: "Utilities" },
      { id: 6, name: "Other" },
    ];

    this.activeTemplateTab = "JavaScript";

    this.templates = {
      JavaScript: [
        {
          name: "Fetch API Call",
          extension: "js",
          category: "JavaScript",
          description: "GET request with async/await and error handling",
          content: "async function fetchData(url) {\n  try {\n    const response = await fetch(url);\n    if (!response.ok) {\n      throw new Error(`HTTP error! status: ${response.status}`);\n    }\n    const data = await response.json();\n    return data;\n  } catch (error) {\n    console.error('Fetch failed:', error);\n    throw error;\n  }\n}",
        },
        {
          name: "POST Request",
          extension: "js",
          category: "JavaScript",
          description: "POST request with JSON body",
          content: "async function postData(url, body) {\n  const response = await fetch(url, {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify(body),\n  });\n  if (!response.ok) {\n    throw new Error(`HTTP error! status: ${response.status}`);\n  }\n  return response.json();\n}",
        },
        {
          name: "Event Listener",
          extension: "js",
          category: "JavaScript",
          description: "DOM event listener with delegation",
          content: "document.getElementById('container').addEventListener('click', (e) => {\n  const target = e.target.closest('[data-action]');\n  if (!target) return;\n\n  const action = target.dataset.action;\n  switch (action) {\n    case 'edit':\n      handleEdit(target);\n      break;\n    case 'delete':\n      handleDelete(target);\n      break;\n  }\n});",
        },
        {
          name: "Class Skeleton",
          extension: "js",
          category: "JavaScript",
          description: "ES6 class with constructor and methods",
          content: "class MyClass {\n  constructor(options = {}) {\n    this.name = options.name || 'default';\n    this.items = [];\n  }\n\n  add(item) {\n    this.items.push(item);\n    return this;\n  }\n\n  remove(id) {\n    this.items = this.items.filter(item => item.id !== id);\n    return this;\n  }\n\n  find(id) {\n    return this.items.find(item => item.id === id);\n  }\n\n  toJSON() {\n    return { name: this.name, items: this.items };\n  }\n}",
        },
        {
          name: "Debounce",
          extension: "js",
          category: "Utilities",
          description: "Debounce function to limit execution rate",
          content: "function debounce(fn, delay = 300) {\n  let timer;\n  return function (...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), delay);\n  };\n}\n\n// Usage:\n// const debouncedSearch = debounce((query) => search(query), 300);\n// input.addEventListener('input', (e) => debouncedSearch(e.target.value));",
        },
        {
          name: "Array Helpers",
          extension: "js",
          category: "Utilities",
          description: "Common array operations: group, unique, chunk",
          content: "// Group array of objects by a key\nconst groupBy = (arr, key) =>\n  arr.reduce((groups, item) => {\n    const val = item[key];\n    (groups[val] = groups[val] || []).push(item);\n    return groups;\n  }, {});\n\n// Get unique values\nconst unique = (arr) => [...new Set(arr)];\n\n// Chunk array into smaller arrays\nconst chunk = (arr, size) =>\n  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>\n    arr.slice(i * size, i * size + size)\n  );",
        },
        {
          name: "Local Storage Wrapper",
          extension: "js",
          category: "Utilities",
          description: "Safe localStorage get/set with JSON parsing",
          content: "const storage = {\n  get(key, defaultValue = null) {\n    try {\n      const item = localStorage.getItem(key);\n      return item ? JSON.parse(item) : defaultValue;\n    } catch {\n      return defaultValue;\n    }\n  },\n\n  set(key, value) {\n    try {\n      localStorage.setItem(key, JSON.stringify(value));\n      return true;\n    } catch {\n      return false;\n    }\n  },\n\n  remove(key) {\n    localStorage.removeItem(key);\n  },\n};",
        },
        {
          name: "Promise.all with Limit",
          extension: "js",
          category: "JavaScript",
          description: "Run promises concurrently with a concurrency limit",
          content: "async function promiseAllLimit(tasks, limit = 5) {\n  const results = [];\n  const executing = new Set();\n\n  for (const [index, task] of tasks.entries()) {\n    const promise = Promise.resolve().then(() => task());\n    results[index] = promise;\n    executing.add(promise);\n\n    const cleanup = () => executing.delete(promise);\n    promise.then(cleanup, cleanup);\n\n    if (executing.size >= limit) {\n      await Promise.race(executing);\n    }\n  }\n\n  return Promise.all(results);\n}",
        },
      ],
      Python: [
        {
          name: "Class with Dataclass",
          extension: "py",
          category: "Python",
          description: "Python dataclass with default values and methods",
          content: "from dataclasses import dataclass, field\nfrom typing import List, Optional\n\n@dataclass\nclass User:\n    name: str\n    email: str\n    age: int = 0\n    tags: List[str] = field(default_factory=list)\n    bio: Optional[str] = None\n\n    def display_name(self) -> str:\n        return f\"{self.name} <{self.email}>\"\n\n    def to_dict(self) -> dict:\n        return {\n            \"name\": self.name,\n            \"email\": self.email,\n            \"age\": self.age,\n            \"tags\": self.tags,\n            \"bio\": self.bio,\n        }",
        },
        {
          name: "File Read/Write",
          extension: "py",
          category: "Python",
          description: "Read and write files with context managers",
          content: "from pathlib import Path\nimport json\n\ndef read_text(filepath: str) -> str:\n    return Path(filepath).read_text(encoding=\"utf-8\")\n\ndef write_text(filepath: str, content: str) -> None:\n    Path(filepath).write_text(content, encoding=\"utf-8\")\n\ndef read_json(filepath: str) -> dict:\n    with open(filepath, \"r\", encoding=\"utf-8\") as f:\n        return json.load(f)\n\ndef write_json(filepath: str, data: dict, indent: int = 2) -> None:\n    with open(filepath, \"w\", encoding=\"utf-8\") as f:\n        json.dump(data, f, indent=indent, ensure_ascii=False)",
        },
        {
          name: "HTTP Request",
          extension: "py",
          category: "Python",
          description: "GET/POST requests with error handling",
          content: "import requests\n\ndef get_json(url: str, params: dict = None, timeout: int = 30) -> dict:\n    response = requests.get(url, params=params, timeout=timeout)\n    response.raise_for_status()\n    return response.json()\n\ndef post_json(url: str, data: dict, timeout: int = 30) -> dict:\n    response = requests.post(url, json=data, timeout=timeout)\n    response.raise_for_status()\n    return response.json()\n\n# Usage:\n# data = get_json(\"https://api.example.com/items\", params={\"page\": 1})\n# result = post_json(\"https://api.example.com/items\", data={\"name\": \"New\"})",
        },
        {
          name: "CLI with argparse",
          extension: "py",
          category: "Python",
          description: "Command-line script template with argparse",
          content: "import argparse\nimport sys\n\ndef main():\n    parser = argparse.ArgumentParser(description=\"My CLI tool\")\n    parser.add_argument(\"input\", help=\"Input file path\")\n    parser.add_argument(\"-o\", \"--output\", default=\"output.txt\", help=\"Output file\")\n    parser.add_argument(\"-v\", \"--verbose\", action=\"store_true\", help=\"Verbose output\")\n    parser.add_argument(\"--limit\", type=int, default=100, help=\"Max items\")\n\n    args = parser.parse_args()\n\n    if args.verbose:\n        print(f\"Processing {args.input} -> {args.output}\")\n\n    # Your logic here\n    print(f\"Done. Limit: {args.limit}\")\n\nif __name__ == \"__main__\":\n    main()",
        },
        {
          name: "Decorator",
          extension: "py",
          category: "Python",
          description: "Function decorator with timing and logging",
          content: "import functools\nimport time\n\ndef timer(func):\n    \"\"\"Log the execution time of a function.\"\"\"\n    @functools.wraps(func)\n    def wrapper(*args, **kwargs):\n        start = time.perf_counter()\n        result = func(*args, **kwargs)\n        elapsed = time.perf_counter() - start\n        print(f\"{func.__name__} took {elapsed:.4f}s\")\n        return result\n    return wrapper\n\ndef retry(max_attempts=3, delay=1):\n    \"\"\"Retry a function on exception.\"\"\"\n    def decorator(func):\n        @functools.wraps(func)\n        def wrapper(*args, **kwargs):\n            for attempt in range(1, max_attempts + 1):\n                try:\n                    return func(*args, **kwargs)\n                except Exception as e:\n                    if attempt == max_attempts:\n                        raise\n                    print(f\"Attempt {attempt} failed: {e}. Retrying...\")\n                    time.sleep(delay)\n        return wrapper\n    return decorator",
        },
        {
          name: "List/Dict Comprehensions",
          extension: "py",
          category: "Python",
          description: "Common comprehension patterns",
          content: "# Filter and transform\nevens = [x for x in range(20) if x % 2 == 0]\nsquared = {x: x**2 for x in range(10)}\n\n# Flatten nested lists\nnested = [[1, 2], [3, 4], [5, 6]]\nflat = [item for sublist in nested for item in sublist]\n\n# Dictionary from two lists\nkeys = [\"name\", \"age\", \"city\"]\nvalues = [\"Alice\", 30, \"NYC\"]\nmapping = dict(zip(keys, values))\n\n# Group items by condition\nitems = [(\"apple\", 1.2), (\"banana\", 0.5), (\"cherry\", 2.0), (\"date\", 0.8)]\ncheap = {name: price for name, price in items if price < 1.0}\nexpensive = {name: price for name, price in items if price >= 1.0}",
        },
        {
          name: "Context Manager",
          extension: "py",
          category: "Python",
          description: "Custom context manager with __enter__/__exit__",
          content: "from contextlib import contextmanager\nimport time\n\n@contextmanager\ndef timer(label=\"Block\"):\n    \"\"\"Time a block of code.\"\"\"\n    start = time.perf_counter()\n    try:\n        yield\n    finally:\n        elapsed = time.perf_counter() - start\n        print(f\"{label}: {elapsed:.4f}s\")\n\n# Usage:\n# with timer(\"Data processing\"):\n#     process_data()\n\n@contextmanager\ndef temp_directory():\n    \"\"\"Create and clean up a temporary directory.\"\"\"\n    import tempfile, shutil\n    tmpdir = tempfile.mkdtemp()\n    try:\n        yield tmpdir\n    finally:\n        shutil.rmtree(tmpdir)",
        },
      ],
      SQL: [
        {
          name: "SELECT with JOIN",
          extension: "sql",
          category: "SQL",
          description: "Multi-table query with INNER and LEFT JOIN",
          content: "SELECT\n    u.id,\n    u.name,\n    u.email,\n    o.order_id,\n    o.total,\n    o.created_at\nFROM users u\nINNER JOIN orders o ON o.user_id = u.id\nLEFT JOIN addresses a ON a.user_id = u.id\nWHERE u.active = 1\n  AND o.created_at >= '2024-01-01'\nORDER BY o.created_at DESC\nLIMIT 100;",
        },
        {
          name: "CREATE TABLE",
          extension: "sql",
          category: "SQL",
          description: "Table creation with common column types and constraints",
          content: "CREATE TABLE IF NOT EXISTS users (\n    id          BIGINT PRIMARY KEY AUTO_INCREMENT,\n    name        VARCHAR(255) NOT NULL,\n    email       VARCHAR(255) NOT NULL UNIQUE,\n    role        ENUM('admin', 'user', 'viewer') DEFAULT 'user',\n    is_active   BOOLEAN DEFAULT TRUE,\n    metadata    JSON,\n    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n\n    INDEX idx_email (email),\n    INDEX idx_role_active (role, is_active)\n);",
        },
        {
          name: "CTE (Common Table Expression)",
          extension: "sql",
          category: "SQL",
          description: "Recursive and non-recursive CTEs",
          content: "-- Non-recursive CTE: monthly revenue summary\nWITH monthly_revenue AS (\n    SELECT\n        DATE_TRUNC('month', order_date) AS month,\n        SUM(total) AS revenue,\n        COUNT(*) AS order_count\n    FROM orders\n    WHERE order_date >= '2024-01-01'\n    GROUP BY DATE_TRUNC('month', order_date)\n)\nSELECT\n    month,\n    revenue,\n    order_count,\n    revenue / order_count AS avg_order_value,\n    LAG(revenue) OVER (ORDER BY month) AS prev_month_revenue\nFROM monthly_revenue\nORDER BY month;",
        },
        {
          name: "Window Functions",
          extension: "sql",
          category: "SQL",
          description: "ROW_NUMBER, RANK, running totals, and moving averages",
          content: "SELECT\n    id,\n    name,\n    department,\n    salary,\n    -- Rank within department\n    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank,\n    RANK() OVER (ORDER BY salary DESC) AS overall_rank,\n    -- Running total\n    SUM(salary) OVER (ORDER BY hire_date ROWS UNBOUNDED PRECEDING) AS running_total,\n    -- Moving average (last 3)\n    AVG(salary) OVER (ORDER BY hire_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg,\n    -- Percent of department total\n    ROUND(salary * 100.0 / SUM(salary) OVER (PARTITION BY department), 2) AS pct_of_dept\nFROM employees\nORDER BY department, salary DESC;",
        },
        {
          name: "UPSERT / MERGE",
          extension: "sql",
          category: "SQL",
          description: "Insert or update on conflict",
          content: "-- MySQL: INSERT ... ON DUPLICATE KEY UPDATE\nINSERT INTO users (id, name, email, updated_at)\nVALUES (1, 'Alice', 'alice@example.com', NOW())\nON DUPLICATE KEY UPDATE\n    name = VALUES(name),\n    email = VALUES(email),\n    updated_at = NOW();\n\n-- PostgreSQL: INSERT ... ON CONFLICT\nINSERT INTO users (id, name, email, updated_at)\nVALUES (1, 'Alice', 'alice@example.com', NOW())\nON CONFLICT (id) DO UPDATE SET\n    name = EXCLUDED.name,\n    email = EXCLUDED.email,\n    updated_at = NOW();",
        },
        {
          name: "GROUP BY with HAVING",
          extension: "sql",
          category: "SQL",
          description: "Aggregation with filtering on grouped results",
          content: "SELECT\n    department,\n    COUNT(*) AS employee_count,\n    ROUND(AVG(salary), 2) AS avg_salary,\n    MIN(salary) AS min_salary,\n    MAX(salary) AS max_salary,\n    SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_count\nFROM employees\nWHERE hire_date >= '2020-01-01'\nGROUP BY department\nHAVING COUNT(*) >= 5\n   AND AVG(salary) > 50000\nORDER BY avg_salary DESC;",
        },
        {
          name: "Subquery Patterns",
          extension: "sql",
          category: "SQL",
          description: "Correlated subquery, EXISTS, IN",
          content: "-- Find users with orders above their average\nSELECT u.name, o.total\nFROM users u\nJOIN orders o ON o.user_id = u.id\nWHERE o.total > (\n    SELECT AVG(o2.total)\n    FROM orders o2\n    WHERE o2.user_id = u.id\n);\n\n-- EXISTS: users who have placed at least one order\nSELECT u.name\nFROM users u\nWHERE EXISTS (\n    SELECT 1 FROM orders o WHERE o.user_id = u.id\n);\n\n-- NOT IN: users with no orders\nSELECT u.name\nFROM users u\nWHERE u.id NOT IN (\n    SELECT DISTINCT user_id FROM orders\n);",
        },
      ],
    };
  }

  async init() {
    try {
      // Migrate from localStorage if needed
      await StorageManager.migrateSnippetsFromLocalStorage();

      // Load data from IndexedDB
      this.snippets = await StorageManager.getAll("snippets");
      this.types = await StorageManager.getAll("snippetTypes");

      // If no types exist, create defaults
      if (this.types.length === 0) {
        await StorageManager.putAll("snippetTypes", this.defaultTypes);
        this.types = this.defaultTypes;
      }

      this.bindEvents();
      this.renderCategories();
      this.renderSnippetsList();
      this.updateSnippetsCount();

      // Restore sort preference
      document.getElementById("sortSelect").value = this.sortPreference;

      // Initialize Firebase sync if available
      if (typeof FirebaseSync !== "undefined") {
        FirebaseSync.init({
          onAuthChange: (user) => this.handleAuthChange(user),
          onSyncStatus: (status) => this.updateSyncStatusUI(status),
          onRemoteSnippets: (snippets) => this.handleRemoteSnippets(snippets),
          onRemoteTypes: (types) => this.handleRemoteTypes(types),
          onRemoteVersions: (versions) => this.handleRemoteVersions(versions),
        });

        // Check for shared snippet in URL
        this.checkShareParam();
      }
    } catch (error) {
      console.error("Failed to initialize Snippets App:", error);
    }
  }

  bindEvents() {
    // Toolbar
    document.getElementById("searchInput").addEventListener("input", (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderSnippetsList();
    });

    document
      .getElementById("newSnippetBtn")
      .addEventListener("click", () => this.openNewSnippetModal());

    // Templates
    document
      .getElementById("templatesBtn")
      .addEventListener("click", () => this.openTemplatesModal());

    // Sort select
    document.getElementById("sortSelect").addEventListener("change", (e) => {
      this.sortPreference = e.target.value;
      localStorage.setItem("snippets-sort-preference", this.sortPreference);
      this.renderSnippetsList();
    });

    // Shortcuts info tooltip
    document.getElementById("shortcutsBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("shortcutsTooltip").classList.toggle("show");
    });
    document.addEventListener("click", (e) => {
      const tooltip = document.getElementById("shortcutsTooltip");
      if (
        tooltip.classList.contains("show") &&
        !e.target.closest(".shortcuts-info")
      ) {
        tooltip.classList.remove("show");
      }
    });

    // Category
    document
      .getElementById("addCategoryBtn")
      .addEventListener("click", () => this.openCategoryModal());
    document
      .getElementById("saveCategoryBtn")
      .addEventListener("click", () => this.saveCategory());

    // Snippet modal
    document
      .getElementById("saveSnippetBtn")
      .addEventListener("click", () => this.saveSnippet());

    // Delete modal
    document
      .getElementById("confirmDeleteBtn")
      .addEventListener("click", () => this.confirmDelete());

    // Snippet view actions
    document
      .getElementById("favoriteBtn")
      .addEventListener("click", () => this.toggleFavorite());
    document
      .getElementById("copyBtn")
      .addEventListener("click", () => this.copyToClipboard());
    document
      .getElementById("editBtn")
      .addEventListener("click", () => this.openEditSnippetModal());
    document
      .getElementById("deleteBtn")
      .addEventListener("click", () =>
        this.openDeleteModal("snippet", this.currentSnippet),
      );
    document
      .getElementById("shareSnippetBtn")
      .addEventListener("click", () => this.openShareModal());
    document
      .getElementById("historyBtn")
      .addEventListener("click", () => this.openHistoryModal());
    document
      .getElementById("generateShareBtn")
      .addEventListener("click", () => this.generateShareLink());
    document
      .getElementById("copyShareLinkBtn")
      .addEventListener("click", () => this.copyShareLink());
    document
      .getElementById("copySharedCodeBtn")
      .addEventListener("click", () => this.copySharedCode());
    document
      .getElementById("importSharedBtn")
      .addEventListener("click", () => this.importSharedSnippet());
    document
      .getElementById("restoreVersionBtn")
      .addEventListener("click", () => this.restoreVersion());

    // Tag input
    const tagInput = document.getElementById("tagInput");
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        this.addTagChip(tagInput.value);
        tagInput.value = "";
      } else if (e.key === "Backspace" && tagInput.value === "") {
        // Remove last chip on backspace when input is empty
        const chips = document.getElementById("tagChips");
        if (chips.lastElementChild) {
          chips.lastElementChild.remove();
        }
      }
    });

    // Focus tag input when clicking wrapper
    document.getElementById("tagInputWrapper").addEventListener("click", () => {
      tagInput.focus();
    });

    // Export/Import
    document
      .getElementById("exportBtn")
      .addEventListener("click", () => this.exportData());
    document.getElementById("importBtn").addEventListener("click", () => {
      document.getElementById("importFileInput").click();
    });
    document
      .getElementById("importFileInput")
      .addEventListener("change", (e) => this.importData(e));

    // Auth buttons
    const signInBtn = document.getElementById("signInBtn");
    const signOutBtn = document.getElementById("signOutBtn");
    const mergeConfirmBtn = document.getElementById("mergeConfirmBtn");
    const mergeSkipBtn = document.getElementById("mergeSkipBtn");
    if (signInBtn)
      signInBtn.addEventListener("click", () => this.handleSignIn());
    if (signOutBtn)
      signOutBtn.addEventListener("click", () => this.handleSignOut());
    if (mergeConfirmBtn)
      mergeConfirmBtn.addEventListener("click", () =>
        this.handleMergeConfirm(),
      );
    if (mergeSkipBtn)
      mergeSkipBtn.addEventListener("click", () => this.handleMergeSkip());

    // Close modals on outside click
    window.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal")) {
        this.closeModal();
        this.closeCategoryModal();
        this.closeDeleteModal();
        this.closeMergeModal();
        this.closeShareModal();
        this.closeSharedSnippetModal();
        this.closeHistoryModal();
        this.closeTemplatesModal();
      }
    });

    // Global keyboard shortcuts
    document.addEventListener("keydown", (e) => this.handleKeydown(e));

    // Tab support in code textarea
    document
      .getElementById("snippetContentInput")
      .addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const textarea = e.target;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value =
            textarea.value.substring(0, start) +
            "    " +
            textarea.value.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + 4;
        }
      });
  }

  // ─── Keyboard Shortcuts ───────────────────────────────────

  handleKeydown(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const isTyping = tag === "input" || tag === "textarea" || tag === "select";
    const anyModalOpen = this.isAnyModalOpen();

    // Escape always works
    if (e.key === "Escape") {
      if (anyModalOpen) {
        this.closeModal();
        this.closeCategoryModal();
        this.closeDeleteModal();
        this.closeMergeModal();
        this.closeShareModal();
        this.closeSharedSnippetModal();
        this.closeHistoryModal();
        this.closeTemplatesModal();
      } else if (this.currentSnippet) {
        this.currentSnippet = null;
        document.getElementById("snippetView").style.display = "none";
        document.getElementById("emptyState").style.display = "flex";
        this.renderSnippetsList();
      }
      return;
    }

    // Don't fire shortcuts when typing in inputs or when a modal is open
    if (isTyping || anyModalOpen) return;

    // Ctrl+N or Alt+N — new snippet
    if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      this.openNewSnippetModal();
      return;
    }

    // / or Ctrl+K — focus search
    if (e.key === "/" || (e.ctrlKey && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      document.getElementById("searchInput").focus();
      return;
    }

    // Ctrl+E — edit selected snippet
    if (e.ctrlKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      this.openEditSnippetModal();
      return;
    }

    // Ctrl+D — duplicate selected snippet
    if (e.ctrlKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.duplicateSnippet();
      return;
    }

    // Arrow Up/Down — navigate snippet list
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      this.navigateSnippetList(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
  }

  isAnyModalOpen() {
    const modals = document.querySelectorAll(".modal");
    for (const m of modals) {
      if (m.style.display === "flex") return true;
    }
    return false;
  }

  navigateSnippetList(direction) {
    const items = document.querySelectorAll("#snippetsList .snippet-item");
    if (items.length === 0) return;

    let currentIndex = -1;
    items.forEach((item, i) => {
      if (item.classList.contains("active")) currentIndex = i;
    });

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= items.length) newIndex = items.length - 1;

    items[newIndex].click();
    items[newIndex].scrollIntoView({ block: "nearest" });
  }

  async duplicateSnippet() {
    if (!this.currentSnippet) return;

    const now = new Date().toISOString();
    const dupe = {
      id: Date.now(),
      name: this.currentSnippet.name + " (copy)",
      type: this.currentSnippet.type,
      extension: this.currentSnippet.extension,
      description: this.currentSnippet.description || "",
      content: this.currentSnippet.content,
      tags: [...(this.currentSnippet.tags || [])],
      notes: this.currentSnippet.notes || "",
      favorite: false,
      copyCount: 0,
      lastCopiedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.snippets.push(dupe);
    await StorageManager.put("snippets", dupe);
    this._syncSnippet(dupe);

    this.renderCategories();
    this.renderSnippetsList();
    this.viewSnippet(dupe.id);
    this.showNotification("Snippet duplicated");
  }

  getCategoryIcon(categoryName) {
    return (
      this.categoryIconMap[categoryName.toLowerCase()] || "fa-solid fa-folder"
    );
  }

  // ─── Tags (chip input) ─────────────────────────────────────

  addTagChip(value) {
    const tag = value.trim().toLowerCase().replace(/,/g, "");
    if (!tag) return;

    // Check for duplicates
    const existing = this.getTagChips();
    if (existing.includes(tag)) return;

    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.innerHTML = `${this.escapeHtml(tag)}<span class="tag-chip-remove">&times;</span>`;
    chip.querySelector(".tag-chip-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      chip.remove();
    });
    document.getElementById("tagChips").appendChild(chip);
  }

  clearTagChips() {
    document.getElementById("tagChips").innerHTML = "";
  }

  setTagChips(tags) {
    this.clearTagChips();
    (tags || []).forEach((t) => this.addTagChip(t));
  }

  getTagChips() {
    const chips = document.querySelectorAll("#tagChips .tag-chip");
    return Array.from(chips).map((c) => {
      // Get text content without the × remove button
      return c.firstChild.textContent.trim();
    });
  }

  // ─── Favorites ─────────────────────────────────────────────

  async toggleFavorite() {
    if (!this.currentSnippet) return;

    this.currentSnippet.favorite = !(this.currentSnippet.favorite || false);
    await StorageManager.put("snippets", this.currentSnippet);
    this._syncSnippet(this.currentSnippet);

    this.updateFavoriteButton();
    this.renderSnippetsList();
  }

  updateFavoriteButton() {
    const btn = document.getElementById("favoriteBtn");
    if (!this.currentSnippet) return;

    const isFav = this.currentSnippet.favorite || false;
    btn.classList.toggle("is-favorite", isFav);
    btn.innerHTML = isFav
      ? '<i class="fa-solid fa-star"></i>'
      : '<i class="fa-regular fa-star"></i>';
  }

  // ─── Line Numbers ──────────────────────────────────────────

  addLineNumbers(codeElement) {
    const html = codeElement.innerHTML;
    const lines = html.split("\n");
    // Don't add if only 1 line
    if (lines.length <= 1) return;

    // Remove trailing empty line (common from trailing newline)
    if (lines[lines.length - 1] === "") lines.pop();

    codeElement.innerHTML = lines
      .map(
        (line, i) =>
          `<span class="code-line"><span class="line-number">${i + 1}</span>${line}</span>`,
      )
      .join("");
  }

  // Categories
  renderCategories() {
    const list = document.getElementById("categoryList");
    list.innerHTML = "";

    // Add "All" category
    const allItem = document.createElement("li");
    allItem.className = `category-item${this.activeCategory === null ? " active" : ""}`;
    allItem.innerHTML = `
            <span class="category-name"><i class="fa-solid fa-layer-group"></i> All</span>
            <span class="category-count">${this.snippets.length}</span>
        `;
    allItem.addEventListener("click", () => this.selectCategory(null));
    list.appendChild(allItem);

    // Add user categories
    this.types.forEach((type) => {
      const count = this.snippets.filter((s) => s.type === type.name).length;
      const item = document.createElement("li");
      item.className = `category-item${this.activeCategory === type.name ? " active" : ""}`;
      item.innerHTML = `
                <span class="category-name"><i class="${this.getCategoryIcon(type.name)}"></i> ${type.name}</span>
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
      item.addEventListener("click", () => this.selectCategory(type.name));
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
    const select = document.getElementById("snippetTypeSelect");
    select.innerHTML = this.types
      .map((t) => `<option value="${t.name}">${t.name}</option>`)
      .join("");
  }

  openCategoryModal(editId = null) {
    this.editingCategory = editId;
    const modal = document.getElementById("categoryModal");
    const title = document.getElementById("categoryModalTitle");
    const input = document.getElementById("categoryNameInput");

    if (editId) {
      const category = this.types.find((t) => t.id === editId);
      title.textContent = "Edit Category";
      input.value = category ? category.name : "";
    } else {
      title.textContent = "Add Category";
      input.value = "";
    }

    modal.style.display = "flex";
    input.focus();
  }

  openEditCategoryModal(id) {
    this.openCategoryModal(id);
  }

  closeCategoryModal() {
    document.getElementById("categoryModal").style.display = "none";
    this.editingCategory = null;
  }

  async saveCategory() {
    const input = document.getElementById("categoryNameInput");
    const name = input.value.trim();

    if (!name) {
      alert("Please enter a category name");
      return;
    }

    try {
      if (this.editingCategory) {
        // Edit existing
        const category = this.types.find((t) => t.id === this.editingCategory);
        if (category) {
          const oldName = category.name;
          category.name = name;
          await StorageManager.put("snippetTypes", category);
          this._syncSnippetType(category);

          // Update snippets with old category name
          for (const snippet of this.snippets) {
            if (snippet.type === oldName) {
              snippet.type = name;
              await StorageManager.put("snippets", snippet);
              this._syncSnippet(snippet);
            }
          }
        }
      } else {
        // Add new
        const newCategory = { id: Date.now(), name };
        this.types.push(newCategory);
        await StorageManager.put("snippetTypes", newCategory);
        this._syncSnippetType(newCategory);
      }

      this.closeCategoryModal();
      this.renderCategories();
      this.renderSnippetsList();
    } catch (error) {
      console.error("Failed to save category:", error);
      alert("Failed to save category. Please try again.");
    }
  }

  // Snippets List
  renderSnippetsList() {
    const list = document.getElementById("snippetsList");
    list.innerHTML = "";

    let filtered = this.snippets;

    // Filter by category
    if (this.activeCategory) {
      filtered = filtered.filter((s) => s.type === this.activeCategory);
    }

    // Filter by search (matches name, description, content, tags, notes)
    if (this.searchQuery) {
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(this.searchQuery) ||
          (s.description &&
            s.description.toLowerCase().includes(this.searchQuery)) ||
          s.content.toLowerCase().includes(this.searchQuery) ||
          (s.tags || []).some((t) =>
            t.toLowerCase().includes(this.searchQuery),
          ) ||
          (s.notes && s.notes.toLowerCase().includes(this.searchQuery)),
      );
    }

    // Sort: favorites first, then by selected sort option
    filtered.sort((a, b) => {
      // Favorites always first
      const aFav = a.favorite || false;
      const bFav = b.favorite || false;
      if (aFav !== bFav) return bFav - aFav;

      switch (this.sortPreference) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "created-desc":
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case "modified-desc":
          return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        case "most-used":
          return (b.copyCount || 0) - (a.copyCount || 0);
        case "recent-copy":
          return new Date(b.lastCopiedAt || 0) - new Date(a.lastCopiedAt || 0);
        case "name-asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });

    if (filtered.length === 0) {
      list.innerHTML = '<li class="empty-list">No snippets found</li>';
      return;
    }

    filtered.forEach((snippet) => {
      const item = document.createElement("li");
      item.className = `snippet-item${this.currentSnippet && this.currentSnippet.id === snippet.id ? " active" : ""}`;

      const isFav = snippet.favorite || false;
      const tags = snippet.tags || [];

      let headerHtml;
      if (isFav) {
        headerHtml = `
                    <div class="snippet-item-header">
                        <span class="snippet-item-star"><i class="fa-solid fa-star"></i></span>
                        <div class="snippet-item-name">${this.escapeHtml(snippet.name)}</div>
                    </div>`;
      } else {
        headerHtml = `<div class="snippet-item-name">${this.escapeHtml(snippet.name)}</div>`;
      }

      let tagsHtml = "";
      if (tags.length > 0) {
        const displayTags = tags.slice(0, 3);
        tagsHtml = `<div class="snippet-item-tags">${displayTags
          .map(
            (t) =>
              `<span class="snippet-item-tag">${this.escapeHtml(t)}</span>`,
          )
          .join(
            "",
          )}${tags.length > 3 ? `<span class="snippet-item-tag">+${tags.length - 3}</span>` : ""}</div>`;
      }

      item.innerHTML = `
                ${headerHtml}
                <div class="snippet-item-meta">
                    <span class="snippet-item-type">${this.escapeHtml(snippet.type)}</span>
                    <span class="snippet-item-ext">.${snippet.extension}</span>
                    ${tagsHtml}
                </div>
            `;
      if (snippet.description) {
        item.title = snippet.description;
      }
      item.addEventListener("click", () => this.viewSnippet(snippet.id));
      list.appendChild(item);
    });

    this.updateSnippetsCount();
  }

  updateSnippetsCount() {
    let count = this.snippets.length;
    if (this.activeCategory) {
      count = this.snippets.filter(
        (s) => s.type === this.activeCategory,
      ).length;
    }
    document.getElementById("snippetsCount").textContent = `(${count})`;
  }

  // Snippet View
  viewSnippet(id) {
    const snippet = this.snippets.find((s) => s.id === id);
    if (!snippet) return;

    this.currentSnippet = snippet;

    document.getElementById("emptyState").style.display = "none";
    document.getElementById("snippetView").style.display = "flex";

    document.getElementById("snippetTitle").textContent = snippet.name;
    document.getElementById("snippetTypeBadge").textContent = snippet.type;
    const descEl = document.getElementById("snippetDescription");
    if (snippet.description) {
      descEl.innerHTML = `<strong>Description:</strong> ${this.escapeHtml(snippet.description)}`;
    } else {
      descEl.textContent = "";
    }

    // Tags
    const tagsEl = document.getElementById("snippetTags");
    const tags = snippet.tags || [];
    if (tags.length > 0) {
      tagsEl.innerHTML = tags
        .map(
          (t) =>
            `<span class="snippet-tag-badge" data-tag="${this.escapeHtml(t)}">${this.escapeHtml(t)}</span>`,
        )
        .join("");
      // Click tag to filter
      tagsEl.querySelectorAll(".snippet-tag-badge").forEach((badge) => {
        badge.addEventListener("click", () => {
          const tag = badge.getAttribute("data-tag");
          document.getElementById("searchInput").value = tag;
          this.searchQuery = tag.toLowerCase();
          this.renderSnippetsList();
        });
      });
    } else {
      tagsEl.innerHTML = "";
    }

    // Notes
    const notesEl = document.getElementById("snippetNotes");
    if (snippet.notes) {
      notesEl.innerHTML = `<strong>Notes:</strong> ${this.escapeHtml(snippet.notes)}`;
    } else {
      notesEl.textContent = "";
    }

    // Code with syntax highlighting + line numbers
    const codeElement = document.getElementById("snippetCode");
    codeElement.textContent = snippet.content;
    codeElement.className = "";
    codeElement.removeAttribute("data-highlighted");

    const language = this.extensionToLanguage[snippet.extension] || "plaintext";
    codeElement.classList.add(`language-${language}`);
    hljs.highlightElement(codeElement);
    this.addLineNumbers(codeElement);

    // Favorite button
    this.updateFavoriteButton();

    // Meta
    document.getElementById("snippetCreated").textContent =
      `Created: ${this.formatDate(snippet.createdAt)}`;
    document.getElementById("snippetUpdated").textContent =
      `Updated: ${this.formatDate(snippet.updatedAt)}`;

    const copyCount = snippet.copyCount || 0;
    const copyCountEl = document.getElementById("snippetCopyCount");
    if (copyCount > 0) {
      const lastCopied = snippet.lastCopiedAt
        ? ` | Last: ${this.formatDate(snippet.lastCopiedAt)}`
        : "";
      copyCountEl.textContent = `Copied: ${copyCount} time${copyCount !== 1 ? "s" : ""}${lastCopied}`;
    } else {
      copyCountEl.textContent = "";
    }

    this.renderSnippetsList();
  }

  // Snippet Modal (Create/Edit)
  openNewSnippetModal() {
    this.editingSnippet = null;
    document.getElementById("saveSnippetBtn").textContent = "Save Snippet";
    document.getElementById("snippetNameInput").value = "";
    document.getElementById("snippetDescInput").value = "";
    document.getElementById("snippetContentInput").value = "";
    document.getElementById("snippetNotesInput").value = "";
    document.getElementById("snippetTypeSelect").value =
      this.activeCategory || this.types[0]?.name || "";
    document.getElementById("snippetExtSelect").value = "js";
    this.clearTagChips();
    document.getElementById("snippetModal").style.display = "flex";
    document.getElementById("snippetNameInput").focus();
  }

  openEditSnippetModal() {
    if (!this.currentSnippet) return;

    this.editingSnippet = this.currentSnippet.id;
    document.getElementById("saveSnippetBtn").textContent = "Save Changes";
    document.getElementById("snippetNameInput").value =
      this.currentSnippet.name;
    document.getElementById("snippetDescInput").value =
      this.currentSnippet.description || "";
    document.getElementById("snippetContentInput").value =
      this.currentSnippet.content;
    document.getElementById("snippetNotesInput").value =
      this.currentSnippet.notes || "";
    document.getElementById("snippetTypeSelect").value =
      this.currentSnippet.type;
    document.getElementById("snippetExtSelect").value =
      this.currentSnippet.extension;
    this.setTagChips(this.currentSnippet.tags || []);
    document.getElementById("snippetModal").style.display = "flex";
    document.getElementById("snippetNameInput").focus();
  }

  closeModal() {
    document.getElementById("snippetModal").style.display = "none";
    this.editingSnippet = null;
  }

  async saveSnippet() {
    const name = document.getElementById("snippetNameInput").value.trim();
    const type = document.getElementById("snippetTypeSelect").value;
    const extension = document.getElementById("snippetExtSelect").value;
    const description = document
      .getElementById("snippetDescInput")
      .value.trim();
    const content = document.getElementById("snippetContentInput").value;
    const notes = document.getElementById("snippetNotesInput").value.trim();
    const tags = this.getTagChips();

    if (!name) {
      alert("Please enter a snippet name");
      return;
    }

    if (!content) {
      alert("Please enter snippet content");
      return;
    }

    const now = new Date().toISOString();

    try {
      if (this.editingSnippet) {
        // Update existing — save version snapshot of old state first
        const snippet = this.snippets.find((s) => s.id === this.editingSnippet);
        if (snippet) {
          await this.saveVersionSnapshot(snippet);

          snippet.name = name;
          snippet.type = type;
          snippet.extension = extension;
          snippet.description = description;
          snippet.content = content;
          snippet.notes = notes;
          snippet.tags = tags;
          snippet.updatedAt = now;
          await StorageManager.put("snippets", snippet);
          this.currentSnippet = snippet;
          this._syncSnippet(snippet);
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
          notes,
          tags,
          favorite: false,
          copyCount: 0,
          lastCopiedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        this.snippets.push(newSnippet);
        await StorageManager.put("snippets", newSnippet);
        this.currentSnippet = newSnippet;
        this._syncSnippet(newSnippet);
      }

      this.closeModal();
      this.renderCategories();
      this.renderSnippetsList();

      if (this.currentSnippet) {
        this.viewSnippet(this.currentSnippet.id);
      }
    } catch (error) {
      console.error("Failed to save snippet:", error);
      alert("Failed to save snippet. Please try again.");
    }
  }

  // Delete
  openDeleteModal(type, target) {
    this.deleteType = type;
    this.deleteTarget = target;

    const message = document.getElementById("deleteMessage");
    if (type === "snippet") {
      message.textContent =
        "Are you sure you want to delete this snippet? This action cannot be undone.";
    } else if (type === "category") {
      const category = this.types.find((t) => t.id === target);
      const snippetCount = this.snippets.filter(
        (s) => s.type === category?.name,
      ).length;
      message.textContent = `Are you sure you want to delete the "${category?.name}" category? ${snippetCount} snippet(s) will be moved to "Other".`;
    }

    document.getElementById("deleteModal").style.display = "flex";
  }

  closeDeleteModal() {
    document.getElementById("deleteModal").style.display = "none";
    this.deleteType = null;
    this.deleteTarget = null;
  }

  async confirmDelete() {
    try {
      if (this.deleteType === "snippet" && this.deleteTarget) {
        const deletedId = this.deleteTarget.id;
        await StorageManager.delete("snippets", deletedId);
        this.snippets = this.snippets.filter((s) => s.id !== deletedId);
        this._deleteSnippetFromCloud(deletedId);

        // Delete associated versions
        await this.deleteVersionsForSnippet(deletedId);

        if (this.currentSnippet && this.currentSnippet.id === deletedId) {
          this.currentSnippet = null;
          document.getElementById("snippetView").style.display = "none";
          document.getElementById("emptyState").style.display = "flex";
        }
      } else if (this.deleteType === "category" && this.deleteTarget) {
        const category = this.types.find((t) => t.id === this.deleteTarget);
        if (category) {
          // Move snippets to "Other"
          for (const snippet of this.snippets) {
            if (snippet.type === category.name) {
              snippet.type = "Other";
              await StorageManager.put("snippets", snippet);
              this._syncSnippet(snippet);
            }
          }

          // Remove category
          const deletedTypeId = this.deleteTarget;
          await StorageManager.delete("snippetTypes", deletedTypeId);
          this.types = this.types.filter((t) => t.id !== deletedTypeId);
          this._deleteSnippetTypeFromCloud(deletedTypeId);

          if (this.activeCategory === category.name) {
            this.activeCategory = null;
          }
        }
      }

      this.closeDeleteModal();
      this.renderCategories();
      this.renderSnippetsList();
      this.updateSnippetsCount();
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete. Please try again.");
    }
  }

  // Copy to Clipboard (with usage tracking)
  copyToClipboard() {
    if (!this.currentSnippet) return;

    navigator.clipboard
      .writeText(this.currentSnippet.content)
      .then(() => {
        this.showNotification();
        this.trackCopy();
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
        const textarea = document.createElement("textarea");
        textarea.value = this.currentSnippet.content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        this.showNotification();
        this.trackCopy();
      });
  }

  async trackCopy() {
    if (!this.currentSnippet) return;

    // Update copyCount and lastCopiedAt WITHOUT touching updatedAt
    this.currentSnippet.copyCount = (this.currentSnippet.copyCount || 0) + 1;
    this.currentSnippet.lastCopiedAt = new Date().toISOString();
    await StorageManager.put("snippets", this.currentSnippet);
    this._syncSnippet(this.currentSnippet);

    // Update the displayed copy count
    const copyCount = this.currentSnippet.copyCount;
    const copyCountEl = document.getElementById("snippetCopyCount");
    const lastCopied = this.currentSnippet.lastCopiedAt
      ? ` | Last: ${this.formatDate(this.currentSnippet.lastCopiedAt)}`
      : "";
    copyCountEl.textContent = `Copied: ${copyCount} time${copyCount !== 1 ? "s" : ""}${lastCopied}`;
  }

  showNotification(message) {
    const notification = document.getElementById("copyNotification");
    if (message) {
      notification.innerHTML = `<i class="fa-solid fa-check"></i> ${message}`;
    } else {
      notification.innerHTML =
        '<i class="fa-solid fa-check"></i> Copied to clipboard';
    }
    notification.classList.add("show");
    setTimeout(() => {
      notification.classList.remove("show");
    }, 2000);
  }

  // ─── Version History ───────────────────────────────────────

  async saveVersionSnapshot(snippet) {
    const version = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      snippetId: snippet.id,
      name: snippet.name,
      content: snippet.content,
      description: snippet.description || "",
      tags: [...(snippet.tags || [])],
      notes: snippet.notes || "",
      savedAt: new Date().toISOString(),
    };

    await StorageManager.put("snippetVersions", version);
    this._syncSnippetVersion(version);
    await this.pruneVersions(snippet.id, 30);
  }

  async pruneVersions(snippetId, maxVersions) {
    const versions = await StorageManager.getAllByIndex(
      "snippetVersions",
      "snippetId",
      snippetId,
    );
    if (versions.length <= maxVersions) return;

    // Sort by savedAt ascending (oldest first)
    versions.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
    const toDelete = versions.slice(0, versions.length - maxVersions);

    for (const v of toDelete) {
      await StorageManager.delete("snippetVersions", v.id);
      this._deleteSnippetVersionFromCloud(v.id);
    }
  }

  async deleteVersionsForSnippet(snippetId) {
    const versions = await StorageManager.getAllByIndex(
      "snippetVersions",
      "snippetId",
      snippetId,
    );
    for (const v of versions) {
      await StorageManager.delete("snippetVersions", v.id);
      this._deleteSnippetVersionFromCloud(v.id);
    }
    // Also delete from cloud in batch
    if (typeof FirebaseSync !== "undefined" && FirebaseSync.isSignedIn()) {
      FirebaseSync.deleteSnippetVersionsBySnippetId(snippetId);
    }
  }

  async openHistoryModal() {
    if (!this.currentSnippet) return;

    this.selectedVersion = null;
    document.getElementById("historyPreviewEmpty").style.display = "flex";
    document.getElementById("historyPreview").style.display = "none";

    const versions = await StorageManager.getAllByIndex(
      "snippetVersions",
      "snippetId",
      this.currentSnippet.id,
    );
    this.renderHistoryList(versions);
    document.getElementById("historyModal").style.display = "flex";
  }

  closeHistoryModal() {
    document.getElementById("historyModal").style.display = "none";
    this.selectedVersion = null;
  }

  renderHistoryList(versions) {
    const list = document.getElementById("historyList");

    if (!versions || versions.length === 0) {
      list.innerHTML =
        '<li class="history-empty-message">No version history yet. Versions are saved automatically when you edit a snippet.</li>';
      return;
    }

    // Sort newest first
    versions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    list.innerHTML = versions
      .map(
        (v) => `
            <li class="history-item" data-version-id="${v.id}">
                <div class="history-item-name">${this.escapeHtml(v.name)}</div>
                <div class="history-item-date">${this.formatDate(v.savedAt)}</div>
            </li>
        `,
      )
      .join("");

    list.querySelectorAll(".history-item").forEach((item) => {
      item.addEventListener("click", () => {
        const versionId = parseInt(item.getAttribute("data-version-id"));
        const version = versions.find((v) => v.id === versionId);
        if (version) this.previewVersion(version);

        // Toggle active class
        list
          .querySelectorAll(".history-item")
          .forEach((i) => i.classList.remove("active"));
        item.classList.add("active");
      });
    });
  }

  previewVersion(version) {
    this.selectedVersion = version;
    document.getElementById("historyPreviewEmpty").style.display = "none";
    document.getElementById("historyPreview").style.display = "";

    document.getElementById("historyPreviewName").textContent = version.name;
    document.getElementById("historyPreviewDate").textContent = this.formatDate(
      version.savedAt,
    );

    const codeEl = document.getElementById("historyPreviewCode");
    codeEl.textContent = version.content;
    codeEl.className = "";
    codeEl.removeAttribute("data-highlighted");

    // Try to determine language from current snippet
    if (this.currentSnippet) {
      const language =
        this.extensionToLanguage[this.currentSnippet.extension] || "plaintext";
      codeEl.classList.add(`language-${language}`);
    }
    hljs.highlightElement(codeEl);
  }

  async restoreVersion() {
    if (!this.selectedVersion || !this.currentSnippet) return;

    // Save current state as a version first
    await this.saveVersionSnapshot(this.currentSnippet);

    // Restore the selected version's data
    const now = new Date().toISOString();
    this.currentSnippet.name = this.selectedVersion.name;
    this.currentSnippet.content = this.selectedVersion.content;
    this.currentSnippet.description = this.selectedVersion.description || "";
    this.currentSnippet.tags = [...(this.selectedVersion.tags || [])];
    this.currentSnippet.notes = this.selectedVersion.notes || "";
    this.currentSnippet.updatedAt = now;

    await StorageManager.put("snippets", this.currentSnippet);
    this._syncSnippet(this.currentSnippet);

    this.closeHistoryModal();
    this.renderCategories();
    this.renderSnippetsList();
    this.viewSnippet(this.currentSnippet.id);
    this.showNotification("Version restored");
  }

  // ─── Templates ─────────────────────────────────────────────

  openTemplatesModal() {
    this.activeTemplateTab = Object.keys(this.templates)[0];
    this.renderTemplatesTabs();
    this.renderTemplatesGrid();
    document.getElementById("templatesModal").style.display = "flex";
  }

  closeTemplatesModal() {
    document.getElementById("templatesModal").style.display = "none";
  }

  renderTemplatesTabs() {
    const tabs = document.getElementById("templatesTabs");
    tabs.innerHTML = Object.keys(this.templates)
      .map(
        (lang) =>
          `<button class="templates-tab${lang === this.activeTemplateTab ? " active" : ""}" data-lang="${this.escapeHtml(lang)}">${this.escapeHtml(lang)}</button>`,
      )
      .join("");

    tabs.querySelectorAll(".templates-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.activeTemplateTab = tab.dataset.lang;
        this.renderTemplatesTabs();
        this.renderTemplatesGrid();
      });
    });
  }

  renderTemplatesGrid() {
    const grid = document.getElementById("templatesGrid");
    const templates = this.templates[this.activeTemplateTab] || [];

    grid.innerHTML = templates
      .map(
        (t, i) => `
        <div class="template-card" data-index="${i}">
          <div class="template-card-header">
            <span class="template-card-name">${this.escapeHtml(t.name)}</span>
            <span class="template-card-ext">.${t.extension}</span>
          </div>
          <p class="template-card-desc">${this.escapeHtml(t.description)}</p>
          <pre class="template-card-preview"><code>${this.escapeHtml(t.content.slice(0, 120))}${t.content.length > 120 ? "..." : ""}</code></pre>
        </div>`,
      )
      .join("");

    grid.querySelectorAll(".template-card").forEach((card) => {
      card.addEventListener("click", () => {
        const index = parseInt(card.dataset.index);
        this.useTemplate(templates[index]);
      });
    });
  }

  useTemplate(template) {
    this.closeTemplatesModal();
    this.editingSnippet = null;
    document.getElementById("saveSnippetBtn").textContent = "Save Snippet";
    document.getElementById("snippetNameInput").value = template.name;
    document.getElementById("snippetDescInput").value =
      template.description || "";
    document.getElementById("snippetContentInput").value = template.content;
    document.getElementById("snippetNotesInput").value = "";

    // Set category if it exists in user's types
    const matchingType = this.types.find(
      (t) => t.name.toLowerCase() === template.category.toLowerCase(),
    );
    document.getElementById("snippetTypeSelect").value = matchingType
      ? matchingType.name
      : this.types[0]?.name || "";

    document.getElementById("snippetExtSelect").value = template.extension;
    this.clearTagChips();
    document.getElementById("snippetModal").style.display = "flex";
    document.getElementById("snippetNameInput").focus();
    document.getElementById("snippetNameInput").select();
  }

  // Export/Import
  async exportData() {
    // Include versions in export
    let versions = [];
    try {
      versions = await StorageManager.getAll("snippetVersions");
    } catch (e) {
      // Store may not exist yet
    }

    const data = {
      snippets: this.snippets,
      types: this.types,
      versions,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snippets-backup-${new Date().toISOString().split("T")[0]}.json`;
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
          const existingIds = new Set(this.snippets.map((s) => s.id));
          const newSnippets = data.snippets.filter(
            (s) => !existingIds.has(s.id),
          );

          for (const snippet of newSnippets) {
            await StorageManager.put("snippets", snippet);
            this.snippets.push(snippet);
            this._syncSnippet(snippet);
          }
        }

        if (data.types && Array.isArray(data.types)) {
          // Merge types (avoid duplicates by name)
          const existingNames = new Set(this.types.map((t) => t.name));
          const newTypes = data.types.filter((t) => !existingNames.has(t.name));

          for (const type of newTypes) {
            await StorageManager.put("snippetTypes", type);
            this.types.push(type);
            this._syncSnippetType(type);
          }
        }

        // Import versions if present
        if (data.versions && Array.isArray(data.versions)) {
          for (const version of data.versions) {
            try {
              await StorageManager.put("snippetVersions", version);
              this._syncSnippetVersion(version);
            } catch (err) {
              // Ignore individual version import errors
            }
          }
        }

        this.renderCategories();
        this.renderSnippetsList();
        alert(
          `Import successful! Added ${data.snippets?.length || 0} snippets.`,
        );
      } catch (err) {
        console.error("Import error:", err);
        alert("Failed to import data. Please check the file format.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  // ─── Firebase Sync Helpers ─────────────────────────────────

  /** Push snippet to cloud (non-blocking) */
  _syncSnippet(snippet) {
    if (typeof FirebaseSync !== "undefined" && FirebaseSync.isSignedIn()) {
      FirebaseSync.pushSnippet(snippet);
    }
  }

  /** Push snippet type to cloud (non-blocking) */
  _syncSnippetType(snippetType) {
    if (typeof FirebaseSync !== "undefined" && FirebaseSync.isSignedIn()) {
      FirebaseSync.pushSnippetType(snippetType);
    }
  }

  /** Push snippet version to cloud (non-blocking) */
  _syncSnippetVersion(version) {
    if (typeof FirebaseSync !== "undefined" && FirebaseSync.isSignedIn()) {
      FirebaseSync.pushSnippetVersion(version);
    }
  }

  /** Delete snippet from cloud (non-blocking) */
  _deleteSnippetFromCloud(snippetId) {
    if (typeof FirebaseSync !== "undefined" && FirebaseSync.isSignedIn()) {
      FirebaseSync.deleteSnippet(snippetId);
    }
  }

  /** Delete snippet type from cloud (non-blocking) */
  _deleteSnippetTypeFromCloud(typeId) {
    if (typeof FirebaseSync !== "undefined" && FirebaseSync.isSignedIn()) {
      FirebaseSync.deleteSnippetType(typeId);
    }
  }

  /** Delete snippet version from cloud (non-blocking) */
  _deleteSnippetVersionFromCloud(versionId) {
    if (typeof FirebaseSync !== "undefined" && FirebaseSync.isSignedIn()) {
      FirebaseSync.deleteSnippetVersion(versionId);
    }
  }

  // ─── Auth Handlers ─────────────────────────────────────────

  async handleSignIn() {
    try {
      await FirebaseSync.signInWithGoogle();
    } catch (error) {
      console.error("Sign-in failed:", error);
    }
  }

  async handleSignOut() {
    try {
      await FirebaseSync.signOut();
    } catch (error) {
      console.error("Sign-out failed:", error);
    }
  }

  handleAuthChange(user) {
    this.updateAuthUI(user);
    if (user && FirebaseSync.needsMerge()) {
      this.openMergeModal();
    }
  }

  updateAuthUI(user) {
    const signInBtn = document.getElementById("signInBtn");
    const userInfo = document.getElementById("userInfo");
    const authDivider = document.getElementById("authDivider");

    if (!signInBtn || !userInfo) return;

    if (user) {
      signInBtn.style.display = "none";
      userInfo.style.display = "flex";
      if (authDivider) authDivider.style.display = "";

      const avatar = document.getElementById("userAvatar");
      const name = document.getElementById("userName");
      if (avatar) avatar.src = user.photoURL || "";
      if (name) name.textContent = user.displayName || user.email || "";
    } else {
      signInBtn.style.display = "";
      userInfo.style.display = "none";
      if (authDivider) authDivider.style.display = "";
    }
  }

  updateSyncStatusUI(status) {
    const syncStatus = document.getElementById("syncStatus");
    const syncDot = document.getElementById("syncDot");
    const syncLabel = document.getElementById("syncLabel");

    if (!syncStatus || !syncDot || !syncLabel) return;

    if (!status) {
      syncStatus.style.display = "none";
      return;
    }

    syncStatus.style.display = "flex";
    syncDot.className = "sync-status-dot " + status;

    const labels = {
      syncing: "Syncing...",
      synced: "Synced",
      error: "Sync error",
      offline: "Offline",
    };
    syncLabel.textContent = labels[status] || status;
  }

  // ─── Remote Change Handlers ────────────────────────────────

  async handleRemoteSnippets(remoteSnippets) {
    // Build a map of remote snippets by ID
    const remoteMap = new Map();
    for (const s of remoteSnippets) {
      const { _syncedAt, _firestoreId, ...clean } = s;
      remoteMap.set(clean.id, clean);
    }

    // Update local data: add new, update changed
    let changed = false;
    for (const [id, remote] of remoteMap) {
      const localIdx = this.snippets.findIndex((s) => s.id === id);
      if (localIdx === -1) {
        // New snippet from another device
        this.snippets.push(remote);
        await StorageManager.put("snippets", remote);
        changed = true;
      } else {
        const local = this.snippets[localIdx];
        const remoteTime = new Date(remote.updatedAt || 0).getTime();
        const localTime = new Date(local.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          this.snippets[localIdx] = remote;
          await StorageManager.put("snippets", remote);
          changed = true;
        }
      }
    }

    // Remove local snippets not in remote (deleted on other device)
    const remoteIds = new Set(remoteMap.keys());
    const toRemove = this.snippets.filter((s) => !remoteIds.has(s.id));
    for (const s of toRemove) {
      await StorageManager.delete("snippets", s.id);
      changed = true;
    }
    if (toRemove.length > 0) {
      this.snippets = this.snippets.filter((s) => remoteIds.has(s.id));
    }

    if (changed) {
      this.renderCategories();
      this.renderSnippetsList();
      if (this.currentSnippet) {
        const updated = this.snippets.find(
          (s) => s.id === this.currentSnippet.id,
        );
        if (updated) {
          this.viewSnippet(updated.id);
        } else {
          this.currentSnippet = null;
          document.getElementById("snippetView").style.display = "none";
          document.getElementById("emptyState").style.display = "flex";
        }
      }
    }
  }

  async handleRemoteTypes(remoteTypes) {
    const remoteMap = new Map();
    for (const t of remoteTypes) {
      const { _syncedAt, _firestoreId, ...clean } = t;
      remoteMap.set(clean.id, clean);
    }

    let changed = false;
    for (const [id, remote] of remoteMap) {
      const localIdx = this.types.findIndex((t) => t.id === id);
      if (localIdx === -1) {
        this.types.push(remote);
        await StorageManager.put("snippetTypes", remote);
        changed = true;
      } else if (this.types[localIdx].name !== remote.name) {
        this.types[localIdx] = remote;
        await StorageManager.put("snippetTypes", remote);
        changed = true;
      }
    }

    // Remove local types not in remote
    const remoteIds = new Set(remoteMap.keys());
    const toRemove = this.types.filter((t) => !remoteIds.has(t.id));
    for (const t of toRemove) {
      await StorageManager.delete("snippetTypes", t.id);
      changed = true;
    }
    if (toRemove.length > 0) {
      this.types = this.types.filter((t) => remoteIds.has(t.id));
    }

    if (changed) {
      this.renderCategories();
      this.renderSnippetsList();
    }
  }

  async handleRemoteVersions(remoteVersions) {
    // Simple union merge — add any remote versions we don't have locally
    for (const v of remoteVersions) {
      const { _syncedAt, _firestoreId, ...clean } = v;
      try {
        const existing = await StorageManager.get("snippetVersions", clean.id);
        if (!existing) {
          await StorageManager.put("snippetVersions", clean);
        }
      } catch (e) {
        // Ignore
      }
    }
  }

  // ─── Merge Modal ───────────────────────────────────────────

  openMergeModal() {
    const localCount = document.getElementById("mergeLocalCount");
    const cloudCount = document.getElementById("mergeCloudCount");
    if (localCount) localCount.textContent = this.snippets.length;
    if (cloudCount) cloudCount.textContent = "?";
    document.getElementById("mergeModal").style.display = "flex";
  }

  closeMergeModal() {
    const modal = document.getElementById("mergeModal");
    if (modal) modal.style.display = "none";
  }

  async handleMergeConfirm() {
    this.closeMergeModal();
    try {
      // Get local versions for merge
      let localVersions = [];
      try {
        localVersions = await StorageManager.getAll("snippetVersions");
      } catch (e) {
        // Store may not exist yet
      }

      const result = await FirebaseSync.mergeOnFirstLogin(
        this.snippets,
        this.types,
        localVersions,
      );

      // Update local state with merged data
      this.snippets = result.snippets;
      this.types = result.types;

      // Persist merged data to IndexedDB
      await StorageManager.clear("snippets");
      await StorageManager.clear("snippetTypes");
      if (this.snippets.length > 0) {
        await StorageManager.putAll("snippets", this.snippets);
      }
      if (this.types.length > 0) {
        await StorageManager.putAll("snippetTypes", this.types);
      }

      // Persist merged versions
      if (result.versions && result.versions.length > 0) {
        try {
          await StorageManager.clear("snippetVersions");
          await StorageManager.putAll("snippetVersions", result.versions);
        } catch (e) {
          // Versions store may not exist
        }
      }

      this.renderCategories();
      this.renderSnippetsList();

      // Reset view if current snippet was removed
      if (
        this.currentSnippet &&
        !this.snippets.find((s) => s.id === this.currentSnippet.id)
      ) {
        this.currentSnippet = null;
        document.getElementById("snippetView").style.display = "none";
        document.getElementById("emptyState").style.display = "flex";
      }
    } catch (error) {
      console.error("Merge failed:", error);
      alert("Failed to merge data. Your local data is unchanged.");
    }
  }

  handleMergeSkip() {
    this.closeMergeModal();
    if (typeof FirebaseSync !== "undefined") {
      FirebaseSync.markMergeComplete();
    }
  }

  // ─── Share Handlers ──────────────────────────────────────────

  async checkShareParam() {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("share");
    if (!shareId) return;

    // Clear the param from URL
    history.replaceState(null, "", window.location.pathname);

    try {
      const result = await FirebaseSync.fetchSharedSnippet(shareId);

      const contentEl = document.getElementById("sharedSnippetContent");
      const expiredEl = document.getElementById("sharedSnippetExpired");
      const notFoundEl = document.getElementById("sharedSnippetNotFound");
      const footerEl = document.getElementById("sharedSnippetFooter");

      contentEl.style.display = "none";
      expiredEl.style.display = "none";
      notFoundEl.style.display = "none";
      footerEl.style.display = "flex";

      if (!result) {
        notFoundEl.style.display = "";
        footerEl.style.display = "none";
      } else if (result.expired) {
        expiredEl.style.display = "";
        footerEl.style.display = "none";
      } else {
        contentEl.style.display = "";
        this._sharedSnippetData = result.snippet;

        document.getElementById("sharedSnippetTitle").textContent =
          result.snippet.name;
        document.getElementById("sharedSnippetBadge").textContent =
          `${result.snippet.type} (.${result.snippet.extension})`;
        document.getElementById("sharedSnippetDesc").textContent =
          result.snippet.description || "";
        document.getElementById("sharedSnippetExpiry").textContent =
          `Expires: ${this.formatDate(result.expiresAt)}`;

        const codeEl = document.getElementById("sharedSnippetCode");
        codeEl.textContent = result.snippet.content;
        codeEl.className = "";
        codeEl.removeAttribute("data-highlighted");
        const language =
          this.extensionToLanguage[result.snippet.extension] || "plaintext";
        codeEl.classList.add(`language-${language}`);
        hljs.highlightElement(codeEl);
      }

      document.getElementById("sharedSnippetModal").style.display = "flex";
    } catch (error) {
      console.error("Failed to load shared snippet:", error);
    }
  }

  openShareModal() {
    if (!this.currentSnippet) return;

    if (typeof FirebaseSync === "undefined" || !FirebaseSync.isSignedIn()) {
      this.showNotification("Sign in to share snippets");
      return;
    }

    document.getElementById("shareResult").style.display = "none";
    document.getElementById("generateShareBtn").disabled = false;
    document.getElementById("shareExpirySelect").value = "48";
    document.getElementById("shareModal").style.display = "flex";
  }

  closeShareModal() {
    document.getElementById("shareModal").style.display = "none";
  }

  async generateShareLink() {
    if (!this.currentSnippet) return;

    const btn = document.getElementById("generateShareBtn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

    try {
      const expiryHours = parseInt(
        document.getElementById("shareExpirySelect").value,
        10,
      );
      const shareId = await FirebaseSync.shareSnippet(
        this.currentSnippet,
        expiryHours,
      );
      const shareUrl = `${location.origin}${location.pathname}?share=${shareId}`;

      document.getElementById("shareLinkInput").value = shareUrl;
      const expiresAt = new Date(Date.now() + expiryHours * 3600000);
      document.getElementById("shareExpiryInfo").textContent =
        `Expires: ${this.formatDate(expiresAt.toISOString())}`;
      document.getElementById("shareResult").style.display = "";

      // Auto-copy
      try {
        await navigator.clipboard.writeText(shareUrl);
        this.showNotification("Link copied to clipboard");
      } catch {
        // clipboard may fail in some contexts, link is still visible
      }
    } catch (error) {
      console.error("Failed to generate share link:", error);
      this.showNotification("Failed to generate link");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-link"></i> Generate Link';
    }
  }

  copyShareLink() {
    const input = document.getElementById("shareLinkInput");
    navigator.clipboard
      .writeText(input.value)
      .then(() => {
        this.showNotification("Link copied to clipboard");
      })
      .catch(() => {
        input.select();
        document.execCommand("copy");
        this.showNotification("Link copied to clipboard");
      });
  }

  closeSharedSnippetModal() {
    document.getElementById("sharedSnippetModal").style.display = "none";
    this._sharedSnippetData = null;
  }

  copySharedCode() {
    if (!this._sharedSnippetData) return;
    navigator.clipboard
      .writeText(this._sharedSnippetData.content)
      .then(() => {
        this.showNotification("Code copied to clipboard");
      })
      .catch(() => {
        const textarea = document.createElement("textarea");
        textarea.value = this._sharedSnippetData.content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        this.showNotification("Code copied to clipboard");
      });
  }

  async importSharedSnippet() {
    if (!this._sharedSnippetData) return;

    const now = new Date().toISOString();
    const newSnippet = {
      id: Date.now(),
      name: this._sharedSnippetData.name,
      type: this._sharedSnippetData.type,
      extension: this._sharedSnippetData.extension,
      description: this._sharedSnippetData.description || "",
      content: this._sharedSnippetData.content,
      tags: [],
      notes: "",
      favorite: false,
      copyCount: 0,
      lastCopiedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    // Ensure the type exists locally
    if (!this.types.find((t) => t.name === newSnippet.type)) {
      const newType = { id: Date.now() + 1, name: newSnippet.type };
      this.types.push(newType);
      await StorageManager.put("snippetTypes", newType);
      this._syncSnippetType(newType);
    }

    this.snippets.push(newSnippet);
    await StorageManager.put("snippets", newSnippet);
    this._syncSnippet(newSnippet);

    this.renderCategories();
    this.renderSnippetsList();
    this.closeSharedSnippetModal();
    this.showNotification("Snippet imported");
    this.viewSnippet(newSnippet.id);
  }

  // Utilities
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app when DOM is ready
let snippetsApp;
document.addEventListener("DOMContentLoaded", async () => {
  snippetsApp = new SnippetsApp();
  await snippetsApp.init();
});
