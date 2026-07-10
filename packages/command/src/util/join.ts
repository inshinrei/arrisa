/**
 * Join commands: merge textblocks or list items around the cursor.
 */
import {ChangeSet, Node, type Pos} from "@arrisa/doc"
import {EditorSelection, type EditorState, type Transaction} from "@arrisa/state"
import {clearNonFitting, joinBlocks} from "./blocks"

/** Join the textblock before the cursor into the current one. */
export function joinBackward(state: EditorState): Transaction.Spec | false {
    if (!state.selection.isCursor) return false
    let {head} = state.sel,
        block = head.textblockParent
    if (!block || !head.isAtStart(block)) return false
    let scan = block,
        target = scan.node
    while (!scan.index) {
        if (!scan.parent) return false
        scan = scan.parent
        if (scan.node.type.isolating || !scan.node.type.isBlock) return false
    }
    let before = scan.previousSibling!,
        parent = scan.parent!.node,
        pos = scan.start - 1
    while (before.isLeaf || !before.isTextblock) {
        if (before.isLeaf || before.type.isAtom || before.type.isolating || !before.type.isBlock) return false
        let last = before.content.length - 1
        if (last < 0) return false
        parent = before
        before = before.content[last]
        pos--
    }
    let {schema} = state.doc
    let changes = [joinBlocks(state.doc.resolve(pos - 1).parent, block), clearNonFitting(schema, block, before.type)]
    if (!before.content.length && !before.tag.eq(target.tag) && schema.canContain(parent.type, target.type))
        changes.push({
            from: pos - before.length,
            to: pos - before.length + 1,
            insert: [schema.withMarksFrom(before.tag, target.tag)],
        })
    let changeSet = ChangeSet.create(state.doc, changes)
    return {
        changes: changeSet,
        selection: EditorSelection.cursor(changeSet.mapPos(head.pos), -1),
        scrollIntoView: true,
        userEvent: "join.backward",
    }
}

/** Join the current list item with the previous sibling when at the item start. */
export function joinListItems(state: EditorState): Transaction.Spec | false {
    if (!state.selection.isCursor) return false
    let {head} = state.sel
    if (head.index || head.inText) return false
    for (let scan = head.parent; ;) {
        let next = scan.parent
        if (!next) return false
        if (scan.node.type.isBlock && next.node.type.hasRole(Node.Role.List)) {
            let prev = scan.previousSibling
            if (!prev || (!prev.isLeaf && scan.node.content.some((ch) => !state.schema.canContain(prev.type, ch.type))))
                return false
            return {
                changes: {from: scan.before - 1, to: scan.before + 1},
                userEvent: "join.backward.list",
                scrollIntoView: true,
            }
        }
        if (scan.index) return false
        scan = next
    }
}

/** Join the textblock after the cursor into the current one. */
export function joinForward(state: EditorState): Transaction.Spec | false {
    if (!state.selection.isCursor) return false
    let {head} = state.sel,
        block = head.textblockParent
    if (!block || !head.isAtEnd(block)) return false
    let scan = block,
        target = scan.node
    for (;;) {
        if (!scan.parent) return false
        if (scan.index < scan.parent.node.content.length - 1) break
        scan = scan.parent
        if (scan.node.type.isolating || !scan.node.type.isBlock) return false
    }
    let after = scan.nextSibling!,
        parent = scan.parent.node,
        pos = scan.after
    while (after.isLeaf || !after.isTextblock) {
        if (after.isLeaf || after.type.isolating || after.type.isAtom || !after.type.isBlock || !after.content.length)
            return false
        parent = after
        after = after.content[0]
        pos++
    }
    let blockAfter = state.doc.resolveNode(pos) as Pos.Plot
    let {schema} = state.doc
    let changes = [joinBlocks(block, blockAfter), clearNonFitting(schema, blockAfter, target.type)]
    if (!target.content.length && !target.tag.eq(after.tag) && schema.canContain(parent.type, after.type))
        changes.push({
            from: block.before,
            to: block.start,
            insert: [schema.withMarksFrom(target.tag, after.tag)],
        })
    let changeSet = ChangeSet.create(state.doc, changes)
    return {
        changes: changeSet,
        selection: EditorSelection.cursor(changeSet.mapPos(head.pos, 1)),
        scrollIntoView: true,
        userEvent: "join.forward",
    }
}
