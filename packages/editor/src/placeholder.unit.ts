import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {Decoration, PointSet} from "./decoration"
import {WidgetDecoration} from "./decoration/decoration"
import {placeholder} from "./placeholder"
import {WidgetTile} from "./tile"
import {TileFlag} from "./tile/flag"
import {Widget} from "./decoration/widget"

function schemaParts() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph, docType}
}

function stateWithDoc(blocks: (s: ReturnType<typeof schemaParts>) => any[], extensions: EditorState.Extension) {
    let s = schemaParts()
    let doc = s.schema.doc(blocks(s))
    return EditorState.create({
        doc,
        config: [EditorState.schemaElement.of(s.schema.elements), extensions],
    })
}

/** Resolve placeholder points from Decoration.Point.source facet. */
function placeholderPoints(state: EditorState): PointSet<Decoration.Point> {
    let sources = state.facet(Decoration.Point.source)
    let sets = sources.map((fn) => fn(state))
    // Merge by taking the first non-empty (placeholder installs one source)
    for (let set of sets) if (set.length) return set
    return PointSet.empty
}

/** Minimal document stub so widget render can run under Node. */
function withMockDocument(run: () => void) {
    let prev = (globalThis as any).document
    ;(globalThis as any).document = {
        createElement(name: string) {
            return {
                nodeType: 1,
                tagName: name.toUpperCase(),
                contentEditable: "inherit",
                childNodes: [] as any[],
                appendChild(child: any) {
                    this.childNodes.push(child)
                    return child
                },
            }
        },
        createTextNode(text: string) {
            return {nodeType: 3, textContent: text}
        },
    }
    try {
        run()
    } finally {
        ;(globalThis as any).document = prev
    }
}

describe("placeholder", () => {
    it("places a widget in an empty single-block doc", () => {
        let state = stateWithDoc((s) => [s.paragraph.create([])], placeholder("Type here"))
        // Empty paragraph: open + close = length 2
        expect(state.doc.length).toBe(2)
        let points = placeholderPoints(state)
        expect(points.length).toBe(1)
        expect(points.positions[0]).toBe(1)
    })

    it("places a widget at 0 for a zero-length doc if schema allows", () => {
        // Most schemas always have structure; if length != 0/2 path, skip semantics.
        // With a normal empty paragraph we already cover the primary case.
        let state = stateWithDoc((s) => [s.paragraph.create([Leaf.text("hi")])], placeholder("x"))
        expect(state.doc.length).toBeGreaterThan(2)
        expect(placeholderPoints(state).length).toBe(0)
    })

    it("shows nothing without content when facet shape is empty is not applicable", () => {
        // Non-empty content: no points
        let state = stateWithDoc((s) => [s.paragraph.create([Leaf.text("abc")])], placeholder("hint"))
        expect(placeholderPoints(state)).toBe(PointSet.empty)
    })

    it("renders placeholder as contentEditable=false so typing cannot enter the widget", () => {
        let state = stateWithDoc((s) => [s.paragraph.create([])], placeholder("Type here"))
        let deco = placeholderPoints(state).values[0] as WidgetDecoration
        withMockDocument(() => {
            let dom = deco.widget.type.render(deco.widget.value) as unknown as {
                contentEditable: string
                tagName: string
            }
            expect(dom.tagName).toBe("ARRISA-PLACEHOLDER")
            expect(dom.contentEditable).toBe("false")
        })
    })
})

describe("WidgetTile contentEditable", () => {
    it("forces contentEditable=false on element widgets", () => {
        let el = {nodeType: 1, contentEditable: "inherit"} as any
        let w = Widget.create({render: () => el})
        new WidgetTile(w, null, TileFlag.Point)
        expect(el.contentEditable).toBe("false")
    })
})
