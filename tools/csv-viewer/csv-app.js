// CSV Viewer App
class CSVViewer {
    constructor() {
        this.data = [];
        this.headers = [];
        this.filteredData = [];
        this.sortColumn = -1;
        this.sortAscending = true;
        this.db = null;
        this.sqlReady = false;
        this.sqlResults = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('clearBtn').addEventListener('click', () => this.clear());

        // Upload button triggers hidden file input
        document.getElementById('uploadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        // Handle file upload
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));

        // Data Profile toggle
        document.getElementById('profileToggleBtn').addEventListener('click', () => this.toggleProfile());
        document.getElementById('dataProfileSection').querySelector('.data-profile-header').addEventListener('click', (e) => {
            if (e.target.closest('#profileToggleBtn')) return;
            this.toggleProfile();
        });

        // SQL playground listeners
        document.getElementById('sqlRunBtn').addEventListener('click', () => this.runQuery());
        document.getElementById('sqlExportBtn').addEventListener('click', () => this.exportQueryResults());
        const sqlTextarea = document.getElementById('sqlQuery');
        sqlTextarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.runQuery();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
                this.updateHighlight();
            }
        });

        // Syntax highlighting sync + auto-resize
        sqlTextarea.addEventListener('input', () => {
            this.updateHighlight();
            this.autoResizeSQL();
        });
        sqlTextarea.addEventListener('scroll', () => this.updateHighlight());

        // Sync highlight layer size when textarea is resized
        const resizeObserver = new ResizeObserver(() => {
            const pre = document.querySelector('.sql-highlight-layer');
            if (pre) {
                pre.style.height = sqlTextarea.offsetHeight + 'px';
            }
        });
        resizeObserver.observe(sqlTextarea);
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        const validTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];
        const fileName = file.name.toLowerCase();

        if (!validTypes.includes(file.type) && !fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
            alert('Please upload a CSV or TXT file');
            return;
        }

        // Show loading state
        this.showEmptyState(`Loading ${file.name}...`);
        const uploadBtn = document.getElementById('uploadBtn');
        const originalText = uploadBtn.innerHTML;
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

        // Read file contents
        const reader = new FileReader();

        reader.onload = (e) => {
            this.parseCSV(e.target.result);
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = originalText;
        };

        reader.onerror = () => {
            alert('Error reading file');
            this.showEmptyState('Error reading file. Please try again.');
            // Reset button
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = originalText;
        };

        reader.readAsText(file);

        // Reset file input so the same file can be uploaded again
        event.target.value = '';
    }

    detectDelimiter(text) {
        const delimiters = [',', ';', '\t', '|'];
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) return ',';

        let bestDelimiter = ',';
        let maxConsistency = 0;

        for (const delimiter of delimiters) {
            const counts = lines.map(line => (line.match(new RegExp(delimiter, 'g')) || []).length);
            if (counts.length === 0) continue;

            const firstCount = counts[0];
            const consistency = counts.filter(count => count === firstCount).length / counts.length;

            if (consistency > maxConsistency && firstCount > 0) {
                maxConsistency = consistency;
                bestDelimiter = delimiter;
            }
        }

        return bestDelimiter;
    }

    parseCSV(csvText) {
        const input = (csvText || '').trim();

        if (!input) {
            this.showEmptyState('Upload a CSV file to get started');
            return;
        }

        let delimiter = document.getElementById('delimiter').value;

        // Auto-detect delimiter if needed
        if (delimiter === 'auto') {
            delimiter = this.detectDelimiter(input);
        }

        // Handle tab character
        if (delimiter === '\\t') {
            delimiter = '\t';
        }

        try {
            const lines = input.split('\n').filter(line => line.trim());

            if (lines.length === 0) {
                this.showEmptyState('No data to parse');
                return;
            }

            // Parse CSV (simple implementation, handles quoted fields)
            this.data = lines.map(line => this.parseLine(line, delimiter));

            // First row is headers
            this.headers = this.data[0];
            this.data = this.data.slice(1);
            this.filteredData = [...this.data];

            this.renderTable();
            this.updateInfo();
            this.loadIntoSQL();

            const profile = this.computeDataProfile();
            this.renderDataProfile(profile);
        } catch (error) {
            this.showEmptyState('Error parsing CSV: ' + error.message);
        }
    }

    parseLine(line, delimiter) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    renderTable() {
        const container = document.getElementById('tableContainer');

        if (this.filteredData.length === 0) {
            this.showEmptyState('No data to display');
            return;
        }

        let tableHTML = '<table class="csv-table"><thead><tr>';

        // Headers
        this.headers.forEach((header, index) => {
            const sortClass = this.sortColumn === index
                ? (this.sortAscending ? 'sort-asc' : 'sort-desc')
                : 'sortable';
            tableHTML += `<th class="${sortClass}" data-column="${index}">${this.escapeHtml(header)}</th>`;
        });

        tableHTML += '</tr></thead><tbody>';

        // Data rows
        this.filteredData.forEach(row => {
            tableHTML += '<tr>';
            row.forEach(cell => {
                tableHTML += `<td>${this.escapeHtml(cell)}</td>`;
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';

        container.innerHTML = tableHTML;

        // Add click handlers to headers for sorting
        container.querySelectorAll('th').forEach((th, index) => {
            th.addEventListener('click', () => this.sortTable(index));
        });
    }

    sortTable(columnIndex) {
        if (this.sortColumn === columnIndex) {
            this.sortAscending = !this.sortAscending;
        } else {
            this.sortColumn = columnIndex;
            this.sortAscending = true;
        }

        this.filteredData.sort((a, b) => {
            const aVal = a[columnIndex] || '';
            const bVal = b[columnIndex] || '';

            // Try numeric comparison first
            const aNum = parseFloat(aVal);
            const bNum = parseFloat(bVal);

            if (!isNaN(aNum) && !isNaN(bNum)) {
                return this.sortAscending ? aNum - bNum : bNum - aNum;
            }

            // String comparison
            const comparison = aVal.localeCompare(bVal);
            return this.sortAscending ? comparison : -comparison;
        });

        this.renderTable();
    }

    updateInfo() {
        const info = document.getElementById('tableInfo');
        const total = this.data.length;
        const visible = this.filteredData.length;

        if (visible === total) {
            info.textContent = `Showing ${total} row${total !== 1 ? 's' : ''}`;
        } else {
            info.textContent = `Showing ${visible} of ${total} row${total !== 1 ? 's' : ''}`;
        }
    }

    clear() {
        this.data = [];
        this.headers = [];
        this.filteredData = [];
        this.sortColumn = -1;
        this.showEmptyState('Upload a CSV file to get started');
        this.clearSQL();
        this.clearDataProfile();
        document.getElementById('fileInput').value = '';
    }

    showEmptyState(message) {
        const container = document.getElementById('tableContainer');
        container.innerHTML = `<div class="empty-state">${message}</div>`;
        document.getElementById('tableInfo').textContent = '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- SQL Syntax Highlighting ---

    highlightSQL(text) {
        if (!text) return '';

        const keywords = /^(SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|ADD|COLUMN|INDEX|VIEW|IF|EXISTS|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|DISTINCT|ASC|DESC|WITH|RECURSIVE)$/i;
        const functions = /^(COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST|SUBSTR|LENGTH|UPPER|LOWER|TRIM|REPLACE|ROUND|ABS|GROUP_CONCAT|TOTAL|TYPEOF|INSTR|HEX|QUOTE|UNICODE|ZEROBLOB|RANDOM|DATE|TIME|DATETIME|JULIANDAY|STRFTIME)$/i;

        const tokenRegex = /--[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\b\d+(?:\.\d+)?\b|[a-zA-Z_]\w*|[^\s]/g;

        let result = '';
        let match;
        let lastIndex = 0;

        while ((match = tokenRegex.exec(text)) !== null) {
            // Add any whitespace between tokens
            if (match.index > lastIndex) {
                result += this.escapeHtml(text.substring(lastIndex, match.index));
            }

            const token = match[0];
            const escaped = this.escapeHtml(token);

            if (token.startsWith('--')) {
                result += `<span class="sql-comment">${escaped}</span>`;
            } else if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
                result += `<span class="sql-string">${escaped}</span>`;
            } else if (/^\d+(?:\.\d+)?$/.test(token)) {
                result += `<span class="sql-number">${escaped}</span>`;
            } else if (keywords.test(token)) {
                result += `<span class="sql-keyword">${escaped}</span>`;
            } else if (functions.test(token)) {
                result += `<span class="sql-function">${escaped}</span>`;
            } else {
                result += escaped;
            }

            lastIndex = match.index + token.length;
        }

        // Add any remaining text
        if (lastIndex < text.length) {
            result += this.escapeHtml(text.substring(lastIndex));
        }

        return result;
    }

    updateHighlight() {
        const textarea = document.getElementById('sqlQuery');
        const highlight = document.getElementById('sqlHighlight');
        if (!textarea || !highlight) return;

        highlight.innerHTML = this.highlightSQL(textarea.value) + '\n';

        // Sync scroll
        const pre = highlight.parentElement;
        pre.scrollTop = textarea.scrollTop;
        pre.scrollLeft = textarea.scrollLeft;
    }

    // --- SQL Playground Methods ---

    async initSQLEngine() {
        if (this.sqlReady) return;

        const status = document.getElementById('sqlStatus');
        status.textContent = 'Loading...';
        status.className = 'sql-status loading';

        try {
            const SQL = await initSqlJs({
                locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
            });
            this.db = new SQL.Database();
            this.sqlReady = true;
            status.textContent = 'Ready';
            status.className = 'sql-status';
        } catch (error) {
            status.textContent = 'Error';
            status.className = 'sql-status error';
            this.showSQLError('Failed to load SQL engine: ' + error.message);
        }
    }

    async loadIntoSQL() {
        document.getElementById('sqlSection').style.display = '';

        await this.initSQLEngine();
        if (!this.sqlReady) return;

        try {
            // Drop existing table
            this.db.run('DROP TABLE IF EXISTS csv');

            // Sanitize column names (deduplicate) and infer types
            const seen = new Set();
            const sanitizedHeaders = this.headers.map(h => {
                let name = this.sanitizeColumnName(h);
                let base = name;
                let suffix = 2;
                while (seen.has(name)) {
                    name = base + '_' + suffix++;
                }
                seen.add(name);
                return name;
            });
            const types = this.headers.map((_, i) => this.inferColumnType(i));

            // Create table
            const columns = sanitizedHeaders.map((name, i) => `"${name}" ${types[i]}`).join(', ');
            this.db.run(`CREATE TABLE csv (${columns})`);

            // Bulk insert using prepared statement in a transaction
            const placeholders = sanitizedHeaders.map(() => '?').join(', ');
            const insertSQL = `INSERT INTO csv VALUES (${placeholders})`;

            this.db.run('BEGIN TRANSACTION');
            const stmt = this.db.prepare(insertSQL);

            for (const row of this.data) {
                const values = sanitizedHeaders.map((_, i) => {
                    const cell = row[i];
                    if (cell === undefined || cell === null || cell === '') return null;
                    if (types[i] === 'INTEGER') {
                        const num = parseInt(cell, 10);
                        return isNaN(num) ? cell : num;
                    }
                    if (types[i] === 'REAL') {
                        const num = parseFloat(cell);
                        return isNaN(num) ? cell : num;
                    }
                    return cell;
                });
                stmt.run(values);
            }

            stmt.free();
            this.db.run('COMMIT');

            this.generateExampleQueries(sanitizedHeaders, types);
            this.hideSQLError();

            const status = document.getElementById('sqlStatus');
            status.textContent = `${this.data.length} rows loaded`;
            status.className = 'sql-status';
        } catch (error) {
            try { this.db.run('ROLLBACK'); } catch (e) { /* no active transaction */ }
            this.showSQLError('Failed to load data into SQL: ' + error.message);
        }
    }

    sanitizeColumnName(name) {
        let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        if (!sanitized) sanitized = 'column';
        if (/^\d/.test(sanitized)) sanitized = '_' + sanitized;
        return sanitized;
    }

    inferColumnType(colIndex) {
        const sampleSize = Math.min(this.data.length, 100);
        let intCount = 0;
        let realCount = 0;
        let nonEmpty = 0;

        for (let i = 0; i < sampleSize; i++) {
            const val = this.data[i][colIndex];
            if (val === undefined || val === '') continue;
            nonEmpty++;
            const num = Number(val);
            if (!isNaN(num) && val.trim() !== '') {
                if (Number.isInteger(num)) {
                    intCount++;
                } else {
                    realCount++;
                }
            }
        }

        if (nonEmpty === 0) return 'TEXT';
        const numericRatio = (intCount + realCount) / nonEmpty;
        if (numericRatio >= 0.8) {
            return realCount > 0 ? 'REAL' : 'INTEGER';
        }
        return 'TEXT';
    }

    generateExampleQueries(headers, types) {
        const container = document.getElementById('sqlExamples');
        container.innerHTML = '';

        const examples = [];

        // Always include SELECT ALL and COUNT
        examples.push({ label: 'SELECT ALL', query: 'SELECT * FROM csv LIMIT 100' });
        examples.push({ label: 'COUNT ROWS', query: 'SELECT COUNT(*) AS total FROM csv' });

        // Find first text and numeric columns
        let textCol = null;
        let numCol = null;
        for (let i = 0; i < types.length; i++) {
            if (types[i] === 'TEXT' && !textCol) textCol = headers[i];
            if ((types[i] === 'INTEGER' || types[i] === 'REAL') && !numCol) numCol = headers[i];
        }

        if (textCol) {
            examples.push({
                label: 'GROUP BY',
                query: `SELECT "${textCol}", COUNT(*) AS count\nFROM csv\nGROUP BY "${textCol}"\nORDER BY count DESC`
            });
            examples.push({
                label: 'DISTINCT',
                query: `SELECT DISTINCT "${textCol}" FROM csv ORDER BY "${textCol}"`
            });
        }

        if (numCol) {
            examples.push({
                label: 'STATS',
                query: `SELECT\n  COUNT("${numCol}") AS count,\n  MIN("${numCol}") AS min,\n  MAX("${numCol}") AS max,\n  AVG("${numCol}") AS avg,\n  SUM("${numCol}") AS total\nFROM csv`
            });
            examples.push({
                label: 'TOP 10',
                query: `SELECT * FROM csv\nORDER BY "${numCol}" DESC\nLIMIT 10`
            });
        }

        if (textCol && numCol) {
            examples.push({
                label: 'FILTER',
                query: `SELECT * FROM csv\nWHERE "${numCol}" > 0\nORDER BY "${numCol}" DESC`
            });
        }

        examples.forEach(ex => {
            const btn = document.createElement('button');
            btn.className = 'sql-example-btn';
            btn.textContent = ex.label;
            btn.addEventListener('click', () => {
                document.getElementById('sqlQuery').value = ex.query;
                this.updateHighlight();
                this.autoResizeSQL();
            });
            container.appendChild(btn);
        });
    }

    runQuery() {
        const query = document.getElementById('sqlQuery').value.trim();
        if (!query) return;
        if (!this.sqlReady || !this.db) {
            this.showSQLError('SQL engine is not ready. Please load CSV data first.');
            return;
        }

        this.hideSQLError();
        const start = performance.now();

        try {
            const results = this.db.exec(query);
            const elapsed = (performance.now() - start).toFixed(1);

            if (results.length === 0) {
                this.sqlResults = null;
                document.getElementById('sqlResultsWrapper').classList.remove('show');
                document.getElementById('sqlResultsInfo').textContent = '';
                document.getElementById('sqlQueryInfo').textContent = `Query executed in ${elapsed}ms — no results returned`;
                return;
            }

            this.sqlResults = results[0];
            this.renderQueryResults(results[0]);
            document.getElementById('sqlQueryInfo').textContent =
                `${results[0].values.length} row${results[0].values.length !== 1 ? 's' : ''} in ${elapsed}ms`;
        } catch (error) {
            this.showSQLError(error.message);
            document.getElementById('sqlQueryInfo').textContent = '';
        }
    }

    renderQueryResults(result) {
        const wrapper = document.getElementById('sqlResultsWrapper');
        const container = document.getElementById('sqlResultsContainer');

        let tableHTML = '<table class="csv-table"><thead><tr>';

        result.columns.forEach(col => {
            tableHTML += `<th>${this.escapeHtml(col)}</th>`;
        });

        tableHTML += '</tr></thead><tbody>';

        result.values.forEach(row => {
            tableHTML += '<tr>';
            row.forEach(cell => {
                if (cell === null) {
                    tableHTML += '<td class="null-value">NULL</td>';
                } else {
                    tableHTML += `<td>${this.escapeHtml(String(cell))}</td>`;
                }
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';

        container.innerHTML = tableHTML;
        wrapper.classList.add('show');

        document.getElementById('sqlResultsInfo').textContent =
            `${result.values.length} row${result.values.length !== 1 ? 's' : ''} returned`;
    }

    showSQLError(message) {
        const errorDiv = document.getElementById('sqlError');
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    }

    hideSQLError() {
        const errorDiv = document.getElementById('sqlError');
        errorDiv.textContent = '';
        errorDiv.classList.remove('show');
    }

    exportQueryResults() {
        if (!this.sqlResults) return;

        const rows = [this.sqlResults.columns, ...this.sqlResults.values];
        const csv = rows.map(row =>
            row.map(cell => {
                if (cell === null) return '';
                const str = String(cell);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(',')
        ).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'query-results.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // --- Data Profile Methods ---

    computeDataProfile() {
        const profile = [];

        for (let i = 0; i < this.headers.length; i++) {
            const colType = this.inferColumnType(i);
            const isNumeric = colType === 'INTEGER' || colType === 'REAL';

            let count = 0;
            let nulls = 0;
            const uniqueValues = new Set();
            const numericValues = [];

            for (let r = 0; r < this.data.length; r++) {
                const val = this.data[r][i];
                if (val === undefined || val === null || val === '') {
                    nulls++;
                } else {
                    count++;
                    uniqueValues.add(val);
                    if (isNumeric) {
                        const num = Number(val);
                        if (!isNaN(num)) {
                            numericValues.push(num);
                        }
                    }
                }
            }

            const entry = {
                column: this.headers[i],
                type: isNumeric ? 'numeric' : 'text',
                count: count,
                nulls: nulls,
                unique: uniqueValues.size,
                mean: null,
                std: null,
                min: null,
                p25: null,
                p50: null,
                p75: null,
                max: null
            };

            if (isNumeric && numericValues.length > 0) {
                numericValues.sort((a, b) => a - b);
                const n = numericValues.length;
                const sum = numericValues.reduce((a, b) => a + b, 0);
                const mean = sum / n;
                const variance = numericValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;

                entry.mean = mean;
                entry.std = Math.sqrt(variance);
                entry.min = numericValues[0];
                entry.max = numericValues[n - 1];
                entry.p25 = this.percentile(numericValues, 0.25);
                entry.p50 = this.percentile(numericValues, 0.50);
                entry.p75 = this.percentile(numericValues, 0.75);
            }

            profile.push(entry);
        }

        return profile;
    }

    percentile(sortedArr, p) {
        const n = sortedArr.length;
        if (n === 0) return null;
        if (n === 1) return sortedArr[0];

        const index = p * (n - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const frac = index - lower;

        if (lower === upper) return sortedArr[lower];
        return sortedArr[lower] + frac * (sortedArr[upper] - sortedArr[lower]);
    }

    renderDataProfile(profile) {
        const section = document.getElementById('dataProfileSection');
        const container = document.getElementById('profileTableContainer');
        const summary = document.getElementById('profileSummary');

        const totalRows = this.data.length;
        const totalCols = this.headers.length;
        summary.textContent = `${totalCols.toLocaleString()} column${totalCols !== 1 ? 's' : ''}, ${totalRows.toLocaleString()} row${totalRows !== 1 ? 's' : ''}`;

        const statHeaders = ['Column', 'Type', 'Count', 'Nulls', 'Unique', 'Mean', 'Std', 'Min', '25%', '50%', '75%', 'Max'];

        let html = '<table class="csv-table"><thead><tr>';
        statHeaders.forEach(h => {
            html += `<th>${h}</th>`;
        });
        html += '</tr></thead><tbody>';

        profile.forEach(entry => {
            html += '<tr>';
            html += `<td>${this.escapeHtml(entry.column)}</td>`;
            html += `<td>${entry.type}</td>`;
            html += `<td>${entry.count.toLocaleString()}</td>`;
            html += `<td>${entry.nulls.toLocaleString()}</td>`;
            html += `<td>${entry.unique.toLocaleString()}</td>`;

            if (entry.type === 'numeric') {
                html += `<td>${this.formatStat(entry.mean)}</td>`;
                html += `<td>${this.formatStat(entry.std)}</td>`;
                html += `<td>${this.formatStat(entry.min)}</td>`;
                html += `<td>${this.formatStat(entry.p25)}</td>`;
                html += `<td>${this.formatStat(entry.p50)}</td>`;
                html += `<td>${this.formatStat(entry.p75)}</td>`;
                html += `<td>${this.formatStat(entry.max)}</td>`;
            } else {
                for (let i = 0; i < 7; i++) {
                    html += '<td class="profile-dash">\u2014</td>';
                }
            }

            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
        section.style.display = '';
    }

    formatStat(value) {
        if (value === null || value === undefined) return '\u2014';
        if (Number.isInteger(value)) return value.toLocaleString();
        return value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    }

    toggleProfile() {
        const content = document.getElementById('profileContent');
        const btn = document.getElementById('profileToggleBtn');
        const isCollapsed = content.style.display === 'none';

        content.style.display = isCollapsed ? '' : 'none';
        btn.classList.toggle('collapsed', !isCollapsed);
    }

    clearDataProfile() {
        const section = document.getElementById('dataProfileSection');
        section.style.display = 'none';
        document.getElementById('profileTableContainer').innerHTML = '';
        document.getElementById('profileSummary').textContent = '';
        // Reset toggle state
        document.getElementById('profileContent').style.display = '';
        document.getElementById('profileToggleBtn').classList.remove('collapsed');
    }

    // --- Auto-resize SQL Textarea ---

    autoResizeSQL() {
        const textarea = document.getElementById('sqlQuery');
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(80, textarea.scrollHeight) + 'px';
    }

    clearSQL() {
        document.getElementById('sqlSection').style.display = 'none';
        const sqlTextarea = document.getElementById('sqlQuery');
        sqlTextarea.value = '';
        sqlTextarea.style.height = '80px';
        this.updateHighlight();
        document.getElementById('sqlExamples').innerHTML = '';
        document.getElementById('sqlResultsContainer').innerHTML = '';
        document.getElementById('sqlResultsWrapper').classList.remove('show');
        document.getElementById('sqlResultsInfo').textContent = '';
        document.getElementById('sqlQueryInfo').textContent = '';
        this.hideSQLError();
        this.sqlResults = null;

        if (this.db && this.sqlReady) {
            try {
                this.db.run('DROP TABLE IF EXISTS csv');
            } catch (e) {
                // Ignore errors during cleanup
            }
        }
    }
}

// Initialize the app
const csvViewer = new CSVViewer();
