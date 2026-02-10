class ChartBuilderApp {
    constructor() {
        this.parsedData = null; // { headers: [], rows: [[]], columnTypes: [] }
        this.aggregatedData = null; // transformed view or null for raw
        this.chartType = 'bar';
        this.selectedDatasets = [];
        this.annotations = [];

        // Multi-panel dashboard
        this.panels = [{
            id: 0,
            chartDiv: null,
            chartType: 'bar',
            selectedDatasets: [],
            annotations: [],
            options: {
                title: '',
                xLabel: '',
                yLabel: '',
                legendPosition: 'top',
                showGrid: true,
                beginAtZero: true,
                stacked: false,
                sortXAxis: false,
                colorScheme: 'theme',
                labelColumn: 0
            },
            bubbleMapping: { x: 0, y: 1, r: 2 },
            heatmapMapping: { valueCol: 0 }
        }];
        this.activePanel = 0;
        this.nextPanelId = 1;

        this.sampleData = {
            sales: {
                headers: ['Month', 'Electronics', 'Clothing', 'Food'],
                rows: [
                    ['Jan', 4200, 3100, 2800],
                    ['Feb', 3800, 2900, 2600],
                    ['Mar', 5100, 3400, 3200],
                    ['Apr', 4600, 3800, 2900],
                    ['May', 5300, 4200, 3400],
                    ['Jun', 4900, 4500, 3100],
                    ['Jul', 5800, 4100, 3600],
                    ['Aug', 6200, 3900, 3800],
                    ['Sep', 5500, 4300, 3300],
                    ['Oct', 5900, 4700, 3500],
                    ['Nov', 7200, 5800, 4100],
                    ['Dec', 8100, 6200, 4600]
                ]
            },
            temperature: {
                headers: ['Month', 'New York', 'London', 'Tokyo', 'Sydney'],
                rows: [
                    ['Jan', 1, 5, 6, 26],
                    ['Feb', 2, 5, 7, 26],
                    ['Mar', 7, 8, 10, 24],
                    ['Apr', 13, 11, 15, 21],
                    ['May', 18, 15, 20, 17],
                    ['Jun', 24, 18, 23, 14],
                    ['Jul', 27, 21, 27, 13],
                    ['Aug', 26, 20, 28, 14],
                    ['Sep', 22, 17, 24, 17],
                    ['Oct', 16, 13, 18, 20],
                    ['Nov', 9, 9, 13, 22],
                    ['Dec', 3, 6, 8, 25]
                ]
            },
            population: {
                headers: ['Country', 'Population (M)', 'Urban (%)', 'Growth Rate (%)'],
                rows: [
                    ['China', 1412, 64, 0.1],
                    ['India', 1408, 35, 0.8],
                    ['USA', 332, 83, 0.4],
                    ['Indonesia', 276, 57, 0.9],
                    ['Pakistan', 229, 37, 1.9],
                    ['Brazil', 215, 87, 0.5],
                    ['Nigeria', 219, 52, 2.5],
                    ['Bangladesh', 169, 39, 1.0],
                    ['Russia', 146, 75, -0.2],
                    ['Mexico', 130, 81, 0.6]
                ]
            },
            stocks: {
                headers: ['Week', 'AAPL', 'GOOGL', 'MSFT', 'AMZN'],
                rows: [
                    ['Week 1', 172, 140, 375, 145],
                    ['Week 2', 175, 142, 380, 148],
                    ['Week 3', 171, 138, 372, 143],
                    ['Week 4', 178, 145, 385, 150],
                    ['Week 5', 182, 148, 390, 155],
                    ['Week 6', 179, 146, 388, 152],
                    ['Week 7', 185, 150, 395, 158],
                    ['Week 8', 188, 153, 400, 162],
                    ['Week 9', 184, 149, 392, 157],
                    ['Week 10', 190, 155, 405, 165],
                    ['Week 11', 193, 158, 410, 168],
                    ['Week 12', 196, 160, 415, 172]
                ]
            }
        };

        this.colorPalettes = {
            pastel: [
                'rgba(255, 179, 186, 0.85)', 'rgba(255, 223, 186, 0.85)', 'rgba(255, 255, 186, 0.85)',
                'rgba(186, 255, 201, 0.85)', 'rgba(186, 225, 255, 0.85)', 'rgba(218, 186, 255, 0.85)',
                'rgba(255, 186, 243, 0.85)', 'rgba(186, 255, 255, 0.85)'
            ],
            vivid: [
                'rgba(255, 59, 48, 0.85)', 'rgba(255, 149, 0, 0.85)', 'rgba(255, 204, 0, 0.85)',
                'rgba(52, 199, 89, 0.85)', 'rgba(0, 122, 255, 0.85)', 'rgba(88, 86, 214, 0.85)',
                'rgba(255, 45, 85, 0.85)', 'rgba(175, 82, 222, 0.85)'
            ],
            monochrome: []
        };

        this.init();
    }

    init() {
        this.bindInputTabs();
        this.bindUpload();
        this.bindPaste();
        this.bindSampleData();
        this.bindChartType();
        this.bindOptions();
        this.bindExport();
        this.bindDataMapping();
        this.bindPreviewToggle();
        this.bindAnnotations();
        this.bindAggregation();
        this.bindDashboard();
        this.bindBubbleMapping();
        this.bindHeatmapMapping();
        this.updateColorSwatches();
        this.setupThemeObserver();
        this.toggleOptionVisibility();
    }

    // ==================== Input Tabs ====================
    bindInputTabs() {
        document.querySelectorAll('.input-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchInputTab(tab.dataset.tab));
        });
    }

    switchInputTab(tabName) {
        document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.input-tab[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
    }

    // ==================== File Upload ====================
    bindUpload() {
        const zone = document.getElementById('uploadZone');
        const input = document.getElementById('fileInput');

        zone.addEventListener('click', () => input.click());

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileUpload(file);
        });

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFileUpload(file);
        });
    }

    handleFileUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext === 'json') {
                this.parseJSON(text);
            } else {
                this.parseCSV(text);
            }
        };
        reader.readAsText(file);
    }

    // ==================== Paste ====================
    bindPaste() {
        document.getElementById('parseDataBtn').addEventListener('click', () => this.handlePaste());
    }

    handlePaste() {
        const text = document.getElementById('pasteData').value.trim();
        if (!text) return;

        if (text.startsWith('[') || text.startsWith('{')) {
            try {
                this.parseJSON(text);
                return;
            } catch (e) {
                // Fall through to CSV
            }
        }
        this.parseCSV(text);
    }

    // ==================== Sample Data ====================
    bindSampleData() {
        document.querySelectorAll('.sample-btn').forEach(btn => {
            btn.addEventListener('click', () => this.loadSampleData(btn.dataset.sample));
        });
    }

    loadSampleData(name) {
        const data = this.sampleData[name];
        if (!data) return;
        this.parsedData = {
            headers: [...data.headers],
            rows: data.rows.map(r => [...r]),
            columnTypes: this.detectColumnTypes(data.headers, data.rows)
        };
        this.aggregatedData = null;
        this.onDataLoaded();
    }

    // ==================== Parsing ====================
    parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
            this.showStatus('Need at least a header row and one data row', false);
            return;
        }

        const delimiter = this.detectDelimiter(lines[0]);
        const headers = this.parseCSVLine(lines[0], delimiter);
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i], delimiter);
            if (row.length === headers.length) {
                rows.push(row.map(val => {
                    const num = Number(val);
                    return isNaN(num) || val.trim() === '' ? val : num;
                }));
            }
        }

        if (rows.length === 0) {
            this.showStatus('No valid data rows found', false);
            return;
        }

        this.parsedData = {
            headers,
            rows,
            columnTypes: this.detectColumnTypes(headers, rows)
        };
        this.aggregatedData = null;
        this.onDataLoaded();
    }

    parseCSVLine(line, delimiter) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === delimiter) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        result.push(current.trim());
        return result;
    }

    parseJSON(text) {
        let data = JSON.parse(text);
        if (!Array.isArray(data)) {
            if (typeof data === 'object' && data !== null) {
                const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
                if (arrayKey) {
                    data = data[arrayKey];
                } else {
                    data = [data];
                }
            } else {
                this.showStatus('Invalid JSON format', false);
                return;
            }
        }

        if (data.length === 0) {
            this.showStatus('JSON array is empty', false);
            return;
        }

        const headers = Object.keys(data[0]);
        const rows = data.map(item => headers.map(h => {
            const val = item[h];
            if (val === null || val === undefined) return '';
            return val;
        }));

        this.parsedData = {
            headers,
            rows,
            columnTypes: this.detectColumnTypes(headers, rows)
        };
        this.aggregatedData = null;
        this.onDataLoaded();
    }

    detectDelimiter(line) {
        const delimiters = [',', '\t', ';', '|'];
        let best = ',';
        let bestCount = 0;

        for (const d of delimiters) {
            const count = line.split(d).length - 1;
            if (count > bestCount) {
                bestCount = count;
                best = d;
            }
        }
        return best;
    }

    detectColumnTypes(headers, rows) {
        return headers.map((_, colIndex) => {
            let numericCount = 0;
            let dateCount = 0;
            let total = 0;

            for (const row of rows) {
                const val = row[colIndex];
                const str = String(val).trim();
                if (str === '') continue;
                total++;

                if (typeof val === 'number' || (!isNaN(Number(str)) && str !== '')) {
                    numericCount++;
                }

                if (this.parseDateValue(str)) {
                    dateCount++;
                }
            }

            if (total === 0) return 'string';
            if (numericCount > total * 0.5) return 'numeric';
            if (dateCount > total * 0.5) return 'date';
            return 'string';
        });
    }

    parseDateValue(val) {
        if (!val || typeof val !== 'string') return null;
        const str = val.trim();

        // ISO 8601: 2024-01-15 or 2024-01-15T10:30:00
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            const d = new Date(str);
            if (!isNaN(d.getTime())) return d;
        }

        // US format: 01/15/2024 or 1/15/2024
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
            const parts = str.split('/');
            const d = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
            if (!isNaN(d.getTime())) return d;
        }

        // EU format: 15.01.2024 or 15-01-2024
        if (/^\d{1,2}[.\-]\d{1,2}[.\-]\d{4}$/.test(str)) {
            const parts = str.split(/[.\-]/);
            const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            if (!isNaN(d.getTime())) return d;
        }

        // Timestamps (Unix seconds or ms)
        if (/^\d{10,13}$/.test(str)) {
            const num = Number(str);
            const d = new Date(str.length === 10 ? num * 1000 : num);
            if (!isNaN(d.getTime()) && d.getFullYear() > 1970 && d.getFullYear() < 2100) return d;
        }

        return null;
    }

    // ==================== Active Data ====================
    getActiveData() {
        return this.aggregatedData || this.parsedData;
    }

    // ==================== Data Loaded ====================
    onDataLoaded() {
        const { headers, rows } = this.parsedData;
        this.showStatus(`${headers.length} columns, ${rows.length} rows detected`, true);
        this.populateColumnSelectors();
        this.renderDataPreview();

        // Show aggregation card
        document.getElementById('aggregationCard').style.display = '';
        this.populateGroupByDropdown();

        this.renderActiveChart();
    }

    showStatus(msg, success) {
        const el = document.getElementById('dataStatus');
        el.textContent = msg;
        el.classList.add('visible');
        el.classList.toggle('success', success);
    }

    // ==================== Column Selectors ====================
    populateColumnSelectors() {
        const data = this.getActiveData();
        if (!data) return;
        const { headers, columnTypes } = data;

        // Label column dropdown
        const labelSelect = document.getElementById('labelColumn');
        labelSelect.innerHTML = '';
        headers.forEach((h, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            const suffix = columnTypes[i] === 'date' ? ' (date)' : '';
            opt.textContent = h + suffix;
            labelSelect.appendChild(opt);
        });

        // Auto-select: prefer first string column, then first date column
        const panel = this.panels.find(p => p.id === this.activePanel);
        const firstStringIdx = columnTypes.indexOf('string');
        const firstDateIdx = columnTypes.indexOf('date');
        if (firstStringIdx >= 0) {
            labelSelect.value = firstStringIdx;
        } else if (firstDateIdx >= 0) {
            labelSelect.value = firstDateIdx;
        }
        if (panel && panel.options.labelColumn !== undefined) {
            const savedVal = panel.options.labelColumn;
            if (savedVal < headers.length) {
                labelSelect.value = savedVal;
            }
        }

        // Dataset checkboxes
        const container = document.getElementById('datasetCheckboxes');
        container.innerHTML = '';
        this.selectedDatasets = [];

        headers.forEach((h, i) => {
            if (columnTypes[i] === 'numeric') {
                const label = document.createElement('label');
                label.className = 'dataset-checkbox';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = i;
                cb.checked = true;
                cb.addEventListener('change', () => this.onDatasetToggle());
                label.appendChild(cb);
                label.appendChild(document.createTextNode(h));
                container.appendChild(label);
                this.selectedDatasets.push(i);
            }
        });

        if (this.selectedDatasets.length === 0) {
            container.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.8rem;">No numeric columns found</span>';
        }

        // Populate bubble mapping dropdowns
        this.populateBubbleSelectors();
        this.populateHeatmapSelectors();
    }

    populateBubbleSelectors() {
        const data = this.getActiveData();
        if (!data) return;
        const { headers, columnTypes } = data;
        const numericCols = headers.map((h, i) => ({ name: h, index: i }))
            .filter((_, i) => columnTypes[i] === 'numeric');

        ['bubbleXCol', 'bubbleYCol', 'bubbleRCol'].forEach((id, selectIdx) => {
            const sel = document.getElementById(id);
            sel.innerHTML = '';
            numericCols.forEach((col, j) => {
                const opt = document.createElement('option');
                opt.value = col.index;
                opt.textContent = col.name;
                if (j === selectIdx && selectIdx < numericCols.length) {
                    opt.selected = true;
                }
                sel.appendChild(opt);
            });
        });
    }

    populateHeatmapSelectors() {
        const data = this.getActiveData();
        if (!data) return;
        const { headers, columnTypes } = data;
        const numericCols = headers.map((h, i) => ({ name: h, index: i }))
            .filter((_, i) => columnTypes[i] === 'numeric');

        const sel = document.getElementById('heatmapValueCol');
        sel.innerHTML = '';
        numericCols.forEach((col, j) => {
            const opt = document.createElement('option');
            opt.value = col.index;
            opt.textContent = col.name;
            if (j === 0) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    onDatasetToggle() {
        this.selectedDatasets = [];
        document.querySelectorAll('#datasetCheckboxes input[type="checkbox"]:checked').forEach(cb => {
            this.selectedDatasets.push(Number(cb.value));
        });
        this.renderActiveChart();
    }

    bindDataMapping() {
        document.getElementById('labelColumn').addEventListener('change', () => this.renderActiveChart());
        document.getElementById('selectAllBtn').addEventListener('click', () => {
            document.querySelectorAll('#datasetCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
            this.onDatasetToggle();
        });
        document.getElementById('clearAllBtn').addEventListener('click', () => {
            document.querySelectorAll('#datasetCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
            this.onDatasetToggle();
        });
    }

    bindBubbleMapping() {
        ['bubbleXCol', 'bubbleYCol', 'bubbleRCol'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.renderActiveChart());
        });
    }

    bindHeatmapMapping() {
        document.getElementById('heatmapValueCol').addEventListener('change', () => this.renderActiveChart());
    }

    // ==================== Chart Type ====================
    bindChartType() {
        document.querySelectorAll('.chart-type-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setChartType(btn.dataset.type));
        });
    }

    setChartType(type) {
        this.chartType = type;
        document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.chart-type-btn[data-type="${type}"]`).classList.add('active');
        this.toggleOptionVisibility();
        this.renderActiveChart();
    }

    toggleOptionVisibility() {
        const t = this.chartType;
        const isPie = t === 'pie' || t === 'doughnut';
        const isRadar = t === 'radar';
        const isBubble = t === 'bubble';
        const isHeatmap = t === 'heatmap';

        const hideAxis = isPie || isRadar;
        const hideGrid = isPie;
        const hideZero = isPie || isRadar;
        const hideStacked = isPie || isRadar || isBubble || isHeatmap ||
            t === 'box' || t === 'histogram';
        const hideSortX = isPie || isRadar || isHeatmap;
        const hideAnnotations = isPie || isRadar;

        document.getElementById('xAxisRow').style.display = hideAxis ? 'none' : '';
        document.getElementById('yAxisRow').style.display = hideAxis ? 'none' : '';
        document.getElementById('gridToggleRow').style.display = hideGrid ? 'none' : '';
        document.getElementById('zeroToggleRow').style.display = hideZero ? 'none' : '';
        document.getElementById('stackedToggleRow').style.display = hideStacked ? 'none' : '';
        document.getElementById('sortXToggleRow').style.display = hideSortX ? 'none' : '';
        document.getElementById('annotationsCard').style.display = hideAnnotations ? 'none' : '';

        // Bubble mapping card
        document.getElementById('bubbleMappingCard').style.display = isBubble ? '' : 'none';

        // Heatmap mapping card
        document.getElementById('heatmapMappingCard').style.display = isHeatmap ? '' : 'none';

        // Data mapping card: hide for bubble, heatmap
        document.getElementById('dataMappingCard').style.display = (isBubble || isHeatmap) ? 'none' : '';
    }

    // ==================== Options ====================
    bindOptions() {
        ['chartTitle', 'xAxisLabel', 'yAxisLabel'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.renderActiveChart());
        });
        ['legendPosition', 'colorScheme'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                if (id === 'colorScheme') this.updateColorSwatches();
                this.renderActiveChart();
            });
        });
        ['showGrid', 'beginAtZero', 'stacked', 'sortXAxis'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.renderActiveChart());
        });
    }

    // ==================== Annotations ====================
    bindAnnotations() {
        document.getElementById('addAnnotationBtn').addEventListener('click', () => this.addAnnotation());
    }

    addAnnotation() {
        const ann = { axis: 'y', value: 0, label: '', color: '#ff6b6b' };
        this.annotations.push(ann);
        this.renderAnnotationsList();
        this.renderActiveChart();
    }

    removeAnnotation(index) {
        this.annotations.splice(index, 1);
        this.renderAnnotationsList();
        this.renderActiveChart();
    }

    renderAnnotationsList() {
        const container = document.getElementById('annotationsList');
        container.innerHTML = '';

        this.annotations.forEach((ann, i) => {
            const entry = document.createElement('div');
            entry.className = 'annotation-entry';

            entry.innerHTML = `
                <select class="ann-axis">
                    <option value="y" ${ann.axis === 'y' ? 'selected' : ''}>Horizontal</option>
                    <option value="x" ${ann.axis === 'x' ? 'selected' : ''}>Vertical</option>
                </select>
                <input type="number" class="ann-value" placeholder="Value" value="${ann.value}" step="any">
                <input type="text" class="ann-label" placeholder="Label" value="${this.escapeHTML(ann.label)}">
                <input type="color" class="ann-color" value="${ann.color}">
                <button class="ann-remove"><i class="fa-solid fa-xmark"></i></button>
            `;

            entry.querySelector('.ann-axis').addEventListener('change', (e) => {
                this.annotations[i].axis = e.target.value;
                this.renderActiveChart();
            });
            entry.querySelector('.ann-value').addEventListener('input', (e) => {
                this.annotations[i].value = Number(e.target.value) || 0;
                this.renderActiveChart();
            });
            entry.querySelector('.ann-label').addEventListener('input', (e) => {
                this.annotations[i].label = e.target.value;
                this.renderActiveChart();
            });
            entry.querySelector('.ann-color').addEventListener('input', (e) => {
                this.annotations[i].color = e.target.value;
                this.renderActiveChart();
            });
            entry.querySelector('.ann-remove').addEventListener('click', () => {
                this.removeAnnotation(i);
            });

            container.appendChild(entry);
        });
    }

    buildAnnotationShapes() {
        if (this.annotations.length === 0) return { shapes: [], annotations: [] };

        const shapes = [];
        const labels = [];

        this.annotations.forEach(ann => {
            if (ann.axis === 'y') {
                // Horizontal line
                shapes.push({
                    type: 'line',
                    x0: 0, x1: 1,
                    y0: ann.value, y1: ann.value,
                    xref: 'paper', yref: 'y',
                    line: { color: ann.color, width: 2, dash: 'dash' }
                });
                if (ann.label) {
                    labels.push({
                        x: 0.02, y: ann.value,
                        xref: 'paper', yref: 'y',
                        text: ann.label,
                        showarrow: false,
                        font: { size: 11, family: 'Raleway', color: '#fff' },
                        bgcolor: ann.color,
                        borderpad: 3
                    });
                }
            } else {
                // Vertical line
                shapes.push({
                    type: 'line',
                    x0: ann.value, x1: ann.value,
                    y0: 0, y1: 1,
                    xref: 'x', yref: 'paper',
                    line: { color: ann.color, width: 2, dash: 'dash' }
                });
                if (ann.label) {
                    labels.push({
                        x: ann.value, y: 0.98,
                        xref: 'x', yref: 'paper',
                        text: ann.label,
                        showarrow: false,
                        font: { size: 11, family: 'Raleway', color: '#fff' },
                        bgcolor: ann.color,
                        borderpad: 3
                    });
                }
            }
        });

        return { shapes, annotations: labels };
    }

    // ==================== Aggregation ====================
    bindAggregation() {
        document.getElementById('applyAggBtn').addEventListener('click', () => this.applyAggregation());
        document.getElementById('clearAggBtn').addEventListener('click', () => this.clearAggregation());
    }

    populateGroupByDropdown() {
        if (!this.parsedData) return;
        const sel = document.getElementById('groupByCol');
        sel.innerHTML = '<option value="">None</option>';
        this.parsedData.headers.forEach((h, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = h;
            sel.appendChild(opt);
        });
    }

    applyAggregation() {
        if (!this.parsedData) return;
        const groupByIdx = document.getElementById('groupByCol').value;
        if (groupByIdx === '') {
            this.clearAggregation();
            return;
        }

        const colIdx = Number(groupByIdx);
        const func = document.getElementById('aggFunction').value;
        const { headers, rows } = this.parsedData;

        // Group rows by the selected column
        const groups = {};
        for (const row of rows) {
            const key = String(row[colIdx]);
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        }

        // Determine numeric columns
        const numericIndices = headers.map((_, i) => i)
            .filter(i => i !== colIdx && this.parsedData.columnTypes[i] === 'numeric');

        // Build aggregated rows
        const newHeaders = [headers[colIdx], ...numericIndices.map(i => headers[i])];
        const newRows = [];

        for (const [key, groupRows] of Object.entries(groups)) {
            const row = [key];
            for (const ni of numericIndices) {
                const values = groupRows.map(r => Number(r[ni]) || 0);
                let result;
                switch (func) {
                    case 'sum':
                        result = values.reduce((a, b) => a + b, 0);
                        break;
                    case 'avg':
                        result = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                        result = Math.round(result * 100) / 100;
                        break;
                    case 'min':
                        result = Math.min(...values);
                        break;
                    case 'max':
                        result = Math.max(...values);
                        break;
                    case 'count':
                        result = values.length;
                        break;
                    default:
                        result = values.reduce((a, b) => a + b, 0);
                }
                row.push(result);
            }
            newRows.push(row);
        }

        this.aggregatedData = {
            headers: newHeaders,
            rows: newRows,
            columnTypes: this.detectColumnTypes(newHeaders, newRows)
        };

        this.showStatus(`Aggregated: ${Object.keys(groups).length} groups (${func})`, true);
        this.populateColumnSelectors();
        this.renderDataPreview();
        this.renderActiveChart();
    }

    clearAggregation() {
        this.aggregatedData = null;
        if (this.parsedData) {
            this.showStatus(`${this.parsedData.headers.length} columns, ${this.parsedData.rows.length} rows detected`, true);
            this.populateColumnSelectors();
            this.renderDataPreview();
            this.renderActiveChart();
        }
    }

    // ==================== Dashboard ====================
    bindDashboard() {
        document.getElementById('addPanelBtn').addEventListener('click', () => this.addPanel());

        document.getElementById('panelTabs').addEventListener('click', (e) => {
            const tab = e.target.closest('.panel-tab');
            if (!tab) return;

            const removeBtn = e.target.closest('.remove-tab');
            if (removeBtn) {
                const panelId = Number(tab.dataset.panel);
                this.removePanel(panelId);
                return;
            }

            this.switchPanel(Number(tab.dataset.panel));
        });

        // Click on chart panel to select it
        document.getElementById('chartPanelsGrid').addEventListener('click', (e) => {
            const panel = e.target.closest('.chart-panel');
            if (panel) {
                this.switchPanel(Number(panel.dataset.panel));
            }
        });
    }

    addPanel() {
        if (this.panels.length >= 4) {
            this.showStatus('Maximum 4 charts allowed', false);
            return;
        }

        this.saveActivePanelConfig();

        const newId = this.nextPanelId++;
        const panel = {
            id: newId,
            chartDiv: null,
            chartType: 'bar',
            selectedDatasets: [...this.selectedDatasets],
            annotations: [],
            options: {
                title: '',
                xLabel: '',
                yLabel: '',
                legendPosition: 'top',
                showGrid: true,
                beginAtZero: true,
                stacked: false,
                sortXAxis: false,
                colorScheme: 'theme',
                labelColumn: Number(document.getElementById('labelColumn').value) || 0
            },
            bubbleMapping: { x: 0, y: 1, r: 2 },
            heatmapMapping: { valueCol: 0 }
        };
        this.panels.push(panel);

        // Add tab
        const tab = document.createElement('button');
        tab.className = 'panel-tab';
        tab.dataset.panel = newId;
        tab.innerHTML = `Chart ${this.panels.length} <span class="remove-tab"><i class="fa-solid fa-xmark"></i></span>`;
        document.getElementById('panelTabs').appendChild(tab);

        // Add chart panel div
        const panelDiv = document.createElement('div');
        panelDiv.className = 'chart-panel';
        panelDiv.dataset.panel = newId;
        panelDiv.innerHTML = `
            <div class="chart-canvas-wrapper">
                <div class="chart-placeholder">
                    <i class="fa-solid fa-chart-bar"></i>
                    <p>Select chart type and data</p>
                </div>
                <div class="panel-chart" style="display:none;"></div>
            </div>
        `;
        document.getElementById('chartPanelsGrid').appendChild(panelDiv);

        // Add remove button to first tab if now there are 2+ panels
        this.updateTabRemoveButtons();
        this.updateGridLayout();
        this.switchPanel(newId);
    }

    removePanel(id) {
        if (this.panels.length <= 1) return;

        const idx = this.panels.findIndex(p => p.id === id);
        if (idx === -1) return;

        // Purge Plotly chart
        const panelDiv = document.querySelector(`.chart-panel[data-panel="${id}"]`);
        if (panelDiv) {
            const chartDiv = panelDiv.querySelector('.panel-chart');
            if (chartDiv) {
                try { Plotly.purge(chartDiv); } catch (e) { /* ignore */ }
            }
        }

        this.panels.splice(idx, 1);

        // Remove tab and panel div
        const tab = document.querySelector(`.panel-tab[data-panel="${id}"]`);
        if (tab) tab.remove();
        if (panelDiv) panelDiv.remove();

        // Rename tabs
        document.querySelectorAll('.panel-tab').forEach((t, i) => {
            t.childNodes[0].textContent = `Chart ${i + 1} `;
        });

        // Switch to first panel if we removed the active one
        if (this.activePanel === id) {
            this.switchPanel(this.panels[0].id);
        }

        this.updateTabRemoveButtons();
        this.updateGridLayout();
    }

    switchPanel(id) {
        // Save current panel config before switching
        this.saveActivePanelConfig();

        this.activePanel = id;

        // Update tab active states
        document.querySelectorAll('.panel-tab').forEach(t => {
            t.classList.toggle('active', Number(t.dataset.panel) === id);
        });

        // Update panel active states
        document.querySelectorAll('.chart-panel').forEach(p => {
            p.classList.toggle('active', Number(p.dataset.panel) === id);
        });

        // Load panel config into sidebar
        this.loadPanelConfig(id);
    }

    saveActivePanelConfig() {
        const panel = this.panels.find(p => p.id === this.activePanel);
        if (!panel) return;

        panel.chartType = this.chartType;
        panel.selectedDatasets = [...this.selectedDatasets];
        panel.annotations = this.annotations.map(a => ({ ...a }));
        panel.options = {
            title: document.getElementById('chartTitle').value,
            xLabel: document.getElementById('xAxisLabel').value,
            yLabel: document.getElementById('yAxisLabel').value,
            legendPosition: document.getElementById('legendPosition').value,
            showGrid: document.getElementById('showGrid').checked,
            beginAtZero: document.getElementById('beginAtZero').checked,
            stacked: document.getElementById('stacked').checked,
            sortXAxis: document.getElementById('sortXAxis').checked,
            colorScheme: document.getElementById('colorScheme').value,
            labelColumn: Number(document.getElementById('labelColumn').value) || 0
        };
        panel.bubbleMapping = {
            x: Number(document.getElementById('bubbleXCol').value) || 0,
            y: Number(document.getElementById('bubbleYCol').value) || 0,
            r: Number(document.getElementById('bubbleRCol').value) || 0
        };
        panel.heatmapMapping = {
            valueCol: Number(document.getElementById('heatmapValueCol').value) || 0
        };
    }

    loadPanelConfig(id) {
        const panel = this.panels.find(p => p.id === id);
        if (!panel) return;

        // Set chart type
        this.chartType = panel.chartType;
        document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
        const typeBtn = document.querySelector(`.chart-type-btn[data-type="${panel.chartType}"]`);
        if (typeBtn) typeBtn.classList.add('active');

        // Set options
        document.getElementById('chartTitle').value = panel.options.title || '';
        document.getElementById('xAxisLabel').value = panel.options.xLabel || '';
        document.getElementById('yAxisLabel').value = panel.options.yLabel || '';
        document.getElementById('legendPosition').value = panel.options.legendPosition || 'top';
        document.getElementById('showGrid').checked = panel.options.showGrid !== false;
        document.getElementById('beginAtZero').checked = panel.options.beginAtZero !== false;
        document.getElementById('stacked').checked = panel.options.stacked || false;
        document.getElementById('sortXAxis').checked = panel.options.sortXAxis || false;
        document.getElementById('colorScheme').value = panel.options.colorScheme || 'theme';

        // Set label column
        const labelSelect = document.getElementById('labelColumn');
        if (panel.options.labelColumn !== undefined && panel.options.labelColumn < labelSelect.options.length) {
            labelSelect.value = panel.options.labelColumn;
        }

        // Set dataset checkboxes
        this.selectedDatasets = panel.selectedDatasets ? [...panel.selectedDatasets] : [];
        document.querySelectorAll('#datasetCheckboxes input[type="checkbox"]').forEach(cb => {
            cb.checked = this.selectedDatasets.includes(Number(cb.value));
        });

        // Set annotations
        this.annotations = panel.annotations ? panel.annotations.map(a => ({ ...a })) : [];
        this.renderAnnotationsList();

        // Set bubble mapping
        if (panel.bubbleMapping) {
            const bx = document.getElementById('bubbleXCol');
            const by = document.getElementById('bubbleYCol');
            const br = document.getElementById('bubbleRCol');
            if (bx.querySelector(`option[value="${panel.bubbleMapping.x}"]`)) bx.value = panel.bubbleMapping.x;
            if (by.querySelector(`option[value="${panel.bubbleMapping.y}"]`)) by.value = panel.bubbleMapping.y;
            if (br.querySelector(`option[value="${panel.bubbleMapping.r}"]`)) br.value = panel.bubbleMapping.r;
        }

        // Set heatmap mapping
        if (panel.heatmapMapping) {
            const hv = document.getElementById('heatmapValueCol');
            if (hv.querySelector(`option[value="${panel.heatmapMapping.valueCol}"]`)) {
                hv.value = panel.heatmapMapping.valueCol;
            }
        }

        this.updateColorSwatches();
        this.toggleOptionVisibility();
    }

    updateTabRemoveButtons() {
        const tabs = document.querySelectorAll('.panel-tab');
        tabs.forEach(tab => {
            let removeBtn = tab.querySelector('.remove-tab');
            if (this.panels.length > 1) {
                if (!removeBtn) {
                    const span = document.createElement('span');
                    span.className = 'remove-tab';
                    span.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                    tab.appendChild(span);
                }
            } else {
                if (removeBtn) removeBtn.remove();
            }
        });
    }

    updateGridLayout() {
        const grid = document.getElementById('chartPanelsGrid');
        grid.classList.remove('cols-2', 'cols-2x2');
        if (this.panels.length === 2) {
            grid.classList.add('cols-2');
        } else if (this.panels.length >= 3) {
            grid.classList.add('cols-2x2');
        }
    }

    // ==================== Rendering (Plotly) ====================
    renderActiveChart() {
        const panel = this.panels.find(p => p.id === this.activePanel);
        if (!panel) return;

        const data = this.getActiveData();
        const panelDiv = document.querySelector(`.chart-panel[data-panel="${this.activePanel}"]`);
        if (!panelDiv) return;

        const chartDiv = panelDiv.querySelector('.panel-chart');
        const placeholder = panelDiv.querySelector('.chart-placeholder');

        const isBubble = this.chartType === 'bubble';
        const isHeatmap = this.chartType === 'heatmap';
        const hasData = data && (isBubble || isHeatmap || this.selectedDatasets.length > 0);

        if (!hasData) {
            if (chartDiv) {
                try { Plotly.purge(chartDiv); } catch (e) { /* ignore */ }
                chartDiv.style.display = 'none';
            }
            if (placeholder) placeholder.style.display = '';
            panel.chartDiv = null;
            return;
        }

        const { traces, layout, config } = this.buildPlotlyConfig();

        if (placeholder) placeholder.style.display = 'none';
        if (chartDiv) chartDiv.style.display = 'block';

        Plotly.newPlot(chartDiv, traces, layout, config);
        panel.chartDiv = chartDiv;
    }

    renderAllCharts() {
        // Save current panel first
        this.saveActivePanelConfig();

        for (const panel of this.panels) {
            const savedActive = this.activePanel;
            this.activePanel = panel.id;
            this.loadPanelConfig(panel.id);
            this.renderActiveChart();
            this.activePanel = savedActive;
        }

        // Restore the real active panel
        this.loadPanelConfig(this.activePanel);
    }

    buildPlotlyConfig() {
        const data = this.getActiveData();
        if (!data) return { traces: [], layout: {}, config: {} };

        const t = this.chartType;
        const palette = this.getColorPalette();
        const title = document.getElementById('chartTitle').value;
        const legendPos = document.getElementById('legendPosition').value;
        const showGrid = document.getElementById('showGrid').checked;
        const beginAtZero = document.getElementById('beginAtZero').checked;
        const stacked = document.getElementById('stacked').checked;
        const xLabel = document.getElementById('xAxisLabel').value;
        const yLabel = document.getElementById('yAxisLabel').value;

        const textColor = this.getCSSVar('--text-primary');
        const gridColor = this.getCSSVar('--border-color');
        const bgColor = this.getCSSVar('--bg-secondary');

        let traces = [];

        // Build traces based on chart type
        switch (t) {
            case 'bar':
                traces = this.buildBarTraces(palette, false);
                break;
            case 'line':
                traces = this.buildLineTraces(palette);
                break;
            case 'scatter':
                traces = this.buildScatterTraces(palette);
                break;
            case 'area':
                traces = this.buildAreaTraces(palette, stacked);
                break;
            case 'pie':
                traces = this.buildPieTraces(palette, false);
                break;
            case 'doughnut':
                traces = this.buildPieTraces(palette, true);
                break;
            case 'radar':
                traces = this.buildRadarTraces(palette);
                break;
            case 'horizontalBar':
                traces = this.buildBarTraces(palette, true);
                break;
            case 'bubble':
                traces = this.buildBubbleTraces(palette);
                break;
            case 'heatmap':
                traces = this.buildHeatmapTraces();
                break;
            case 'box':
                traces = this.buildBoxTraces(palette);
                break;
            case 'histogram':
                traces = this.buildHistogramTraces(palette);
                break;
            default:
                traces = this.buildBarTraces(palette, false);
        }

        // Build layout
        const annData = this.buildAnnotationShapes();

        const legendOrientationMap = {
            top: { orientation: 'h', x: 0.5, xanchor: 'center', y: 1.12 },
            bottom: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.2 },
            left: { orientation: 'v', x: -0.15, y: 0.5 },
            right: { orientation: 'v', x: 1.05, y: 0.5 }
        };
        const legendConfig = legendOrientationMap[legendPos] || legendOrientationMap.top;

        const isPieType = t === 'pie' || t === 'doughnut';
        const isRadarType = t === 'radar';

        const layout = {
            title: title ? { text: title, font: { family: 'Raleway', size: 16, color: textColor } } : undefined,
            paper_bgcolor: bgColor,
            plot_bgcolor: bgColor,
            font: { color: textColor, family: 'Raleway' },
            showlegend: legendPos !== 'none',
            margin: { t: title ? 60 : 30, r: 30, b: 50, l: 60 },
            shapes: annData.shapes,
            annotations: annData.annotations
        };

        if (legendPos !== 'none') {
            layout.legend = {
                orientation: legendConfig.orientation,
                x: legendConfig.x,
                xanchor: legendConfig.xanchor,
                y: legendConfig.y,
                font: { family: 'Raleway', color: textColor }
            };
        }

        // Axes for cartesian charts
        if (!isPieType && !isRadarType && t !== 'heatmap') {
            layout.xaxis = {
                title: xLabel ? { text: xLabel, font: { family: 'Raleway', color: textColor } } : undefined,
                showgrid: showGrid,
                gridcolor: gridColor,
                tickfont: { family: 'Raleway', color: textColor },
                linecolor: gridColor,
                zerolinecolor: gridColor
            };
            layout.yaxis = {
                title: yLabel ? { text: yLabel, font: { family: 'Raleway', color: textColor } } : undefined,
                showgrid: showGrid,
                gridcolor: gridColor,
                tickfont: { family: 'Raleway', color: textColor },
                rangemode: beginAtZero ? 'tozero' : 'normal',
                linecolor: gridColor,
                zerolinecolor: gridColor
            };

            if (stacked && (t === 'bar' || t === 'horizontalBar')) {
                layout.barmode = 'stack';
            } else if (t === 'bar' || t === 'horizontalBar') {
                layout.barmode = 'group';
            }

            if (t === 'histogram') {
                layout.barmode = 'overlay';
            }
        }

        if (t === 'heatmap') {
            layout.xaxis = {
                showgrid: false,
                tickfont: { family: 'Raleway', color: textColor },
                linecolor: gridColor
            };
            layout.yaxis = {
                showgrid: false,
                tickfont: { family: 'Raleway', color: textColor },
                linecolor: gridColor,
                autorange: 'reversed'
            };
        }

        // Polar layout for radar
        if (t === 'radar') {
            layout.polar = {
                bgcolor: bgColor,
                radialaxis: {
                    visible: true,
                    gridcolor: gridColor,
                    tickfont: { family: 'Raleway', color: textColor },
                    linecolor: gridColor
                },
                angularaxis: {
                    gridcolor: gridColor,
                    tickfont: { family: 'Raleway', color: textColor },
                    linecolor: gridColor
                }
            };
        }

        const plotlyConfig = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d'],
            displaylogo: false
        };

        return { traces, layout, config: plotlyConfig };
    }

    // ==================== Trace Builders ====================
    buildBarTraces(palette, horizontal) {
        const data = this.getActiveData();
        const { headers } = data;
        const labels = this.getLabels();
        const rows = this.getSortedRows();

        return this.selectedDatasets.map((colIdx, i) => {
            const values = rows.map(row => Number(row[colIdx]) || 0);
            const color = palette[i % palette.length];
            const trace = {
                type: 'bar',
                name: headers[colIdx],
                marker: { color: color, line: { color: color.replace(/[\d.]+\)$/, '1)'), width: 1 } }
            };
            if (horizontal) {
                trace.y = labels;
                trace.x = values;
                trace.orientation = 'h';
            } else {
                trace.x = labels;
                trace.y = values;
            }
            return trace;
        });
    }

    buildLineTraces(palette) {
        const data = this.getActiveData();
        const { headers } = data;
        const labels = this.getLabels();
        const rows = this.getSortedRows();

        return this.selectedDatasets.map((colIdx, i) => {
            const values = rows.map(row => Number(row[colIdx]) || 0);
            const color = palette[i % palette.length];
            return {
                type: 'scatter',
                mode: 'lines+markers',
                name: headers[colIdx],
                x: labels,
                y: values,
                line: { color: color.replace(/[\d.]+\)$/, '1)'), width: 2, shape: 'spline' },
                marker: { color: color.replace(/[\d.]+\)$/, '1)'), size: 5 }
            };
        });
    }

    buildScatterTraces(palette) {
        const data = this.getActiveData();
        const { headers } = data;
        const labels = this.getLabels();
        const rows = this.getSortedRows();

        return this.selectedDatasets.map((colIdx, i) => {
            const values = rows.map(row => Number(row[colIdx]) || 0);
            const color = palette[i % palette.length];
            return {
                type: 'scatter',
                mode: 'markers',
                name: headers[colIdx],
                x: labels,
                y: values,
                marker: { color: color, size: 8, line: { color: color.replace(/[\d.]+\)$/, '1)'), width: 1 } }
            };
        });
    }

    buildAreaTraces(palette, stacked) {
        const data = this.getActiveData();
        const { headers } = data;
        const labels = this.getLabels();
        const rows = this.getSortedRows();

        return this.selectedDatasets.map((colIdx, i) => {
            const values = rows.map(row => Number(row[colIdx]) || 0);
            const color = palette[i % palette.length];
            const trace = {
                type: 'scatter',
                mode: 'lines',
                name: headers[colIdx],
                x: labels,
                y: values,
                fill: i === 0 ? 'tozeroy' : 'tonexty',
                fillcolor: color,
                line: { color: color.replace(/[\d.]+\)$/, '1)'), width: 2, shape: 'spline' }
            };
            if (stacked) {
                trace.stackgroup = 'one';
                trace.fill = undefined;
            }
            return trace;
        });
    }

    buildPieTraces(palette, isDoughnut) {
        const data = this.getActiveData();
        const { headers } = data;
        const labels = this.getLabels();
        const rows = this.getSortedRows();
        const colIdx = this.selectedDatasets[0];
        if (colIdx === undefined) return [];

        const values = rows.map(row => Number(row[colIdx]) || 0);
        const colors = labels.map((_, j) => palette[j % palette.length]);

        const trace = {
            type: 'pie',
            labels: labels,
            values: values,
            name: headers[colIdx],
            marker: {
                colors: colors,
                line: { color: this.getCSSVar('--bg-secondary'), width: 2 }
            },
            textinfo: 'label+percent',
            textfont: { family: 'Raleway' }
        };
        if (isDoughnut) {
            trace.hole = 0.4;
        }
        return [trace];
    }

    buildRadarTraces(palette) {
        const data = this.getActiveData();
        const { headers } = data;
        const labels = this.getLabels();
        const rows = this.getSortedRows();

        return this.selectedDatasets.map((colIdx, i) => {
            const values = rows.map(row => Number(row[colIdx]) || 0);
            const color = palette[i % palette.length];
            // Close the polygon by repeating the first point
            return {
                type: 'scatterpolar',
                r: [...values, values[0]],
                theta: [...labels.map(String), String(labels[0])],
                fill: 'toself',
                fillcolor: color,
                name: headers[colIdx],
                line: { color: color.replace(/[\d.]+\)$/, '1)'), width: 2 }
            };
        });
    }

    buildBubbleTraces(palette) {
        const data = this.getActiveData();
        if (!data) return [];
        const rows = this.getSortedRows();

        const xIdx = Number(document.getElementById('bubbleXCol').value);
        const yIdx = Number(document.getElementById('bubbleYCol').value);
        const rIdx = Number(document.getElementById('bubbleRCol').value);

        const rValues = rows.map(row => Math.abs(Number(row[rIdx]) || 0));
        const maxR = Math.max(...rValues, 1);

        const xValues = rows.map(row => Number(row[xIdx]) || 0);
        const yValues = rows.map(row => Number(row[yIdx]) || 0);
        const sizes = rValues.map(v => (v / maxR) * 50 + 5);
        const colors = rows.map((_, j) => palette[j % palette.length]);

        const xHeader = data.headers[xIdx] || 'X';
        const yHeader = data.headers[yIdx] || 'Y';
        const rHeader = data.headers[rIdx] || 'R';

        return [{
            type: 'scatter',
            mode: 'markers',
            name: `${xHeader} / ${yHeader} (size: ${rHeader})`,
            x: xValues,
            y: yValues,
            marker: {
                size: sizes,
                color: colors,
                line: { color: colors.map(c => c.replace(/[\d.]+\)$/, '1)')), width: 1 },
                sizemode: 'diameter'
            },
            text: rows.map((row, j) => `${rHeader}: ${row[rIdx]}`),
            hoverinfo: 'x+y+text'
        }];
    }

    buildHeatmapTraces() {
        const data = this.getActiveData();
        if (!data) return [];
        const { headers, columnTypes } = data;
        const rows = this.getSortedRows();
        const labelIdx = Number(document.getElementById('labelColumn').value);

        // Get all numeric column indices
        const numericCols = headers.map((h, i) => i)
            .filter(i => columnTypes[i] === 'numeric');

        if (numericCols.length === 0) return [];

        const rowLabels = rows.map(row => String(row[labelIdx]));
        const colHeaders = numericCols.map(i => headers[i]);
        const matrix = rows.map(row => numericCols.map(colIdx => Number(row[colIdx]) || 0));

        return [{
            type: 'heatmap',
            z: matrix,
            x: colHeaders,
            y: rowLabels,
            colorscale: 'Viridis',
            hoverinfo: 'x+y+z'
        }];
    }

    buildBoxTraces(palette) {
        const data = this.getActiveData();
        const { headers } = data;
        const rows = this.getSortedRows();

        return this.selectedDatasets.map((colIdx, i) => {
            const values = rows.map(row => Number(row[colIdx]) || 0);
            const color = palette[i % palette.length];
            return {
                type: 'box',
                y: values,
                name: headers[colIdx],
                marker: { color: color },
                line: { color: color.replace(/[\d.]+\)$/, '1)') },
                fillcolor: color
            };
        });
    }

    buildHistogramTraces(palette) {
        const data = this.getActiveData();
        const { headers } = data;
        const rows = this.getSortedRows();

        return this.selectedDatasets.map((colIdx, i) => {
            const values = rows.map(row => Number(row[colIdx]) || 0);
            const color = palette[i % palette.length];
            return {
                type: 'histogram',
                x: values,
                name: headers[colIdx],
                opacity: 0.7,
                marker: { color: color, line: { color: color.replace(/[\d.]+\)$/, '1)'), width: 1 } }
            };
        });
    }

    // ==================== Data Helpers ====================
    getSortedRows() {
        const data = this.getActiveData();
        if (!data) return [];
        const sortX = document.getElementById('sortXAxis').checked;
        if (!sortX) return data.rows;

        const labelIdx = Number(document.getElementById('labelColumn').value);
        const isDate = data.columnTypes[labelIdx] === 'date';
        const isNumeric = data.columnTypes[labelIdx] === 'numeric';

        const sorted = [...data.rows].sort((a, b) => {
            const va = a[labelIdx];
            const vb = b[labelIdx];
            if (isNumeric) return (Number(va) || 0) - (Number(vb) || 0);
            if (isDate) {
                const da = this.parseDateValue(String(va));
                const db = this.parseDateValue(String(vb));
                if (da && db) return da.getTime() - db.getTime();
            }
            return String(va).localeCompare(String(vb));
        });
        return sorted;
    }

    getLabels() {
        const data = this.getActiveData();
        if (!data) return [];
        const labelIdx = Number(document.getElementById('labelColumn').value);
        const rows = this.getSortedRows();

        // For date columns, pass ISO strings so Plotly auto-detects
        if (data.columnTypes[labelIdx] === 'date') {
            return rows.map(row => {
                const parsed = this.parseDateValue(String(row[labelIdx]));
                return parsed ? parsed.toISOString() : row[labelIdx];
            });
        }

        return rows.map(row => row[labelIdx]);
    }

    // ==================== Colors ====================
    getColorPalette() {
        const scheme = document.getElementById('colorScheme').value;
        if (scheme === 'theme') return this.generateThemePalette();
        if (scheme === 'monochrome') return this.generateMonochromePalette();
        return this.colorPalettes[scheme] || this.generateThemePalette();
    }

    generateThemePalette() {
        const secondary = this.getCSSVar('--accent-secondary');
        const accent = this.getCSSVar('--accent-primary');
        const info = this.getCSSVar('--info-color');
        const warning = this.getCSSVar('--warning-color');
        const error = this.getCSSVar('--error-color');
        const syntaxKeyword = this.getCSSVar('--syntax-keyword');
        const syntaxString = this.getCSSVar('--syntax-string');
        const syntaxNumber = this.getCSSVar('--syntax-number');

        return [secondary, info, warning, error, syntaxKeyword, syntaxString, syntaxNumber, accent]
            .map(c => this.toRGBA(c, 0.85));
    }

    generateMonochromePalette() {
        const accent = this.getCSSVar('--accent-primary');
        const rgb = this.parseColorToRGB(accent);
        const result = [];
        for (let i = 0; i < 8; i++) {
            const factor = 0.3 + (i * 0.1);
            result.push(`rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${factor})`);
        }
        return result;
    }

    toRGBA(color, alpha) {
        const rgb = this.parseColorToRGB(color);
        return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    }

    parseColorToRGB(color) {
        if (!color) return [128, 128, 128];
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return [r, g, b];
        }
        const match = color.match(/\d+/g);
        if (match) return [Number(match[0]), Number(match[1]), Number(match[2])];
        return [128, 128, 128];
    }

    getCSSVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    updateColorSwatches() {
        const palette = this.getColorPalette();
        const container = document.getElementById('colorSwatches');
        container.innerHTML = '';
        palette.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            container.appendChild(swatch);
        });
    }

    // ==================== Export (Plotly) ====================
    bindExport() {
        document.getElementById('exportPng').addEventListener('click', () => this.exportPNG(1));
        document.getElementById('exportPng2x').addEventListener('click', () => this.exportPNG(2));
        document.getElementById('exportAllPng').addEventListener('click', () => this.exportAllPNG(2));
        document.getElementById('copyClipboard').addEventListener('click', () => this.copyToClipboard());
        document.getElementById('clearAll').addEventListener('click', () => this.clearAll());
    }

    async exportPNG(scale) {
        const panel = this.panels.find(p => p.id === this.activePanel);
        if (!panel || !panel.chartDiv) return;

        const chartDiv = panel.chartDiv;
        try {
            const dataUrl = await Plotly.toImage(chartDiv, {
                format: 'png',
                scale: scale,
                width: chartDiv.offsetWidth,
                height: chartDiv.offsetHeight
            });

            const link = document.createElement('a');
            link.download = `chart-${this.activePanel + 1}${scale > 1 ? '@' + scale + 'x' : ''}.png`;
            link.href = dataUrl;
            link.click();
        } catch (e) {
            this.showStatus('Failed to export PNG', false);
        }
    }

    async exportAllPNG(scale) {
        const chartsWithData = this.panels.filter(p => p.chartDiv);
        if (chartsWithData.length === 0) return;

        if (chartsWithData.length === 1) {
            const saved = this.activePanel;
            this.activePanel = chartsWithData[0].id;
            await this.exportPNG(scale);
            this.activePanel = saved;
            return;
        }

        try {
            // Get images from all panels
            const images = [];
            for (const p of chartsWithData) {
                const dataUrl = await Plotly.toImage(p.chartDiv, {
                    format: 'png',
                    scale: scale,
                    width: p.chartDiv.offsetWidth,
                    height: p.chartDiv.offsetHeight
                });
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = dataUrl;
                });
                images.push(img);
            }

            const cols = images.length <= 2 ? images.length : 2;
            const rowCount = Math.ceil(images.length / cols);
            const padding = 20;

            const maxW = Math.max(...images.map(img => img.width));
            const maxH = Math.max(...images.map(img => img.height));

            const totalW = maxW * cols + padding * (cols + 1);
            const totalH = maxH * rowCount + padding * (rowCount + 1);

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = totalW;
            tempCanvas.height = totalH;
            const ctx = tempCanvas.getContext('2d');

            ctx.fillStyle = this.getCSSVar('--bg-secondary');
            ctx.fillRect(0, 0, totalW, totalH);

            images.forEach((img, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = padding + col * (maxW + padding);
                const y = padding + row * (maxH + padding);
                ctx.drawImage(img, x, y);
            });

            const link = document.createElement('a');
            link.download = `dashboard@${scale}x.png`;
            link.href = tempCanvas.toDataURL('image/png');
            link.click();
        } catch (e) {
            this.showStatus('Failed to export all charts', false);
        }
    }

    async copyToClipboard() {
        const panel = this.panels.find(p => p.id === this.activePanel);
        if (!panel || !panel.chartDiv) return;

        try {
            const dataUrl = await Plotly.toImage(panel.chartDiv, { format: 'png' });
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            this.showStatus('Chart copied to clipboard!', true);
        } catch (e) {
            this.showStatus('Failed to copy — try Export PNG instead', false);
        }
    }

    clearAll() {
        // Purge all Plotly charts
        this.panels.forEach(p => {
            if (p.chartDiv) {
                try { Plotly.purge(p.chartDiv); } catch (e) { /* ignore */ }
                p.chartDiv = null;
            }
        });

        // Reset to single panel
        this.panels = [{
            id: 0,
            chartDiv: null,
            chartType: 'bar',
            selectedDatasets: [],
            annotations: [],
            options: {
                title: '', xLabel: '', yLabel: '',
                legendPosition: 'top', showGrid: true, beginAtZero: true,
                stacked: false, sortXAxis: false, colorScheme: 'theme', labelColumn: 0
            },
            bubbleMapping: { x: 0, y: 1, r: 2 },
            heatmapMapping: { valueCol: 0 }
        }];
        this.activePanel = 0;
        this.nextPanelId = 1;
        this.chartType = 'bar';
        this.selectedDatasets = [];
        this.annotations = [];
        this.aggregatedData = null;

        // Reset tabs
        document.getElementById('panelTabs').innerHTML =
            '<button class="panel-tab active" data-panel="0">Chart 1</button>';

        // Reset grid
        document.getElementById('chartPanelsGrid').innerHTML = `
            <div class="chart-panel active" data-panel="0">
                <div class="chart-canvas-wrapper">
                    <div class="chart-placeholder">
                        <i class="fa-solid fa-chart-bar"></i>
                        <p>Load data and select columns to build a chart</p>
                    </div>
                    <div class="panel-chart" style="display:none;"></div>
                </div>
            </div>
        `;
        this.updateGridLayout();

        // Reset UI
        this.parsedData = null;
        document.getElementById('labelColumn').innerHTML = '<option value="">-- Load data first --</option>';
        document.getElementById('datasetCheckboxes').innerHTML = '<span style="color: var(--text-secondary); font-size: 0.8rem;">Load data to see columns</span>';
        document.getElementById('dataStatus').classList.remove('visible');
        document.getElementById('dataPreview').style.display = 'none';
        document.getElementById('chartTitle').value = '';
        document.getElementById('xAxisLabel').value = '';
        document.getElementById('yAxisLabel').value = '';
        document.getElementById('pasteData').value = '';
        document.getElementById('fileInput').value = '';
        document.getElementById('sortXAxis').checked = false;
        document.getElementById('aggregationCard').style.display = 'none';
        document.getElementById('annotationsList').innerHTML = '';

        // Reset chart type button
        document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.chart-type-btn[data-type="bar"]').classList.add('active');
        this.toggleOptionVisibility();
    }

    // ==================== Data Preview ====================
    bindPreviewToggle() {
        document.getElementById('previewToggle').addEventListener('click', () => {
            const body = document.getElementById('previewBody');
            body.classList.toggle('open');
            const icon = document.querySelector('.preview-toggle i');
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        });
    }

    renderDataPreview() {
        const data = this.getActiveData();
        if (!data) return;
        const { headers, rows } = data;
        const previewRows = rows.slice(0, 10);
        const table = document.getElementById('previewTable');

        let html = '<thead><tr>';
        headers.forEach(h => { html += `<th>${this.escapeHTML(String(h))}</th>`; });
        html += '</tr></thead><tbody>';
        previewRows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => { html += `<td>${this.escapeHTML(String(cell))}</td>`; });
            html += '</tr>';
        });
        html += '</tbody>';
        table.innerHTML = html;

        document.getElementById('dataPreview').style.display = '';
    }

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==================== Theme Sync ====================
    setupThemeObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.attributeName === 'data-theme') {
                    this.updateColorSwatches();
                    // Use Plotly.relayout for theme color changes where possible
                    this.relayoutAllCharts();
                    break;
                }
            }
        });
        observer.observe(document.documentElement, { attributes: true });
    }

    relayoutAllCharts() {
        const textColor = this.getCSSVar('--text-primary');
        const gridColor = this.getCSSVar('--border-color');
        const bgColor = this.getCSSVar('--bg-secondary');

        for (const panel of this.panels) {
            if (!panel.chartDiv) continue;

            const update = {
                paper_bgcolor: bgColor,
                plot_bgcolor: bgColor,
                'font.color': textColor,
                'xaxis.gridcolor': gridColor,
                'xaxis.tickfont.color': textColor,
                'xaxis.linecolor': gridColor,
                'xaxis.zerolinecolor': gridColor,
                'yaxis.gridcolor': gridColor,
                'yaxis.tickfont.color': textColor,
                'yaxis.linecolor': gridColor,
                'yaxis.zerolinecolor': gridColor,
                'legend.font.color': textColor
            };

            if (panel.chartType === 'radar') {
                update['polar.bgcolor'] = bgColor;
                update['polar.radialaxis.gridcolor'] = gridColor;
                update['polar.radialaxis.tickfont.color'] = textColor;
                update['polar.angularaxis.gridcolor'] = gridColor;
                update['polar.angularaxis.tickfont.color'] = textColor;
            }

            try {
                Plotly.relayout(panel.chartDiv, update);
            } catch (e) {
                // Fall back to full re-render
            }
        }

        // Full re-render to update trace colors from theme palette
        this.renderAllCharts();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new ChartBuilderApp();
});
