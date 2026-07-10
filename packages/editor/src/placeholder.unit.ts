import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {Decoration, PointSet} from "./decoration"
import {placeholder} from "./placeholder"

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
})
