/**
 * Image size mark and interactive resize handle.
 *
 * {@link imageResizing} registers {@link ImageSize} and:
 * - **Drag handle** — hover decoration on resizable images; mousedown/move/up
 *   updates width live then commits the mark
 * - **Keys** — Ctrl-Alt-l / Ctrl-Cmd-l enlarge (~10%), Ctrl-Alt-k / Ctrl-Cmd-k shrink
 *
 * Requires a node selection on a type that allows {@link ImageSize}
 * (Image, Figure, CaptionedFigure).
 */
import {type Command} from "@arrisa/command"
import {Elt} from "@arrisa/doc"
import {Arrisa, Decoration, KeyBinding, PointSet} from "@arrisa/editor"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {ImageSize} from "@arrisa/types"

let resizeTheme = Arrisa.theme({
    ".arrisa-resize-hover": {
        display: "inline-block",
        lineHeight: "0.1",
        position: "relative",
    },
    ".arrisa-resize-handle": {
        position: "absolute",
        right: "1px",
        bottom: "1px",
        width: "min(60%, 20px)",
        height: "min(60%, 20px)",
    },
    ".arrisa-resize-handle-active": {
        cursor: "nwse-resize",
    },
})

let setResizing = Transaction.Effect.define<{target: number; resizing: number}>({
    map: (value, mapping) => {
        let newPos = mapping.mapPos(value.target, 1, "after")
        return newPos == null ? undefined : {target: newPos, resizing: value.resizing}
    },
})

let handleElt = Elt.mk("svg:svg", {class: "arrisa-resize-handle", viewBox: "0 0 20 20"}, [
    Elt.mk("svg:path", {d: "M20 0L0 20M20 5L5 20M20 10L10 20", stroke: "#000000aa", "stroke-width": "1.5"}),
    Elt.mk("svg:polygon", {points: "0,20 20,20 20,0", fill: "transparent", class: "arrisa-resize-handle-active"}),
])

let resizeWrapper = Decoration.Point.wrapper(Elt.mk("span", {class: "arrisa-resize-hover"}, [handleElt, 0]), {
    target: "img",
})

let resizeState = EditorState.Field.define<{target: number; resizing: number; deco: PointSet<Decoration.Point>}>({
    create: () => ({target: -1, resizing: -1, deco: PointSet.empty}),
    update: (value, tr) => {
        for (let e of tr.effects) {
            if (e.is(setResizing)) {
                let {target, resizing} = e.value
                if (target < 0) return {target: -1, resizing: -1, deco: PointSet.empty}
                let deco: [number, Decoration.Point][] = [[target, resizeWrapper]]
                if (resizing > -1)
                    deco.push([target, Decoration.Point.attributes({style: `width: ${resizing}px`}, {target: "img"})])
                return {target, resizing, deco: PointSet.create(deco)}
            }
        }
        return value.target < 0 || !tr.docChanged
            ? value
            : {target: value.target, resizing: value.resizing, deco: value.deco.map(tr.changes)}
    },
})

let MIN_SIZE = 10

function imageNode(editor: Arrisa, pos: number) {
    let dom = editor.nodeDOM(pos)!
    return dom.nodeName == "IMG" ? dom : dom.querySelector("img[src]")!
}

let resizeHandlers = [
    Arrisa.domEventHandler("mousedown", (event, editor) => {
        let resizing = editor.state.field(resizeState)
        if (resizing.target < 0) return
        for (let dom = event.target as Element; ;) {
            if (dom.classList.contains("arrisa-resize-handle-active")) break
            let next = dom.parentNode as Element | null
            if (!next || next == editor.contentDOM) return
            dom = next
        }
        let node = editor.state.doc.nodeAt(resizing.target)!
        let width = node.tag.mark(ImageSize) ?? imageNode(editor, resizing.target).getBoundingClientRect().width
        editor.dispatch({effects: setResizing.of({target: resizing.target, resizing: width})})
        event.preventDefault()
    }),
    Arrisa.domEventHandler("mousemove", (event, editor) => {
        let resizing = editor.state.field(resizeState)
        if (resizing.resizing > -1) {
            let dom = imageNode(editor, resizing.target)
            let width = event.clientX - dom.getBoundingClientRect().left
            if (width >= MIN_SIZE && Math.abs(width - resizing.resizing) >= 1)
                editor.dispatch({effects: setResizing.of({target: resizing.target, resizing: width})})
        } else {
            let elt = (event.target as HTMLElement).closest("img, .arrisa-resize-handle")
            let node = elt && editor.nodeFromDOM(elt)
            let target = node && editor.state.schema.markAllowed(ImageSize, node.node.type) ? node.pos : -1
            if (target != resizing.target) editor.dispatch({effects: setResizing.of({target, resizing: -1})})
        }
    }),
    Arrisa.domEventHandler("mouseup", (_event, editor) => {
        let resizing = editor.state.field(resizeState)
        if (resizing.resizing < 0) return
        editor.dispatch({
            effects: setResizing.of({target: resizing.target, resizing: -1}),
            changes: {from: resizing.target, add: ImageSize.of(Math.round(resizing.resizing))},
        })
    }),
]

/** ImageSize mark + keyboard resize + hover drag handle. */
export function imageResizing(): EditorState.Extension {
    return [EditorState.schemaElement.of(ImageSize), imageResizing.keyBindings, imageResizing.dragHandle]
}

export namespace imageResizing {
    /**
     * Resize the selected image by an absolute pixel delta or a relative factor.
     * @param by Amount in CSS pixels, or multiplier when `relative` is true.
     */
    export const resizeCommand =
        (by: number, relative = false): Command =>
        (editor) => {
            let {selection} = editor.state
            if (
                selection instanceof EditorSelection.Node &&
                editor.state.schema.markAllowed(ImageSize, selection.node.type)
            ) {
                let curWidth =
                    selection.node.mark(ImageSize) ??
                    imageNode(editor as Arrisa, editor.state.selection.from).getBoundingClientRect().width
                let newWidth = Math.max(MIN_SIZE, relative ? curWidth * by : curWidth + by)
                if (newWidth != curWidth) {
                    editor.dispatch({
                        changes: {from: editor.state.selection.from, add: ImageSize.of(newWidth)},
                        userEvent: "image.resize",
                    })
                    return true
                }
            }
            return false
        }

    let enlarge = 1.1
    export const keyBindings = [
        KeyBinding.of({key: "Ctrl-Alt-l", mac: "Ctrl-Cmd-l", run: resizeCommand(enlarge, true)}),
        KeyBinding.of({key: "Ctrl-Alt-k", mac: "Ctrl-Cmd-k", run: resizeCommand(1 / enlarge, true)}),
    ]

    /** Decoration + pointer handlers for the corner resize grip. */
    export const dragHandle: EditorState.Extension = [
        EditorState.prec.high(resizeHandlers),
        resizeState,
        Decoration.Point.source.of((s) => s.field(resizeState).deco),
        resizeTheme,
    ]
}

