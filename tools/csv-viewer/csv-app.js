// CSV Viewer App
class CSVViewer {
    constructor() {
        this.data = [];
        this.headers = [];
        this.filteredData = [];
        this.sortColumn = -1;
        this.sortAscending = true;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('parseBtn').addEventListener('click', () => this.parseCSV());
        document.getElementById('clearBtn').addEventListener('click', () => this.clear());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportCSV());
        document.getElementById('searchInput').addEventListener('input', (e) => this.filterTable(e.target.value));

        // Upload button triggers hidden file input
        document.getElementById('uploadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        // Handle file upload
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));

        // Parse on Enter key in textarea
        document.getElementById('csvInput').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.parseCSV();
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
            const contents = e.target.result;
            document.getElementById('csvInput').value = contents;
            // Auto-parse after upload
            this.parseCSV();
            // Reset button
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

    parseCSV() {
        const input = document.getElementById('csvInput').value.trim();

        if (!input) {
            this.showEmptyState('Please enter CSV data first');
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
            this.showEmptyState('No data matches your search');
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

    filterTable(searchTerm) {
        if (!searchTerm) {
            this.filteredData = [...this.data];
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredData = this.data.filter(row =>
                row.some(cell => cell.toLowerCase().includes(term))
            );
        }

        this.renderTable();
        this.updateInfo();
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

    exportCSV() {
        if (this.data.length === 0) {
            return;
        }

        // Build CSV from current filtered data
        const rows = [this.headers, ...this.filteredData];
        const csv = rows.map(row =>
            row.map(cell => {
                // Quote fields that contain commas, quotes, or newlines
                if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',')
        ).join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'export.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    clear() {
        document.getElementById('csvInput').value = '';
        document.getElementById('searchInput').value = '';
        this.data = [];
        this.headers = [];
        this.filteredData = [];
        this.showEmptyState('Paste CSV data and click "Parse CSV" to view the table');
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
}

// Initialize the app
const csvViewer = new CSVViewer();
