/**
 * Pure code-block scanner. Indexes are UTF-16 offsets into `text`.
 * Spans are a view — not document data. No DOM.
 */

export type CodeRole =
    | "kw-flow"
    | "kw-decl"
    | "modifier"
    | "type"
    | "function"
    | "property"
    | "string"
    | "interpolation"
    | "escape"
    | "number"
    | "constant"
    | "comment"
    | "directive"
    | "tag"
    | "attribute"
    | "regex"

export interface CodeSpan {
    from: number
    to: number
    role: CodeRole
    /** Set only for doc comments: "bold". Omit the role default. */
    emphasis?: "bold" | "italic"
}

const MAX_UNITS = 32_000
const MAX_LINES = 400
/** Nested template / f-string holes. Past this, holes stay inside the string. */
const MAX_NEST = 32

const ALIAS: Record<string, string> = {
    typescript: "ts",
    javascript: "js",
    python: "py",
    kotlin: "kt",
    yml: "yaml",
}

const TYPE_INTRO = new Set(["class", "struct", "enum", "interface", "trait", "type", "extends", "implements", "new"])
const FN_WORDS = new Set(["function", "def", "fun", "fn"])
const EXTENDS_WORDS = new Set(["extends", "implements"])
const GLOBAL_CONST = new Set(["true", "false", "null", "undefined", "NaN", "Infinity", "True", "False", "None"])
const SQL_WORDS = new Set([
    "select",
    "from",
    "where",
    "insert",
    "into",
    "update",
    "set",
    "delete",
    "join",
    "on",
    "and",
    "or",
    "with",
    "values",
    "as",
    "group",
    "order",
    "by",
    "limit",
])
const SQL_START = new Set(["select", "insert", "update", "delete", "with"])
const RUST_SUFFIXES = [
    "i128",
    "u128",
    "isize",
    "usize",
    "i64",
    "i32",
    "i16",
    "i8",
    "u64",
    "u32",
    "u16",
    "u8",
    "f64",
    "f32",
]
const AT_LANG = new Set(["js", "ts", "java", "kt", "py", "php", "c"])
const KNOWN = new Set([
    "js",
    "ts",
    "py",
    "java",
    "kt",
    "rust",
    "c",
    "php",
    "ruby",
    "perl",
    "sql",
    "json",
    "yaml",
    "html",
    "xml",
])

interface KwTable {
    flow: Set<string>
    decl: Set<string>
    modifier: Set<string>
    constant: Set<string>
}

const EMPTY: Set<string> = new Set()

const JS_KW: KwTable = {
    flow: new Set([
        "if",
        "else",
        "for",
        "while",
        "do",
        "switch",
        "case",
        "default",
        "break",
        "continue",
        "return",
        "throw",
        "try",
        "catch",
        "finally",
        "yield",
        "await",
        "in",
        "of",
        "instanceof",
        "typeof",
        "new",
        "extends",
        "implements",
    ]),
    decl: new Set([
        "function",
        "class",
        "let",
        "const",
        "var",
        "interface",
        "type",
        "enum",
        "namespace",
        "declare",
        "module",
        "export",
        "import",
        "from",
        "void",
    ]),
    modifier: new Set([
        "public",
        "private",
        "protected",
        "static",
        "readonly",
        "async",
        "override",
        "abstract",
        "get",
        "set",
    ]),
    constant: new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]),
}

