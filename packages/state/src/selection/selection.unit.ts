import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorSelection} from "./selection"
import {EditorState} from "../state"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph, docType}
}

function inlineSchema() {
    let docType = Plot.defineDoc({inlineContent: true})
    let schema = Schema.define([docType])
    return {schema, docType}
}

describe("EditorSelection factories", () => {
    it("cursor / range expose from-to, empty, isCursor", () => {
        let c = EditorSelection.cursor(3, -1)
        expect(c.empty).toBe(true)
        expect(c.isCursor).toBe(true)
        expect(c.from).toBe(3)
        expect(c.to).toBe(3)
        expect(c.headSide).toBe(-1)

        let r = EditorSelection.range(2, 5)
        expect(r.empty).toBe(false)
        expect(r.isCursor).toBe(false)
        expect(r.from).toBe(2)
        expect(r.to).toBe(5)
        expect(r.ranges).toEqual([r])
    })

    it("eqPos ignores type-specific fields", () => {
        let a = EditorSelection.cursor(2)
        let b = EditorSelection.range(2, 2, -1)
        expect(a.eqPos(b)).toBe(true)
        expect(a.eq(b)).toBe(false) // different headSide default
    })
})

describe("EditorSelection.check / JSON", () => {
    let {schema, paragraph} = basicSchema()

    it("check rejects out-of-range selections", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hi")])])
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(() => EditorSelection.cursor(0).check(state.config, d)).not.toThrow()
        expect(() => EditorSelection.cursor(d.length + 1).check(state.config, d)).toThrow(/out of document range/)
    })

    it("fromJSON rejects unknown type tags", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hi")])])
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(() =>
            EditorSelection.fromJSON({doc: d, config: state.config}, {type: "nope", anchor: 0}),
        ).toThrow(/Unknown selection type/)
    })

    it("text cursor JSON omits head when empty", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hi")])])
        let state = EditorState.create({
            doc: d,
            selection: EditorSelection.cursor(1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let json = state.selection.toJSON(state) as any
        expect(json.type).toBe("text")
        expect(json.anchor).toBe(1)
        expect(json.head).toBeUndefined()
    })
})

describe("EditorSelection.atStart / atEnd", () => {
    it("places cursors at ends of a block document", () => {
        let {schema, paragraph} = basicSchema()
        let d = schema.doc([
            paragraph.create([Leaf.text("ab")]),
            paragraph.create([Leaf.text("cd")]),
        ])
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let cx = {doc: d, config: state.config}
        let start = EditorSelection.atStart(cx)
        let end = EditorSelection.atEnd(cx)
        expect(start.isCursor).toBe(true)
        expect(end.isCursor).toBe(true)
        expect(start.from).toBeLessThan(end.from)
        // first text char is at 1, last text ends before close of second p
        expect(start.from).toBe(1)
        expect(end.from).toBe(d.length - 1)
    })

    it("works for inline-only documents", () => {
        let {schema} = inlineSchema()
        let d = schema.doc([Leaf.text("xyz")])
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let cx = {doc: d, config: state.config}
        expect(EditorSelection.atStart(cx).from).toBe(0)
        expect(EditorSelection.atEnd(cx).from).toBe(3)
    })
})
