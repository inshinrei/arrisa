/**
 * Insertion commands: typed text, line breaks, Enter, and character transpose.
 */
import {ChangeSet, Leaf, type Plot} from "@arrisa/doc"
import {EditorSelection, findClusterBreak} from "@arrisa/state"
import {type Command} from "./command"
import {liftEmptyBlock, splitTextblock} from "./util/split"

/** Replace `from`–`to` with `insert`, preserving active/endpoint marks. */
export const insertText: Command.Pure<{from: number; to: number; insert: string; userEvent: string}> = (
    {state},
    {from, to, insert, userEvent},
) => {
    let {selection} = state
    let marks =
        (from == selection.from && to == selection.to && state.sel.activeMarks) ||
        state.doc.resolve(from).marks(state.doc.resolve(to))
    return {
        changes: {from, to, insert: [Leaf.Text.of(insert, marks)], fit: true},
        scrollIntoView: true,
        selection: (cx, changes) => EditorSelection.near(cx, changes.mapPos(to, 1), -1),
        userEvent,
    }
}

/**
 * Insert a schema line-break node when allowed; otherwise a newline character
 * inside preserve-whitespace parents. Fails when neither applies.
 */
export const insertLineBreak: Command.Pure = ({state}) => {
    let {doc, sel} = state
    let brk = doc.schema.lineBreak,
        parent = sel.from.parent.node.type
    let {from, to} = state.selection.replacementRange
    let insertBreak = brk && doc.schema.canContain(parent, brk.type)
    if (!(insertBreak || (parent.preserveWhitespace && sel.to.parent.start == sel.from.parent.start))) return false
    let insert = insertBreak ? brk!.withMarks(state.sel.activeMarks) : Leaf.text("\n", state.sel.activeMarks)
    let changes = ChangeSet.create(state.doc, {from, to, insert: [insert], fit: true})
    let pos = changes.findInserted((t) => (insertBreak ? t.type == brk!.type : t.isText))
    return {
        changes,
        selection: EditorSelection.cursor(pos == null ? from : pos + 1, -1),
        scrollIntoView: true,
        userEvent: insertBreak ? "insert.linebreak" : "input",
    }
}

/**
 * Enter key: when the selection is not in inline content, insert a default
 * textblock; otherwise lift an empty block or split the current textblock.
 */
export const enter: Command.Pure = ({state}) => {
    let {sel, doc} = state

    if (!sel.head.parent.node.inlineContent || !sel.anchor.parent.node.inlineContent) {
        let {from, to} = sel.replacementRange
        let wrap = doc.schema.findWrapping(from.parent.node.type, Leaf.Text)
        if (!wrap) return false
        let content: Plot[] = []
        for (let i = wrap.length - 1; i >= 0; i--) content = [wrap[i].create(content)]
        let changes = ChangeSet.create(state.doc, {from: from.pos, to: to.pos, insert: content, fit: true})
        let placed = content.length ? changes.findInserted((t) => t == content[0].tag) : null
        return {
            changes,
            selection: placed != null ? (cx) => EditorSelection.near(cx, placed + wrap.length, -1) : undefined,
            scrollIntoView: true,
            userEvent: "insert.textblock",
        }
    }
    return liftEmptyBlock(state) || splitTextblock(state)
}

/** Swap the grapheme clusters immediately before and after a cursor. */
export const transposeChars: Command.Pure = ({state}) => {
    if (!state.selection.isCursor) return false
    let {sel} = state,
        head = state.selection.head
    let before = sel.head.nodeBefore,
        after = sel.head.nodeAfter
    if (!before || !before.is(Leaf.Text) || !after || !after.is(Leaf.Text)) return false
    let lenBefore = before.param.length - findClusterBreak(before.param, before.param.length, false)
    let lenAfter = findClusterBreak(after.param, 0)
    return {
        changes: [
            {from: head - lenBefore, to: head},
            {from: head + lenAfter, insert: [Leaf.text(before.param.slice(before.param.length - lenBefore))]},
        ],
        selection: EditorSelection.cursor(head + lenAfter, -1),
        scrollIntoView: true,
        userEvent: "transpose",
    }
}
