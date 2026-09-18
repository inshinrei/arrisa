/**
 * Insert host-backed messenger atoms: mentions and custom emoji.
 */
import {type Command} from "@arrisa/command"
import {Leaf, Mark} from "@arrisa/doc"
import {EditorSelection, type EditorState, type Transaction} from "@arrisa/state"
import {docPosAtDumpOffset} from "./dump-pos"
import {CustomEmoji, type CustomEmojiParam, MentionName} from "./schema-elements"
import {type ToFormattedOptions} from "./to-formatted"

type InsertMentionConfig = {
    userId: string
    label: string
    /** Dump-space start (UTF-16). Requires `to`. */
    from?: number
    /** Dump-space end (UTF-16, exclusive). Requires `from`. */
    to?: number
    /**
     * Same flattening as {@link docToFormattedText} when mapping `from`/`to`.
     * Default `"label"`. Pass the host dump serializer so offsets match serialized space.
     */
    mentionText?: ToFormattedOptions["mentionText"]
}

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
 * Optional `from`/`to` replace a dump-text range (both required; out of range → `false`).
 * Pass `mentionText` with `from`/`to` when dump offsets were taken under that serializer.
 */
export const insertMention: Command.Pure<InsertMentionConfig> = ({state}, config) => {
    return insertMentionSpec(state, config)
}

/** Pure helper for {@link insertCustomEmoji}. */
export function insertCustomEmojiSpec(state: EditorState, param: CustomEmojiParam): false | Transaction.Spec {
    if (!state.schema.getNode("CustomEmoji")) return false
    let leaf = CustomEmoji.of(param)
    return selectionInsert(state, [leaf], leaf.length)
}

/** Pure helper for {@link insertMention}. */
export function insertMentionSpec(state: EditorState, config: InsertMentionConfig): false | Transaction.Spec {
    if (!state.schema.getMark("MentionName") || !config.label) return false
    let from = state.selection.from
    let to = state.selection.to
    if (config.from != null || config.to != null) {
        if (config.from == null || config.to == null) return false
        let mappedFrom = docPosAtDumpOffset(state.doc, config.from, "from", {mentionText: config.mentionText})
        let mappedTo = docPosAtDumpOffset(state.doc, config.to, "to", {mentionText: config.mentionText})
        if (mappedFrom === false || mappedTo === false) return false
        from = mappedFrom
        to = mappedTo
    }
    let leaf = Leaf.text(config.label, MentionName.of(config.userId).addToSet(Mark.none))
    return {
        changes: {from, to, insert: [leaf]},
        selection: EditorSelection.cursor(from + leaf.length),
        userEvent: "input.insert",
        scrollIntoView: true,
    }
}