const TABLES: Record<string, KwTable> = {
    js: JS_KW,
    ts: JS_KW,
    py: {
        flow: new Set([
            "if",
            "elif",
            "else",
            "for",
            "while",
            "return",
            "break",
            "continue",
            "raise",
            "try",
            "except",
            "finally",
            "with",
            "yield",
            "assert",
            "pass",
            "in",
            "not",
            "and",
            "or",
            "is",
            "lambda",
            "match",
            "case",
        ]),
        decl: new Set(["def", "class", "global", "nonlocal"]),
        modifier: new Set(["async"]),
        constant: new Set(["True", "False", "None"]),
    },
    java: {
        flow: new Set([
            "if",
            "else",
            "for",
            "while",
            "do",
            "switch",
            "case",
            "default",
            "break",
            "continue",
            "return",
            "throw",
            "try",
            "catch",
            "finally",
            "new",
            "instanceof",
            "extends",
            "implements",
        ]),
        decl: new Set(["class", "interface", "enum", "void", "record"]),
        modifier: new Set([
            "public",
            "private",
            "protected",
            "static",
            "final",
            "abstract",
            "synchronized",
            "transient",
            "volatile",
            "native",
        ]),
        constant: new Set(["true", "false", "null"]),
    },
    kt: {
        flow: new Set([
            "if",
            "else",
            "for",
            "while",
            "do",
            "when",
            "return",
            "break",
            "continue",
            "throw",
            "try",
            "catch",
            "finally",
        ]),
        decl: new Set(["fun", "class", "object", "interface", "val", "var", "typealias"]),
        modifier: new Set([
            "public",
            "private",
            "protected",
            "internal",
            "suspend",
            "inline",
            "open",
            "override",
            "abstract",
            "data",
            "sealed",
        ]),
        constant: new Set(["true", "false", "null"]),
    },
    rust: {
        flow: new Set(["if", "else", "match", "for", "while", "loop", "return", "break", "continue", "where"]),
        decl: new Set(["fn", "let", "struct", "enum", "trait", "type", "impl", "mod", "use"]),
        modifier: new Set(["pub", "mut", "async", "unsafe", "const", "static", "dyn", "ref"]),
        constant: new Set(["true", "false"]),
    },
    c: {
        flow: new Set([
            "if",
            "else",
            "for",
            "while",
            "do",
            "switch",
            "case",
            "default",
            "break",
            "continue",
            "return",
            "goto",
            "sizeof",
        ]),
        decl: new Set(["struct", "enum", "typedef", "void"]),
        modifier: new Set(["const", "static", "extern", "volatile", "register", "inline"]),
        constant: EMPTY,
    },
    php: {
        flow: new Set([
            "if",
            "else",
            "elseif",
            "for",
            "foreach",
            "while",
            "do",
            "switch",
            "case",
            "default",
            "break",
            "continue",
            "return",
            "throw",
            "try",
            "catch",
            "finally",
            "echo",
            "as",
        ]),
        decl: new Set(["function", "class", "interface", "trait", "const"]),
        modifier: new Set(["public", "private", "protected", "static", "final", "abstract"]),
        constant: new Set(["true", "false", "null"]),
    },
    ruby: {
        flow: new Set([
            "if",
            "elsif",
            "else",
            "unless",
            "while",
            "until",
            "for",
            "return",
            "break",
            "next",
            "yield",
            "case",
            "when",
            "begin",
            "rescue",
            "ensure",
        ]),
        decl: new Set(["def", "class", "module"]),
        modifier: EMPTY,
        constant: new Set(["true", "false", "nil"]),
    },
}

type QuoteKind = "none" | "template" | "ruby" | "fstring"

interface ScanState {
    expectType: boolean
    /** A type name was painted, so `.` continues the type (`Foo.Bar`). */
    sawType: boolean
    expectFn: boolean
    angle: number
    pendingGeneric: boolean
    yamlValue: boolean
    brace: number
}

export function highlightCode(text: string, language?: string): CodeSpan[] {
    if (text.length > MAX_UNITS || text.split("\n").length > MAX_LINES) return []
    let lang = normalizeLang(language)
    let spans: CodeSpan[] = []
    scanCode(text, 0, text.length, lang, spans, false, false)
    return mergeSpans(spans)
}

function normalizeLang(language?: string): string {
    if (!language) return ""
    let id = language.toLowerCase()
    return ALIAS[id] ?? id
}

function isUnknown(lang: string): boolean {
    return !KNOWN.has(lang)
}

function isCode(lang: string): boolean {
    return (
        lang === "js" ||
        lang === "ts" ||
        lang === "py" ||
        lang === "java" ||
        lang === "kt" ||
        lang === "rust" ||
        lang === "c" ||
        lang === "php" ||
        lang === "ruby" ||
        lang === "perl"
    )
}

function slashComment(lang: string): boolean {
    return (
        lang === "js" ||
        lang === "ts" ||
        lang === "java" ||
        lang === "kt" ||
        lang === "rust" ||
        lang === "c" ||
        lang === "php" ||
        isUnknown(lang)
    )
}

function hashComment(lang: string): boolean {
    return lang === "py" || lang === "ruby" || lang === "perl" || lang === "yaml" || lang === "php" || isUnknown(lang)
}

function blockComment(lang: string): boolean {
    return lang !== "json" && lang !== "html" && lang !== "xml" && lang !== "yaml"
}

function colonType(lang: string): boolean {
    return (
        lang === "js" ||
        lang === "ts" ||
        lang === "java" ||
        lang === "kt" ||
        lang === "rust" ||
        lang === "c" ||
        lang === "py" ||
        lang === "php"
    )
}

function keywordOf(lang: string, word: string): CodeRole | null {
    let table = TABLES[lang]
    if (!table) return null
    if (table.flow.has(word)) return "kw-flow"
    if (table.decl.has(word)) return "kw-decl"
    if (table.modifier.has(word)) return "modifier"
    if (table.constant.has(word)) return "constant"
    return null
}

