/**
 * Optional sync mention resolve on typing `@name `.
 */
import {Leaf, Mark} from "@arrisa/doc"
import {InputRule} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {MentionName} from "./schema-elements"

/**
 * When the user types `@username` followed by a space, call `resolve(username)`.
 * If it returns a user id, wrap the `@username` text in {@link MentionName}.
 * (Space is consumed and re-inserted unmarked after the mention.)
 */
export function mentionResolveRule(resolve: (username: string) => string | null | undefined): InputRule {
    return InputRule.define({
        expr: /@([A-Za-z][A-Za-z0-9_]{1,31}) $/,
        apply(state, match) {
            if (!state.schema.getMark("MentionName")) return null
            let username = match[1]?.text
            if (!username) return null
            let userId = resolve(username)
            if (!userId) return null
            let full = match[0]
            let label = "@" + username
            let marked = Leaf.text(label, MentionName.of(userId).addToSet(Mark.none))
            let space = Leaf.text(" ")
            return {
                changes: {
                    from: full.from.pos,
                    to: full.to.pos,
                    insert: [marked, space],
                },
                selection: {anchor: full.from.pos + label.length + 1},
                userEvent: "input.mention",
            }
        },
    })
}

/** Extension factory for {@link mentionResolveRule}. */
export function mentionResolve(resolve: (username: string) => string | null | undefined): EditorState.Extension {
    return mentionResolveRule(resolve).extension
}
