/**
 * Primary caret drawing: a DOM cursor layer over the scroller that is
 * positioned from document coords and blinks via CSS animation.
 *
 * Layout reads run on the DOM-read schedule; style writes on the write
 * schedule. Selection changes flip the animation name so the blink
 * restarts immediately.
 */
import {EditorState} from "@arrisa/state"
import type {Arrisa} from "../editor"

/** Facet controlling caret blink period in ms (combine: minimum, default 1200). */
export const cursorBlinkRate = EditorState.Facet.define<number, number>({
    combine: (inputs) => (inputs.length ? Math.min(...inputs) : 1200),
})

type CursorPos = {left: number; top: number; size: number; horiz: boolean} | null

/** Plugin class that owns the `arrisa-cursor-layer` element. */
export class CursorLayer {
    readonly layer: HTMLElement
    pos: CursorPos = null

    constructor(editor: Arrisa) {
        this.layer = editor.scrollDOM.appendChild(document.createElement("arrisa-cursor-layer"))
        this.positionCursor = this.positionCursor.bind(this)
        editor.scheduleDOMRead(this.positionCursor)
        setBlinkRate(editor.state, this.layer)
    }

    update(update: Arrisa.Update) {
        if (update.transactions.some((tr) => tr.selection))
            this.layer.style.animationName = this.layer.style.animationName == "arrisa-blink" ? "arrisa-blink2" : "arrisa-blink"
        if (update.state.facet(cursorBlinkRate) != update.startState.facet(cursorBlinkRate))
            setBlinkRate(update.state, this.layer)
        if (
            (update.docChanged || update.selectionSet || update.geometryChanged) &&
            (update.startState.selection.isCursor || update.state.selection.isCursor)
        )
            update.editor.scheduleDOMRead(this.positionCursor)
    }

    docUpdate(editor: Arrisa) {
        editor.scheduleDOMRead(this.positionCursor)
    }

    remove() {
        this.layer.remove()
    }

    positionCursor(editor: Arrisa) {
        let pos = cursorPos(editor),
            cur = this.pos
        if (!pos ? cur : !cur || cur.left != pos.left || cur.top != pos.top || cur.size != pos.size) {
            this.pos = pos
            editor.scheduleDOMWrite(() => {
                let cursor = this.layer.firstChild as HTMLElement | null
                if (!pos) {
                    if (cursor) cursor.remove()
                } else {
                    if (!cursor) cursor = this.layer.appendChild(document.createElement("arrisa-cursor"))
                    cursor.className = "arrisa-cursor-" + (pos.horiz ? "h" : "v")
                    cursor.style.top = pos.top + "px"
                    cursor.style.left = pos.left + "px"
                    cursor.style.width = pos.horiz ? pos.size + "px" : ""
                    cursor.style.height = pos.horiz ? "" : pos.size + "px"
                }
            })
        }
    }
}

const VertWidth = 30,
    VertGap = 5

/** Compute caret box relative to scrollDOM (plus scroll); null when selection is not a cursor. */
function cursorPos(editor: Arrisa): CursorPos {
    let {state} = editor
    if (!state.selection.isCursor) return null
    let {head, headSide} = state.selection
    let {left, right, top, bottom} = editor.coordsAtPos(head, headSide)
    let horiz = top == bottom,
        size = horiz ? right - left : bottom - top
    // Wide horizontal (line-gap) carets: clamp width and nudge toward the other side.
    if (horiz && size > VertWidth) {
        size = VertWidth
        if (!editor.state.textLTR) left = right - size
        let other = editor.coordsAtPos(head, headSide > 0 ? -1 : 1)
        if (other.top == other.bottom && other.top != top) {
            let move = Math.min(VertGap, Math.abs(other.top - top) / 2)
            top = bottom = top + move * (other.top < top ? -1 : 1)
        }
    }
    // Abspos origin is scrollDOM's padding edge; top/left do not include scroll.
    let scroller = editor.scrollDOM,
        origin = scroller.getBoundingClientRect()
    return {
        left: left - origin.left + scroller.scrollLeft,
        top: top - origin.top + scroller.scrollTop,
        size,
        horiz,
    }
}

function setBlinkRate(state: EditorState, dom: HTMLElement) {
    dom.style.animationDuration = state.facet(cursorBlinkRate) + "ms"
}