function isConstWord(lang: string, word: string): boolean {
    if (GLOBAL_CONST.has(word)) return true
    let table = TABLES[lang]
    return !!table && table.constant.has(word)
}

function isSpace(ch: string | undefined): boolean {
    return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v"
}

function isDigitChar(ch: string | undefined): boolean {
    if (!ch) return false
    let c = ch.charCodeAt(0)
    return c >= 48 && c <= 57
}

function isHex(ch: string | undefined): boolean {
    if (!ch) return false
    let c = ch.charCodeAt(0)
    return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)
}

function isDigitBase(ch: string | undefined, base: number): boolean {
    if (!ch) return false
    let c = ch.charCodeAt(0)
    if (c >= 48 && c <= 57) return c - 48 < base
    if (base === 16 && ((c >= 65 && c <= 70) || (c >= 97 && c <= 102))) return true
    return false
}

function isIdentStart(ch: string | undefined): boolean {
    if (!ch) return false
    if (ch === "_" || ch === "$") return true
    let c = ch.charCodeAt(0)
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return true
    return c > 127 && !isSpace(ch)
}

function isIdentCont(ch: string | undefined): boolean {
    if (!ch) return false
    return isDigitChar(ch) || isIdentStart(ch)
}

function isTagNameStart(ch: string | undefined): boolean {
    if (!ch) return false
    let c = ch.charCodeAt(0)
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
}

function isTagNameCont(ch: string | undefined): boolean {
    if (!ch) return false
    return isTagNameStart(ch) || isDigitChar(ch) || ch === "-" || ch === ":" || ch === "_"
}

function identEnd(text: string, i: number, limit: number): number {
    if (!isIdentStart(text[i])) return i
    let j = i + 1
    while (j < limit && isIdentCont(text[j])) j++
    return j
}

function skipWs(text: string, i: number, limit: number): number {
    while (i < limit && isSpace(text[i])) i++
    return i
}

function lineEnd(text: string, i: number, limit: number): number {
    let j = i
    while (j < limit && text[j] !== "\n" && text[j] !== "\r") j++
    return j
}

function prevNonSpace(text: string, i: number): string {
    let j = i - 1
    while (j >= 0 && isSpace(text[j])) j--
    return j >= 0 ? text[j] : ""
}

function nextWordIs(text: string, i: number, limit: number, words: Set<string>): boolean {
    let k = skipWs(text, i, limit)
    if (!isIdentStart(text[k])) return false
    let end = identEnd(text, k, limit)
    return words.has(text.slice(k, end))
}

function push(spans: CodeSpan[], from: number, to: number, role: CodeRole, emphasis?: "bold" | "italic") {
    if (to <= from) return
    let span: CodeSpan = {from, to, role}
    if (emphasis) span.emphasis = emphasis
    spans.push(span)
}

function mergeSpans(spans: CodeSpan[]): CodeSpan[] {
    let out: CodeSpan[] = []
    for (let span of spans) {
        let prev = out.length > 0 ? out[out.length - 1] : undefined
        if (prev && prev.to === span.from && prev.role === span.role && prev.emphasis === span.emphasis)
            prev.to = span.to
        else out.push(span)
    }
    return out
}

function escapeLength(text: string, i: number, limit: number): number {
    if (text[i] !== "\\" || i + 1 >= limit) return 0
    let n = text[i + 1]
    if (n === "n" || n === "t" || n === "\\" || n === '"' || n === "'") return 2
    if (n === "u" && text[i + 2] === "{") {
        let j = i + 3
        if (!isHex(text[j])) return 0
        while (j < limit && isHex(text[j])) j++
        if (text[j] === "}") return j + 1 - i
        return 0
    }
    if (n === "u" && isHex(text[i + 2]) && isHex(text[i + 3]) && isHex(text[i + 4]) && isHex(text[i + 5])) return 6
    return 0
}

function rustSuffixEnd(text: string, i: number, limit: number): number {
    for (let suf of RUST_SUFFIXES) {
        if (i + suf.length > limit || !text.startsWith(suf, i)) continue
        if (!isIdentCont(text[i + suf.length])) return i + suf.length
    }
    return i
}

