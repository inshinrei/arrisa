/**
 * Split and lift commands for textblocks and empty nested blocks.
 */
import {ChangeSet, Node, Plot, type Token} from "@arrisa/doc"
import {EditorSelection, type EditorState, type Transaction} from "@arrisa/state"

/**
 * Lift an empty textblock at the cursor out of its parent structure when the
 * parent can hold the block type higher up (or unwrap open/close tokens).
 */
export function liftEmptyBlock(state: EditorState): Transaction.Spec | false {
    if (!state.selection.isCursor) return false
    let sel = state.sel,
        block = sel.head.textblockParent
    if (!block || !sel.head.isAtStart(block) || !sel.head.isAtEnd(block)) return false
    let start = block.before,
        end = block.after,
        before: Token[] = [],
        after: Token[] = []
    for (
        let level = block.parent, index = block.index, atStart = true, atEnd = true, first = true;
        level;
        first = false, index = level.index, level = level.parent
    ) {
        if (!first && state.schema.canContain(level.node.type, block.node.type))
            return {
                changes: [
                    {from: start, to: block.before, insert: before},
                    {from: block.after, to: end, insert: after},
                ],
                scrollIntoView: true,
                userEvent: "unwrap.empty",
            }
        if (level.node.type.isInline || level.node.type.isolating) break
        if (index) atStart = false
        if (atStart) start--
        else before.push(Plot.End)
        if (index < level.node.content.length - 1) atEnd = false
        if (atEnd) end++
        else after.unshift(level.node.tag.split(false))
    }
    return false
}

/**
 * Split the textblock at the selection (optionally splitting a list item when
 * the cursor is at the start of the first child of a list item).
 */
export function splitTextblock(state: EditorState, splitListItem = true): Transaction.Spec | false {
    let {from, to} = state.sel.replacementRange,
        {schema} = state.doc
    let before = from.textblockParent
    if (!before || !before.parent) return false
    let tokens: Token[] = []
    for (let p = from.parent; ; p = p.parent!) {
        tokens.push(Plot.End)
        if (p == before) break
    }

    if (
        splitListItem &&
        !before.parent.node.type.hasRole(Node.Role.List) &&
        before.isFirst &&
        before.parent.parent?.node.type.hasRole(Node.Role.List)
    )
        tokens.push(Plot.End, before.parent.node.tag.split(false))

    let after = to.textblockParent
    if (after) {
        let atEnd = true,
            insert = tokens.length
        for (let p = to.parent, index = to.index; ; index = p.index + 1, p = p.parent!) {
            if (index < p.node.content.length) atEnd = false
            let tag = p.node.tag.split(atEnd),
                nextTag = atEnd && !p.node.type.spec.preserveOnSplitAtEnd ? null : tag
            if (!nextTag || !schema.canContain(p.parent!.node.type, tag.type)) {
                if (!atEnd) return false
                let defaultType = schema.defaultContentPlot(p.parent!.node.type)
                if (defaultType) tag = schema.withMarksFrom(tag, defaultType)
                else return false
            }
            tokens.splice(insert, 0, tag)
            if (p == after) break
        }
    }
    let changes: ChangeSet.Spec[] = [
        {
            from: from.pos,
            to: to.pos,
            insert: tokens,
        },
    ]
    if (from.isAtStart(before)) {
        let deflt = schema.defaultContentPlot(before.parent.node.type)
        if (deflt && !deflt.eq(before.node.tag))
            changes.unshift({
                from: before.before,
                to: before.start,
                insert: [schema.withMarksFrom(before.node.tag, deflt)],
            })
    }
    let changeSet = ChangeSet.create(state.doc, {correct: changes, local: true})
    return {
        changes: changeSet,
        selection: EditorSelection.cursor(changeSet.mapPos(to.pos, 1)),
        scrollIntoView: true,
        userEvent: "split.textblock",
    }
}
