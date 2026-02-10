/* Image Editor App */
class ImageEditorApp {
    constructor() {
        // Image state
        this.originalImage = null;
        this.originalFileName = 'image';
        this.originalFileSize = 0;

        // Canvas refs
        this.bgCanvas = document.getElementById('bgCanvas');
        this.bgCtx = this.bgCanvas.getContext('2d');
        this.overlayCanvas = document.getElementById('overlayCanvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.canvasWrapper = document.getElementById('canvasWrapper');

        // Annotations
        this.annotations = [];
        this.selectedAnnotation = -1;
        this.undoStack = [];
        this.redoStack = [];

        // Drawing state
        this.activeTool = 'select';
        this.isDrawing = false;
        this.drawStart = null;
        this.currentAnnotation = null;

        // Selection dragging
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.isResizingAnnotation = false;
        this.resizeHandle = null;
        this.resizeStartAnn = null;

        // Crop state
        this.isCropping = false;
        this.cropRect = null;

        // Tool options
        this.strokeColor = '#ff0000';
        this.strokeWidth = 3;
        this.filled = false;
        this.fontSize = 20;

        // DOM refs
        this.uploadSection = document.getElementById('uploadSection');
        this.editorSection = document.getElementById('editorSection');
        this.textOverlayInput = document.getElementById('textOverlayInput');

        this.init();
    }

    init() {
        this.bindUpload();
        this.bindClipboardPaste();
        this.bindToolbar();
        this.bindOptions();
        this.bindCanvasEvents();
        this.bindResize();
        this.bindCrop();
        this.bindExport();
        this.bindKeyboard();
        this.observeTheme();
    }

    /* ========== Image Loading ========== */
    bindUpload() {
        const zone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');

        zone.addEventListener('click', () => fileInput.click());
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) this.handleImageFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) this.handleImageFile(fileInput.files[0]);
            fileInput.value = '';
        });

        document.getElementById('loadNewBtn').addEventListener('click', () => {
            fileInput.click();
        });
    }

    bindClipboardPaste() {
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    this.handleImageFile(item.getAsFile());
                    return;
                }
            }
        });
    }

    handleImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        this.originalFileName = file.name || 'pasted-image';
        this.originalFileSize = file.size;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => this.loadImage(img);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    loadImage(img) {
        this.originalImage = img;
        this.annotations = [];
        this.selectedAnnotation = -1;
        this.undoStack = [];
        this.redoStack = [];
        this.isCropping = false;
        this.cropRect = null;

        // Show editor first so wrapper has layout dimensions
        this.uploadSection.style.display = 'none';
        this.editorSection.style.display = '';

        // Store actual image dimensions (for export we use natural size)
        this.imageWidth = img.naturalWidth;
        this.imageHeight = img.naturalHeight;

        this.sizeCanvasesToImage();

        // Draw image
        this.bgCtx.clearRect(0, 0, this.imageWidth, this.imageHeight);
        this.bgCtx.drawImage(img, 0, 0, this.imageWidth, this.imageHeight);

        this.updateInfo();
        this.renderOverlay();
        this.updateExportSize();

        // Set resize defaults
        document.getElementById('resizeW').value = this.imageWidth;
        document.getElementById('resizeH').value = this.imageHeight;
        document.getElementById('resizeScale').value = 100;
    }

    sizeCanvasesToImage() {
        const maxW = this.canvasWrapper.clientWidth - 20;
        let w = this.imageWidth;
        let h = this.imageHeight;

        // Display size (may be scaled down for display)
        if (maxW > 0 && w > maxW) {
            const ratio = maxW / w;
            w = maxW;
            h = Math.round(this.imageHeight * ratio);
        }

        this.displayWidth = w;
        this.displayHeight = h;

        this.bgCanvas.width = this.imageWidth;
        this.bgCanvas.height = this.imageHeight;
        this.overlayCanvas.width = this.imageWidth;
        this.overlayCanvas.height = this.imageHeight;

        // CSS display size
        this.bgCanvas.style.width = w + 'px';
        this.bgCanvas.style.height = h + 'px';
        this.overlayCanvas.style.width = w + 'px';
        this.overlayCanvas.style.height = h + 'px';

        // Set wrapper height to fit the displayed canvas
        this.canvasWrapper.style.height = (h + 20) + 'px';
    }

    /* ========== Toolbar ========== */
    bindToolbar() {
        const toolBtns = document.querySelectorAll('.tool-btn-editor[data-tool]');
        toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                if (tool === 'crop') {
                    this.enterCropMode();
                    return;
                }
                if (this.isCropping) this.exitCropMode();
                this.setActiveTool(tool);
            });
        });

        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        document.getElementById('deleteBtn').addEventListener('click', () => this.deleteSelected());
        document.getElementById('clearAnnotationsBtn').addEventListener('click', () => this.clearAnnotations());
    }

    setActiveTool(tool) {
        this.activeTool = tool;
        this.selectedAnnotation = -1;

        document.querySelectorAll('.tool-btn-editor[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === tool);
        });

        // Toggle contextual options
        document.getElementById('fillOption').style.display =
            (tool === 'rect' || tool === 'ellipse') ? '' : 'none';
        document.getElementById('fontSizeOption').style.display =
            tool === 'text' ? '' : 'none';
        document.getElementById('cropRatioOption').style.display =
            tool === 'crop' ? '' : 'none';

        // Cursor
        this.overlayCanvas.style.cursor =
            tool === 'select' ? 'default' : 'crosshair';

        this.renderOverlay();
    }

    /* ========== Options ========== */
    bindOptions() {
        const colorInput = document.getElementById('strokeColor');
        colorInput.addEventListener('input', (e) => {
            this.strokeColor = e.target.value;
            if (this.selectedAnnotation >= 0) {
                this.pushUndo();
                this.annotations[this.selectedAnnotation].color = this.strokeColor;
                this.renderOverlay();
            }
        });

        const widthInput = document.getElementById('strokeWidth');
        widthInput.addEventListener('input', (e) => {
            this.strokeWidth = parseInt(e.target.value);
            document.getElementById('strokeWidthVal').textContent = this.strokeWidth;
            if (this.selectedAnnotation >= 0) {
                this.pushUndo();
                this.annotations[this.selectedAnnotation].strokeWidth = this.strokeWidth;
                this.renderOverlay();
            }
        });

        document.getElementById('fillToggle').addEventListener('change', (e) => {
            this.filled = e.target.checked;
            if (this.selectedAnnotation >= 0) {
                const ann = this.annotations[this.selectedAnnotation];
                if (ann.type === 'rect' || ann.type === 'ellipse') {
                    this.pushUndo();
                    ann.filled = this.filled;
                    this.renderOverlay();
                }
            }
        });

        document.getElementById('fontSize').addEventListener('change', (e) => {
            this.fontSize = parseInt(e.target.value);
            if (this.selectedAnnotation >= 0 && this.annotations[this.selectedAnnotation].type === 'text') {
                this.pushUndo();
                this.annotations[this.selectedAnnotation].fontSize = this.fontSize;
                this.renderOverlay();
            }
        });
    }

    /* ========== Canvas Events ========== */
    getCanvasCoords(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const scaleX = this.overlayCanvas.width / rect.width;
        const scaleY = this.overlayCanvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    bindCanvasEvents() {
        this.overlayCanvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.overlayCanvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.overlayCanvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
        this.overlayCanvas.addEventListener('mouseleave', (e) => this.onCanvasMouseUp(e));

        // Touch support
        this.overlayCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onCanvasMouseDown(this.touchToMouse(e));
        });
        this.overlayCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.onCanvasMouseMove(this.touchToMouse(e));
        });
        this.overlayCanvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.onCanvasMouseUp(this.touchToMouse(e));
        });
    }

    touchToMouse(e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return { clientX: touch.clientX, clientY: touch.clientY, button: 0 };
    }

    onCanvasMouseDown(e) {
        if (e.button !== 0) return;
        const pt = this.getCanvasCoords(e);

        if (this.isCropping) {
            this.isDrawing = true;
            this.drawStart = pt;
            this.cropRect = { x: pt.x, y: pt.y, width: 0, height: 0 };
            return;
        }

        if (this.activeTool === 'select') {
            // Check resize handles first
            if (this.selectedAnnotation >= 0) {
                const handle = this.hitTestResizeHandles(pt.x, pt.y, this.annotations[this.selectedAnnotation]);
                if (handle) {
                    this.isResizingAnnotation = true;
                    this.resizeHandle = handle;
                    this.resizeStartAnn = JSON.parse(JSON.stringify(this.annotations[this.selectedAnnotation]));
                    this.drawStart = pt;
                    this.pushUndo();
                    return;
                }
            }

            const idx = this.hitTestAnnotations(pt.x, pt.y);
            if (idx >= 0) {
                this.selectAnnotation(idx);
                this.isDragging = true;
                const ann = this.annotations[idx];
                this.dragOffset = { x: pt.x - ann.x, y: pt.y - ann.y };
                this.pushUndo();
            } else {
                this.selectedAnnotation = -1;
                this.renderOverlay();
            }
            return;
        }

        if (this.activeTool === 'text') {
            this.handleTextPlacement(pt.x, pt.y);
            return;
        }

        // Start drawing
        this.isDrawing = true;
        this.drawStart = pt;
        this.currentAnnotation = this.createAnnotation(pt);
    }

    onCanvasMouseMove(e) {
        const pt = this.getCanvasCoords(e);

        if (this.isCropping && this.isDrawing) {
            this.cropRect.width = pt.x - this.cropRect.x;
            this.cropRect.height = pt.y - this.cropRect.y;
            this.constrainCropRect();
            this.renderOverlay();
            return;
        }

        if (this.isDragging && this.selectedAnnotation >= 0) {
            this.moveAnnotation(this.selectedAnnotation, pt.x - this.dragOffset.x, pt.y - this.dragOffset.y);
            this.renderOverlay();
            return;
        }

        if (this.isResizingAnnotation && this.selectedAnnotation >= 0) {
            this.resizeAnnotation(this.selectedAnnotation, pt);
            this.renderOverlay();
            return;
        }

        if (!this.isDrawing || !this.currentAnnotation) {
            // Update cursor for select tool
            if (this.activeTool === 'select') {
                if (this.selectedAnnotation >= 0) {
                    const handle = this.hitTestResizeHandles(pt.x, pt.y, this.annotations[this.selectedAnnotation]);
                    if (handle) {
                        this.overlayCanvas.style.cursor = this.getResizeCursor(handle);
                        return;
                    }
                }
                const idx = this.hitTestAnnotations(pt.x, pt.y);
                this.overlayCanvas.style.cursor = idx >= 0 ? 'move' : 'default';
            }
            return;
        }

        this.updateAnnotationDimensions(this.currentAnnotation, pt);
        this.renderOverlay();
    }

    onCanvasMouseUp(e) {
        if (this.isCropping && this.isDrawing) {
            this.isDrawing = false;
            // Normalize negative dimensions
            if (this.cropRect) {
                if (this.cropRect.width < 0) {
                    this.cropRect.x += this.cropRect.width;
                    this.cropRect.width = Math.abs(this.cropRect.width);
                }
                if (this.cropRect.height < 0) {
                    this.cropRect.y += this.cropRect.height;
                    this.cropRect.height = Math.abs(this.cropRect.height);
                }
            }
            this.renderOverlay();
            return;
        }

        if (this.isDragging) {
            this.isDragging = false;
            return;
        }

        if (this.isResizingAnnotation) {
            this.isResizingAnnotation = false;
            this.resizeHandle = null;
            this.resizeStartAnn = null;
            return;
        }

        if (!this.isDrawing || !this.currentAnnotation) return;
        this.isDrawing = false;

        this.finalizeAnnotation(this.currentAnnotation);
        if (this.isAnnotationValid(this.currentAnnotation)) {
            this.pushUndo();
            this.annotations.push(this.currentAnnotation);
            this.updateInfo();
        }
        this.currentAnnotation = null;
        this.renderOverlay();
        this.debouncedExportSize();
    }

    /* ========== Annotation Creation ========== */
    createAnnotation(pt) {
        return {
            type: this.activeTool,
            x: pt.x,
            y: pt.y,
            width: 0,
            height: 0,
            points: this.activeTool === 'freehand' ? [{ x: pt.x, y: pt.y }] : [],
            text: '',
            color: this.strokeColor,
            strokeWidth: this.strokeWidth,
            filled: this.filled,
            fontSize: this.fontSize
        };
    }

    updateAnnotationDimensions(ann, pt) {
        if (ann.type === 'freehand') {
            ann.points.push({ x: pt.x, y: pt.y });
        } else {
            ann.width = pt.x - ann.x;
            ann.height = pt.y - ann.y;
        }
    }

    finalizeAnnotation(ann) {
        // Normalize negative width/height for rect/ellipse/blur
        if (['rect', 'ellipse', 'blur'].includes(ann.type)) {
            if (ann.width < 0) {
                ann.x += ann.width;
                ann.width = Math.abs(ann.width);
            }
            if (ann.height < 0) {
                ann.y += ann.height;
                ann.height = Math.abs(ann.height);
            }
        }
        // Compute bounding box for freehand
        if (ann.type === 'freehand' && ann.points.length > 1) {
            const xs = ann.points.map(p => p.x);
            const ys = ann.points.map(p => p.y);
            ann.x = Math.min(...xs);
            ann.y = Math.min(...ys);
            ann.width = Math.max(...xs) - ann.x;
            ann.height = Math.max(...ys) - ann.y;
        }
    }

    isAnnotationValid(ann) {
        if (ann.type === 'freehand') return ann.points.length > 2;
        if (ann.type === 'text') return ann.text.length > 0;
        const minSize = 3;
        return Math.abs(ann.width) > minSize || Math.abs(ann.height) > minSize;
    }

    /* ========== Rendering ========== */
    renderOverlay() {
        const ctx = this.overlayCtx;
        ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        // Draw all annotations
        for (let i = 0; i < this.annotations.length; i++) {
            this.drawAnnotation(ctx, this.annotations[i]);
        }

        // Current drawing
        if (this.currentAnnotation) {
            this.drawAnnotation(ctx, this.currentAnnotation);
        }

        // Selection handles
        if (this.selectedAnnotation >= 0 && this.selectedAnnotation < this.annotations.length) {
            this.drawSelectionHandles(ctx, this.annotations[this.selectedAnnotation]);
        }

        // Crop overlay
        if (this.isCropping) {
            this.drawCropOverlay(ctx);
        }
    }

    drawAnnotation(ctx, ann) {
        ctx.save();
        ctx.strokeStyle = ann.color;
        ctx.fillStyle = ann.color;
        ctx.lineWidth = ann.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (ann.type) {
            case 'rect':
                if (ann.filled) {
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
                    ctx.globalAlpha = 1;
                }
                ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
                break;

            case 'ellipse':
                ctx.beginPath();
                const cx = ann.x + ann.width / 2;
                const cy = ann.y + ann.height / 2;
                const rx = Math.abs(ann.width / 2);
                const ry = Math.abs(ann.height / 2);
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                if (ann.filled) {
                    ctx.globalAlpha = 0.3;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.stroke();
                break;

            case 'line':
                ctx.beginPath();
                ctx.moveTo(ann.x, ann.y);
                ctx.lineTo(ann.x + ann.width, ann.y + ann.height);
                ctx.stroke();
                break;

            case 'arrow':
                ctx.beginPath();
                ctx.moveTo(ann.x, ann.y);
                const ex = ann.x + ann.width;
                const ey = ann.y + ann.height;
                ctx.lineTo(ex, ey);
                ctx.stroke();
                this.drawArrowhead(ctx, { x: ann.x, y: ann.y }, { x: ex, y: ey }, ann.strokeWidth);
                break;

            case 'freehand':
                if (ann.points.length < 2) break;
                ctx.beginPath();
                ctx.moveTo(ann.points[0].x, ann.points[0].y);
                for (let i = 1; i < ann.points.length; i++) {
                    ctx.lineTo(ann.points[i].x, ann.points[i].y);
                }
                ctx.stroke();
                break;

            case 'text':
                ctx.font = `${ann.fontSize}px Raleway, sans-serif`;
                ctx.fillStyle = ann.color;
                ctx.textBaseline = 'top';
                ctx.fillText(ann.text, ann.x, ann.y);
                // Compute width/height for hit testing
                const metrics = ctx.measureText(ann.text);
                ann.width = metrics.width;
                ann.height = ann.fontSize * 1.2;
                break;

            case 'blur':
                // Draw crosshatch pattern during editing
                ctx.strokeStyle = ann.color;
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.4;
                ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
                const step = 8;
                ctx.beginPath();
                for (let i = 0; i < ann.width + ann.height; i += step) {
                    const x1 = ann.x + Math.min(i, ann.width);
                    const y1 = ann.y + Math.max(0, i - ann.width);
                    const x2 = ann.x + Math.max(0, i - ann.height);
                    const y2 = ann.y + Math.min(i, ann.height);
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                }
                ctx.stroke();
                ctx.globalAlpha = 1;
                break;
        }
        ctx.restore();
    }

    drawArrowhead(ctx, from, to, strokeW) {
        const headLen = Math.max(12, strokeW * 4);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    drawSelectionHandles(ctx, ann) {
        ctx.save();
        ctx.strokeStyle = '#00aaff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        const b = this.getAnnotationBounds(ann);
        ctx.strokeRect(b.x - 4, b.y - 4, b.width + 8, b.height + 8);

        ctx.setLineDash([]);
        ctx.fillStyle = '#00aaff';
        const handles = this.getHandlePositions(b);
        for (const h of handles) {
            ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
        }
        ctx.restore();
    }

    getAnnotationBounds(ann) {
        if (ann.type === 'line' || ann.type === 'arrow') {
            const x1 = ann.x, y1 = ann.y;
            const x2 = ann.x + ann.width, y2 = ann.y + ann.height;
            return {
                x: Math.min(x1, x2), y: Math.min(y1, y2),
                width: Math.abs(ann.width), height: Math.abs(ann.height)
            };
        }
        return { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
    }

    getHandlePositions(b) {
        return [
            { x: b.x, y: b.y, pos: 'tl' },
            { x: b.x + b.width, y: b.y, pos: 'tr' },
            { x: b.x, y: b.y + b.height, pos: 'bl' },
            { x: b.x + b.width, y: b.y + b.height, pos: 'br' },
        ];
    }

    drawCropOverlay(ctx) {
        if (!this.cropRect) return;
        const r = this.cropRect;
        ctx.save();
        // Darken outside
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        ctx.clearRect(r.x, r.y, r.width, r.height);
        // Crop border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(r.x, r.y, r.width, r.height);
        ctx.restore();
    }

    /* ========== Text Tool ========== */
    handleTextPlacement(x, y) {
        const input = this.textOverlayInput;
        // Position relative to canvas wrapper (account for scroll)
        const rect = this.overlayCanvas.getBoundingClientRect();
        const wrapperRect = this.canvasWrapper.getBoundingClientRect();
        const scaleX = rect.width / this.overlayCanvas.width;
        const scaleY = rect.height / this.overlayCanvas.height;

        const displayX = (x * scaleX) + (rect.left - wrapperRect.left) + this.canvasWrapper.scrollLeft;
        const displayY = (y * scaleY) + (rect.top - wrapperRect.top) + this.canvasWrapper.scrollTop;

        input.style.left = displayX + 'px';
        input.style.top = displayY + 'px';
        input.style.fontSize = (this.fontSize * scaleY) + 'px';
        input.style.color = this.strokeColor;
        input.value = '';

        // Store placement coords
        input.dataset.cx = x;
        input.dataset.cy = y;

        // Remove any stale listeners
        if (this._textCommit) {
            input.removeEventListener('blur', this._textCommit);
            input.removeEventListener('keydown', this._textOnKey);
        }

        const commit = () => {
            input.removeEventListener('blur', commit);
            input.removeEventListener('keydown', onKey);
            this._textCommit = null;
            this._textOnKey = null;
            this.commitTextInput();
        };
        const onKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                input.style.display = 'none';
                input.removeEventListener('blur', commit);
                input.removeEventListener('keydown', onKey);
                this._textCommit = null;
                this._textOnKey = null;
            }
        };
        this._textCommit = commit;
        this._textOnKey = onKey;

        // Delay show+focus so the mouseup from the click doesn't immediately blur
        requestAnimationFrame(() => {
            input.style.display = '';
            input.focus();
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', onKey);
        });
    }

    commitTextInput() {
        const input = this.textOverlayInput;
        const text = input.value.trim();
        input.style.display = 'none';

        if (!text) return;

        const ann = {
            type: 'text',
            x: parseFloat(input.dataset.cx),
            y: parseFloat(input.dataset.cy),
            width: 0,
            height: 0,
            points: [],
            text: text,
            color: this.strokeColor,
            strokeWidth: this.strokeWidth,
            filled: false,
            fontSize: this.fontSize
        };
        this.pushUndo();
        this.annotations.push(ann);
        this.updateInfo();
        this.renderOverlay();
        this.debouncedExportSize();
    }

    /* ========== Selection / Hit Testing ========== */
    hitTestAnnotations(x, y) {
        // Reverse order (top-most first)
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            if (this.isPointInAnnotation(x, y, this.annotations[i])) return i;
        }
        return -1;
    }

    isPointInAnnotation(x, y, ann) {
        const pad = Math.max(6, ann.strokeWidth * 2);
        const b = this.getAnnotationBounds(ann);

        if (ann.type === 'freehand') {
            for (const p of ann.points) {
                if (Math.abs(x - p.x) < pad && Math.abs(y - p.y) < pad) return true;
            }
            return false;
        }

        if (ann.type === 'line' || ann.type === 'arrow') {
            return this.pointNearLine(x, y, ann.x, ann.y, ann.x + ann.width, ann.y + ann.height, pad);
        }

        return x >= b.x - pad && x <= b.x + b.width + pad &&
               y >= b.y - pad && y <= b.y + b.height + pad;
    }

    pointNearLine(px, py, x1, y1, x2, y2, threshold) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1) < threshold;
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        return Math.hypot(px - closestX, py - closestY) < threshold;
    }

    hitTestResizeHandles(x, y, ann) {
        const b = this.getAnnotationBounds(ann);
        const handles = this.getHandlePositions(b);
        for (const h of handles) {
            if (Math.abs(x - h.x) < 8 && Math.abs(y - h.y) < 8) return h.pos;
        }
        return null;
    }

    getResizeCursor(handle) {
        const map = { tl: 'nw-resize', tr: 'ne-resize', bl: 'sw-resize', br: 'se-resize' };
        return map[handle] || 'default';
    }

    selectAnnotation(idx) {
        this.selectedAnnotation = idx;
        if (idx >= 0) {
            const ann = this.annotations[idx];
            this.strokeColor = ann.color;
            this.strokeWidth = ann.strokeWidth;
            document.getElementById('strokeColor').value = ann.color;
            document.getElementById('strokeWidth').value = ann.strokeWidth;
            document.getElementById('strokeWidthVal').textContent = ann.strokeWidth;
            if (ann.type === 'rect' || ann.type === 'ellipse') {
                document.getElementById('fillToggle').checked = ann.filled;
            }
            if (ann.type === 'text') {
                document.getElementById('fontSize').value = ann.fontSize;
            }
        }
        this.renderOverlay();
    }

    moveAnnotation(idx, newX, newY) {
        const ann = this.annotations[idx];
        const dx = newX - ann.x;
        const dy = newY - ann.y;
        ann.x = newX;
        ann.y = newY;
        if (ann.type === 'freehand') {
            for (const p of ann.points) {
                p.x += dx;
                p.y += dy;
            }
        }
    }

    resizeAnnotation(idx, pt) {
        const ann = this.annotations[idx];
        const start = this.resizeStartAnn;
        const handle = this.resizeHandle;

        if (ann.type === 'line' || ann.type === 'arrow') {
            if (handle === 'tl') {
                ann.x = pt.x;
                ann.y = pt.y;
                ann.width = start.x + start.width - pt.x;
                ann.height = start.y + start.height - pt.y;
            } else {
                ann.width = pt.x - ann.x;
                ann.height = pt.y - ann.y;
            }
            return;
        }

        if (handle === 'br') {
            ann.width = pt.x - ann.x;
            ann.height = pt.y - ann.y;
        } else if (handle === 'bl') {
            ann.width = start.x + start.width - pt.x;
            ann.x = pt.x;
            ann.height = pt.y - ann.y;
        } else if (handle === 'tr') {
            ann.width = pt.x - ann.x;
            ann.height = start.y + start.height - pt.y;
            ann.y = pt.y;
        } else if (handle === 'tl') {
            ann.width = start.x + start.width - pt.x;
            ann.height = start.y + start.height - pt.y;
            ann.x = pt.x;
            ann.y = pt.y;
        }
    }

    deleteSelected() {
        if (this.selectedAnnotation < 0) return;
        this.pushUndo();
        this.annotations.splice(this.selectedAnnotation, 1);
        this.selectedAnnotation = -1;
        this.updateInfo();
        this.renderOverlay();
        this.debouncedExportSize();
    }

    clearAnnotations() {
        if (this.annotations.length === 0) return;
        this.pushUndo();
        this.annotations = [];
        this.selectedAnnotation = -1;
        this.updateInfo();
        this.renderOverlay();
        this.debouncedExportSize();
    }

    /* ========== Undo / Redo ========== */
    pushUndo() {
        this.undoStack.push(JSON.parse(JSON.stringify(this.annotations)));
        this.redoStack = [];
        if (this.undoStack.length > 50) this.undoStack.shift();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(JSON.parse(JSON.stringify(this.annotations)));
        this.annotations = this.undoStack.pop();
        this.selectedAnnotation = -1;
        this.updateInfo();
        this.renderOverlay();
        this.debouncedExportSize();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(JSON.parse(JSON.stringify(this.annotations)));
        this.annotations = this.redoStack.pop();
        this.selectedAnnotation = -1;
        this.updateInfo();
        this.renderOverlay();
        this.debouncedExportSize();
    }

    /* ========== Blur Pixelation (Export) ========== */
    applyPixelation(ctx, ann) {
        const blockSize = 10;
        const x = Math.max(0, Math.round(ann.x));
        const y = Math.max(0, Math.round(ann.y));
        const w = Math.min(Math.round(ann.width), ctx.canvas.width - x);
        const h = Math.min(Math.round(ann.height), ctx.canvas.height - y);
        if (w <= 0 || h <= 0) return;

        const imageData = ctx.getImageData(x, y, w, h);
        const data = imageData.data;

        for (let by = 0; by < h; by += blockSize) {
            for (let bx = 0; bx < w; bx += blockSize) {
                // Sample center of block
                const sx = Math.min(bx + Math.floor(blockSize / 2), w - 1);
                const sy = Math.min(by + Math.floor(blockSize / 2), h - 1);
                const si = (sy * w + sx) * 4;
                const r = data[si], g = data[si + 1], b = data[si + 2], a = data[si + 3];

                // Fill block
                for (let py = by; py < Math.min(by + blockSize, h); py++) {
                    for (let px = bx; px < Math.min(bx + blockSize, w); px++) {
                        const pi = (py * w + px) * 4;
                        data[pi] = r;
                        data[pi + 1] = g;
                        data[pi + 2] = b;
                        data[pi + 3] = a;
                    }
                }
            }
        }
        ctx.putImageData(imageData, x, y);
    }

    /* ========== Crop ========== */
    bindCrop() {
        document.getElementById('applyCropBtn').addEventListener('click', () => this.applyCrop());
        document.getElementById('cancelCropBtn').addEventListener('click', () => this.exitCropMode());
    }

    enterCropMode() {
        this.isCropping = true;
        this.cropRect = null;
        this.selectedAnnotation = -1;

        document.querySelectorAll('.tool-btn-editor[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === 'crop');
        });

        document.getElementById('cropConfirmBar').style.display = '';
        document.getElementById('cropRatioOption').style.display = '';
        this.overlayCanvas.style.cursor = 'crosshair';
        this.renderOverlay();
    }

    exitCropMode() {
        this.isCropping = false;
        this.cropRect = null;
        document.getElementById('cropConfirmBar').style.display = 'none';
        document.getElementById('cropRatioOption').style.display = 'none';
        this.setActiveTool('select');
    }

    constrainCropRect() {
        if (!this.cropRect) return;
        const ratio = document.getElementById('cropRatio').value;
        if (ratio === 'free') return;

        const [rw, rh] = ratio.split(':').map(Number);
        const aspect = rw / rh;
        const w = Math.abs(this.cropRect.width);
        const h = Math.abs(this.cropRect.height);

        if (w / h > aspect) {
            this.cropRect.width = Math.sign(this.cropRect.width) * h * aspect;
        } else {
            this.cropRect.height = Math.sign(this.cropRect.height) * w / aspect;
        }
    }

    applyCrop() {
        if (!this.cropRect || this.cropRect.width === 0 || this.cropRect.height === 0) return;

        // Normalize
        let { x, y, width, height } = this.cropRect;
        if (width < 0) { x += width; width = Math.abs(width); }
        if (height < 0) { y += height; height = Math.abs(height); }

        // Clamp to canvas
        x = Math.max(0, Math.round(x));
        y = Math.max(0, Math.round(y));
        width = Math.min(Math.round(width), this.imageWidth - x);
        height = Math.min(Math.round(height), this.imageHeight - y);
        if (width <= 0 || height <= 0) return;

        this.pushUndo();

        // Extract cropped region from bg
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.bgCanvas, x, y, width, height, 0, 0, width, height);

        // Create new image from cropped region
        const img = new Image();
        img.onload = () => {
            this.originalImage = img;
            this.imageWidth = width;
            this.imageHeight = height;

            this.sizeCanvasesToImage();
            this.bgCtx.drawImage(img, 0, 0);

            // Offset annotations
            this.annotations = this.annotations.filter(ann => {
                const b = this.getAnnotationBounds(ann);
                // Keep if at least partially in crop region
                return b.x + b.width > 0 && b.y + b.height > 0 &&
                       b.x < width && b.y < height;
            }).map(ann => {
                ann.x -= x;
                ann.y -= y;
                if (ann.type === 'freehand') {
                    ann.points = ann.points.map(p => ({ x: p.x - x, y: p.y - y }));
                }
                return ann;
            });

            this.exitCropMode();
            this.updateInfo();
            this.renderOverlay();
            this.debouncedExportSize();

            // Update resize defaults
            document.getElementById('resizeW').value = width;
            document.getElementById('resizeH').value = height;
            document.getElementById('resizeScale').value = 100;
        };
        img.src = tempCanvas.toDataURL();
    }

    /* ========== Resize ========== */
    bindResize() {
        const resizeBtn = document.getElementById('resizeBtn');
        const panel = document.getElementById('resizePanel');
        const wInput = document.getElementById('resizeW');
        const hInput = document.getElementById('resizeH');
        const scaleInput = document.getElementById('resizeScale');
        const lockCheck = document.getElementById('aspectLock');

        resizeBtn.addEventListener('click', () => {
            const showing = panel.style.display !== 'none';
            panel.style.display = showing ? 'none' : '';
            if (!showing) {
                wInput.value = this.imageWidth;
                hInput.value = this.imageHeight;
                scaleInput.value = 100;
            }
        });

        wInput.addEventListener('input', () => {
            if (lockCheck.checked) {
                const aspect = this.imageWidth / this.imageHeight;
                hInput.value = Math.round(parseInt(wInput.value) / aspect);
            }
            scaleInput.value = Math.round((parseInt(wInput.value) / this.imageWidth) * 100);
        });

        hInput.addEventListener('input', () => {
            if (lockCheck.checked) {
                const aspect = this.imageWidth / this.imageHeight;
                wInput.value = Math.round(parseInt(hInput.value) * aspect);
            }
            scaleInput.value = Math.round((parseInt(hInput.value) / this.imageHeight) * 100);
        });

        scaleInput.addEventListener('input', () => {
            const scale = parseInt(scaleInput.value) / 100;
            wInput.value = Math.round(this.imageWidth * scale);
            hInput.value = Math.round(this.imageHeight * scale);
        });

        document.getElementById('applyResizeBtn').addEventListener('click', () => this.applyResize());
        document.getElementById('cancelResizeBtn').addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }

    applyResize() {
        const newW = parseInt(document.getElementById('resizeW').value);
        const newH = parseInt(document.getElementById('resizeH').value);
        if (!newW || !newH || newW < 1 || newH < 1) return;

        this.pushUndo();

        const scaleX = newW / this.imageWidth;
        const scaleY = newH / this.imageHeight;

        // Redraw background at new size
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = newW;
        tempCanvas.height = newH;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.bgCanvas, 0, 0, newW, newH);

        this.imageWidth = newW;
        this.imageHeight = newH;

        this.sizeCanvasesToImage();
        this.bgCtx.drawImage(tempCanvas, 0, 0);

        // Scale annotations
        this.annotations = this.annotations.map(ann => {
            ann.x *= scaleX;
            ann.y *= scaleY;
            ann.width *= scaleX;
            ann.height *= scaleY;
            if (ann.type === 'text') {
                ann.fontSize = Math.round(ann.fontSize * ((scaleX + scaleY) / 2));
            }
            if (ann.type === 'freehand') {
                ann.points = ann.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
            }
            ann.strokeWidth = Math.max(1, Math.round(ann.strokeWidth * ((scaleX + scaleY) / 2)));
            return ann;
        });

        // Update original image ref
        const img = new Image();
        img.onload = () => { this.originalImage = img; };
        img.src = tempCanvas.toDataURL();

        document.getElementById('resizePanel').style.display = 'none';
        this.updateInfo();
        this.renderOverlay();
        this.debouncedExportSize();
    }

    /* ========== Export ========== */
    bindExport() {
        document.getElementById('downloadBtn').addEventListener('click', () => this.exportImage('download'));
        document.getElementById('copyClipboardBtn').addEventListener('click', () => this.exportImage('clipboard'));

        const qualitySlider = document.getElementById('exportQuality');
        qualitySlider.addEventListener('input', (e) => {
            document.getElementById('qualityVal').textContent = e.target.value;
            this.debouncedExportSize();
        });

        const formatSelect = document.getElementById('exportFormat');
        formatSelect.addEventListener('change', () => {
            document.getElementById('qualityGroup').style.display =
                formatSelect.value === 'image/png' ? 'none' : '';
            this.debouncedExportSize();
        });

        // Initial: hide quality for PNG
        document.getElementById('qualityGroup').style.display = 'none';
    }

    compositeCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = this.imageWidth;
        canvas.height = this.imageHeight;
        const ctx = canvas.getContext('2d');

        // Draw background image
        ctx.drawImage(this.bgCanvas, 0, 0);

        // Apply blur pixelation
        for (const ann of this.annotations) {
            if (ann.type === 'blur') {
                this.applyPixelation(ctx, ann);
            }
        }

        // Draw all non-blur annotations
        for (const ann of this.annotations) {
            if (ann.type !== 'blur') {
                this.drawAnnotation(ctx, ann);
            }
        }

        return canvas;
    }

    exportImage(mode) {
        const canvas = this.compositeCanvas();
        const format = document.getElementById('exportFormat').value;
        const quality = parseInt(document.getElementById('exportQuality').value) / 100;

        canvas.toBlob((blob) => {
            if (!blob) return;
            if (mode === 'download') {
                const ext = format === 'image/png' ? 'png' : format === 'image/jpeg' ? 'jpg' : 'webp';
                const baseName = this.originalFileName.replace(/\.[^.]+$/, '');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${baseName}-edited.${ext}`;
                a.click();
                URL.revokeObjectURL(a.href);
            } else if (mode === 'clipboard') {
                // Clipboard API requires PNG
                if (format !== 'image/png') {
                    // Convert to PNG for clipboard
                    canvas.toBlob((pngBlob) => {
                        navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
                            .then(() => this.showToast('Copied to clipboard'))
                            .catch(() => this.showToast('Clipboard copy failed'));
                    }, 'image/png');
                } else {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                        .then(() => this.showToast('Copied to clipboard'))
                        .catch(() => this.showToast('Clipboard copy failed'));
                }
            }
        }, format, quality);
    }

    updateExportSize() {
        const canvas = this.compositeCanvas();
        const format = document.getElementById('exportFormat').value;
        const quality = parseInt(document.getElementById('exportQuality').value) / 100;

        canvas.toBlob((blob) => {
            if (!blob) return;
            const sizeKB = (blob.size / 1024).toFixed(1);
            const origKB = this.originalFileSize ? (this.originalFileSize / 1024).toFixed(1) : '?';
            document.getElementById('fileSizeEstimate').textContent =
                `~${sizeKB} KB (original: ${origKB} KB)`;
        }, format, quality);
    }

    debouncedExportSize() {
        clearTimeout(this._exportTimer);
        this._exportTimer = setTimeout(() => this.updateExportSize(), 300);
    }

    showToast(msg) {
        // Brief toast notification
        const el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
            background:var(--bg-secondary);color:var(--text-primary);padding:8px 18px;
            border-radius:5px;border:1px solid var(--border-color);font-size:0.85rem;z-index:9999;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2000);
    }

    /* ========== Info ========== */
    updateInfo() {
        document.getElementById('imageDimensions').textContent =
            `${this.imageWidth} × ${this.imageHeight}px`;
        const origKB = this.originalFileSize ? ` (${(this.originalFileSize / 1024).toFixed(1)} KB)` : '';
        document.getElementById('originalSize').textContent = this.originalFileName + origKB;
        document.getElementById('annotationCount').textContent =
            `${this.annotations.length} annotation${this.annotations.length !== 1 ? 's' : ''}`;
    }

    /* ========== Keyboard Shortcuts ========== */
    bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't intercept when typing in inputs
            const tag = document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (!this.originalImage) return;

            if (e.ctrlKey || e.metaKey) {
                if (e.shiftKey && e.key === 'Z') {
                    e.preventDefault();
                    this.redo();
                    return;
                }
                if (e.key === 'z') {
                    e.preventDefault();
                    this.undo();
                    return;
                }
            }

            const keyMap = {
                v: 'select', a: 'arrow', r: 'rect', e: 'ellipse',
                l: 'line', t: 'text', p: 'freehand', b: 'blur'
            };

            const tool = keyMap[e.key.toLowerCase()];
            if (tool) {
                if (this.isCropping) this.exitCropMode();
                this.setActiveTool(tool);
                return;
            }

            if (e.key.toLowerCase() === 'c' && !e.ctrlKey) {
                this.enterCropMode();
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.deleteSelected();
                return;
            }

            if (e.key === 'Escape') {
                if (this.isCropping) {
                    this.exitCropMode();
                } else {
                    this.selectedAnnotation = -1;
                    this.renderOverlay();
                }
            }
        });
    }

    /* ========== Theme Observer ========== */
    observeTheme() {
        const observer = new MutationObserver(() => {
            this.renderOverlay();
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new ImageEditorApp();
});