function scanNumber(text: string, i: number, limit: number, spans: CodeSpan[], lang: string): number {
    let sig = text[i + 1]
    if (text[i] === "0" && (sig === "x" || sig === "X" || sig === "b" || sig === "B")) {
        let base = sig === "b" || sig === "B" ? 2 : 16
        let j = i + 2
        if (isDigitBase(text[j], base)) {
            while (j < limit && (isDigitBase(text[j], base) || text[j] === "_")) j++
            push(spans, i, i + 2, "modifier")
            push(spans, i + 2, j, "number")
            if (lang === "rust") {
                let s = rustSuffixEnd(text, j, limit)
                if (s > j) push(spans, j, s, "type")
                return s
            }
            return j
        }
    }
    let j = i
    while (j < limit && (isDigitChar(text[j]) || (text[j] === "_" && j > i))) j++
    if (text[j] === "." && isDigitChar(text[j + 1])) {
        j++
        while (j < limit && (isDigitChar(text[j]) || text[j] === "_")) j++
    }
    if (j === i) return i
    push(spans, i, j, "number")
    if (lang === "rust") {
        let s = rustSuffixEnd(text, j, limit)
        if (s > j) push(spans, j, s, "type")
        return s
    }
    return j
}

function prefixLen(text: string, i: number, limit: number, lang: string): number {
    if (lang !== "py" && lang !== "rust") return 0
    if (i > 0 && isIdentCont(text[i - 1])) return 0
    let two = (text[i] ?? "").toLowerCase() + (text[i + 1] ?? "").toLowerCase()
    if ((two === "fr" || two === "rf" || two === "rb" || two === "br") && i + 2 < limit) {
        let q = text[i + 2]
        if (q === '"' || q === "'") return 2
    }
    let one = (text[i] ?? "").toLowerCase()
    if ((one === "f" || one === "r" || one === "b") && i + 1 < limit) {
        let q = text[i + 1]
        if (q === '"' || q === "'") return 1
    }
    return 0
}

function prefixHasF(text: string, i: number, len: number): boolean {
    let p = text.slice(i, i + len).toLowerCase()
    for (let n = 0; n < p.length; n++) if (p[n] === "f") return true
    return false
}

function isTriple(text: string, i: number): boolean {
    return text.startsWith('"""', i) || text.startsWith("'''", i)
}

function findPlainClose(text: string, i: number, limit: number, quote: string): number {
    while (i < limit) {
        if (text[i] === "\\") {
            i += 2
            continue
        }
        if (text[i] === quote) return i
        i++
    }
    return -1
}

function startsWithSql(body: string): boolean {
    let i = 0
    while (i < body.length && isSpace(body[i])) i++
    if (!isIdentStart(body[i])) return false
    let j = identEnd(body, i, body.length)
    return SQL_START.has(body.slice(i, j).toLowerCase())
}

function wantsKey(lang: string, text: string, from: number): boolean {
    if (lang === "json" || lang === "yaml") return true
    if (
        lang !== "js" &&
        lang !== "ts" &&
        lang !== "java" &&
        lang !== "kt" &&
        lang !== "py" &&
        lang !== "php" &&
        lang !== "c" &&
        lang !== "rust" &&
        lang !== "ruby"
    )
        return false
    let prev = prevNonSpace(text, from)
    return prev === "{" || prev === ","
}

function maybeKey(
    text: string,
    limit: number,
    spans: CodeSpan[],
    mark: number,
    from: number,
    to: number,
    lang: string,
) {
    let k = skipWs(text, to, limit)
    if (text[k] !== ":") return
    if (!wantsKey(lang, text, from)) return
    for (let n = mark; n < spans.length; n++) {
        if (spans[n].role !== "string" && spans[n].role !== "escape") return
    }
    for (let n = mark; n < spans.length; n++) {
        if (spans[n].role === "string") spans[n].role = "property"
    }
}

function scanSql(text: string, from: number, to: number, spans: CodeSpan[]) {
    let i = from
    while (i < to) {
        let ch = text[i]
        if (isSpace(ch)) {
            i++
            continue
        }
        if (ch === "'" || ch === '"') {
            i = scanQuoted(text, i, to, "sql", spans, "none", false)
            continue
        }
        if (ch === "\\") {
            let n = escapeLength(text, i, to)
            if (n > 0) {
                push(spans, i, i + n, "escape")
                i += n
                continue
            }
            i += i + 1 < to ? 2 : 1
            continue
        }
        if (isDigitChar(ch)) {
            let next = scanNumber(text, i, to, spans, "sql")
            i = next > i ? next : i + 1
            continue
        }
        if (isIdentStart(ch)) {
            let j = identEnd(text, i, to)
            let word = text.slice(i, j)
            if (SQL_WORDS.has(word.toLowerCase())) push(spans, i, j, "kw-flow")
            else if (word === "_" || isConstWord("sql", word)) push(spans, i, j, "constant")
            i = j
            continue
        }
        i++
    }
}

