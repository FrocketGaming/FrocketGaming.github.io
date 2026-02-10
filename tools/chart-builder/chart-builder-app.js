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
            chart: null,
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
            bubbleMapping: { x: 0, y: 1, r: 2 }
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
                // Default: first 3 numeric columns
                if (j === selectIdx && selectIdx < numericCols.length) {
                    opt.selected = true;
                }
                sel.appendChild(opt);
            });
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
        const isPolar = this.chartType === 'pie' || this.chartType === 'doughnut' || this.chartType === 'polarArea';
        const isRadar = this.chartType === 'radar';
        const isBubble = this.chartType === 'bubble';

        document.getElementById('xAxisRow').style.display = isPolar ? 'none' : '';
        document.getElementById('yAxisRow').style.display = isPolar ? 'none' : '';
        document.getElementById('gridToggleRow').style.display = isPolar ? 'none' : '';
        document.getElementById('zeroToggleRow').style.display = isPolar || isRadar ? 'none' : '';
        document.getElementById('stackedToggleRow').style.display = isPolar || isRadar || isBubble ? 'none' : '';
        document.getElementById('sortXToggleRow').style.display = isPolar || isRadar ? 'none' : '';

        // Bubble mapping card
        document.getElementById('bubbleMappingCard').style.display = isBubble ? '' : 'none';

        // Data mapping card: hide for bubble
        document.getElementById('dataMappingCard').style.display = isBubble ? 'none' : '';

        // Annotations: hide for pie/doughnut/polarArea/radar
        document.getElementById('annotationsCard').style.display =
            (isPolar || isRadar) ? 'none' : '';
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

    buildAnnotationsConfig() {
        if (this.annotations.length === 0) return {};
        const annotations = {};
        this.annotations.forEach((ann, i) => {
            annotations[`line${i}`] = {
                type: 'line',
                scaleID: ann.axis,
                value: ann.value,
                borderColor: ann.color,
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                    display: !!ann.label,
                    content: ann.label,
                    position: 'start',
                    backgroundColor: ann.color,
                    color: '#fff',
                    font: { size: 11, family: 'Raleway' }
                }
            };
        });
        return { annotation: { annotations } };
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

            // Check if X button was clicked
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
            chart: null,
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
            bubbleMapping: { x: 0, y: 1, r: 2 }
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
                <canvas class="panel-canvas" style="display:none;"></canvas>
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

        // Destroy chart
        if (this.panels[idx].chart) {
            this.panels[idx].chart.destroy();
        }

        this.panels.splice(idx, 1);

        // Remove tab and panel div
        const tab = document.querySelector(`.panel-tab[data-panel="${id}"]`);
        if (tab) tab.remove();
        const panelDiv = document.querySelector(`.chart-panel[data-panel="${id}"]`);
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

    // ==================== Rendering ====================
    renderActiveChart() {
        const panel = this.panels.find(p => p.id === this.activePanel);
        if (!panel) return;

        const data = this.getActiveData();
        const panelDiv = document.querySelector(`.chart-panel[data-panel="${this.activePanel}"]`);
        if (!panelDiv) return;

        const canvas = panelDiv.querySelector('.panel-canvas');
        const placeholder = panelDiv.querySelector('.chart-placeholder');

        const isBubble = this.chartType === 'bubble';
        const hasData = data && (isBubble || this.selectedDatasets.length > 0);

        if (!hasData) {
            if (panel.chart) {
                panel.chart.destroy();
                panel.chart = null;
            }
            if (canvas) canvas.style.display = 'none';
            if (placeholder) placeholder.style.display = '';
            return;
        }

        const config = this.buildChartConfig();

        if (panel.chart) {
            panel.chart.destroy();
            panel.chart = null;
        }

        if (placeholder) placeholder.style.display = 'none';
        if (canvas) canvas.style.display = 'block';

        panel.chart = new Chart(canvas.getContext('2d'), config);
    }

    renderAllCharts() {
        // Save current panel first
        this.saveActivePanelConfig();

        for (const panel of this.panels) {
            // Temporarily switch context to render each panel
            const savedActive = this.activePanel;
            this.activePanel = panel.id;
            this.loadPanelConfig(panel.id);
            this.renderActiveChart();
            this.activePanel = savedActive;
        }

        // Restore the real active panel
        this.loadPanelConfig(this.activePanel);
    }

    buildChartConfig() {
        const data = this.getActiveData();
        if (!data) return { type: 'bar', data: { labels: [], datasets: [] } };

        const isBubble = this.chartType === 'bubble';
        const isPie = this.chartType === 'pie' || this.chartType === 'doughnut';
        const isPolar = this.chartType === 'polarArea';
        const isArea = this.chartType === 'area';
        const isRadar = this.chartType === 'radar';
        const isHBar = this.chartType === 'horizontalBar';

        let type;
        if (isArea) type = 'line';
        else if (isHBar) type = 'bar';
        else if (isPolar) type = 'polarArea';
        else type = this.chartType;

        const labels = isBubble ? undefined : this.getLabels();
        const datasets = isBubble
            ? this.buildBubbleDatasets()
            : this.buildDatasets(isPie || isPolar, isArea);
        const palette = this.getColorPalette();

        // Apply colors
        datasets.forEach((ds, i) => {
            if (isPie || isPolar) {
                const colorLabels = labels || data.rows.map((_, j) => j);
                ds.backgroundColor = colorLabels.map((_, j) => palette[j % palette.length]);
                ds.borderColor = this.getCSSVar('--bg-secondary');
                ds.borderWidth = 2;
            } else if (isBubble) {
                ds.backgroundColor = palette.map(c => c);
                ds.borderColor = palette.map(c => c.replace(/[\d.]+\)$/, '1)'));
                ds.borderWidth = 1;
            } else {
                const color = palette[i % palette.length];
                ds.backgroundColor = color;
                ds.borderColor = color.replace(/[\d.]+\)$/, '1)');
                ds.borderWidth = 2;
                if (isArea) ds.fill = true;
            }
        });

        const title = document.getElementById('chartTitle').value;
        const legendPos = document.getElementById('legendPosition').value;
        const showGrid = document.getElementById('showGrid').checked;
        const beginAtZero = document.getElementById('beginAtZero').checked;
        const stacked = document.getElementById('stacked').checked;
        const xLabel = document.getElementById('xAxisLabel').value;
        const yLabel = document.getElementById('yAxisLabel').value;

        const textColor = this.getCSSVar('--text-primary');
        const gridColor = this.getCSSVar('--border-color');

        const config = {
            type,
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: !!title,
                        text: title,
                        color: textColor,
                        font: { size: 16, family: 'Raleway' }
                    },
                    legend: {
                        display: legendPos !== 'none',
                        position: legendPos === 'none' ? 'top' : legendPos,
                        labels: { color: textColor, font: { family: 'Raleway' } }
                    }
                }
            }
        };

        if (!isBubble && labels) {
            config.data.labels = labels;
        }

        // Annotation plugin config
        const annConfig = this.buildAnnotationsConfig();
        if (annConfig.annotation) {
            config.options.plugins.annotation = annConfig.annotation;
        }

        // Horizontal bar
        if (isHBar) {
            config.options.indexAxis = 'y';
        }

        // Scales
        if (!isPie && !isPolar) {
            config.options.scales = {};
            if (!isRadar) {
                // Detect if label column is date type
                const labelIdx = Number(document.getElementById('labelColumn').value);
                const isDateAxis = !isBubble && data.columnTypes[labelIdx] === 'date';

                const xScale = {
                    display: true,
                    grid: { display: showGrid, color: gridColor },
                    ticks: { color: textColor, font: { family: 'Raleway' } },
                    title: { display: !!xLabel, text: xLabel, color: textColor, font: { family: 'Raleway' } },
                    stacked: stacked
                };

                if (isDateAxis && !isBubble) {
                    xScale.type = 'time';
                    xScale.time = { unit: this.detectTimeUnit(labels) };
                }

                config.options.scales.x = xScale;
                config.options.scales.y = {
                    display: true,
                    grid: { display: showGrid, color: gridColor },
                    ticks: { color: textColor, font: { family: 'Raleway' } },
                    title: { display: !!yLabel, text: yLabel, color: textColor, font: { family: 'Raleway' } },
                    beginAtZero,
                    stacked: stacked
                };
            } else {
                config.options.scales.r = {
                    grid: { color: gridColor },
                    angleLines: { color: gridColor },
                    pointLabels: { color: textColor, font: { family: 'Raleway' } },
                    ticks: { color: textColor, backdropColor: 'transparent', font: { family: 'Raleway' } }
                };
            }
        }

        return config;
    }

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

        // Check if date column
        if (data.columnTypes[labelIdx] === 'date') {
            return rows.map(row => {
                const parsed = this.parseDateValue(String(row[labelIdx]));
                return parsed || row[labelIdx];
            });
        }

        return rows.map(row => row[labelIdx]);
    }

    detectTimeUnit(labels) {
        if (!labels || labels.length < 2) return 'day';
        const dates = labels.filter(l => l instanceof Date);
        if (dates.length < 2) return 'day';

        const range = dates[dates.length - 1].getTime() - dates[0].getTime();
        const days = range / (1000 * 60 * 60 * 24);

        if (days < 7) return 'day';
        if (days < 90) return 'week';
        if (days < 730) return 'month';
        return 'year';
    }

    buildDatasets(isSingleDataset, isArea) {
        const data = this.getActiveData();
        if (!data) return [];
        const { headers } = data;
        const rows = this.getSortedRows();

        if (isSingleDataset) {
            const colIdx = this.selectedDatasets[0];
            if (colIdx === undefined) return [];
            return [{
                label: headers[colIdx],
                data: rows.map(row => Number(row[colIdx]) || 0)
            }];
        }

        return this.selectedDatasets.map(colIdx => ({
            label: headers[colIdx],
            data: rows.map(row => Number(row[colIdx]) || 0),
            tension: this.chartType === 'line' || isArea ? 0.3 : 0,
            pointRadius: this.chartType === 'scatter' ? 5 : 3
        }));
    }

    buildBubbleDatasets() {
        const data = this.getActiveData();
        if (!data) return [];
        const rows = this.getSortedRows();

        const xIdx = Number(document.getElementById('bubbleXCol').value);
        const yIdx = Number(document.getElementById('bubbleYCol').value);
        const rIdx = Number(document.getElementById('bubbleRCol').value);

        // Get radius values for scaling
        const rValues = rows.map(row => Math.abs(Number(row[rIdx]) || 0));
        const maxR = Math.max(...rValues, 1);

        const points = rows.map(row => ({
            x: Number(row[xIdx]) || 0,
            y: Number(row[yIdx]) || 0,
            r: (Math.abs(Number(row[rIdx]) || 0) / maxR) * 30 + 3
        }));

        const xHeader = data.headers[xIdx] || 'X';
        const yHeader = data.headers[yIdx] || 'Y';
        const rHeader = data.headers[rIdx] || 'R';

        return [{
            label: `${xHeader} / ${yHeader} (size: ${rHeader})`,
            data: points
        }];
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

        // Lead with brightest colors (secondary first), use higher alpha
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

    // ==================== Export ====================
    bindExport() {
        document.getElementById('exportPng').addEventListener('click', () => this.exportPNG(1));
        document.getElementById('exportPng2x').addEventListener('click', () => this.exportPNG(2));
        document.getElementById('exportAllPng').addEventListener('click', () => this.exportAllPNG(2));
        document.getElementById('copyClipboard').addEventListener('click', () => this.copyToClipboard());
        document.getElementById('clearAll').addEventListener('click', () => this.clearAll());
    }

    exportPNG(scale) {
        const panel = this.panels.find(p => p.id === this.activePanel);
        if (!panel || !panel.chart) return;

        const panelDiv = document.querySelector(`.chart-panel[data-panel="${this.activePanel}"]`);
        const canvas = panelDiv.querySelector('.panel-canvas');

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width * scale;
        tempCanvas.height = canvas.height * scale;
        const ctx = tempCanvas.getContext('2d');

        ctx.fillStyle = this.getCSSVar('--bg-secondary');
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(canvas, 0, 0);

        const link = document.createElement('a');
        link.download = `chart-${this.activePanel + 1}${scale > 1 ? '@' + scale + 'x' : ''}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }

    exportAllPNG(scale) {
        const chartsWithData = this.panels.filter(p => p.chart);
        if (chartsWithData.length === 0) return;

        if (chartsWithData.length === 1) {
            this.exportPNG(scale);
            return;
        }

        // Composite all panels into one image
        const canvases = chartsWithData.map(p => {
            const panelDiv = document.querySelector(`.chart-panel[data-panel="${p.id}"]`);
            return panelDiv ? panelDiv.querySelector('.panel-canvas') : null;
        }).filter(Boolean);

        if (canvases.length === 0) return;

        const cols = canvases.length <= 2 ? canvases.length : 2;
        const rowCount = Math.ceil(canvases.length / cols);
        const padding = 20;

        const maxW = Math.max(...canvases.map(c => c.width));
        const maxH = Math.max(...canvases.map(c => c.height));

        const totalW = (maxW * cols + padding * (cols + 1)) * scale;
        const totalH = (maxH * rowCount + padding * (rowCount + 1)) * scale;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = totalW;
        tempCanvas.height = totalH;
        const ctx = tempCanvas.getContext('2d');

        ctx.fillStyle = this.getCSSVar('--bg-secondary');
        ctx.fillRect(0, 0, totalW, totalH);
        ctx.scale(scale, scale);

        canvases.forEach((c, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = padding + col * (maxW + padding);
            const y = padding + row * (maxH + padding);
            ctx.drawImage(c, x, y);
        });

        const link = document.createElement('a');
        link.download = `dashboard@${scale}x.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }

    async copyToClipboard() {
        const panel = this.panels.find(p => p.id === this.activePanel);
        if (!panel || !panel.chart) return;

        const panelDiv = document.querySelector(`.chart-panel[data-panel="${this.activePanel}"]`);
        const canvas = panelDiv.querySelector('.panel-canvas');

        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            this.showStatus('Chart copied to clipboard!', true);
        } catch (e) {
            this.showStatus('Failed to copy — try Export PNG instead', false);
        }
    }

    clearAll() {
        // Destroy all charts
        this.panels.forEach(p => {
            if (p.chart) {
                p.chart.destroy();
                p.chart = null;
            }
        });

        // Reset to single panel
        this.panels = [{
            id: 0,
            chart: null,
            chartType: 'bar',
            selectedDatasets: [],
            annotations: [],
            options: {
                title: '', xLabel: '', yLabel: '',
                legendPosition: 'top', showGrid: true, beginAtZero: true,
                stacked: false, sortXAxis: false, colorScheme: 'theme', labelColumn: 0
            },
            bubbleMapping: { x: 0, y: 1, r: 2 }
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
                    <canvas class="panel-canvas" style="display:none;"></canvas>
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
                    this.renderAllCharts();
                    break;
                }
            }
        });
        observer.observe(document.documentElement, { attributes: true });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new ChartBuilderApp();
});
