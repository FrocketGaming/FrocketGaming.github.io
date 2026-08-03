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
    this._openedFromTemplate = false;
    this.editingCategory = null;
    this.deleteTarget = null;
    this.deleteType = null;
    this.activeCategory = null;
    this.activeExtFilter = null;
    this.searchQuery = "";
    this.sortPreference =
      localStorage.getItem("snippets-sort-preference") || "name-asc";
    this.selectedVersion = null;
    this.historyViewMode = "code";
    this._historyVersions = [];
    this._variableCallback = null;

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
      nu: "bash",
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
      mathematics: "fa-solid fa-calculator",
      math: "fa-solid fa-calculator",
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
      fish: "fa-solid fa-terminal",
      zsh: "fa-solid fa-terminal",
      ruby: "fa-solid fa-gem",
      c: "fa-solid fa-code",
      "c++": "fa-solid fa-code",
      typescript: "fa-solid fa-code",
      vim: "fa-solid fa-terminal",
      nvim: "fa-solid fa-terminal",
      neovim: "fa-solid fa-terminal",
      yaml: "fa-solid fa-file-code",
      yml: "fa-solid fa-file-code",
      latex: "fa-solid fa-square-root-variable",
    };

    this.defaultTypes = [
      { id: 1, name: "JavaScript" },
      { id: 2, name: "Python" },
      { id: 3, name: "SQL" },
      { id: 4, name: "HTML/CSS" },
      { id: 5, name: "Utilities" },
      { id: 6, name: "Shell" },
      { id: 7, name: "Nushell" },
      { id: 8, name: "Other" },
    ];

    this.activeTemplateTab = "JavaScript";

    this.templates = {
      JavaScript: [
        {
          name: "Fetch API Call",
          extension: "js",
          category: "JavaScript",
          description: "GET request with async/await and error handling",
          content:
            "async function fetchData(url) {\n  try {\n    const response = await fetch(url);\n    if (!response.ok) {\n      throw new Error(`HTTP error! status: ${response.status}`);\n    }\n    const data = await response.json();\n    return data;\n  } catch (error) {\n    console.error('Fetch failed:', error);\n    throw error;\n  }\n}",
        },
        {
          name: "POST Request",
          extension: "js",
          category: "JavaScript",
          description: "POST request with JSON body",
          content:
            "async function postData(url, body) {\n  const response = await fetch(url, {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify(body),\n  });\n  if (!response.ok) {\n    throw new Error(`HTTP error! status: ${response.status}`);\n  }\n  return response.json();\n}",
        },
        {
          name: "Event Listener",
          extension: "js",
          category: "JavaScript",
          description: "DOM event listener with delegation",
          content:
            "document.getElementById('container').addEventListener('click', (e) => {\n  const target = e.target.closest('[data-action]');\n  if (!target) return;\n\n  const action = target.dataset.action;\n  switch (action) {\n    case 'edit':\n      handleEdit(target);\n      break;\n    case 'delete':\n      handleDelete(target);\n      break;\n  }\n});",
        },
        {
          name: "Class Skeleton",
          extension: "js",
          category: "JavaScript",
          description: "ES6 class with constructor and methods",
          content:
            "class MyClass {\n  constructor(options = {}) {\n    this.name = options.name || 'default';\n    this.items = [];\n  }\n\n  add(item) {\n    this.items.push(item);\n    return this;\n  }\n\n  remove(id) {\n    this.items = this.items.filter(item => item.id !== id);\n    return this;\n  }\n\n  find(id) {\n    return this.items.find(item => item.id === id);\n  }\n\n  toJSON() {\n    return { name: this.name, items: this.items };\n  }\n}",
        },
        {
          name: "Debounce",
          extension: "js",
          category: "Utilities",
          description: "Debounce function to limit execution rate",
          content:
            "function debounce(fn, delay = 300) {\n  let timer;\n  return function (...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), delay);\n  };\n}\n\n// Usage:\n// const debouncedSearch = debounce((query) => search(query), 300);\n// input.addEventListener('input', (e) => debouncedSearch(e.target.value));",
        },
        {
          name: "Array Helpers",
          extension: "js",
          category: "Utilities",
          description: "Common array operations: group, unique, chunk",
          content:
            "// Group array of objects by a key\nconst groupBy = (arr, key) =>\n  arr.reduce((groups, item) => {\n    const val = item[key];\n    (groups[val] = groups[val] || []).push(item);\n    return groups;\n  }, {});\n\n// Get unique values\nconst unique = (arr) => [...new Set(arr)];\n\n// Chunk array into smaller arrays\nconst chunk = (arr, size) =>\n  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>\n    arr.slice(i * size, i * size + size)\n  );",
        },
        {
          name: "Local Storage Wrapper",
          extension: "js",
          category: "Utilities",
          description: "Safe localStorage get/set with JSON parsing",
          content:
            "const storage = {\n  get(key, defaultValue = null) {\n    try {\n      const item = localStorage.getItem(key);\n      return item ? JSON.parse(item) : defaultValue;\n    } catch {\n      return defaultValue;\n    }\n  },\n\n  set(key, value) {\n    try {\n      localStorage.setItem(key, JSON.stringify(value));\n      return true;\n    } catch {\n      return false;\n    }\n  },\n\n  remove(key) {\n    localStorage.removeItem(key);\n  },\n};",
        },
        {
          name: "Promise.all with Limit",
          extension: "js",
          category: "JavaScript",
          description: "Run promises concurrently with a concurrency limit",
          content:
            "async function promiseAllLimit(tasks, limit = 5) {\n  const results = [];\n  const executing = new Set();\n\n  for (const [index, task] of tasks.entries()) {\n    const promise = Promise.resolve().then(() => task());\n    results[index] = promise;\n    executing.add(promise);\n\n    const cleanup = () => executing.delete(promise);\n    promise.then(cleanup, cleanup);\n\n    if (executing.size >= limit) {\n      await Promise.race(executing);\n    }\n  }\n\n  return Promise.all(results);\n}",
        },
        {
          name: "Throttle",
          extension: "js",
          category: "Utilities",
          description:
            "Throttle function — limits execution to once per interval",
          content:
            "function throttle(fn, interval = 300) {\n  let lastCall = 0;\n  let timer = null;\n\n  return function (...args) {\n    const now = Date.now();\n    const remaining = interval - (now - lastCall);\n\n    if (remaining <= 0) {\n      if (timer) { clearTimeout(timer); timer = null; }\n      lastCall = now;\n      return fn.apply(this, args);\n    } else {\n      // Ensure trailing call fires at end of interval\n      clearTimeout(timer);\n      timer = setTimeout(() => {\n        lastCall = Date.now();\n        timer = null;\n        fn.apply(this, args);\n      }, remaining);\n    }\n  };\n}\n\n// Usage:\n// const throttledScroll = throttle(() => updateHeader(), 100);\n// window.addEventListener('scroll', throttledScroll);",
        },
        {
          name: "Memoize",
          extension: "js",
          category: "Utilities",
          description: "Cache function results by arguments",
          content:
            "function memoize(fn, { maxSize = 100, keyFn } = {}) {\n  const cache = new Map();\n\n  return function (...args) {\n    const key = keyFn ? keyFn(...args) : JSON.stringify(args);\n\n    if (cache.has(key)) return cache.get(key);\n\n    const result = fn.apply(this, args);\n    cache.set(key, result);\n\n    // Evict oldest entry when cache is full\n    if (cache.size > maxSize) {\n      cache.delete(cache.keys().next().value);\n    }\n\n    return result;\n  };\n}\n\n// Usage:\n// const expensiveCalc = memoize((n) => fibonacci(n));\n// const getUser = memoize(fetchUser, { keyFn: (id) => id, maxSize: 50 });",
        },
        {
          name: "EventEmitter",
          extension: "js",
          category: "JavaScript",
          description:
            "Lightweight pub/sub EventEmitter with on, off, emit, once",
          content:
            "class EventEmitter {\n  constructor() {\n    this._listeners = new Map();\n  }\n\n  on(event, listener) {\n    if (!this._listeners.has(event)) {\n      this._listeners.set(event, []);\n    }\n    this._listeners.get(event).push(listener);\n    // Returns an unsubscribe function\n    return () => this.off(event, listener);\n  }\n\n  once(event, listener) {\n    const unsub = this.on(event, (...args) => {\n      listener(...args);\n      unsub();\n    });\n    return unsub;\n  }\n\n  off(event, listener) {\n    const listeners = this._listeners.get(event);\n    if (!listeners) return;\n    this._listeners.set(event, listeners.filter((l) => l !== listener));\n  }\n\n  emit(event, ...args) {\n    (this._listeners.get(event) || []).slice().forEach((l) => l(...args));\n  }\n\n  removeAllListeners(event) {\n    if (event) this._listeners.delete(event);\n    else this._listeners.clear();\n  }\n}\n\n// Usage:\n// const bus = new EventEmitter();\n// const unsub = bus.on('data', (payload) => console.log(payload));\n// bus.emit('data', { id: 1 });\n// unsub(); // stop listening",
        },
      ],
      Python: [
        {
          name: "Class with Dataclass",
          extension: "py",
          category: "Python",
          description: "Python dataclass with default values and methods",
          content:
            'from dataclasses import dataclass, field\nfrom typing import List, Optional\n\n@dataclass\nclass User:\n    name: str\n    email: str\n    age: int = 0\n    tags: List[str] = field(default_factory=list)\n    bio: Optional[str] = None\n\n    def display_name(self) -> str:\n        return f"{self.name} <{self.email}>"\n\n    def to_dict(self) -> dict:\n        return {\n            "name": self.name,\n            "email": self.email,\n            "age": self.age,\n            "tags": self.tags,\n            "bio": self.bio,\n        }',
        },
        {
          name: "File Read/Write",
          extension: "py",
          category: "Python",
          description: "Read and write files with context managers",
          content:
            'from pathlib import Path\nimport json\n\ndef read_text(filepath: str) -> str:\n    return Path(filepath).read_text(encoding="utf-8")\n\ndef write_text(filepath: str, content: str) -> None:\n    Path(filepath).write_text(content, encoding="utf-8")\n\ndef read_json(filepath: str) -> dict:\n    with open(filepath, "r", encoding="utf-8") as f:\n        return json.load(f)\n\ndef write_json(filepath: str, data: dict, indent: int = 2) -> None:\n    with open(filepath, "w", encoding="utf-8") as f:\n        json.dump(data, f, indent=indent, ensure_ascii=False)',
        },
        {
          name: "HTTP Request",
          extension: "py",
          category: "Python",
          description: "GET/POST requests with error handling",
          content:
            'import requests\n\ndef get_json(url: str, params: dict = None, timeout: int = 30) -> dict:\n    response = requests.get(url, params=params, timeout=timeout)\n    response.raise_for_status()\n    return response.json()\n\ndef post_json(url: str, data: dict, timeout: int = 30) -> dict:\n    response = requests.post(url, json=data, timeout=timeout)\n    response.raise_for_status()\n    return response.json()\n\n# Usage:\n# data = get_json("https://api.example.com/items", params={"page": 1})\n# result = post_json("https://api.example.com/items", data={"name": "New"})',
        },
        {
          name: "CLI with argparse",
          extension: "py",
          category: "Python",
          description: "Command-line script template with argparse",
          content:
            'import argparse\nimport sys\n\ndef main():\n    parser = argparse.ArgumentParser(description="My CLI tool")\n    parser.add_argument("input", help="Input file path")\n    parser.add_argument("-o", "--output", default="output.txt", help="Output file")\n    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")\n    parser.add_argument("--limit", type=int, default=100, help="Max items")\n\n    args = parser.parse_args()\n\n    if args.verbose:\n        print(f"Processing {args.input} -> {args.output}")\n\n    # Your logic here\n    print(f"Done. Limit: {args.limit}")\n\nif __name__ == "__main__":\n    main()',
        },
        {
          name: "Decorator",
          extension: "py",
          category: "Python",
          description: "Function decorator with timing and logging",
          content:
            'import functools\nimport time\n\ndef timer(func):\n    """Log the execution time of a function."""\n    @functools.wraps(func)\n    def wrapper(*args, **kwargs):\n        start = time.perf_counter()\n        result = func(*args, **kwargs)\n        elapsed = time.perf_counter() - start\n        print(f"{func.__name__} took {elapsed:.4f}s")\n        return result\n    return wrapper\n\ndef retry(max_attempts=3, delay=1):\n    """Retry a function on exception."""\n    def decorator(func):\n        @functools.wraps(func)\n        def wrapper(*args, **kwargs):\n            for attempt in range(1, max_attempts + 1):\n                try:\n                    return func(*args, **kwargs)\n                except Exception as e:\n                    if attempt == max_attempts:\n                        raise\n                    print(f"Attempt {attempt} failed: {e}. Retrying...")\n                    time.sleep(delay)\n        return wrapper\n    return decorator',
        },
        {
          name: "List/Dict Comprehensions",
          extension: "py",
          category: "Python",
          description: "Common comprehension patterns",
          content:
            '# Filter and transform\nevens = [x for x in range(20) if x % 2 == 0]\nsquared = {x: x**2 for x in range(10)}\n\n# Flatten nested lists\nnested = [[1, 2], [3, 4], [5, 6]]\nflat = [item for sublist in nested for item in sublist]\n\n# Dictionary from two lists\nkeys = ["name", "age", "city"]\nvalues = ["Alice", 30, "NYC"]\nmapping = dict(zip(keys, values))\n\n# Group items by condition\nitems = [("apple", 1.2), ("banana", 0.5), ("cherry", 2.0), ("date", 0.8)]\ncheap = {name: price for name, price in items if price < 1.0}\nexpensive = {name: price for name, price in items if price >= 1.0}',
        },
        {
          name: "Context Manager",
          extension: "py",
          category: "Python",
          description: "Custom context manager with __enter__/__exit__",
          content:
            'from contextlib import contextmanager\nimport time\n\n@contextmanager\ndef timer(label="Block"):\n    """Time a block of code."""\n    start = time.perf_counter()\n    try:\n        yield\n    finally:\n        elapsed = time.perf_counter() - start\n        print(f"{label}: {elapsed:.4f}s")\n\n# Usage:\n# with timer("Data processing"):\n#     process_data()\n\n@contextmanager\ndef temp_directory():\n    """Create and clean up a temporary directory."""\n    import tempfile, shutil\n    tmpdir = tempfile.mkdtemp()\n    try:\n        yield tmpdir\n    finally:\n        shutil.rmtree(tmpdir)',
        },
        {
          name: "NamedTuple",
          extension: "py",
          category: "Python",
          description: "Typed NamedTuple with methods and unpacking",
          content:
            "from typing import NamedTuple\n\nclass Point(NamedTuple):\n    x: float\n    y: float\n    label: str = \"\"\n\n    def distance_from_origin(self) -> float:\n        return (self.x ** 2 + self.y ** 2) ** 0.5\n\n    def translate(self, dx: float, dy: float) -> \"Point\":\n        return self._replace(x=self.x + dx, y=self.y + dy)\n\n# Usage\np = Point(3.0, 4.0, \"A\")\nprint(p.distance_from_origin())  # 5.0\nx, y, label = p                  # unpacking works\nprint(p._asdict())               # {'x': 3.0, 'y': 4.0, 'label': 'A'}\nprint(p._fields)                 # ('x', 'y', 'label')",
        },
        {
          name: "Dataclass (Advanced)",
          extension: "py",
          category: "Python",
          description:
            "Frozen dataclass with __post_init__, ClassVar, and property",
          content:
            'from dataclasses import dataclass, field\nfrom typing import ClassVar\n\n@dataclass(frozen=True, slots=True)\nclass Config:\n    host: str\n    port: int = 8080\n    debug: bool = False\n    tags: tuple[str, ...] = field(default_factory=tuple)\n\n    MAX_CONNECTIONS: ClassVar[int] = 100\n\n    def __post_init__(self):\n        if not (1 <= self.port <= 65535):\n            raise ValueError(f"Invalid port: {self.port}")\n        if not self.host:\n            raise ValueError("host cannot be empty")\n\n    @property\n    def url(self) -> str:\n        return f"http://{self.host}:{self.port}"\n\n# Usage\ncfg = Config(host="localhost", port=9000, tags=("web", "api"))\nprint(cfg.url)          # http://localhost:9000\n# cfg.port = 80         # raises FrozenInstanceError',
        },
        {
          name: "Enum",
          extension: "py",
          category: "Python",
          description: "Enum with auto(), class methods, and properties",
          content:
            'from enum import Enum, auto\n\nclass Status(Enum):\n    PENDING = auto()\n    ACTIVE = auto()\n    PAUSED = auto()\n    INACTIVE = auto()\n    DELETED = auto()\n\n    @classmethod\n    def from_string(cls, s: str) -> "Status":\n        try:\n            return cls[s.upper()]\n        except KeyError:\n            raise ValueError(f"Unknown status: {s!r}")\n\n    @property\n    def is_terminal(self) -> bool:\n        return self in (Status.INACTIVE, Status.DELETED)\n\n    @property\n    def label(self) -> str:\n        return self.name.replace("_", " ").title()\n\n# Usage\ns = Status.ACTIVE\nprint(s.name)          # "ACTIVE"\nprint(s.value)         # 2\nprint(s.label)         # "Active"\nprint(s.is_terminal)   # False\nprint(Status.from_string("deleted").is_terminal)  # True',
        },
        {
          name: "TypedDict",
          extension: "py",
          category: "Python",
          description: "TypedDict for typed dictionary structures",
          content:
            'from typing import TypedDict, NotRequired\n\nclass Address(TypedDict):\n    street: str\n    city: str\n    country: str\n    postcode: NotRequired[str]\n\nclass User(TypedDict):\n    id: int\n    name: str\n    email: str\n    address: NotRequired[Address]\n    tags: NotRequired[list[str]]\n\n# Inheritance for extending schemas\nclass AdminUser(User):\n    role: str\n    permissions: list[str]\n\n# Usage — fully type-checked by mypy/pyright\ndef greet(user: User) -> str:\n    return f"Hello, {user[\'name\']}!"\n\nuser: User = {\n    "id": 1,\n    "name": "Alice",\n    "email": "alice@example.com",\n    "tags": ["admin"],\n}',
        },
        {
          name: "Protocol / ABC",
          extension: "py",
          category: "Python",
          description:
            "Abstract base class and structural Protocol for type-safe interfaces",
          content:
            "from abc import ABC, abstractmethod\nfrom typing import Protocol, runtime_checkable\n\n# Abstract Base Class — enforces subclass implementation\nclass Repository(ABC):\n    @abstractmethod\n    def get(self, id: int): ...\n\n    @abstractmethod\n    def save(self, item) -> None: ...\n\n    @abstractmethod\n    def delete(self, id: int) -> None: ...\n\n    def exists(self, id: int) -> bool:\n        return self.get(id) is not None\n\n# Protocol — structural (duck) typing, no inheritance needed\n@runtime_checkable\nclass Serializable(Protocol):\n    def to_dict(self) -> dict: ...\n    def to_json(self) -> str: ...\n\n# Any class with these methods satisfies the Protocol\nclass MyModel:\n    def to_dict(self) -> dict:\n        return vars(self)\n\n    def to_json(self) -> str:\n        import json\n        return json.dumps(self.to_dict())\n\nassert isinstance(MyModel(), Serializable)  # True",
        },
        {
          name: "Async Patterns",
          extension: "py",
          category: "Python",
          description:
            "asyncio: gather, TaskGroup, async generator, async context manager",
          content:
            'import asyncio\nfrom typing import AsyncIterator\n\n# Run tasks concurrently\nasync def fetch_all(urls: list[str]) -> list[dict]:\n    async with asyncio.TaskGroup() as tg:\n        tasks = [tg.create_task(fetch_one(url)) for url in urls]\n    return [t.result() for t in tasks]\n\nasync def fetch_one(url: str) -> dict:\n    await asyncio.sleep(0)  # replace with aiohttp call\n    return {"url": url, "status": 200}\n\n# Async generator for pagination\nasync def paginate(endpoint: str, page_size: int = 20) -> AsyncIterator[list]:\n    page = 1\n    while True:\n        batch = await fetch_one(f"{endpoint}?page={page}&size={page_size}")\n        if not batch:\n            break\n        yield batch\n        page += 1\n\n# Async context manager\nclass AsyncDB:\n    async def __aenter__(self):\n        await self._connect()\n        return self\n\n    async def __aexit__(self, exc_type, exc, tb):\n        await self._close()\n\n    async def _connect(self): ...\n    async def _close(self): ...\n\n# Entry point\nif __name__ == "__main__":\n    asyncio.run(fetch_all(["https://api.example.com/a", "https://api.example.com/b"]))',
        },
        {
          name: "Loguru Logging",
          extension: "py",
          category: "Python",
          description: "Loguru logging with console + rotating file handler",
          content:
            'from loguru import logger\nimport sys\n\n# Remove default handler and configure custom ones\nlogger.remove()\n\n# Console: colored, human-readable\nlogger.add(\n    sys.stderr,\n    level="INFO",\n    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}:{line}</cyan> — <level>{message}</level>",\n    colorize=True,\n)\n\n# File: rotating, compressed, JSON-structured for log aggregation\nlogger.add(\n    "logs/app.log",\n    level="DEBUG",\n    rotation="10 MB",\n    retention="14 days",\n    compression="gz",\n    serialize=True,\n)\n\n# Usage\nlogger.debug("Detailed debug info")\nlogger.info("App started")\nlogger.warning("Low disk space")\nlogger.error("Connection refused")\nlogger.critical("System failure")\n\n# Bind structured context to a logger\nlogger.bind(user_id=42, action="login").info("User authenticated")\n\n# Capture exception with full traceback\ntry:\n    risky_call()\nexcept Exception:\n    logger.exception("Unexpected error")',
        },
        {
          name: "pytest Structure",
          extension: "py",
          category: "Python",
          description: "Fixtures, parametrize, mocking, and exception testing",
          content:
            'import pytest\nfrom unittest.mock import patch\n\n# === Fixtures ===\n@pytest.fixture\ndef sample_user():\n    return {"id": 1, "name": "Alice", "email": "alice@example.com"}\n\n@pytest.fixture\ndef db(tmp_path):\n    from myapp.db import Database\n    db = Database(tmp_path / "test.db")\n    db.migrate()\n    yield db\n    db.close()\n\n# === Basic test ===\ndef test_user_display_name(sample_user):\n    from myapp.models import User\n    user = User(**sample_user)\n    assert user.display_name == "Alice <alice@example.com>"\n\n# === Parametrize ===\n@pytest.mark.parametrize("value,expected", [\n    ("hello", "HELLO"),\n    ("world", "WORLD"),\n    ("",      ""),\n])\ndef test_to_upper(value, expected):\n    assert value.upper() == expected\n\n# === Mocking ===\ndef test_sends_email():\n    with patch("myapp.email.send") as mock_send:\n        from myapp.notifications import notify_user\n        notify_user(user_id=1)\n        mock_send.assert_called_once()\n\n# === Exception testing ===\ndef test_raises_on_invalid():\n    with pytest.raises(ValueError, match="must be positive"):\n        from myapp.utils import validate\n        validate(-1)',
        },
        {
          name: "subprocess",
          extension: "py",
          category: "Python",
          description:
            "Run commands, capture output, stream, and handle errors",
          content:
            'import subprocess\nfrom pathlib import Path\n\n# Run and capture output (raises CalledProcessError on non-zero exit)\nresult = subprocess.run(\n    ["git", "log", "--oneline", "-10"],\n    capture_output=True,\n    text=True,\n    check=True,\n)\nprint(result.stdout)\n\n# Stream output line by line (for long-running processes)\ndef stream_command(cmd: list[str]) -> None:\n    with subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True) as proc:\n        for line in proc.stdout:\n            print(line, end="")\n    if proc.returncode != 0:\n        raise subprocess.CalledProcessError(proc.returncode, cmd)\n\n# Error handling\ntry:\n    subprocess.run(["false"], check=True)\nexcept subprocess.CalledProcessError as e:\n    print(f"Failed (exit {e.returncode}): {e.cmd}")\n\n# Run in a specific directory\nsubprocess.run(["npm", "install"], cwd=Path("/path/to/project"), check=True)\n\n# Capture stdout and stderr separately\nresult = subprocess.run(\n    ["python", "script.py"],\n    stdout=subprocess.PIPE,\n    stderr=subprocess.PIPE,\n    text=True,\n)\nif result.returncode != 0:\n    print(result.stderr)',
        },
        {
          name: "CSV Read / Write",
          extension: "py",
          category: "Python",
          description:
            "Read and write CSV files with DictReader, DictWriter, and dataclasses",
          content:
            'import csv\nfrom dataclasses import dataclass, fields, astuple\n\n# Read CSV → list of dicts\ndef read_csv(filepath: str) -> list[dict]:\n    with open(filepath, newline="", encoding="utf-8") as f:\n        return list(csv.DictReader(f))\n\n# Write list of dicts → CSV\ndef write_csv(filepath: str, rows: list[dict], fieldnames: list[str] = None) -> None:\n    if not rows:\n        return\n    fieldnames = fieldnames or list(rows[0].keys())\n    with open(filepath, "w", newline="", encoding="utf-8") as f:\n        writer = csv.DictWriter(f, fieldnames=fieldnames)\n        writer.writeheader()\n        writer.writerows(rows)\n\n# Dataclass ↔ CSV\n@dataclass\nclass Product:\n    id: int\n    name: str\n    price: float\n\ndef dataclasses_to_csv(filepath: str, items: list) -> None:\n    cols = [f.name for f in fields(items[0])]\n    with open(filepath, "w", newline="", encoding="utf-8") as f:\n        w = csv.writer(f)\n        w.writerow(cols)\n        w.writerows(astuple(item) for item in items)\n\n# Usage\ndata = read_csv("input.csv")\nwrite_csv("output.csv", data)',
        },
      ],
      SQL: [
        {
          name: "SELECT with JOIN",
          extension: "sql",
          category: "SQL",
          description: "Multi-table query with INNER and LEFT JOIN",
          content:
            "SELECT\n    u.id,\n    u.name,\n    u.email,\n    o.order_id,\n    o.total,\n    o.created_at\nFROM users u\nINNER JOIN orders o ON o.user_id = u.id\nLEFT JOIN addresses a ON a.user_id = u.id\nWHERE u.active = 1\n  AND o.created_at >= '2024-01-01'\nORDER BY o.created_at DESC\nLIMIT 100;",
        },
        {
          name: "CREATE TABLE",
          extension: "sql",
          category: "SQL",
          description:
            "Table creation with common column types and constraints",
          content:
            "CREATE TABLE IF NOT EXISTS users (\n    id          BIGINT PRIMARY KEY AUTO_INCREMENT,\n    name        VARCHAR(255) NOT NULL,\n    email       VARCHAR(255) NOT NULL UNIQUE,\n    role        ENUM('admin', 'user', 'viewer') DEFAULT 'user',\n    is_active   BOOLEAN DEFAULT TRUE,\n    metadata    JSON,\n    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n\n    INDEX idx_email (email),\n    INDEX idx_role_active (role, is_active)\n);",
        },
        {
          name: "CTE (Common Table Expression)",
          extension: "sql",
          category: "SQL",
          description: "Recursive and non-recursive CTEs",
          content:
            "-- Non-recursive CTE: monthly revenue summary\nWITH monthly_revenue AS (\n    SELECT\n        DATE_TRUNC('month', order_date) AS month,\n        SUM(total) AS revenue,\n        COUNT(*) AS order_count\n    FROM orders\n    WHERE order_date >= '2024-01-01'\n    GROUP BY DATE_TRUNC('month', order_date)\n)\nSELECT\n    month,\n    revenue,\n    order_count,\n    revenue / order_count AS avg_order_value,\n    LAG(revenue) OVER (ORDER BY month) AS prev_month_revenue\nFROM monthly_revenue\nORDER BY month;",
        },
        {
          name: "Window Functions",
          extension: "sql",
          category: "SQL",
          description: "ROW_NUMBER, RANK, running totals, and moving averages",
          content:
            "SELECT\n    id,\n    name,\n    department,\n    salary,\n    -- Rank within department\n    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank,\n    RANK() OVER (ORDER BY salary DESC) AS overall_rank,\n    -- Running total\n    SUM(salary) OVER (ORDER BY hire_date ROWS UNBOUNDED PRECEDING) AS running_total,\n    -- Moving average (last 3)\n    AVG(salary) OVER (ORDER BY hire_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg,\n    -- Percent of department total\n    ROUND(salary * 100.0 / SUM(salary) OVER (PARTITION BY department), 2) AS pct_of_dept\nFROM employees\nORDER BY department, salary DESC;",
        },
        {
          name: "UPSERT / MERGE",
          extension: "sql",
          category: "SQL",
          description: "Insert or update on conflict",
          content:
            "-- MySQL: INSERT ... ON DUPLICATE KEY UPDATE\nINSERT INTO users (id, name, email, updated_at)\nVALUES (1, 'Alice', 'alice@example.com', NOW())\nON DUPLICATE KEY UPDATE\n    name = VALUES(name),\n    email = VALUES(email),\n    updated_at = NOW();\n\n-- PostgreSQL: INSERT ... ON CONFLICT\nINSERT INTO users (id, name, email, updated_at)\nVALUES (1, 'Alice', 'alice@example.com', NOW())\nON CONFLICT (id) DO UPDATE SET\n    name = EXCLUDED.name,\n    email = EXCLUDED.email,\n    updated_at = NOW();",
        },
        {
          name: "GROUP BY with HAVING",
          extension: "sql",
          category: "SQL",
          description: "Aggregation with filtering on grouped results",
          content:
            "SELECT\n    department,\n    COUNT(*) AS employee_count,\n    ROUND(AVG(salary), 2) AS avg_salary,\n    MIN(salary) AS min_salary,\n    MAX(salary) AS max_salary,\n    SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_count\nFROM employees\nWHERE hire_date >= '2020-01-01'\nGROUP BY department\nHAVING COUNT(*) >= 5\n   AND AVG(salary) > 50000\nORDER BY avg_salary DESC;",
        },
        {
          name: "Subquery Patterns",
          extension: "sql",
          category: "SQL",
          description: "Correlated subquery, EXISTS, IN",
          content:
            "-- Find users with orders above their average\nSELECT u.name, o.total\nFROM users u\nJOIN orders o ON o.user_id = u.id\nWHERE o.total > (\n    SELECT AVG(o2.total)\n    FROM orders o2\n    WHERE o2.user_id = u.id\n);\n\n-- EXISTS: users who have placed at least one order\nSELECT u.name\nFROM users u\nWHERE EXISTS (\n    SELECT 1 FROM orders o WHERE o.user_id = u.id\n);\n\n-- NOT IN: users with no orders\nSELECT u.name\nFROM users u\nWHERE u.id NOT IN (\n    SELECT DISTINCT user_id FROM orders\n);",
        },
        {
          name: "Recursive CTE",
          extension: "sql",
          category: "SQL",
          description:
            "Traverse a self-referencing hierarchy (org chart, category tree)",
          content:
            "-- Recursive CTE: traverse a hierarchy (org chart, category tree, etc.)\nWITH RECURSIVE org_tree AS (\n    -- Anchor: start from root nodes (no parent)\n    SELECT\n        id,\n        name,\n        manager_id,\n        0    AS depth,\n        name AS path\n    FROM employees\n    WHERE manager_id IS NULL\n\n    UNION ALL\n\n    -- Recursive: join each child to its parent row\n    SELECT\n        e.id,\n        e.name,\n        e.manager_id,\n        ot.depth + 1,\n        ot.path || ' > ' || e.name\n    FROM employees e\n    INNER JOIN org_tree ot ON ot.id = e.manager_id\n)\nSELECT\n    id,\n    REPEAT('  ', depth) || name AS indented_name,\n    depth,\n    path\nFROM org_tree\nORDER BY path;",
        },
        {
          name: "EXPLAIN ANALYZE",
          extension: "sql",
          category: "SQL",
          description:
            "Inspect query execution plans to diagnose performance issues",
          content:
            "-- PostgreSQL: full execution plan with actual timings and buffer usage\nEXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)\nSELECT\n    u.name,\n    COUNT(o.id)  AS order_count,\n    SUM(o.total) AS total_spent\nFROM users u\nJOIN orders o ON o.user_id = u.id\nWHERE u.created_at >= '2024-01-01'\nGROUP BY u.id, u.name\nHAVING COUNT(o.id) > 5\nORDER BY total_spent DESC;\n\n-- MySQL 8.0.18+:\n-- EXPLAIN ANALYZE SELECT ...;\n\n-- Key things to look for:\n--   Seq Scan       → likely missing index on a large table\n--   Rows Removed   → high value means index isn't selective enough\n--   actual time    → compare to estimated to spot planner mistakes\n--   Buffers read   → cache misses (I/O happening)\n--   Nested Loop    → can be slow for large result sets\n--   Hash Join      → generally efficient for large joins",
        },
        {
          name: "Pivot (Conditional Aggregation)",
          extension: "sql",
          category: "SQL",
          description: "Turn row values into columns using CASE or FILTER",
          content:
            "-- Portable: conditional aggregation with CASE (MySQL, PostgreSQL, SQLite)\nSELECT\n    department,\n    SUM(CASE WHEN MONTH(sale_date) = 1  THEN amount ELSE 0 END) AS jan,\n    SUM(CASE WHEN MONTH(sale_date) = 2  THEN amount ELSE 0 END) AS feb,\n    SUM(CASE WHEN MONTH(sale_date) = 3  THEN amount ELSE 0 END) AS mar,\n    SUM(CASE WHEN MONTH(sale_date) = 4  THEN amount ELSE 0 END) AS apr,\n    SUM(CASE WHEN MONTH(sale_date) = 5  THEN amount ELSE 0 END) AS may,\n    SUM(CASE WHEN MONTH(sale_date) = 6  THEN amount ELSE 0 END) AS jun,\n    SUM(amount) AS total\nFROM sales\nWHERE YEAR(sale_date) = 2024\nGROUP BY department\nORDER BY department;\n\n-- PostgreSQL: FILTER syntax (cleaner)\nSELECT\n    department,\n    SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM sale_date) = 1) AS jan,\n    SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM sale_date) = 2) AS feb,\n    SUM(amount) FILTER (WHERE EXTRACT(MONTH FROM sale_date) = 3) AS mar,\n    SUM(amount) AS total\nFROM sales\nWHERE EXTRACT(YEAR FROM sale_date) = 2024\nGROUP BY department;",
        },
        {
          name: "Index Creation",
          extension: "sql",
          category: "SQL",
          description:
            "Single, composite, partial, expression, and full-text indexes",
          content:
            "-- Single column\nCREATE INDEX idx_users_email ON users (email);\n\n-- Composite (put equality columns first, range/sort columns last)\nCREATE INDEX idx_orders_lookup ON orders (user_id, status, created_at DESC);\n\n-- Unique\nCREATE UNIQUE INDEX idx_users_email_unique ON users (email);\n\n-- Partial index (PostgreSQL) — only index matching rows\nCREATE INDEX idx_orders_pending ON orders (created_at)\nWHERE status = 'pending';\n\n-- Expression index (PostgreSQL)\nCREATE INDEX idx_users_lower_email ON users (LOWER(email));\n\n-- Full-text index (MySQL)\nCREATE FULLTEXT INDEX idx_articles_fts ON articles (title, body);\n\n-- Check index usage\n-- PostgreSQL:\nSELECT indexname, idx_scan, idx_tup_read\nFROM pg_stat_user_indexes\nWHERE relname = 'orders'\nORDER BY idx_scan DESC;\n\n-- MySQL:\n-- SHOW INDEX FROM orders;",
        },
      ],
      Bash: [
        {
          name: "Script Boilerplate",
          extension: "sh",
          category: "Shell",
          description:
            "Bash script with strict mode, argument parsing, and logging",
          content:
            '#!/usr/bin/env bash\nset -euo pipefail\n\nSCRIPT_NAME="${0##*/}"\n\nusage() {\n  echo "Usage: $SCRIPT_NAME [OPTIONS] <input>"\n  echo ""\n  echo "Options:"\n  echo "  -o, --output FILE   Output file (default: output.txt)"\n  echo "  -v, --verbose       Enable verbose output"\n  echo "  -h, --help          Show this help"\n}\n\nlog_info()  { echo "[INFO]  $*"; }\nlog_error() { echo "[ERROR] $*" >&2; }\ndie()       { log_error "$*"; exit 1; }\n\nmain() {\n  local output="output.txt"\n  local verbose=false\n\n  while [[ $# -gt 0 ]]; do\n    case "$1" in\n      -o|--output)  output="$2"; shift 2 ;;\n      -v|--verbose) verbose=true; shift ;;\n      -h|--help)    usage; exit 0 ;;\n      --)           shift; break ;;\n      -*)           die "Unknown option: $1" ;;\n      *)            break ;;\n    esac\n  done\n\n  [[ $# -lt 1 ]] && { log_error "Input required"; usage; exit 1; }\n  local input="$1"\n\n  $verbose && log_info "Processing: $input -> $output"\n  # Your logic here\n}\n\nmain "$@"',
        },
        {
          name: "Logging & Colors",
          extension: "sh",
          category: "Shell",
          description: "Colored log functions using tput (TTY-safe)",
          content:
            '# Terminal colors — automatically disabled if not a TTY\nif [[ -t 1 ]] && command -v tput &>/dev/null; then\n  RED=$(tput setaf 1) YELLOW=$(tput setaf 3)\n  GREEN=$(tput setaf 2) BLUE=$(tput setaf 4)\n  BOLD=$(tput bold) NC=$(tput sgr0)\nelse\n  RED=\'\' YELLOW=\'\' GREEN=\'\' BLUE=\'\' BOLD=\'\' NC=\'\'\nfi\n\nlog_info()    { echo "${BLUE}[INFO]${NC}    $*"; }\nlog_success() { echo "${GREEN}[OK]${NC}      $*"; }\nlog_warn()    { echo "${YELLOW}[WARN]${NC}    $*" >&2; }\nlog_error()   { echo "${RED}[ERROR]${NC}   $*" >&2; }\nlog_step()    { echo "${BOLD}==> $*${NC}"; }\ndie()         { log_error "$*"; exit 1; }\n\n# Usage\nlog_step "Starting deployment"\nlog_info "Reading config..."\nlog_success "Config loaded"\nlog_warn "No cache found, rebuilding"\nlog_error "Connection refused" && die "Aborting"',
        },
        {
          name: "File & Safety Checks",
          extension: "sh",
          category: "Shell",
          description:
            "Helpers to validate files, directories, and required commands",
          content:
            'require_file() {\n  [[ -f "$1" ]] || die "File not found: $1"\n  [[ -r "$1" ]] || die "File not readable: $1"\n}\n\nrequire_dir() {\n  [[ -d "$1" ]] || die "Directory not found: $1"\n}\n\nensure_dir() {\n  mkdir -p "$1" || die "Failed to create directory: $1"\n}\n\nrequire_cmd() {\n  command -v "$1" &>/dev/null || die "Required command not found: $1"\n}\n\n# Prompt before destructive actions\nconfirm() {\n  local prompt="${1:-Are you sure?} [y/N] "\n  read -rp "$prompt" answer\n  [[ "${answer,,}" == "y" ]]\n}\n\n# Usage\nrequire_file "$INPUT_FILE"\nrequire_dir  "$OUTPUT_DIR"\nrequire_cmd  jq\nrequire_cmd  curl\nconfirm "Delete all logs?" && rm -rf /var/log/myapp/',
        },
        {
          name: "Trap & Cleanup",
          extension: "sh",
          category: "Shell",
          description: "Lockfile, temp directory cleanup, and a retry helper",
          content:
            'LOCKFILE="/tmp/${0##*/}.lock"\nWORK_DIR=""\n\ncleanup() {\n  local exit_code=$?\n  rm -f "$LOCKFILE"\n  [[ -n "$WORK_DIR" ]] && rm -rf "$WORK_DIR"\n  exit $exit_code\n}\ntrap cleanup EXIT INT TERM\n\n# Prevent concurrent runs\nif ! ( set -o noclobber; echo "$$" > "$LOCKFILE" ) 2>/dev/null; then\n  die "Already running (PID: $(cat "$LOCKFILE"))"\nfi\n\nWORK_DIR="$(mktemp -d)"\nlog_info "Temp dir: $WORK_DIR"\n\n# Retry a command N times with delay\nretry() {\n  local attempts="${1:-3}"; shift\n  local delay="${1:-2}"; shift\n  local i\n  for (( i=1; i<=attempts; i++ )); do\n    "$@" && return 0\n    log_warn "Attempt $i/$attempts failed. Retrying in ${delay}s..."\n    sleep "$delay"\n  done\n  die "Command failed after $attempts attempts: $*"\n}',
        },
        {
          name: "Loop Patterns",
          extension: "sh",
          category: "Shell",
          description:
            "find+while, read line by line, indexed array, CSV fields",
          content:
            '# Iterate files — null-safe for names with spaces\nfind /path/to/dir -name "*.log" -maxdepth 2 -type f -print0 \\\n  | while IFS= read -r -d \'\' file; do\n    echo "Processing: $file"\n  done\n\n# Read file line by line (handles missing final newline)\nwhile IFS= read -r line || [[ -n "$line" ]]; do\n  [[ -z "$line" || "$line" == \'#\'* ]] && continue\n  echo "Line: $line"\ndone < "input.txt"\n\n# Array loop with index\nitems=("alpha" "beta" "gamma")\nfor i in "${!items[@]}"; do\n  printf "%d: %s\\n" "$i" "${items[$i]}"\ndone\n\n# Parse delimited fields per line\nwhile IFS=\',\' read -r name age city; do\n  echo "Name=$name  Age=$age  City=$city"\ndone < "people.csv"',
        },
        {
          name: "String Utilities",
          extension: "sh",
          category: "Shell",
          description: "trim, case conversion, contains, slugify, join_by",
          content:
            '# Trim leading/trailing whitespace\ntrim() { echo "$*" | sed \'s/^[[:space:]]*//;s/[[:space:]]*$//\'; }\n\n# Case conversion (bash 4+)\nto_lower() { echo "${1,,}"; }\nto_upper() { echo "${1^^}"; }\n\n# Check if string contains substring (returns exit code)\ncontains() { [[ "$1" == *"$2"* ]]; }\n\n# Slugify: lowercase, non-alphanum runs become hyphens\nslugify() {\n  echo "$1" \\\n    | tr \'[:upper:]\' \'[:lower:]\' \\\n    | tr -cs \'a-z0-9\' \'-\' \\\n    | sed \'s/^-//;s/-$//\'\n}\n\n# Join array elements with a delimiter\njoin_by() { local IFS="$1"; shift; echo "$*"; }\n\n# Usage\ntrim "  hello world  "    # "hello world"\nto_lower "Hello World"    # "hello world"\nslugify "My Blog Post!"   # "my-blog-post"\njoin_by "," a b c d       # "a,b,c,d"\ncontains "foobar" "oba" && echo yes',
        },
        {
          name: "jq JSON Parsing",
          extension: "sh",
          category: "Shell",
          description: "Extract, filter, transform, and update JSON with jq",
          content:
            "# Requires: jq\n\n# Extract values (-r = raw output, no quotes around strings)\njq -r '.name' data.json\njq -r '.user.address.city' data.json\n\n# Iterate an array — one value per line\njq -r '.users[] | .name' data.json\n\n# Filter by condition\njq '[.users[] | select(.active == true)]' data.json\n\n# Reshape: build a new object from each element\njq '[.users[] | {id, label: .name, email}]' data.json\n\n# Loop results in bash\nwhile IFS= read -r name; do\n    echo \"Hello, $name\"\ndone < <(jq -r '.users[].name' data.json)\n\n# Pass bash variables into jq\nuser_id=42\njq --argjson id \"$user_id\" '.users[] | select(.id == $id)' data.json\n\n# Merge two JSON objects\njq -n --argjson a '{\"x\":1}' --argjson b '{\"y\":2}' '$a + $b'\n\n# Update a field (jq cannot edit files in-place)\njq '.version = \"2.0.0\"' package.json > tmp.$$ && mv tmp.$$ package.json",
        },
        {
          name: "curl with Auth & Retry",
          extension: "sh",
          category: "Shell",
          description:
            "Authenticated GET/POST helpers and file download with retry",
          content:
            'BASE_URL="https://api.example.com"\nTOKEN="${API_TOKEN:-}"\n\n# Authenticated GET\napi_get() {\n    curl -fsSL \\\n        -H "Authorization: Bearer $TOKEN" \\\n        -H "Accept: application/json" \\\n        "${BASE_URL}$1"\n}\n\n# Authenticated POST with JSON body\napi_post() {\n    local endpoint="$1" body="$2"\n    curl -fsSL -X POST \\\n        -H "Authorization: Bearer $TOKEN" \\\n        -H "Content-Type: application/json" \\\n        -d "$body" \\\n        "${BASE_URL}${endpoint}"\n}\n\n# Download with progress bar and automatic retries\ndownload_file() {\n    local url="$1" dest="$2"\n    curl -fL \\\n        --retry 3 \\\n        --retry-delay 2 \\\n        --retry-all-errors \\\n        --progress-bar \\\n        -o "$dest" \\\n        "$url"\n}\n\n# Usage\nusers=$(api_get "/users?page=1")\necho "$users" | jq -r \'.[].name\'\n\napi_post "/items" \'{"name":"Widget","price":9.99}\'\ndownload_file "https://example.com/archive.tar.gz" "/tmp/archive.tar.gz"',
        },
        {
          name: "SSH / SCP / rsync",
          extension: "sh",
          category: "Shell",
          description: "SSH wrapper, upload, download, and remote sync helpers",
          content:
            'HOST="user@example.com"\nKEY="$HOME/.ssh/id_rsa"\nREMOTE_DIR="/var/app"\n\n# SSH with safety flags\nssh_exec() {\n    ssh -i "$KEY" \\\n        -o StrictHostKeyChecking=accept-new \\\n        -o ConnectTimeout=10 \\\n        "$HOST" "$@"\n}\n\n# Upload file or directory (rsync — fast, incremental)\nupload() {\n    local src="$1" dest="${2:-$REMOTE_DIR}"\n    rsync -az --progress \\\n        -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \\\n        "$src" "${HOST}:${dest}"\n}\n\n# Download from remote\ndownload() {\n    local remote="$1" local_dest="${2:-.}"\n    scp -i "$KEY" -r "${HOST}:${remote}" "$local_dest"\n}\n\n# Sync local → remote (mirror, deletes removed files)\nsync_to_remote() {\n    local src="$1" dest="${2:-$REMOTE_DIR}"\n    rsync -avz --delete \\\n        -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \\\n        "$src" "${HOST}:${dest}"\n}\n\n# Usage\nssh_exec "systemctl restart myapp && journalctl -u myapp -n 50"\nupload "./dist/" "/var/www/html/"\nsync_to_remote "./build/" "/var/app/"\ndownload "/var/log/app.log" "./logs/"',
        },
        {
          name: "Parallel Jobs",
          extension: "sh",
          category: "Shell",
          description:
            "Run background jobs with a concurrency limit using wait",
          content:
            'set -euo pipefail\n\nMAX_JOBS=4\npids=()\n\n# Block until a slot is free\nwait_for_slot() {\n    while [[ ${#pids[@]} -ge $MAX_JOBS ]]; do\n        local running=()\n        for pid in "${pids[@]}"; do\n            if kill -0 "$pid" 2>/dev/null; then\n                running+=("$pid")\n            else\n                wait "$pid" || echo "[WARN] job $pid failed" >&2\n            fi\n        done\n        pids=("${running[@]}")\n        [[ ${#pids[@]} -ge $MAX_JOBS ]] && sleep 0.1\n    done\n}\n\n# Worker function — replace with your real task\nprocess_item() {\n    local item="$1"\n    echo "Processing: $item"\n    sleep 1\n}\n\n# Dispatch items in parallel\nitems=("a.txt" "b.txt" "c.txt" "d.txt" "e.txt" "f.txt" "g.txt")\nfor item in "${items[@]}"; do\n    wait_for_slot\n    process_item "$item" &\n    pids+=("$!")\ndone\n\n# Wait for all remaining jobs\nfor pid in "${pids[@]}"; do\n    wait "$pid" || echo "[WARN] job $pid failed" >&2\ndone\necho "All jobs complete"',
        },
      ],
      Nushell: [
        {
          name: "Script with Main",
          extension: "nu",
          category: "Nushell",
          description:
            "Nu script with typed flags, argument validation, and file I/O",
          content:
            '#!/usr/bin/env nu\n\n# Process an input file and write output\ndef main [\n  input: path,                         # Input file\n  --output (-o): path = "output.txt",  # Output file\n  --verbose (-v),                      # Verbose mode\n  --limit (-n): int = 100,             # Max records\n] {\n  if not ($input | path exists) {\n    error make { msg: $"File not found: ($input)" }\n  }\n\n  if $verbose { print $"Reading ($input)..." }\n\n  let data = open $input | first $limit\n\n  if $verbose { print $"Writing to ($output)..." }\n  $data | to json | save --force $output\n\n  print $"Done. Wrote ($data | length) records."\n}',
        },
        {
          name: "HTTP Requests",
          extension: "nu",
          category: "Nushell",
          description:
            "GET, POST, error handling, and pagination with http commands",
          content:
            '# GET — returns parsed JSON automatically\nlet users = http get "https://api.example.com/users"\n\n# GET with auth headers\nlet data = http get\n  --headers { Authorization: "Bearer my-token" }\n  "https://api.example.com/items?page=1"\n\n# POST with JSON body\nlet result = http post\n  --content-type "application/json"\n  "https://api.example.com/items"\n  { name: "Widget", active: true, tags: ["new"] }\n\n# Error handling\nlet response = try {\n  http get "https://api.example.com/data"\n} catch {|err|\n  print $"Request failed: ($err.msg)"\n  null\n}\n\n# Paginate all results into one list\ndef fetch-all [base: string, --page-size: int = 20] {\n  mut page = 1\n  mut all = []\n  loop {\n    let batch = http get $"($base)?page=($page)&limit=($page_size)"\n    if ($batch | is-empty) { break }\n    $all = $all ++ $batch\n    $page += 1\n  }\n  $all\n}',
        },
        {
          name: "Data Pipeline",
          extension: "nu",
          category: "Nushell",
          description: "Filter, aggregate, transform, and join tables",
          content:
            '# Filter, select, and sort a table\nopen data.csv\n  | where age > 30\n  | select name email age\n  | sort-by age --reverse\n  | first 10\n\n# Group and aggregate\nopen sales.csv\n  | group-by region\n  | transpose region rows\n  | insert total {|r| $r.rows | get amount | math sum }\n  | insert avg   {|r| $r.rows | get amount | math avg | math round --precision 2 }\n  | sort-by total --reverse\n\n# Transform nested JSON from an API\nhttp get "https://api.example.com/posts"\n  | each {|item|\n      {\n        id:    $item.id\n        title: ($item.title | str trim)\n        tags:  ($item.tags | str join ", ")\n      }\n    }\n  | where title != ""\n\n# Join two tables on a key\nlet orders = open orders.csv\nlet users  = open users.csv\n$orders\n  | join $users id user_id\n  | select name email total created_at\n  | sort-by created_at --reverse',
        },
        {
          name: "Custom Commands",
          extension: "nu",
          category: "Nushell",
          description:
            "Typed params, flags, table-returning commands, pipeline-aware commands",
          content:
            '# Typed command with flags and defaults\ndef greet [\n  name: string,           # Name to greet\n  --formal (-f),          # Use formal greeting\n  --times (-n): int = 1,  # Repetitions\n] {\n  let greeting = if $formal { "Good day" } else { "Hello" }\n  1..$times | each { print $"($greeting), ($name)!" }\n}\n\n# Command that returns a table\ndef list-large-files [\n  dir: path = ".",         # Directory to scan\n  --min-mb: float = 10.0,  # Minimum size in MB\n] -> table {\n  ls $dir\n    | where type == "file"\n    | insert size_mb {|f| $f.size / 1MB }\n    | where size_mb >= $min_mb\n    | select name size_mb modified\n    | sort-by size_mb --reverse\n}\n\n# Pipeline-aware command\ndef add-tax [rate: float = 0.1] {\n  each {|row| $row | upsert price ($row.price * (1 + $rate)) }\n}\n\n# Usage\ngreet "Alice" --formal --times 2\nlist-large-files /var/log --min-mb 5\nopen prices.csv | add-tax 0.2',
        },
        {
          name: "File Operations",
          extension: "nu",
          category: "Nushell",
          description:
            "Open formats, save/convert, path ops, and glob file search",
          content:
            '# Open various formats (type auto-detected by extension)\nlet csv_data  = open data.csv\nlet json_data = open config.json\nlet toml_data = open pyproject.toml\nlet raw_text  = open readme.md\nlet log_lines = open app.log | lines\n\n# Save / convert between formats\n$csv_data  | to json --indent 2 | save output.json\n$json_data | to csv  | save output.csv\n$json_data | to toml | save config.toml\n\n# Path operations\nlet dir  = $env.PWD\nlet file = [$dir "sub" "data.txt"] | path join\nlet ext  = $file | path extension         # ".txt"\nlet stem = $file | path parse | get stem  # "data"\nlet name = $file | path basename          # "data.txt"\n\n# Find recently modified files\nls **/*.log\n  | where modified > ((date now) - 7day)\n  | sort-by modified --reverse\n  | select name size modified',
        },
        {
          name: "Error Handling",
          extension: "nu",
          category: "Nushell",
          description:
            "try/catch, error make with span info, null-safe access, early return",
          content:
            '# try / catch with fallback value\nlet config = try {\n  open "config.json"\n} catch {|err|\n  print $"Warning: ($err.msg) — using defaults"\n  { host: "localhost", port: 8080 }\n}\n\n# Custom structured error with span info\ndef divide [a: float, b: float] -> float {\n  if $b == 0 {\n    error make {\n      msg: "Division by zero"\n      label: { text: "must be non-zero", span: (metadata $b).span }\n    }\n  }\n  $a / $b\n}\n\n# Null-safe field access with defaults\nlet name  = $data | get --ignore-errors "user.name" | default "Anonymous"\nlet items = $data | get --ignore-errors "items"      | default []\n\n# Early return pattern\ndef process-file [path: path] {\n  if not ($path | path exists) {\n    return (error make { msg: $"Not found: ($path)" })\n  }\n  open $path | lines | length\n}',
        },
        {
          name: "Environment & Config",
          extension: "nu",
          category: "Nushell",
          description: "Read env vars, load .env files, Nu built-in paths",
          content:
            '# Access environment variables\nlet home   = $env.HOME\nlet path   = $env.PATH\nlet editor = $env | get --ignore-errors EDITOR | default "vim"\n\n# Set env vars scoped to a block\nwith-env { NODE_ENV: "production", PORT: "8080" } {\n    ^node server.js\n}\n\n# Load a .env file into a record\ndef load-dotenv [file: path = ".env"] {\n    open $file\n        | lines\n        | where { |l| not ($l | str starts-with "#") and ($l | str trim) != "" }\n        | each { |l|\n            let parts = $l | split row "=" | each { str trim }\n            { ($parts.0): ($parts | skip 1 | str join "=") }\n          }\n        | into record\n}\n\n# Nu built-in paths\nprint $nu.home-path      # home directory\nprint $nu.config-path    # config.nu location\nprint $nu.env-path       # env.nu location\nprint $nu.history-path   # history file\n\n# Persistent env — add these to env.nu:\n# $env.MY_VAR = "value"\n# $env.PATH = ($env.PATH | prepend "/my/custom/bin")',
        },
        {
          name: "String Manipulation",
          extension: "nu",
          category: "Nushell",
          description: "str trim/case/replace/split/join, parse, and regex",
          content:
            'let s = "  Hello, World!  "\n\n# Basic operations\n$s | str trim                              # "Hello, World!"\n$s | str trim | str downcase              # "hello, world!"\n$s | str upcase                            # "  HELLO, WORLD!  "\n$s | str contains "World"                 # true\n$s | str starts-with "  Hello"            # true\n$s | str replace "World" "Nushell"        # "  Hello, Nushell!  "\n$s | str replace --all "l" "L"            # replace every occurrence\n$s | str trim | str length                # 13\n\n# Split and join\n"a,b,c,d" | split row ","                 # ["a", "b", "c", "d"]\n["a", "b", "c"] | str join ", "           # "a, b, c"\n\n# Parse structured strings\n"name=Alice age=30" | parse "{key}={value}"\n"GET /api/users HTTP/1.1" | parse "{method} {path} {proto}"\n\n# Regex replace and capture\n"foo123bar" | str replace --regex \'\\d+\' "NUM"\n"2024-01-15" | parse --regex \'(?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})\'\n\n# Slice\n"toolongstring" | str substring 0..6      # "toolon"\n"hello" | str reverse                     # "olleh"',
        },
        {
          name: "Date & Time",
          extension: "nu",
          category: "Nushell",
          description:
            "Date formatting, parsing, arithmetic, and duration literals",
          content:
            '# Current datetime\nlet now = date now\n\n# Format\n$now | format date "%Y-%m-%d"             # "2024-01-15"\n$now | format date "%H:%M:%S"             # "14:30:00"\n$now | format date "%Y-%m-%dT%H:%M:%S"   # ISO 8601\n\n# Parse a date string\n"2024-01-15" | into datetime\n"2024-01-15T14:30:00Z" | into datetime\n\n# Arithmetic — duration literals: day hr min sec ms\nlet tomorrow   = (date now) + 1day\nlet last_week  = (date now) - 7day\nlet in_2h      = (date now) + 2hr\nlet soon       = (date now) + 30min\n\n# Comparisons\nlet ts = "2024-01-01" | into datetime\nif $ts < (date now) { print "in the past" }\n\n# Find recently modified files\nls **/*.log\n    | where modified > ((date now) - 1day)\n    | sort-by modified --reverse\n    | select name size modified\n\n# Time a block\nlet start = date now\nsleep 1sec\nprint $"Elapsed: ((date now) - $start)"',
        },
      ],
      LaTeX: [
        {
          name: "Vectors & Matrices",
          extension: "tex",
          category: "LaTeX",
          description:
            "Column vector, matrix notation, dot product, and L1/L2/max norms",
          content:
            "% Column vector\n\\mathbf{x} = \\begin{pmatrix} x_1 \\\\ x_2 \\\\ \\vdots \\\\ x_n \\end{pmatrix}\n\n% Matrix\n\\mathbf{A} = \\begin{bmatrix}\n  a_{11} & a_{12} & \\cdots & a_{1n} \\\\\n  a_{21} & a_{22} & \\cdots & a_{2n} \\\\\n  \\vdots & \\vdots & \\ddots & \\vdots \\\\\n  a_{m1} & a_{m2} & \\cdots & a_{mn}\n\\end{bmatrix}\n\n% Dot product\n\\mathbf{u} \\cdot \\mathbf{v} = \\mathbf{u}^\\top \\mathbf{v} = \\sum_{i=1}^{n} u_i v_i\n\n% L1, L2, and max norms\n\\|\\mathbf{x}\\|_1 = \\sum_{i=1}^{n} |x_i|, \\quad\n\\|\\mathbf{x}\\|_2 = \\sqrt{\\sum_{i=1}^{n} x_i^2}, \\quad\n\\|\\mathbf{x}\\|_\\infty = \\max_i |x_i|\n\n% Transpose and inverse product rules\n(\\mathbf{AB})^\\top = \\mathbf{B}^\\top \\mathbf{A}^\\top, \\quad\n(\\mathbf{AB})^{-1} = \\mathbf{B}^{-1} \\mathbf{A}^{-1}",
        },
        {
          name: "Gradient Descent",
          extension: "tex",
          category: "LaTeX",
          description: "Update rule, batch/SGD, momentum, and Adam optimizer",
          content:
            "% Standard update rule\n\\theta_{t+1} = \\theta_t - \\eta \\nabla_\\theta \\mathcal{L}(\\theta_t)\n\n% Batch gradient descent\n\\theta := \\theta - \\frac{\\eta}{m} \\sum_{i=1}^{m} \\nabla_\\theta \\mathcal{L}^{(i)}(\\theta)\n\n% SGD with momentum\nv_{t+1} = \\beta v_t + \\eta \\nabla_\\theta \\mathcal{L}(\\theta_t) \\\\\n\\theta_{t+1} = \\theta_t - v_{t+1}\n\n% Adam optimizer\nm_t = \\beta_1 m_{t-1} + (1 - \\beta_1) g_t \\\\\nv_t = \\beta_2 v_{t-1} + (1 - \\beta_2) g_t^2 \\\\\n\\hat{m}_t = \\frac{m_t}{1 - \\beta_1^t}, \\quad\n\\hat{v}_t = \\frac{v_t}{1 - \\beta_2^t} \\\\\n\\theta_{t+1} = \\theta_t - \\frac{\\eta}{\\sqrt{\\hat{v}_t} + \\epsilon}\\,\\hat{m}_t",
        },
        {
          name: "Neural Network Forward Pass",
          extension: "tex",
          category: "LaTeX",
          description:
            "Layer computation, sigmoid, tanh, ReLU, and softmax activations",
          content:
            "% Layer computation\n\\mathbf{z}^{(l)} = \\mathbf{W}^{(l)} \\mathbf{a}^{(l-1)} + \\mathbf{b}^{(l)}\n\\mathbf{a}^{(l)} = f\\!\\left(\\mathbf{z}^{(l)}\\right)\n\n% Sigmoid\n\\sigma(z) = \\frac{1}{1 + e^{-z}}, \\quad\n\\frac{d\\sigma}{dz} = \\sigma(z)\\bigl(1 - \\sigma(z)\\bigr)\n\n% Tanh\n\\tanh(z) = \\frac{e^z - e^{-z}}{e^z + e^{-z}}, \\quad\n\\frac{d\\,\\tanh}{dz} = 1 - \\tanh^2(z)\n\n% ReLU and Leaky ReLU\n\\text{ReLU}(z) = \\max(0, z), \\quad\n\\text{Leaky ReLU}(z) = \\max(\\alpha z, z)\n\n% Softmax (output layer)\n\\text{softmax}(z_i) = \\frac{e^{z_i}}{\\sum_{j=1}^{K} e^{z_j}}",
        },
        {
          name: "Loss Functions",
          extension: "tex",
          category: "LaTeX",
          description:
            "MSE, binary/categorical cross-entropy, Huber, and KL divergence",
          content:
            "% Mean Squared Error (MSE)\n\\mathcal{L}_{\\text{MSE}} = \\frac{1}{m} \\sum_{i=1}^{m}\n  \\bigl(\\hat{y}^{(i)} - y^{(i)}\\bigr)^2\n\n% Binary Cross-Entropy\n\\mathcal{L}_{\\text{BCE}} = -\\frac{1}{m} \\sum_{i=1}^{m}\n  \\Bigl[ y^{(i)} \\log \\hat{y}^{(i)}\n       + (1 - y^{(i)}) \\log(1 - \\hat{y}^{(i)}) \\Bigr]\n\n% Categorical Cross-Entropy\n\\mathcal{L}_{\\text{CE}} = -\\sum_{c=1}^{C} y_c \\log \\hat{y}_c\n\n% Huber Loss\n\\mathcal{L}_\\delta(y,\\hat{y}) =\n\\begin{cases}\n  \\tfrac{1}{2}(y-\\hat{y})^2 & \\text{if } |y-\\hat{y}| \\le \\delta \\\\\n  \\delta|y-\\hat{y}| - \\tfrac{\\delta^2}{2} & \\text{otherwise}\n\\end{cases}\n\n% KL Divergence\nD_{\\text{KL}}(P \\| Q) = \\sum_x P(x)\\log\\frac{P(x)}{Q(x)}",
        },
        {
          name: "Backpropagation",
          extension: "tex",
          category: "LaTeX",
          description:
            "Error signals (deltas), weight/bias gradients, and parameter update",
          content:
            "% Output layer error signal\n\\delta^{(L)} = \\nabla_{\\mathbf{a}^{(L)}} \\mathcal{L}\n               \\odot \\sigma(\\mathbf{z}^{(L)})\n\n% Hidden layer error (backprop step)\n\\delta^{(l)} = \\bigl(\\mathbf{W}^{(l+1)}\\bigr)^\\top \\delta^{(l+1)}\n               \\odot \\sigma(\\mathbf{z}^{(l)})\n\n% Weight gradient\n\\frac{\\partial \\mathcal{L}}{\\partial \\mathbf{W}^{(l)}}\n  = \\delta^{(l)} \\bigl(\\mathbf{a}^{(l-1)}\\bigr)^\\top\n\n% Bias gradient\n\\frac{\\partial \\mathcal{L}}{\\partial \\mathbf{b}^{(l)}} = \\delta^{(l)}\n\n% Parameter update\n\\mathbf{W}^{(l)} \\leftarrow \\mathbf{W}^{(l)}\n  - \\eta \\frac{\\partial \\mathcal{L}}{\\partial \\mathbf{W}^{(l)}}",
        },
        {
          name: "Linear Regression",
          extension: "tex",
          category: "LaTeX",
          description:
            "Hypothesis, cost function, normal equation, Ridge, Lasso, Elastic Net",
          content:
            "% Hypothesis\n\\hat{y} = \\mathbf{w}^\\top \\mathbf{x} + b\n\n% Cost function (MSE)\nJ(\\mathbf{w}, b) = \\frac{1}{2m}\n  \\sum_{i=1}^{m} \\bigl(\\hat{y}^{(i)} - y^{(i)}\\bigr)^2\n\n% Normal equation (closed-form solution)\n\\hat{\\mathbf{w}} =\n  \\bigl(\\mathbf{X}^\\top \\mathbf{X}\\bigr)^{-1} \\mathbf{X}^\\top \\mathbf{y}\n\n% Ridge regression (L2)\nJ(\\mathbf{w}) = \\frac{1}{2m}\\|\\mathbf{X}\\mathbf{w} - \\mathbf{y}\\|_2^2\n              + \\lambda\\|\\mathbf{w}\\|_2^2\n\n% Lasso regression (L1)\nJ(\\mathbf{w}) = \\frac{1}{2m}\\|\\mathbf{X}\\mathbf{w} - \\mathbf{y}\\|_2^2\n              + \\lambda\\|\\mathbf{w}\\|_1\n\n% Elastic Net\nJ(\\mathbf{w}) = \\frac{1}{2m}\\|\\mathbf{X}\\mathbf{w} - \\mathbf{y}\\|_2^2\n              + \\lambda_1\\|\\mathbf{w}\\|_1 + \\frac{\\lambda_2}{2}\\|\\mathbf{w}\\|_2^2",
        },
        {
          name: "Logistic Regression",
          extension: "tex",
          category: "LaTeX",
          description:
            "Sigmoid, predicted probability, log-likelihood, and gradient",
          content:
            "% Sigmoid activation\n\\sigma(z) = \\frac{1}{1 + e^{-z}}, \\quad z = \\mathbf{w}^\\top \\mathbf{x} + b\n\n% Predicted probability\nP(y=1 \\mid \\mathbf{x}; \\mathbf{w}) = \\sigma(\\mathbf{w}^\\top \\mathbf{x} + b)\n\n% Log-likelihood\n\\ell(\\mathbf{w}) = \\sum_{i=1}^{m} \\Bigl[\n  y^{(i)} \\log \\sigma(z^{(i)})\n  + (1 - y^{(i)}) \\log\\bigl(1 - \\sigma(z^{(i)})\\bigr) \\Bigr]\n\n% Cost (negative log-likelihood)\nJ(\\mathbf{w}) = -\\frac{1}{m} \\ell(\\mathbf{w})\n\n% Gradient\n\\nabla_\\mathbf{w} J = \\frac{1}{m}\n  \\mathbf{X}^\\top \\bigl(\\hat{\\mathbf{y}} - \\mathbf{y}\\bigr)",
        },
        {
          name: "Probability & Distributions",
          extension: "tex",
          category: "LaTeX",
          description:
            "Bayes theorem, univariate/multivariate Gaussian, expectation, entropy",
          content:
            "% Bayes Theorem\nP(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}\n\n% Univariate Gaussian\n\\mathcal{N}(x;\\,\\mu,\\sigma^2) =\n  \\frac{1}{\\sqrt{2\\pi\\sigma^2}}\n  \\exp\\!\\left(-\\frac{(x-\\mu)^2}{2\\sigma^2}\\right)\n\n% Multivariate Gaussian\n\\mathcal{N}(\\mathbf{x};\\,\\boldsymbol{\\mu},\\boldsymbol{\\Sigma}) =\n  \\frac{1}{(2\\pi)^{d/2}|\\boldsymbol{\\Sigma}|^{1/2}}\n  \\exp\\!\\left(-\\tfrac{1}{2}\n    (\\mathbf{x}-\\boldsymbol{\\mu})^\\top\n    \\boldsymbol{\\Sigma}^{-1}\n    (\\mathbf{x}-\\boldsymbol{\\mu})\n  \\right)\n\n% Expectation and variance\n\\mathbb{E}[X] = \\int x\\,p(x)\\,dx, \\quad\n\\text{Var}(X) = \\mathbb{E}[X^2] - \\mathbb{E}[X]^2\n\n% Entropy and mutual information\nH(X) = -\\sum_x p(x)\\log p(x), \\quad\nI(X;Y) = H(X) - H(X \\mid Y)",
        },
        {
          name: "SVD & PCA",
          extension: "tex",
          category: "LaTeX",
          description:
            "Singular value decomposition, eigendecomposition, covariance, projection",
          content:
            "% Singular Value Decomposition\n\\mathbf{A} = \\mathbf{U}\\boldsymbol{\\Sigma}\\mathbf{V}^\\top, \\quad\n\\mathbf{U} \\in \\mathbb{R}^{m \\times m},\\;\n\\boldsymbol{\\Sigma} \\in \\mathbb{R}^{m \\times n},\\;\n\\mathbf{V} \\in \\mathbb{R}^{n \\times n}\n\n% Eigendecomposition\n\\mathbf{A}\\mathbf{v} = \\lambda\\mathbf{v}, \\quad\n\\mathbf{A} = \\mathbf{Q}\\boldsymbol{\\Lambda}\\mathbf{Q}^{-1}\n\n% Sample covariance matrix\n\\hat{\\boldsymbol{\\Sigma}} = \\frac{1}{m-1}\n  \\sum_{i=1}^{m} (\\mathbf{x}^{(i)} - \\bar{\\mathbf{x}})\n                 (\\mathbf{x}^{(i)} - \\bar{\\mathbf{x}})^\\top\n\n% PCA projection (top-k eigenvectors)\n\\mathbf{z} = \\mathbf{W}_k^\\top \\mathbf{x}, \\quad\n\\mathbf{W}_k \\in \\mathbb{R}^{d \\times k}\n\n% Explained variance ratio\n\\rho_k = \\frac{\\lambda_k}{\\sum_{j=1}^{d} \\lambda_j}",
        },
        {
          name: "Regularization",
          extension: "tex",
          category: "LaTeX",
          description:
            "L1/L2/Elastic Net penalties, dropout mask, and batch normalization",
          content:
            "% L1 regularization (Lasso - promotes sparsity)\nJ(\\theta) = \\mathcal{L}(\\theta) + \\lambda \\sum_{j=1}^{n} |\\theta_j|\n\n% L2 regularization (Ridge / weight decay)\nJ(\\theta) = \\mathcal{L}(\\theta)\n          + \\frac{\\lambda}{2} \\sum_{j=1}^{n} \\theta_j^2\n\n% Elastic Net (L1 + L2)\nJ(\\theta) = \\mathcal{L}(\\theta)\n          + \\lambda_1 \\|\\boldsymbol{\\theta}\\|_1\n          + \\frac{\\lambda_2}{2} \\|\\boldsymbol{\\theta}\\|_2^2\n\n% Dropout (training - Bernoulli mask)\n\\tilde{\\mathbf{a}}^{(l)} = \\mathbf{m}^{(l)} \\odot \\mathbf{a}^{(l)},\n\\quad m_i \\sim \\text{Bernoulli}(1-p)\n\n% Batch normalization\n\\hat{x}_i = \\frac{x_i - \\mu_B}{\\sqrt{\\sigma_B^2 + \\epsilon}}, \\quad\ny_i = \\gamma \\hat{x}_i + \\beta",
        },
        {
          name: "Attention Mechanism",
          extension: "tex",
          category: "LaTeX",
          description:
            "Scaled dot-product, multi-head attention, and positional encoding",
          content:
            "% Scaled dot-product attention\n\\text{Attention}(\\mathbf{Q}, \\mathbf{K}, \\mathbf{V})\n  = \\text{softmax}\\!\\left(\\frac{\\mathbf{Q}\\mathbf{K}^\\top}{\\sqrt{d_k}}\\right)\\mathbf{V}\n\n% Multi-head attention\n\\text{MultiHead}(\\mathbf{Q}, \\mathbf{K}, \\mathbf{V})\n  = \\text{Concat}(\\text{head}_1, \\ldots, \\text{head}_h)\\,\\mathbf{W}^O\n\\text{head}_i\n  = \\text{Attention}(\\mathbf{Q}\\mathbf{W}_i^Q,\\,\n                     \\mathbf{K}\\mathbf{W}_i^K,\\,\n                     \\mathbf{V}\\mathbf{W}_i^V)\n\n% Sinusoidal positional encoding\n\\text{PE}_{(pos,\\,2i)}   = \\sin\\!\\left(\\frac{pos}{10000^{2i/d}}\\right)\n\\text{PE}_{(pos,\\,2i+1)} = \\cos\\!\\left(\\frac{pos}{10000^{2i/d}}\\right)\n\n% Feed-forward sublayer\n\\text{FFN}(\\mathbf{x})\n  = \\max(0,\\, \\mathbf{x}\\mathbf{W}_1 + \\mathbf{b}_1)\\,\\mathbf{W}_2 + \\mathbf{b}_2",
        },
        {
          name: "K-Means & GMM",
          extension: "tex",
          category: "LaTeX",
          description:
            "K-Means objective, centroid update, and Gaussian Mixture E/M steps",
          content:
            "% K-Means objective (minimize within-cluster variance)\nJ = \\sum_{k=1}^{K} \\sum_{\\mathbf{x} \\in C_k}\n    \\|\\mathbf{x} - \\boldsymbol{\\mu}_k\\|_2^2\n\n% Centroid update\n\\boldsymbol{\\mu}_k = \\frac{1}{|C_k|}\n  \\sum_{\\mathbf{x} \\in C_k} \\mathbf{x}\n\n% GMM E-step (soft assignment)\n\\gamma_{ik} = \\frac{\\pi_k\\,\\mathcal{N}(\\mathbf{x}^{(i)};\\,\n              \\boldsymbol{\\mu}_k, \\boldsymbol{\\Sigma}_k)}\n              {\\displaystyle\\sum_{j=1}^{K} \\pi_j\\,\\mathcal{N}(\\mathbf{x}^{(i)};\\,\n               \\boldsymbol{\\mu}_j, \\boldsymbol{\\Sigma}_j)}\n\n% GMM M-step\nN_k = \\sum_{i=1}^{m} \\gamma_{ik}, \\quad\n\\pi_k = \\frac{N_k}{m}, \\quad\n\\boldsymbol{\\mu}_k = \\frac{1}{N_k}\\sum_{i=1}^{m} \\gamma_{ik}\\mathbf{x}^{(i)}",
        },
      ],
    };

    this.latexPaletteItems = {
      Greek: [
        { label: "α", insert: "\\alpha" },
        { label: "β", insert: "\\beta" },
        { label: "γ", insert: "\\gamma" },
        { label: "δ", insert: "\\delta" },
        { label: "ε", insert: "\\epsilon" },
        { label: "ζ", insert: "\\zeta" },
        { label: "η", insert: "\\eta" },
        { label: "θ", insert: "\\theta" },
        { label: "ι", insert: "\\iota" },
        { label: "κ", insert: "\\kappa" },
        { label: "λ", insert: "\\lambda" },
        { label: "μ", insert: "\\mu" },
        { label: "ν", insert: "\\nu" },
        { label: "ξ", insert: "\\xi" },
        { label: "π", insert: "\\pi" },
        { label: "ρ", insert: "\\rho" },
        { label: "σ", insert: "\\sigma" },
        { label: "τ", insert: "\\tau" },
        { label: "υ", insert: "\\upsilon" },
        { label: "φ", insert: "\\phi" },
        { label: "χ", insert: "\\chi" },
        { label: "ψ", insert: "\\psi" },
        { label: "ω", insert: "\\omega" },
        { label: "Γ", insert: "\\Gamma" },
        { label: "Δ", insert: "\\Delta" },
        { label: "Θ", insert: "\\Theta" },
        { label: "Λ", insert: "\\Lambda" },
        { label: "Ξ", insert: "\\Xi" },
        { label: "Π", insert: "\\Pi" },
        { label: "Σ", insert: "\\Sigma" },
        { label: "Υ", insert: "\\Upsilon" },
        { label: "Φ", insert: "\\Phi" },
        { label: "Ψ", insert: "\\Psi" },
        { label: "Ω", insert: "\\Omega" },
      ],
      Operators: [
        { label: "±", insert: "\\pm" },
        { label: "∓", insert: "\\mp" },
        { label: "×", insert: "\\times" },
        { label: "÷", insert: "\\div" },
        { label: "·", insert: "\\cdot" },
        { label: "∘", insert: "\\circ" },
        { label: "∑", insert: "\\sum" },
        { label: "∏", insert: "\\prod" },
        { label: "∫", insert: "\\int" },
        { label: "∬", insert: "\\iint" },
        { label: "∮", insert: "\\oint" },
        { label: "√", insert: "\\sqrt{}" },
        { label: "a/b", insert: "\\frac{}{}" },
        { label: "∂", insert: "\\partial" },
        { label: "∇", insert: "\\nabla" },
        { label: "∞", insert: "\\infty" },
        { label: "!", insert: "!" },
        { label: "‖", insert: "\\|" },
      ],
      Relations: [
        { label: "=", insert: "=" },
        { label: "≠", insert: "\\neq" },
        { label: "<", insert: "<" },
        { label: ">", insert: ">" },
        { label: "≤", insert: "\\leq" },
        { label: "≥", insert: "\\geq" },
        { label: "≈", insert: "\\approx" },
        { label: "≡", insert: "\\equiv" },
        { label: "∼", insert: "\\sim" },
        { label: "∝", insert: "\\propto" },
        { label: "∈", insert: "\\in" },
        { label: "∉", insert: "\\notin" },
        { label: "⊂", insert: "\\subset" },
        { label: "⊃", insert: "\\supset" },
        { label: "⊆", insert: "\\subseteq" },
        { label: "⊇", insert: "\\supseteq" },
        { label: "∪", insert: "\\cup" },
        { label: "∩", insert: "\\cap" },
        { label: "∅", insert: "\\emptyset" },
        { label: "∀", insert: "\\forall" },
        { label: "∃", insert: "\\exists" },
        { label: "¬", insert: "\\neg" },
        { label: "∧", insert: "\\wedge" },
        { label: "∨", insert: "\\vee" },
      ],
      Structures: [
        { label: "frac", insert: "\\frac{}{}" },
        { label: "sqrt", insert: "\\sqrt{}" },
        { label: "√[n]", insert: "\\sqrt[n]{}" },
        { label: "vec", insert: "\\vec{}" },
        { label: "hat", insert: "\\hat{}" },
        { label: "bar", insert: "\\bar{}" },
        { label: "tilde", insert: "\\tilde{}" },
        { label: "dot", insert: "\\dot{}" },
        { label: "ddot", insert: "\\ddot{}" },
        { label: "x^n", insert: "^{}" },
        { label: "x_n", insert: "_{}" },
        { label: "binom", insert: "\\binom{}{}" },
        { label: "lim", insert: "\\lim_{x \\to }" },
        { label: "sum", insert: "\\sum_{i=0}^{n}" },
        { label: "int", insert: "\\int_{a}^{b}" },
        {
          label: "matrix",
          insert: "\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}",
        },
        {
          label: "cases",
          insert:
            "\\begin{cases}\na & \\text{if } x > 0 \\\\\nb & \\text{otherwise}\n\\end{cases}",
        },
        { label: "text", insert: "\\text{}" },
      ],
      Functions: [
        { label: "\\sin", insert: "\\sin" },
        { label: "\\cos", insert: "\\cos" },
        { label: "\\tan", insert: "\\tan" },
        { label: "\\cot", insert: "\\cot" },
        { label: "\\sec", insert: "\\sec" },
        { label: "\\csc", insert: "\\csc" },
        { label: "\\arcsin", insert: "\\arcsin" },
        { label: "\\arccos", insert: "\\arccos" },
        { label: "\\arctan", insert: "\\arctan" },
        { label: "\\log", insert: "\\log" },
        { label: "\\ln", insert: "\\ln" },
        { label: "\\exp", insert: "\\exp" },
        { label: "\\max", insert: "\\max" },
        { label: "\\min", insert: "\\min" },
        { label: "\\sup", insert: "\\sup" },
        { label: "\\inf", insert: "\\inf" },
        { label: "\\det", insert: "\\det" },
        { label: "\\dim", insert: "\\dim" },
        { label: "\\gcd", insert: "\\gcd" },
        { label: "\\mod", insert: "\\bmod" },
      ],
      Arrows: [
        { label: "→", insert: "\\to" },
        { label: "←", insert: "\\leftarrow" },
        { label: "↔", insert: "\\leftrightarrow" },
        { label: "⇒", insert: "\\Rightarrow" },
        { label: "⇐", insert: "\\Leftarrow" },
        { label: "⇔", insert: "\\Leftrightarrow" },
        { label: "↑", insert: "\\uparrow" },
        { label: "↓", insert: "\\downarrow" },
        { label: "↦", insert: "\\mapsto" },
        { label: "⟶", insert: "\\longrightarrow" },
        { label: "⟹", insert: "\\Longrightarrow" },
        { label: "⟺", insert: "\\Longleftrightarrow" },
        { label: "↗", insert: "\\nearrow" },
        { label: "↘", insert: "\\searrow" },
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
      const palette = document.getElementById("latexPalette");
      if (
        palette.style.display !== "none" &&
        !e.target.closest("#latexPaletteWrapper")
      ) {
        palette.style.display = "none";
      }
      this.closeSnippetActionsMenu(e.target.closest(".snippet-actions-overflow"));
    });

    // Snippet viewer overflow menu (Share / History)
    document.getElementById("moreActionsBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const expanded =
        document.getElementById("moreActionsBtn").getAttribute("aria-expanded") ===
        "true";
      if (expanded) {
        this.closeSnippetActionsMenu();
      } else {
        this.openSnippetActionsMenu();
      }
    });
    document.getElementById("snippetActionsMenu").addEventListener("click", (e) => {
      if (e.target.closest(".snippet-actions-menu-item")) {
        this.closeSnippetActionsMenu();
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
    document
      .getElementById("snippetTypeSelect")
      .addEventListener("change", (e) => {
        if (!this.editingSnippet) {
          document.getElementById("snippetExtSelect").value =
            this.getMostUsedExtension(e.target.value);
        }
        this.updateMdToolbarVisibility();
      });

    document
      .getElementById("snippetExtSelect")
      .addEventListener("change", () => {
        this.updateMdToolbarVisibility();
      });

    // MD toolbar button delegation
    document.getElementById("mdToolbar").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-md-action]");
      if (!btn || btn.id === "latexPaletteBtn") return;
      this.handleMdToolbarAction(btn.dataset.mdAction);
    });

    // LaTeX palette toggle
    document
      .getElementById("latexPaletteBtn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        const palette = document.getElementById("latexPalette");
        if (palette.style.display !== "none") {
          palette.style.display = "none";
          return;
        }
        // Position fixed below the button
        const rect = e.currentTarget.getBoundingClientRect();
        palette.style.display = "block";
        const pw = palette.offsetWidth;
        let left = rect.right - pw;
        let top = rect.bottom + 6;
        if (left < 8) left = 8;
        if (top + palette.offsetHeight > window.innerHeight - 8) {
          top = rect.top - palette.offsetHeight - 6;
        }
        palette.style.left = left + "px";
        palette.style.top = top + "px";
      });

    // Palette tab delegation
    document
      .getElementById("latexPaletteTabs")
      .addEventListener("click", (e) => {
        const tab = e.target.closest("[data-palette-tab]");
        if (!tab) return;
        document
          .querySelectorAll(".md-palette-tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.renderLatexPaletteTab(tab.dataset.paletteTab);
      });

    // Palette item delegation
    document
      .getElementById("latexPaletteGrid")
      .addEventListener("click", (e) => {
        const btn = e.target.closest("[data-latex-insert]");
        if (!btn) return;
        this.insertLatexSymbol(btn.dataset.latexInsert);
      });

    // Build palette content once
    this.buildLatexPalette();

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
        this.closeVariableModal();
      }
    });

    // Variable modal: Enter key submits
    document
      .getElementById("variableFields")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submitVariableModal();
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
      const actionsMenu = document.getElementById("snippetActionsMenu");
      if (actionsMenu.classList.contains("show")) {
        this.closeSnippetActionsMenu();
        document.getElementById("moreActionsBtn").focus();
        return;
      }
      if (anyModalOpen) {
        this.closeModal();
        this.closeCategoryModal();
        this.closeDeleteModal();
        this.closeMergeModal();
        this.closeShareModal();
        this.closeSharedSnippetModal();
        this.closeHistoryModal();
        this.closeTemplatesModal();
        this.closeVariableModal();
      } else if (this.currentSnippet) {
        this.currentSnippet = null;
        document.getElementById("snippetView").style.display = "none";
        document.getElementById("emptyState").style.display = "flex";
        this.renderSnippetsList();
      }
      return;
    }

    // Ctrl+S — save snippet modal if open
    if (e.ctrlKey && e.key.toLowerCase() === "s") {
      const modal = document.getElementById("snippetModal");
      if (modal && modal.style.display === "flex") {
        e.preventDefault();
        this.saveSnippet();
        return;
      }
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

  // ─── Modal Accessibility (focus trap + focus return) ───────

  _getFocusableElements(container) {
    const selector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector)).filter(
      (el) => el.offsetParent !== null,
    );
  }

  trapModalFocus(modal) {
    this._modalReturnFocus = document.activeElement;

    const handler = (e) => {
      if (e.key !== "Tab") return;
      const focusable = this._getFocusableElements(modal);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    modal._focusTrapHandler = handler;
    modal.addEventListener("keydown", handler);
  }

  releaseModalFocus(modal) {
    if (modal._focusTrapHandler) {
      modal.removeEventListener("keydown", modal._focusTrapHandler);
      modal._focusTrapHandler = null;
    }
    if (
      this._modalReturnFocus &&
      typeof this._modalReturnFocus.focus === "function"
    ) {
      this._modalReturnFocus.focus();
    }
    this._modalReturnFocus = null;
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

  renderTagsView(snippet) {
    const tagsEl = document.getElementById("snippetTags");
    const tags = snippet.tags || [];

    tagsEl.innerHTML =
      tags
        .map(
          (t) =>
            `<span class="snippet-tag-badge" data-tag="${this.escapeHtml(t)}">${this.escapeHtml(t)}<span class="tag-badge-remove" title="Remove tag">&times;</span></span>`,
        )
        .join("") +
      `<span class="tag-inline-add"><span class="tag-add-btn" title="Add tag"><i class="fa-solid fa-plus"></i> add tag</span><input type="text" class="tag-inline-input" placeholder="tag name…" style="display:none" /></span>`;

    // Click tag text to filter
    tagsEl.querySelectorAll(".snippet-tag-badge").forEach((badge) => {
      badge.addEventListener("click", (e) => {
        if (e.target.classList.contains("tag-badge-remove")) return;
        const tag = badge.getAttribute("data-tag");
        document.getElementById("searchInput").value = tag;
        this.searchQuery = tag.toLowerCase();
        this.renderSnippetsList();
      });
    });

    // Remove tag
    tagsEl.querySelectorAll(".tag-badge-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tag = btn.closest(".snippet-tag-badge").getAttribute("data-tag");
        const newTags = (this.currentSnippet.tags || []).filter(
          (t) => t !== tag,
        );
        this.saveTagsInline(newTags);
      });
    });

    // Inline add tag
    const addBtn = tagsEl.querySelector(".tag-add-btn");
    const input = tagsEl.querySelector(".tag-inline-input");

    const commitTag = () => {
      const val = input.value.trim().toLowerCase().replace(/,/g, "");
      if (val) {
        const current = this.currentSnippet.tags || [];
        if (!current.includes(val)) {
          this.saveTagsInline([...current, val]);
          return;
        }
      }
      input.value = "";
      input.style.display = "none";
      addBtn.style.display = "";
    };

    addBtn.addEventListener("click", () => {
      addBtn.style.display = "none";
      input.style.display = "";
      input.focus();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commitTag();
      } else if (e.key === "Escape") {
        input.value = "";
        input.style.display = "none";
        addBtn.style.display = "";
      }
    });

    input.addEventListener("blur", commitTag);
  }

  async saveTagsInline(tags) {
    if (!this.currentSnippet) return;
    this.currentSnippet.tags = tags;
    this.currentSnippet.updatedAt = Date.now();
    await StorageManager.put("snippets", this.currentSnippet);
    this._syncSnippet(this.currentSnippet);
    this.renderTagsView(this.currentSnippet);
    this.renderSnippetsList();
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

  openSnippetActionsMenu() {
    document.getElementById("snippetActionsMenu").classList.add("show");
    document
      .getElementById("moreActionsBtn")
      .setAttribute("aria-expanded", "true");
  }

  closeSnippetActionsMenu(skipIfInside) {
    if (skipIfInside) return;
    document.getElementById("snippetActionsMenu").classList.remove("show");
    document
      .getElementById("moreActionsBtn")
      .setAttribute("aria-expanded", "false");
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
    allItem.tabIndex = 0;
    allItem.setAttribute("role", "button");
    allItem.setAttribute(
      "aria-label",
      `All, ${this.snippets.length} snippet${this.snippets.length === 1 ? "" : "s"}${this.activeCategory === null ? ", selected" : ""}`,
    );
    allItem.innerHTML = `
            <span class="category-name"><i class="fa-solid fa-layer-group"></i> All</span>
            <span class="category-count">${this.snippets.length}</span>
        `;
    allItem.addEventListener("click", () => this.selectCategory(null));
    allItem.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.selectCategory(null);
      }
    });
    list.appendChild(allItem);

    // Add user categories
    [...this.types]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((type) => {
        const count = this.snippets.filter((s) => s.type === type.name).length;
        const item = document.createElement("li");
        item.className = `category-item${this.activeCategory === type.name ? " active" : ""}`;
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.setAttribute(
          "aria-label",
          `${type.name}, ${count} snippet${count === 1 ? "" : "s"}${this.activeCategory === type.name ? ", selected" : ""}`,
        );
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
        item
          .querySelector(".category-action-btn:not(.delete)")
          .setAttribute("aria-label", `Edit category ${type.name}`);
        item
          .querySelector(".category-action-btn.delete")
          .setAttribute("aria-label", `Delete category ${type.name}`);
        item.addEventListener("click", () => this.selectCategory(type.name));
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.selectCategory(type.name);
          }
        });
        list.appendChild(item);
      });

    this.updateTypeSelect();
  }

  selectCategory(categoryName) {
    this.activeCategory = categoryName;
    this.activeExtFilter = null;
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
    this.trapModalFocus(modal);
    input.focus();
  }

  openEditCategoryModal(id) {
    this.openCategoryModal(id);
  }

  closeCategoryModal() {
    const modal = document.getElementById("categoryModal");
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
    this.editingCategory = null;
  }

  async saveCategory() {
    const input = document.getElementById("categoryNameInput");
    const name = input.value.trim();

    if (!name) {
      this.showNotification("Please enter a category name", "error");
      input.focus();
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
      this.showNotification("Failed to save category. Please try again.", "error");
    }
  }

  // Snippets List
  renderSnippetsList() {
    // Rebuilding below destroys any hovered/focused item without firing
    // mouseleave/blur — dismiss any pending or visible code preview first
    // so it can't get orphaned open or pop back up after the rebuild.
    clearTimeout(this._templatePreviewTimer);
    clearTimeout(this._templateHideTimer);
    this.hideTemplatePreview();

    const list = document.getElementById("snippetsList");
    list.innerHTML = "";

    let filtered = this.snippets;

    // Filter by category
    if (this.activeCategory) {
      filtered = filtered.filter((s) => s.type === this.activeCategory);
    }

    // Render extension filter chips based on category-filtered set
    this.renderExtFilterChips(filtered);

    // Filter by extension chip
    if (this.activeExtFilter) {
      filtered = filtered.filter((s) => s.extension === this.activeExtFilter);
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
      const copyCount = snippet.copyCount || 0;

      const copyBadgeHtml =
        copyCount > 0
          ? `<span class="snippet-copy-badge" title="${copyCount} cop${copyCount !== 1 ? "ies" : "y"}">${copyCount}</span>`
          : "";

      let headerHtml;
      if (isFav) {
        headerHtml = `
                    <div class="snippet-item-header">
                        <span class="snippet-item-star"><i class="fa-solid fa-star"></i></span>
                        <div class="snippet-item-name">${this.escapeHtml(snippet.name)}</div>
                        ${copyBadgeHtml}
                        <div class="snippet-item-actions">
                            <button class="snippet-quick-copy" title="Quick copy" data-id="${snippet.id}"><i class="fa-regular fa-copy"></i></button>
                        </div>
                    </div>`;
      } else {
        headerHtml = `
                    <div class="snippet-item-header">
                        <div class="snippet-item-name">${this.escapeHtml(snippet.name)}</div>
                        ${copyBadgeHtml}
                        <div class="snippet-item-actions">
                            <button class="snippet-quick-copy" title="Quick copy" data-id="${snippet.id}"><i class="fa-regular fa-copy"></i></button>
                        </div>
                    </div>`;
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
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute(
        "aria-label",
        `${snippet.name}, ${snippet.type}${item.classList.contains("active") ? ", selected" : ""}`,
      );
      item.addEventListener("click", () => this.viewSnippet(snippet.id));
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.viewSnippet(snippet.id);
        }
      });

      // Quick-copy button — stop propagation so it doesn't open the snippet
      const qcBtn = item.querySelector(".snippet-quick-copy");
      qcBtn.setAttribute("aria-label", `Quick copy ${snippet.name}`);
      qcBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.quickCopySnippet(snippet, qcBtn);
      });

      // Hover/focus code preview — skip the already-selected item, its
      // content is already shown in the detail panel
      item.addEventListener("mouseenter", () => {
        if (item.classList.contains("active")) return;
        clearTimeout(this._templateHideTimer);
        this._templatePreviewTimer = setTimeout(() => {
          this.showCodePreview(
            snippet.name,
            snippet.extension,
            snippet.content,
            item,
          );
        }, 300);
      });
      item.addEventListener("mouseleave", () => {
        clearTimeout(this._templatePreviewTimer);
        this._templateHideTimer = setTimeout(
          () => this.hideTemplatePreview(),
          150,
        );
      });
      item.addEventListener("focus", () => {
        if (item.classList.contains("active")) return;
        clearTimeout(this._templateHideTimer);
        this.showCodePreview(
          snippet.name,
          snippet.extension,
          snippet.content,
          item,
        );
      });
      item.addEventListener("blur", () => {
        clearTimeout(this._templatePreviewTimer);
        this._templateHideTimer = setTimeout(
          () => this.hideTemplatePreview(),
          150,
        );
      });

      list.appendChild(item);
    });

    this.updateSnippetsCount();
  }

  renderExtFilterChips(categoryFilteredSnippets) {
    const container = document.getElementById("extFilterChips");
    // Collect unique extensions present in the category-filtered set
    const exts = [
      ...new Set(categoryFilteredSnippets.map((s) => s.extension)),
    ].sort();

    if (exts.length <= 1) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = exts
      .map(
        (ext) =>
          `<button class="ext-chip${this.activeExtFilter === ext ? " active" : ""}" data-ext="${this.escapeHtml(ext)}">.${this.escapeHtml(ext)}</button>`,
      )
      .join("");

    container.querySelectorAll(".ext-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const ext = chip.getAttribute("data-ext");
        this.activeExtFilter = this.activeExtFilter === ext ? null : ext;
        this.renderSnippetsList();
      });
    });
  }

  quickCopySnippet(snippet, btn) {
    const doCopy = (text) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          this.showNotification();
          btn.classList.add("copied");
          btn.innerHTML = '<i class="fa-solid fa-check"></i>';
          setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
          }, 1500);
          this.trackCopyForSnippet(snippet);
        })
        .catch(() => {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          this.showNotification();
          this.trackCopyForSnippet(snippet);
        });
    };

    const vars = this.extractVariables(snippet.content);
    if (vars.length > 0) {
      this.openVariableModal(snippet.content, doCopy);
    } else {
      doCopy(snippet.content);
    }
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
    this.closeSnippetActionsMenu();

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
    this.renderTagsView(snippet);

    // Notes
    const notesEl = document.getElementById("snippetNotes");
    if (snippet.notes) {
      notesEl.innerHTML = `<strong>Notes:</strong> ${this.escapeHtml(snippet.notes)}`;
    } else {
      notesEl.textContent = "";
    }

    // Code rendering — markdown gets a live preview, everything else gets syntax highlighting
    const codeContainer = document.getElementById("snippetCodeContainer");
    const mdPreview = document.getElementById("markdownPreview");

    if (snippet.extension === "md") {
      codeContainer.style.display = "none";
      mdPreview.style.display = "block";
      this.renderMarkdownPreview(snippet.content, mdPreview);
    } else {
      codeContainer.style.display = "";
      mdPreview.style.display = "none";
      const codeElement = document.getElementById("snippetCode");
      codeElement.textContent = snippet.content;
      codeElement.className = "";
      codeElement.removeAttribute("data-highlighted");
      const language =
        this.extensionToLanguage[snippet.extension] || "plaintext";
      codeElement.classList.add(`language-${language}`);
      hljs.highlightElement(codeElement);
      this.addLineNumbers(codeElement);
    }

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
      const today = snippet.copiesToday
        ? ` · ${snippet.copiesToday}× today`
        : "";
      copyCountEl.textContent = `Copied: ${copyCount} time${copyCount !== 1 ? "s" : ""}${lastCopied}${today}`;
    } else {
      copyCountEl.textContent = "";
    }

    this.renderSnippetsList();
  }

  // ── MD Toolbar ──────────────────────────────────────────────────────────

  updateMdToolbarVisibility() {
    const ext = document.getElementById("snippetExtSelect").value;
    const toolbar = document.getElementById("mdToolbar");
    const textarea = document.getElementById("snippetContentInput");
    if (ext === "md") {
      toolbar.style.display = "flex";
      textarea.classList.add("with-md-toolbar");
    } else {
      toolbar.style.display = "none";
      textarea.classList.remove("with-md-toolbar");
      document.getElementById("latexPalette").style.display = "none";
    }
  }

  // Insert before/after selection (or placeholder text when nothing selected)
  insertMdSyntax(before, after, placeholder = "") {
    const ta = document.getElementById("snippetContentInput");
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const text = selected || placeholder;
    const replacement = before + text + after;
    ta.value =
      ta.value.substring(0, start) + replacement + ta.value.substring(end);
    // Select placeholder text (or keep selection wrapped)
    ta.setSelectionRange(
      start + before.length,
      start + before.length + text.length,
    );
    ta.focus();
  }

  // Insert text at cursor, no wrapping
  insertAtCursor(text) {
    const ta = document.getElementById("snippetContentInput");
    const start = ta.selectionStart;
    ta.value =
      ta.value.substring(0, start) + text + ta.value.substring(ta.selectionEnd);
    ta.setSelectionRange(start + text.length, start + text.length);
    ta.focus();
  }

  // Prefix each selected line (headings, lists, blockquotes)
  insertLinePrefix(prefix) {
    const ta = document.getElementById("snippetContentInput");
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    const lineEndIdx = val.indexOf("\n", end);
    const selEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
    const lines = val.substring(lineStart, selEnd).split("\n");
    const newText = lines.map((l) => prefix + l).join("\n");
    ta.value = val.substring(0, lineStart) + newText + val.substring(selEnd);
    ta.setSelectionRange(lineStart, lineStart + newText.length);
    ta.focus();
  }

  // Insert a LaTeX symbol/command; places cursor inside first {} if present
  insertLatexSymbol(insertText) {
    const ta = document.getElementById("snippetContentInput");
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    // If text is selected and the command has {}, wrap selection in first {}
    let finalText =
      selected && insertText.includes("{}")
        ? insertText.replace("{}", "{" + selected + "}")
        : insertText;
    ta.value =
      ta.value.substring(0, start) + finalText + ta.value.substring(end);
    const braceIdx = finalText.indexOf("{}");
    if (braceIdx !== -1 && !selected) {
      ta.setSelectionRange(start + braceIdx + 1, start + braceIdx + 1);
    } else {
      ta.setSelectionRange(start + finalText.length, start + finalText.length);
    }
    ta.focus();
    document.getElementById("latexPalette").style.display = "none";
  }

  handleMdToolbarAction(action) {
    switch (action) {
      case "bold":
        this.insertMdSyntax("**", "**", "text");
        break;
      case "italic":
        this.insertMdSyntax("*", "*", "text");
        break;
      case "strikethrough":
        this.insertMdSyntax("~~", "~~", "text");
        break;
      case "inline-code":
        this.insertMdSyntax("`", "`", "code");
        break;
      case "h1":
        this.insertLinePrefix("# ");
        break;
      case "h2":
        this.insertLinePrefix("## ");
        break;
      case "h3":
        this.insertLinePrefix("### ");
        break;
      case "ul":
        this.insertLinePrefix("- ");
        break;
      case "ol":
        this.insertLinePrefix("1. ");
        break;
      case "blockquote":
        this.insertLinePrefix("> ");
        break;
      case "code-block":
        this.insertMdSyntax("\n```\n", "\n```\n", "code");
        break;
      case "link":
        this.insertMdSyntax("[", "](url)", "text");
        break;
      case "image":
        this.insertMdSyntax("![", "](url)", "alt text");
        break;
      case "table":
        this.insertAtCursor(
          "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n",
        );
        break;
      case "hr":
        this.insertAtCursor("\n\n---\n\n");
        break;
      case "latex-inline":
        this.insertMdSyntax("$", "$", "expression");
        break;
      case "latex-display":
        this.insertMdSyntax("\n$$\n", "\n$$\n", "expression");
        break;
    }
  }

  buildLatexPalette() {
    const tabs = document.getElementById("latexPaletteTabs");
    const tabNames = Object.keys(this.latexPaletteItems);
    tabs.innerHTML = tabNames
      .map(
        (name, i) =>
          `<button type="button" class="md-palette-tab${i === 0 ? " active" : ""}" data-palette-tab="${name}">${name}</button>`,
      )
      .join("");
    this.renderLatexPaletteTab(tabNames[0]);
  }

  renderLatexPaletteTab(tabName) {
    const grid = document.getElementById("latexPaletteGrid");
    const items = this.latexPaletteItems[tabName];
    grid.innerHTML = items
      .map(
        (item) =>
          `<button type="button" class="md-palette-item" data-latex-insert="${this.escapeHtml(item.insert)}" title="${this.escapeHtml(item.insert)}">${this.escapeHtml(item.label)}</button>`,
      )
      .join("");
  }

  renderMarkdownPreview(content, container) {
    container.innerHTML = marked.parse(content);

    // Syntax-highlight fenced code blocks inside the markdown
    container.querySelectorAll("pre code").forEach((block) => {
      block.removeAttribute("data-highlighted");
      hljs.highlightElement(block);
    });

    // Render LaTeX ($...$ and $$...$$)
    if (window.renderMathInElement) {
      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
      });
    }
  }

  // Snippet Modal (Create/Edit)
  getMostUsedExtension(category) {
    const categorySnippets = category
      ? this.snippets.filter((s) => s.type === category)
      : this.snippets;
    if (categorySnippets.length === 0) return "js";
    const counts = {};
    for (const s of categorySnippets) {
      counts[s.extension] = (counts[s.extension] || 0) + 1;
    }
    let best = "js",
      max = 0;
    for (const [ext, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        best = ext;
      }
    }
    return best;
  }

  openNewSnippetModal() {
    this.editingSnippet = null;
    document.getElementById("saveSnippetBtn").textContent = "Save Snippet";
    document.getElementById("snippetNameInput").value = "";
    document.getElementById("snippetDescInput").value = "";
    document.getElementById("snippetContentInput").value = "";
    document.getElementById("snippetNotesInput").value = "";
    const category = this.activeCategory || this.types[0]?.name || "";
    document.getElementById("snippetTypeSelect").value = category;
    document.getElementById("snippetExtSelect").value =
      this.getMostUsedExtension(category);
    this.clearTagChips();
    this.updateMdToolbarVisibility();
    const modal = document.getElementById("snippetModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);
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
    this.updateMdToolbarVisibility();
    const modal = document.getElementById("snippetModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);
    document.getElementById("snippetNameInput").focus();
  }

  closeModal() {
    const modal = document.getElementById("snippetModal");
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
    this.editingSnippet = null;
    if (this._openedFromTemplate) {
      this._openedFromTemplate = false;
      setTimeout(() => {
        this.renderTemplatesTabs();
        this.renderTemplatesGrid();
        const templatesModal = document.getElementById("templatesModal");
        templatesModal.style.display = "flex";
        this.trapModalFocus(templatesModal);
      }, 0);
    }
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
      this.showNotification("Please enter a snippet name", "error");
      document.getElementById("snippetNameInput").focus();
      return;
    }

    if (!content) {
      this.showNotification("Please enter snippet content", "error");
      document.getElementById("snippetContentInput").focus();
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

      this._openedFromTemplate = false;
      this.closeModal();
      this.renderCategories();
      this.renderSnippetsList();

      if (this.currentSnippet) {
        this.viewSnippet(this.currentSnippet.id);
      }
    } catch (error) {
      console.error("Failed to save snippet:", error);
      this.showNotification("Failed to save snippet. Please try again.", "error");
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

    const modal = document.getElementById("deleteModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);
  }

  closeDeleteModal() {
    const modal = document.getElementById("deleteModal");
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
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
      this.showNotification("Failed to delete. Please try again.", "error");
    }
  }

  // Copy to Clipboard (with usage tracking)
  copyToClipboard() {
    if (!this.currentSnippet) return;

    const doCopy = (text) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          this.showNotification();
          this.trackCopy();
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
          const textarea = document.createElement("textarea");
          textarea.value = text;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          this.showNotification();
          this.trackCopy();
        });
    };

    const vars = this.extractVariables(this.currentSnippet.content);
    if (vars.length > 0) {
      this.openVariableModal(this.currentSnippet.content, doCopy);
    } else {
      doCopy(this.currentSnippet.content);
    }
  }

  async trackCopy() {
    if (!this.currentSnippet) return;
    await this.trackCopyForSnippet(this.currentSnippet);

    const codeContainer = document.getElementById("snippetCodeContainer");
    const mdPreview = document.getElementById("markdownPreview");
    this.pulseCopyFeedback(
      mdPreview.style.display !== "none" ? mdPreview : codeContainer,
    );

    // Update the detail-view copy count display
    const copyCount = this.currentSnippet.copyCount;
    const copyCountEl = document.getElementById("snippetCopyCount");
    const lastCopied = this.currentSnippet.lastCopiedAt
      ? ` | Last: ${this.formatDate(this.currentSnippet.lastCopiedAt)}`
      : "";
    const today = this.currentSnippet.copiesToday
      ? ` · ${this.currentSnippet.copiesToday}× today`
      : "";
    copyCountEl.textContent = `Copied: ${copyCount} time${copyCount !== 1 ? "s" : ""}${lastCopied}${today}`;
  }

  pulseCopyFeedback(el) {
    if (!el) return;
    el.classList.remove("copy-pulse");
    void el.offsetWidth; // restart the animation if it's already mid-flight
    el.classList.add("copy-pulse");
    el.addEventListener(
      "animationend",
      () => el.classList.remove("copy-pulse"),
      { once: true },
    );
  }

  async trackCopyForSnippet(snippet) {
    // Update copyCount and lastCopiedAt WITHOUT touching updatedAt
    const todayStr = new Date().toISOString().slice(0, 10);
    snippet.copyCount = (snippet.copyCount || 0) + 1;
    snippet.lastCopiedAt = new Date().toISOString();
    snippet.copiesToday =
      snippet.lastCopyDate === todayStr ? (snippet.copiesToday || 0) + 1 : 1;
    snippet.lastCopyDate = todayStr;
    await StorageManager.put("snippets", snippet);
    this._syncSnippet(snippet);

    // A full re-render is only needed when the active sort depends on copy
    // stats (it would otherwise reorder the list); everywhere else, update
    // this item's badge in place so its checkmark/pulse feedback isn't cut
    // short by the list being torn down mid-animation.
    if (
      this.sortPreference === "most-used" ||
      this.sortPreference === "recent-copy"
    ) {
      this.renderSnippetsList();
    } else {
      this.updateSnippetCopyBadge(snippet);
    }

    const freshBtn = document.querySelector(
      `.snippet-quick-copy[data-id="${snippet.id}"]`,
    );
    if (freshBtn) this.pulseCopyFeedback(freshBtn.closest(".snippet-item"));
  }

  updateSnippetCopyBadge(snippet) {
    const btn = document.querySelector(
      `.snippet-quick-copy[data-id="${snippet.id}"]`,
    );
    const item = btn ? btn.closest(".snippet-item") : null;
    if (!item) return;

    const header = item.querySelector(".snippet-item-header");
    const actions = header.querySelector(".snippet-item-actions");
    let badge = header.querySelector(".snippet-copy-badge");
    const copyCount = snippet.copyCount || 0;

    if (copyCount > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "snippet-copy-badge";
        header.insertBefore(badge, actions);
      }
      badge.title = `${copyCount} cop${copyCount !== 1 ? "ies" : "y"}`;
      badge.textContent = copyCount;
    } else if (badge) {
      badge.remove();
    }
  }

  // ── Snippet Variables ───────────────────────────────────────────────────

  extractVariables(content) {
    const matches = content.matchAll(/\{\{(\w+)\}\}/g);
    const seen = new Set();
    const vars = [];
    for (const m of matches) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        vars.push(m[1]);
      }
    }
    return vars;
  }

  openVariableModal(content, callback) {
    const vars = this.extractVariables(content);
    if (vars.length === 0) {
      callback(content);
      return;
    }

    this._variableCallback = (values) => {
      let result = content;
      for (const [name, val] of Object.entries(values)) {
        result = result.replaceAll(`{{${name}}}`, val);
      }
      callback(result);
    };

    const fieldsEl = document.getElementById("variableFields");
    fieldsEl.innerHTML = vars
      .map(
        (v) => `
        <div class="variable-field">
            <label for="varInput_${v}">{{${v}}}</label>
            <input class="edit-input" id="varInput_${v}" data-var="${v}" placeholder="Value for ${v}" autocomplete="off" />
        </div>`,
      )
      .join("");

    const modal = document.getElementById("variableModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);

    // Focus first input
    const first = fieldsEl.querySelector("input");
    if (first) setTimeout(() => first.focus(), 50);
  }

  submitVariableModal() {
    const inputs = document.querySelectorAll("#variableFields [data-var]");
    const values = {};
    inputs.forEach((input) => {
      values[input.getAttribute("data-var")] = input.value;
    });
    const callback = this._variableCallback;
    this._variableCallback = null;
    this.closeVariableModal();
    if (callback) {
      callback(values);
    }
  }

  closeVariableModal() {
    const modal = document.getElementById("variableModal");
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
    this._variableCallback = null;
  }

  showNotification(message, type = "success") {
    const notification = document.getElementById("copyNotification");
    const icon = type === "error" ? "fa-circle-exclamation" : "fa-check";
    notification.innerHTML = `<i class="fa-solid ${icon}"></i> ${message || "Copied to clipboard"}`;
    notification.classList.toggle("error", type === "error");
    notification.classList.add("show");
    setTimeout(
      () => {
        notification.classList.remove("show");
      },
      type === "error" ? 3500 : 2000,
    );
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
    this.historyViewMode = "code";
    document.getElementById("historyCodeBtn").classList.add("active");
    document.getElementById("historyDiffBtn").classList.remove("active");
    document.getElementById("historyPreviewEmpty").style.display = "flex";
    document.getElementById("historyPreview").style.display = "none";

    const versions = await StorageManager.getAllByIndex(
      "snippetVersions",
      "snippetId",
      this.currentSnippet.id,
    );
    this.renderHistoryList(versions);
    const modal = document.getElementById("historyModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);
  }

  closeHistoryModal() {
    const modal = document.getElementById("historyModal");
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
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

    this._renderHistoryCurrentMode();
  }

  _renderHistoryCurrentMode() {
    const version = this.selectedVersion;
    if (!version) return;

    if (this.historyViewMode === "diff") {
      this._showHistoryDiff(version);
    } else {
      this._showHistoryCode(version);
    }
  }

  _showHistoryCode(version) {
    document.getElementById("historyCodeContainer").style.display = "";
    document.getElementById("historyDiffContainer").style.display = "none";

    const codeEl = document.getElementById("historyPreviewCode");
    codeEl.textContent = version.content;
    codeEl.className = "";
    codeEl.removeAttribute("data-highlighted");

    if (this.currentSnippet) {
      const language =
        this.extensionToLanguage[this.currentSnippet.extension] || "plaintext";
      codeEl.classList.add(`language-${language}`);
    }
    hljs.highlightElement(codeEl);
  }

  _showHistoryDiff(version) {
    document.getElementById("historyCodeContainer").style.display = "none";
    document.getElementById("historyDiffContainer").style.display = "";

    const oldLines = version.content.split("\n");
    const newLines = this.currentSnippet
      ? this.currentSnippet.content.split("\n")
      : [];
    const ops = this.computeDiff(oldLines, newLines);

    const diffEl = document.getElementById("historyDiffView");

    if (ops.every((op) => op.type === "equal")) {
      diffEl.innerHTML =
        '<div class="diff-no-changes">No differences — content is identical to current version.</div>';
      return;
    }

    diffEl.innerHTML = ops
      .map((op) => {
        const glyph =
          op.type === "added" ? "+" : op.type === "removed" ? "−" : " ";
        const cls =
          op.type === "added"
            ? "diff-line diff-line-added"
            : op.type === "removed"
              ? "diff-line diff-line-removed"
              : "diff-line diff-line-equal";
        return `<div class="${cls}"><span class="diff-gutter">${glyph}</span>${this.escapeHtml(op.line)}</div>`;
      })
      .join("");
  }

  setHistoryViewMode(mode) {
    this.historyViewMode = mode;
    document
      .getElementById("historyCodeBtn")
      .classList.toggle("active", mode === "code");
    document
      .getElementById("historyDiffBtn")
      .classList.toggle("active", mode === "diff");
    this._renderHistoryCurrentMode();
  }

  computeDiff(oldLines, newLines) {
    const m = oldLines.length;
    const n = newLines.length;
    // DP LCS table
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    // Backtrack
    const ops = [];
    let i = m,
      j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        ops.unshift({ type: "equal", line: oldLines[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.unshift({ type: "added", line: newLines[j - 1] });
        j--;
      } else {
        ops.unshift({ type: "removed", line: oldLines[i - 1] });
        i--;
      }
    }
    return ops;
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
    const modal = document.getElementById("templatesModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);
  }

  closeTemplatesModal() {
    const modal = document.getElementById("templatesModal");
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
    this.hideTemplatePreview();
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
      card.addEventListener("mouseenter", () => {
        clearTimeout(this._templateHideTimer);
        const index = parseInt(card.dataset.index);
        this._templatePreviewTimer = setTimeout(() => {
          this.showTemplatePreview(templates[index], card);
        }, 120);
      });
      card.addEventListener("mouseleave", () => {
        clearTimeout(this._templatePreviewTimer);
        this._templateHideTimer = setTimeout(
          () => this.hideTemplatePreview(),
          150,
        );
      });
    });
  }

  showTemplatePreview(template, cardEl) {
    this.showCodePreview(
      template.name,
      template.extension,
      template.content,
      cardEl,
    );
  }

  showCodePreview(name, extension, content, anchorEl) {
    let panel = document.getElementById("templateCodePreview");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "templateCodePreview";
      panel.className = "template-code-preview";
      panel.addEventListener("mouseenter", () =>
        clearTimeout(this._templateHideTimer),
      );
      panel.addEventListener("mouseleave", () => {
        this._templateHideTimer = setTimeout(
          () => this.hideTemplatePreview(),
          150,
        );
      });
      document.body.appendChild(panel);
    }

    panel.innerHTML = `<div class="tcp-header"><span>${this.escapeHtml(name)}</span><span class="tcp-ext">.${extension}</span></div>`;

    if (extension === "tex" && typeof katex !== "undefined") {
      const container = document.createElement("div");
      container.className = "tcp-latex";

      const lines = content.split("\n");
      let currentLines = [];

      const flushBlock = () => {
        const eq = currentLines.join("\n").trim();
        currentLines = [];
        if (!eq) return;
        const div = document.createElement("div");
        div.className = "tcp-eq";
        const hasLineBreaks = eq.includes("\\\\");
        const hasEnv = eq.includes("\\begin{");
        const toRender =
          hasLineBreaks && !hasEnv
            ? `\\begin{aligned}\n${eq}\n\\end{aligned}`
            : eq;
        div.innerHTML = katex.renderToString(toRender, {
          displayMode: true,
          throwOnError: false,
          strict: false,
        });
        container.appendChild(div);
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("%")) {
          flushBlock();
          const label = document.createElement("div");
          label.className = "tcp-eq-label";
          label.textContent = trimmed.slice(1).trim();
          container.appendChild(label);
        } else if (trimmed === "") {
          flushBlock();
        } else {
          currentLines.push(line);
        }
      }
      flushBlock();

      panel.appendChild(container);
    } else {
      const lang = this.extensionToLanguage[extension] || "plaintext";
      const code = document.createElement("code");
      code.className = `language-${lang}`;
      code.textContent = content;
      const pre = document.createElement("pre");
      pre.appendChild(code);
      panel.appendChild(pre);
      hljs.highlightElement(code);
    }

    // Robust positioning — prefer right, fall back to left, clamp to viewport
    const rect = anchorEl.getBoundingClientRect();
    const margin = 12;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const panelW = Math.min(440, viewW - margin * 2);
    const panelMaxH = Math.min(420, viewH - margin * 2);

    panel.style.width = `${panelW}px`;
    panel.style.maxHeight = `${panelMaxH}px`;

    const spaceRight = viewW - rect.right - margin;
    const spaceLeft = rect.left - margin;
    let left;
    if (spaceRight >= panelW) {
      left = rect.right + margin;
    } else if (spaceLeft >= panelW) {
      left = rect.left - panelW - margin;
    } else {
      // Not enough room on either side — use whichever is bigger and clamp
      left =
        spaceRight >= spaceLeft
          ? rect.right + margin
          : rect.left - panelW - margin;
      left = Math.max(margin, Math.min(left, viewW - panelW - margin));
    }

    let top = rect.top;
    top = Math.max(margin, Math.min(top, viewH - panelMaxH - margin));

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.display = "flex";
  }

  hideTemplatePreview() {
    clearTimeout(this._templateHideTimer);
    const panel = document.getElementById("templateCodePreview");
    if (panel) panel.style.display = "none";
  }

  useTemplate(template) {
    this.closeTemplatesModal();
    this._openedFromTemplate = true;
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
    this.updateMdToolbarVisibility();
    const modal = document.getElementById("snippetModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);
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
        this.showNotification(
          `Import successful! Added ${data.snippets?.length || 0} snippets.`,
        );
      } catch (err) {
        console.error("Import error:", err);
        this.showNotification(
          "Failed to import data. Please check the file format.",
          "error",
        );
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
    const modal = document.getElementById("mergeModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);
  }

  closeMergeModal() {
    const modal = document.getElementById("mergeModal");
    if (!modal) return;
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
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
      this.showNotification(
        "Failed to merge data. Your local data is unchanged.",
        "error",
      );
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

      const modal = document.getElementById("sharedSnippetModal");
      modal.style.display = "flex";
      this.trapModalFocus(modal);
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
    const modal = document.getElementById("shareModal");
    modal.style.display = "flex";
    this.trapModalFocus(modal);
  }

  closeShareModal() {
    const modal = document.getElementById("shareModal");
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
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
    const modal = document.getElementById("sharedSnippetModal");
    const wasOpen = modal.style.display === "flex";
    modal.style.display = "none";
    if (wasOpen) this.releaseModalFocus(modal);
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