function scanQuoted(
    text: string,
    start: number,
    limit: number,
    lang: string,
    spans: CodeSpan[],
    kind: QuoteKind,
    stopPhp: boolean,
    depth = 0,
): number {
    if (start >= limit) return start
    let quote = text[start]
    if (lang === "py" && kind !== "fstring") {
        let close = findPlainClose(text, start + 1, limit, quote)
        let after = close >= 0 ? skipWs(text, close + 1, limit) : 0
        if (close >= 0 && text[after] !== ":" && startsWithSql(text.slice(start + 1, close))) {
            push(spans, start, start + 1, "string")
            scanSql(text, start + 1, close, spans)
            push(spans, close, close + 1, "string")
            return close + 1
        }
    }
    let mark = spans.length
    let chunk = start
    let i = start + 1
    while (i < limit) {
        if (kind === "template" && text.startsWith("${", i)) {
            if (depth >= MAX_NEST) {
                i += 2
                continue
            }
            push(spans, chunk, i + 2, "string")
            i = scanCode(text, i + 2, limit, lang, spans, true, stopPhp, depth + 1)
            if (stopPhp && text.startsWith("?>", i)) return i
            chunk = i
            continue
        }
        if (kind === "ruby" && text.startsWith("#{", i)) {
            if (depth >= MAX_NEST) {
                i += 2
                continue
            }
            push(spans, chunk, i + 2, "string")
            i = scanCode(text, i + 2, limit, lang, spans, true, stopPhp, depth + 1)
            chunk = i
            continue
        }
        if (kind === "fstring" && text[i] === "{") {
            if (text[i + 1] === "{") {
                i += 2
                continue
            }
            if (depth >= MAX_NEST) {
                i++
                continue
            }
            push(spans, chunk, i + 1, "string")
            i = scanCode(text, i + 1, limit, lang, spans, true, stopPhp, depth + 1)
            chunk = i
            continue
        }
        if (text[i] === "\\") {
            let n = escapeLength(text, i, limit)
            if (n > 0) {
                if (chunk < i) push(spans, chunk, i, "string")
                push(spans, i, i + n, "escape")
                i += n
                chunk = i
                continue
            }
            i += i + 1 < limit ? 2 : 1
            continue
        }
        if (text[i] === quote) {
            i++
            push(spans, chunk, i, "string")
            maybeKey(text, limit, spans, mark, start, i, lang)
            return i
        }
        i++
    }
    if (chunk < limit) push(spans, chunk, limit, "string")
    return limit
}

function regexEnd(text: string, slash: number, limit: number): number {
    let i = slash + 1
    while (i < limit) {
        let ch = text[i]
        if (ch === "\n" || ch === "\r") return -1
        if (ch === "\\") {
            if (i + 1 >= limit || text[i + 1] === "\n" || text[i + 1] === "\r") return -1
            i += 2
            continue
        }
        if (ch === "/") {
            i++
            while (i < limit && isIdentCont(text[i])) i++
            return i
        }
        i++
    }
    return -1
}

function regexBlocked(text: string, i: number): boolean {
    let prev = prevNonSpace(text, i)
    if (!prev) return false
    if (prev === ")" || prev === "]") return true
    return isIdentCont(prev)
}

function blockCommentEnd(text: string, i: number, limit: number): {to: number; bold: boolean} {
    let bold = text.startsWith("/**", i)
    let j = i + 2
    while (j + 1 < limit) {
        if (text[j] === "*" && text[j + 1] === "/") return {to: j + 2, bold}
        j++
    }
    return {to: limit, bold}
}

function rustAttrEnd(text: string, i: number, limit: number): number {
    if (text[i] !== "#") return -1
    let j = i + 1
    if (text[j] === "!") j++
    if (text[j] !== "[") return -1
    let depth = 0
    while (j < limit) {
        if (text[j] === "[") depth++
        else if (text[j] === "]") {
            depth--
            if (depth === 0) return j + 1
        }
        j++
    }
    return limit
}

function atDirectiveEnd(text: string, i: number, limit: number): number {
    if (text[i] !== "@") return -1
    let prev = i === 0 ? "" : text[i - 1]
    if (!(i === 0 || isSpace(prev) || prev === "(")) return -1
    if (!isIdentStart(text[i + 1])) return -1
    return identEnd(text, i + 1, limit)
}

function phpOpenLength(text: string, i: number, limit: number): number {
    if (i + 3 <= limit && text.startsWith("<?=", i)) return 3
    if (i + 5 <= limit && text.slice(i, i + 5).toLowerCase() === "<?php") {
        if (!isIdentCont(text[i + 5])) return 5
    }
    return 0
}

