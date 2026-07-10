/**
 * Block structure commands: set type, wrap/unwrap, toggle, and list indent style.
 */
import {type ChangeSet, Leaf, Node, Plot, type Pos, type Token} from "@arrisa/doc"
import {type EditorState, type Transaction} from "@arrisa/state"
import {type Command} from "./command"
import {autoJoinBlocks, clearNonFitting} from "./util/blocks"
import {selectedTextblocks} from "./util/selection"
import {doUnwrapBlock, findUnwrappable, findWrappable, wrapBlockRange} from "./util/wrap"

/** Change selected textblocks to `tag` when the parent allows it. */
export const setTextblockType: Command.Pure<Plot.Tag> = ({state}, tag) => {
    let changes: ChangeSet.Spec[] = [],
        {schema} = state.doc
    for (let block of selectedTextblocks(state)) {
        if (!block.node.tag.eq(tag) && block.parent && schema.canContain(block.parent.node.type, tag.type)) {
            changes.push({
                from: block.before,
                to: block.before + 1,
                insert: [schema.withMarksFrom(block.node.tag, tag)],
            })
            changes.push(clearNonFitting(schema, block, tag.type))
        }
    }
    if (!changes.length) return false
    return autoJoinBlocks(state, {changes, scrollIntoView: true, userEvent: "settype"})
}

/** Unwrap blocks matching `query` (or the nearest unwrappable structure). */
export const unwrapBlock: Command.Pure<Node.Query | null> = ({state}, query) => {
    let targets: Pos.Node[] = [],
        changes: ChangeSet.Spec[] = []
    for (let {from, to} of state.selection.ranges) {
        if (!targets.some((t) => t.after > from && t.before < to)) {
            let result = findUnwrappable(
                state.schema,
                state.doc.resolve(from),
                state.doc.resolve(to),
                query ?? undefined,
            )
            if (result)
                for (let node of result) {
                    targets.push(node)
                    changes.push(doUnwrapBlock(node, from, to))
                }
        }
    }
    if (!targets.length) return false
    return autoJoinBlocks(state, {
        changes,
        scrollIntoView: true,
        userEvent: "unwrap",
    })
}

/** Wrap each selection range in `wrapper` when the range is wrappable. */
export const wrapBlock: Command.Pure<Plot.Tag> = ({state}, wrapper) => {
    let changes: ChangeSet.Spec[] = [],
        lastTo = -1
    for (let {from, to} of state.selection.ranges) {
        let range = findWrappable(state.doc.resolve(from), state.doc.resolve(to), wrapper)
        if (!range || range.from.pos < lastTo) continue
        changes.push(wrapBlockRange(range, wrapper))
        lastTo = range.to.pos
    }
    if (!changes.length) return false
    return autoJoinBlocks(state, {changes, scrollIntoView: true, userEvent: "wrap"})
}

/** Unwrap if already wrapped in `tag`, otherwise wrap. */
export const toggleBlock: Command.Pure<Plot.Tag> = (target, tag) => {
    return unwrapBlock(target, tag) || wrapBlock(target, tag)
}

/** Toggle selected textblocks into / out of a list of type `listTag`. */
export const toggleList: Command.Pure<Plot.Tag> = ({state}, listTag) => {
    let blocks = selectedTextblocks(state)
    if (!blocks.length) return false
    return addList(state, blocks, listTag) || removeList(state, blocks, listTag)
}

/** Predicate: every selected textblock sits inside a list item of `listTag`. */
export const listIsActive =
    (listTag: Plot.Tag): ((state: EditorState) => boolean) =>
    (state) => {
        return selectedTextblocks(state).every((b) => {
            let item = isListItem(b)
            return !!(item && item.parent!.node.type == listTag.type)
        })
    }

/** Walk up from a textblock to find its list item (must be the first child path). */
function isListItem(node: Pos.Node): Pos.Plot | null {
    for (let first = true; ; ) {
        let {parent} = node
        if (!parent) return null
        if (parent.node.tag.type.hasRole(Node.Role.List)) return first ? (node as Pos.Plot) : null
        first = node.isFirst
        node = parent
    }
}

function autoJoin(a: Plot.Tag, b: Plot.Tag) {
    let {autoJoin} = a.type.spec
    return typeof autoJoin == "function" ? autoJoin(a, b) : typeof autoJoin == "boolean" ? autoJoin : a.eq(b)
}

/**
 * Wrap non-list blocks in a one-level list item under `listTag`, or convert
 * items already in a different list type.
 */
