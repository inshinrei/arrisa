/**
 * Pointer selection gestures: click/drag selection, primary-selection drag
 * detection, and edge auto-scroll while dragging.
 */
import {EditorSelection} from "@arrisa/state"
import type {Arrisa} from "../editor"
import {Tile, type CoordPos} from "../tile"
import {type DOMNode, scrollableParents, getSelection} from "../dom"
import browser from "../browser"
import {dragBehavior} from "./facets"

const dragScrollMargin = 6

function dist(a: MouseEvent, b: MouseEvent) {
    return Math.max(Math.abs(a.clientX - b.clientX), Math.abs(a.clientY - b.clientY))
}

function dragScrollSpeed(dist: number) {
    return Math.max(1, Math.floor(dist / 10))
}

/** Active mouse selection from mousedown until mouseup. */
export class MouseSelection {
    dragging: null | boolean
    extend: boolean
    lastEvent: MouseEvent
    scrollParents: {x?: HTMLElement; y?: HTMLElement}
    scrollSpeed = {x: 0, y: 0}
    scrolling = -1

    constructor(
        private editor: Arrisa,
        private startEvent: MouseEvent,
        private style: Arrisa.MouseSelectionStyle,
        private mustSelect: boolean,
    ) {
        this.lastEvent = startEvent
        this.scrollParents = scrollableParents(editor.contentDOM)
        let doc = editor.contentDOM.ownerDocument!
        doc.addEventListener("mousemove", (this.move = this.move.bind(this)))
        doc.addEventListener("mouseup", (this.up = this.up.bind(this)))

        this.extend = startEvent.shiftKey
        this.dragging = isInPrimarySelection(editor, startEvent) && startEvent.detail == 1 ? null : false
    }

    start(event: MouseEvent) {
        if (this.dragging === false) this.select(event)
    }

    move(event: MouseEvent) {
        if (event.buttons == 0) return this.disconnect()
        if (this.dragging || (this.dragging == null && dist(this.startEvent, event) < 10)) return
        this.select((this.lastEvent = event))

        let sx = 0,
            sy = 0
        let left = 0,
            top = 0,
            right = this.editor.win.innerWidth,
            bottom = this.editor.win.innerHeight
        if (this.scrollParents.x) ({left, right} = this.scrollParents.x.getBoundingClientRect())
        if (this.scrollParents.y) ({top, bottom} = this.scrollParents.y.getBoundingClientRect())
        let margins = this.editor.getScrollMargins()

        if (event.clientX - margins.left <= left + dragScrollMargin) sx = -dragScrollSpeed(left - event.clientX)
        else if (event.clientX + margins.right >= right - dragScrollMargin) sx = dragScrollSpeed(event.clientX - right)
        if (event.clientY - margins.top <= top + dragScrollMargin) sy = -dragScrollSpeed(top - event.clientY)
        else if (event.clientY + margins.bottom >= bottom - dragScrollMargin)
            sy = dragScrollSpeed(event.clientY - bottom)
        this.setScrollSpeed(sx, sy)
    }

    up(event: MouseEvent) {
        if (this.dragging == null) this.select(this.lastEvent)
        if (!this.dragging) event.preventDefault()
        this.disconnect()
    }

    disconnect() {
        this.setScrollSpeed(0, 0)
        let doc = this.editor.dom.ownerDocument
        doc.removeEventListener("mousemove", this.move)
        doc.removeEventListener("mouseup", this.up)
        this.editor.inputState.mouseSelection = this.editor.inputState.draggedContent = null
    }

    setScrollSpeed(sx: number, sy: number) {
        this.scrollSpeed = {x: sx, y: sy}
        if (sx || sy) {
            if (this.scrolling < 0) this.scrolling = setInterval(() => this.scroll(), 50)
        } else if (this.scrolling > -1) {
            clearInterval(this.scrolling)
            this.scrolling = -1
        }
    }

