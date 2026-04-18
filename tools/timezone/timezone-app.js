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

        // Load persisted state, validating each timezone
        const savedWorldClock = this.loadJson('qol-tz-worldclock');
        this.worldClockZones = savedWorldClock
            ? [...new Set(savedWorldClock.filter(tz => this.isValidTimezone(tz)))]
            : [...new Set(['UTC', this.localTimezone, 'America/New_York', 'America/Los_Angeles',
                           'Europe/London', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/Berlin'])];

        const savedPlanner = this.loadJson('qol-tz-planner');
        this.plannerTimezones = savedPlanner
            ? savedPlanner.filter(tz => this.isValidTimezone(tz))
            : ['America/New_York', 'Europe/London', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney'];

        const savedSource = localStorage.getItem('qol-tz-source');
        this.sourceTz = (savedSource && this.isValidTimezone(savedSource)) ? savedSource : this.localTimezone;

        const savedPlannerSource = localStorage.getItem('qol-tz-planner-source');
        this.plannerSourceTz = (savedPlannerSource && this.isValidTimezone(savedPlannerSource))
            ? savedPlannerSource : this.localTimezone;

        const savedTargets = this.loadJson('qol-tz-targets');
        this.converterTargets = savedTargets
            ? savedTargets.filter(tz => this.isValidTimezone(tz))
            : ['UTC'];

        this.sourceTzPicker = null;
        this.plannerSourceTzPicker = null;
        this.clockInterval = null;
        this.previewHour = null;
        this.init();
    }

    loadJson(key) {
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : null;
        } catch { return null; }
    }

    saveState() {
        localStorage.setItem('qol-tz-worldclock', JSON.stringify(this.worldClockZones));
        localStorage.setItem('qol-tz-planner', JSON.stringify(this.plannerTimezones));
        localStorage.setItem('qol-tz-source', this.sourceTz);
        localStorage.setItem('qol-tz-planner-source', this.plannerSourceTz);
        localStorage.setItem('qol-tz-targets', JSON.stringify(this.converterTargets));
    }

    init() {
        this.setupConverter();
        this.setupWorldClock();
        this.setupMeetingPlanner();
    }

    // --- Core Helpers ---

    getTimezones() {
        try {
            return Intl.supportedValuesOf('timeZone');
        } catch (e) {
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

    getTzDisplayName(tz) {
        if (!tz) return '';
        if (tz === 'UTC') return 'UTC';
        const parts = tz.split('/');
        return parts[parts.length - 1].replace(/_/g, ' ');
    }

    getCityName(tz) {
        return this.getTzDisplayName(tz);
    }

    isValidTimezone(tz) {
        if (!tz) return false;
        try {
            Intl.DateTimeFormat(undefined, { timeZone: tz });
            return true;
        } catch (e) {
            return false;
        }
    }

    formatInTimezone(date, timezone, options = {}) {
        const defaults = {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true, timeZone: timezone, timeZoneName: 'short'
        };
        return new Intl.DateTimeFormat('en-US', { ...defaults, ...options }).format(date);
    }

    getTimezoneOffset(date, timezone) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, timeZoneName: 'longOffset'
        }).formatToParts(date);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        return tzPart ? tzPart.value : '';
    }

    getTimezoneAbbr(date, timezone) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, timeZoneName: 'short'
        }).formatToParts(date);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        return tzPart ? tzPart.value : '';
    }

    getDateParts(date, timezone) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(date);
        const get = type => {
            const part = parts.find(p => p.type === type);
            return part ? parseInt(part.value, 10) : 0;
        };
        let hour = get('hour');
        if (hour === 24) hour = 0;
        return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute') };
    }

    parseDateInTimezone(dateTimeStr, timezone) {
        const [datePart, timePart] = dateTimeStr.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);

        const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
        const parts1 = this.getDateParts(guess, timezone);
        const diff1 = Date.UTC(year, month - 1, day, hour, minute) -
                      Date.UTC(parts1.year, parts1.month - 1, parts1.day, parts1.hour, parts1.minute);

        const adjusted = new Date(guess.getTime() + diff1);
        const parts2 = this.getDateParts(adjusted, timezone);
        const diff2 = Date.UTC(year, month - 1, day, hour, minute) -
                      Date.UTC(parts2.year, parts2.month - 1, parts2.day, parts2.hour, parts2.minute);

        return new Date(adjusted.getTime() + diff2);
    }

    toDateTimeLocalValue(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }

    getHourClass(hour) {
        if (hour >= 9 && hour < 17) return 'tz-hour-good';
        if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 21)) return 'tz-hour-ok';
        return 'tz-hour-bad';
    }

    // --- Custom Timezone Picker ---

    buildTzPicker(defaultValue, onChange) {
        const wrapper = document.createElement('div');
        wrapper.className = 'tz-picker';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tz-picker-input';
        input.placeholder = 'Search timezone...';
        input.autocomplete = 'off';
        input.spellcheck = false;

        const dropdown = document.createElement('div');
        dropdown.className = 'tz-picker-dropdown';

        let selectedTz = defaultValue || '';
        let isOpen = false;

        if (selectedTz) input.value = this.getTzDisplayName(selectedTz);

        const getOrderedTimezones = () => {
            const common = this.commonTimezones.filter(tz => this.allTimezones.includes(tz));
            const rest = this.allTimezones.filter(tz => !this.commonTimezones.includes(tz));
            return [...common, ...rest];
        };

        const renderOptions = (filter = '') => {
            dropdown.innerHTML = '';
            const filterLower = filter.toLowerCase();
            const ordered = getOrderedTimezones();
            const filtered = filter
                ? ordered.filter(tz =>
                    this.getTzDisplayName(tz).toLowerCase().includes(filterLower) ||
                    tz.toLowerCase().includes(filterLower))
                : ordered;

            const shown = filtered.slice(0, 80);
            if (shown.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'tz-picker-empty';
                empty.textContent = 'No timezones found';
                dropdown.appendChild(empty);
                return;
            }

            const now = new Date();
            shown.forEach(tz => {
                const option = document.createElement('div');
                option.className = 'tz-picker-option';
                option.dataset.tz = tz;
                if (tz === selectedTz) option.classList.add('tz-picker-selected');

                const nameEl = document.createElement('span');
                nameEl.className = 'tz-picker-option-name';
                nameEl.textContent = this.getTzDisplayName(tz);

                const detailEl = document.createElement('span');
                detailEl.className = 'tz-picker-option-detail';
                detailEl.textContent = `${this.getTimezoneAbbr(now, tz)} · ${this.getTimezoneOffset(now, tz)}`;

                option.appendChild(nameEl);
                option.appendChild(detailEl);
                option.addEventListener('mousedown', e => { e.preventDefault(); select(tz); });
                dropdown.appendChild(option);
            });
        };

        const select = tz => {
            selectedTz = tz;
            input.value = this.getTzDisplayName(tz);
            close();
            onChange(tz);
        };

        const open = () => {
            if (isOpen) return;
            isOpen = true;
            dropdown.classList.add('tz-picker-open');
            renderOptions('');
            const sel = dropdown.querySelector('.tz-picker-selected');
            if (sel) setTimeout(() => sel.scrollIntoView({ block: 'center' }), 0);
        };

        const close = () => {
            if (!isOpen) return;
            isOpen = false;
            dropdown.classList.remove('tz-picker-open');
            input.value = selectedTz ? this.getTzDisplayName(selectedTz) : '';
        };

        input.addEventListener('focus', () => { input.select(); renderOptions(''); open(); });
        input.addEventListener('input', () => {
            if (!isOpen) { isOpen = true; dropdown.classList.add('tz-picker-open'); }
            renderOptions(input.value);
        });
        input.addEventListener('blur', () => setTimeout(close, 150));

        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (!isOpen) { if (e.key === 'ArrowDown') { e.preventDefault(); open(); } return; }

            const options = [...dropdown.querySelectorAll('.tz-picker-option')];
            const activeEl = dropdown.querySelector('.tz-picker-option.tz-picker-active');
            let activeIdx = options.indexOf(activeEl);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeEl?.classList.remove('tz-picker-active');
                activeIdx = activeIdx < options.length - 1 ? activeIdx + 1 : 0;
                options[activeIdx]?.classList.add('tz-picker-active');
                options[activeIdx]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeEl?.classList.remove('tz-picker-active');
                activeIdx = activeIdx > 0 ? activeIdx - 1 : options.length - 1;
                options[activeIdx]?.classList.add('tz-picker-active');
                options[activeIdx]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const active = dropdown.querySelector('.tz-picker-option.tz-picker-active');
                if (active) select(active.dataset.tz);
            }
        });

        wrapper.appendChild(input);
        wrapper.appendChild(dropdown);

        return {
            element: wrapper,
            getValue: () => selectedTz,
            setValue: tz => {
                selectedTz = tz || '';
                input.value = tz ? this.getTzDisplayName(tz) : '';
            }
        };
    }

    // --- Converter ---

    setupConverter() {
        const sourceDateTime = document.getElementById('sourceDateTime');
        sourceDateTime.value = this.toDateTimeLocalValue(new Date());
        sourceDateTime.addEventListener('input', () => this.convertAll());

        const sourcePicker = this.buildTzPicker(this.sourceTz, tz => {
            this.sourceTz = tz;
            this.saveState();
            this.convertAll();
        });
        document.getElementById('sourceTimezonePicker').appendChild(sourcePicker.element);
        this.sourceTzPicker = sourcePicker;

        for (const tz of this.converterTargets) {
            this.addTargetRow(tz);
        }

        this.setupConverterAddRow();
        this.convertAll();
    }

    setupConverterAddRow() {
        const converter = document.querySelector('.tz-converter');
        const addRow = document.createElement('div');
        addRow.className = 'tz-section-add';

        const picker = this.buildTzPicker('', () => {});

        const addBtn = document.createElement('button');
        addBtn.className = 'format-btn';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add target';
        addBtn.addEventListener('click', () => {
            const tz = picker.getValue();
            if (tz && !this.converterTargets.includes(tz)) {
                this.converterTargets.push(tz);
                this.addTargetRow(tz);
                this.saveState();
            }
            picker.setValue('');
        });

        addRow.appendChild(picker.element);
        addRow.appendChild(addBtn);
        converter.appendChild(addRow);
    }

    addTargetRow(tz) {
        const container = document.getElementById('targetContainer');
        const row = document.createElement('div');
        row.className = 'tz-row';
        row.dataset.tz = tz;

        const label = document.createElement('label');
        label.textContent = 'Target';

        const picker = this.buildTzPicker(tz, newTz => {
            const oldTz = row.dataset.tz;
            row.dataset.tz = newTz;
            const idx = this.converterTargets.indexOf(oldTz);
            if (idx !== -1) this.converterTargets[idx] = newTz;
            this.saveState();
            this.convertAll();
        });

        const result = document.createElement('span');
        result.className = 'tz-result';
        result.textContent = '-';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'tz-remove-btn';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.setAttribute('aria-label', 'Remove timezone');
        removeBtn.addEventListener('click', () => {
            const removedTz = row.dataset.tz;
            this.converterTargets = this.converterTargets.filter(t => t !== removedTz);
            this.saveState();
            row.remove();
        });

        row.appendChild(label);
        row.appendChild(picker.element);
        row.appendChild(result);
        row.appendChild(removeBtn);
        container.appendChild(row);
        this.convertAll();
    }

    convertAll() {
        const sourceDateTime = document.getElementById('sourceDateTime').value;
        const sourceTz = this.sourceTzPicker?.getValue() || this.sourceTz;
        if (!sourceDateTime || !this.isValidTimezone(sourceTz)) return;

        const date = this.parseDateInTimezone(sourceDateTime, sourceTz);
        if (!date) return;

        document.querySelectorAll('#targetContainer .tz-row').forEach(row => {
            const tz = row.dataset.tz;
            const result = row.querySelector('.tz-result');
            if (result && tz && this.isValidTimezone(tz)) {
                result.textContent = this.formatInTimezone(date, tz);
            }
        });
    }

    // --- World Clock ---

    setupWorldClock() {
        this.renderWorldClock();
        this.setupWorldClockPreview();
        this.setupClockAddRow();
        this.startWorldClock();
    }

    setupWorldClockPreview() {
        const clockSection = document.querySelector('.tz-world-clock');
        const h3 = clockSection.querySelector('h3');

        const bar = document.createElement('div');
        bar.className = 'tz-clock-preview-bar';

        const label = document.createElement('label');
        label.textContent = 'Preview UTC hour:';

        const select = document.createElement('select');
        select.className = 'tz-select';

        const liveOpt = document.createElement('option');
        liveOpt.value = '';
        liveOpt.textContent = '— live —';
        select.appendChild(liveOpt);

        for (let h = 0; h < 24; h++) {
            const opt = document.createElement('option');
            opt.value = h;
            const ampm = h < 12 ? 'AM' : 'PM';
            const display = h === 0 ? 12 : (h > 12 ? h - 12 : h);
            opt.textContent = `${String(display).padStart(2, '\u00a0')}:00 ${ampm} UTC`;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => {
            this.previewHour = select.value === '' ? null : parseInt(select.value, 10);
            document.getElementById('clockGrid').classList.toggle('tz-preview-mode', this.previewHour !== null);
            this.updateWorldClock();
        });

        bar.appendChild(label);
        bar.appendChild(select);
        h3.insertAdjacentElement('afterend', bar);
    }

    setupClockAddRow() {
        const clockSection = document.querySelector('.tz-world-clock');
        const addRow = document.createElement('div');
        addRow.className = 'tz-section-add';

        const picker = this.buildTzPicker('', () => {});

        const addBtn = document.createElement('button');
        addBtn.className = 'format-btn';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add city';
        addBtn.addEventListener('click', () => {
            const tz = picker.getValue();
            if (tz && !this.worldClockZones.includes(tz)) {
                this.worldClockZones.push(tz);
                this.addClockCity(tz);
                this.saveState();
            }
            picker.setValue('');
        });

        addRow.appendChild(picker.element);
        addRow.appendChild(addBtn);
        clockSection.appendChild(addRow);
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
        let displayDate = now;

        if (this.previewHour !== null) {
            displayDate = new Date(Date.UTC(
                now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
                this.previewHour, 0, 0
            ));
        }

        document.querySelectorAll('.tz-clock-card').forEach(card => {
            const tz = card.dataset.timezone;
            if (!tz) return;

            const timeEl = card.querySelector('.tz-clock-time');
            if (this.previewHour !== null) {
                timeEl.textContent = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true
                }).format(displayDate);
            } else {
                timeEl.textContent = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                }).format(now);
            }

            card.querySelector('.tz-clock-date').textContent = new Intl.DateTimeFormat('en-US', {
                timeZone: tz, weekday: 'short', month: 'short', day: 'numeric'
            }).format(displayDate);

            card.querySelector('.tz-clock-offset').textContent =
                `${this.getTimezoneAbbr(now, tz)} (${this.getTimezoneOffset(now, tz)})`;
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
            this.worldClockZones = this.worldClockZones.filter(tz => tz !== timezone);
            this.saveState();
            card.remove();
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

        const now = new Date();
        time.textContent = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        }).format(now);
        dateEl.textContent = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric'
        }).format(now);
        offset.textContent = `${this.getTimezoneAbbr(now, timezone)} (${this.getTimezoneOffset(now, timezone)})`;
    }

    // --- Meeting Planner ---

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
        hourSelect.addEventListener('change', () => this.updateMeetingPlanner());

        const plannerPicker = this.buildTzPicker(this.plannerSourceTz, tz => {
            this.plannerSourceTz = tz;
            this.saveState();
            this.updateMeetingPlanner();
        });
        document.getElementById('plannerSourceTzPicker').appendChild(plannerPicker.element);
        this.plannerSourceTzPicker = plannerPicker;

        this.setupPlannerAddRow();
        this.updateMeetingPlanner();
    }

    setupPlannerAddRow() {
        const plannerSection = document.querySelector('.tz-meeting-planner');
        const addRow = document.createElement('div');
        addRow.className = 'tz-section-add';

        const picker = this.buildTzPicker('', () => {});

        const addBtn = document.createElement('button');
        addBtn.className = 'format-btn';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add timezone';
        addBtn.addEventListener('click', () => {
            const tz = picker.getValue();
            if (tz && !this.plannerTimezones.includes(tz)) {
                this.plannerTimezones.push(tz);
                this.saveState();
                this.updateMeetingPlanner();
            }
            picker.setValue('');
        });

        addRow.appendChild(picker.element);
        addRow.appendChild(addBtn);
        plannerSection.appendChild(addRow);
    }

    updateMeetingPlanner() {
        const grid = document.getElementById('plannerGrid');
        const selectedHour = parseInt(document.getElementById('plannerHour').value, 10);
        const sourceTz = this.plannerSourceTzPicker?.getValue() || this.plannerSourceTz;

        if (!this.isValidTimezone(sourceTz) || this.plannerTimezones.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">Add timezones to compare.</p>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'tz-planner-table';

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
                this.saveState();
                this.updateMeetingPlanner();
            });
            th.appendChild(removeSpan);
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const today = new Date();
        const startH = ((selectedHour - 5) % 24 + 24) % 24;

        for (let i = 0; i < 11; i++) {
            const h = (startH + i) % 24;
            const row = document.createElement('tr');

            const sourceCell = document.createElement('td');
            sourceCell.className = 'tz-hour-label';
            const ampm = h < 12 ? 'AM' : 'PM';
            const displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
            sourceCell.textContent = `${displayHour}:00 ${ampm}`;
            if (h === selectedHour) sourceCell.classList.add('tz-hour-selected');
            sourceCell.classList.add(this.getHourClass(h));
            row.appendChild(sourceCell);

            const sourceDate = this.buildDateForHour(today, h, sourceTz);
            this.plannerTimezones.forEach(tz => {
                const cell = document.createElement('td');
                const targetParts = this.getDateParts(sourceDate, tz);
                const targetH = targetParts.hour;
                const targetAmpm = targetH < 12 ? 'AM' : 'PM';
                const targetDisplayHour = targetH === 0 ? 12 : (targetH > 12 ? targetH - 12 : targetH);
                cell.textContent = `${targetDisplayHour}:00 ${targetAmpm}`;
                cell.className = this.getHourClass(targetH);
                if (h === selectedHour) cell.classList.add('tz-hour-selected');
                row.appendChild(cell);
            });

            tbody.appendChild(row);
        }
        table.appendChild(tbody);

        grid.innerHTML = '';
        grid.appendChild(table);
    }

    buildDateForHour(refDate, hour, timezone) {
        const y = refDate.getFullYear();
        const m = refDate.getMonth();
        const d = refDate.getDate();
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`;
        return this.parseDateInTimezone(dateStr, timezone);
    }
}

const timezoneApp = new TimezoneApp();
