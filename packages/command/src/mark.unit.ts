import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {Alignment, Direction, Emphasis} from "@arrisa/types"
import {setAlignment, setDirection, toggleMark} from "./mark"
import {para, runPure, stateFromBlocks, testSchema} from "./test-helpers"

describe("toggleMark", () => {
    it("stores the mark on an empty cursor when not active", () => {
        let {state, bold} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let result = runPure(state, toggleMark, bold)
        expect(result.applied).toBe(true)
        let sel = result.state.selection
        expect(sel instanceof EditorSelection.Text).toBe(true)
        expect(bold.isInSet((sel as EditorSelection.Text).marks || [])).toBeTruthy()
    })

    it("adds the mark across a non-empty range", () => {
        let {state, bold} = stateFromBlocks((s) => [para(s, "hi")], EditorSelection.range(1, 3))
        let result = runPure(state, toggleMark, bold)
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter
        expect(text).toBeTruthy()
        expect(bold.isInSet(text!.tag.marks)).toBeTruthy()
    })

    it("removes the mark when the range is fully marked", () => {
        let s = testSchema()
        let doc = s.schema.doc([para(s, "hi", [s.bold])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(s.schema.elements)],
        })
        let result = runPure(state, toggleMark, s.bold)
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter
        expect(text).toBeTruthy()
        expect(s.bold.isInSet(text!.tag.marks)).toBeFalsy()
    })
})

function schemaWithAlignDir() {
    let paragraph = Plot.define("paragraph", {
        inlineContent: true,
        shape: {element: "p"},
        defaultBlock: true,
    })
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, Alignment, Direction, Emphasis])
    return {schema, paragraph, docType}
}

describe("setAlignment / setDirection", () => {
    it("returns false when Alignment is not in the schema", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], 1)
        expect(setAlignment({state}, "center")).toBe(false)
    })

    it("sets center alignment on a textblock", () => {
        let {schema, paragraph} = schemaWithAlignDir()
        let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, setAlignment, "center")
        expect(result.applied).toBe(true)
        let block = result.state.doc.content[0]
        expect(block.tag.mark(Alignment)).toBe("center")
    })

    it("sets direction on a textblock", () => {
        let {schema, paragraph} = schemaWithAlignDir()
        let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, setDirection, "rtl")
        expect(result.applied).toBe(true)
        let block = result.state.doc.content[0]
        expect(block.tag.mark(Direction)).toBe("rtl")
    })
})
