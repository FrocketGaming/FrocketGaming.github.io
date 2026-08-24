/**
 * Snippet Graph View - force-directed visualization of snippets and tags
 * Nodes: snippets (colored by category) + tags (neutral, connect snippets that share them)
 * No external deps - custom canvas force simulation with d3-force-style alpha decay
 */

const MIN_REPEL_DIST_SQ = 100; // floors near-field repulsion so it can't diverge
const MAX_NODE_SPEED = 22; // px/tick cap - second line of defense against blow-up

class SnippetGraphView {
  constructor(app) {
    this.app = app;

    this.nodes = [];
    this.edges = [];
    this.nodeById = new Map();

    this.transform = { x: 0, y: 0, scale: 1 };
    this.alpha = 1;
    this.alphaTarget = 0;
    this.alphaDecay = 1 - Math.pow(0.001, 1 / 300);
    this.alphaMin = 0.001;
    this.running = false;
    this._rafId = null;

    this.hoveredNode = null;
    this.draggingNode = null;
    this.dragMoved = false;
    this.isPanning = false;
    this.panStart = null;
    this.lastPointer = { x: 0, y: 0 };
    this._previewAnchor = null;
    this._previewedNode = null;

    this.settings = {
      showTags: true,
      showOrphans: true,
      colorBy: "category",
      repelForce: 500,
      linkDistance: 80,
      linkForce: 0.7,
      centerForce: 0.05,
    };
    this.filterQuery = "";

    this.colors = {};
    this._themeObserver = null;
    this._resizeObserver = null;
    this._boundKeydown = null;
  }

  // ---------- lifecycle ----------

  open() {
    if (this.overlay) {
      this._rebuild();
      return;
    }
    this._buildDom();
    this._readThemeColors();
    this._rebuild();
    this._bindEvents();

    this._themeObserver = new MutationObserver(() => {
      this._readThemeColors();
      this._renderNow();
    });
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    requestAnimationFrame(() => this.overlay.classList.add("graph-open"));
  }

