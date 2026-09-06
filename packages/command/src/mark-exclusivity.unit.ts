import {describe, expect, it} from "vitest"
import {Leaf, Mark, Plot, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {
    markAllowedByExclusivity,
    markExclusivity,
    markExclusivityPolicy,
    toggleMarkExclusive,
} from "./mark-exclusivity"
import {toggleMark} from "./mark"
import {runPure} from "./test-helpers"

function exclusiveSchema() {
    let paragraph = Plot.define("paragraph", {
        inlineContent: true,
        shape: {element: "p"},
        defaultBlock: true,
    })
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let em = Mark.define("em", {shape: {element: "em"}})
    let code = Mark.define("code", {shape: {element: "code"}})
    let strike = Mark.define("strike", {shape: {element: "s"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold, em, code, strike])
    return {schema, paragraph, bold, em, code, strike, docType}
}

function makeState(text: string, marks: Mark.Set | undefined, selection: EditorSelection, extensions: EditorState.Extension = []) {
    let s = exclusiveSchema()
    let doc = s.schema.doc([s.paragraph.create([Leaf.text(text, marks)])])
    let state = EditorState.create({
        doc,
        selection,
        config: [EditorState.schemaElement.of(s.schema.elements), extensions],
    })
    return {state, ...s}
}

describe("markExclusivity", () => {
    it("defaults to empty isolating policy", () => {
        let {state, bold} = makeState("hi", undefined, EditorSelection.cursor(1))
        expect(markExclusivityPolicy(state).isolating).toEqual([])
        expect(markAllowedByExclusivity(state, bold)).toBe(true)
    })

    it("allows free stacking without exclusivity", () => {
        let {state, bold, em} = makeState("hi", undefined, EditorSelection.range(1, 3))
        // put bold first
        let withBold = runPure(state, toggleMark, bold)
        expect(withBold.applied).toBe(true)
        let withBoth = runPure(withBold.state, toggleMark, em)
        expect(withBoth.applied).toBe(true)
        let text = withBoth.state.doc.resolve(1).nodeAfter!
        expect(bold.isInSet(text.tag.marks)).toBeTruthy()
        expect(em.isInSet(text.tag.marks)).toBeTruthy()
    })

    it("strips other marks when applying an isolating mark", () => {
        let s = exclusiveSchema()
        let doc = s.schema.doc([s.paragraph.create([Leaf.text("hi", [s.bold, s.em])])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [
                EditorState.schemaElement.of(s.schema.elements),
                markExclusivity({isolating: [s.code.type]}),
            ],
        })
        let result = runPure(state, toggleMarkExclusive, s.code)
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter!
        expect(s.code.isInSet(text.tag.marks)).toBeTruthy()
        expect(s.bold.isInSet(text.tag.marks)).toBeFalsy()
        expect(s.em.isInSet(text.tag.marks)).toBeFalsy()
    })

    it("strips isolating marks when applying a non-isolating mark", () => {
        let s = exclusiveSchema()
        let doc = s.schema.doc([s.paragraph.create([Leaf.text("hi", [s.code])])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [
                EditorState.schemaElement.of(s.schema.elements),
                markExclusivity({isolating: [s.code.type, s.strike.type]}),
            ],
        })
        let result = runPure(state, toggleMarkExclusive, s.bold)
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter!
        expect(s.bold.isInSet(text.tag.marks)).toBeTruthy()
        expect(s.code.isInSet(text.tag.marks)).toBeFalsy()
    })

    it("disables non-isolating marks when an isolating mark is active", () => {
        let s = exclusiveSchema()
        let doc = s.schema.doc([s.paragraph.create([Leaf.text("hi", [s.code])])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [
                EditorState.schemaElement.of(s.schema.elements),
                markExclusivity({isolating: [s.code.type]}),
            ],
        })
        expect(markAllowedByExclusivity(state, s.code)).toBe(true)
        expect(markAllowedByExclusivity(state, s.bold)).toBe(false)
    })

    it("disables isolating marks when other formats are active", () => {
        let s = exclusiveSchema()
        let doc = s.schema.doc([s.paragraph.create([Leaf.text("hi", [s.bold])])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [
                EditorState.schemaElement.of(s.schema.elements),
                markExclusivity({isolating: [s.code.type]}),
            ],
        })
        expect(markAllowedByExclusivity(state, s.code)).toBe(false)
        expect(markAllowedByExclusivity(state, s.bold)).toBe(true)
    })

    it("applies an isolating mark when given the Type", () => {
        let s = exclusiveSchema()
        let doc = s.schema.doc([s.paragraph.create([Leaf.text("hi", [s.bold])])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [
                EditorState.schemaElement.of(s.schema.elements),
                markExclusivity({isolating: [s.code.type]}),
            ],
        })
        let result = runPure(state, toggleMarkExclusive, s.code.type)
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter!
        expect(s.code.isInSet(text.tag.marks)).toBeTruthy()
        expect(s.bold.isInSet(text.tag.marks)).toBeFalsy()
    })
})
