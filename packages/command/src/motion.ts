/**
 * Selection motion commands: by unit/word/line/page, line and document edges.
 */
import {EditorSelection, type EditorState, type Transaction} from "@arrisa/state"
import {type Command, Arrisa} from "./command"

function setSelection(selection: EditorSelection): Transaction.Spec {
    return {
        selection: selection,
        scrollIntoView: true,
        userEvent: "select",
    }
}

function ltrAtCursor(state: EditorState) {
    let block = state.sel.head.textblockParent
    return block ? state.textblockLTR(block.node) : state.textLTR
}

function isForward(dir: "left" | "right" | "forward" | "backward", state: EditorState) {
    return dir == "forward" ? true : dir == "backward" ? false : (dir == "right") == ltrAtCursor(state)
}

function asTextSel(sel: EditorSelection, forward: boolean): EditorSelection.Text {
    if (sel instanceof EditorSelection.Text) return sel
    let {from, to} = sel.replacementRange
    return forward ? EditorSelection.range(from, to) : EditorSelection.range(to, from)
}

function extendSel(base: EditorSelection, head: EditorSelection.Text) {
    return EditorSelection.range(base.anchor, head.head, head.headSide, head.goalColumn)
}

/**
 * Move one normal cursor step (or collapse a range to its bound when not
 * extending). May select a node when stepping across a selectable boundary.
 */
export const moveByUnit: Command.Pure<{dir: "left" | "right" | "forward" | "backward"; extend?: boolean}> = (
    {state},
    {dir, extend},
) => {
    let forward = isForward(dir, state),
        selection = asTextSel(state.selection, forward)
    if (!selection.empty && !extend) {
        let next = selection.normalCursorAtBound(state, forward)
        return next ? setSelection(next) : false
    } else {
        let next: EditorSelection | null = selection.nextNormalCursor(state, forward)
        if (!next) return false
        if (!extend)
            state.doc.iterate(Math.min(selection.head, next.head), Math.max(selection.head, next.head), (node, pos) => {
                if (node.isPlot) return !node.type.isolating
                if (node.type.isSelectable) next = EditorSelection.node(pos, node)
            })
        return setSelection(extend ? extendSel(selection, next as EditorSelection.Text) : next)
    }
}

/** Move by word boundary in the visual left/right direction. */
export const moveByWord: Command.Pure<{dir: "left" | "right"; extend?: boolean}> = ({state}, {dir, extend}) => {
    let forward = (dir == "right") == ltrAtCursor(state)
    let selection = asTextSel(state.selection, forward)
    let moved = selection.skipWord(state, forward)
    return moved ? setSelection(extend ? extendSel(selection, moved) : moved) : false
}

function nextVertical(editor: Arrisa, sel: EditorSelection, forward: boolean, distance?: number, allowNode?: boolean) {
    let next = editor.moveVertically(sel, forward, distance, allowNode)
    if (next) return next
    let end = (forward ? EditorSelection.atEnd : EditorSelection.atStart)(editor.state)
    return end.head == editor.state.selection.head ? null : end
}

/** Move one visual line up or down (view geometry). */
export const moveByLine: Command<{dir: "up" | "down"; extend?: boolean}> = (editor, {dir, extend}) => {
    let {state} = editor,
        {selection} = state,
        forward = dir == "down"
    if (state.selection instanceof EditorSelection.Node) {
        let next = !extend && state.selection.normalCursorAtBound(state, forward)
        if (next && !state.doc.resolve(next.head).parent.node.inlineContent)
            return setSelection(EditorSelection.cursor(next.head, next.headSide, state.selection.goalColumn))
        selection = EditorSelection.cursor(forward ? selection.to : selection.from, undefined, selection.goalColumn)
    } else {
        selection = asTextSel(state.selection, forward)
    }
    let moved = nextVertical(editor, selection, forward, undefined, !extend)
    return moved ? setSelection(extend ? extendSel(selection, moved as EditorSelection.Text) : moved) : false
}

function pageHeight(editor: Arrisa) {
    let marginTop = 0,
        marginBottom = 0
    for (let source of editor.state.facet(Arrisa.coveredMargins)) {
        let margins = source(editor)
        if (margins?.top) marginTop = Math.max(margins.top, marginTop)
        if (margins?.bottom) marginBottom = Math.max(margins.bottom, marginBottom)
    }
    return Math.max(
        10,
        Math.min(
            editor.scrollDOM.clientHeight - marginTop - marginBottom,
            (editor.dom.ownerDocument.defaultView || window).innerHeight,
        ) - 10,
    )
}

/** Move by approximately one page (viewport height minus covered margins). */
export const moveByPage: Command<{dir: "up" | "down"; extend?: boolean}> = (editor, {dir, extend}) => {
    let {state} = editor,
        {selection} = state,
        forward = dir == "down"
    let moved =
        selection.empty || extend
            ? nextVertical(editor, selection, forward, pageHeight(editor), !extend)
            : forward
              ? EditorSelection.cursor(selection.to, -1)
              : EditorSelection.cursor(selection.from, 1)
    return moved ? setSelection(extend ? extendSel(selection, moved as EditorSelection.Text) : moved) : false
}

/** Move to the start or end of the current visual line. */
export const moveToLineSide: Command<{
    dir: "left" | "right" | "forward" | "backward"
    extend?: boolean
}> = (editor, {dir, extend}) => {
    let pos = editor.moveToLineBoundary(editor.state.selection, isForward(dir, editor.state))
    return pos ? setSelection(extend ? extendSel(editor.state.selection, pos) : pos) : false
}

/** Move to the start or end of the textblock containing the head. */
export const moveToTextblockSide: Command<{
    dir: "left" | "right" | "forward" | "backward"
    extend?: boolean
}> = (editor, {dir, extend}) => {
    let {state} = editor,
        block = state.sel.head.textblockParent
    if (!block) return false
    let pos = isForward(dir, editor.state) ? EditorSelection.atEnd(state, block) : EditorSelection.atStart(state, block)
    return setSelection(extend ? extendSel(editor.state.selection, pos) : pos)
}

/** Move to the document start or end. */
export const moveToDocSide: Command.Pure<{side: "start" | "end"; extend?: boolean}> = (target, {side, extend}) => {
    let {state} = target
    let pos = side == "start" ? EditorSelection.atStart(state) : EditorSelection.atEnd(state)
    if (state.selection.empty && pos.head == state.selection.head) return false
    return setSelection(extend ? extendSel(state.selection, pos) : pos)
}

/** Select the entire document. */
export const selectAll: Command.Pure = ({state}) => {
    return {
        selection: EditorSelection.range(0, state.doc.length),
        userEvent: "select.all",
    }
}
