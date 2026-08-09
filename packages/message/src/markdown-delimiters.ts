/**
 * Single dialect table for messenger markdown delimiters.
 * Drives input rules, parse-inline patterns, and paste heuristics.
 */
import {Mark} from "@arrisa/doc"
import {Code, Emphasis, Spoiler, Strong, Strikethrough} from "@arrisa/types"
import type {FlagEntity} from "./entities"

export type MarkdownInlineDelimiter = {
    open: string
    close: string
    entity: FlagEntity["type"]
    mark: Mark
    /** End-anchored input-rule pattern (closing delimiter typed). */
    inputSource: string
    /** Global pattern for bulk parse (capture group 1 = inner text). */
    parseSource: string
}

/**
 * Inline delimiter pairs. Order matters for parse (links handled separately).
 * Longer / more specific pairs first where relevant.
 */
export const MARKDOWN_INLINE_DELIMITERS: readonly MarkdownInlineDelimiter[] = [
    {
        open: "**",
        close: "**",
        entity: "bold",
        mark: Strong,
        inputSource: "\\*\\*([^*\\n]+)\\*\\*$",
        parseSource: "\\*\\*([^*\\n]+)\\*\\*",
    },
    {
        open: "__",
        close: "__",
        entity: "italic",
        mark: Emphasis,
        inputSource: "__([^_\\n]+)__$",
        parseSource: "__([^_\\n]+)__",
    },
    {
        open: "~~",
        close: "~~",
        entity: "strike",
        mark: Strikethrough,
        inputSource: "~~([^~\\n]+)~~$",
        parseSource: "~~([^~\\n]+)~~",
    },
    {
        open: "||",
        close: "||",
        entity: "spoiler",
        mark: Spoiler,
        inputSource: "\\|\\|([^|\\n]+)\\|\\|$",
        parseSource: "\\|\\|([^|\\n]+)\\|\\|",
    },
    {
        open: "`",
        close: "`",
        entity: "code",
        mark: Code,
        inputSource: "`([^`\\n]+)`$",
        parseSource: "`([^`\\n]+)`",
    },
]

/** Block / link heuristics shared by paste detection. */
export const MARKDOWN_BLOCK_HINTS: readonly RegExp[] = [
    /\[[^\]]+\]\([^)\s]+\)/,
    /^```/m,
    /^> /m,
]

/** True when text contains any delimiter or block marker we understand. */
export function textLooksLikeMarkdown(text: string): boolean {
    if (!text) return false
    for (let d of MARKDOWN_INLINE_DELIMITERS) {
        let re = new RegExp(d.parseSource)
        if (re.test(text)) return true
    }
    for (let re of MARKDOWN_BLOCK_HINTS) {
        if (re.test(text)) return true
    }
    return false
}
