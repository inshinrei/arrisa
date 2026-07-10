/**
 * Block wrap / unwrap helpers for range-based structure changes.
 */
import {type ChangeSet, type Node, Plot, Pos, type Schema, type Token} from "@arrisa/doc"
import {clearNonFitting, textblockChild} from "./blocks"

/** Find the deepest range between `from`/`to` that can be wrapped in `wrapper`. */
export function findWrappable(from: Pos, to: Pos, wrapper: Plot.Tag) {
    let dFrom = from.depth,
        dTo = to.depth
    let pFrom = from.parent,
        pTo = to.parent
    while (dFrom > dTo) {
        pFrom = pFrom.parent!
        dFrom--
    }
    while (dTo > dFrom) {
        pTo = pTo.parent!
        dTo--
    }
    let {schema} = from.doc
    for (;;) {
        if (!pFrom.parent || pFrom.node.type.isolating) return null
        if (pFrom.parent.start == pTo.parent!.start && schema.canContain(pFrom.parent.node.type, wrapper.type)) break
        pFrom = pFrom.parent
        pTo = pTo.parent!
    }
    for (let i = pFrom.index; i < pTo.index + 1; i++) {
        let ch = pFrom.parent.node.content[i]
        if (!schema.findWrapping(wrapper.type, ch.type)) return null
    }
    return {
        from: Pos.create(pFrom.parent, pFrom.before, pFrom.index, 0),
        to: Pos.create(pFrom.parent, pTo.after, pTo.index + 1, 0),
    }
}

/** Build change specs that wrap children of `range` in `wrapper` (plus intermediate wraps). */
export function wrapBlockRange(range: {from: Pos; to: Pos}, wrapper: Plot.Tag) {
    let changes: ChangeSet.Spec[] = [],
        parent = range.from.parent.node
    for (let i = range.from.index, openWrappers = 0, pos = range.from.pos; ; i++) {
        let tokens: Token[] = []
        for (let j = 0; j < openWrappers; j++) tokens.push(Plot.End)
        if (i == range.from.index) {
            tokens.push(wrapper)
        } else if (i == range.to.index) {
            tokens.push(Plot.End)
            changes.push({from: pos, insert: tokens})
            break
        }
        let child = parent.content[i]
        let {schema} = range.from.doc
        let wrapping = schema.findWrapping(wrapper.type, child.type)!
        for (let tag of wrapping) tokens.push(tag)
        openWrappers = wrapping.length
        changes.push({from: pos, insert: tokens})
        pos += child.length
    }
    return changes
}

/**
 * Find non-overlapping block plots under the range that can be unwrapped
 * into their parent (preferring largest inner candidates).
 */
export function findUnwrappable(schema: Schema, from: Pos, to: Pos, query?: Node.Query) {
    let dFrom = from.depth,
        dTo = to.depth
    let fromStart = from.parent.node.inlineContent ? from.parent.start : from.pos
    let fromTextblock = from.textblockParent?.node.type
    let toEnd = to.parent.node.inlineContent ? to.parent.end : to.pos
    let innerCandidates: Pos.Plot[] = []
    let outerCandidates: Pos.Plot[] = []
    let {doc} = from
    doc.iterate(fromStart, toEnd, (node, p, parent) => {
        if (
            node.type.isBlock &&
            node.isPlot &&
            !node.inlineContent &&
            parent &&
            (fromTextblock
                ? doc.schema.canContain(parent.type, fromTextblock)
                : textblockChild(doc.schema, parent.type)) &&
            (!query || schema.matchNode(node.type, query))
        ) {
            let pos = doc.resolveNode(p) as Pos.Plot,
                depth = pos.depth
            if (pos.before >= fromStart - (dFrom - depth + 1) && pos.after <= toEnd + (dTo - depth + 1))
                innerCandidates.push(pos)
            else outerCandidates.push(pos)
        }
    })
    let candidates = innerCandidates.length
        ? innerCandidates.sort((a, b) => b.after - b.before - (a.after - a.before))
        : outerCandidates.sort((a, b) => a.after - a.before - (b.after - b.before))
    if (!candidates.length) return null

    for (let i = 1; i < candidates.length; i++) {
        let cur = candidates[i]
        for (let j = 0; j < i; j++) {
            let other = candidates[j]
            if (cur.after > other.before && cur.before < other.after) {
                candidates.splice(i--, 1)
                break
            }
        }
    }
    return candidates
}

/**
 * Lift children of `block` into its parent, optionally limited to content
 * between absolute positions `from`/`to`.
 */
export function doUnwrapBlock(block: Pos.Plot, from?: number, to?: number): ChangeSet.Spec {
    let changes: ChangeSet.Spec[] = [],
        {schema} = block.doc
    let outer = block.parent!.node,
        wrapText = textblockChild(schema, outer.type)

    let gapStart = block.before
    let skippedDepth = 0

    let replaceGap = (to: number, tokens: Token[]) => {
        for (let i = 0; i < skippedDepth; i++) tokens.unshift(Plot.End)
        skippedDepth = 0
        if (to > gapStart || tokens.length) changes.push({from: gapStart, to, insert: tokens})
    }

    let parent = block,
        index = 0,
        pos = block.start
    for (;;) {
        if (index == parent.node.content.length) {
            if (parent == block) {
                let tokens: Token[] = []
                if (gapStart == block.before && outer.content.length == 1) {
                    let deflt = schema.createDefault(outer.type)
                    if (deflt) tokens.push(deflt)
                }
                replaceGap(block.after, tokens)
                break
            } else {
                if (gapStart == pos && skippedDepth > 0) {
                    gapStart++
                    skippedDepth--
                }
                pos++
                index = parent.index + 1
                parent = parent.parent!
            }
        } else {
            let next = parent.node.content[index]

            if (schema.canContain(outer.type, next.type) || (wrapText && next.isPlot && next.inlineContent)) {
                if (from != null && pos + next.length <= from) {
                    pos += next.length
                    gapStart = pos
                    skippedDepth = 1
                    for (let cx = parent; cx != block; cx = cx.parent!) skippedDepth++
                    index++
                } else if (to != null && pos >= to) {
                    let tokens: Token[] = [],
                        upto = pos

                    for (let cx = parent, i = tokens.length, atStart = !index; ; cx = cx.parent!) {
                        if (cx.index > 0) atStart = false
                        if (atStart) upto--
                        else tokens.splice(i, 0, cx.node.tag.split(false))
                        if (cx == block) break
                    }
                    replaceGap(upto, tokens)
                    break
                } else {
                    if (schema.canContain(outer.type, next.type)) {
                        replaceGap(pos, [])
                    } else {
                        replaceGap(pos + 1, [wrapText!])
                        changes.push(
                            clearNonFitting(schema, Pos.Plot.create(parent, next as Plot, pos, index), wrapText!.type),
                        )
                    }
                    pos += next.length
                    index++
                    gapStart = pos
                }
            } else if (next.isLeaf || next.type.isolating) {
                pos += next.length
                index++
            } else {
                parent = Pos.Plot.create(parent, next, pos, index)
                index = 0
                pos++
            }
        }
    }
    return changes
}
