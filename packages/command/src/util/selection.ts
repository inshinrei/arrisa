/**
 * Selection and mark-range helpers for commands.
 */
import {Mark, type Plot, type Pos} from "@arrisa/doc"
import type {EditorState} from "@arrisa/state"

/** Unique textblock plots covered by the current selection ranges. */
export function selectedTextblocks(state: EditorState) {
    let textblocks: Pos.Plot[] = [],
        lastBlock = -1
    for (let {from, to} of state.selection.ranges) {
        state.doc.iterate(from, to, (node, pos) => {
            if (node.isPlot && node.isTextblock && pos > lastBlock) {
                textblocks.push(state.doc.resolveNode(pos) as Pos.Plot)
                lastBlock = pos
            }
        })
    }
    return textblocks
}

/** Distinguish Mark vs Mark.Type without instanceof (duplicate @arrisa/doc copies). */
export function asType(mark: Mark | Mark.Type): Mark.Type {
    return "type" in mark && mark.type ? mark.type : (mark as Mark.Type)
}

export function asMark(mark: Mark | Mark.Type): Mark {
    return "type" in mark && mark.type ? (mark as Mark) : (mark as Mark.Type).default!
}

/**
 * Whether `mark` (or a mark of its type) is allowed somewhere in `from`–`to`
 * and is not already present on every mark-bearing node in that range.
 */
export function canAddMarkInRange(doc: Plot.Doc, from: number, to: number, mark: Mark | Mark.Type) {
    let found = false
    let instance = asMark(mark)
    let type = instance.type
    doc.iterate(from, to, (node) => {
        if (found || instance.isInSet(node.tag.marks)) return false
        if (doc.schema.markAllowed(type, node.type)) found = true
        return true
    })
    return found
}
