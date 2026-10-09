// Converts a Python literal (dict/list/tuple/set repr, as printed by print() or
// pprint) into a plain JS value that JSON.stringify can handle.
//
// Handles: single/double/triple-quoted strings (with r/b/u/f prefixes and
// adjacent-literal concatenation), True/False/None, tuples and sets (→ arrays),
// non-string dict keys (→ their Python repr), trailing commas, # comments,
// 1_000 / 0x1F / 1e5 numbers, nan/inf, and anything else that can't map to
// JSON — datetime.datetime(...), Decimal('1.5'), <Foo object at 0x...> — is
// kept as its source text in a string so nothing is silently dropped.

function pythonToJson(src) {
    let i = 0;

    const fail = (msg) => {
        const line = src.slice(0, i).split('\n').length;
        throw new Error(`${msg} (line ${line})`);
    };

    const skipWs = () => {
        while (i < src.length) {
            const c = src[i];
            if (c === '#') {
                while (i < src.length && src[i] !== '\n') i++;
            } else if (c === '\\' && src[i + 1] === '\n') {
                i += 2;
            } else if (/\s/.test(c)) {
                i++;
            } else {
                break;
            }
        }
    };

    const isIdentStart = (c) => /[A-Za-z_]/.test(c);
    const isIdentChar = (c) => /[A-Za-z0-9_]/.test(c);

    const peekStringStart = () => {
        let j = i;
        while (j < src.length && /[rRbBuUfF]/.test(src[j]) && j - i < 2) j++;
        return src[j] === '"' || src[j] === "'" ? j : -1;
    };

    const parseEscape = (raw) => {
        const c = src[i++];
        if (raw) {
            // In raw strings a backslash only stops the next quote from closing.
            return '\\' + c;
        }
        switch (c) {
            case 'n': return '\n';
            case 't': return '\t';
            case 'r': return '\r';
            case '0': case '1': case '2': case '3':
            case '4': case '5': case '6': case '7': {
                let oct = c;
                while (oct.length < 3 && /[0-7]/.test(src[i])) oct += src[i++];
                return String.fromCharCode(parseInt(oct, 8));
            }
            case 'a': return '\x07';
            case 'b': return '\b';
            case 'f': return '\f';
            case 'v': return '\v';
            case '\n': return '';
            case 'x': case 'u': case 'U': {
                const len = c === 'x' ? 2 : c === 'u' ? 4 : 8;
                const hex = src.slice(i, i + len);
                if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== len) fail(`Bad \\${c} escape`);
                i += len;
                return String.fromCodePoint(parseInt(hex, 16));
            }
            case 'N': {
                // \N{NAME} — no name table in the browser; keep it verbatim.
                const end = src.indexOf('}', i);
                if (src[i] !== '{' || end === -1) fail('Bad \\N escape');
                const name = src.slice(i - 2, end + 1);
                i = end + 1;
                return name;
            }
            default: return c; // \\ \' \" and unknown escapes
        }
    };

    const parseOneString = () => {
        let raw = false;
        while (/[rRbBuUfF]/.test(src[i])) {
            if (src[i] === 'r' || src[i] === 'R') raw = true;
            i++;
        }
        const q = src[i];
        const triple = src.slice(i, i + 3) === q.repeat(3);
        const delim = triple ? q.repeat(3) : q;
        i += delim.length;
        let out = '';
        while (true) {
            if (i >= src.length) fail('Unterminated string');
            if (src.startsWith(delim, i)) { i += delim.length; return out; }
            const c = src[i];
            if (c === '\\') { i++; out += parseEscape(raw); continue; }
            if (c === '\n' && !triple) fail('Unterminated string');
            out += c;
            i++;
        }
    };

    const parseString = () => {
        // 'a' 'b' → 'ab', same as Python
        let out = parseOneString();
        while (true) {
            const save = i;
            skipWs();
            if (peekStringStart() === -1) { i = save; return out; }
            out += parseOneString();
        }
    };

    // Sticky, so it matches at i without copying the rest of the source.
    const NUMBER_RE = /(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)[jJ]?/y;

    const parseNumber = () => {
        NUMBER_RE.lastIndex = i;
        const m = NUMBER_RE.exec(src);
        if (!m) fail('Bad number');
        i += m[0].length;
        const text = m[0].replace(/_/g, '');
        if (/[jJ]$/.test(text)) return text; // complex
        let n;
        if (/^0[xX]/.test(text)) n = parseInt(text.slice(2), 16);
        else if (/^0[oO]/.test(text)) n = parseInt(text.slice(2), 8);
        else if (/^0[bB]/.test(text)) n = parseInt(text.slice(2), 2);
        else n = Number(text);
        // Big Python ints would lose digits as a JS number; keep them exact.
        if (Number.isInteger(n) && !Number.isSafeInteger(n) && /^\d+$/.test(text)) return text;
        return n;
    };

    // Grab balanced source text starting at an opening bracket, honouring strings.
    const skipBalanced = (open, close) => {
        let depth = 0;
        while (i < src.length) {
            if (peekStringStart() !== -1) {
                parseOneString();
                continue;
            }
            const c = src[i++];
            if (c === open) depth++;
            else if (c === close && --depth === 0) return;
        }
        fail(`Unclosed ${open}`);
    };

    const parseIdentOrCall = () => {
        const start = i;
        while (i < src.length && (isIdentChar(src[i]) || (src[i] === '.' && isIdentStart(src[i + 1] || '')))) i++;
        const name = src.slice(start, i);
        const save = i;
        skipWs();
        if (src[i] === '(') {
            const callStart = i;
            skipBalanced('(', ')');
            const args = src.slice(callStart + 1, i - 1).trim();
            if (!args && ['dict', 'list', 'tuple', 'set', 'frozenset'].includes(name)) {
                return name === 'dict' ? {} : [];
            }
            return src.slice(start, i);
        }
        i = save;
        switch (name) {
            case 'True': return true;
            case 'False': return false;
            case 'None': return null;
            case 'nan': return 'NaN';
            case 'inf': return 'Infinity';
            case 'Ellipsis': return '...';
            default: return name;
        }
    };

    const keyToString = (k) => {
        if (typeof k === 'string') return k;
        if (k === true) return 'True';
        if (k === false) return 'False';
        if (k === null) return 'None';
        if (typeof k === 'number') return String(k);
        if (Array.isArray(k)) return '(' + k.map(v => keyToString(v)).join(', ') + (k.length === 1 ? ',)' : ')');
        return JSON.stringify(k);
    };

    // Parses comma-separated items until `close`; returns the raw items.
    const parseSeq = (close, itemFn) => {
        const items = [];
        let sawComma = false;
        while (true) {
            skipWs();
            if (src[i] === close) { i++; return { items, sawComma }; }
            items.push(itemFn());
            skipWs();
            if (src[i] === ',') { i++; sawComma = true; continue; }
            if (src[i] === close) { i++; return { items, sawComma }; }
            fail(`Expected ',' or '${close}'`);
        }
    };

    const parseValue = () => {
        skipWs();
        const c = src[i];
        if (c === undefined) fail('Unexpected end of input');

        if (peekStringStart() !== -1) return parseString();

        if (c === '{') {
            i++;
            skipWs();
            if (src[i] === '}') { i++; return {}; }
            const first = parseValue();
            skipWs();
            if (src[i] === ':') {
                // dict
                const obj = {};
                i++;
                obj[keyToString(first)] = parseValue();
                skipWs();
                if (src[i] === ',') {
                    i++;
                    parseSeq('}', () => {
                        const k = parseValue();
                        skipWs();
                        if (src[i] !== ':') fail("Expected ':'");
                        i++;
                        obj[keyToString(k)] = parseValue();
                        return null;
                    });
                } else if (src[i] === '}') {
                    i++;
                } else {
                    fail("Expected ',' or '}'");
                }
                return obj;
            }
            // set
            const arr = [first];
            if (src[i] === ',') { i++; arr.push(...parseSeq('}', parseValue).items); }
            else if (src[i] === '}') i++;
            else fail("Expected ',' or '}'");
            return arr;
        }

        if (c === '[') { i++; return parseSeq(']', parseValue).items; }

        if (c === '(') {
            i++;
            const { items, sawComma } = parseSeq(')', parseValue);
            // (x) is just x; (x,) and () are tuples
            return items.length === 1 && !sawComma ? items[0] : items;
        }

        if (c === '<') {
            // Default object repr: <Foo object at 0x...>, <Color.RED: 1>
            const start = i;
            skipBalanced('<', '>');
            return src.slice(start, i);
        }

        if (c === '-' || c === '+') {
            i++;
            skipWs();
            const v = parseValue();
            if (typeof v === 'number') return c === '-' ? -v : v;
            if (v === 'Infinity') return c === '-' ? '-Infinity' : 'Infinity';
            if (typeof v === 'string' && /^[\d.]/.test(v)) return c === '-' ? '-' + v : v;
            fail(`Unexpected '${c}'`);
        }

        if (src.startsWith('...', i)) { i += 3; return '...'; }

        if (/[\d.]/.test(c)) return parseNumber();

        if (isIdentStart(c)) return parseIdentOrCall();

        fail(`Unexpected character '${c}'`);
    };

    const value = parseValue();
    skipWs();
    if (i < src.length) fail(`Unexpected '${src[i]}' after value`);
    return value;
}
