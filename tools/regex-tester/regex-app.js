// Regex Tester App
class RegexTester {
    constructor() {
        this.pattern = '';
        this.flags = '';
        this.testString = '';
        this.regex = null;
        this.currentCategory = 'web';
        this.patterns = this.initializePatterns();
        this.init();
    }

    initializePatterns() {
        return {
            web: [
                { name: 'Email', pattern: '[\\w.-]+@([\\w-]+\\.)+[\\w-]{2,4}', flags: 'g', test: 'Contact: john@example.com or jane.doe@company.co.uk' },
                { name: 'URL', pattern: 'https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*)', flags: 'g', test: 'Visit https://www.example.com or http://google.com' },
                { name: 'Phone (US)', pattern: '\\d{3}-\\d{3}-\\d{4}', flags: 'g', test: 'Call 555-123-4567 or 800-555-0199' },
                { name: 'Hex Color', pattern: '#[0-9a-fA-F]{6}\\b', flags: 'g', test: 'Colors: #FF5733 #00FF00 #0000FF' },
                { name: 'IP Address', pattern: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b', flags: 'g', test: 'Servers: 192.168.1.1 and 10.0.0.1' },
                { name: 'Social Handle', pattern: '@[a-zA-Z0-9_]{1,15}', flags: 'g', test: 'Follow @username and @another_user' },
                { name: 'Hashtag', pattern: '#[a-zA-Z0-9_]+', flags: 'g', test: 'Trending: #JavaScript #WebDev #Coding' },
                { name: 'Date MM/DD/YYYY', pattern: '\\b\\d{2}/\\d{2}/\\d{4}\\b', flags: 'g', test: 'Events: 12/25/2024 and 01/01/2025' }
            ],
            programming: [
                { name: 'camelCase', pattern: '\\b[a-z][a-zA-Z0-9]*\\b', flags: 'g', test: 'Variables: userName, firstName, isActive' },
                { name: 'snake_case', pattern: '\\b[a-z]+(_[a-z]+)+\\b', flags: 'g', test: 'Variables: user_name, first_name, is_active' },
                { name: 'HTML Tag', pattern: '<\\/?[a-zA-Z][^>]*>', flags: 'g', test: '<div class="test"><p>Hello</p></div>' },
                { name: 'Comment //', pattern: '\\/\\/.*$', flags: 'gm', test: '// This is a comment\\ncode(); // inline comment' },
                { name: 'Comment /* */', pattern: '\\/\\*[\\s\\S]*?\\*\\/', flags: 'g', test: '/* Block comment\\nmulti-line */' },
                { name: 'Quoted String', pattern: '(["|\'])(?:(?=(\\\\?))\\2.)*?\\1', flags: 'g', test: 'Strings: "hello" and \'world\'' }
            ],
            numbers: [
                { name: 'Integer', pattern: '-?\\b\\d+\\b', flags: 'g', test: 'Numbers: 42, -17, 0, 999' },
                { name: 'Decimal', pattern: '-?\\b\\d+\\.\\d+\\b', flags: 'g', test: 'Values: 3.14, -2.5, 0.99' },
                { name: 'Currency', pattern: '\\$[0-9]{1,3}(,[0-9]{3})*\\.\\d{2}', flags: 'g', test: 'Prices: $1,234.56 and $99.99' },
                { name: 'Percentage', pattern: '\\d+(\\.\\d+)?%', flags: 'g', test: 'Stats: 50%, 12.5%, 99.9%' },
                { name: 'Version', pattern: '\\d+\\.\\d+\\.\\d+', flags: 'g', test: 'Versions: 1.2.3, 2.0.0, 10.5.2' },
                { name: 'UUID', pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', flags: 'gi', test: 'ID: 550e8400-e29b-41d4-a716-446655440000' }
            ],
            text: [
                { name: 'UPPERCASE', pattern: '\\b[A-Z]{2,}\\b', flags: 'g', test: 'Acronyms: NASA, FBI, HTML, CSS' },
                { name: 'lowercase', pattern: '\\b[a-z]+\\b', flags: 'g', test: 'Words: hello world this is text' },
                { name: 'Alphanumeric', pattern: '[a-zA-Z0-9]+', flags: 'g', test: 'Mixed: abc123 test456 data789' },
                { name: 'Whitespace', pattern: '\\s+', flags: 'g', test: 'Text   with    spaces\\n\\tand\\ttabs' },
                { name: 'Duplicate Words', pattern: '\\b(\\w+)\\s+\\1\\b', flags: 'gi', test: 'The the quick quick brown fox' }
            ],
            files: [
                { name: 'File Extension', pattern: '\\.[a-zA-Z0-9]+\\b', flags: 'g', test: 'Files: document.pdf, image.jpg, script.js' },
                { name: 'Unix Path', pattern: '\\/([\\w.-]+\\/)*[\\w.-]+', flags: 'g', test: 'Paths: /usr/local/bin/node or /home/user/file.txt' },
                { name: 'Windows Path', pattern: '[A-Z]:\\\\(?:[^\\\\/:*?"<>|\\r\\n]+\\\\)*[^\\\\/:*?"<>|\\r\\n]*', flags: 'g', test: 'Paths: C:\\\\Users\\\\Name\\\\file.txt' }
            ],
            validation: [
                { name: 'Username', pattern: '^[a-zA-Z0-9_]{3,16}$', flags: '', test: 'user_name123' },
                { name: 'Strong Password', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$', flags: '', test: 'Pass123!' },
                { name: 'US ZIP Code', pattern: '\\b\\d{5}(-\\d{4})?\\b', flags: 'g', test: 'ZIP: 12345 or 12345-6789' },
                { name: 'Domain', pattern: '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$', flags: 'i', test: 'example.com' }
            ],
            dates: [
                { name: 'Date YYYY-MM-DD', pattern: '\\b(\\d{4})-(\\d{2})-(\\d{2})\\b', flags: 'g', test: 'Timestamps: 2024-01-15, 2023-12-31, 2025-06-07' },
                { name: 'Date MM/DD/YYYY', pattern: '\\b(\\d{2})/(\\d{2})/(\\d{4})\\b', flags: 'g', test: 'Dates: 01/15/2024, 12/31/2023, 06/07/2025' },
                { name: 'Date DD-Mon-YYYY', pattern: '\\b(\\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\\d{4})\\b', flags: 'gi', test: 'Log: 15-Jan-2024, 3-Dec-2023' },
                { name: 'Time HH:MM:SS', pattern: '\\b(\\d{2}):(\\d{2}):(\\d{2})\\b', flags: 'g', test: 'Events at 09:30:00 and 14:55:22 and 00:00:01' },
                { name: 'Time HH:MM', pattern: '\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b', flags: 'g', test: 'Meeting at 09:30 and 14:55 and 00:00' },
                { name: 'ISO 8601 Datetime', pattern: '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?', flags: 'g', test: 'Created: 2024-01-15T09:30:00Z and updated: 2024-06-07T14:55:22.123+05:30' },
                { name: 'Unix Timestamp (s)', pattern: '\\b1[0-9]{9}\\b', flags: 'g', test: 'Timestamps: 1705312200 and 1717768522' },
                { name: 'Unix Timestamp (ms)', pattern: '\\b1[0-9]{12}\\b', flags: 'g', test: 'Timestamps: 1705312200000 and 1717768522456' },
                { name: 'Filename Date YYYYMMDD', pattern: '(\\d{4})(\\d{2})(\\d{2})', flags: 'g', test: 'Files: backup_20240115.zip, log_20231231_report.txt' },
                { name: 'Filename YYYYMMDD_HHMMSS', pattern: '(\\d{4})(\\d{2})(\\d{2})_(\\d{2})(\\d{2})(\\d{2})', flags: 'g', test: 'Files: screenshot_20240115_093022.png, recording_20231231_235959.mp4' },
                { name: 'Hour & Minute from Timestamp', pattern: 'T(\\d{2}):(\\d{2})', flags: 'g', test: 'Logs: 2024-01-15T09:30:00Z and 2024-06-07T14:55:22Z' },
                { name: 'Year from ISO Date', pattern: '^(\\d{4})-', flags: 'gm', test: '2024-01-15\n2023-12-31\n2025-06-07' },
                { name: 'Month & Day from ISO Date', pattern: '\\d{4}-(\\d{2})-(\\d{2})', flags: 'g', test: 'Dates: 2024-01-15 and 2023-12-31' }
            ],
            security: [
                { name: 'JWT Token', pattern: 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+', flags: 'g', test: 'Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U' },
                { name: 'API Key', pattern: '(?:api[_-]?key|apikey|api[_-]?secret)[\\s]*[=:\\s]+[\\s]*["\']?[A-Za-z0-9_\\-]{16,}["\']?', flags: 'gi', test: 'api_key = "abc123def456ghi789jkl012mno"' },
                { name: 'AWS Key', pattern: '(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}', flags: 'g', test: 'Found key: AKIAIOSFODNN7EXAMPLE in config' },
                { name: 'Private Key', pattern: '-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----', flags: 'g', test: '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJ...' },
                { name: 'IPv6 Address', pattern: '([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}', flags: 'g', test: 'Address: 2001:0db8:85a3:0000:0000:8a2e:0370:7334' },
                { name: 'MAC Address', pattern: '([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}', flags: 'g', test: 'Device MAC: 00:1A:2B:3C:4D:5E and 00-1A-2B-3C-4D-5F' },
                { name: 'SQL Injection', pattern: '(?:[\'"]\\s*(?:OR|AND|UNION)\\s|--\\s|;\\s*DROP|/\\*.*\\*/)', flags: 'gi', test: 'Input: admin\' OR 1=1 -- and normal text' },
                { name: 'XSS Pattern', pattern: '<script[^>]*>[\\s\\S]*?<\\/script>|on\\w+\\s*=\\s*["\'][^"\']*["\']', flags: 'gi', test: 'Attack: <script>alert("xss")</script> and onerror="alert(1)"' }
            ]
        };
    }

    init() {
        this.setupEventListeners();
        this.renderPatterns();
    }

    setupEventListeners() {
        // Pattern input
        document.getElementById('regexPattern').addEventListener('input', () => this.updateRegex());
        document.getElementById('regexFlags').addEventListener('input', (e) => {
            this.updateFlagsFromInput(e.target.value);
        });

        // Flag checkboxes
        document.querySelectorAll('.flag-option input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateFlagsFromCheckboxes());
        });

        // Test string input
        document.getElementById('testString').addEventListener('input', () => this.updateRegex());

        // Replace button
        document.getElementById('replaceBtn').addEventListener('click', () => this.testReplace());

        // Category tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.currentCategory = e.target.dataset.category;
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.renderPatterns();
            });
        });
    }

    renderPatterns() {
        const container = document.getElementById('patternsContainer');
        const patterns = this.patterns[this.currentCategory];

        if (!container) {
            console.error('Container not found!');
            return;
        }

        if (!patterns) {
            console.error('Patterns not found for category:', this.currentCategory);
            return;
        }

        console.log('Rendering', patterns.length, 'patterns for category:', this.currentCategory);

        // Clear container first
        container.innerHTML = '';

        // Create buttons dynamically to avoid HTML escaping issues
        patterns.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'example-btn';
            btn.textContent = p.name;
            btn.dataset.pattern = p.pattern;
            btn.dataset.flags = p.flags;
            btn.dataset.test = p.test;

            btn.addEventListener('click', () => {
                console.log('Pattern button clicked:', p.name);
                document.getElementById('regexPattern').value = p.pattern;
                document.getElementById('testString').value = p.test;
                this.updateFlagsFromInput(p.flags);
                this.updateRegex();
            });

            container.appendChild(btn);
        });

        console.log('Buttons rendered:', container.children.length);
    }

    updateFlagsFromInput(flagString) {
        this.flags = flagString;
        document.getElementById('regexFlags').value = flagString;

        // Update checkboxes
        document.querySelectorAll('.flag-option input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = flagString.includes(checkbox.value);
        });

        this.updateRegex();
    }

    updateFlagsFromCheckboxes() {
        const flags = [];
        document.querySelectorAll('.flag-option input[type="checkbox"]:checked').forEach(checkbox => {
            flags.push(checkbox.value);
        });
        this.flags = flags.join('');
        document.getElementById('regexFlags').value = this.flags;
        this.updateRegex();
    }

    updateRegex() {
        this.pattern = document.getElementById('regexPattern').value;
        this.testString = document.getElementById('testString').value;

        const errorDisplay = document.getElementById('errorDisplay');

        // Clear previous error
        errorDisplay.classList.remove('show');
        errorDisplay.textContent = '';

        // Try to create regex
        try {
            if (!this.pattern) {
                this.regex = null;
                this.clearResults();
                return;
            }

            this.regex = new RegExp(this.pattern, this.flags);
            this.performTest();
        } catch (error) {
            this.regex = null;
            errorDisplay.textContent = `Error: ${error.message}`;
            errorDisplay.classList.add('show');
            this.clearResults();
        }
    }

    performTest() {
        if (!this.regex || !this.testString) {
            this.clearResults();
            return;
        }

        const matches = [];
        let match;

        if (this.flags.includes('g')) {
            // Global flag - find all matches
            const regex = new RegExp(this.regex.source, this.regex.flags);
            while ((match = regex.exec(this.testString)) !== null) {
                matches.push({
                    match: match[0],
                    index: match.index,
                    groups: match.slice(1),
                    fullMatch: match
                });

                // Prevent infinite loop on zero-length matches
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }
            }
        } else {
            // No global flag - find first match
            match = this.regex.exec(this.testString);
            if (match) {
                matches.push({
                    match: match[0],
                    index: match.index,
                    groups: match.slice(1),
                    fullMatch: match
                });
            }
        }

        this.displayResults(matches);
    }

    displayResults(matches) {
        const matchCount = document.getElementById('matchCount');
        const highlightedText = document.getElementById('highlightedText');
        const matchDetails = document.getElementById('matchDetails');

        // Update match count
        matchCount.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;

        if (matches.length === 0) {
            highlightedText.textContent = this.testString || 'No matches found';
            matchDetails.innerHTML = '';
            return;
        }

        // Highlight matches in text
        let highlightedHTML = '';
        let lastIndex = 0;

        matches.forEach(matchObj => {
            // Add text before match
            highlightedHTML += this.escapeHtml(this.testString.substring(lastIndex, matchObj.index));
            // Add highlighted match
            highlightedHTML += `<span class="match-highlight">${this.escapeHtml(matchObj.match)}</span>`;
            lastIndex = matchObj.index + matchObj.match.length;
        });

        // Add remaining text
        highlightedHTML += this.escapeHtml(this.testString.substring(lastIndex));
        highlightedText.innerHTML = highlightedHTML;

        // Display match details
        let detailsHTML = '';
        matches.forEach((matchObj, index) => {
            detailsHTML += `
                <div class="match-item">
                    <div class="match-item-header">Match ${index + 1} (index ${matchObj.index})</div>
                    <div class="match-text">${this.escapeHtml(matchObj.match)}</div>
            `;

            if (matchObj.groups.length > 0) {
                detailsHTML += '<div class="match-groups">';
                matchObj.groups.forEach((group, groupIndex) => {
                    if (group !== undefined) {
                        detailsHTML += `<div class="match-group">Group ${groupIndex + 1}: ${this.escapeHtml(group)}</div>`;
                    }
                });
                detailsHTML += '</div>';
            }

            detailsHTML += '</div>';
        });

        matchDetails.innerHTML = detailsHTML;
    }

    testReplace() {
        if (!this.regex || !this.testString) {
            return;
        }

        const replaceString = document.getElementById('replaceString').value;
        const replaceResult = document.getElementById('replaceResult');

        try {
            const result = this.testString.replace(this.regex, replaceString);
            replaceResult.textContent = result;
        } catch (error) {
            replaceResult.textContent = `Error: ${error.message}`;
        }
    }

    clearResults() {
        document.getElementById('matchCount').textContent = '0 matches';
        document.getElementById('highlightedText').textContent = this.testString || 'Enter a pattern and test string';
        document.getElementById('matchDetails').innerHTML = '';
        document.getElementById('replaceResult').textContent = '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const regexTester = new RegexTester();
});
