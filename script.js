const blob = new Blob(['importScripts("https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker.min.js");']);
const lzma = new LZMA(window.URL.createObjectURL(blob));

let editor = null;
let select = null;
let clipboard = null;
let statsEl = null;

const shortenUrl = async (url) => {
    try {
        const response = await fetch('/api/shorturl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                originalURL: url,
                domain: "link.qa-team.ru"
            })
        });

        const data = await response.json();
        return data.shortURL;
    } catch (error) {
        console.error('Error shortening URL:', error);
        return url;
    }
};

const init = () => {
    handleLegacyUrl();
    initCodeEditor();
    initLangSelector();
    initCode();
    initClipboard();
    initModals();
    document.getElementById('beautifyJson').addEventListener('click', beautifyJson);
};

const initCodeEditor = () => {
    CodeMirror.modeURL = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.5/mode/%N/%N.js';
    editor = new CodeMirror(byId('editor'), {
        lineNumbers: true,
        theme: 'dracula',
        readOnly: readOnly,
        lineWrapping: false,
        scrollbarStyle: 'simple',
    });
    if (readOnly) {
        document.body.classList.add('readonly');
    }

    statsEl = byId('stats');
    editor.on('change', () => {
        statsEl.innerHTML = `Length: ${editor.getValue().length} |  Lines: ${editor['doc'].size}`;
        hideCopyBar();
    });
};

const initLangSelector = () => {
    select = new SlimSelect({
        select: '#language',
        data: CodeMirror.modeInfo.map((e) => ({
            text: e.name,
            value: shorten(e.name),
            data: { mime: e.mime, mode: e.mode },
        })),
        showContent: 'down',
        onChange: (e) => {
            const language = e.data || { mime: null, mode: null };
            editor.setOption('mode', language.mime);
            CodeMirror.autoLoadMode(editor, language.mode);
            document.title = e.text && e.text !== 'Plain Text' ? `NoPaste - ${e.text} code snippet` : 'NoPaste';
            
            // Show/hide beautify button based on language
            const beautifyButton = byId('beautifyJson');
            if (e.text === 'JSON') {
                beautifyButton.classList.remove('hidden');
            } else {
                beautifyButton.classList.add('hidden');
            }
        },
    });

    // Set lang selector and trigger the change event manually
    const l = new URLSearchParams(window.location.search).get('l');
    const initialValue = l ? decodeURIComponent(l) : shorten('Plain Text');
    select.set(initialValue);
    
    // Check if JSON is selected initially
    const selectedData = select.selected();
    const selectedOption = select.data.getSelected();
    if (selectedOption && selectedOption.text === 'JSON') {
        byId('beautifyJson').classList.remove('hidden');
    }
};

const initCode = () => {
    let base64 = location.hash.substr(1);
    if (base64.length === 0) {
        return;
    }
    decompress(base64, (code, err) => {
        if (err) {
            console.error('Failed to decompress data: ' + err);
            MicroModal.show('error-modal');
            return;
        }
        editor.setValue(code);
    });
};

const handleLegacyUrl = () => {
    const lang = new URLSearchParams(window.location.search).get('lang');
    const base = `${location.protocol}//${location.host}`;
    if (location.hash.charAt(5) === '-') {
        const hashedLang = location.hash.substr(1, 4);
        const newLang = CodeMirror.modeInfo.find((e) => hash(e.name) === hashedLang);
        const queryParams = newLang ? '?l=' + shorten(newLang.name) : '';
        location.replace(`${base}/${queryParams}#${location.hash.substr(6)}`);
        throw new Error('waiting for page to reload');
    }
    if (lang) {
        location.replace(`${base}/${'?l=' + shorten(lang)}${location.hash}`);
        throw new Error('waiting for page to reload');
    }
};

const initClipboard = () => {
    clipboard = new ClipboardJS('.clipboard');
    clipboard.on('success', () => {
        hideCopyBar(true);
    });
};

const initModals = () => {
    MicroModal.init({
        onClose: () => editor.focus(),
    });
};

const generateShort = async (mode, isShort = false) => {
    const data = editor.getValue();
    compress(data, async (base64, err) => {
        if (err) {
            alert('Failed to compress data: ' + err);
            return;
        }
        let url = buildUrl(base64, mode);
        
        if (isShort) {
            url = await shortenUrl(url);
        }
        
        statsEl.innerHTML = `Data length: ${data.length} |  Link length: ${url.length} | Compression ratio: ${Math.round(
            (100 * url.length) / data.length
        )}%`;

        showCopyBar(url);
        
        // Автоматически копируем в буфер обмена для короткой ссылки
        if (isShort) {
            navigator.clipboard.writeText(url);
        }
    });
};

const generateLink = (mode) => {
    const data = editor.getValue();
    compress(data, (base64, err) => {
        if (err) {
            alert('Failed to compress data: ' + err);
            return;
        }
        const url = buildUrl(base64, mode);
        statsEl.innerHTML = `Data length: ${data.length} |  Link length: ${url.length} | Compression ratio: ${Math.round(
            (100 * url.length) / data.length
        )}%`;

        showCopyBar(url);
    });
};

