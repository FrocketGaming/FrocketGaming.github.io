# QoL Tools

A collection of browser-based developer quality-of-life tools. No accounts required, no data leaves your machine — everything runs locally in the browser. Some tools optionally sync across devices via Google sign-in and Firebase Firestore.

**Live site:** https://frocketgaming.github.io

---

## Tools

### Txt Formatter
Transform and manipulate text without copy-pasting into a terminal. Supports case conversion (upper, lower, title, camel, snake, kebab), list sorting and deduplication, JSON formatting, whitespace cleanup, find & replace, and more.

### Snippets
A local-first code snippet manager. Store, tag, and search snippets by language or type. Supports syntax highlighting, Markdown notes with KaTeX math rendering, version history, template variables (`{{varName}}`), shareable time-limited links, and import/export. Sign in with Google to sync across devices.

### To-Do List
A persistent task manager backed by IndexedDB. Supports subtasks, categories, priorities, and projects. Everything saves automatically in your browser.

### CSV Viewer
Drop in a CSV file and explore it as an interactive, sortable, filterable table. Includes a SQL query interface for more complex filtering and aggregation without leaving the browser.

### Regex Tester
Live regular expression testing with real-time match highlighting, capture group details, and flag controls. Useful for building and debugging patterns without switching to a terminal.

### Image Editor
A canvas-based annotation and editing tool. Supports drawing arrows, rectangles, ellipses, freehand lines, and text overlays. Also handles cropping, resizing, pixel-blur/redact, and composite export — useful for annotating screenshots before sharing.

### Chart Builder
Build interactive charts from pasted CSV or JSON data using Plotly.js. Supports 12 chart types (bar, line, scatter, pie, area, radar, bubble, heatmap, box, histogram, and more) with customizable styling and PNG/clipboard export.

### Cron Builder
Visual cron expression editor with a plain-English description of the schedule and a next-run preview. Paste in an existing expression to decode it, or build one field-by-field.

### Timezone
Add multiple timezones and compare times across them at a glance. Includes a meeting planner for finding overlap between locations.

### Text Diff
Compare two blocks of text and see exactly what changed — additions, deletions, and modified lines with word-level highlighting. Unchanged lines are collapsed by default so the output stays focused on the differences. Supports unified and side-by-side views, with optional labels for each side.

### Notes *(direct URL only)*
A Markdown note-taking tool with Firebase sync. Accessible at `/tools/notes/` — not linked from the main nav. Supports tags, pinning, archiving, split editor/preview, zen mode, and keyboard shortcuts. Requires Google sign-in.

---

## Architecture

- **Static site** hosted on GitHub Pages — no server, no build step
- **Local persistence** via IndexedDB (`QoLToolsDB`) using a shared `StorageManager` wrapper
- **Cloud sync** (Snippets, Notes) via Firebase Firestore with Google OAuth — offline-capable with real-time listeners
- **Theming** — 7 themes (Default, Dracula, Catppuccin, Atom, Nord, Solarized, SynthWave) applied via `data-theme` on `<html>` with no flash on load
- No frameworks, no bundler — vanilla JS, CSS variables, and a handful of CDN libraries (Highlight.js, Marked, KaTeX, Plotly.js, Firebase SDK)

---

## Running Locally

No build step needed. Clone the repo and open `index.html` directly in a browser, or serve it with any static file server:

```bash
git clone https://github.com/FrocketGaming/FrocketGaming.github.io.git
cd FrocketGaming.github.io
npx serve .
```

Firebase-dependent tools (Snippets, Notes) require a valid `src/firebase-config.js` pointing to your own Firebase project for cloud sync to work. Local-only features work without it.

---

## Project Structure

```
/
├── index.html              Landing page
├── landing-styles.css
├── src/                    Shared modules loaded by all tools
│   ├── stylesheet.css      Global CSS variables and base styles
│   ├── theme-manager.js    Theme switching
│   ├── storage-manager.js  IndexedDB wrapper
│   ├── firebase-config.js  Firebase project config
│   └── firebase-sync.js    Firestore sync service
└── tools/
    ├── chart-builder/
    ├── cron-builder/
    ├── csv-viewer/
    ├── image-editor/
    ├── notes/
    ├── regex-tester/
    ├── snippets/
    ├── text-diff/
    ├── timezone/
    ├── todo/
    └── txt-formatter/
```

Each tool follows the pattern: `index.html` + `{tool}-app.js` + `{tool}-styles.css`.
