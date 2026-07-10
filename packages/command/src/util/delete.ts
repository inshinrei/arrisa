/**
 * Delete commands: selection, empty blocks, and backward/forward char or word.
 */
import {Leaf, type Pos} from "@arrisa/doc"
import {EditorSelection, type EditorState, findClusterBreak, type Transaction} from "@arrisa/state"
import {autoJoinBlocks} from "./blocks"

/** Delete non-empty selection ranges, auto-joining blocks at the gaps. */
export function deleteSelection(state: EditorState): Transaction.Spec | false {
    let {ranges} = state.selection
    if (ranges.every((r) => r.from == r.to)) return false
    return autoJoinBlocks(state, {
        changes: {
            correct: ranges.filter((r) => r.from < r.to).map((r) => ({from: r.from, to: r.to, fit: true})),
            local: true,
        },
        selection: (cx, changes) =>
            state.selection instanceof EditorSelection.Text
                ? EditorSelection.near(cx, changes.mapPos(state.selection.head, -1), 1)
                : state.selection.map(changes, cx),
        scrollIntoView: true,
        userEvent: "delete.selection",
    })
}

/** Remove an empty textblock at the cursor (not the sole remaining block). */
export function deleteEmptyTextblock(state: EditorState, dir: -1 | 1 = -1): Transaction.Spec | false {
    if (!state.selection.isCursor) return false
    let block = state.sel.head.textblockParent
    if (!block || block.start < block.end || (block.before == 0 && block.after == state.doc.length)) return false
    return {
        changes: {from: block.before, to: block.after, fit: true},
        selection: (cx, changes) => EditorSelection.near(cx, changes.mapPos(state.selection.head), dir),
        scrollIntoView: true,
        userEvent: dir < 0 ? "delete.backward" : "delete.forward",
    }
}

/** Delete one cluster (or word) before the cursor, or a leaf/atom before it. */
export function deleteBackward(state: EditorState, word = false): Transaction.Spec | false {
    if (!state.selection.isCursor) return false

    let sel = state.sel
    let {parent: scan, index, pos} = sel.head
    if (!sel.head.inText)
        while (!index) {
            if (scan.node.type.isolating || !scan.parent) return false
            index = scan.index
            scan = scan.parent
            pos--
        }
    let next = sel.head.inText ? sel.head.nodeBefore! : scan.node.content[--index]
    for (;;) {
        if (next.isPlot && next.type.isolating) return false
        if (next.isLeaf || next.type.isAtom) break
        let last = next.content.length - 1
        if (last < 0) return false
        next = next.content[last]
        pos--
    }
    if (next.is(Leaf.Text)) {
        let size = 0
        if (word) {
            for (let i = next.param.length, kind: "a" | "p" | undefined; ;) {
                let ch = next.param[i - 1]
                if (/\s/.test(ch)) {
                    if (kind) break
                } else {
                    let charKind: "a" | "p" = /[\p{Alphabetic}\p{Number}]/u.test(ch) ? "a" : "p"
                    if (!kind) kind = charKind
                    else if (kind != charKind) break
                }
                i--
                size++
                if (i == 0) {
                    if (!index) break
                    next = scan.node.content[--index]
                    if (!next.is(Leaf.Text)) break
                    i = next.param.length
                }
            }
        } else {
            size = next.length - findClusterBreak(next.param, next.length, false)
        }
        return {
            changes: {from: pos - size, to: pos},
            scrollIntoView: true,
            userEvent: "delete.backward",
        }
    }
    let from = pos - next.length,
        to = pos
    let parent: Pos.Plot | null = state.doc.resolve(pos).parent
    while (parent && parent.node.type.isBlock && parent.node.content.length == 1) {
        if (!parent.parent) return false
        parent = parent.parent
        from--
        to++
    }
    return {
        changes: {from, to},
        scrollIntoView: true,
        userEvent: "delete.backward",
    }
}

/** Delete one cluster (or word) after the cursor, or a leaf/atom after it. */
export function deleteForward(state: EditorState, word = false): Transaction.Spec | false {
    if (!state.selection.isCursor) return false

    let sel = state.sel
    let {parent: scan, index, pos} = sel.head
    if (!sel.head.inText)
        while (index == scan.node.content.length) {
            if (scan.node.type.isolating || !scan.parent) return false
            index = scan.index + 1
            scan = scan.parent
            pos++
        }
    let next = sel.head.inText ? sel.head.nodeAfter! : scan.node.content[index]
    for (;;) {
        if (next.isPlot && next.type.isolating) return false
        if (next.isLeaf || next.type.isAtom) break
        if (!next.content.length) return false
        next = next.content[0]
        pos++
    }
    if (next.is(Leaf.Text)) {
        let size = 0
        if (word) {
            for (let i = 0, kind: "a" | "p" | undefined; ;) {
                let ch = next.param[i]
                if (/\s/.test(ch)) {
                    if (kind) break
                } else {
                    let charKind: "a" | "p" = /[\p{Alphabetic}\p{Number}]/u.test(ch) ? "a" : "p"
                    if (!kind) kind = charKind
                    else if (kind != charKind) break
                }
                i++
                size++
                if (i == next.param.length) {
                    if (index == scan.node.content.length - 1) break
                    next = scan.node.content[++index]
                    if (!next.is(Leaf.Text)) break
                    i = 0
                }
            }
        } else {
            size = findClusterBreak(next.param, 0)
        }
        return {
            changes: {from: pos, to: pos + size},
            scrollIntoView: true,
            userEvent: "delete.forward",
        }
    }
    let from = pos,
        to = pos + next.length
    let parent: Pos.Plot | null = state.doc.resolve(pos).parent
    while (parent && parent.node.type.isBlock && parent.node.content.length == 1) {
        if (!parent.parent) return false
        parent = parent.parent
        from--
        to++
    }
    return {
        changes: {from, to},
        scrollIntoView: true,
        userEvent: "delete.forward",
    }
}
