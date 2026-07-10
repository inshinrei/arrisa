/**
 * Drop-cursor: a caret shown under the pointer while dragging over the editor.
 *
 * Install with {@link dropCursor}. A state field holds `{pos, side}` (mapped
 * through document changes). DOM handlers update the field on dragover /
 * clear it on leave, end, and drop. A plugin measures coords and positions
 * an `<arrisa-dropcursor>` element inside the scroll DOM.
 */
import {EditorState, Transaction} from "@arrisa/state"
import {Arrisa} from "./editor"
import {getScale} from "./dom"

const setDropPos = Transaction.Effect.define<{pos: number; side: -1 | 1} | null>({
    map(pos, changes) {
        if (pos == null || changes.empty) return pos
        let mapped = changes.mapPos(pos.pos, pos.side, "around")
        return mapped == null ? null : {pos: mapped, side: pos.side}
    },
})

const dropCursorPos = EditorState.Field.define<{pos: number; side: -1 | 1} | null>({
    create() {
        return null
    },
    update(pos, tr) {
        for (let e of tr.effects) if (e.is(setDropPos)) return e.value
        if (pos && tr.docChanged) {
            let mapped = tr.changes.mapPos(pos.pos, pos.side, "around")
            return mapped == null ? null : {pos: mapped, side: pos.side}
        }
        return pos
    },
})

function setDropPosValue(editor: Arrisa, pos: {pos: number; side: -1 | 1} | null) {
    if (editor.state.field(dropCursorPos) != pos) editor.dispatch({effects: setDropPos.of(pos)})
}

const drawDropCursor = Arrisa.Plugin.fromClass(
    class {
        cursor: HTMLElement | null = null
        measure = () => this.draw()

        constructor(readonly editor: Arrisa) {
            this.draw = this.draw.bind(this)
        }

        update(update: Arrisa.Update) {
            let pos = update.state.field(dropCursorPos)
            let old = update.startState.field(dropCursorPos)
            if (pos != old || (pos && (update.docChanged || update.geometryChanged))) {
                if (pos) update.editor.scheduleDOMRead(this.measure)
                else this.clear()
            }
        }

        draw() {
            let editor = this.editor
            let pos = editor.state.field(dropCursorPos)
            if (!pos) return this.clear()
            let rect = editor.coordsAtPos(pos.pos, pos.side)
            let base = editor.scrollDOM.getBoundingClientRect()
            let scale = getScale(editor.scrollDOM, base)
            let left = (rect.left - base.left) / scale.scaleX
            let top = (rect.top - base.top) / scale.scaleY
            let horiz = rect.top == rect.bottom
            editor.scheduleDOMWrite(() => {
                if (!this.cursor) {
                    this.cursor = editor.scrollDOM.appendChild(document.createElement("arrisa-dropcursor"))
                }
                this.cursor.className = horiz ? "arrisa-horizontal" : "arrisa-vertical"
                this.cursor.style.left = left + "px"
                this.cursor.style.top = top + "px"
                if (horiz) {
                    this.cursor.style.width = Math.max(1, (rect.right - rect.left) / scale.scaleX) + "px"
                    this.cursor.style.height = ""
                } else {
                    this.cursor.style.height = Math.max(1, (rect.bottom - rect.top) / scale.scaleY) + "px"
                    this.cursor.style.width = ""
                }
            })
        }

        clear() {
            if (this.cursor) {
                this.cursor.remove()
                this.cursor = null
            }
        }

        remove() {
            this.clear()
        }
    },
    () => [
        dropCursorPos,
        Arrisa.domEventHandler("dragover", (event, editor) => {
            let pos = editor.posAtCoords({x: event.clientX, y: event.clientY})
            setDropPosValue(editor, pos)
            return false
        }),
        Arrisa.domEventHandler("dragleave", (event, editor) => {
            if (event.target == editor.contentDOM || !editor.contentDOM.contains(event.relatedTarget as Node))
                setDropPosValue(editor, null)
            return false
        }),
        Arrisa.domEventHandler("dragend", (_event, editor) => {
            setDropPosValue(editor, null)
            return false
        }),
        Arrisa.domEventHandler("drop", (_event, editor) => {
            setDropPosValue(editor, null)
            return false
        }),
    ],
)

/** Extension that enables the drop cursor field and drawing plugin. */
export function dropCursor(): EditorState.Extension {
    return [dropCursorPos, drawDropCursor]
}
