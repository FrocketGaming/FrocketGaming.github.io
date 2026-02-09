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

        // SQL playground listeners
        document.getElementById('sqlRunBtn').addEventListener('click', () => this.runQuery());
        document.getElementById('sqlExportBtn').addEventListener('click', () => this.exportQueryResults());
        document.getElementById('sqlQuery').addEventListener('keydown', (e) => {
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
            }
        });
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

            // Sanitize column names and infer types
            const sanitizedHeaders = this.headers.map(h => this.sanitizeColumnName(h));
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
                const values = row.map((cell, i) => {
                    if (cell === '') return null;
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
            this.db.run('ROLLBACK');
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

    clearSQL() {
        document.getElementById('sqlSection').style.display = 'none';
        document.getElementById('sqlQuery').value = '';
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
