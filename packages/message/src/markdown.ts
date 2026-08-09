/**
 * Markdown-style input rules for messenger compose.
 *
 * Patterns (closing delimiter typed at end of match) come from
 * {@link MARKDOWN_INLINE_DELIMITERS}.
 */
import {Leaf, Mark} from "@arrisa/doc"
import {InputRule} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {MARKDOWN_INLINE_DELIMITERS} from "./markdown-delimiters"

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

const rules = MARKDOWN_INLINE_DELIMITERS.map((d) =>
    markRule(new RegExp(d.inputSource), d.mark),
)

/** `**bold**` → strong. */
export const markdownBold = rules[0]!

/** `__italic__` → emphasis. */
export const markdownItalic = rules[1]!

/** `~~strike~~` → strikethrough. */
export const markdownStrike = rules[2]!

/** `||spoiler||` → spoiler. */
export const markdownSpoiler = rules[3]!

/** `` `code` `` → inline code (no newlines). */
export const markdownCode = rules[4]!

/** All messenger markdown input rules as an extension. */
export function markdownInputRules(): EditorState.Extension {
    return rules.map((r) => r.extension)
}