function yamlScalarEnd(text: string, i: number, limit: number): number {
    let j = i
    while (j < limit && text[j] !== "\n" && text[j] !== "\r") {
        if (text[j] === "#" && (j === i || isSpace(text[j - 1]))) break
        if (text[j] === "}" || text[j] === "]" || text[j] === ",") break
        j++
    }
    while (j > i && isSpace(text[j - 1])) j--
    return j
}

function scanTag(text: string, i: number, limit: number, lang: string, spans: CodeSpan[]): number {
    if (text[i] !== "<") return -1
    let j = i + 1
    let closing = false
    if (text[j] === "/") {
        closing = true
        j++
    }
    if (!isTagNameStart(text[j])) return -1
    while (j < limit && isTagNameCont(text[j])) j++
    if (closing) {
        let k = skipWs(text, j, limit)
        if (text[k] !== ">") return -1
        push(spans, i, k + 1, "tag")
        return k + 1
    }
    push(spans, i, j, "tag")
    while (j < limit) {
        j = skipWs(text, j, limit)
        if (j >= limit) return j
        if (text[j] === ">") {
            push(spans, j, j + 1, "tag")
            return j + 1
        }
        if (text[j] === "/" && text[j + 1] === ">") {
            push(spans, j, j + 2, "tag")
            return j + 2
        }
        if (!isTagNameStart(text[j])) {
            j++
            continue
        }
        let a = j + 1
        while (a < limit && isTagNameCont(text[a])) a++
        push(spans, j, a, "attribute")
        j = skipWs(text, a, limit)
        if (text[j] === "=") {
            j = skipWs(text, j + 1, limit)
            if (text[j] === '"' || text[j] === "'") j = scanQuoted(text, j, limit, lang, spans, "none", false)
            else while (j < limit && !isSpace(text[j]) && text[j] !== ">" && text[j] !== "/") j++
        }
    }
    return j
}

function scanIdent(
    text: string,
    i: number,
    limit: number,
    lang: string,
    spans: CodeSpan[],
    state: ScanState,
    hole: boolean,
): number {
    let j = identEnd(text, i, limit)
    let word = text.slice(i, j)
    if (lang === "json") {
        if (word === "_" || isConstWord(lang, word)) push(spans, i, j, "constant")
        state.expectFn = false
        if (state.angle === 0) state.expectType = false
        return j
    }
    if (lang === "sql") {
        if (SQL_WORDS.has(word.toLowerCase())) push(spans, i, j, "kw-flow")
        else if (word === "_" || isConstWord(lang, word)) push(spans, i, j, "constant")
        state.expectFn = false
        if (state.angle === 0) state.expectType = false
        return j
    }
    if (lang === "yaml") {
        let k = skipWs(text, j, limit)
        if (text[k] === ":") push(spans, i, j, "property")
        else if (word === "_" || isConstWord(lang, word)) push(spans, i, j, "constant")
        state.expectFn = false
        if (state.angle === 0) state.expectType = false
        return j
    }
    if (!isCode(lang)) {
        state.expectFn = false
        if (state.angle === 0) state.expectType = false
        return j
    }

    let afterDot = i > 0 && text[i - 1] === "."
    let call = text[j] === "("
    let kw = keywordOf(lang, word)
    let role: CodeRole | null = null
    if (afterDot && (kw != null || word === "_" || isConstWord(lang, word))) role = "property"
    else if (kw) role = kw
    else if (word === "_" || isConstWord(lang, word)) role = "constant"
    else if (state.expectFn) role = "function"
    else if (afterDot && state.expectType) role = "type"
    else if (state.expectType || state.angle > 0 || text[j] === "<" || nextWordIs(text, j, limit, EXTENDS_WORDS))
        role = "type"
    else if (call && state.angle === 0) role = "function"
    else if (afterDot) role = "property"
    else if (hole) role = "interpolation"

    if (role) push(spans, i, j, role)

    let keepType = false
    if (role === kw && kw && TYPE_INTRO.has(word)) {
        state.expectType = true
        state.sawType = false
        keepType = true
    } else if (role == null && TYPE_INTRO.has(word)) {
        state.expectType = true
        state.sawType = false
        keepType = true
    }
    if (role === "type" && (text[j] === "<" || text[j] === ".")) {
        state.expectType = true
        state.sawType = text[j] === "."
        keepType = true
        if (text[j] === "<") state.pendingGeneric = true
        else state.pendingGeneric = false
    } else state.pendingGeneric = false
    if (!keepType && state.angle === 0) state.expectType = false

    state.expectFn = false
    if (role === kw && kw && FN_WORDS.has(word)) state.expectFn = true
    else if (role == null && FN_WORDS.has(word)) state.expectFn = true
    return j
}

