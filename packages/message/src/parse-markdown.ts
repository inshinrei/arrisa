/**
 * Parse messenger-style markdown into {@link FormattedText}.
 * Used for paste and bulk conversion (not live typing — see markdown input rules).
 */
import type {FormattedText, MessageEntity} from "./entities"

type PartialEntity = Omit<MessageEntity, "offset" | "length">

/**
 * Convert markdown plain text to text + entities.
 * Supports: `**bold**`, `__italic__`, `~~strike~~`, `||spoiler||`, `` `code` ``,
 * `[label](url)`, fenced code blocks, and line-leading `> ` quotes.
 */
export function parseMarkdownText(source: string): FormattedText {
    if (!source) return {text: ""}
    return parseMarkdownPipeline(source.replace(/\r\n?/g, "\n"))
}

function parseMarkdownPipeline(source: string): FormattedText {
    type Seg =
        | {kind: "text"; value: string}
        | {kind: "pre"; value: string; language?: string}
        | {kind: "quote"; value: string}

    let segs: Seg[] = []
    {
        let last = 0
        let re = /^```([^\n`]*)\n([\s\S]*?)```/gm
        let m: RegExpExecArray | null
        let text = source
        while ((m = re.exec(text))) {
            if (m.index > last) segs.push({kind: "text", value: text.slice(last, m.index)})
            let lang = (m[1] || "").trim()
            let body = (m[2] || "").replace(/\n$/, "")
            segs.push(lang ? {kind: "pre", value: body, language: lang} : {kind: "pre", value: body})
            last = m.index + m[0].length
        }
        if (last < text.length) segs.push({kind: "text", value: text.slice(last)})
        if (!segs.length) segs.push({kind: "text", value: text})
    }

    let expanded: Seg[] = []
    for (let seg of segs) {
        if (seg.kind != "text") {
            expanded.push(seg)
            continue
        }
        let lines = seg.value.split("\n")
        let i = 0
        let buf: string[] = []
        let flushBuf = () => {
            if (buf.length) {
                expanded.push({kind: "text", value: buf.join("\n")})
                buf = []
            }
        }
        while (i < lines.length) {
            if (/^> ?/.test(lines[i]!)) {
                flushBuf()
                let ql: string[] = []
                while (i < lines.length && /^> ?/.test(lines[i]!)) {
                    ql.push(lines[i]!.replace(/^> ?/, ""))
                    i++
                }
                expanded.push({kind: "quote", value: ql.join("\n")})
            } else {
                buf.push(lines[i]!)
                i++
            }
        }
        flushBuf()
    }

    let text = ""
    let entities: MessageEntity[] = []
    let first = true
    for (let seg of expanded) {
        if (!first) text += "\n"
        first = false
        if (seg.kind == "pre") {
            let start = text.length
            text += seg.value
            let ent: MessageEntity = {type: "pre", offset: start, length: seg.value.length}
            if (seg.language) (ent as {language?: string}).language = seg.language
            entities.push(ent)
        } else if (seg.kind == "quote") {
            let start = text.length
            let inner = applyInline(seg.value)
            text += inner.text
            for (let e of inner.entities || []) {
                entities.push({...e, offset: e.offset + start})
            }
            entities.push({type: "blockquote", offset: start, length: inner.text.length})
        } else {
            let start = text.length
            let inner = applyInline(seg.value)
            text += inner.text
            for (let e of inner.entities || []) {
                entities.push({...e, offset: e.offset + start})
            }
        }
    }

    entities.sort((a, b) => a.offset - b.offset || b.length - a.length || a.type.localeCompare(b.type))
    return entities.length ? {text, entities} : {text}
}

function applyInline(input: string): FormattedText {
    type Tok = {t: "text"; v: string} | {t: "ent"; v: string; e: PartialEntity}

    let tokens: Tok[] = [{t: "text", v: input}]

    let patterns: {re: RegExp; to: (m: RegExpExecArray) => Tok}[] = [
        {
            re: /\[([^\]]+)\]\(([^)\s]+)\)/g,
            to: (m) => ({t: "ent", v: m[1]!, e: {type: "text_url", url: m[2]!}}),
        },
        {re: /\*\*([^*\n]+)\*\*/g, to: (m) => ({t: "ent", v: m[1]!, e: {type: "bold"}})},
        {re: /__([^_\n]+)__/g, to: (m) => ({t: "ent", v: m[1]!, e: {type: "italic"}})},
        {re: /~~([^~\n]+)~~/g, to: (m) => ({t: "ent", v: m[1]!, e: {type: "strike"}})},
        {re: /\|\|([^|\n]+)\|\|/g, to: (m) => ({t: "ent", v: m[1]!, e: {type: "spoiler"}})},
        {re: /`([^`\n]+)`/g, to: (m) => ({t: "ent", v: m[1]!, e: {type: "code"}})},
    ]

    for (let {re, to} of patterns) {
        let next: Tok[] = []
        for (let tok of tokens) {
            if (tok.t != "text") {
                next.push(tok)
                continue
            }
            let r = new RegExp(re.source, re.flags)
            let last = 0
            let m: RegExpExecArray | null
            let s = tok.v
            while ((m = r.exec(s))) {
                if (m.index > last) next.push({t: "text", v: s.slice(last, m.index)})
                next.push(to(m))
                last = m.index + m[0].length
            }
            if (last < s.length) next.push({t: "text", v: s.slice(last)})
        }
        tokens = next
    }

    let text = ""
    let entities: MessageEntity[] = []
    for (let tok of tokens) {
        if (tok.t == "text") {
            text += tok.v
        } else {
            let start = text.length
            text += tok.v
            entities.push({...tok.e, offset: start, length: tok.v.length} as MessageEntity)
        }
    }
    return entities.length ? {text, entities} : {text}
}
