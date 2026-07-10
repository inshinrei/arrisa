/**
 * Empty-document placeholder widget.
 *
 * Shows a point decoration when the doc is empty (pos 0) or is a single empty
 * block (pos 1). Content is a string (as a text node) or a factory returning
 * an Element. The widget is not drawn when the doc has real content.
 */
import {EditorState} from "@arrisa/state"
import {Decoration, Widget, PointSet} from "./decoration"

const placeholderWidget = Widget.define<() => Element | Text>({
    render(value) {
        let elt = document.createElement("arrisa-placeholder")
        elt.appendChild(value())
        return elt
    },
})

const placeholderShape = EditorState.Facet.define<() => Element | Text>()

function showPlaceholder(state: EditorState): PointSet<Decoration.Point> {
    let pos = -1
    if (state.doc.length == 0) pos = 0
    else if (state.doc.length == 2 && state.doc.firstChild!.isPlot) pos = 1
    else return PointSet.empty
    let shape = state.facet(placeholderShape)
    if (!shape.length) return PointSet.empty
    return PointSet.create([[pos, Decoration.Point.widget(placeholderWidget.of(shape[0]), {side: 1})]])
}

const placeholderField = EditorState.Field.define<PointSet<Decoration.Point>>({
    create(state) {
        return showPlaceholder(state)
    },
    update(deco, tr) {
        return !tr.docChanged ? deco : showPlaceholder(tr.state)
    },
    provide: (f) => Decoration.Point.source.of((s) => s.field(f)),
})

/** Placeholder extension: `content` is either a string or an element factory. */
export function placeholder(content: string | (() => Element)): EditorState.Extension {
    return [
        placeholderShape.of(typeof content == "string" ? () => document.createTextNode(content) : content),
        placeholderField,
    ]
}
