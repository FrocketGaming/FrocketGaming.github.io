class CronBuilderApp {
    constructor() {
        this.cronInput = document.getElementById('cronExpression');
        this.descriptionEl = document.getElementById('cronDescription');
        this.nextRunsList = document.getElementById('nextRunsList');
        this.fieldCards = document.querySelectorAll('.cron-field-card');
        this.dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        this.monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        this.suppressBuild = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.parseCronExpression();
    }

    setupEventListeners() {
        this.cronInput.addEventListener('input', () => this.parseCronExpression());

        this.fieldCards.forEach(card => {
            const modeSelect = card.querySelector('.field-mode');
            modeSelect.addEventListener('change', () => {
                this.updateFieldVisibility(card);
                this.buildCronExpression();
            });

            card.querySelectorAll('input').forEach(input => {
                input.addEventListener('input', () => this.buildCronExpression());
            });
        });

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPreset(btn.dataset.cron);
            });
        });
    }

    updateFieldVisibility(card) {
        const mode = card.querySelector('.field-mode').value;
        card.querySelector('.input-every').classList.toggle('hidden', mode !== 'every');
        card.querySelector('.input-specific').classList.toggle('hidden', mode !== 'specific');
        card.querySelector('.input-range').classList.toggle('hidden', mode !== 'range');
        card.querySelector('.input-step').classList.toggle('hidden', mode !== 'step');
    }

    parseCronExpression() {
        const value = this.cronInput.value.trim();
        const parts = value.split(/\s+/);

        if (parts.length !== 5) {
            this.descriptionEl.textContent = 'Invalid cron expression (need 5 fields)';
            this.nextRunsList.innerHTML = '<li>-</li>';
            return;
        }

        this.suppressBuild = true;
        parts.forEach((part, i) => this.updateFieldUI(i, part));
        this.suppressBuild = false;

        this.descriptionEl.textContent = this.describeExpression(parts);
        this.updateNextRuns(parts);
    }

    buildCronExpression() {
        if (this.suppressBuild) return;

        const parts = [];
        this.fieldCards.forEach(card => {
            const mode = card.querySelector('.field-mode').value;
            let value = '*';

            switch (mode) {
                case 'every':
                    value = '*';
                    break;
                case 'specific': {
                    const input = card.querySelector('.specific-value').value.trim();
                    value = input || '*';
                    break;
                }
                case 'range': {
                    const start = card.querySelector('.range-start').value;
                    const end = card.querySelector('.range-end').value;
                    value = (start !== '' && end !== '') ? `${start}-${end}` : '*';
                    break;
                }
                case 'step': {
                    const step = card.querySelector('.step-value').value;
                    value = step ? `*/${step}` : '*';
                    break;
                }
            }
            parts.push(value);
        });

        this.cronInput.value = parts.join(' ');
        this.descriptionEl.textContent = this.describeExpression(parts);
        this.updateNextRuns(parts);
    }

    updateFieldUI(index, value) {
        const card = this.fieldCards[index];
        if (!card) return;

        const modeSelect = card.querySelector('.field-mode');

        // Reset inputs
        card.querySelector('.specific-value').value = '';
        card.querySelector('.range-start').value = '';
        card.querySelector('.range-end').value = '';
        card.querySelector('.step-value').value = '';

        if (value === '*') {
            modeSelect.value = 'every';
        } else if (value.includes('/')) {
            modeSelect.value = 'step';
            card.querySelector('.step-value').value = value.split('/')[1];
        } else if (value.includes('-') && !value.includes(',')) {
            modeSelect.value = 'range';
            const rangeParts = value.split('-');
            card.querySelector('.range-start').value = rangeParts[0];
            card.querySelector('.range-end').value = rangeParts[1];
        } else {
            modeSelect.value = 'specific';
            card.querySelector('.specific-value').value = value;
        }

        this.updateFieldVisibility(card);
    }

    describeExpression(parts) {
        const [minute, hour, dom, month, dow] = parts;

        // All wildcards
        if (parts.every(p => p === '*')) return 'Every minute';

        let desc = [];

        // Time
        if (minute !== '*' && hour !== '*') {
            const minutes = this.parseField(minute, 0, 59);
            const hours = this.parseField(hour, 0, 23);
            if (minutes.length === 1 && hours.length === 1) {
                const h = hours[0];
                const m = minutes[0];
                const period = h >= 12 ? 'PM' : 'AM';
                const displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
                desc.push(`At ${displayHour}:${String(m).padStart(2, '0')} ${period}`);
            } else {
                desc.push(`At minute ${minute} of hour ${hour}`);
            }
        } else if (minute !== '*') {
            if (minute.includes('/')) {
                desc.push(`Every ${minute.split('/')[1]} minutes`);
            } else {
                desc.push(`At minute ${minute}`);
            }
        } else if (hour !== '*') {
            if (hour.includes('/')) {
                desc.push(`Every ${hour.split('/')[1]} hours`);
            } else {
                desc.push(`During hour ${hour}`);
            }
        } else {
            desc.push('Every minute');
        }

        // Day of month
        if (dom !== '*') {
            if (dom.includes('/')) {
                desc.push(`every ${dom.split('/')[1]} days`);
            } else if (dom.includes('-')) {
                desc.push(`on days ${dom} of the month`);
            } else {
                const days = dom.split(',');
                desc.push(`on day ${days.join(', ')} of the month`);
            }
        }

        // Month
        if (month !== '*') {
            const months = this.parseField(month, 1, 12);
            const monthStr = months.map(m => this.monthNames[m] || m).join(', ');
            desc.push(`in ${monthStr}`);
        }

        // Day of week
        if (dow !== '*') {
            const days = this.parseField(dow, 0, 6);
            if (dow.includes('-')) {
                const range = dow.split('-');
                const startDay = this.dayNames[parseInt(range[0])] || range[0];
                const endDay = this.dayNames[parseInt(range[1])] || range[1];
                desc.push(`${startDay} through ${endDay}`);
            } else {
                const dayStr = days.map(d => this.dayNames[d] || d).join(', ');
                desc.push(`on ${dayStr}`);
            }
        }

        return desc.join(', ');
    }

    parseField(field, min, max) {
        const values = new Set();

        field.split(',').forEach(part => {
            if (part === '*') {
                for (let i = min; i <= max; i++) values.add(i);
            } else if (part.includes('/')) {
                const [range, step] = part.split('/');
                const stepVal = parseInt(step);
                const start = range === '*' ? min : parseInt(range);
                for (let i = start; i <= max; i += stepVal) values.add(i);
            } else if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                for (let i = start; i <= end; i++) values.add(i);
            } else {
                const num = parseInt(part);
                if (!isNaN(num)) values.add(num);
            }
        });

        return Array.from(values).sort((a, b) => a - b);
    }

    updateNextRuns(parts) {
        const runs = this.calculateNextRuns(parts, 5);
        if (runs.length === 0) {
            this.nextRunsList.innerHTML = '<li>No upcoming runs found</li>';
            return;
        }
        this.nextRunsList.innerHTML = runs.map(date => {
            return `<li>${date.toLocaleString(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })}</li>`;
        }).join('');
    }

    calculateNextRuns(parts, count) {
        const runs = [];
        const now = new Date();
        const candidate = new Date(now);
        candidate.setSeconds(0, 0);
        candidate.setMinutes(candidate.getMinutes() + 1);

        const minuteVals = this.parseField(parts[0], 0, 59);
        const hourVals = this.parseField(parts[1], 0, 23);
        const domVals = this.parseField(parts[2], 1, 31);
        const monthVals = this.parseField(parts[3], 1, 12);
        const dowVals = this.parseField(parts[4], 0, 6);

        let iterations = 0;
        const maxIterations = 525600; // one year of minutes

        while (runs.length < count && iterations < maxIterations) {
            if (this.matchesCron(candidate, minuteVals, hourVals, domVals, monthVals, dowVals)) {
                runs.push(new Date(candidate));
            }
            candidate.setMinutes(candidate.getMinutes() + 1);
            iterations++;
        }

        return runs;
    }

    matchesCron(date, minuteVals, hourVals, domVals, monthVals, dowVals) {
        return minuteVals.includes(date.getMinutes()) &&
            hourVals.includes(date.getHours()) &&
            domVals.includes(date.getDate()) &&
            monthVals.includes(date.getMonth() + 1) &&
            dowVals.includes(date.getDay());
    }

    applyPreset(expression) {
        this.cronInput.value = expression;
        this.parseCronExpression();
    }
}

const cronApp = new CronBuilderApp();
