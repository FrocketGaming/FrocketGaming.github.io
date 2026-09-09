class PaletteExtractorApp {
    constructor() {
        this.canvas = document.getElementById('peCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.previewImg = document.getElementById('pePreviewImg');
        this.uploadSection = document.getElementById('uploadSection');
        this.extractorSection = document.getElementById('extractorSection');
        this.swatchBar = document.getElementById('swatchBar');
        this.swatchList = document.getElementById('swatchList');
        this.countValue = document.getElementById('countValue');
        this.countMinus = document.getElementById('countMinus');
        this.countPlus = document.getElementById('countPlus');
        this.errorEl = document.getElementById('peError');
        this.copyNotif = document.getElementById('copyNotification');

        this.minCount = 2;
        this.maxCount = 10;
        this.colorCount = 5;
        this.currentPalette = [];
        this.currentImage = null;

        this.init();
    }

    init() {
        this.bindUpload();
        this.bindClipboardPaste();
        this.bindControls();
    }

    // ─── Upload (drag/drop/browse/paste) ─────────────────────────

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

        document.getElementById('loadNewBtn').addEventListener('click', () => fileInput.click());
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
        this.clearError();

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => this.loadImage(img, e.target.result);
            img.onerror = () => this.showError('Could not load that image.');
            img.src = e.target.result;
        };
        reader.onerror = () => this.showError('Could not read that file.');
        reader.readAsDataURL(file);
    }

    loadImage(img, dataUrl) {
        this.currentImage = img;
        this.previewImg.src = dataUrl;
        this.uploadSection.style.display = 'none';
        this.extractorSection.style.display = 'flex';
        this.extractPalette();
    }

    // ─── Controls ─────────────────────────────────────────────────

    bindControls() {
        this.countMinus.addEventListener('click', () => this.changeCount(-1));
        this.countPlus.addEventListener('click', () => this.changeCount(1));
        document.getElementById('exportBtn').addEventListener('click', () => this.exportPalette());
        this.updateStepperState();
    }

    changeCount(delta) {
        const next = this.colorCount + delta;
        if (next < this.minCount || next > this.maxCount) return;
        this.colorCount = next;
        this.countValue.textContent = this.colorCount;
        this.updateStepperState();
        if (this.currentImage) this.extractPalette();
    }

    updateStepperState() {
        this.countMinus.disabled = this.colorCount <= this.minCount;
        this.countPlus.disabled = this.colorCount >= this.maxCount;
    }

    // ─── Extraction (client-side k-means color quantization) ─────

    extractPalette() {
        const img = this.currentImage;
        const maxDim = 160;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.drawImage(img, 0, 0, w, h);

        let data;
        try {
            data = this.ctx.getImageData(0, 0, w, h).data;
        } catch (e) {
            this.showError('Could not read pixel data from this image (it may be from a restricted source).');
            return;
        }

        const pixels = [];
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 125) continue; // skip mostly-transparent pixels
            pixels.push([data[i], data[i + 1], data[i + 2]]);
        }
        if (pixels.length === 0) {
            this.showError('This image has no visible pixels to sample.');
            return;
        }

        this.currentPalette = this.kMeans(pixels, this.colorCount);
        this.renderPalette();
    }

    kMeans(pixels, k, iterations = 8) {
        k = Math.min(k, pixels.length);
        const step = Math.max(1, Math.floor(pixels.length / k));
        let centroids = [];
        for (let i = 0; i < k; i++) {
            centroids.push(pixels[Math.min(pixels.length - 1, i * step)].slice());
        }

        let assignments = new Array(pixels.length).fill(0);
        for (let iter = 0; iter < iterations; iter++) {
            for (let p = 0; p < pixels.length; p++) {
                let best = 0, bestDist = Infinity;
                for (let c = 0; c < centroids.length; c++) {
                    const dr = pixels[p][0] - centroids[c][0];
                    const dg = pixels[p][1] - centroids[c][1];
                    const db = pixels[p][2] - centroids[c][2];
                    const dist = dr * dr + dg * dg + db * db;
                    if (dist < bestDist) { bestDist = dist; best = c; }
                }
                assignments[p] = best;
            }

            const sums = Array.from({ length: centroids.length }, () => [0, 0, 0, 0]);
            for (let p = 0; p < pixels.length; p++) {
                const c = assignments[p];
                sums[c][0] += pixels[p][0];
                sums[c][1] += pixels[p][1];
                sums[c][2] += pixels[p][2];
                sums[c][3]++;
            }
            for (let c = 0; c < centroids.length; c++) {
                if (sums[c][3] > 0) {
                    centroids[c] = [
                        Math.round(sums[c][0] / sums[c][3]),
                        Math.round(sums[c][1] / sums[c][3]),
                        Math.round(sums[c][2] / sums[c][3])
                    ];
                }
            }
        }

        const counts = new Array(centroids.length).fill(0);
        assignments.forEach(a => counts[a]++);

        return centroids
            .map((rgb, i) => ({ rgb, count: counts[i] }))
            .filter(c => c.count > 0)
            .sort((a, b) => b.count - a.count);
    }

    // ─── Rendering ─────────────────────────────────────────────────

    renderPalette() {
        this.swatchBar.innerHTML = '';
        this.swatchList.innerHTML = '';

        this.currentPalette.forEach(({ rgb }) => {
            const hex = this.rgbToHex(rgb);

            const seg = document.createElement('div');
            seg.className = 'pe-swatch-bar-seg';
            seg.style.backgroundColor = hex;
            seg.title = hex;
            seg.addEventListener('click', () => this.copyText(hex, `${hex} copied!`));
            this.swatchBar.appendChild(seg);

            const row = document.createElement('div');
            row.className = 'pe-swatch-row';
            row.addEventListener('click', () => this.copyText(hex, `${hex} copied!`));

            const chip = document.createElement('div');
            chip.className = 'pe-swatch-chip';
            chip.style.backgroundColor = hex;

            const text = document.createElement('div');
            text.className = 'pe-swatch-text';
            const hexEl = document.createElement('span');
            hexEl.className = 'pe-swatch-hex';
            hexEl.textContent = hex;
            const rgbEl = document.createElement('span');
            rgbEl.className = 'pe-swatch-rgb';
            rgbEl.textContent = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            text.appendChild(hexEl);
            text.appendChild(rgbEl);

            const copyIcon = document.createElement('i');
            copyIcon.className = 'fa-solid fa-copy pe-swatch-copy';

            row.appendChild(chip);
            row.appendChild(text);
            row.appendChild(copyIcon);
            this.swatchList.appendChild(row);
        });
    }

    // ─── Actions ───────────────────────────────────────────────────

    exportPalette() {
        if (!this.currentPalette.length) return;
        const hexes = this.currentPalette.map(({ rgb }) => this.rgbToHex(rgb));
        this.copyText(hexes.join(', '), 'Palette copied!');
    }

    copyText(text, msg) {
        navigator.clipboard.writeText(text).then(() => this.showCopyNotif(msg));
    }

    showCopyNotif(msg) {
        this.copyNotif.textContent = msg;
        this.copyNotif.classList.add('show');
        clearTimeout(this._copyTimer);
        this._copyTimer = setTimeout(() => this.copyNotif.classList.remove('show'), 1800);
    }

    showError(msg) {
        this.errorEl.textContent = '⚠ ' + msg;
        this.errorEl.style.display = 'block';
    }

    clearError() {
        this.errorEl.textContent = '';
        this.errorEl.style.display = 'none';
    }

    // ─── Helpers ─────────────────────────────────────────────────

    rgbToHex([r, g, b]) {
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }
}

document.addEventListener('DOMContentLoaded', () => new PaletteExtractorApp());
