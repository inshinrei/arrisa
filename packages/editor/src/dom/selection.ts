/**
 * Sync browser selection with editor state, and implement vertical /
 * line-boundary cursor motion via coordinate probing.
 */
import {EditorSelection} from "@arrisa/state"
import {Pos, type Leaf} from "@arrisa/doc"
import type {Arrisa} from "../editor"
import {getSelection, isEquivalentPosition, type SelectionRange} from "./dom"

export function setDOMSelection(editor: Arrisa) {
    let {anchor, head, anchorSide, headSide} = editor.state.selection.domSelection
    let anchorDOM = editor.docTile.resolve(anchor, anchorSide)
    let headDOM = head == anchor ? anchorDOM : editor.docTile.resolve(head, headSide)
    let domSel = getSelection(editor.root)
    if (!domSel) return
    if (
        domSel.focusNode &&
        isEquivalentPosition(anchorDOM.dom, anchorDOM.offset, domSel.anchorNode!, domSel.anchorOffset) &&
        isEquivalentPosition(headDOM.dom, headDOM.offset, domSel.focusNode!, domSel.focusOffset)
    )
        return

    domSel.collapse(anchorDOM.dom, anchorDOM.offset)
    let failed = false
    if (anchor != head)
        try {
            domSel.extend(headDOM.dom, headDOM.offset)
        } catch (_) {
            failed = true
        }
    if (!failed) editor.observer.setSelectionRange(anchorDOM, headDOM)
}

export function readDOMSelection(editor: Arrisa, range: SelectionRange): EditorSelection {
    let anchor = editor.docTile.posFromDOM(range.anchorNode!, range.anchorOffset, -1)
    let head =
        range.anchorNode == range.focusNode && range.anchorOffset == range.focusOffset
            ? anchor
            : editor.docTile.posFromDOM(range.focusNode!, range.focusOffset, -1)
    return EditorSelection.range(editor.viewState.mapPosPending(anchor, 1), editor.viewState.mapPosPending(head, 1))
}

/** Pixel step when probing within a textblock for the next vertical caret line. */
const Y_STEP = 5

/**
 * Move the caret vertically, preserving goal column across lines/blocks.
 * When `selectNode` is true, may land on selectable leaf nodes.
 */
export function moveVertically(
    editor: Arrisa,
    start: EditorSelection,
    forward: boolean,
    distance: number = 0,
    selectNode = false,
): EditorSelection | null {
    let editorRect = editor.contentDOM.getBoundingClientRect()
    let coords = editor.coordsAtPos(start.head, start.headSide)
    let baseLTR = editor.state.textLTR
    let goalColumn = start.goalColumn ?? (baseLTR ? coords.left - editorRect.left : editorRect.right - coords.left)
    let x = baseLTR ? editorRect.left + goalColumn : editorRect.right - goalColumn
    let y = forward ? coords.bottom + distance : coords.top - distance
    for (let scan = start.head; ;) {
        let pos = editor.state.doc.resolve(scan),
            block = pos.textblockParent
        if (block) {
            let blockTile = editor.docTile.nodeTile(block.before)!
            let rect = (blockTile.dom as Element).getBoundingClientRect()
            if (forward ? y < rect.top : y > rect.bottom) y = forward ? rect.top : rect.bottom
            while (forward ? rect.bottom >= y : rect.top <= y) {
                let found = blockTile.posAtCoords(editor.state, x, y)
                if (!found.vertOutside && found.pos != start.head)
                    return EditorSelection.cursor(found.pos, found.side, goalColumn)
                y += forward ? Y_STEP : -Y_STEP
            }
            if (!block.parent) return null
            scan = forward ? block.after : block.before
        }

        let nextCursor = EditorSelection.cursor(scan).nextNormalCursor(editor.state, forward)
        if (!nextCursor) return null
        let nextNode = findTargetVertically(editor, scan, forward, x, selectNode)
        if (
            !nextNode ||
            ((forward ? nextCursor.head <= nextNode.before : nextCursor.head >= nextNode.after) &&
                editor.state.doc.resolve(nextCursor.head).depth < nextNode.depth)
        ) {
            let coords = editor.coordsAtPos(nextCursor.head, nextCursor.headSide)
            if (forward ? coords.bottom > y : coords.top < y)
                return EditorSelection.cursor(nextCursor.head, nextCursor.headSide, goalColumn)
            if (!nextNode) return null
        }
        if (nextNode instanceof Pos.Plot) {
            scan = forward ? nextNode.start : nextNode.end
        } else {
            let coords = editor.coordsForElement(nextNode.before)!
            if (forward ? coords.bottom > y : coords.top < y)
                return EditorSelection.node(nextNode.before, nextNode.node as Leaf, goalColumn)
            scan = forward ? nextNode.after : nextNode.before
        }
    }
}

function findTargetVertically(editor: Arrisa, from: number, forward: boolean, x: number, allowNode: boolean) {
    let {parent, index, pos} = editor.state.doc.resolve(from),
        entering = false
    for (;;) {
        if (
            (forward ? index == parent.node.content.length : !index) ||
            (parent.node.type.orientation == "row" && !entering)
        ) {
            if (!parent.parent) return null
            index = parent.index + (forward ? 1 : 0)
            pos = forward ? parent.after : parent.before
            parent = parent.parent
            entering = false
        } else {
            let next = parent.node.content[index - (forward ? 0 : 1)]
            let nextPos = pos - (forward ? 0 : next.length)
            if (next.isLeaf || next.type.isAtom) {
                if (allowNode && next.isLeaf && next.type.isSelectable)
                    return Pos.Node.create(parent, next, nextPos, index - (forward ? 0 : 1))
                index += forward ? 1 : -1
                pos += (forward ? 1 : -1) * next.length
                continue
            }
            let node = Pos.Plot.create(parent, next, nextPos, index - (forward ? 0 : 1))
            if (!next.inlineContent && next.type.orientation == "row") {
                let closest = -1,
                    closestPos = -1,
                    closestDist = -1
                for (let chPos = nextPos + 1, i = 0; i < next.content.length; i++) {
                    let ch = next.content[i]
                    let tile = editor.docTile.nodeTile(chPos)!
                    let rect = (tile.dom as Element).getBoundingClientRect()
                    let dist = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
                    if (closestDist < 0 || dist < closestDist) {
                        closestDist = dist
                        closest = i + (forward ? 0 : 1)
                        closestPos = chPos + (forward ? 0 : ch.length)
                    }
                    chPos += ch.length
                }
                parent = node
                index = closest
                pos = closestPos
                entering = true
            } else if (next.isTextblock) {
                return node
            } else {
                parent = node
                index = forward ? 0 : next.content.length
                pos += forward ? 1 : -1
            }
        }
    }
}

export function moveToLineBoundary(
    editor: Arrisa,
    start: EditorSelection,
    forward: boolean,
): EditorSelection.Text | null {
    let block = editor.state.doc.resolve(start.head).textblockParent
    if (!block) return null
    let startCoords = editor.coordsAtPos(start.head, start.headSide)
    let ltr = editor.state.textblockLTR(block.node)
    let y = (startCoords.top + startCoords.bottom) / 2,
        left = forward != ltr
    let {pos} = editor.posAtCoords({x: left ? -1e7 : 1e7, y})
    if (pos < block.start || pos > block.end) {
        let blockRect = (editor.docTile.nodeTile(block.before)!.dom as Element).getBoundingClientRect()
        pos = editor.posAtCoords({x: left ? blockRect.left : blockRect.right, y}).pos
    }
    return EditorSelection.cursor(pos, forward ? -1 : 1)
}
