/**
 * Map a document position (+ association side) to a client rectangle for
 * caret drawing and scroll-into-view. Glyph boxes are always collapsed to a
 * zero-width caret edge based on text direction and association (CodeMirror
 * semantics): LTR + assoc>0 → left edge; LTR + assoc<0 → right edge.
 */
import {Node as DocNode} from "@arrisa/doc"
import type {Arrisa} from "../editor"
import {ltrAt} from "../tile/pos"
import type {TextTile} from "../tile/leaves"
import type {Tile} from "../tile/tile"
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
        let gap = codeGapCaret(tagTile, offset, assoc)
        if (gap) return gap
        let rect = (tagTile.dom as Element).getBoundingClientRect()
        return flattenH(rect, assoc < 0)
    }

    if (tile.dom.nodeType == 1) {
        let rect = (tile.dom as Element).getBoundingClientRect()
        let atChild = offset < tile.children.length
        let child = atChild ? tile.children[offset] : offset > 0 ? tile.children[offset - 1] : null
        // A line break resolves to the code element beside the next text.
        // The element box is the whole block; the line is the text child.
        if (child?.isText) {
            let textTile = child as TextTile
            let len = textTile.text.length
            let from = 0
            let to = 0
            let side: -1 | 1 = 1
            if (atChild) {
                to = len ? 1 : 0
            } else {
                side = -1
                from = len ? len - 1 : 0
                to = len
            }
            let glyph = singleRect(textRange(textTile.dom, from, Math.max(from, to)), side)
            return caretRectFromCharBox(glyph, side, ltrAt(editor.state, pos, side))
        }
        if (child && child.dom.nodeType == 1) {
            let childRect = (child.dom as Element).getBoundingClientRect()
            if (atChild) return flattenV(childRect, true)
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

function isCodeTile(tile: Tile) {
    let node = tile.node
    return !!node && node.isPlot && node.type.hasRole(DocNode.Role.Code)
}

function firstLineHeight(el: Element) {
    let found: Text | null = null
    let walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let next = walker.nextNode()
    while (next) {
        if (next.nodeType == 3 && next.nodeValue) {
            found = next as Text
            break
        }
        next = walker.nextNode()
    }
    if (found && found.length) {
        let glyph = singleRect(textRange(found, 0, 1), 1)
        if (glyph.bottom > glyph.top) return glyph.bottom - glyph.top
    }
    let rect = el.getBoundingClientRect()
    return rect.height || 16
}

/**
 * A cursor sitting in the column gap just after a code block is the newline
 * outside that block. Draw a one-line vertical caret there, not a horizontal
 * bar across the whole column.
 */
function codeGapCaret(tile: Tile, offset: number, assoc: -1 | 1): DOMRect | null {
    let prev = offset > 0 ? tile.children[offset - 1] : null
    if (!prev || !isCodeTile(prev) || prev.dom.nodeType != 1) return null
    let codeEl = prev.dom as Element
    let box = codeEl.getBoundingClientRect()
    let height = firstLineHeight(codeEl)
    let ltr = getComputedStyle(codeEl).direction != "rtl"
    let x = ltr ? box.left : box.right
    let next = offset < tile.children.length ? tile.children[offset] : null
    if (assoc > 0 && next && next.dom.nodeType == 1) {
        let nextBox = (next.dom as Element).getBoundingClientRect()
        let nextLtr = getComputedStyle(next.dom as Element).direction != "rtl"
        return new DOMRect(nextLtr ? nextBox.left : nextBox.right, nextBox.top, 0, Math.min(height, nextBox.height || height))
    }
    let top = assoc < 0 ? Math.max(box.top, box.bottom - height) : box.bottom
    return new DOMRect(x, top, 0, height)
}
