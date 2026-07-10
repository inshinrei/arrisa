import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorState} from "./index"
import {EditorSelection} from "../selection"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph, docType}
}

function makeState(text = "hello", extensions: EditorState.Extension = []) {
    let {schema, paragraph} = basicSchema()
    let doc = schema.doc([paragraph.create([Leaf.text(text)])])
    let state = EditorState.create({
        doc,
        config: [EditorState.schemaElement.of(schema.elements), extensions],
    })
    return {state, doc, schema, paragraph}
}

describe("EditorState.create", () => {
    it("builds a state with schema, doc, and default selection", () => {
        let {state, doc} = makeState("hi")
        expect(state.doc.eq(doc)).toBe(true)
        expect(state.schema).toBe(doc.schema)
        expect(state.selection.empty).toBe(true)
        expect(state.selection.from).toBeGreaterThanOrEqual(0)
        expect(state.selection.from).toBeLessThanOrEqual(doc.length)
    })

    it("accepts an explicit text selection", () => {
        let {schema, paragraph} = basicSchema()
        let doc = schema.doc([paragraph.create([Leaf.text("ab")])])
        let state = EditorState.create({
            doc,
            selection: {anchor: 1, head: 2},
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(state.selection.from).toBe(1)
        expect(state.selection.to).toBe(2)
    })

    it("throws without a schema source", () => {
        expect(() => EditorState.create({})).toThrow(/schema/i)
    })
})

describe("Field", () => {
    it("creates and updates field values on transactions", () => {
        let count = EditorState.Field.define<number>({
            create: () => 0,
            update: (v, tr) => (tr.docChanged ? v + 1 : v),
        })
        let {state} = makeState("x", count)
        expect(state.field(count)).toBe(0)
        let tr = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("!")])},
        })
        expect(tr.state.field(count)).toBe(1)
        let selOnly = tr.state.update({selection: {anchor: 1, head: 1}})
        expect(selOnly.state.field(count)).toBe(1)
    })

    it("returns undefined when require is false and field is absent", () => {
        let missing = EditorState.Field.define<number>({
            create: () => 1,
            update: (v) => v,
        })
        let {state} = makeState()
        expect(state.field(missing, false)).toBeUndefined()
        expect(() => state.field(missing)).toThrow(/Field is not present/)
    })
})

describe("Facet", () => {
    it("combines static facet values", () => {
        let tag = EditorState.Facet.define<string, string>({
            combine: (v) => v.join(","),
            static: true,
        })
        let {state} = makeState("x", [tag.of("a"), tag.of("b")])
        expect(state.facet(tag)).toBe("a,b")
    })

    it("recomputes dynamic facets when doc changes", () => {
        let len = EditorState.Facet.define<number, number>({
            combine: (v) => (v.length ? v[0] : 0),
        })
        let {state} = makeState("ab", len.compute((s) => s.doc.textContent().length))
        expect(state.facet(len)).toBe(2)
        let tr = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])},
        })
        expect(tr.state.facet(len)).toBe(3)
    })

    it("exposes readOnly from the built-in facet", () => {
        let {state} = makeState("x", EditorState.readOnly.of(true))
        expect(state.readOnly).toBe(true)
        expect(makeState().state.readOnly).toBe(false)
    })
})

describe("reconfigure / compartment / appendConfig", () => {
    it("reconfigures via EditorState.reconfigure", () => {
        let flag = EditorState.Facet.define<boolean, boolean>({
            combine: (v) => (v.length ? v[0] : false),
            static: true,
        })
        let {schema, paragraph} = basicSchema()
        let doc = schema.doc([paragraph.create([Leaf.text("x")])])
        let base = [EditorState.schemaElement.of(schema.elements), flag.of(false)]
        let state = EditorState.create({doc, config: base})
        expect(state.facet(flag)).toBe(false)
        let tr = state.update({
            effects: EditorState.reconfigure.of([EditorState.schemaElement.of(schema.elements), flag.of(true)]),
        })
        expect(tr.reconfigured).toBe(true)
        expect(tr.state.facet(flag)).toBe(true)
    })

    it("swaps compartment content", () => {
        let flag = EditorState.Facet.define<string, string>({
            combine: (v) => (v.length ? v[0] : ""),
            static: true,
        })
        let compartment = EditorState.Compartment.define()
        let {schema, paragraph} = basicSchema()
        let doc = schema.doc([paragraph.create([Leaf.text("x")])])
        let state = EditorState.create({
            doc,
            config: [EditorState.schemaElement.of(schema.elements), compartment.of(flag.of("a"))],
        })
        expect(state.facet(flag)).toBe("a")
        let next = flag.of("b")
        let tr = state.update({effects: compartment.reconfigure(next)})
        expect(tr.reconfigured).toBe(true)
        expect(tr.state.facet(flag)).toBe("b")
        expect(compartment.get(tr.state)).toBe(next)
    })

    it("appends config via appendConfig effect", () => {
        let flag = EditorState.Facet.define<boolean, boolean>({
            combine: (v) => (v.length ? v[0] : false),
            static: true,
        })
        let {state} = makeState("x")
        expect(state.facet(flag)).toBe(false)
        let tr = state.update({effects: EditorState.appendConfig.of(flag.of(true))})
        expect(tr.state.facet(flag)).toBe(true)
    })
})

describe("toJSON / fromJSON", () => {
    it("round-trips doc, selection, and a serializable field", () => {
        let counter = EditorState.Field.define<number>({
            create: () => 7,
            update: (v) => v,
            toJSON: (v) => v,
            fromJSON: (j) => j as number,
        })
        let {schema, paragraph} = basicSchema()
        let doc = schema.doc([paragraph.create([Leaf.text("xy")])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(2),
            config: [EditorState.schemaElement.of(schema.elements), counter],
        })
        let json = state.toJSON({counter})
        expect(json.counter).toBe(7)
        let restored = EditorState.fromJSON(json, EditorState.schemaElement.of(schema.elements), {counter})
        expect(restored.doc.textContent()).toBe("xy")
        expect(restored.selection.from).toBe(2)
        expect(restored.field(counter)).toBe(7)
    })
})

describe("wordAt", () => {
    it("expands to the surrounding word", () => {
        let {state} = makeState("hello world")
        let w = state.wordAt(3)
        expect(w.from).toBe(1)
        expect(w.to).toBe(6)
    })
})

describe("update applies document changes", () => {
    it("produces a new doc via tr.state", () => {
        let {state, doc} = makeState("hi")
        let tr = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])},
            userEvent: "input.type",
        })
        expect(tr.docChanged).toBe(true)
        expect(tr.newDoc.textContent()).toBe("Xhi")
        expect(tr.state.doc.textContent()).toBe("Xhi")
        expect(tr.startState.doc.eq(doc)).toBe(true)
        // smoke: ChangeSet empty on selection-only
        let noDoc = state.update({selection: {anchor: 1, head: 2}})
        expect(noDoc.docChanged).toBe(false)
        expect(noDoc.changes.empty).toBe(true)
        expect(ChangeSet.empty(doc.length).empty).toBe(true)
    })
})