function freshState(): ScanState {
    return {
        expectType: false,
        sawType: false,
        expectFn: false,
        angle: 0,
        pendingGeneric: false,
        yamlValue: false,
        brace: 0,
    }
}

/** A value token is not part of a type or a function name. Generics stay open. */
function clearValueFlags(state: ScanState) {
    if (state.angle !== 0) return
    state.expectType = false
    state.sawType = false
    state.expectFn = false
}

function scanCode(
    text: string,
    start: number,
    limit: number,
    lang: string,
    spans: CodeSpan[],
    hole: boolean,
    stopPhp: boolean,
    depth = 0,
): number {
    if (depth > MAX_NEST) return start
    let i = start
    let state = freshState()
    while (i < limit) {
        while (i < limit && isSpace(text[i])) {
            if (text[i] === "\n" || text[i] === "\r") state.yamlValue = false
            i++
        }
        if (i >= limit) break
        if (text.startsWith("?>", i) && (stopPhp || lang === "php" || lang === "html" || lang === "xml")) {
            if (stopPhp) return i
            push(spans, i, i + 2, "directive")
            i += 2
            continue
        }

        if (lang === "html" || lang === "xml") {
            if (text.startsWith("<!--", i)) {
                let end = text.indexOf("-->", i + 4)
                let to = end < 0 || end >= limit ? limit : end + 3
                push(spans, i, to, "comment")
                i = to
                continue
            }
            let open = phpOpenLength(text, i, limit)
            if (open > 0) {
                push(spans, i, i + open, "directive")
                let inner = scanCode(text, i + open, limit, "php", spans, false, true, depth)
                if (text.startsWith("?>", inner)) {
                    push(spans, inner, inner + 2, "directive")
                    i = inner + 2
                } else i = inner
                continue
            }
            if (text[i] === "<") {
                let next = scanTag(text, i, limit, lang, spans)
                if (next > i) {
                    i = next
                    continue
                }
            }
            i++
            continue
        }

        if (text.startsWith("//", i) && slashComment(lang)) {
            state.yamlValue = false
            let to = lineEnd(text, i, limit)
            push(spans, i, to, "comment")
            i = to
            continue
        }
        if (text.startsWith("/*", i) && blockComment(lang)) {
            state.yamlValue = false
            let found = blockCommentEnd(text, i, limit)
            push(spans, i, found.to, "comment", found.bold ? "bold" : undefined)
            i = found.to
            continue
        }
        if (lang === "rust" && text[i] === "#") {
            let end = rustAttrEnd(text, i, limit)
            if (end > i) {
                push(spans, i, end, "directive")
                i = end
                continue
            }
        }
        if (text[i] === "#" && hashComment(lang)) {
            state.yamlValue = false
            let to = lineEnd(text, i, limit)
            push(spans, i, to, "comment")
            i = to
            continue
        }
        if (lang === "php") {
            let open = phpOpenLength(text, i, limit)
            if (open > 0) {
                push(spans, i, i + open, "directive")
                i += open
                continue
            }
        }

        if (state.yamlValue && isIdentStart(text[i])) {
            state.yamlValue = false
            let j = identEnd(text, i, limit)
            let word = text.slice(i, j)
            if (word === "_" || isConstWord(lang, word)) {
                push(spans, i, j, "constant")
                i = j
                continue
            }
            let end = yamlScalarEnd(text, i, limit)
            push(spans, i, end, "string")
            clearValueFlags(state)
            i = end
            continue
        }
        if (state.yamlValue) state.yamlValue = false

        if (lang === "rust" && text[i] === "'") {
            let n = text[i + 1]
            if (n === "\\") {
                let el = escapeLength(text, i + 1, limit)
                if (el > 0 && text[i + 1 + el] === "'") {
                    push(spans, i, i + 1, "string")
                    push(spans, i + 1, i + 1 + el, "escape")
                    push(spans, i + 1 + el, i + 2 + el, "string")
                    clearValueFlags(state)
                    i = i + 2 + el
                    continue
                }
            } else if (n && n !== "'" && n !== "\n" && n !== "\r" && text[i + 2] === "'") {
                push(spans, i, i + 3, "string")
                clearValueFlags(state)
                i += 3
                continue
            }
            if (isIdentStart(n)) {
                let j = identEnd(text, i + 1, limit)
                push(spans, i, j, "modifier")
                i = j
                continue
            }
            i++
            continue
        }

        let plen = prefixLen(text, i, limit, lang)
        if (plen > 0) {
            let qAt = i + plen
            if (lang === "py" && isTriple(text, qAt)) {
                push(spans, i, qAt, "modifier")
                i = qAt
                continue
            }
            let kind: QuoteKind = lang === "py" && prefixHasF(text, i, plen) ? "fstring" : "none"
            push(spans, i, qAt, "modifier")
            i = scanQuoted(text, qAt, limit, lang, spans, kind, stopPhp, depth)
            clearValueFlags(state)
            continue
        }
        if (lang === "py" && isTriple(text, i)) {
            let q = text[i]
            let closer = q + q + q
            let end = text.indexOf(closer, i + 3)
            let to = end < 0 || end >= limit ? limit : end + 3
            push(spans, i, to, "comment", "bold")
            i = to
            continue
        }
        if (text[i] === '"') {
            let kind: QuoteKind = lang === "ruby" ? "ruby" : "none"
            i = scanQuoted(text, i, limit, lang, spans, kind, stopPhp, depth)
            clearValueFlags(state)
            continue
        }
        if (text[i] === "'" && lang !== "json") {
            i = scanQuoted(text, i, limit, lang, spans, "none", stopPhp, depth)
            clearValueFlags(state)
            continue
        }
        if (text[i] === "`" && (lang === "js" || lang === "ts")) {
            i = scanQuoted(text, i, limit, lang, spans, "template", stopPhp, depth)
            clearValueFlags(state)
            continue
        }
        if ((lang === "js" || lang === "ts") && text[i] === "/" && !regexBlocked(text, i)) {
            let end = regexEnd(text, i, limit)
            if (end > i) {
                push(spans, i, end, "regex")
                clearValueFlags(state)
                i = end
                continue
            }
        }
        if (lang === "perl" && text[i] === "m" && text[i + 1] === "/" && !isIdentCont(i > 0 ? text[i - 1] : "")) {
            let end = regexEnd(text, i + 1, limit)
            if (end > i) {
                push(spans, i, end, "regex")
                clearValueFlags(state)
                i = end
                continue
            }
        }
        if (isDigitChar(text[i])) {
            let next = scanNumber(text, i, limit, spans, lang)
            clearValueFlags(state)
            i = next > i ? next : i + 1
            continue
        }
        if (lang === "php" && text[i] === "$" && isIdentStart(text[i + 1])) {
            let j = identEnd(text, i + 1, limit)
            push(spans, i, j, "property")
            state.expectFn = false
            if (state.angle === 0) state.expectType = false
            state.pendingGeneric = false
            i = j
            continue
        }
        if (AT_LANG.has(lang)) {
            let end = atDirectiveEnd(text, i, limit)
            if (end > i) {
                push(spans, i, end, "directive")
                state.expectFn = false
                if (state.angle === 0) state.expectType = false
                i = end
                continue
            }
        }
        if (isIdentStart(text[i])) {
            i = scanIdent(text, i, limit, lang, spans, state, hole)
            continue
        }
        if (text[i] === "{" && hole) {
            state.brace++
            state.expectFn = false
            if (state.angle === 0) state.expectType = false
            state.pendingGeneric = false
            i++
            continue
        }
        if (text[i] === "}" && hole) {
            if (state.brace === 0) return i
            state.brace--
            i++
            continue
        }
        if (text[i] === "<" && (state.pendingGeneric || state.angle > 0)) {
            state.angle++
            state.pendingGeneric = false
            i++
            continue
        }
        if (text[i] === ">" && state.angle > 0) {
            state.angle--
            if (state.angle === 0) state.expectType = false
            state.pendingGeneric = false
            i++
            continue
        }
        if (text[i] === ":") {
            if (lang === "yaml") {
                state.yamlValue = true
                state.expectFn = false
                i++
                continue
            }
            if (colonType(lang)) {
                state.expectType = true
                state.sawType = false
                state.expectFn = false
                state.pendingGeneric = false
                i++
                continue
            }
        }
        if (text[i] === "." && state.expectType && state.sawType) {
            state.expectFn = false
            state.pendingGeneric = false
            i++
            continue
        }
        if (
            (text[i] === "&" || text[i] === "*") &&
            state.expectType &&
            state.angle === 0
        ) {
            let prev = prevNonSpace(text, i)
            if (prev === ":" || prev === "&" || prev === "*" || prev === "(" || prev === "," || prev === "<") {
                i++
                continue
            }
        }
        state.expectFn = false
        if (state.angle === 0) {
            state.expectType = false
            state.sawType = false
        }
        state.pendingGeneric = false
        i++
    }
    return i
}
