/**
 * Map a document position (+ association side) to a client rectangle for
 * caret drawing and scroll-into-view. Glyph boxes are always collapsed to a
 * zero-width caret edge based on text direction and association (CodeMirror
 * semantics): LTR + assoc>0 → left edge; LTR + assoc<0 → right edge.
 */
import type {Arrisa} from "../editor"
import {ltrAt} from "../tile/pos"
import type {TextTile} from "../tile/leaves"
import {textRange, singleRect, maxOffset} from "./dom"

export function coordsAtPos(editor: Arrisa, pos: number, assoc: -1 | 1): DOMRect {
    let tilePos = editor.docTile.resolve(pos, assoc)
    let {tile, offset} = tilePos
    if (tile.isText) {
        let textTile = tile as TextTile
        let len = textTile.text.length
        let from = Math.max(0, Math.min(offset, len))
        let to = from
        if (from < len && assoc > 0) {
            to = Math.min(len, from + 1)
        } else if (from > 0 && assoc < 0) {
            from = Math.max(0, from - 1)
            to = from + 1
        }
        let rect = singleRect(textRange(textTile.dom, from, Math.max(from, to)), assoc)
        return caretRectFromCharBox(rect, assoc, ltrAt(editor.state, pos, assoc))
    }

    let tagTile = tile
    if (tagTile.node && tagTile.node.isPlot && tagTile.node.type.orientation == "column") {
        let rect = (tagTile.dom as Element).getBoundingClientRect()
        return flattenH(rect, assoc < 0)
    }

    if (tile.dom.nodeType == 1) {
        let rect = (tile.dom as Element).getBoundingClientRect()
        let child =
            offset < tile.children.length
                ? tile.children[offset]
                : offset > 0
                  ? tile.children[offset - 1]
                  : null
        if (child && child.dom.nodeType == 1) {
            let childRect = (child.dom as Element).getBoundingClientRect()
            if (offset < tile.children.length) return flattenV(childRect, true)
            return flattenV(childRect, false)
        }
        return caretRectFromCharBox(rect, assoc, ltrAt(editor.state, pos, assoc))
    }

    if (tile.dom.nodeType == 3) {
        let len = maxOffset(tile.dom)
        let off = Math.max(0, Math.min(offset, len))
        let rect = singleRect(textRange(tile.dom as Text, off, Math.min(len, off + (assoc > 0 ? 1 : 0) || off)), assoc)
        return caretRectFromCharBox(rect, assoc, ltrAt(editor.state, pos, assoc))
    }

    return (editor.contentDOM as Element).getBoundingClientRect()
}

/**
 * Collapse a (possibly full-glyph) client rect to a zero-width caret edge.
 * Matches CodeMirror: left when `(ltr == (assoc > 0))`.
 */
export function caretRectFromCharBox(rect: DOMRect, assoc: -1 | 1, ltr: boolean): DOMRect {
    return flattenV(rect, ltr == assoc > 0)
}

function flattenV(rect: DOMRect, left: boolean) {
    return new DOMRect(left ? rect.left : rect.right, rect.top, 0, rect.bottom - rect.top)
}

function flattenH(rect: DOMRect, top: boolean) {
    return new DOMRect(rect.left, top ? rect.top : rect.bottom, rect.right - rect.left, 0)
}