function addList(state: EditorState, blocks: Pos.Plot[], listTag: Plot.Tag): Transaction.Spec | false {
    let plan: ({wrap: Pos.Plot; item: Plot.Tag} | {change: Pos.Node; item: Pos.Node})[] = []
    let chBefore: Set<number> = new Set(),
        chAfter: Set<number> = new Set()
    let lastItem = -1,
        {schema} = state.doc
    for (let block of blocks) {
        let item = isListItem(block),
            wrap
        if (
            !item &&
            block.parent &&
            schema.canContain(block.parent.node.type, listTag.type) &&
            (((wrap = schema.findWrapping(listTag.type, block.node.type)) && wrap.length == 1) ||
                ((wrap = schema.findWrapping(listTag.type, Leaf.Text)) && wrap.length == 1))
        ) {
            chAfter.add(block.before)
            chBefore.add(block.after)
            plan.push({wrap: block, item: wrap[0]})
            lastItem = block.before
        } else if (
            item?.parent &&
            item.parent.node.tag.type != listTag.type &&
            schema.canContain(listTag.type, item.node.type) &&
            item.parent.parent &&
            schema.canContain(item.parent.parent.node.type, listTag.type) &&
            item.before != lastItem
        ) {
            chAfter.add(item.before)
            chBefore.add(item.after)
            if (item.isFirst) chAfter.add(item.parent.before)
            if (item.isLast) chBefore.add(item.parent.after)
            plan.push({change: block, item})
            lastItem = item.before
        }
    }
    if (!plan.length) return false
    let changes: ChangeSet.Spec[] = []
    for (let step of plan) {
        if ("wrap" in step) {
            let {wrap, item} = step,
                prev,
                next
            let openTo = item.isTextblock ? wrap.start : wrap.before,
                openFrom = wrap.before,
                open: Token[] = [item]
            if (chBefore.has(wrap.before)) {
            } else if ((prev = wrap.previousSibling) && prev.tag.eq(listTag)) openFrom--
            else open.unshift(listTag)
            changes.push({from: openFrom, to: openTo, insert: open})
            let closeFrom = item.isTextblock ? wrap.end : wrap.after,
                closeTo = wrap.after,
                close: Token[] = [Plot.End]
            if (chAfter.has(wrap.after)) {
            } else if (
                (next = wrap.nextSibling) &&
                next.isPlot &&
                next.type == listTag.type &&
                autoJoin(next.tag, listTag)
            )
                closeTo++
            else close.push(Plot.End)
            changes.push({from: closeFrom, to: closeTo, insert: close})
        } else {
            let {item} = step,
                prev,
                next
            if (item.isFirst) {
                if (chBefore.has(item.before - 1)) changes.push({from: item.before - 1, to: item.before})
                else if ((prev = item.parent!.previousSibling) && prev.tag.type == listTag.type)
                    changes.push({from: item.before - 2, to: item.before})
                else changes.push({from: item.before - 1, to: item.before, insert: [listTag]})
            } else if (!chBefore.has(item.before)) {
                changes.push({from: item.before, insert: [Plot.End, listTag]})
            }
            if (item.isLast) {
                if (chAfter.has(item.after + 1)) {
                    changes.push({from: item.after, to: item.after + 1})
                } else if ((next = item.parent!.nextSibling) && next.isPlot && autoJoin(next.tag, listTag)) {
                    changes.push({from: item.after, to: item.after + 2})
                }
            }
        }
    }
    return {changes, userEvent: "wrap.list"}
}

/** Lift list items out of `listTag`, optionally rewrapping as a default block. */
function removeList(state: EditorState, blocks: Pos.Node[], listTag: Plot.Tag): Transaction.Spec | false {
    let plan: {item: Pos.Plot; rewrap: Plot.Tag | null}[] = [],
        lastItem = -1
    let chBefore: Set<number> = new Set(),
        chAfter: Set<number> = new Set()
    let {schema} = state.doc
    for (let block of blocks) {
        let item = isListItem(block)
        if (!item) continue
        let list = item.parent!,
            parent = list.parent,
            rewrap: Node.Tag | null = null
        if (
            parent &&
            list.node.isPlot &&
            list.node.type == listTag.type &&
            item.before != lastItem &&
            (item.node.isTextblock
                ? (rewrap = schema.defaultContentPlot(parent.node.type)) && rewrap.isTextblock
                : schema.canContain(parent.node.type, block.node.type))
        ) {
            lastItem = item.before
            plan.push({item, rewrap: rewrap as Plot.Tag})
            chAfter.add(item.before)
            chBefore.add(item.after)
        }
    }
    if (!plan.length) return false
    let changes: ChangeSet.Spec[] = []
    for (let {item, rewrap} of plan) {
        let openFrom = item.before,
            openTo = item.start,
            open: Token[] = rewrap ? [rewrap] : []
        if (item.isFirst) openFrom--
        else if (!chBefore.has(item.before)) open.unshift(Plot.End)
        changes.push({from: openFrom, to: openTo, insert: open})
        let closeFrom = rewrap ? item.after : item.end,
            closeTo = item.after,
            close: Token[] = []
        if (item.isLast) closeTo++
        else if (!chAfter.has(item.after)) close.push(listTag)
        changes.push({from: closeFrom, to: closeTo, insert: close})
    }
    return {changes, userEvent: "unwrap.list"}
}
