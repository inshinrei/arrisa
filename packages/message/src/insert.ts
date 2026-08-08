/**
 * Insert host-backed messenger atoms: mentions and custom emoji.
 */
import {type Command} from "@arrisa/command"
import {Leaf, Mark} from "@arrisa/doc"
import {EditorSelection, type EditorState, type Transaction} from "@arrisa/state"
import {CustomEmoji, type CustomEmojiParam, MentionName} from "./schema-elements"

function selectionInsert(state: EditorState, nodes: Leaf[], cursorOffset: number): Transaction.Spec {
    let {selection} = state
    let from = selection.from,
        to = selection.to
    return {
        changes: {from, to, insert: nodes},
        selection: EditorSelection.cursor(from + cursorOffset),
        userEvent: "input.insert",
        scrollIntoView: true,
    }
}

/**
 * Insert a custom emoji leaf at the selection (replaces the range).
 * Requires {@link CustomEmoji} in the schema.
 */
export const insertCustomEmoji: Command.Pure<CustomEmojiParam> = ({state}, param) => {
    return insertCustomEmojiSpec(state, param)
}

/**
 * Insert a mention: labeled text marked with {@link MentionName}.
 * Requires {@link MentionName} in the schema.
 */
export const insertMention: Command.Pure<{userId: string; label: string}> = ({state}, config) => {
    return insertMentionSpec(state, config)
}

/** Pure helper for {@link insertCustomEmoji}. */
export function insertCustomEmojiSpec(state: EditorState, param: CustomEmojiParam): false | Transaction.Spec {
    if (!state.schema.getNode("CustomEmoji")) return false
    let leaf = CustomEmoji.of(param)
    return selectionInsert(state, [leaf], leaf.length)
}

/** Pure helper for {@link insertMention}. */
export function insertMentionSpec(
    state: EditorState,
    config: {userId: string; label: string},
): false | Transaction.Spec {
    if (!state.schema.getMark("MentionName") || !config.label) return false
    let leaf = Leaf.text(config.label, MentionName.of(config.userId).addToSet(Mark.none))
    return selectionInsert(state, [leaf], leaf.length)
}
