/**
 * Markdown-style input rules for messenger compose.
 *
 * Patterns (closing delimiter typed at end of match):
 * - `**bold**`
 * - `__italic__`
 * - `~~strike~~`
 * - `||spoiler||`
 * - `` `code` `` (inline, no newlines)
 */
import {Leaf, Mark} from "@arrisa/doc"
import {InputRule} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {Code, Emphasis, Spoiler, Strong, Strikethrough} from "@arrisa/types"

function markRule(expr: RegExp, mark: Mark): InputRule {
    return InputRule.define({
        expr,
        apply(_state, match) {
            let inner = match[1]
            if (!inner || !inner.text) return null
            let full = match[0]
            return {
                changes: {
                    from: full.from.pos,
                    to: full.to.pos,
                    insert: [Leaf.text(inner.text, mark.addToSet(Mark.none))],
                },
                selection: {anchor: full.from.pos + inner.text.length},
                userEvent: "input.mark",
            }
        },
    })
}

/** `**bold**` → strong. */
export const markdownBold = markRule(/\*\*([^*\n]+)\*\*$/, Strong)

/** `__italic__` → emphasis. */
export const markdownItalic = markRule(/__([^_\n]+)__$/, Emphasis)

/** `~~strike~~` → strikethrough. */
export const markdownStrike = markRule(/~~([^~\n]+)~~$/, Strikethrough)

/** `||spoiler||` → spoiler. */
export const markdownSpoiler = markRule(/\|\|([^|\n]+)\|\|$/, Spoiler)

/** `` `code` `` → inline code (no newlines). */
export const markdownCode = markRule(/`([^`\n]+)`$/, Code)

/** All messenger markdown input rules as an extension. */
export function markdownInputRules(): EditorState.Extension {
    return [
        markdownBold.extension,
        markdownItalic.extension,
        markdownStrike.extension,
        markdownSpoiler.extension,
        markdownCode.extension,
    ]
}
