class EpochConverterApp {
    constructor() {
        this.epochInput = document.getElementById('epochInput');
        this.dateInput = document.getElementById('dateInput');
        this.timeInput = document.getElementById('timeInput');
        this.nowBtn = document.getElementById('nowBtn');
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startLiveClock();
        this.setDefaultDateTime();
    }

    setupEventListeners() {
        this.epochInput.addEventListener('input', () => this.convertEpochToHuman());

        document.querySelectorAll('input[name="epochUnit"]').forEach(radio => {
            radio.addEventListener('change', () => this.convertEpochToHuman());
        });

        this.nowBtn.addEventListener('click', () => this.fillNow());
        this.dateInput.addEventListener('input', () => this.convertHumanToEpoch());
        this.timeInput.addEventListener('input', () => this.convertHumanToEpoch());

        document.querySelectorAll('.result-copyable').forEach(el => {
            el.addEventListener('click', () => {
                const text = el.textContent;
                if (text && text !== '-') {
                    navigator.clipboard.writeText(text);
                    const original = el.textContent;
                    el.textContent = 'Copied!';
                    setTimeout(() => { el.textContent = original; }, 1000);
                }
            });
        });
    }

    setDefaultDateTime() {
        const now = new Date();
        this.dateInput.value = this.toDateInputValue(now);
        this.timeInput.value = this.toTimeInputValue(now);
        this.convertHumanToEpoch();
    }

    toDateInputValue(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    toTimeInputValue(date) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    convertEpochToHuman() {
        const value = this.epochInput.value.trim();
        if (!value) {
            this.clearEpochResults();
            return;
        }

        let epoch = parseInt(value, 10);
        if (isNaN(epoch)) {
            this.clearEpochResults();
            return;
        }

        const unit = document.querySelector('input[name="epochUnit"]:checked').value;
        const ms = unit === 'milliseconds' ? epoch : epoch * 1000;
        const date = new Date(ms);

        if (isNaN(date.getTime())) {
            this.clearEpochResults();
            return;
        }

        document.getElementById('resultLocal').textContent = this.formatLocalTime(date);
        document.getElementById('resultUTC').textContent = this.formatUTCTime(date);
        document.getElementById('resultISO').textContent = date.toISOString();
        document.getElementById('resultRelative').textContent = this.getRelativeTime(date);
    }

    convertHumanToEpoch() {
        const dateVal = this.dateInput.value;
        const timeVal = this.timeInput.value;

        if (!dateVal) {
            document.getElementById('resultSeconds').textContent = '-';
            document.getElementById('resultMilliseconds').textContent = '-';
            return;
        }

        const dateTimeStr = timeVal ? `${dateVal}T${timeVal}` : `${dateVal}T00:00:00`;
        const date = new Date(dateTimeStr);

        if (isNaN(date.getTime())) {
            document.getElementById('resultSeconds').textContent = '-';
            document.getElementById('resultMilliseconds').textContent = '-';
            return;
        }

        const ms = date.getTime();
        document.getElementById('resultSeconds').textContent = Math.floor(ms / 1000);
        document.getElementById('resultMilliseconds').textContent = ms;
    }

    fillNow() {
        const now = Date.now();
        const unit = document.querySelector('input[name="epochUnit"]:checked').value;
        this.epochInput.value = unit === 'milliseconds' ? now : Math.floor(now / 1000);
        this.convertEpochToHuman();
    }

    getRelativeTime(date) {
        const now = new Date();
        const diff = date.getTime() - now.getTime();
        const absDiff = Math.abs(diff);
        const isPast = diff < 0;

        const seconds = Math.floor(absDiff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        let timeStr;
        if (seconds < 60) {
            timeStr = `${seconds} second${seconds !== 1 ? 's' : ''}`;
        } else if (minutes < 60) {
            timeStr = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else if (hours < 24) {
            timeStr = `${hours} hour${hours !== 1 ? 's' : ''}`;
        } else if (days < 30) {
            timeStr = `${days} day${days !== 1 ? 's' : ''}`;
        } else if (months < 12) {
            timeStr = `${months} month${months !== 1 ? 's' : ''}`;
        } else {
            timeStr = `${years} year${years !== 1 ? 's' : ''}`;
        }

        return isPast ? `${timeStr} ago` : `in ${timeStr}`;
    }

    formatLocalTime(date) {
        return date.toLocaleString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        });
    }

    formatUTCTime(date) {
        return date.toUTCString();
    }

    startLiveClock() {
        const update = () => {
            const now = new Date();
            document.getElementById('liveEpoch').textContent = Math.floor(now.getTime() / 1000);
            document.getElementById('liveLocal').textContent = this.formatLocalTime(now);
            document.getElementById('liveUTC').textContent = this.formatUTCTime(now);
        };
        update();
        setInterval(update, 1000);
    }

    clearEpochResults() {
        document.getElementById('resultLocal').textContent = '-';
        document.getElementById('resultUTC').textContent = '-';
        document.getElementById('resultISO').textContent = '-';
        document.getElementById('resultRelative').textContent = '-';
    }
}

const epochApp = new EpochConverterApp();