    scroll() {
        let {x, y} = this.scrollSpeed
        if (x && this.scrollParents.x) {
            this.scrollParents.x.scrollLeft += x
            x = 0
        }
        if (y && this.scrollParents.y) {
            this.scrollParents.y.scrollTop += y
            y = 0
        }
        if (x || y) this.editor.win.scrollBy(x, y)
        if (this.dragging === false) this.select(this.lastEvent)
    }

    select(event: MouseEvent) {
        let {editor} = this,
            selection = this.style.get(event, this.extend)
        if (this.mustSelect || !selection.eqPos(editor.state.selection))
            this.editor.dispatch({
                selection,
                userEvent: "select.pointer",
            })
        this.mustSelect = false
    }

    update(update: Arrisa.Update) {
        if (update.transactions.some((tr) => tr.isUserEvent("input.type"))) this.disconnect()
        else if (this.style.update(update)) setTimeout(() => this.select(this.lastEvent), 20)
    }
}

export function dragMovesSelection(editor: Arrisa, event: MouseEvent) {
    let facet = editor.state.facet(dragBehavior)
    return facet.length ? facet[0](event) : browser.mac ? !event.altKey : !event.ctrlKey
}

export function isInPrimarySelection(editor: Arrisa, event: MouseEvent) {
    let {selection} = editor.state
    if (selection.empty) return false

    let sel = getSelection(editor.root)
    if (!sel || sel.rangeCount == 0) return true
    let rects = sel.getRangeAt(0).getClientRects()
    for (let i = 0; i < rects.length; i++) {
        let rect = rects[i]
        if (
            rect.left <= event.clientX &&
            rect.right >= event.clientX &&
            rect.top <= event.clientY &&
            rect.bottom >= event.clientY
        )
            return true
    }
    return false
}

export function eventBelongsToEditor(editor: Arrisa, event: Event): boolean {
    if (!event.bubbles) return true
    if (event.defaultPrevented) return false
    for (let node = event.target as DOMNode | null, tile; node != editor.contentDOM; node = node.parentNode)
        if (!node || node.nodeType == 11 || ((tile = Tile.get(node)) && tile.handleEvent(event, editor))) return false
    return true
}

export function queryPos(editor: Arrisa, event: MouseEvent) {
    return editor.posAtCoords({x: event.clientX, y: event.clientY}) as CoordPos
}

export function rangeForClick(editor: Arrisa, pos: CoordPos, type: number): EditorSelection {
    if (type < 3 && pos.target != null) {
        let target = editor.state.doc.nodeAt(pos.target)
        if (target && target.isLeaf && target.type.isSelectable) return EditorSelection.node(pos.target, target)
    }
    if (type == 1) {
        return EditorSelection.near(editor.state, pos.pos, pos.side || -1)
    } else if (type == 2) {
        return editor.state.wordAt(pos.pos, pos.side || 1)
    } else {
        let cx = editor.state.doc.resolve(pos.pos),
            block = cx.textblockParent
        if (block) return EditorSelection.range(block.start, block.end)
        else return EditorSelection.near(editor.state, pos.pos, pos.side || -1)
    }
}

export function basicMouseSelection(editor: Arrisa, event: MouseEvent) {
    let start = queryPos(editor, event),
        type = event.detail
    let startSel = editor.state.selection
    return {
        update(update) {
            if (update.docChanged) {
                start = start.map(update.changes)
                startSel = startSel.map(update.changes, update.state)
            }
        },
        get(event, extend) {
            let cur = queryPos(editor, event),
                range = rangeForClick(editor, cur, type),
                {from, to} = range
            if (extend) {
                if (from < startSel.anchor)
                    return EditorSelection.range(startSel.anchor, from, from < to ? 1 : cur.side)
                else return EditorSelection.range(startSel.anchor, to, from < to ? -1 : cur.side)
            }
            if (start.pos != cur.pos) {
                let startRange = rangeForClick(editor, start, type)
                from = Math.min(startRange.from, from)
                to = Math.max(startRange.to, to)
            }
            return from == range.from && to == range.to ? range : EditorSelection.range(from, to, cur.side)
        },
    } as Arrisa.MouseSelectionStyle
}
