import {describe, expect, it} from "vitest"
import {Leaf, Mark, Plot, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {Alignment, Direction, Emphasis, Link, Strong, sanitizeLinkHref} from "@arrisa/types"
import {applyLink, clearFormatting, removeLinks, setAlignment, setDirection, toggleMark} from "./mark"
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

describe("clearFormatting", () => {
    it("clears stored marks on an empty cursor", () => {
        let {state, bold} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let marked = runPure(state, toggleMark, bold)
        expect(bold.isInSet((marked.state.selection as EditorSelection.Text).marks || [])).toBeTruthy()
        let cleared = runPure(marked.state, clearFormatting)
        expect(cleared.applied).toBe(true)
        let marks = (cleared.state.selection as EditorSelection.Text).marks
        expect(!marks || marks.length == 0 || marks === Mark.none).toBe(true)
    })

    it("removes marks across a range and does not unwrap blocks", () => {
        let s = testSchema()
        let doc = s.schema.doc([para(s, "hi", [s.bold])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(s.schema.elements)],
        })
        let result = runPure(state, clearFormatting)
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter
        expect(s.bold.isInSet(text!.tag.marks)).toBeFalsy()
        expect(result.state.doc.firstChild!.type).toBe(s.paragraph.type)
    })

    it("returns false when there is nothing to clear", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], EditorSelection.range(1, 3))
        expect(clearFormatting({state}, null)).toBe(false)
    })
})

function schemaWithLink() {
    let paragraph = Plot.define("paragraph", {
        inlineContent: true,
        shape: {element: "p"},
        defaultBlock: true,
    })
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, Link, Strong])
    return {schema, paragraph}
}

describe("applyLink / removeLinks", () => {
    it("adds a sanitized link on a range", () => {
        let {schema, paragraph} = schemaWithLink()
        let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, applyLink, "https://example.com")
        expect(result.applied).toBe(true)
        let text = result.state.doc.resolve(1).nodeAfter
        expect(Link.isInSet(text!.tag.marks)?.value).toBe("https://example.com")
    })

    it("rejects javascript hrefs and empty selections", () => {
        let {schema, paragraph} = schemaWithLink()
        let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
        let ranged = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(applyLink({state: ranged}, "javascript:alert(1)")).toBe(false)
        let cursor = EditorState.create({
            doc,
            selection: EditorSelection.cursor(1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(applyLink({state: cursor}, "https://example.com")).toBe(false)
        expect(sanitizeLinkHref("javascript:alert(1)")).toBeNull()
    })

    it("removeLinks strips Link marks and returns false when none", () => {
        let {schema, paragraph} = schemaWithLink()
        let doc = schema.doc([paragraph.create([Leaf.text("hi", [Link.of("https://example.com")])])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.range(1, 3),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, removeLinks)
        expect(result.applied).toBe(true)
        expect(Link.isInSet(result.state.doc.resolve(1).nodeAfter!.tag.marks)).toBeFalsy()
        expect(removeLinks({state: result.state}, null)).toBe(false)
    })
})
