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
        const savedTimeline = this.loadJson('qol-tz-timeline');
        const legacyMerge = () => {
            const oldClock = this.loadJson('qol-tz-worldclock') || [];
            const oldPlanner = this.loadJson('qol-tz-planner') || [];
            return [...new Set([...oldClock, ...oldPlanner])];
        };
        this.timelineZones = (savedTimeline
            ? savedTimeline.filter(tz => this.isValidTimezone(tz))
            : legacyMerge().filter(tz => this.isValidTimezone(tz)))
            .filter(tz => tz !== this.localTimezone);
        if (this.timelineZones.length === 0) {
            this.timelineZones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney']
                .filter(tz => tz !== this.localTimezone);
        }

        this.dayOffset = 0;
        this.hoverCol = null;
        this.pinnedCol = null;

        const savedSource = localStorage.getItem('qol-tz-source');
        this.sourceTz = (savedSource && this.isValidTimezone(savedSource)) ? savedSource : this.localTimezone;

        const savedTargets = this.loadJson('qol-tz-targets');
        this.converterTargets = savedTargets
            ? savedTargets.filter(tz => this.isValidTimezone(tz))
            : ['UTC'];

        this.sourceTzPicker = null;
        this.clockInterval = null;
        this.dragIndex = null;
        this.init();
    }

    loadJson(key) {
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : null;
        } catch { return null; }
    }

    saveState() {
        localStorage.setItem('qol-tz-timeline', JSON.stringify(this.timelineZones));
        localStorage.setItem('qol-tz-source', this.sourceTz);
        localStorage.setItem('qol-tz-targets', JSON.stringify(this.converterTargets));
    }

    init() {
        this.setupConverter();
        this.setupTimeline();
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

    // --- Timeline (unified world clock + meeting planner, World Time Buddy style) ---

    setupTimeline() {
        document.getElementById('tlPrevDay').addEventListener('click', () => this.shiftDay(-1));
        document.getElementById('tlNextDay').addEventListener('click', () => this.shiftDay(1));
        document.getElementById('tlToday').addEventListener('click', () => this.shiftDay(0, true));
        this.setupTimelineAddRow();
        this.renderTimeline();
        this.clockInterval = setInterval(() => this.updateTimelineClocks(), 1000);
    }

    setupTimelineAddRow() {
        const addRow = document.getElementById('tlAddRow');
        const picker = this.buildTzPicker('', () => {});

        const addBtn = document.createElement('button');
        addBtn.className = 'format-btn';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add city';
        addBtn.addEventListener('click', () => {
            const tz = picker.getValue();
            if (tz && tz !== this.localTimezone && !this.timelineZones.includes(tz)) {
                this.timelineZones.push(tz);
                this.saveState();
                this.renderTimeline();
            }
            picker.setValue('');
        });

        addRow.appendChild(picker.element);
        addRow.appendChild(addBtn);
    }

    shiftDay(delta, absolute = false) {
        this.dayOffset = absolute ? 0 : this.dayOffset + delta;
        this.pinnedCol = null;
        this.renderTimeline();
    }

    // Reference instant for column 0 of the grid: local midnight of the viewed day
    getRefStart() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + this.dayOffset, 0, 0, 0);
    }

    colInstant(col) {
        return new Date(this.getRefStart().getTime() + col * 3600000);
    }

    isWeekend(date, tz) {
        const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
        return day === 'Sat' || day === 'Sun';
    }

    formatHourParts(hour) {
        const ampm = hour < 12 ? 'am' : 'pm';
        const display = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
        return { display, ampm };
    }

    // Minutes offset from UTC for a timezone at a given instant (handles fractional-hour zones)
    getOffsetMinutes(date, tz) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
        const hour = parts.hour === '24' ? 0 : parseInt(parts.hour, 10);
        const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
        return (asUTC - date.getTime()) / 60000;
    }

    getOffsetDiffLabel(tz) {
        const now = new Date();
        let diff = Math.round(this.getOffsetMinutes(now, tz) - this.getOffsetMinutes(now, this.localTimezone));
        if (diff === 0) return null;
        const sign = diff > 0 ? '+' : '−';
        diff = Math.abs(diff);
        const h = Math.floor(diff / 60), m = diff % 60;
        return sign + (m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`);
    }

    getCurrentCol() {
        const now = new Date();
        const frac = (now - this.getRefStart()) / 3600000;
        return Math.floor(frac);
    }

    renderTimeline() {
        const rows = document.getElementById('tlRows');
        rows.innerHTML = '';
        rows.appendChild(this.buildTimelineRow(this.localTimezone, true));
        this.timelineZones.forEach(tz => rows.appendChild(this.buildTimelineRow(tz, false)));

        rows.addEventListener('mousemove', e => this.handleTimelineHover(e));
        rows.addEventListener('mouseleave', () => this.handleTimelineHover(null));
        rows.addEventListener('click', e => this.handleTimelineClick(e));

        this.updateDateLabel();
        this.updateTimelineClocks();
        this.applyColumnState();
    }

    buildTimelineRow(tz, isHome) {
        const row = document.createElement('div');
        row.className = 'tz-tl-row' + (isHome ? ' tz-tl-row-home' : '');
        row.dataset.tz = tz;

        const info = document.createElement('div');
        info.className = 'tz-tl-info';

        if (!isHome) {
            const handle = document.createElement('span');
            handle.className = 'tz-tl-drag';
            handle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';
            handle.draggable = true;
            handle.addEventListener('dragstart', e => {
                this.dragIndex = this.timelineZones.indexOf(tz);
                row.classList.add('tz-tl-dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            handle.addEventListener('dragend', () => row.classList.remove('tz-tl-dragging'));
            info.appendChild(handle);
        } else {
            const homeIcon = document.createElement('span');
            homeIcon.className = 'tz-tl-home-icon';
            homeIcon.innerHTML = '<i class="fa-solid fa-house"></i>';
            homeIcon.title = 'Your local timezone';
            info.appendChild(homeIcon);
        }

        const text = document.createElement('div');
        text.className = 'tz-tl-info-text';

        const city = document.createElement('div');
        city.className = 'tz-tl-city';
        city.textContent = this.getCityName(tz);
        city.title = tz;

        if (!isHome) {
            const diffLabel = this.getOffsetDiffLabel(tz);
            if (diffLabel) {
                const badge = document.createElement('span');
                badge.className = 'tz-tl-offset-badge';
                badge.textContent = diffLabel;
                badge.title = 'Hours relative to your local timezone';
                city.appendChild(badge);
            }
        }

        const clock = document.createElement('div');
        clock.className = 'tz-tl-clock';

        const meta = document.createElement('div');
        meta.className = 'tz-tl-meta';

        text.appendChild(city);
        text.appendChild(clock);
        text.appendChild(meta);
        info.appendChild(text);

        if (!isHome) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'tz-tl-remove';
            removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            removeBtn.setAttribute('aria-label', 'Remove city');
            removeBtn.addEventListener('click', () => {
                this.timelineZones = this.timelineZones.filter(t => t !== tz);
                this.saveState();
                this.renderTimeline();
            });
            info.appendChild(removeBtn);
        }

        row.appendChild(info);

        const bar = document.createElement('div');
        bar.className = 'tz-tl-bar';

        for (let col = 0; col < 24; col++) {
            const instant = this.colInstant(col);
            const parts = this.getDateParts(instant, tz);
            const cell = document.createElement('div');
            cell.className = 'tz-tl-cell ' + this.getHourClass(parts.hour);
            if (this.isWeekend(instant, tz)) cell.classList.add('tz-tl-weekend');
            cell.dataset.col = col;
            const { display, ampm } = this.formatHourParts(parts.hour);
            const num = document.createElement('span');
            num.className = 'tz-tl-cell-num';
            num.textContent = display;
            const suffix = document.createElement('span');
            suffix.className = 'tz-tl-cell-ampm';
            suffix.textContent = ampm;
            cell.appendChild(num);
            cell.appendChild(suffix);
            bar.appendChild(cell);
        }

        row.appendChild(bar);

        if (!isHome) {
            row.addEventListener('dragover', e => {
                e.preventDefault();
                if (this.dragIndex === null) return;
                const overIdx = this.timelineZones.indexOf(tz);
                if (overIdx === -1 || overIdx === this.dragIndex) return;
                const [moved] = this.timelineZones.splice(this.dragIndex, 1);
                this.timelineZones.splice(overIdx, 0, moved);
                this.dragIndex = overIdx;
                this.saveState();
                this.renderTimeline();
            });
        }

        return row;
    }

    handleTimelineHover(e) {
        if (!e) { this.hoverCol = null; this.applyColumnState(); return; }
        const bar = e.target.closest('.tz-tl-bar');
        if (!bar) { this.hoverCol = null; this.applyColumnState(); return; }
        const rect = bar.getBoundingClientRect();
        const frac = Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width));
        this.hoverCol = Math.floor(frac * 24);
        this.applyColumnState();
    }

    handleTimelineClick(e) {
        const bar = e.target.closest('.tz-tl-bar');
        if (!bar) return;
        this.pinnedCol = this.pinnedCol === this.hoverCol ? null : this.hoverCol;
        this.applyColumnState();
    }

    applyColumnState() {
        const activeCol = this.hoverCol !== null ? this.hoverCol : this.pinnedCol;
        document.querySelectorAll('.tz-tl-cell').forEach(cell => {
            const col = parseInt(cell.dataset.col, 10);
            cell.classList.toggle('tz-tl-cell-hover', this.hoverCol === col);
            cell.classList.toggle('tz-tl-cell-pinned', this.pinnedCol === col);
        });

        const readout = document.getElementById('tlReadout');
        if (activeCol !== null) {
            const instant = this.colInstant(activeCol);
            const label = new Intl.DateTimeFormat('en-US', {
                timeZone: this.localTimezone, weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short'
            }).format(instant);
            readout.textContent = (this.pinnedCol !== null && this.hoverCol === null ? '\ud83d\udccc Pinned: ' : '') + label;
            readout.classList.add('tz-tl-readout-active');
        } else {
            readout.textContent = 'Hover the timeline to scrub \u00b7 click to pin a time';
            readout.classList.remove('tz-tl-readout-active');
        }
    }

    updateDateLabel() {
        const label = document.getElementById('tlDateLabel');
        const ref = this.getRefStart();
        label.textContent = new Intl.DateTimeFormat('en-US', {
            timeZone: this.localTimezone, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
        }).format(ref);
        document.getElementById('tlToday').classList.toggle('tz-nav-today-active', this.dayOffset === 0);
    }

    updateTimelineClocks() {
        const now = new Date();
        const currentCol = this.dayOffset === 0 ? this.getCurrentCol() : null;
        document.querySelectorAll('.tz-tl-row').forEach(row => {
            const tz = row.dataset.tz;
            if (!tz) return;
            row.querySelector('.tz-tl-clock').textContent = new Intl.DateTimeFormat('en-US', {
                timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            }).format(now);
            row.querySelector('.tz-tl-meta').textContent =
                `${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(now)} \u00b7 ${this.getTimezoneAbbr(now, tz)} (${this.getTimezoneOffset(now, tz)})`;

            row.querySelectorAll('.tz-tl-cell').forEach(cell => {
                cell.classList.toggle('tz-tl-cell-now', currentCol !== null && parseInt(cell.dataset.col, 10) === currentCol);
            });
        });
    }
}

const timezoneApp = new TimezoneApp();
