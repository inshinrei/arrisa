/**
 * Inline and block mark commands: toggle styles, alignment, direction,
 * clear formatting, and apply/remove links.
 */
import {type ChangeSet, Mark} from "@arrisa/doc"
import {EditorSelection, type EditorState} from "@arrisa/state"
import {Alignment, Direction, Emphasis, Link, Strong, Underline, sanitizeLinkHref} from "@arrisa/types"
import {type Command} from "./command"
import {asMark, canAddMarkInRange, selectedTextblocks} from "./util/selection"

/**
 * Toggle `mark` on the selection. Empty cursors update stored marks; ranges
 * add the mark when any gap allows it, otherwise remove it.
 */
export const toggleMark: Command.Pure<Mark | Mark.Type> = ({state}, mark) => {
    let instance = asMark(mark)
    let {selection, doc} = state
    if (selection instanceof EditorSelection.Text && selection.empty) {
        let selMarks = selection.marks || state.sel.head.marks(),
            add = !instance.isInSet(selMarks)
        let newMarks = add ? instance.addToSet(selMarks) : instance.removeFromSet(selMarks)
        return {
            selection: EditorSelection.Text.create({
                anchor: selection.anchor,
                headSide: selection.headSide,
                goalColumn: selection.goalColumn,
                marks: newMarks,
            }),
            userEvent: add ? "mark.add" : "mark.remove",
        }
    } else if (selection.ranges.some((r) => canAddMarkInRange(doc, r.from, r.to, instance))) {
        return {
            changes: selection.ranges.map((r) => ({from: r.from, to: r.to, add: instance})),
            userEvent: "mark.add",
        }
    } else {
        return {
            changes: selection.ranges.map((r) => ({from: r.from, to: r.to, remove: instance})),
            userEvent: "mark.remove",
        }
    }
}

export const toggleEmphasis: Command.Pure = (target) => toggleMark(target, Emphasis)

export const toggleStrong: Command.Pure = (target) => toggleMark(target, Strong)

export const toggleUnderline: Command.Pure = (target) => toggleMark(target, Underline)

/**
 * Set text-align on selected textblocks. `"start"` / matching physical
 * left-or-right for LTR/RTL clears the mark (default alignment).
 */
export const setAlignment: Command.Pure<null | "start" | "end" | "center" | "left" | "right"> = (
    {state},
    align,
) => {
    let {schema} = state.doc
    if (!schema.has(Alignment)) return false
    if (align == "start") align = null
    if (align == "left" || align == "right") align = ltrAtCursor(state) == (align == "left") ? null : "end"
    let changes: ChangeSet.Spec[] = []
    for (let block of selectedTextblocks(state)) {
        let cur = block.node.tag.mark(Alignment)
        if (cur != align && schema.markAllowed(Alignment, block.node.type))
            changes.push(
                align
                    ? {from: block.before, add: Alignment.of(align)}
                    : {from: block.before, remove: Alignment.of(cur!)},
            )
    }
    if (!changes.length) return false
    return {
        changes,
        userEvent: "mark.set.alignment",
    }
}

/** Set `dir` on selected textblocks (`null` clears). Requires schema Direction mark. */
export const setDirection: Command.Pure<null | "ltr" | "rtl" | "auto"> = ({state}, dir) => {
    let {schema} = state.doc
    if (!schema.has(Direction)) return false
    let changes: ChangeSet.Spec[] = []
    for (let block of selectedTextblocks(state)) {
        let cur = block.node.tag.mark(Direction)
        if (cur != dir && schema.markAllowed(Direction, block.node.type))
            changes.push(
                dir ? {from: block.before, add: Direction.of(dir)} : {from: block.before, remove: Direction.of(cur!)},
            )
    }
    if (!changes.length) return false
    return {
        changes,
        userEvent: "mark.set.direction",
    }
}

function ltrAtCursor(state: EditorState) {
    let block = state.sel.head.textblockParent
    return block ? state.textblockLTR(block.node) : state.textLTR
}

/**
 * Strip stored marks at an empty cursor, or every mark on nodes in the
 * selection ranges. Does not unwrap blocks.
 */
export const clearFormatting: Command.Pure = ({state}) => {
    let {selection, doc} = state
    if (selection instanceof EditorSelection.Text && selection.empty) {
        let selMarks = selection.marks || state.sel.head.marks()
        if (!selMarks.length) return false
        return {
            selection: EditorSelection.Text.create({
                anchor: selection.anchor,
                headSide: selection.headSide,
                goalColumn: selection.goalColumn,
                marks: Mark.none,
            }),
            userEvent: "mark.remove",
        }
    }
    let changes: ChangeSet.Spec[] = []
    for (let {from, to} of selection.ranges)
        doc.iterate(from, to, (node, pos) => {
            for (let mark of node.marks) changes.push({from: pos, to: pos + node.length, remove: mark})
        })
    if (!changes.length) return false
    return {changes, userEvent: "mark.remove"}
}

/**
 * Add a sanitized {@link Link} mark on a non-empty selection. Returns `false`
 * for empty selections or hrefs rejected by {@link sanitizeLinkHref}.
 */
export const applyLink: Command.Pure<string> = ({state}, href) => {
    let {selection} = state
    let safe = sanitizeLinkHref(href)
    if (!safe || selection.empty) return false
    return {
        changes: selection.ranges.map((r) => ({from: r.from, to: r.to, add: Link.of(safe)})),
        userEvent: "mark.add",
    }
}

/** Remove {@link Link} marks under the selection. Returns `false` when none. */
export const removeLinks: Command.Pure = ({state}) => {
    let {selection, doc} = state
    let remove: ChangeSet.Spec[] = []
    for (let {from, to} of selection.ranges)
        doc.iterate(from, to, (node, pos) => {
            let has = Link.isInSet(node.marks)
            if (has) remove.push({from: pos, to: pos + node.length, remove: has})
        })
    if (!remove.length) return false
    return {changes: remove, userEvent: "mark.remove"}
}
