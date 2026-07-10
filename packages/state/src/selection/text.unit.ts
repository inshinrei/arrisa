import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Mark, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorSelection} from "./selection"
import {Text} from "./text"
import {EditorState} from "../state"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold])
    return {schema, paragraph, bold, docType}
}

function doc(schema: Schema, paragraph: Plot.Tag, text: string) {
    return schema.doc([paragraph.create([Leaf.text(text)])])
}

function cx(d: ReturnType<typeof doc>) {
    let state = EditorState.create({
        doc: d,
        config: [EditorState.schemaElement.of(d.schema.elements)],
    })
    return {doc: d, config: state.config}
}

describe("Text.create / properties", () => {
    it("creates cursors and ranges with default headSide", () => {
        let cur = Text.create({anchor: 3})
        expect(cur.empty).toBe(true)
        expect(cur.anchor).toBe(3)
        expect(cur.head).toBe(3)
        expect(cur.headSide).toBe(1)

        let forward = Text.create({anchor: 1, head: 4})
        expect(forward.from).toBe(1)
        expect(forward.to).toBe(4)
        expect(forward.headSide).toBe(-1)
        expect(forward.empty).toBe(false)

        let reverse = Text.create({anchor: 4, head: 1})
        expect(reverse.from).toBe(1)
        expect(reverse.to).toBe(4)
        expect(reverse.anchor).toBe(4)
        expect(reverse.head).toBe(1)
        expect(reverse.headSide).toBe(1)
    })

    it("honors explicit headSide and marks", () => {
        let {bold} = basicSchema()
        let t = Text.create({anchor: 2, head: 2, headSide: -1, marks: [bold]})
        expect(t.headSide).toBe(-1)
        expect(t.marks).toEqual([bold])
        expect(t.anchorSide).toBe(-1)
    })
})

describe("Text.map", () => {
    let {schema, paragraph} = basicSchema()

    it("maps an empty cursor with assoc", () => {
        let d = doc(schema, paragraph, "hello")
        // replace "ell" (2..5) with "i"
        let change = ChangeSet.create(d, {from: 2, to: 5, insert: Slice.of([Leaf.text("i")])})
        let mapped = Text.create({anchor: 3}).map(change, cx(d), 1) as Text
        // pos 3 was inside deleted range; assoc +1 → after insert
        expect(mapped.anchor).toBe(mapped.head)
        expect(mapped.from).toBe(change.mapPos(3, 1))
    })

    it("maps a forward range and preserves direction", () => {
        let d = doc(schema, paragraph, "hello")
        let change = ChangeSet.create(d, {from: 2, to: 2, insert: Slice.of([Leaf.text("X")])})
        let sel = Text.create({anchor: 1, head: 6})
        let mapped = sel.map(change, cx(change.apply(d))) as Text
        expect(mapped.anchor).toBeLessThan(mapped.head)
        expect(mapped.from).toBe(1)
        expect(mapped.to).toBe(7)
    })

    it("preserves reverse selection direction through a replace", () => {
        let d = doc(schema, paragraph, "hello")
        // insert at start of text
        let change = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])})
        let reverse = Text.create({anchor: 5, head: 2}) // head before anchor
        let mapped = reverse.map(change, cx(change.apply(d))) as Text
        expect(mapped.head).toBeLessThan(mapped.anchor)
        expect(mapped.from).toBe(change.mapPos(2, 1))
        expect(mapped.to).toBe(Math.max(mapped.from, change.mapPos(5, -1)))
    })

    it("keeps marks and headSide on map", () => {
        let {bold} = basicSchema()
        let d = doc(schema, paragraph, "ab")
        let change = ChangeSet.create(d, {from: 2, to: 2, insert: Slice.of([Leaf.text("x")])})
        let sel = Text.createInner(1, 1, -1, 12, [bold])
        let mapped = sel.map(change, cx(change.apply(d))) as Text
        expect(mapped.marks).toEqual([bold])
        expect(mapped.headSide).toBe(-1)
        expect(mapped.goalColumn).toBe(12)
    })
})

describe("Text.eq", () => {
    let {bold, schema, paragraph} = basicSchema()

    it("compares positions, side, and marks", () => {
        let a = Text.create({anchor: 1, head: 3, headSide: -1})
        let b = Text.create({anchor: 1, head: 3, headSide: -1})
        let c = Text.create({anchor: 1, head: 3, headSide: 1})
        expect(a.eq(b)).toBe(true)
        expect(a.eq(c)).toBe(false)
        expect(a.eq(EditorSelection.node(0, Leaf.text("x") as any))).toBe(false)

        let withMarks = Text.create({anchor: 1, head: 1, marks: [bold]})
        let without = Text.create({anchor: 1, head: 1})
        expect(withMarks.eq(without)).toBe(false)
        expect(withMarks.eq(Text.create({anchor: 1, head: 1, marks: [bold]}))).toBe(true)
    })

    it("round-trips JSON with optional head and side", () => {
        let d = doc(schema, paragraph, "hello")
        let state = EditorState.create({
            doc: d,
            selection: Text.create({anchor: 1, head: 4}),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let json = state.selection.toJSON(state)
        expect((json as any).type).toBe("text")
        expect((json as any).anchor).toBe(1)
        expect((json as any).head).toBe(4)

        let restored = EditorSelection.fromJSON({doc: d, config: state.config}, json)
        expect(restored.eq(state.selection)).toBe(true)
    })
})
