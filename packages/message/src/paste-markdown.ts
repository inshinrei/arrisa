/**
 * Clipboard text parser: plain markdown → document slice.
 */
import {Slice} from "@arrisa/doc"
import {Arrisa} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {formattedTextToDoc} from "./from-formatted"
import {parseMarkdownText} from "./parse-markdown"

/**
 * When plain text paste looks like markdown, convert it to a rich slice.
 * Returns null when no markdown markers are present (default paste wins).
 */
export function markdownClipboardParser(text: string, state: EditorState): Slice | null {
    if (!looksLikeMarkdown(text)) return null
    let ft = parseMarkdownText(text)
    if (!ft.entities?.length) return null
    let doc = formattedTextToDoc(ft, state.schema)
    if (!doc.content.length) return null
    return Slice.of([...doc.content])
}

/** Heuristic: delimiters that our markdown parser understands. */
export function looksLikeMarkdown(text: string): boolean {
    if (!text) return false
    return (
        /\*\*[^*\n]+\*\*/.test(text) ||
        /__[^_\n]+__/.test(text) ||
        /~~[^~\n]+~~/.test(text) ||
        /\|\|[^|\n]+\|\|/.test(text) ||
        /`[^`\n]+`/.test(text) ||
        /\[[^\]]+\]\([^)\s]+\)/.test(text) ||
        /^```/m.test(text) ||
        /^> /m.test(text)
    )
}

/** Extension: register {@link markdownClipboardParser}. */
export function markdownPaste(): EditorState.Extension {
    return Arrisa.clipboardTextParser.of(markdownClipboardParser)
}