// Open the "Copy" bar and select the content
const showCopyBar = (dataToCopy) => {
    byId('copy').classList.remove('hidden');
    const linkInput = byId('copy-link');
    linkInput.value = dataToCopy;
    linkInput.focus();
    linkInput.setSelectionRange(0, dataToCopy.length);
};

// Close the "Copy" bar
const hideCopyBar = (success) => {
    const copyButton = byId('copy-btn');
    const copyBar = byId('copy');
    if (!success) {
        copyBar.classList.add('hidden');
        return;
    }
    copyButton.innerText = 'Copied !';
    setTimeout(() => {
        copyBar.classList.add('hidden');
        copyButton.innerText = 'Copy';
    }, 800);
};

const disableLineWrapping = () => {
    byId('disable-line-wrapping').classList.add('hidden');
    byId('enable-line-wrapping').classList.remove('hidden');
    editor.setOption('lineWrapping', false);
};

const enableLineWrapping = () => {
    byId('enable-line-wrapping').classList.add('hidden');
    byId('disable-line-wrapping').classList.remove('hidden');
    editor.setOption('lineWrapping', true);
};

window.beautifyJson = function() {
    const currentValue = editor.getValue().trim();
    if (!currentValue) return;

    // Проверка, является ли JSON уже отформатированным
    function isAlreadyFormatted(str) {
        return /\n\s*"/.test(str) || /\n\s*[{\[]/.test(str);
    }

    function convertPythonToJson(str) {
        return str
            .replace(/:\s*True/g, ': true')
            .replace(/:\s*False/g, ': false')
            .replace(/:\s*None/g, ': null');
    }

    function convertQuotes(str) {
        let inString = false;
        let result = '';
        let prevChar = '';
        
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            
            if (prevChar === '\\') {
                result += char;
                prevChar = char;
                continue;
            }
            
            if (char === "'" && !inString) {
                result += '"';
                inString = true;
            } else if (char === "'" && inString) {
                result += '"';
                inString = false;
            } else {
                result += char;
            }
            
            prevChar = char;
        }
        
        return result;
    }

    function formatJson(jsonStr) {
        // Если JSON уже отформатирован, просто удаляем лишние пустые строки
        if (isAlreadyFormatted(jsonStr)) {
            return jsonStr.replace(/\n\s*\n/g, '\n');
        }

        let indentLevel = 0;
        let result = '';
        let inString = false;
        let prevChar = '';

        // Сначала удаляем все существующие переносы строк и пробелы между токенами
        jsonStr = jsonStr.replace(/\s+/g, ' ').trim();

        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (char === ' ' && !inString) continue;

            if (prevChar === '\\') {
                result += char;
                prevChar = char;
                continue;
            }

            if (char === '"' && prevChar !== '\\') {
                inString = !inString;
            }

            if (!inString) {
                if (char === '{' || char === '[') {
                    indentLevel++;
                    result += char + '\n' + '  '.repeat(indentLevel);
                }
                else if (char === '}' || char === ']') {
                    indentLevel--;
                    result += '\n' + '  '.repeat(indentLevel) + char;
                }
                else if (char === ',') {
                    result += char + '\n' + '  '.repeat(indentLevel);
                }
                else if (char === ':') {
                    result += char + ' ';
                }
                else {
                    result += char;
                }
            } else {
                result += char;
            }

            prevChar = char;
        }

        // Удаляем множественные пустые строки
        return result.replace(/\n\s*\n/g, '\n');
    }

    function tryFixJson(jsonString) {
        let fixed = convertQuotes(convertPythonToJson(jsonString));
        
        const stack = [];
        const openBrackets = {'{': '}', '[': ']', '"': '"'};
        const closeBrackets = {'}': '{', ']': '[', '"': '"'};
        let validUpTo = 0;
        let inString = false;
        let prevChar = '';
        
        for (let i = 0; i < fixed.length; i++) {
            const char = fixed[i];
            
            if (prevChar === '\\') {
                validUpTo = i;
                prevChar = char;
                continue;
            }
            
            if (char === '"') {
                if (!inString) {
                    stack.push(char);
                    inString = true;
                } else {
                    stack.pop();
                    inString = false;
                }
                validUpTo = i;
            } 
            else if (!inString) {
                if (openBrackets[char]) {
                    stack.push(char);
                    validUpTo = i;
                } else if (closeBrackets[char]) {
                    if (stack.length > 0 && stack[stack.length - 1] === closeBrackets[char]) {
                        stack.pop();
                        validUpTo = i;
                    } else {
                        break;
                    }
                } else if (char === ',' || char === ':' || /\s/.test(char)) {
                    validUpTo = i;
                } else if (/[0-9\-.]/.test(char)) {
                    validUpTo = i;
                } else if (/[a-zA-Z]/.test(char)) {
                    validUpTo = i;
                }
            }
            
            prevChar = char;
        }

        fixed = fixed.substring(0, validUpTo + 1);
        
        const tempStack = [...stack];
        while (tempStack.length > 0) {
            const openBracket = tempStack.pop();
            if (openBracket && openBrackets[openBracket]) {
                fixed += openBrackets[openBracket];
            }
        }
        
        return fixed;
    }

    try {
        // Проверяем, является ли JSON уже отформатированным
        if (isAlreadyFormatted(currentValue)) {
            const cleaned = formatJson(currentValue);
            editor.setValue(cleaned);
            statsEl.innerHTML = `Cleaned | Length: ${cleaned.length} | Lines: ${editor['doc'].size}`;
            return;
        }

        const withDoubleQuotes = convertQuotes(convertPythonToJson(currentValue));
        const parsed = JSON.parse(withDoubleQuotes);
        const beautified = formatJson(JSON.stringify(parsed));
        editor.setValue(beautified);
        statsEl.innerHTML = `Beautified | Length: ${beautified.length} | Lines: ${editor['doc'].size}`;
    } catch (e) {
        try {
            const fixed = tryFixJson(currentValue);
            const parsed = JSON.parse(fixed);
            const beautified = formatJson(JSON.stringify(parsed));
            editor.setValue(beautified);
            statsEl.innerHTML = `Fixed and beautified | Length: ${beautified.length} | Lines: ${editor['doc'].size}`;
        } catch (e2) {
            try {
                const fixed = tryFixJson(currentValue);
                const beautified = formatJson(fixed);
                editor.setValue(beautified);
                statsEl.innerHTML = `Partially fixed | Length: ${beautified.length} | Lines: ${editor['doc'].size}`;
            } catch (e3) {
                statsEl.innerHTML = `Error: Could not fix JSON - ${e2.message}`;
                setTimeout(() => {
                    statsEl.innerHTML = `Length: ${currentValue.length} | Lines: ${editor['doc'].size}`;
                }, 3000);
            }
        }
    }
};