  close() {
    if (!this.overlay) return;
    this.overlay.classList.remove("graph-open");
    this._stopLoop();
    clearTimeout(this.app._templatePreviewTimer);
    clearTimeout(this.app._templateHideTimer);
    if (typeof this.app.hideTemplatePreview === "function") this.app.hideTemplatePreview();
    this._previewedNode = null;
    if (this._themeObserver) this._themeObserver.disconnect();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._boundKeydown)
      document.removeEventListener("keydown", this._boundKeydown);
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.overlay = null;
      this.canvas = null;
      this.ctx = null;
    }, 180);
  }

  isOpen() {
    return !!this.overlay;
  }

  // ---------- DOM scaffold ----------

  _buildDom() {
    const overlay = document.createElement("div");
    overlay.className = "graph-overlay";
    overlay.id = "snippetGraphOverlay";
    overlay.innerHTML = `
      <div class="graph-topbar">
        <div class="graph-search-wrap">
          <i class="fa-solid fa-search"></i>
          <input type="text" id="graphFilterInput" placeholder="Filter graph..." autocomplete="off" />
        </div>
        <div class="graph-topbar-spacer"></div>
        <button class="graph-icon-btn" id="graphFitBtn" title="Fit to screen" aria-label="Fit to screen">
          <i class="fa-solid fa-expand"></i>
        </button>
        <button class="graph-icon-btn" id="graphSettingsBtn" title="Graph settings" aria-label="Graph settings">
          <i class="fa-solid fa-sliders"></i>
        </button>
        <button class="graph-icon-btn graph-close-btn" id="graphCloseBtn" title="Close graph view" aria-label="Close graph view">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <canvas id="graphCanvas" class="graph-canvas"></canvas>

      <div class="graph-empty-note" id="graphEmptyNote" style="display:none">
        <i class="fa-solid fa-diagram-project"></i>
        <p>No snippets match this filter</p>
      </div>

      <div class="graph-legend" id="graphLegend"></div>

      <div class="graph-panel" id="graphSettingsPanel">
        <div class="graph-panel-section">
          <div class="graph-panel-title">Filters</div>
          <label class="graph-toggle">
            <input type="checkbox" id="graphShowTags" checked />
            <span>Tags</span>
          </label>
          <label class="graph-toggle">
            <input type="checkbox" id="graphShowOrphans" checked />
            <span>Orphans</span>
          </label>
        </div>
        <div class="graph-panel-section">
          <div class="graph-panel-title">Groups</div>
          <label class="graph-radio">
            <input type="radio" name="graphColorBy" value="category" checked />
            <span>Snippets: plain dots</span>
          </label>
          <label class="graph-radio">
            <input type="radio" name="graphColorBy" value="favorite" />
            <span>Snippets: highlight favorites</span>
          </label>
        </div>
        <div class="graph-panel-section">
          <div class="graph-panel-title">Forces</div>
          <label class="graph-slider-row">
            <span>Repel force</span>
            <input type="range" id="graphRepelForce" min="60" max="800" value="${this.settings.repelForce}" />
          </label>
          <label class="graph-slider-row">
            <span>Link distance</span>
            <input type="range" id="graphLinkDistance" min="20" max="200" value="${this.settings.linkDistance}" />
          </label>
          <label class="graph-slider-row">
            <span>Link force</span>
            <input type="range" id="graphLinkForce" min="0" max="100" value="${Math.round(this.settings.linkForce * 100)}" />
          </label>
          <label class="graph-slider-row">
            <span>Center force</span>
            <input type="range" id="graphCenterForce" min="0" max="30" value="${Math.round(this.settings.centerForce * 100)}" />
          </label>
        </div>
      </div>

      <div class="graph-context-menu" id="graphContextMenu"></div>
    `;
    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.canvas = overlay.querySelector("#graphCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.panel = overlay.querySelector("#graphSettingsPanel");
    this.legendEl = overlay.querySelector("#graphLegend");
    this.contextMenuEl = overlay.querySelector("#graphContextMenu");
    this.emptyNoteEl = overlay.querySelector("#graphEmptyNote");

    this._resizeCanvas();
    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObserver.observe(overlay);
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.overlay.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = rect.width + "px";
    this.canvas.style.height = rect.height + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this._renderNow();
  }

  _readThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (cs.getPropertyValue(name) || "").trim() || fallback;
    this.colors = {
      bg: v("--bg-primary", "#1a1a1a"),
      panelBg: v("--bg-secondary", "#2a2a2a"),
      border: v("--border-color", "#444444"),
      text: v("--text-primary", "#ffffff"),
      textDim: v("--text-secondary", "#888888"),
      accent: v("--accent-primary", "#74a12e"),
      accentHi: v("--accent-secondary", "#c6ee86"),
      tagNode: v("--text-secondary", "#888888"),
      categoryPalette: [
        v("--syntax-function", "#74a12e"),
        v("--syntax-keyword", "#c678dd"),
        v("--syntax-type", "#61afef"),
        v("--syntax-number", "#d19a66"),
        v("--syntax-string", "#98c379"),
        v("--syntax-tag", "#e06c75"),
        v("--syntax-variable", "#56b6c2"),
        v("--info-color", "#6ba3ff"),
      ],
    };
  }

  // ---------- graph construction ----------

  _rebuild() {
    this._autoFitted = false;
    const snippets = this.app.snippets || [];
    const categories = (this.app.types || []).map((t) => t.name);

    this.nodes = [];
    this.edges = [];
    this.nodeById = new Map();

    const tagMap = new Map(); // tag name -> tag node

    const cx = (this.width || 600) / 2;
    const cy = (this.height || 400) / 2;

    snippets.forEach((snippet, i) => {
      const angle = (i / Math.max(snippets.length, 1)) * Math.PI * 2;
      const node = {
        id: "s" + snippet.id,
        kind: "snippet",
        label: snippet.name,
        snippetId: snippet.id,
        category: snippet.type || "Other",
        favorite: !!snippet.favorite,
        tags: snippet.tags || [],
        x: cx + Math.cos(angle) * 200 + (Math.random() - 0.5) * 30,
        y: cy + Math.sin(angle) * 200 + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
        fixed: false,
        degree: 0,
      };
      this.nodes.push(node);
      this.nodeById.set(node.id, node);
    });

    if (this.settings.showTags) {
      snippets.forEach((snippet) => {
        const sNode = this.nodeById.get("s" + snippet.id);
        (snippet.tags || []).forEach((tag) => {
          const key = tag.toLowerCase();
          let tNode = tagMap.get(key);
          if (!tNode) {
            tNode = {
              id: "t" + key,
              kind: "tag",
              label: tag,
              x: sNode.x + (Math.random() - 0.5) * 40,
              y: sNode.y + (Math.random() - 0.5) * 40,
              vx: 0,
              vy: 0,
              fixed: false,
              degree: 0,
              categoryCounts: {},
            };
            tagMap.set(key, tNode);
            this.nodes.push(tNode);
            this.nodeById.set(tNode.id, tNode);
          }
          this.edges.push({ source: sNode.id, target: tNode.id });
          sNode.degree++;
          tNode.degree++;
          tNode.categoryCounts[sNode.category] = (tNode.categoryCounts[sNode.category] || 0) + 1;
        });
      });
      // tags are the primary nodes now - give each one the category its
      // snippets belong to most, so tag color signals "what kind of tag is this"
      tagMap.forEach((tNode) => {
        let best = null,
          bestCount = 0;
        for (const [cat, count] of Object.entries(tNode.categoryCounts)) {
          if (count > bestCount) {
            best = cat;
            bestCount = count;
          }
        }
        tNode.dominantCategory = best;
      });
    }

    // category color index assignment, stable order
    this.categoryOrder = categories.length ? categories : [...new Set(this.nodes.map((n) => n.category))];

    this._applyFilters();
    this._renderLegend();
    // frame the initial (already roughly circular) layout immediately, so
    // the camera doesn't start at a default zoom and jump-cut once physics
    // settles - the settle pass then only has to refine within this view
    this.fitToScreen();
    this._reheat(0.6);
  }

  _applyFilters() {
    const q = this.filterQuery.trim().toLowerCase();
    this.nodes.forEach((n) => {
      let visible = true;
      if (n.kind === "tag" && !this.settings.showTags) visible = false;
      if (n.kind === "snippet" && n.degree === 0 && !this.settings.showOrphans) visible = false;
      if (q) {
        const hay = n.kind === "snippet" ? (n.label + " " + n.tags.join(" ")).toLowerCase() : n.label.toLowerCase();
        if (!hay.includes(q)) visible = false;
      }
      n.hidden = !visible;
    });
    const hiddenSet = new Set(this.nodes.filter((n) => n.hidden).map((n) => n.id));
    this.edges.forEach((e) => {
      e.hidden = hiddenSet.has(e.source) || hiddenSet.has(e.target);
    });
    const anyVisible = this.nodes.some((n) => !n.hidden);
    if (this.emptyNoteEl) this.emptyNoteEl.style.display = anyVisible ? "none" : "flex";
  }

  _renderLegend() {
    if (!this.legendEl) return;
    // tags (the primary nodes) are always colored by their dominant
    // category, regardless of colorBy - that setting only affects the small
    // snippet connector dots
    const cats = this.categoryOrder || [];
    const catItems = cats
      .map(
        (cat) =>
          `<div class="graph-legend-item"><span class="graph-legend-dot" style="background:${this._categoryColor(cat)}"></span>${cat} tags</div>`
      )
      .join("");
    const snippetItem =
      this.settings.colorBy === "favorite"
        ? `<div class="graph-legend-item"><span class="graph-legend-dot graph-legend-tag" style="background:${this.colors.accentHi}"></span>Favorite snippet</div>
           <div class="graph-legend-item"><span class="graph-legend-dot graph-legend-tag" style="background:${this.colors.tagNode}"></span>Snippet</div>`
        : `<div class="graph-legend-item"><span class="graph-legend-dot graph-legend-tag" style="background:${this.colors.tagNode}"></span>Snippet</div>`;
    this.legendEl.innerHTML = catItems + snippetItem;
  }

  _categoryColor(category) {
    const idx = Math.max(0, (this.categoryOrder || []).indexOf(category));
    const pal = this.colors.categoryPalette;
    return this._muted(pal[idx % pal.length]);
  }

  _nodeColor(node) {
    // tags are the primary nodes - colored by the category their snippets
    // belong to most, so tag identity/category reads at a glance
    if (node.kind === "tag") {
      return node.dominantCategory ? this._categoryColor(node.dominantCategory) : this.colors.tagNode;
    }
    // snippets are small connector dots now; favorite is still worth a signal
    if (this.settings.colorBy === "favorite" && node.favorite) return this.colors.accentHi;
    return this.colors.tagNode;
  }

  // blends a color toward the theme's neutral text tone so the default
  // palette reads as restrained accents rather than a saturated color wheel
  _muted(hex) {
    if (!/^#([0-9a-f]{6})$/i.test(hex)) return hex;
    const neutral = this.colors.textDim || "#888888";
    if (!/^#([0-9a-f]{6})$/i.test(neutral)) return hex;
    const t = 0.48;
    const mix = (a, b) => Math.round(a * (1 - t) + b * t);
    const r1 = parseInt(hex.slice(1, 3), 16),
      g1 = parseInt(hex.slice(3, 5), 16),
      b1 = parseInt(hex.slice(5, 7), 16);
    const r2 = parseInt(neutral.slice(1, 3), 16),
      g2 = parseInt(neutral.slice(3, 5), 16),
      b2 = parseInt(neutral.slice(5, 7), 16);
    const toHex = (v) => v.toString(16).padStart(2, "0");
    return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`;
  }

  _nodeRadius(node) {
    // tags are the primary nodes (bigger, grow with how many snippets carry
    // them); snippets are small connector dots that link tags together
    if (node.kind === "tag") return 7 + Math.sqrt(node.degree) * 4.2;
    return 3 + Math.sqrt(node.degree) * 1.1;
  }

  // ---------- simulation ----------

  _reheat(alpha) {
    this.alpha = alpha;
    if (!this.running) this._startLoop();
  }

  _startLoop() {
    if (this.running) return;
    this.running = true;
    const step = () => {
      if (!this.overlay) return;
      this._tick();
      const animatingCamera = this._stepCameraAnim();
      this._renderNow();
      if (this.alpha > this.alphaMin || this.isPanning || this.draggingNode || animatingCamera) {
        this._rafId = requestAnimationFrame(step);
      } else {
        this.running = false;
      }
    };
    this._rafId = requestAnimationFrame(step);
  }

  _stopLoop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  _tick() {
    if (this.alpha <= this.alphaMin && !this.draggingNode) return;
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    if (this.alpha < this.alphaMin) this.alpha = this.alphaMin;

    const visible = this.nodes.filter((n) => !n.hidden);
    const n = visible.length;
    const repel = this.settings.repelForce;

    // repulsion (O(n^2) - fine up to a few hundred nodes; idles once settled)
    for (let i = 0; i < n; i++) {
      const a = visible[i];
      if (a.fixed) continue;
      let fx = 0,
        fy = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const b = visible[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          dx = (Math.random() - 0.5) + (dx || 0.5);
          dy = (Math.random() - 0.5) + (dy || 0.5);
          distSq = dx * dx + dy * dy;
        }
        // floor distSq so near-field pairs can't produce a force spike the
        // integrator can't damp out in one step (was causing simulation blow-up)
        const clampedDistSq = Math.max(distSq, MIN_REPEL_DIST_SQ);
        const dist = Math.sqrt(clampedDistSq);
        const force = (repel / clampedDistSq) * this.alpha;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      a.vx += fx;
      a.vy += fy;
    }

    // link (spring) force
    const linkDist = this.settings.linkDistance;
    const linkK = this.settings.linkForce;
    this.edges.forEach((e) => {
      if (e.hidden) return;
      const a = this.nodeById.get(e.source);
      const b = this.nodeById.get(e.target);
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const diff = (dist - linkDist) * linkK * this.alpha;
      const ux = dx / dist;
      const uy = dy / dist;
      if (!a.fixed) {
        a.vx += ux * diff;
        a.vy += uy * diff;
      }
      if (!b.fixed) {
        b.vx -= ux * diff;
        b.vy -= uy * diff;
      }
    });

    // centering
    const cx = this.width / 2;
    const cy = this.height / 2;
    const cf = this.settings.centerForce;
    visible.forEach((node) => {
      if (node.fixed) return;
      node.vx += (cx - node.x) * cf * this.alpha;
      node.vy += (cy - node.y) * cf * this.alpha;
    });

    // collision - enforces a minimum gap (radius + label clearance) so
    // labels don't stack illegibly; charge repulsion alone doesn't guarantee this
    for (let i = 0; i < n; i++) {
      const a = visible[i];
      for (let j = i + 1; j < n; j++) {
        const b = visible[j];
        if (a.fixed && b.fixed) continue;
        // tags always show labels, so pairs involving a tag need generous
        // clearance. Snippet-snippet pairs still need real room too: hovering
        // a hub tag reveals every one of its snippets' labels at once, and
        // those cluster tightly right around the hub.
        const labelClearance = a.kind === "tag" || b.kind === "tag" ? 56 : 34;
        const minDist = this._nodeRadius(a) + this._nodeRadius(b) + labelClearance;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.5;
          const ox = dx * push;
          const oy = dy * push;
          if (!a.fixed) {
            a.x -= ox;
            a.y -= oy;
          }
          if (!b.fixed) {
            b.x += ox;
            b.y += oy;
          }
        }
      }
    }

    // integrate
    visible.forEach((node) => {
      if (node.fixed) return;
      node.vx *= 0.82;
      node.vy *= 0.82;
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > MAX_NODE_SPEED) {
        const s = MAX_NODE_SPEED / speed;
        node.vx *= s;
        node.vy *= s;
      }
      node.x += node.vx;
      node.y += node.vy;
    });

    // reframe once the layout has settled from its initial radial guess, so
    // the graph isn't left off-center or cropped after opening. Eased, not
    // snapped - an instant jump here reads as a jarring second "reload".
    if (!this._autoFitted && this.alpha < 0.05 && !this.draggingNode) {
      this._autoFitted = true;
      this._animatedFitToScreen();
    }
  }

  // ---------- rendering ----------

  _renderNow() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const { x: tx, y: ty, scale } = this.transform;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    const highlightSet = this._highlightSet();
    const dimming = !!this.hoveredNode;

    // edges
    ctx.lineWidth = 1 / scale;
    this.edges.forEach((e) => {
      if (e.hidden) return;
      const a = this.nodeById.get(e.source);
      const b = this.nodeById.get(e.target);
      const isHi = highlightSet && (highlightSet.has(a.id) && highlightSet.has(b.id));
      ctx.strokeStyle = this._withAlpha(this.colors.border, dimming ? (isHi ? 0.9 : 0.08) : 0.55);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    // nodes
    this.nodes.forEach((node) => {
      if (node.hidden) return;
      const isHi = !highlightSet || highlightSet.has(node.id);
      const r = this._nodeRadius(node);
      ctx.beginPath();
      ctx.fillStyle = this._withAlpha(this._nodeColor(node), dimming ? (isHi ? 1 : 0.15) : 1);
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (node === this.hoveredNode || node.fixed) {
        ctx.lineWidth = 1.6 / scale;
        ctx.strokeStyle = this.colors.accentHi;
        ctx.stroke();
      }

      // tags are the primary nodes, so their labels stay on screen (fading
      // only the least-connected ones out at a very wide zoom); snippets are
      // secondary connector dots and only label on hover/highlight/zoom-in
      const showLabel =
        node.kind === "tag"
          ? node.degree >= (scale > 0.6 ? 0 : 1) || node === this.hoveredNode || (highlightSet && highlightSet.has(node.id))
          : scale > 1.3 || node === this.hoveredNode || (highlightSet && highlightSet.has(node.id));
      if (showLabel && (!dimming || isHi)) {
        // keep label a constant screen-space size regardless of zoom, so it
        // doesn't balloon into unreadable overlap when zoomed/fit in tight
        const fontPx = (node.kind === "tag" ? 12 : 10) / scale;
        ctx.font = `${node.kind === "tag" ? "600 " : ""}${fontPx}px "JetBrains Mono", monospace`;
        ctx.fillStyle = this._withAlpha(node.kind === "tag" ? this.colors.text : this.colors.textDim, dimming && !isHi ? 0.15 : 1);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = node.label.length > 28 ? node.label.slice(0, 27) + "…" : node.label;
        ctx.fillText(label, node.x, node.y + r + 3 / scale);
      }
    });

    ctx.restore();
  }

  _withAlpha(hexOrColor, alpha) {
    // supports #rrggbb; anything else passed through with best-effort rgba wrap
    if (/^#([0-9a-f]{6})$/i.test(hexOrColor)) {
      const r = parseInt(hexOrColor.slice(1, 3), 16);
      const g = parseInt(hexOrColor.slice(3, 5), 16);
      const b = parseInt(hexOrColor.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return hexOrColor;
  }

  _highlightSet() {
    if (!this.hoveredNode) return null;
    const set = new Set([this.hoveredNode.id]);
    this.edges.forEach((e) => {
      if (e.hidden) return;
      if (e.source === this.hoveredNode.id) set.add(e.target);
      if (e.target === this.hoveredNode.id) set.add(e.source);
    });
    return set;
  }

  // ---------- coordinate helpers ----------

  _screenToWorld(px, py) {
    return {
      x: (px - this.transform.x) / this.transform.scale,
      y: (py - this.transform.y) / this.transform.scale,
    };
  }

  _nodeAt(px, py) {
    const { x, y } = this._screenToWorld(px, py);
    let hit = null;
    let hitDist = Infinity;
    for (const node of this.nodes) {
      if (node.hidden) continue;
      const r = this._nodeRadius(node) + 3;
      const dx = node.x - x;
      const dy = node.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r && d < hitDist) {
        hit = node;
        hitDist = d;
      }
    }
    return hit;
  }

  _computeFitTransform() {
    const visible = this.nodes.filter((n) => !n.hidden);
    if (!visible.length) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    visible.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });
    const pad = 90;
    const w = Math.max(maxX - minX, 40) + pad * 2;
    const h = Math.max(maxY - minY, 40) + pad * 2;
    const scale = Math.min(this.width / w, this.height / h, 1.25);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      scale,
      x: this.width / 2 - cx * scale,
      y: this.height / 2 - cy * scale,
    };
  }

  fitToScreen() {
    const t = this._computeFitTransform();
    if (!t) return;
    this.cameraAnim = null;
    this.transform.scale = t.scale;
    this.transform.x = t.x;
    this.transform.y = t.y;
    this._renderNow();
  }

  // eases the camera to frame the current layout instead of snapping, so an
  // auto-reframe (e.g. once physics settles) reads as an intentional zoom
  // rather than a jarring jump/"reload"
  _animatedFitToScreen(durationMs = 450) {
    const t = this._computeFitTransform();
    if (!t) return;
    this.cameraAnim = {
      from: { ...this.transform },
      to: t,
      start: performance.now(),
      duration: durationMs,
    };
    this._startLoop();
  }

  _stepCameraAnim() {
    if (!this.cameraAnim) return false;
    const { from, to, start, duration } = this.cameraAnim;
    const p = Math.min(1, (performance.now() - start) / duration);
    const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
    this.transform.scale = from.scale + (to.scale - from.scale) * e;
    this.transform.x = from.x + (to.x - from.x) * e;
    this.transform.y = from.y + (to.y - from.y) * e;
    if (p >= 1) this.cameraAnim = null;
    return true;
  }

  // ---------- events ----------

  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener("mousedown", (e) => {
      const node = this._nodeAt(e.offsetX, e.offsetY);
      this._hideContextMenu();
      this._scheduleSnippetPreview(null);
      if (node) {
        this.draggingNode = node;
        this.dragMoved = false;
        node.fixed = true;
      } else {
        this.isPanning = true;
        this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
      }
      this.lastPointer = { x: e.offsetX, y: e.offsetY };
      this._startLoop();
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.overlay) return;
      // the preview panel is a real DOM element that can sit geometrically
      // inside the canvas's own rect - if the cursor is over it, leave hover
      // tracking alone entirely and let the panel's own mouseenter/mouseleave
      // (which keep it open so you can scroll it) be the only thing deciding
      if (e.target && e.target.closest && e.target.closest("#templateCodePreview")) return;
      const rect = canvas.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;

      if (this.draggingNode) {
        const { x, y } = this._screenToWorld(ox, oy);
        this.draggingNode.x = x;
        this.draggingNode.y = y;
        this.draggingNode.vx = 0;
        this.draggingNode.vy = 0;
        this.dragMoved = true;
        this._reheat(0.3);
        this._scheduleSnippetPreview(null);
      } else if (this.isPanning) {
        this.transform.x = e.clientX - this.panStart.x;
        this.transform.y = e.clientY - this.panStart.y;
        this._renderNow();
        this._scheduleSnippetPreview(null);
      } else if (ox >= 0 && ox <= this.width && oy >= 0 && oy <= this.height) {
        const hit = this._nodeAt(ox, oy);
        if (hit !== this.hoveredNode) {
          this.hoveredNode = hit;
          canvas.style.cursor = hit ? "pointer" : "grab";
          this._renderNow();
          this._scheduleSnippetPreview(hit);
        }
      } else if (this.hoveredNode) {
        // cursor left the canvas entirely - clear hover state and preview
        this.hoveredNode = null;
        this._renderNow();
        this._scheduleSnippetPreview(null);
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (this.draggingNode) {
        if (!this.dragMoved) {
          this.draggingNode.fixed = false;
          this._openNode(this.draggingNode);
        }
        this.draggingNode = null;
        this._reheat(0.15);
      }
      this.isPanning = false;
    });

    canvas.addEventListener("dblclick", (e) => {
      const node = this._nodeAt(e.offsetX, e.offsetY);
      if (node) {
        node.fixed = false;
        this._reheat(0.5);
      } else {
        this.fitToScreen();
      }
    });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        const before = this._screenToWorld(ox, oy);
        const factor = Math.pow(1.0015, -e.deltaY);
        const newScale = Math.min(4, Math.max(0.1, this.transform.scale * factor));
        this.transform.scale = newScale;
        this.transform.x = ox - before.x * newScale;
        this.transform.y = oy - before.y * newScale;
        this._renderNow();
      },
      { passive: false }
    );

    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const node = this._nodeAt(e.offsetX, e.offsetY);
      if (node && node.kind === "snippet") this._showContextMenu(e.offsetX, e.offsetY, node);
      else this._hideContextMenu();
    });

    document.addEventListener("click", (e) => {
      if (this.contextMenuEl && !this.contextMenuEl.contains(e.target)) this._hideContextMenu();
    });

    this.overlay.querySelector("#graphCloseBtn").addEventListener("click", () => this.close());
    this.overlay.querySelector("#graphFitBtn").addEventListener("click", () => this.fitToScreen());
    this.overlay.querySelector("#graphSettingsBtn").addEventListener("click", () => {
      this.panel.classList.toggle("open");
    });

    const filterInput = this.overlay.querySelector("#graphFilterInput");
    filterInput.addEventListener("input", (e) => {
      this.filterQuery = e.target.value;
      this._applyFilters();
      this._reheat(0.3);
    });

    this.overlay.querySelector("#graphShowTags").addEventListener("change", (e) => {
      this.settings.showTags = e.target.checked;
      this._rebuild();
    });
    this.overlay.querySelector("#graphShowOrphans").addEventListener("change", (e) => {
      this.settings.showOrphans = e.target.checked;
      this._applyFilters();
      this._reheat(0.3);
    });
    this.overlay.querySelectorAll('input[name="graphColorBy"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          this.settings.colorBy = e.target.value;
          this._renderLegend();
          this._renderNow();
        }
      });
    });
    this.overlay.querySelector("#graphRepelForce").addEventListener("input", (e) => {
      this.settings.repelForce = Number(e.target.value);
      this._reheat(0.4);
    });
    this.overlay.querySelector("#graphLinkDistance").addEventListener("input", (e) => {
      this.settings.linkDistance = Number(e.target.value);
      this._reheat(0.4);
    });
    this.overlay.querySelector("#graphLinkForce").addEventListener("input", (e) => {
      this.settings.linkForce = Number(e.target.value) / 100;
      this._reheat(0.4);
    });
    this.overlay.querySelector("#graphCenterForce").addEventListener("input", (e) => {
      this.settings.centerForce = Number(e.target.value) / 100;
      this._reheat(0.4);
    });

    this._boundKeydown = (e) => {
      if (e.key === "Escape") this.close();
    };
    document.addEventListener("keydown", this._boundKeydown);
  }

  _openNode(node) {
    if (node.kind === "snippet") {
      this.app.viewSnippet(node.snippetId);
      this.close();
    } else {
      this.filterQuery = node.label;
      this.overlay.querySelector("#graphFilterInput").value = node.label;
      this._applyFilters();
      this._reheat(0.3);
    }
  }

  // ---------- snippet hover preview (reuses the main list's code preview) ----------
  //
  // The preview panel has its own mouseenter/mouseleave that keep it open
  // while the cursor is over it (so you can scroll the code), by clearing
  // app._templateHideTimer. We schedule through those exact same app-scoped
  // timer fields - not our own - so moving from the node onto the panel
  // cancels the same timer the panel's hover handler is watching, instead of
  // a separate one racing it (which used to close the panel out from under you).

  _scheduleSnippetPreview(node) {
    clearTimeout(this.app._templatePreviewTimer);
    if (!node || node.kind !== "snippet") {
      this._hideSnippetPreview();
      return;
    }
    this.app._templatePreviewTimer = setTimeout(() => {
      // the node may have drifted or hover may have moved on by the time
      // this fires - only show if it's still the live hovered node
      if (this.hoveredNode === node) this._showSnippetPreview(node);
    }, 300);
  }

  _showSnippetPreview(node) {
    if (typeof this.app.showCodePreview !== "function") return;
    const snippet = this.app.snippets.find((s) => s.id === node.snippetId);
    if (!snippet || !this.canvas) return;

    if (!this._previewAnchor) {
      this._previewAnchor = document.createElement("div");
      this._previewAnchor.style.cssText = "position:fixed;width:1px;height:1px;pointer-events:none;";
      document.body.appendChild(this._previewAnchor);
    }
    const canvasRect = this.canvas.getBoundingClientRect();
    const sx = canvasRect.left + this.transform.x + node.x * this.transform.scale;
    const sy = canvasRect.top + this.transform.y + node.y * this.transform.scale;
    this._previewAnchor.style.left = `${sx}px`;
    this._previewAnchor.style.top = `${sy}px`;

    this._previewedNode = node;
    this.app.showCodePreview(snippet.name, snippet.extension, snippet.content, this._previewAnchor);
  }

  _hideSnippetPreview() {
    if (this._previewedNode === null) return;
    this.app._templateHideTimer = setTimeout(() => {
      if (typeof this.app.hideTemplatePreview === "function") this.app.hideTemplatePreview();
      this._previewedNode = null;
    }, 150);
  }

  _showContextMenu(x, y, node) {
    this.contextMenuEl.innerHTML = `
      <button class="graph-context-item" data-action="open"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open snippet</button>
      <button class="graph-context-item" data-action="copy"><i class="fa-solid fa-copy"></i> Copy to clipboard</button>
    `;
    this.contextMenuEl.style.left = x + "px";
    this.contextMenuEl.style.top = y + "px";
    this.contextMenuEl.classList.add("open");
    this.contextMenuEl.querySelector('[data-action="open"]').onclick = () => {
      this.app.viewSnippet(node.snippetId);
      this.close();
    };
    this.contextMenuEl.querySelector('[data-action="copy"]').onclick = async () => {
      const snippet = this.app.snippets.find((s) => s.id === node.snippetId);
      if (snippet) await navigator.clipboard.writeText(snippet.content || "");
      this._hideContextMenu();
    };
  }

  _hideContextMenu() {
    if (this.contextMenuEl) this.contextMenuEl.classList.remove("open");
  }
}
