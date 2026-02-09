class TimezoneApp {
    constructor() {
        this.allTimezones = this.getTimezones();
        this.localTimezone = this.getLocalTimezone();
        this.commonTimezones = [
            'UTC',
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'Europe/London',
            'Europe/Berlin',
            'Europe/Paris',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Asia/Kolkata',
            'Asia/Dubai',
            'Australia/Sydney',
            'Pacific/Auckland'
        ];
        this.worldClockZones = [
            'UTC',
            this.localTimezone,
            'America/New_York',
            'America/Los_Angeles',
            'Europe/London',
            'Asia/Shanghai',
            'Asia/Tokyo',
            'Australia/Sydney',
            'Europe/Berlin'
        ];
        // Deduplicate in case local is already in the list
        this.worldClockZones = [...new Set(this.worldClockZones)];
        this.plannerTimezones = [
            'America/New_York',
            'Europe/London',
            'Asia/Shanghai',
            'Asia/Tokyo',
            'Australia/Sydney'
        ];
        this.clockInterval = null;
        this.init();
    }

    init() {
        this.populateDatalist('sourceTimezoneList');
        this.populateDatalist('addTimezoneList');
        this.populateDatalist('plannerTzList');
        this.setupGlobalAdd();
        this.setupConverter();
        this.setupWorldClock();
        this.setupMeetingPlanner();
    }

    setupGlobalAdd() {
        const input = document.getElementById('addTimezoneInput');
        const btn = document.getElementById('addTimezoneBtn');

        btn.addEventListener('click', () => {
            const tz = input.value.trim();
            if (tz && this.isValidTimezone(tz)) {
                this.addTimezoneEverywhere(tz);
                input.value = '';
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                btn.click();
            }
        });
    }

    addTimezoneEverywhere(tz) {
        // Converter: add as target row
        this.addTargetTimezone(tz);

        // World Clock: add card if not already present
        if (!this.worldClockZones.includes(tz)) {
            this.worldClockZones.push(tz);
            this.addClockCity(tz);
        }

        // Meeting Planner: add column if not already present
        if (!this.plannerTimezones.includes(tz)) {
            this.plannerTimezones.push(tz);
            this.updateMeetingPlanner();
        }
    }

    // --- Core Methods ---

    getTimezones() {
        try {
            return Intl.supportedValuesOf('timeZone');
        } catch (e) {
            // Fallback for older browsers
            return [
                'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
                'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
                'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Moscow',
                'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
                'Australia/Sydney', 'Pacific/Auckland'
            ];
        }
    }

    getLocalTimezone() {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    formatInTimezone(date, timezone, options = {}) {
        const defaults = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZone: timezone,
            timeZoneName: 'short'
        };
        return new Intl.DateTimeFormat('en-US', { ...defaults, ...options }).format(date);
    }

    getTimezoneOffset(date, timezone) {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'longOffset'
        });
        const parts = formatter.formatToParts(date);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        return tzPart ? tzPart.value : '';
    }

    getTimezoneAbbr(date, timezone) {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'short'
        });
        const parts = formatter.formatToParts(date);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        return tzPart ? tzPart.value : '';
    }

    getCityName(timezone) {
        if (timezone === 'UTC') return 'UTC';
        const parts = timezone.split('/');
        return parts[parts.length - 1].replace(/_/g, ' ');
    }

    populateDatalist(datalistId) {
        const datalist = document.getElementById(datalistId);
        if (!datalist) return;
        datalist.innerHTML = '';

        // Add common timezones first
        this.commonTimezones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz;
            option.label = `${this.getCityName(tz)} (${tz})`;
            datalist.appendChild(option);
        });

        // Add all timezones
        this.allTimezones.forEach(tz => {
            if (!this.commonTimezones.includes(tz)) {
                const option = document.createElement('option');
                option.value = tz;
                datalist.appendChild(option);
            }
        });
    }

    isValidTimezone(tz) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: tz });
            return true;
        } catch (e) {
            return false;
        }
    }

    // --- Converter Methods ---

    setupConverter() {
        const sourceDateTime = document.getElementById('sourceDateTime');
        const sourceTimezone = document.getElementById('sourceTimezone');

        // Default to now
        const now = new Date();
        sourceDateTime.value = this.toDateTimeLocalValue(now);
        sourceTimezone.value = this.localTimezone;

        // Add a default target
        this.addTargetTimezone('UTC');

        sourceDateTime.addEventListener('input', () => this.convertAll());
        sourceTimezone.addEventListener('change', () => this.convertAll());
        sourceTimezone.addEventListener('input', () => {
            if (this.isValidTimezone(sourceTimezone.value)) {
                this.convertAll();
            }
        });

        this.convertAll();
    }

    toDateTimeLocalValue(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }

    addTargetTimezone(defaultTz) {
        const container = document.getElementById('targetContainer');
        const row = document.createElement('div');
        row.className = 'tz-row';

        const label = document.createElement('label');
        label.textContent = 'Target';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tz-input tz-target-input';
        input.placeholder = 'Type timezone...';
        const datalistId = 'targetTzList_' + Date.now();
        input.setAttribute('list', datalistId);

        const datalist = document.createElement('datalist');
        datalist.id = datalistId;
        this.populateDatalistElement(datalist);

        if (defaultTz) {
            input.value = defaultTz;
        }

        const result = document.createElement('span');
        result.className = 'tz-result';
        result.textContent = '-';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'tz-remove-btn';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.title = 'Remove';
        removeBtn.setAttribute('aria-label', 'Remove timezone');
        removeBtn.addEventListener('click', () => {
            row.remove();
        });

        input.addEventListener('input', () => {
            if (this.isValidTimezone(input.value)) {
                this.convertAll();
            }
        });
        input.addEventListener('change', () => this.convertAll());

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(datalist);
        row.appendChild(result);
        row.appendChild(removeBtn);
        container.appendChild(row);

        this.convertAll();
    }

    populateDatalistElement(datalist) {
        this.commonTimezones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz;
            option.label = `${this.getCityName(tz)} (${tz})`;
            datalist.appendChild(option);
        });
        this.allTimezones.forEach(tz => {
            if (!this.commonTimezones.includes(tz)) {
                const option = document.createElement('option');
                option.value = tz;
                datalist.appendChild(option);
            }
        });
    }

    convertAll() {
        const sourceDateTime = document.getElementById('sourceDateTime').value;
        const sourceTz = document.getElementById('sourceTimezone').value;

        if (!sourceDateTime || !this.isValidTimezone(sourceTz)) return;

        // Parse the source datetime in the source timezone
        const date = this.parseDateInTimezone(sourceDateTime, sourceTz);
        if (!date) return;

        const targetRows = document.querySelectorAll('#targetContainer .tz-row');
        targetRows.forEach(row => {
            const input = row.querySelector('.tz-target-input');
            const result = row.querySelector('.tz-result');
            if (input && result) {
                const targetTz = input.value;
                if (this.isValidTimezone(targetTz)) {
                    result.textContent = this.formatInTimezone(date, targetTz);
                } else {
                    result.textContent = '-';
                }
            }
        });
    }

    parseDateInTimezone(dateTimeStr, timezone) {
        // dateTimeStr is "YYYY-MM-DDTHH:MM"
        // We need to interpret it as if it were in the given timezone
        const [datePart, timePart] = dateTimeStr.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);

        // Create a date in UTC, then adjust for the timezone offset
        // Use an iterative approach to find the correct UTC time
        const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

        // Get what the local time would be in the target timezone at our guess
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        });

        // First pass
        const parts1 = this.getDateParts(guess, timezone);
        const diff1 = Date.UTC(year, month - 1, day, hour, minute) -
                       Date.UTC(parts1.year, parts1.month - 1, parts1.day, parts1.hour, parts1.minute);

        const adjusted = new Date(guess.getTime() + diff1);

        // Second pass for DST edge cases
        const parts2 = this.getDateParts(adjusted, timezone);
        const diff2 = Date.UTC(year, month - 1, day, hour, minute) -
                       Date.UTC(parts2.year, parts2.month - 1, parts2.day, parts2.hour, parts2.minute);

        return new Date(adjusted.getTime() + diff2);
    }

    getDateParts(date, timezone) {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        const parts = formatter.formatToParts(date);
        const get = (type) => {
            const part = parts.find(p => p.type === type);
            return part ? parseInt(part.value, 10) : 0;
        };
        let hour = get('hour');
        if (hour === 24) hour = 0;
        return {
            year: get('year'),
            month: get('month'),
            day: get('day'),
            hour: hour,
            minute: get('minute')
        };
    }

    // --- World Clock Methods ---

    setupWorldClock() {
        this.renderWorldClock();
        this.startWorldClock();
    }

    renderWorldClock() {
        const grid = document.getElementById('clockGrid');
        grid.innerHTML = '';
        this.worldClockZones.forEach(tz => this.addClockCity(tz));
    }

    startWorldClock() {
        this.updateWorldClock();
        this.clockInterval = setInterval(() => this.updateWorldClock(), 1000);
    }

    updateWorldClock() {
        const now = new Date();
        const cards = document.querySelectorAll('.tz-clock-card');
        cards.forEach(card => {
            const tz = card.dataset.timezone;
            if (!tz) return;

            const timeEl = card.querySelector('.tz-clock-time');
            const dateEl = card.querySelector('.tz-clock-date');
            const offsetEl = card.querySelector('.tz-clock-offset');

            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            }).format(now);

            const dateStr = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            }).format(now);

            const offset = this.getTimezoneOffset(now, tz);
            const abbr = this.getTimezoneAbbr(now, tz);

            timeEl.textContent = timeStr;
            dateEl.textContent = dateStr;
            offsetEl.textContent = `${abbr} (${offset})`;
        });
    }

    addClockCity(timezone) {
        const grid = document.getElementById('clockGrid');
        const card = document.createElement('div');
        card.className = 'tz-clock-card';
        card.dataset.timezone = timezone;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'tz-clock-remove';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.title = 'Remove';
        removeBtn.setAttribute('aria-label', 'Remove city');
        removeBtn.addEventListener('click', () => {
            this.removeClockCity(timezone, card);
        });

        const city = document.createElement('div');
        city.className = 'tz-clock-city';
        city.textContent = this.getCityName(timezone);
        city.title = timezone;

        const time = document.createElement('div');
        time.className = 'tz-clock-time';
        time.textContent = '--:--:--';

        const dateEl = document.createElement('div');
        dateEl.className = 'tz-clock-date';
        dateEl.textContent = '-';

        const offset = document.createElement('div');
        offset.className = 'tz-clock-offset';
        offset.textContent = '-';

        card.appendChild(removeBtn);
        card.appendChild(city);
        card.appendChild(time);
        card.appendChild(dateEl);
        card.appendChild(offset);
        grid.appendChild(card);

        // Immediately update this card
        this.updateSingleCard(card);
    }

    updateSingleCard(card) {
        const tz = card.dataset.timezone;
        const now = new Date();

        card.querySelector('.tz-clock-time').textContent = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        }).format(now);

        card.querySelector('.tz-clock-date').textContent = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            weekday: 'short', month: 'short', day: 'numeric'
        }).format(now);

        card.querySelector('.tz-clock-offset').textContent =
            `${this.getTimezoneAbbr(now, tz)} (${this.getTimezoneOffset(now, tz)})`;
    }

    removeClockCity(timezone, card) {
        this.worldClockZones = this.worldClockZones.filter(tz => tz !== timezone);
        card.remove();
    }

    // --- Meeting Planner Methods ---

    setupMeetingPlanner() {
        const hourSelect = document.getElementById('plannerHour');
        for (let h = 0; h < 24; h++) {
            const option = document.createElement('option');
            option.value = h;
            const ampm = h < 12 ? 'AM' : 'PM';
            const displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
            option.textContent = `${displayHour}:00 ${ampm}`;
            if (h === 9) option.selected = true;
            hourSelect.appendChild(option);
        }

        const plannerSourceTz = document.getElementById('plannerSourceTz');
        plannerSourceTz.value = this.localTimezone;

        hourSelect.addEventListener('change', () => this.updateMeetingPlanner());
        plannerSourceTz.addEventListener('input', () => {
            if (this.isValidTimezone(plannerSourceTz.value)) {
                this.updateMeetingPlanner();
            }
        });
        plannerSourceTz.addEventListener('change', () => this.updateMeetingPlanner());

        this.updateMeetingPlanner();
    }

    updateMeetingPlanner() {
        const grid = document.getElementById('plannerGrid');
        const selectedHour = parseInt(document.getElementById('plannerHour').value, 10);
        const sourceTz = document.getElementById('plannerSourceTz').value;

        if (!this.isValidTimezone(sourceTz) || this.plannerTimezones.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">Add timezones to compare.</p>';
            return;
        }

        // Build a table: rows = 24 hours, cols = timezones
        const table = document.createElement('table');
        table.className = 'tz-planner-table';

        // Header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const sourceHeader = document.createElement('th');
        sourceHeader.textContent = this.getCityName(sourceTz);
        sourceHeader.title = sourceTz;
        headerRow.appendChild(sourceHeader);

        this.plannerTimezones.forEach(tz => {
            const th = document.createElement('th');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = this.getCityName(tz);
            nameSpan.title = tz;
            th.appendChild(nameSpan);

            const removeSpan = document.createElement('span');
            removeSpan.className = 'tz-planner-remove-tz';
            removeSpan.setAttribute('aria-label', 'Remove timezone');
            removeSpan.innerHTML = ' <i class="fa-solid fa-xmark"></i>';
            removeSpan.addEventListener('click', () => {
                this.plannerTimezones = this.plannerTimezones.filter(t => t !== tz);
                this.updateMeetingPlanner();
            });
            th.appendChild(removeSpan);
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body rows — one per hour
        const tbody = document.createElement('tbody');
        const today = new Date();

        for (let h = 0; h < 24; h++) {
            const row = document.createElement('tr');

            // Source hour cell
            const sourceCell = document.createElement('td');
            sourceCell.className = 'tz-hour-label';
            const ampm = h < 12 ? 'AM' : 'PM';
            const displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
            sourceCell.textContent = `${displayHour}:00 ${ampm}`;

            if (h === selectedHour) {
                sourceCell.classList.add('tz-hour-selected');
            }
            sourceCell.classList.add(this.getHourClass(h));
            row.appendChild(sourceCell);

            // Build a Date for this hour in the source timezone
            const sourceDate = this.buildDateForHour(today, h, sourceTz);

            // Target timezone cells
            this.plannerTimezones.forEach(tz => {
                const cell = document.createElement('td');
                const targetParts = this.getDateParts(sourceDate, tz);
                const targetH = targetParts.hour;
                const targetAmpm = targetH < 12 ? 'AM' : 'PM';
                const targetDisplayHour = targetH === 0 ? 12 : (targetH > 12 ? targetH - 12 : targetH);
                cell.textContent = `${targetDisplayHour}:00 ${targetAmpm}`;
                cell.className = this.getHourClass(targetH);

                if (h === selectedHour) {
                    cell.classList.add('tz-hour-selected');
                }
                row.appendChild(cell);
            });

            tbody.appendChild(row);
        }
        table.appendChild(tbody);

        grid.innerHTML = '';
        grid.appendChild(table);
    }

    buildDateForHour(refDate, hour, timezone) {
        const year = refDate.getFullYear();
        const month = refDate.getMonth();
        const day = refDate.getDate();
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`;
        return this.parseDateInTimezone(dateStr, timezone);
    }

    getHourClass(hour) {
        if (hour >= 9 && hour < 17) return 'tz-hour-good';
        if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 21)) return 'tz-hour-ok';
        return 'tz-hour-bad';
    }
}

const timezoneApp = new TimezoneApp();