const openInNewTab = () => {
    window.open(location.href.replace(/[?&]readonly/, ''));
};

const buildUrl = (rawData, mode) => {
    const base = `${location.protocol}//${location.host}${location.pathname}`;
    const query = shorten('Plain Text') === select.selected() ? '' : `?l=${encodeURIComponent(select.selected())}`;
    const url = base + query + '#' + rawData;
    if (mode === 'markdown') {
        return `[NoPaste snippet](${url})`;
    }
    if (mode === 'iframe') {
        const height = editor['doc'].height + 45;
        return `<iframe width="100%" height="${height}" frameborder="0" src="${url}"></iframe>`;
    }
    return url;
};

// Transform a compressed base64 string into a plain text string
const decompress = (base64, cb) => {
    const progressBar = byId('progress');

    const req = new XMLHttpRequest();
    req.open('GET', 'data:application/octet;base64,' + base64);
    req.responseType = 'arraybuffer';
    req.onload = (e) => {
        lzma.decompress(
            new Uint8Array(e.target.response),
            (result, err) => {
                progressBar.style.width = '0';
                cb(result, err);
            },
            (progress) => {
                progressBar.style.width = 100 * progress + '%';
            }
        );
    };
    req.send();
};

// Transform a plain text string into a compressed base64 string
const compress = (str, cb) => {
    if (str.length === 0) {
        cb('');
        return;
    }
    const progressBar = byId('progress');

    lzma.compress(
        str,
        1,
        (compressed, err) => {
            if (err) {
                progressBar.style.width = '0';
                cb(compressed, err);
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                progressBar.style.width = '0';
                cb(reader.result.substr(reader.result.indexOf(',') + 1));
            };
            reader.readAsDataURL(new Blob([new Uint8Array(compressed)]));
        },
        (progress) => {
            progressBar.style.width = 100 * progress + '%';
        }
    );
};

const slugify = (str) =>
    str
        .trim()
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/\+/g, '-p')
        .replace(/#/g, '-sharp')
        .replace(/[^\w\-]+/g, '');

const shorten = (name) => {
    let n = slugify(name).replace('script', '-s').replace('python', 'py');
    const nov = (s) => s[0] + s.substr(1).replace(/[aeiouy-]/g, '');
    if (n.replace(/-/g, '').length <= 4) {
        return n.replace(/-/g, '');
    }
    if (n.split('-').length >= 2) {
        return n
            .split('-')
            .map((x) => nov(x.substr(0, 2)))
            .join('')
            .substr(0, 4);
    }
    n = nov(n);
    if (n.length <= 4) {
        return n;
    }
    return n.substr(0, 2) + n.substr(n.length - 2, 2);
};

const byId = (id) => document.getElementById(id);

// Legacy code, only for retro-compatibility
const hash = function (str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const h = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return h.toString(36).substr(0, 4).toUpperCase();
};

// Only for tests purposes
const testAllModes = () => {
    for (const [index, language] of Object.entries(CodeMirror.modeInfo)) {
        CodeMirror.autoLoadMode(editor, language.mode);
        setTimeout(() => {
            console.info(language.name);
            select.set(shorten(language.name));
        }, 1000 * index);
    }
};

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

init(); 